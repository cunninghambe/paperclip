import type { Db } from "@paperclipai/db";
import { heartbeatService } from "../heartbeat.js";
import type { ChatSendParams } from "./protocol.js";

/**
 * Bridge for routing Claw3D chat.send requests to Paperclip's
 * heartbeat wakeup system.
 */
export function createChatBridge(db: Db) {
  // Instantiate once — heartbeatService(db) creates internal caches and state
  const heartbeat = heartbeatService(db);

  /**
   * Route a chat message to an agent by triggering a heartbeat wakeup.
   * The agent will be woken with the message in its context snapshot.
   * Returns { queued: true, runId } on success, { queued: false } when
   * the wakeup was skipped or deferred (e.g. agent already running).
   */
  async function sendMessage(
    params: ChatSendParams,
  ): Promise<{ queued: boolean; runId?: string }> {
    // enqueueWakeup returns null when deferred/skipped, or the heartbeatRun row
    const run = await heartbeat.wakeup(params.agentId, {
      source: params.source ?? "on_demand",
      triggerDetail: "system",
      reason: "claw3d_chat_message",
      contextSnapshot: { message: params.message },
      requestedByActorType: "system",
      requestedByActorId: "claw3d_gateway",
    });

    if (!run) {
      return { queued: false };
    }

    return { queued: true, runId: run.id };
  }

  return { sendMessage };
}
