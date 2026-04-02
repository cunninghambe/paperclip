import type { PresenceStatus } from "./protocol.js";

/**
 * Agent is "online" if its last heartbeat was within 2 minutes.
 */
export const PRESENCE_ONLINE_THRESHOLD_MS = 2 * 60 * 1000;

/**
 * Agent is "away" if its last heartbeat was between 2 and 10 minutes ago.
 */
export const PRESENCE_AWAY_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * Derive a Claw3D presence status from the agent's last heartbeat timestamp.
 *
 * @param lastHeartbeatAt - The DB timestamp (null means no heartbeat recorded)
 * @param now             - Optional reference time for testing (defaults to Date.now())
 */
export function computePresence(
  lastHeartbeatAt: Date | null,
  now?: Date,
): PresenceStatus {
  if (!lastHeartbeatAt) return "offline";

  const reference = now ?? new Date();
  const elapsedMs = reference.getTime() - lastHeartbeatAt.getTime();

  if (elapsedMs <= PRESENCE_ONLINE_THRESHOLD_MS) return "online";
  if (elapsedMs <= PRESENCE_AWAY_THRESHOLD_MS) return "away";
  return "offline";
}
