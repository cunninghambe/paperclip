import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import { asNumber, asString, buildPaperclipEnv, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { promises as fs, constants as fsConstants } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import {
  ADAPTER_TYPE,
  DEFAULT_INBOX_DIR,
  DEFAULT_OUTBOX_DIR,
  DEFAULT_PID_FILE,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_TIMEOUT_SEC,
  SAFE_RUN_ID_RE,
} from "../shared/constants.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function expandHome(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  if (p === "~") return os.homedir();
  return p;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asPositiveInteger(value: unknown, fallback: number): number {
  const n = asNumber(value, fallback);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Validate that a run ID is safe to use in a file path.
 * Rejects empty strings, path separators, dots, and any character not
 * in [a-zA-Z0-9_-].
 */
function validateRunId(runId: string): string | null {
  if (!SAFE_RUN_ID_RE.test(runId)) {
    return `Invalid runId for file path construction: "${runId}". Must match [a-zA-Z0-9_-]{1,128}.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Wake payload builder (mirrors openclaw-gateway pattern)
// ---------------------------------------------------------------------------

type WakePayload = {
  runId: string;
  agentId: string;
  companyId: string;
  taskId: string | null;
  issueId: string | null;
  wakeReason: string | null;
  wakeCommentId: string | null;
  approvalId: string | null;
  approvalStatus: string | null;
  issueIds: string[];
};

function buildWakePayload(ctx: AdapterExecutionContext): WakePayload {
  const { runId, agent, context } = ctx;
  return {
    runId,
    agentId: agent.id,
    companyId: agent.companyId,
    taskId: nonEmpty(context.taskId) ?? nonEmpty(context.issueId),
    issueId: nonEmpty(context.issueId),
    wakeReason: nonEmpty(context.wakeReason),
    wakeCommentId: nonEmpty(context.wakeCommentId) ?? nonEmpty(context.commentId),
    approvalId: nonEmpty(context.approvalId),
    approvalStatus: nonEmpty(context.approvalStatus),
    issueIds: Array.isArray(context.issueIds)
      ? context.issueIds.filter(
          (v): v is string => typeof v === "string" && v.trim().length > 0,
        )
      : [],
  };
}

function buildPaperclipEnvForWake(
  ctx: AdapterExecutionContext,
  wakePayload: WakePayload,
  paperclipApiUrlOverride: string | null,
): Record<string, string> {
  const env: Record<string, string> = {
    ...buildPaperclipEnv(ctx.agent),
    PAPERCLIP_RUN_ID: ctx.runId,
  };
  if (paperclipApiUrlOverride) env.PAPERCLIP_API_URL = paperclipApiUrlOverride;
  if (wakePayload.taskId) env.PAPERCLIP_TASK_ID = wakePayload.taskId;
  if (wakePayload.wakeReason) env.PAPERCLIP_WAKE_REASON = wakePayload.wakeReason;
  if (wakePayload.wakeCommentId) env.PAPERCLIP_WAKE_COMMENT_ID = wakePayload.wakeCommentId;
  if (wakePayload.approvalId) env.PAPERCLIP_APPROVAL_ID = wakePayload.approvalId;
  if (wakePayload.approvalStatus) env.PAPERCLIP_APPROVAL_STATUS = wakePayload.approvalStatus;
  if (wakePayload.issueIds.length > 0) {
    env.PAPERCLIP_LINKED_ISSUE_IDS = wakePayload.issueIds.join(",");
  }
  return env;
}

function buildWakeText(payload: WakePayload, paperclipEnv: Record<string, string>): string {
  const claimedApiKeyPath = "~/.hermes/paperclip-claimed-api-key.json";
  const orderedKeys = [
    "PAPERCLIP_RUN_ID",
    "PAPERCLIP_AGENT_ID",
    "PAPERCLIP_COMPANY_ID",
    "PAPERCLIP_API_URL",
    "PAPERCLIP_TASK_ID",
    "PAPERCLIP_WAKE_REASON",
    "PAPERCLIP_WAKE_COMMENT_ID",
    "PAPERCLIP_APPROVAL_ID",
    "PAPERCLIP_APPROVAL_STATUS",
    "PAPERCLIP_LINKED_ISSUE_IDS",
  ];

  const envLines: string[] = [];
  for (const key of orderedKeys) {
    const value = paperclipEnv[key];
    if (!value) continue;
    envLines.push(`${key}=${value}`);
  }

  const issueIdHint = payload.taskId ?? payload.issueId ?? "";
  const apiBaseHint = paperclipEnv.PAPERCLIP_API_URL ?? "<set PAPERCLIP_API_URL>";

  const lines = [
    "Paperclip wake event for a Hermes Gateway adapter.",
    "",
    "Run this procedure now. Do not guess undocumented endpoints.",
    "",
    "Set these values in your run context:",
    ...envLines,
    `PAPERCLIP_API_KEY=<token from ${claimedApiKeyPath}>`,
    "",
    `Load PAPERCLIP_API_KEY from ${claimedApiKeyPath} (the token you saved after claim-api-key).`,
    "",
    `api_base=${apiBaseHint}`,
    `task_id=${payload.taskId ?? ""}`,
    `issue_id=${payload.issueId ?? ""}`,
    `wake_reason=${payload.wakeReason ?? ""}`,
    `wake_comment_id=${payload.wakeCommentId ?? ""}`,
    `approval_id=${payload.approvalId ?? ""}`,
    `approval_status=${payload.approvalStatus ?? ""}`,
    `linked_issue_ids=${payload.issueIds.join(",")}`,
    "",
    "HTTP rules:",
    "- Use Authorization: Bearer $PAPERCLIP_API_KEY on every API call.",
    "- Use X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID on every mutating API call.",
    "- Use only /api endpoints listed below.",
    "- Do NOT call guessed endpoints.",
    "",
    "Workflow:",
    "1) GET /api/agents/me",
    `2) Determine issueId: PAPERCLIP_TASK_ID if present, otherwise issue_id (${issueIdHint}).`,
    "3) If issueId exists:",
    "   - POST /api/issues/{issueId}/checkout with {\"agentId\":\"$PAPERCLIP_AGENT_ID\",\"expectedStatuses\":[\"todo\",\"backlog\",\"blocked\"]}",
    "   - GET /api/issues/{issueId}",
    "   - GET /api/issues/{issueId}/comments",
    "   - Execute the issue instructions exactly.",
    "   - If instructions require a comment, POST /api/issues/{issueId}/comments with {\"body\":\"...\"}.",
    "   - PATCH /api/issues/{issueId} with {\"status\":\"done\",\"comment\":\"what changed and why\"}.",
    "4) If issueId does not exist:",
    "   - GET /api/companies/$PAPERCLIP_COMPANY_ID/issues?assigneeAgentId=$PAPERCLIP_AGENT_ID&status=todo,in_progress,blocked",
    "   - Pick in_progress first, then todo, then blocked, then execute step 3.",
    "",
    "After completing your work, write your response to the outbox.",
    "The platform polls the outbox for your {runId}.json response file.",
    "",
    "Complete the workflow in this run.",
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// PID-based liveness check
// ---------------------------------------------------------------------------

async function readPidFile(pidFilePath: string): Promise<number | null> {
  try {
    const raw = await fs.readFile(pidFilePath, "utf8");
    const pid = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Inbox file write (atomic: write to .tmp then rename)
// ---------------------------------------------------------------------------

type InboxMessage = {
  runId: string;
  agentId: string;
  companyId: string;
  message: string;
  env: Record<string, string>;
  paperclip: WakePayload;
  externalDirs?: string[];
  timestamp: string;
};

async function writeInboxMessage(
  inboxDir: string,
  runId: string,
  msg: InboxMessage,
): Promise<void> {
  const target = path.join(inboxDir, `${runId}.json`);
  const tmp = path.join(inboxDir, `.${runId}.${randomUUID().slice(0, 8)}.tmp`);
  const payload = JSON.stringify(msg, null, 2);
  await fs.writeFile(tmp, payload, { encoding: "utf8", flag: "wx" });
  await fs.rename(tmp, target);
}

// ---------------------------------------------------------------------------
// Outbox response poll
// ---------------------------------------------------------------------------

type OutboxResponse = {
  exitCode?: number;
  summary?: string;
  error?: string;
  errorCode?: string;
  model?: string;
  provider?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
  };
};

function parseOutboxResponse(raw: string): OutboxResponse | null {
  try {
    const parsed = JSON.parse(raw);
    return asRecord(parsed) ? (parsed as OutboxResponse) : null;
  } catch {
    return null;
  }
}

async function pollOutbox(
  outboxDir: string,
  runId: string,
  pollIntervalMs: number,
  timeoutMs: number,
  onLog: AdapterExecutionContext["onLog"],
): Promise<OutboxResponse | "timeout"> {
  const responsePath = path.join(outboxDir, `${runId}.json`);
  const deadline = Date.now() + timeoutMs;
  let logged = false;

  while (Date.now() < deadline) {
    try {
      // Use lstat to avoid following symlinks
      const stat = await fs.lstat(responsePath);
      if (stat.isFile()) {
        const raw = await fs.readFile(responsePath, "utf8");
        const response = parseOutboxResponse(raw);
        if (response) {
          // Clean up the response file
          await fs.unlink(responsePath).catch(() => {});
          return response;
        }
        await onLog("stderr", `[hermes-gateway] outbox response at ${responsePath} is not valid JSON; retrying\n`);
      }
    } catch {
      // File not yet available — continue polling
    }

    if (!logged) {
      await onLog("stdout", `[hermes-gateway] waiting for Hermes response at ${responsePath}\n`);
      logged = true;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return "timeout";
}

// ---------------------------------------------------------------------------
// Main execute()
// ---------------------------------------------------------------------------

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  // --- Validate runId before any file path construction ---
  const runIdError = validateRunId(ctx.runId);
  if (runIdError) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: runIdError,
      errorCode: "hermes_gateway_run_id_invalid",
    };
  }

  // --- Parse config ---
  const rawConfig = parseObject(ctx.config);
  const inboxDir = expandHome(
    nonEmpty(rawConfig.inboxDir) ?? DEFAULT_INBOX_DIR,
  );
  const outboxDir = expandHome(
    nonEmpty(rawConfig.outboxDir) ?? DEFAULT_OUTBOX_DIR,
  );
  const pidFile = expandHome(
    nonEmpty(rawConfig.pidFile) ?? DEFAULT_PID_FILE,
  );
  const timeoutSec = asPositiveInteger(rawConfig.timeoutSec, DEFAULT_TIMEOUT_SEC);
  const timeoutMs = timeoutSec * 1000;
  const pollIntervalMs = asPositiveInteger(rawConfig.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS);
  const paperclipApiUrlOverride = (() => {
    const raw = nonEmpty(rawConfig.paperclipApiUrl);
    if (!raw) return null;
    try {
      const u = new URL(raw);
      return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
    } catch {
      return null;
    }
  })();

  // external_dirs: list of platform skill directories to pass to Hermes
  const externalDirs: string[] = Array.isArray(rawConfig.externalDirs)
    ? (rawConfig.externalDirs as unknown[])
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v) => v.trim())
    : typeof rawConfig.externalDirs === "string" && rawConfig.externalDirs.trim()
    ? rawConfig.externalDirs.trim().split(",").map((v) => v.trim()).filter(Boolean)
    : [];

  await ctx.onLog(
    "stdout",
    `[hermes-gateway] config: inboxDir=${inboxDir} outboxDir=${outboxDir} pidFile=${pidFile} timeoutSec=${timeoutSec}\n`,
  );

  // --- Liveness check: ensure Hermes daemon is alive ---
  const pid = await readPidFile(pidFile);

  if (pid === null) {
    await ctx.onLog("stderr", `[hermes-gateway] PID file not found or invalid: ${pidFile}\n`);
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: `Hermes daemon PID file not found or invalid at ${pidFile}. Ensure Hermes is running.`,
      errorCode: "hermes_gateway_pidfile_missing",
    };
  }

  if (!isProcessAlive(pid)) {
    await ctx.onLog(
      "stderr",
      `[hermes-gateway] Hermes process (pid=${pid}) is not alive (kill -0 failed)\n`,
    );
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: `Hermes daemon process (pid=${pid}) is not running. Restart Hermes and try again.`,
      errorCode: "hermes_gateway_process_dead",
    };
  }

  await ctx.onLog("stdout", `[hermes-gateway] Hermes process alive (pid=${pid})\n`);

  // --- Ensure inbox/outbox directories exist ---
  try {
    await fs.mkdir(inboxDir, { recursive: true });
    await fs.mkdir(outboxDir, { recursive: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: `Failed to create inbox/outbox directories: ${msg}`,
      errorCode: "hermes_gateway_dir_create_failed",
    };
  }

  // --- Build wake payload and message ---
  const wakePayload = buildWakePayload(ctx);
  const paperclipEnv = buildPaperclipEnvForWake(ctx, wakePayload, paperclipApiUrlOverride);
  const wakeText = buildWakeText(wakePayload, paperclipEnv);

  const inboxMsg: InboxMessage = {
    runId: ctx.runId,
    agentId: ctx.agent.id,
    companyId: ctx.agent.companyId,
    message: wakeText,
    env: paperclipEnv,
    paperclip: wakePayload,
    ...(externalDirs.length > 0 ? { externalDirs } : {}),
    timestamp: new Date().toISOString(),
  };

  // --- Write to inbox (atomic) ---
  try {
    await writeInboxMessage(inboxDir, ctx.runId, inboxMsg);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.onLog("stderr", `[hermes-gateway] failed to write inbox message: ${msg}\n`);
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: `Failed to write Hermes inbox message: ${msg}`,
      errorCode: "hermes_gateway_inbox_write_failed",
    };
  }

  await ctx.onLog(
    "stdout",
    `[hermes-gateway] wake message written to ${path.join(inboxDir, `${ctx.runId}.json`)}\n`,
  );

  if (ctx.onMeta) {
    await ctx.onMeta({
      adapterType: ADAPTER_TYPE,
      command: "hermes-gateway",
      commandArgs: ["inbox", inboxDir, ctx.runId],
      context: ctx.context,
    });
  }

  // --- Poll outbox for response ---
  const result = await pollOutbox(outboxDir, ctx.runId, pollIntervalMs, timeoutMs, ctx.onLog);

  if (result === "timeout") {
    await ctx.onLog(
      "stderr",
      `[hermes-gateway] timed out waiting for Hermes response after ${timeoutSec}s\n`,
    );
    // Clean up the inbox message if Hermes never picked it up
    const inboxFile = path.join(inboxDir, `${ctx.runId}.json`);
    await fs.unlink(inboxFile).catch(() => {});
    return {
      exitCode: 1,
      signal: null,
      timedOut: true,
      errorMessage: `Hermes Gateway timed out after ${timeoutSec}s waiting for response.`,
      errorCode: "hermes_gateway_response_timeout",
    };
  }

  const exitCode = typeof result.exitCode === "number" ? result.exitCode : 0;
  const summary = nonEmpty(result.summary) ?? undefined;
  const errorMessage = nonEmpty(result.error) ?? undefined;
  const model = nonEmpty(result.model) ?? undefined;
  const provider = nonEmpty(result.provider) ?? "hermes";

  const usage = result.usage
    ? {
        inputTokens: typeof result.usage.inputTokens === "number" ? result.usage.inputTokens : 0,
        outputTokens: typeof result.usage.outputTokens === "number" ? result.usage.outputTokens : 0,
        ...(typeof result.usage.cachedInputTokens === "number" && result.usage.cachedInputTokens > 0
          ? { cachedInputTokens: result.usage.cachedInputTokens }
          : {}),
      }
    : undefined;

  const validUsage =
    usage && (usage.inputTokens > 0 || usage.outputTokens > 0) ? usage : undefined;

  await ctx.onLog(
    "stdout",
    `[hermes-gateway] run completed runId=${ctx.runId} exitCode=${exitCode}\n`,
  );

  if (exitCode !== 0) {
    return {
      exitCode,
      signal: null,
      timedOut: false,
      errorMessage: errorMessage ?? "Hermes Gateway run failed",
      errorCode: nonEmpty(result.errorCode) ?? "hermes_gateway_run_failed",
    };
  }

  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    provider,
    ...(model ? { model } : {}),
    ...(validUsage ? { usage: validUsage } : {}),
    ...(summary ? { summary } : {}),
  };
}
