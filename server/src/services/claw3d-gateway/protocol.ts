/**
 * Claw3D Gateway Protocol — message types and serialization helpers.
 * Pure types + JSON functions. Zero runtime dependencies beyond Node.js built-ins.
 */

// ---------------------------------------------------------------------------
// Core frame types
// ---------------------------------------------------------------------------

export interface Claw3DRequest {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
}

export interface Claw3DResponse {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string };
}

export interface Claw3DEvent {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
}

// ---------------------------------------------------------------------------
// Method names
// ---------------------------------------------------------------------------

export type Claw3DMethodName =
  | "agents.list"
  | "agents.create"
  | "agents.update"
  | "agents.delete"
  | "chat.send"
  | "sessions.list"
  | "status";

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

export type PresenceStatus = "online" | "away" | "offline";

// ---------------------------------------------------------------------------
// Agent model (safe projection — NO adapterConfig / runtimeConfig)
// ---------------------------------------------------------------------------

export interface Claw3DAgent {
  id: string;
  companyId: string;
  name: string;
  role: string;
  title: string | null;
  icon: string | null;
  status: string;
  reportsTo: string | null;
  capabilities: string | null;
  adapterType: string;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  lastHeartbeatAt: string | null;
  presence: PresenceStatus;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Method param types
// ---------------------------------------------------------------------------

export interface AgentsListParams {
  companyId?: string;
  includeTerminated?: boolean;
}

export interface AgentsCreateParams {
  companyId: string;
  name: string;
  role?: string;
  title?: string | null;
  icon?: string | null;
  reportsTo?: string | null;
  capabilities?: string | null;
  adapterType?: string;
  adapterConfig?: Record<string, unknown>;
  runtimeConfig?: Record<string, unknown>;
  budgetMonthlyCents?: number;
  metadata?: Record<string, unknown> | null;
}

export interface AgentsUpdateParams {
  agentId: string;
  patch: {
    name?: string;
    role?: string;
    title?: string | null;
    icon?: string | null;
    reportsTo?: string | null;
    capabilities?: string | null;
    adapterType?: string;
    adapterConfig?: Record<string, unknown>;
    runtimeConfig?: Record<string, unknown>;
    budgetMonthlyCents?: number;
    metadata?: Record<string, unknown> | null;
  };
}

export interface AgentsDeleteParams {
  agentId: string;
}

export interface ChatSendParams {
  agentId: string;
  message: string;
  source?: "on_demand" | "automation";
}

export interface SessionsListParams {
  agentId?: string;
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/**
 * Parse a raw WebSocket message into a Claw3DRequest.
 * Returns null if the message is malformed — never throws.
 */
export function parseRequest(raw: string): Claw3DRequest | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    const obj = parsed as Record<string, unknown>;
    if (
      obj["type"] !== "req" ||
      typeof obj["id"] !== "string" ||
      typeof obj["method"] !== "string"
    ) {
      return null;
    }
    return {
      type: "req",
      id: obj["id"],
      method: obj["method"],
      params: obj["params"],
    };
  } catch {
    return null;
  }
}

/**
 * Serialize a response frame to JSON string.
 */
export function serializeResponse(
  id: string,
  ok: boolean,
  payload?: unknown,
  error?: { code: string; message: string },
): string {
  const frame: Record<string, unknown> = { type: "res", id, ok };
  if (payload !== undefined) frame["payload"] = payload;
  if (error !== undefined) frame["error"] = error;
  return JSON.stringify(frame);
}

/**
 * Serialize an event frame to JSON string.
 * seq is only included when defined.
 */
export function serializeEvent(
  event: string,
  payload?: unknown,
  seq?: number,
): string {
  const frame: Record<string, unknown> = { type: "event", event };
  if (payload !== undefined) frame["payload"] = payload;
  if (seq !== undefined) frame["seq"] = seq;
  return JSON.stringify(frame);
}
