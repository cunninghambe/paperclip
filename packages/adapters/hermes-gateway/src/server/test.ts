import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { parseObject } from "@paperclipai/adapter-utils/server-utils";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  DEFAULT_INBOX_DIR,
  DEFAULT_OUTBOX_DIR,
  DEFAULT_PID_FILE,
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

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((c) => c.level === "error")) return "fail";
  if (checks.some((c) => c.level === "warn")) return "warn";
  return "pass";
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readPidFile(pidFilePath: string): Promise<number | null> {
  try {
    const raw = await fs.readFile(pidFilePath, "utf8");
    const pid = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

async function checkDirWritable(dir: string): Promise<boolean> {
  const testFile = path.join(dir, `.hermes-gateway-probe-${process.pid}`);
  try {
    await fs.writeFile(testFile, "", "utf8");
    await fs.unlink(testFile);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// testEnvironment
// ---------------------------------------------------------------------------

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);

  const inboxDir = expandHome(nonEmpty(config.inboxDir) ?? DEFAULT_INBOX_DIR);
  const outboxDir = expandHome(nonEmpty(config.outboxDir) ?? DEFAULT_OUTBOX_DIR);
  const pidFile = expandHome(nonEmpty(config.pidFile) ?? DEFAULT_PID_FILE);

  // --- Check inbox directory ---
  try {
    const stat = await fs.stat(inboxDir);
    if (stat.isDirectory()) {
      const writable = await checkDirWritable(inboxDir);
      if (writable) {
        checks.push({
          code: "hermes_gateway_inbox_ok",
          level: "info",
          message: `Inbox directory exists and is writable: ${inboxDir}`,
        });
      } else {
        checks.push({
          code: "hermes_gateway_inbox_not_writable",
          level: "error",
          message: `Inbox directory exists but is not writable: ${inboxDir}`,
          hint: `Ensure the Paperclip server process has write permission to ${inboxDir}`,
        });
      }
    } else {
      checks.push({
        code: "hermes_gateway_inbox_not_dir",
        level: "error",
        message: `Inbox path exists but is not a directory: ${inboxDir}`,
        hint: "Remove the file at the inbox path and restart Hermes.",
      });
    }
  } catch {
    // Inbox doesn't exist — try to create it
    try {
      await fs.mkdir(inboxDir, { recursive: true });
      checks.push({
        code: "hermes_gateway_inbox_created",
        level: "warn",
        message: `Inbox directory did not exist; created: ${inboxDir}`,
        hint: "This is normal on first run. Hermes will watch this directory.",
      });
    } catch (mkErr) {
      checks.push({
        code: "hermes_gateway_inbox_create_failed",
        level: "error",
        message: `Cannot create inbox directory ${inboxDir}: ${mkErr instanceof Error ? mkErr.message : String(mkErr)}`,
        hint: `Create the directory manually: mkdir -p ${inboxDir}`,
      });
    }
  }

  // --- Check outbox directory ---
  try {
    const stat = await fs.stat(outboxDir);
    if (stat.isDirectory()) {
      checks.push({
        code: "hermes_gateway_outbox_ok",
        level: "info",
        message: `Outbox directory exists: ${outboxDir}`,
      });
    } else {
      checks.push({
        code: "hermes_gateway_outbox_not_dir",
        level: "warn",
        message: `Outbox path exists but is not a directory: ${outboxDir}`,
      });
    }
  } catch {
    try {
      await fs.mkdir(outboxDir, { recursive: true });
      checks.push({
        code: "hermes_gateway_outbox_created",
        level: "warn",
        message: `Outbox directory did not exist; created: ${outboxDir}`,
        hint: "Hermes should write response files to this directory.",
      });
    } catch {
      checks.push({
        code: "hermes_gateway_outbox_missing",
        level: "warn",
        message: `Outbox directory does not exist and could not be created: ${outboxDir}`,
        hint: `Create it: mkdir -p ${outboxDir}`,
      });
    }
  }

  // --- Check PID file and process liveness ---
  const pid = await readPidFile(pidFile);
  if (pid === null) {
    checks.push({
      code: "hermes_gateway_pid_missing",
      level: "error",
      message: `Hermes PID file not found or invalid at ${pidFile}`,
      hint: "Start the Hermes daemon (hermes serve) and ensure it writes its PID to the configured path.",
    });
  } else {
    checks.push({
      code: "hermes_gateway_pid_found",
      level: "info",
      message: `Hermes PID file found: ${pidFile} (pid=${pid})`,
    });

    // Liveness probe: kill(pid, 0) — no HTTP endpoint
    if (isProcessAlive(pid)) {
      checks.push({
        code: "hermes_gateway_process_alive",
        level: "info",
        message: `Hermes process is alive (kill -0 pid=${pid} succeeded)`,
      });
    } else {
      checks.push({
        code: "hermes_gateway_process_dead",
        level: "error",
        message: `Hermes process (pid=${pid}) is not running (kill -0 failed)`,
        hint: "Restart the Hermes daemon: hermes serve",
      });
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
