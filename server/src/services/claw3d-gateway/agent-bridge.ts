import type { Db } from "@paperclipai/db";
import { agents } from "@paperclipai/db";
import { agentService } from "../agents.js";
import { computePresence } from "./presence.js";
import type {
  Claw3DAgent,
  AgentsListParams,
  AgentsCreateParams,
  AgentsUpdateParams,
} from "./protocol.js";

/**
 * Maps a Paperclip agent DB row to the Claw3D agent model.
 *
 * SECURITY: adapterConfig and runtimeConfig are intentionally excluded —
 * they may contain API keys, secrets, and credentials.
 */
export function toClaw3DAgent(row: typeof agents.$inferSelect): Claw3DAgent {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    role: row.role,
    title: row.title ?? null,
    icon: row.icon ?? null,
    status: row.status,
    reportsTo: row.reportsTo ?? null,
    capabilities: row.capabilities ?? null,
    adapterType: row.adapterType,
    budgetMonthlyCents: row.budgetMonthlyCents,
    spentMonthlyCents: row.spentMonthlyCents,
    lastHeartbeatAt: row.lastHeartbeatAt ? row.lastHeartbeatAt.toISOString() : null,
    presence: computePresence(row.lastHeartbeatAt ?? null),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Create an agent bridge that delegates CRUD to agentService.
 * The bridge translates between Claw3D protocol params and Paperclip's
 * native agent service, then maps results through toClaw3DAgent.
 */
export function createAgentBridge(db: Db) {
  // Instantiate once — agentService(db) creates helper closures
  const svc = agentService(db);

  async function listAgents(
    companyId: string,
    options?: Pick<AgentsListParams, "includeTerminated">,
  ): Promise<Claw3DAgent[]> {
    const rows = await svc.list(companyId, {
      includeTerminated: options?.includeTerminated,
    });
    // normalizeAgentRow wraps the row — it includes the raw DB fields we need
    // The returned rows extend agents.$inferSelect so toClaw3DAgent is safe
    return rows.map((row) => toClaw3DAgent(row as unknown as typeof agents.$inferSelect));
  }

  async function createAgent(params: AgentsCreateParams): Promise<Claw3DAgent> {
    const { companyId, ...data } = params;
    const created = await svc.create(companyId, {
      name: data.name,
      role: data.role,
      title: data.title,
      icon: data.icon,
      reportsTo: data.reportsTo,
      capabilities: data.capabilities,
      adapterType: data.adapterType ?? "process",
      adapterConfig: data.adapterConfig ?? {},
      runtimeConfig: data.runtimeConfig ?? {},
      budgetMonthlyCents: data.budgetMonthlyCents ?? 0,
      permissions: {},
      metadata: data.metadata,
    });
    return toClaw3DAgent(created as unknown as typeof agents.$inferSelect);
  }

  async function updateAgent(params: AgentsUpdateParams): Promise<Claw3DAgent | null> {
    const updated = await svc.update(params.agentId, params.patch as Partial<typeof agents.$inferInsert>);
    if (!updated) return null;
    return toClaw3DAgent(updated as unknown as typeof agents.$inferSelect);
  }

  async function deleteAgent(agentId: string): Promise<Claw3DAgent | null> {
    const existing = await svc.getById(agentId);
    if (!existing) return null;
    const terminated = await svc.terminate(agentId);
    if (!terminated) return null;
    return toClaw3DAgent(terminated as unknown as typeof agents.$inferSelect);
  }

  return { listAgents, createAgent, updateAgent, deleteAgent };
}
