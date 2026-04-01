import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import type { AdapterExecutionContext } from "@paperclipai/adapter-utils";
import * as nodeFs from "node:fs";
import path from "node:path";
import os from "node:os";

// We'll import execute after setting up mocks
// Mock modules before importing the module under test

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
      writeFile: vi.fn(),
      rename: vi.fn(),
      unlink: vi.fn(),
      mkdir: vi.fn(),
      lstat: vi.fn(),
    },
    constants: actual.constants,
  };
});

// Import after mock setup
const { execute } = await import("../server/execute.js");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fsMock = nodeFs.promises as unknown as {
  readFile: Mock;
  writeFile: Mock;
  rename: Mock;
  unlink: Mock;
  mkdir: Mock;
  lstat: Mock;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides: Partial<AdapterExecutionContext> = {}): AdapterExecutionContext {
  return {
    runId: "test-run-123",
    agent: {
      id: "agent-abc",
      companyId: "company-xyz",
      name: "Test Agent",
      adapterType: "hermes_gateway",
      adapterConfig: {},
    },
    runtime: {
      sessionId: null,
      sessionParams: null,
      sessionDisplayId: null,
      taskKey: null,
    },
    context: {},
    config: {
      inboxDir: "/tmp/hermes-test/inbox",
      outboxDir: "/tmp/hermes-test/outbox",
      pidFile: "/tmp/hermes-test/hermes.pid",
      timeoutSec: 5,
      pollIntervalMs: 50,
    },
    onLog: vi.fn().mockResolvedValue(undefined),
    onMeta: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function mockPidFile(pid: number | null) {
  if (pid === null) {
    fsMock.readFile.mockImplementation((p: string) => {
      if (String(p).includes("hermes.pid")) {
        return Promise.reject(new Error("ENOENT: no such file"));
      }
      return Promise.reject(new Error("unexpected readFile call"));
    });
  } else {
    fsMock.readFile.mockImplementation((p: string) => {
      if (String(p).includes("hermes.pid")) {
        return Promise.resolve(String(pid));
      }
      return Promise.reject(new Error("unexpected readFile call"));
    });
  }
}

function mockProcessKill(alive: boolean) {
  vi.spyOn(process, "kill").mockImplementation((_pid: number, _sig: unknown) => {
    if (!alive) {
      const err = new Error("ESRCH") as NodeJS.ErrnoException;
      err.code = "ESRCH";
      throw err;
    }
    return true;
  });
}

function mockInboxWrite() {
  fsMock.writeFile.mockResolvedValue(undefined);
  fsMock.rename.mockResolvedValue(undefined);
  fsMock.mkdir.mockResolvedValue(undefined);
}

function mockOutboxResponse(response: object, _delayMs = 10) {
  let lstatCallCount = 0;
  fsMock.lstat = vi.fn().mockImplementation((p: unknown) => {
    if (String(p).includes("test-run-123.json")) {
      lstatCallCount++;
      if (lstatCallCount >= 3) {
        // Respond on 3rd poll
        return Promise.resolve({ isFile: () => true, isDirectory: () => false });
      }
    }
    return Promise.reject(new Error("ENOENT"));
  });

  // readFile handles both pid and outbox
  fsMock.readFile = vi.fn().mockImplementation((p: unknown) => {
    if (String(p).includes("hermes.pid")) {
      return Promise.resolve("12345");
    }
    if (String(p).includes("test-run-123.json")) {
      return Promise.resolve(JSON.stringify(response));
    }
    return Promise.reject(new Error("unexpected readFile: " + String(p)));
  });

  fsMock.unlink = vi.fn().mockResolvedValue(undefined);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("hermes-gateway execute()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns error when runId is invalid (path traversal attempt)", async () => {
    const ctx = makeCtx({ runId: "../../../etc/passwd" });
    fsMock.mkdir = vi.fn().mockResolvedValue(undefined);
    fsMock.readFile = vi.fn().mockRejectedValue(new Error("ENOENT"));
    const result = await execute(ctx);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("hermes_gateway_run_id_invalid");
  });

  it("returns error when runId contains path separators", async () => {
    const ctx = makeCtx({ runId: "run/../../secret" });
    fsMock.mkdir = vi.fn().mockResolvedValue(undefined);
    fsMock.readFile = vi.fn().mockRejectedValue(new Error("ENOENT"));
    const result = await execute(ctx);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("hermes_gateway_run_id_invalid");
  });

  it("returns error when PID file is missing", async () => {
    const ctx = makeCtx();
    mockPidFile(null);
    fsMock.mkdir.mockResolvedValue(undefined);
    mockProcessKill(true);

    const result = await execute(ctx);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("hermes_gateway_pidfile_missing");
  });

  it("returns error when Hermes process is dead", async () => {
    const ctx = makeCtx();
    mockPidFile(12345);
    fsMock.mkdir.mockResolvedValue(undefined);
    mockProcessKill(false);

    const result = await execute(ctx);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("hermes_gateway_process_dead");
  });

  it("returns success on happy path: pid alive, message written, response received", async () => {
    const ctx = makeCtx();
    mockProcessKill(true);
    mockInboxWrite();
    mockOutboxResponse({
      exitCode: 0,
      summary: "Task completed successfully",
      model: "claude-3-7-sonnet",
      provider: "hermes",
      usage: { inputTokens: 100, outputTokens: 200 },
    });

    const result = await execute(ctx);
    expect(result.exitCode).toBe(0);
    expect(result.summary).toBe("Task completed successfully");
    expect(result.model).toBe("claude-3-7-sonnet");
    expect(result.provider).toBe("hermes");
    expect(result.usage?.inputTokens).toBe(100);
    expect(result.usage?.outputTokens).toBe(200);

    // Verify inbox was written atomically (writeFile + rename)
    expect(fsMock.writeFile).toHaveBeenCalledOnce();
    expect(fsMock.rename).toHaveBeenCalledOnce();
    // Verify written to inbox dir
    const writeArgs = fsMock.writeFile.mock.calls[0];
    expect(String(writeArgs[0])).toContain("inbox");
    expect(String(writeArgs[0])).toContain(".tmp");
  });

  it("returns timeout when Hermes does not respond in time", async () => {
    const ctx = makeCtx({
      config: {
        inboxDir: "/tmp/hermes-test/inbox",
        outboxDir: "/tmp/hermes-test/outbox",
        pidFile: "/tmp/hermes-test/hermes.pid",
        timeoutSec: 1, // 1 second
        pollIntervalMs: 200,
      },
    });
    mockPidFile(12345);
    fsMock.mkdir.mockResolvedValue(undefined);
    mockProcessKill(true);
    fsMock.writeFile.mockResolvedValue(undefined);
    fsMock.rename.mockResolvedValue(undefined);
    // lstat always returns ENOENT (no response)
    fsMock.lstat.mockRejectedValue(new Error("ENOENT"));
    fsMock.unlink.mockResolvedValue(undefined);

    const result = await execute(ctx);
    expect(result.exitCode).toBe(1);
    expect(result.timedOut).toBe(true);
    expect(result.errorCode).toBe("hermes_gateway_response_timeout");
  });

  it("passes externalDirs in inbox message when configured", async () => {
    const ctx = makeCtx({
      config: {
        inboxDir: "/tmp/hermes-test/inbox",
        outboxDir: "/tmp/hermes-test/outbox",
        pidFile: "/tmp/hermes-test/hermes.pid",
        timeoutSec: 5,
        pollIntervalMs: 50,
        externalDirs: ["/platform/skills/"],
      },
    });
    mockProcessKill(true);
    mockInboxWrite();
    mockOutboxResponse({ exitCode: 0, summary: "done" });

    await execute(ctx);

    // Check that the inbox message included externalDirs
    const writeCall = fsMock.writeFile.mock.calls[0];
    const writtenContent = String(writeCall[1]);
    const parsed = JSON.parse(writtenContent);
    expect(parsed.externalDirs).toEqual(["/platform/skills/"]);
  });

  it("does not include externalDirs when not configured", async () => {
    const ctx = makeCtx();
    mockProcessKill(true);
    mockInboxWrite();
    mockOutboxResponse({ exitCode: 0, summary: "done" });

    await execute(ctx);

    const writeCall = fsMock.writeFile.mock.calls[0];
    const writtenContent = String(writeCall[1]);
    const parsed = JSON.parse(writtenContent);
    expect(parsed.externalDirs).toBeUndefined();
  });

  it("inbox message contains required paperclip env vars", async () => {
    const ctx = makeCtx();
    mockProcessKill(true);
    mockInboxWrite();
    mockOutboxResponse({ exitCode: 0 });

    await execute(ctx);

    const writeCall = fsMock.writeFile.mock.calls[0];
    const writtenContent = String(writeCall[1]);
    const parsed = JSON.parse(writtenContent);

    expect(parsed.env).toBeDefined();
    expect(parsed.env.PAPERCLIP_RUN_ID).toBe("test-run-123");
    expect(parsed.env.PAPERCLIP_AGENT_ID).toBe("agent-abc");
    expect(parsed.env.PAPERCLIP_COMPANY_ID).toBe("company-xyz");
    expect(parsed.runId).toBe("test-run-123");
  });

  it("returns non-zero exitCode from response when run fails", async () => {
    const ctx = makeCtx();
    mockProcessKill(true);
    mockInboxWrite();
    mockOutboxResponse({
      exitCode: 1,
      error: "Task checkout conflict",
      errorCode: "checkout_conflict",
    });

    const result = await execute(ctx);
    expect(result.exitCode).toBe(1);
    expect(result.errorMessage).toBe("Task checkout conflict");
    expect(result.errorCode).toBe("checkout_conflict");
  });
});
