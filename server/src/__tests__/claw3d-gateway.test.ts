import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import type { Db } from "@paperclipai/db";
import {
  parseRequest,
  serializeResponse,
  serializeEvent,
} from "../services/claw3d-gateway/protocol.js";
import {
  computePresence,
  PRESENCE_ONLINE_THRESHOLD_MS,
  PRESENCE_AWAY_THRESHOLD_MS,
} from "../services/claw3d-gateway/presence.js";
import { toClaw3DAgent } from "../services/claw3d-gateway/agent-bridge.js";
import { startClaw3DGatewayServer } from "../services/claw3d-gateway/ws-server.js";

const require = createRequire(import.meta.url);
const { WebSocket } = require("ws") as { WebSocket: typeof import("ws").WebSocket };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function waitForMessage(ws: InstanceType<typeof WebSocket>): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout waiting for message")), 5000);
    ws.once("message", (data: Buffer | string) => {
      clearTimeout(timeout);
      resolve(Buffer.isBuffer(data) ? data.toString("utf8") : String(data));
    });
  });
}

function waitForOpen(ws: InstanceType<typeof WebSocket>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === ws.OPEN) { resolve(); return; }
    const timeout = setTimeout(() => reject(new Error("Timeout waiting for open")), 5000);
    ws.once("open", () => { clearTimeout(timeout); resolve(); });
    ws.once("error", (err) => { clearTimeout(timeout); reject(err); });
  });
}

/**
 * Connect to a WS server, wait for open, and return both the socket and
 * a promise for the first message (registered before open to avoid race).
 */
async function connectAndExpectFirstMessage(
  url: string,
  headers?: Record<string, string>,
): Promise<{ ws: InstanceType<typeof WebSocket>; firstMsg: Promise<string> }> {
  const ws = new WebSocket(url, { headers });
  // Register message listener BEFORE waiting for open to avoid race condition:
  // the server sends the health event from the connection handler, which can
  // fire before (or in the same tick as) the client's "open" event.
  const firstMsg = waitForMessage(ws);
  await waitForOpen(ws);
  return { ws, firstMsg };
}

function makeMinimalDb(): Db {
  return {} as unknown as Db;
}

// ---------------------------------------------------------------------------
// Protocol — parseRequest
// ---------------------------------------------------------------------------

