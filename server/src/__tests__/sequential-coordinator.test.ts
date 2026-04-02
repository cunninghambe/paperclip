/**
 * Tests for sequential-coordinator.ts
 *
 * These tests use mock database and heartbeat dependencies
 * to avoid needing an actual PostgreSQL connection.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  advanceSequentialIssue,
  getPredecessorContributions,
  generateProcessingOrder,
} from "../services/sequential-coordinator.js";
import type { IssueAssignmentWakeupDeps } from "../services/issue-assignment-wakeup.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockDb() {
  const mockUpdate = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  });

  const mockSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      }),
      orderBy: vi.fn().mockResolvedValue([]),
    }),
  });

  return {
    select: mockSelect,
    update: mockUpdate,
    insert: vi.fn(),
  } as unknown as ReturnType<typeof import("@paperclipai/db").createDb>;
}

function createMockHeartbeat() {
  return {
    wakeup: vi.fn().mockResolvedValue(undefined),
  } as unknown as IssueAssignmentWakeupDeps;
}

// ---------------------------------------------------------------------------
// advanceSequentialIssue
// ---------------------------------------------------------------------------

describe("advanceSequentialIssue", () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let mockHeartbeat: IssueAssignmentWakeupDeps;

  beforeEach(() => {
    mockDb = createMockDb();
    mockHeartbeat = createMockHeartbeat();
  });

  it("no-ops if issue not found", async () => {
    // Select returns empty array (issue not found)
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    (mockDb as unknown as Record<string, unknown>).select = selectMock;

    await advanceSequentialIssue(mockDb, mockHeartbeat, "issue-1", "company-1", "agent-1", "output", null);

    expect(mockHeartbeat.wakeup).not.toHaveBeenCalled();
  });

  it("no-ops if issue has no processingOrder (structured mode)", async () => {
    const issue = {
      id: "issue-1",
      companyId: "company-1",
      processingOrder: null,
      processingPosition: null,
    };

    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([issue]),
        }),
      }),
    });
    (mockDb as unknown as Record<string, unknown>).select = selectMock;

    await advanceSequentialIssue(mockDb, mockHeartbeat, "issue-1", "company-1", "agent-1", "output", null);

    expect(mockHeartbeat.wakeup).not.toHaveBeenCalled();
  });

  it("marks issue done when last agent completes", async () => {
    const issue = {
      id: "issue-1",
      companyId: "company-1",
      processingOrder: ["agent-1", "agent-2"],
      processingPosition: 1, // Position 1 = last agent
    };

    const updateSetWhere = vi.fn().mockResolvedValue([]);
    const updateSet = vi.fn().mockReturnValue({ where: updateSetWhere });
    const updateMock = vi.fn().mockReturnValue({ set: updateSet });

    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([issue]),
        }),
      }),
    });
    (mockDb as unknown as Record<string, unknown>).select = selectMock;
    (mockDb as unknown as Record<string, unknown>).update = updateMock;

    await advanceSequentialIssue(mockDb, mockHeartbeat, "issue-1", "company-1", "agent-2", "output", null);

    // Should update status to done
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "done" })
    );
    // Should NOT wake next agent
    expect(mockHeartbeat.wakeup).not.toHaveBeenCalled();
  });

  it("marks issue done when last agent abstains", async () => {
    const issue = {
      id: "issue-1",
      companyId: "company-1",
      processingOrder: ["agent-1", "agent-2"],
      processingPosition: 1,
    };

    const updateSetWhere = vi.fn().mockResolvedValue([]);
    const updateSet = vi.fn().mockReturnValue({ where: updateSetWhere });
    const updateMock = vi.fn().mockReturnValue({ set: updateSet });

    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([issue]),
        }),
      }),
    });
    (mockDb as unknown as Record<string, unknown>).select = selectMock;
    (mockDb as unknown as Record<string, unknown>).update = updateMock;

    await advanceSequentialIssue(mockDb, mockHeartbeat, "issue-1", "company-1", "agent-2", "abstain", null);

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "done" })
    );
    expect(mockHeartbeat.wakeup).not.toHaveBeenCalled();
  });

  it("wakes next agent with sequential context after output", async () => {
    const issue = {
      id: "issue-1",
      companyId: "company-1",
      processingOrder: ["agent-1", "agent-2", "agent-3"],
      processingPosition: 0, // First agent just completed
    };

    const updateSetWhere = vi.fn().mockResolvedValue([]);
    const updateSet = vi.fn().mockReturnValue({ where: updateSetWhere });
    const updateMock = vi.fn().mockReturnValue({ set: updateSet });

    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([issue]),
        }),
      }),
    });
    (mockDb as unknown as Record<string, unknown>).select = selectMock;
    (mockDb as unknown as Record<string, unknown>).update = updateMock;

    await advanceSequentialIssue(mockDb, mockHeartbeat, "issue-1", "company-1", "agent-1", "output", "Reviewer");

    // Should advance position
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ processingPosition: 1, assigneeAgentId: "agent-2" })
    );

    // Should wake next agent
    expect(mockHeartbeat.wakeup).toHaveBeenCalledWith(
      "agent-2",
      expect.objectContaining({
        source: "assignment",
        payload: expect.objectContaining({
          issueId: "issue-1",
          coordinationMode: "sequential",
          position: 1,
          totalAgents: 3,
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// getPredecessorContributions
// ---------------------------------------------------------------------------

describe("getPredecessorContributions", () => {
  it("returns contributions with non-null contributionType, ordered by createdAt", async () => {
    const mockComments = [
      {
        agentName: "Agent A",
        body: "I did analysis",
        contributionType: "output",
        claimedRole: "Analyst",
        createdAt: new Date("2026-01-01T10:00:00Z"),
      },
      {
        agentName: "Agent B",
        body: "Abstaining",
        contributionType: "abstain",
        claimedRole: null,
        createdAt: new Date("2026-01-01T11:00:00Z"),
      },
    ];

    const db = createMockDb();
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockComments),
          }),
        }),
      }),
    });
    (db as unknown as Record<string, unknown>).select = selectMock;

    const contributions = await getPredecessorContributions(db, "issue-1");

    expect(contributions).toHaveLength(2);
    expect(contributions[0]).toMatchObject({
      agentName: "Agent A",
      contributionType: "output",
      claimedRole: "Analyst",
    });
  });

  it("returns empty array for issues with no sequential comments", async () => {
    const db = createMockDb();
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });
    (db as unknown as Record<string, unknown>).select = selectMock;

    const contributions = await getPredecessorContributions(db, "issue-1");

    expect(contributions).toHaveLength(0);
  });

  it("filters out comments with null contributionType", async () => {
    const mockComments = [
      {
        agentName: "Agent A",
        body: "Regular comment",
        contributionType: null, // Regular comment, not sequential
        claimedRole: null,
        createdAt: new Date("2026-01-01T10:00:00Z"),
      },
      {
        agentName: "Agent B",
        body: "Sequential output",
        contributionType: "output",
        claimedRole: "Developer",
        createdAt: new Date("2026-01-01T11:00:00Z"),
      },
    ];

    const db = createMockDb();
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockComments),
          }),
        }),
      }),
    });
    (db as unknown as Record<string, unknown>).select = selectMock;

    const contributions = await getPredecessorContributions(db, "issue-1");

    expect(contributions).toHaveLength(1);
    expect(contributions[0]?.agentName).toBe("Agent B");
  });
});

// ---------------------------------------------------------------------------
// generateProcessingOrder
// ---------------------------------------------------------------------------

describe("generateProcessingOrder", () => {
  it("returns active agent IDs ordered by createdAt", async () => {
    const mockAgents = [
      { id: "agent-1" },
      { id: "agent-2" },
      { id: "agent-3" },
    ];

    const db = createMockDb();
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(mockAgents),
        }),
      }),
    });
    (db as unknown as Record<string, unknown>).select = selectMock;

    const order = await generateProcessingOrder(db, "company-1");

    expect(order).toEqual(["agent-1", "agent-2", "agent-3"]);
  });

  it("returns empty array if no active agents", async () => {
    const db = createMockDb();
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    (db as unknown as Record<string, unknown>).select = selectMock;

    const order = await generateProcessingOrder(db, "company-1");

    expect(order).toEqual([]);
  });
});
