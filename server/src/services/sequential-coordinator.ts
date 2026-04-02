/**
 * Sequential Coordinator
 *
 * Manages sequential processing of issues in self-organizing mode.
 * Handles advancement through agent queue and predecessor contribution retrieval.
 */

import { eq, and, asc } from "drizzle-orm";
import { issues, issueComments, agents } from "@paperclipai/db";
import type { Db } from "@paperclipai/db";
import type { IssueAssignmentWakeupDeps } from "./issue-assignment-wakeup.js";

export interface SequentialContribution {
  agentName: string;
  body: string;
  contributionType: string;
  claimedRole: string | null;
  createdAt: Date;
}

/**
 * Advance a sequential-mode issue to the next agent in the processing queue.
 * Called after an agent posts a comment with contributionType set.
 *
 * @param db - Database instance
 * @param heartbeat - Heartbeat dependency with wakeup function
 * @param issueId - Issue ID to advance
 * @param companyId - Company ID for verification
 * @param completedAgentId - Agent who just completed their contribution
 * @param contributionType - Type of contribution (output or abstain)
 * @param claimedRole - Role claimed by the agent (if any)
 */
export async function advanceSequentialIssue(
  db: Db,
  heartbeat: IssueAssignmentWakeupDeps,
  issueId: string,
  companyId: string,
  completedAgentId: string,
  contributionType: "output" | "abstain",
  claimedRole: string | null,
): Promise<void> {
  const rows = await db
    .select()
    .from(issues)
    .where(and(eq(issues.id, issueId), eq(issues.companyId, companyId)))
    .limit(1);

  const issue = rows[0];
  if (!issue?.processingOrder || issue.processingPosition == null) return;

  const order: string[] = issue.processingOrder as string[];
  const nextPosition = issue.processingPosition + 1;

  if (nextPosition >= order.length) {
    // All agents have processed — mark issue done
    await db
      .update(issues)
      .set({
        status: "done",
        processingPosition: nextPosition,
        updatedAt: new Date(),
      })
      .where(eq(issues.id, issueId));
    return;
  }

  // Advance to next agent
  const nextAgentId = order[nextPosition]!;
  await db
    .update(issues)
    .set({
      processingPosition: nextPosition,
      assigneeAgentId: nextAgentId,
      updatedAt: new Date(),
    })
    .where(eq(issues.id, issueId));

  // Wake the next agent
  await heartbeat.wakeup(nextAgentId, {
    source: "assignment",
    triggerDetail: "system",
    reason: `Sequential processing: position ${nextPosition + 1}/${order.length}`,
    payload: {
      issueId,
      coordinationMode: "sequential",
      position: nextPosition,
      totalAgents: order.length,
      predecessorCount: nextPosition,
    },
    contextSnapshot: { issueId, source: "sequential-advance" },
  });
}

/**
 * Get all predecessor contributions for an issue in sequential mode.
 * Used by heartbeat context enrichment to inject predecessor outputs.
 *
 * @param db - Database instance
 * @param issueId - Issue ID to query
 * @returns Array of predecessor contributions, ordered by creation time
 */
export async function getPredecessorContributions(
  db: Db,
  issueId: string,
): Promise<SequentialContribution[]> {
  const rows = await db
    .select({
      agentName: agents.name,
      body: issueComments.body,
      contributionType: issueComments.contributionType,
      claimedRole: issueComments.claimedRole,
      createdAt: issueComments.createdAt,
    })
    .from(issueComments)
    .innerJoin(agents, eq(issueComments.authorAgentId, agents.id))
    .where(eq(issueComments.issueId, issueId))
    .orderBy(asc(issueComments.createdAt));

  return rows.filter((r) => r.contributionType != null) as SequentialContribution[];
}

/**
 * Generate the processing order for a new sequential-mode issue.
 * Returns agent IDs ordered by creation time (deterministic, stable).
 *
 * @param db - Database instance
 * @param companyId - Company ID to query active agents from
 * @returns Array of agent IDs in processing order
 */
export async function generateProcessingOrder(
  db: Db,
  companyId: string,
): Promise<string[]> {
  const activeAgents = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.companyId, companyId), eq(agents.status, "active")))
    .orderBy(asc(agents.createdAt));

  return activeAgents.map((a) => a.id);
}