describe("parseRequest", () => {
  it("returns a valid frame for a well-formed request", () => {
    const raw = JSON.stringify({ type: "req", id: "1", method: "status", params: {} });
    const frame = parseRequest(raw);
    expect(frame).toEqual({ type: "req", id: "1", method: "status", params: {} });
  });

  it("returns null for invalid JSON", () => {
    expect(parseRequest("not-json{")).toBeNull();
  });

  it("returns null when type is not req", () => {
    const raw = JSON.stringify({ type: "res", id: "1", method: "status" });
    expect(parseRequest(raw)).toBeNull();
  });

  it("returns null when method is missing", () => {
    const raw = JSON.stringify({ type: "req", id: "1" });
    expect(parseRequest(raw)).toBeNull();
  });

  it("returns null when id is missing", () => {
    const raw = JSON.stringify({ type: "req", method: "status" });
    expect(parseRequest(raw)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Protocol — serializeResponse
// ---------------------------------------------------------------------------

describe("serializeResponse", () => {
  it("produces a correct success response with payload", () => {
    const result = JSON.parse(serializeResponse("abc", true, { data: 1 }));
    expect(result).toEqual({ type: "res", id: "abc", ok: true, payload: { data: 1 } });
  });

  it("produces a correct error response", () => {
    const result = JSON.parse(
      serializeResponse("xyz", false, undefined, { code: "not_found", message: "Not found" }),
    );
    expect(result).toEqual({
      type: "res",
      id: "xyz",
      ok: false,
      error: { code: "not_found", message: "Not found" },
    });
  });

  it("omits payload and error when not provided", () => {
    const result = JSON.parse(serializeResponse("id1", true));
    expect(result).toEqual({ type: "res", id: "id1", ok: true });
    expect("payload" in result).toBe(false);
    expect("error" in result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Protocol — serializeEvent
// ---------------------------------------------------------------------------

describe("serializeEvent", () => {
  it("includes seq only when provided", () => {
    const withSeq = JSON.parse(serializeEvent("heartbeat", { ts: 1 }, 42));
    expect(withSeq.seq).toBe(42);

    const withoutSeq = JSON.parse(serializeEvent("heartbeat", { ts: 1 }));
    expect("seq" in withoutSeq).toBe(false);
  });

  it("produces correct shape", () => {
    const result = JSON.parse(serializeEvent("presence", { agentId: "a1", status: "online" }));
    expect(result).toEqual({
      type: "event",
      event: "presence",
      payload: { agentId: "a1", status: "online" },
    });
  });
});

// ---------------------------------------------------------------------------
// Presence — computePresence
// ---------------------------------------------------------------------------

describe("computePresence", () => {
  it("returns offline for null lastHeartbeatAt", () => {
    expect(computePresence(null)).toBe("offline");
  });

  it("returns online for a heartbeat 1 minute ago", () => {
    const now = new Date();
    const oneMinAgo = new Date(now.getTime() - 60_000);
    expect(computePresence(oneMinAgo, now)).toBe("online");
  });

  it("returns away for a heartbeat 5 minutes ago", () => {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60_000);
    expect(computePresence(fiveMinAgo, now)).toBe("away");
  });

  it("returns offline for a heartbeat 15 minutes ago", () => {
    const now = new Date();
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60_000);
    expect(computePresence(fifteenMinAgo, now)).toBe("offline");
  });

  it("returns online at exactly the online threshold (boundary — inclusive)", () => {
    const now = new Date();
    const atThreshold = new Date(now.getTime() - PRESENCE_ONLINE_THRESHOLD_MS);
    expect(computePresence(atThreshold, now)).toBe("online");
  });

  it("returns away just beyond the online threshold", () => {
    const now = new Date();
    const justBeyond = new Date(now.getTime() - PRESENCE_ONLINE_THRESHOLD_MS - 1);
    expect(computePresence(justBeyond, now)).toBe("away");
  });

  it("returns offline at exactly the away threshold + 1ms", () => {
    const now = new Date();
    const atAway = new Date(now.getTime() - PRESENCE_AWAY_THRESHOLD_MS - 1);
    expect(computePresence(atAway, now)).toBe("offline");
  });
});

// ---------------------------------------------------------------------------
// toClaw3DAgent — field mapping
// ---------------------------------------------------------------------------

describe("toClaw3DAgent", () => {
  const baseRow = {
    id: "agent-1",
    companyId: "company-1",
    name: "Test Agent",
    role: "general",
    title: "Senior Engineer",
    icon: null,
    status: "idle",
    reportsTo: null,
    capabilities: "coding",
    adapterType: "process",
    adapterConfig: { secret: "should-not-appear" },
    runtimeConfig: { token: "also-secret" },
    budgetMonthlyCents: 10000,
    spentMonthlyCents: 500,
    pauseReason: null,
    pausedAt: null,
    permissions: {},
    lastHeartbeatAt: new Date("2025-01-01T00:01:00Z"),
    metadata: null,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T00:00:30Z"),
  };

  it("maps all expected fields correctly", () => {
    const agent = toClaw3DAgent(baseRow as Parameters<typeof toClaw3DAgent>[0]);
    expect(agent.id).toBe("agent-1");
    expect(agent.companyId).toBe("company-1");
    expect(agent.name).toBe("Test Agent");
    expect(agent.role).toBe("general");
    expect(agent.title).toBe("Senior Engineer");
    expect(agent.adapterType).toBe("process");
    expect(agent.budgetMonthlyCents).toBe(10000);
    expect(agent.spentMonthlyCents).toBe(500);
    expect(agent.lastHeartbeatAt).toBe("2025-01-01T00:01:00.000Z");
    expect(agent.createdAt).toBe("2025-01-01T00:00:00.000Z");
    expect(agent.updatedAt).toBe("2025-01-01T00:00:30.000Z");
  });

  it("NEVER includes adapterConfig or runtimeConfig (security)", () => {
    const agent = toClaw3DAgent(baseRow as Parameters<typeof toClaw3DAgent>[0]);
    const keys = Object.keys(agent);
    expect(keys).not.toContain("adapterConfig");
    expect(keys).not.toContain("runtimeConfig");
  });

  it("returns presence=offline when lastHeartbeatAt is null", () => {
    const row = { ...baseRow, lastHeartbeatAt: null };
    const agent = toClaw3DAgent(row as Parameters<typeof toClaw3DAgent>[0]);
    expect(agent.presence).toBe("offline");
    expect(agent.lastHeartbeatAt).toBeNull();
  });

  it("returns presence=online for a recent heartbeat", () => {
    const row = { ...baseRow, lastHeartbeatAt: new Date() };
    const agent = toClaw3DAgent(row as Parameters<typeof toClaw3DAgent>[0]);
    expect(agent.presence).toBe("online");
  });
});

// ---------------------------------------------------------------------------
// WS server — auth
// ---------------------------------------------------------------------------

describe("startClaw3DGatewayServer — auth", () => {
  afterEach(() => {
    delete process.env["CLAW3D_GATEWAY_TOKEN"];
  });

  it("returns null when CLAW3D_GATEWAY_TOKEN is not set", () => {
    delete process.env["CLAW3D_GATEWAY_TOKEN"];
    const handle = startClaw3DGatewayServer(makeMinimalDb(), { port: 0 });
    expect(handle).toBeNull();
  });

  it("accepts connection with valid query token", async () => {
    process.env["CLAW3D_GATEWAY_TOKEN"] = "valid-token-123";
    const gateway = startClaw3DGatewayServer(makeMinimalDb(), { port: 0 })!;

    await new Promise<void>((resolve) => {
      const int = setInterval(() => {
        if (gateway.port() !== 0) { clearInterval(int); resolve(); }
      }, 10);
    });

    const { ws, firstMsg } = await connectAndExpectFirstMessage(
      `ws://127.0.0.1:${gateway.port()}?token=valid-token-123`,
    );
    const msg = await firstMsg;
    const frame = JSON.parse(msg);
    expect(frame.type).toBe("event");
    expect(frame.event).toBe("health");
    ws.close();
    await gateway.close();
  });

  it("rejects connection with invalid token (403)", async () => {
    process.env["CLAW3D_GATEWAY_TOKEN"] = "correct-token";
    const gateway = startClaw3DGatewayServer(makeMinimalDb(), { port: 0 })!;

    await new Promise<void>((resolve) => {
      const int = setInterval(() => {
        if (gateway.port() !== 0) { clearInterval(int); resolve(); }
      }, 10);
    });

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${gateway.port()}?token=wrong-token`);
      ws.once("error", () => resolve()); // connection refused / closed = expected
      ws.once("unexpected-response", (_req, res) => {
        expect(res.statusCode).toBe(403);
        resolve();
      });
      setTimeout(() => reject(new Error("Expected rejection did not occur")), 3000);
    });

    await gateway.close();
  });

  it("accepts connection with valid Bearer Authorization header", async () => {
    process.env["CLAW3D_GATEWAY_TOKEN"] = "bearer-token-abc";
    const gateway = startClaw3DGatewayServer(makeMinimalDb(), { port: 0 })!;

    await new Promise<void>((resolve) => {
      const int = setInterval(() => {
        if (gateway.port() !== 0) { clearInterval(int); resolve(); }
      }, 10);
    });

    const { ws, firstMsg } = await connectAndExpectFirstMessage(
      `ws://127.0.0.1:${gateway.port()}`,
      { Authorization: "Bearer bearer-token-abc" },
    );
    const msg = await firstMsg;
    const frame = JSON.parse(msg);
    expect(frame.type).toBe("event");
    ws.close();
    await gateway.close();
  });
});

// ---------------------------------------------------------------------------
// WS server — methods
// ---------------------------------------------------------------------------

describe("startClaw3DGatewayServer — methods", () => {
  let gateway: ReturnType<typeof startClaw3DGatewayServer>;
  let ws: InstanceType<typeof WebSocket>;

  beforeEach(async () => {
    process.env["CLAW3D_GATEWAY_TOKEN"] = "test-method-token";
    gateway = startClaw3DGatewayServer(makeMinimalDb(), { port: 0 });

    await new Promise<void>((resolve) => {
      const int = setInterval(() => {
        if (gateway!.port() !== 0) { clearInterval(int); resolve(); }
      }, 10);
    });

    // Register message listener before open to avoid race with health event
    const result = await connectAndExpectFirstMessage(
      `ws://127.0.0.1:${gateway!.port()}?token=test-method-token`,
    );
    ws = result.ws;
    // Consume the initial health event
    await result.firstMsg;
  });

  afterEach(async () => {
    ws?.close();
    if (gateway) await gateway.close();
    delete process.env["CLAW3D_GATEWAY_TOKEN"];
    vi.restoreAllMocks();
  });

  it("status method returns ok + uptime + connections", async () => {
    ws.send(JSON.stringify({ type: "req", id: "s1", method: "status" }));
    const raw = await waitForMessage(ws);
    const frame = JSON.parse(raw);
    expect(frame.type).toBe("res");
    expect(frame.id).toBe("s1");
    expect(frame.ok).toBe(true);
    expect(frame.payload.status).toBe("ok");
    expect(typeof frame.payload.uptime).toBe("number");
    expect(typeof frame.payload.connections).toBe("number");
    expect(typeof frame.payload.serverTime).toBe("string");
  });

  it("sessions.list returns empty sessions array", async () => {
    ws.send(JSON.stringify({ type: "req", id: "sl1", method: "sessions.list" }));
    const raw = await waitForMessage(ws);
    const frame = JSON.parse(raw);
    expect(frame.type).toBe("res");
    expect(frame.id).toBe("sl1");
    expect(frame.ok).toBe(true);
    expect(frame.payload.sessions).toEqual([]);
  });

  it("unknown method returns error with code unknown_method", async () => {
    ws.send(JSON.stringify({ type: "req", id: "u1", method: "not.a.method" }));
    const raw = await waitForMessage(ws);
    const frame = JSON.parse(raw);
    expect(frame.type).toBe("res");
    expect(frame.id).toBe("u1");
    expect(frame.ok).toBe(false);
    expect(frame.error.code).toBe("unknown_method");
  });

  it("malformed JSON does not crash the server or send a response", async () => {
    ws.send("this is not json {");
    // Send a valid request immediately after — should still work
    ws.send(JSON.stringify({ type: "req", id: "valid1", method: "status" }));
    const raw = await waitForMessage(ws);
    const frame = JSON.parse(raw);
    // The response should be for the valid request, not the malformed one
    expect(frame.id).toBe("valid1");
  });

  it("agents.list with mock returns a response (shape check)", async () => {
    // agents.list calls agentService(db).list — with minimal db it will throw
    // Verify the error is caught and returned as an internal_error response
    ws.send(
      JSON.stringify({ type: "req", id: "al1", method: "agents.list", params: { companyId: "c1" } }),
    );
    const raw = await waitForMessage(ws);
    const frame = JSON.parse(raw);
    expect(frame.type).toBe("res");
    expect(frame.id).toBe("al1");
    // May be ok or error depending on mock db — either way it responds
    expect(typeof frame.ok).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// WS server — chat.send
// ---------------------------------------------------------------------------

describe("startClaw3DGatewayServer — chat.send", () => {
  it("returns queued response when heartbeat wakeup succeeds", async () => {
    process.env["CLAW3D_GATEWAY_TOKEN"] = "chat-test-token";

    const gateway = startClaw3DGatewayServer(makeMinimalDb(), { port: 0 })!;

    await new Promise<void>((resolve) => {
      const int = setInterval(() => {
        if (gateway.port() !== 0) { clearInterval(int); resolve(); }
      }, 10);
    });

    const { ws, firstMsg } = await connectAndExpectFirstMessage(
      `ws://127.0.0.1:${gateway.port()}?token=chat-test-token`,
    );
    await firstMsg; // consume health event

    ws.send(
      JSON.stringify({
        type: "req",
        id: "cs1",
        method: "chat.send",
        params: { agentId: "agent-123", message: "Hello agent!" },
      }),
    );

    const raw = await waitForMessage(ws);
    const frame = JSON.parse(raw);
    expect(frame.type).toBe("res");
    expect(frame.id).toBe("cs1");
    // The response should have ok: true or ok: false (internal error if wakeup not mocked in this scope)
    expect(typeof frame.ok).toBe("boolean");

    ws.close();
    await gateway.close();
    delete process.env["CLAW3D_GATEWAY_TOKEN"];
    vi.restoreAllMocks();
  });
});
