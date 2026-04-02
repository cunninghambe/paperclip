import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { Db } from "@paperclipai/db";
import { logger } from "../../middleware/logger.js";
import {
  subscribeGlobalLiveEvents,
} from "../live-events.js";
import { createAgentBridge } from "./agent-bridge.js";
import { createChatBridge } from "./chat-bridge.js";
import { computePresence } from "./presence.js";
import {
  parseRequest,
  serializeResponse,
  serializeEvent,
} from "./protocol.js";
import type {
  AgentsCreateParams,
  AgentsDeleteParams,
  AgentsListParams,
  AgentsUpdateParams,
  ChatSendParams,
} from "./protocol.js";

// ---------------------------------------------------------------------------
// WebSocket type shims (ESM-safe import via createRequire, same as live-events-ws.ts)
// ---------------------------------------------------------------------------

interface WsSocket {
  readyState: number;
  ping(): void;
  send(data: string): void;
  terminate(): void;
  close(code?: number, reason?: string): void;
  on(event: "pong", listener: () => void): void;
  on(event: "close", listener: () => void): void;
  on(event: "error", listener: (err: Error) => void): void;
  on(event: "message", listener: (data: Buffer | string) => void): void;
}

interface WsServer {
  clients: Set<WsSocket>;
  on(event: "connection", listener: (socket: WsSocket, req: IncomingMessage) => void): void;
  on(event: "close", listener: () => void): void;
  handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    callback: (ws: WsSocket) => void,
  ): void;
  emit(event: "connection", ws: WsSocket, req: IncomingMessage): boolean;
  close(cb?: (err?: Error) => void): void;
}

const require = createRequire(import.meta.url);
const { WebSocket, WebSocketServer } = require("ws") as {
  WebSocket: { OPEN: number };
  WebSocketServer: new (opts: { noServer: boolean }) => WsServer;
};

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

const CLAW3D_GATEWAY_PORT_DEFAULT = 18800;

