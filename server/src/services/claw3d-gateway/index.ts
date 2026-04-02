export { startClaw3DGatewayServer } from "./ws-server.js";
export type {
  Claw3DAgent,
  Claw3DRequest,
  Claw3DResponse,
  Claw3DEvent,
  PresenceStatus,
} from "./protocol.js";
export { computePresence } from "./presence.js";

import type { Db } from "@paperclipai/db";
import { startClaw3DGatewayServer } from "./ws-server.js";

/**
 * Convenience wrapper — start the Claw3D gateway server on the default port.
 * Called from server/src/index.ts after the main server is ready.
 */
export function startClaw3DGateway(db: Db) {
  return startClaw3DGatewayServer(db);
}
