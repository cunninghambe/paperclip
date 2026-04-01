import type { CreateConfigValues } from "@paperclipai/adapter-utils";

/**
 * Build an adapterConfig object from the create-agent form values.
 * Called by the Paperclip UI when creating a new hermes_gateway agent.
 *
 * CreateConfigValues covers well-known shared fields. Hermes Gateway uses
 * custom adapterConfig fields (inboxDir, outboxDir, pidFile) which are passed
 * as loose unknowns from the form via set(). We accept the base type and read
 * custom fields via index access.
 */
export function buildHermesGatewayConfig(v: CreateConfigValues): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = v as any;
  const ac: Record<string, unknown> = {};

  const inboxDir = typeof raw.inboxDir === "string" ? raw.inboxDir.trim() : null;
  const outboxDir = typeof raw.outboxDir === "string" ? raw.outboxDir.trim() : null;
  const pidFile = typeof raw.pidFile === "string" ? raw.pidFile.trim() : null;

  if (inboxDir) ac.inboxDir = inboxDir;
  if (outboxDir) ac.outboxDir = outboxDir;
  if (pidFile) ac.pidFile = pidFile;

  ac.timeoutSec = 120;
  ac.pollIntervalMs = 500;

  return ac;
}