function parseBearerToken(rawAuth: string | string[] | undefined): string | null {
  const auth = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
  if (!auth) return null;
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice("bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function extractToken(req: IncomingMessage): string | null {
  const bearerToken = parseBearerToken(req.headers["authorization"]);
  if (bearerToken) return bearerToken;

  // Fall back to query param
  if (!req.url) return null;
  try {
    const url = new URL(req.url, "http://localhost");
    const queryToken = url.searchParams.get("token")?.trim() ?? "";
    return queryToken.length > 0 ? queryToken : null;
  } catch {
    return null;
  }
}

function validateToken(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  try {
    const providedBuf = Buffer.from(provided, "utf8");
    const expectedBuf = Buffer.from(expected, "utf8");
    // Length must match before timingSafeEqual (different lengths → timing leak)
    if (providedBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(providedBuf, expectedBuf);
  } catch {
    return false;
  }
}

function rejectUpgrade(socket: Duplex, statusLine: string, message: string): void {
  const safe = message.replace(/[\r\n]+/g, " ").trim();
  socket.write(
    `HTTP/1.1 ${statusLine}\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\n${safe}`,
  );
  socket.destroy();
}

// ---------------------------------------------------------------------------
// Per-connection state
// ---------------------------------------------------------------------------

interface ConnectionState {
  seqCounter: number;
  unsubGlobal: () => void;
}

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

export interface Claw3DGatewayHandle {
  close(): Promise<void>;
  port(): number;
}

/**
 * Start the Claw3D gateway WebSocket server.
 *
 * Returns null (and logs a warning) when CLAW3D_GATEWAY_TOKEN is not set.
 * This allows the platform to start without Claw3D configured.
 *
 * @param db   Paperclip database handle
 * @param opts Optional port override (default 18800; use 0 for OS-assigned port)
 */
export function startClaw3DGatewayServer(
  db: Db,
  opts?: { port?: number },
): Claw3DGatewayHandle | null {
  const gatewayToken = process.env["CLAW3D_GATEWAY_TOKEN"]?.trim();
  if (!gatewayToken) {
    logger.warn("CLAW3D_GATEWAY_TOKEN not set — Claw3D gateway server will not start");
    return null;
  }

  const port = opts?.port ?? CLAW3D_GATEWAY_PORT_DEFAULT;

  // Dedicated HTTP server (separate from the main Paperclip server)
  const httpServer = createServer();

  const wss = new WebSocketServer({ noServer: true });
  const connState = new Map<WsSocket, ConnectionState>();
  const aliveByClient = new Map<WsSocket, boolean>();

  // Service bridges (created once, shared across connections)
  const agentBridge = createAgentBridge(db);
  const chatBridge = createChatBridge(db);

  // Track server start time for status uptime reporting
  const startTimeMs = Date.now();

  // ---------------------------------------------------------------------------
  // Per-connection message handler
  // ---------------------------------------------------------------------------

  async function handleRequest(socket: WsSocket, raw: string): Promise<void> {
    const frame = parseRequest(raw);
    if (!frame) {
      // Malformed JSON — silently ignore (no response)
      return;
    }

    const state = connState.get(socket);
    const seq = state ? ++state.seqCounter : 0;

    const params = frame.params;

    switch (frame.method as string) {
      case "agents.list": {
        const p = (params ?? {}) as AgentsListParams;
        const agentsList = await agentBridge.listAgents(p.companyId ?? "", {
          includeTerminated: p.includeTerminated,
        });
        socket.send(serializeResponse(frame.id, true, agentsList));
        break;
      }

      case "agents.create": {
        const p = params as AgentsCreateParams;
        const created = await agentBridge.createAgent(p);
        socket.send(serializeResponse(frame.id, true, created));
        break;
      }

      case "agents.update": {
        const p = params as AgentsUpdateParams;
        const updated = await agentBridge.updateAgent(p);
        socket.send(serializeResponse(frame.id, true, updated));
        break;
      }

      case "agents.delete": {
        const p = (params ?? {}) as AgentsDeleteParams;
        const deleted = await agentBridge.deleteAgent(p.agentId);
        socket.send(serializeResponse(frame.id, true, deleted));
        break;
      }

      case "chat.send": {
        const p = params as ChatSendParams;
        const result = await chatBridge.sendMessage(p);
        socket.send(serializeResponse(frame.id, true, result));
        break;
      }

      case "sessions.list": {
        socket.send(serializeResponse(frame.id, true, { sessions: [] }));
        break;
      }

      case "status": {
        socket.send(
          serializeResponse(frame.id, true, {
            status: "ok",
            uptime: process.uptime(),
            connections: wss.clients.size,
            serverTime: new Date().toISOString(),
            uptimeMs: Date.now() - startTimeMs,
          }),
        );
        break;
      }

      default: {
        socket.send(
          serializeResponse(frame.id, false, undefined, {
            code: "unknown_method",
            message: `Method not found: ${frame.method}`,
          }),
        );
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // WebSocket connection handler
  // ---------------------------------------------------------------------------

  wss.on("connection", (socket: WsSocket) => {
    aliveByClient.set(socket, true);

    // Subscribe to all live events (company-scoped events on "*" channel)
    const unsubGlobal = subscribeGlobalLiveEvents((event) => {
      if (socket.readyState !== WebSocket.OPEN) return;

      // Forward agent lifecycle events
      if (event.type.startsWith("agent.")) {
        socket.send(
          serializeEvent("agent", {
            eventType: event.type,
            companyId: event.companyId,
            ...(event.payload as Record<string, unknown>),
          }),
        );
      }

      // Emit a presence event whenever an agent's status changes
      if (event.type === "agent.status") {
        const payload = event.payload as Record<string, unknown>;
        const rawHeartbeat = payload["lastHeartbeatAt"];
        const lastHeartbeatAt =
          rawHeartbeat && typeof rawHeartbeat === "string"
            ? new Date(rawHeartbeat)
            : null;
        socket.send(
          serializeEvent("presence", {
            agentId: payload["agentId"],
            status: computePresence(lastHeartbeatAt),
            serverTime: new Date().toISOString(),
          }),
        );
      }
    });

    connState.set(socket, { seqCounter: 0, unsubGlobal });

    // Send initial health event so the client knows the connection is live
    socket.send(
      serializeEvent("health", {
        status: "ok",
        connections: wss.clients.size,
        serverTime: new Date().toISOString(),
      }),
    );

    socket.on("pong", () => {
      aliveByClient.set(socket, true);
    });

    socket.on("message", (data: Buffer | string) => {
      const raw = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
      void handleRequest(socket, raw).catch((err: unknown) => {
        // Parse request again to get the id for the error response
        const frame = parseRequest(raw);
        if (frame && socket.readyState === WebSocket.OPEN) {
          socket.send(
            serializeResponse(frame.id, false, undefined, {
              code: "internal_error",
              message: err instanceof Error ? err.message : "Internal server error",
            }),
          );
        }
        logger.error({ err }, "claw3d-gateway: error handling request");
      });
    });

    socket.on("close", () => {
      const state = connState.get(socket);
      if (state) state.unsubGlobal();
      connState.delete(socket);
      aliveByClient.delete(socket);
    });

    socket.on("error", (err: Error) => {
      logger.warn({ err }, "claw3d-gateway: client socket error");
    });
  });

  // ---------------------------------------------------------------------------
  // Ping/pong — detect dead connections (same pattern as live-events-ws.ts)
  // ---------------------------------------------------------------------------

  const pingInterval = setInterval(() => {
    for (const socket of wss.clients) {
      if (!aliveByClient.get(socket)) {
        socket.terminate();
        continue;
      }
      aliveByClient.set(socket, false);
      socket.ping();
    }
  }, 30_000);

  // ---------------------------------------------------------------------------
  // Periodic heartbeat broadcast
  // ---------------------------------------------------------------------------

  const heartbeatInterval = setInterval(() => {
    const payload = serializeEvent("heartbeat", {
      serverTime: new Date().toISOString(),
    });
    for (const socket of wss.clients) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }, 30_000);

  wss.on("close", () => {
    clearInterval(pingInterval);
    clearInterval(heartbeatInterval);
  });

  // ---------------------------------------------------------------------------
  // HTTP upgrade handler (auth gate)
  // ---------------------------------------------------------------------------

  httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const token = extractToken(req);
    if (!validateToken(token, gatewayToken)) {
      rejectUpgrade(socket, "403 Forbidden", "Invalid or missing gateway token");
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws: WsSocket) => {
      wss.emit("connection", ws, req);
    });
  });

  // ---------------------------------------------------------------------------
  // Start listening
  // ---------------------------------------------------------------------------

  let resolvedPort = port;

  httpServer.listen(port, () => {
    const address = httpServer.address();
    if (address && typeof address === "object") {
      resolvedPort = address.port;
    }
    logger.info(
      { port: resolvedPort },
      `Claw3D gateway server listening on port ${resolvedPort}`,
    );
  });

  // ---------------------------------------------------------------------------
  // Handle
  // ---------------------------------------------------------------------------

  return {
    close(): Promise<void> {
      return new Promise((resolve) => {
        clearInterval(pingInterval);
        clearInterval(heartbeatInterval);
        wss.close(() => {
          httpServer.close(() => resolve());
        });
      });
    },
    port(): number {
      return resolvedPort;
    },
  };
}
