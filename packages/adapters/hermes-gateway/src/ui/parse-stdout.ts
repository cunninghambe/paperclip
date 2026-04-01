import type { TranscriptEntry } from "@paperclipai/adapter-utils";

/**
 * Parse a stdout line from the hermes-gateway adapter into transcript entries.
 *
 * The hermes-gateway adapter emits lines prefixed with [hermes-gateway]
 * for system messages and [hermes-gateway:response] for agent output.
 */
export function parseHermesGatewayStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[hermes-gateway:response]")) {
    const text = trimmed.replace(/^\[hermes-gateway:response\]\s*/, "");
    return text ? [{ kind: "assistant", ts, text }] : [];
  }

  if (trimmed.startsWith("[hermes-gateway]")) {
    const text = trimmed.replace(/^\[hermes-gateway\]\s*/, "");
    return text ? [{ kind: "system", ts, text }] : [];
  }

  if (trimmed.startsWith("[hermes-gateway:error]")) {
    const text = trimmed.replace(/^\[hermes-gateway:error\]\s*/, "");
    return text ? [{ kind: "stderr", ts, text }] : [];
  }

  return [{ kind: "stdout", ts, text: line }];
}
