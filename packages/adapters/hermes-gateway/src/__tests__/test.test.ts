import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AdapterEnvironmentTestContext } from "@paperclipai/adapter-utils";
import * as nodeFs from "node:fs";

// Mock the sync fs methods used by test.ts implementation.
// IMPORTANT: We must set `default: mockModule` so that `import fs from "node:fs"`
// (used in the implementation) also receives the mocked methods, not the original.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const mocks = {
    accessSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
    constants: actual.constants,
  };
  const mockModule = {
    ...actual,
    ...mocks,
  };
  // CJS interop: default import (import fs from "node:fs") also needs the mocked module
  return {
    ...mockModule,
    default: mockModule,
  };
});

const { testEnvironment } = await import("../server/test.js");

const accessSyncMock = vi.mocked(nodeFs.accessSync);
const mkdirSyncMock = vi.mocked(nodeFs.mkdirSync);
const readFileSyncMock = vi.mocked(nodeFs.readFileSync);
const existsSyncMock = vi.mocked(nodeFs.existsSync);

function makeCtx(config: Record<string, unknown> = {}): AdapterEnvironmentTestContext {
  return {
    companyId: "company-test",
    adapterType: "hermes_gateway",
    config: {
      inboxDir: "/tmp/hermes-env-test/inbox",
      outboxDir: "/tmp/hermes-env-test/outbox",
      pidFile: "/tmp/hermes-env-test/hermes.pid",
      ...config,
    },
  };
}

describe("hermes-gateway testEnvironment()", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("returns pass when inbox/outbox writable and process alive", async () => {
    process.env.OPENROUTER_API_KEY = "test-key-for-pass";

    accessSyncMock.mockReturnValue(undefined);
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue("99999");
    vi.spyOn(process, "kill").mockReturnValue(true);

    const result = await testEnvironment(makeCtx());

    expect(result.status).toBe("pass");
    expect(result.checks.some((c) => c.code === "hermes_gateway_inbox_accessible")).toBe(true);
    expect(result.checks.some((c) => c.code === "hermes_gateway_process_alive")).toBe(true);
  });

  it("returns warn when process is not running", async () => {
    accessSyncMock.mockReturnValue(undefined);
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue("99999");

    vi.spyOn(process, "kill").mockImplementation(() => {
      const err = new Error("ESRCH") as NodeJS.ErrnoException;
      err.code = "ESRCH";
      throw err;
    });

    const result = await testEnvironment(makeCtx());

    expect(result.status).toBe("warn");
    expect(result.checks.some((c) => c.code === "hermes_gateway_process_not_alive")).toBe(true);
  });

  it("returns warn when pid file is missing", async () => {
    accessSyncMock.mockReturnValue(undefined);
    existsSyncMock.mockReturnValue(false);

    const result = await testEnvironment(makeCtx());

    expect(result.status).toBe("warn");
    expect(result.checks.some((c) => c.code === "hermes_gateway_pid_file_missing")).toBe(true);
  });

  it("creates inbox dir if not accessible and returns pass", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";

    accessSyncMock.mockImplementation((p: nodeFs.PathLike) => {
      if (String(p).includes("inbox")) {
        throw new Error("ENOENT");
      }
      return undefined;
    });
    mkdirSyncMock.mockImplementation(() => undefined);
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue("99999");
    vi.spyOn(process, "kill").mockReturnValue(true);

    const result = await testEnvironment(makeCtx());

    expect(result.checks.some((c) => c.code === "hermes_gateway_inbox_created")).toBe(true);
    expect(result.status).toBe("pass");
  });

  it("returns fail when inbox is not writable and cannot be created", async () => {
    accessSyncMock.mockImplementation((p: nodeFs.PathLike) => {
      if (String(p).includes("inbox")) {
        throw new Error("EACCES");
      }
      return undefined;
    });
    mkdirSyncMock.mockImplementation((p: nodeFs.PathLike) => {
      if (String(p).includes("inbox")) {
        throw new Error("EACCES");
      }
      return undefined;
    });
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue("99999");
    vi.spyOn(process, "kill").mockReturnValue(true);

    const result = await testEnvironment(makeCtx());

    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.code === "hermes_gateway_inbox_not_writable")).toBe(true);
  });
});
