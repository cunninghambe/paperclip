import type { Agent } from "@paperclipai/shared";
import { api } from "./client";
import { agentsApi } from "./agents";

export interface OfficeAgent {
  id: string;
  name: string;
  shortname: string;
  status: "active" | "paused" | "idle" | "error";
  currentTask?: string;
}

export interface OfficeLayout {
  agents: OfficeAgent[];
  gridSize: { rows: number; cols: number };
}

export interface OfficePresenceAgent {
  id: string;
  name: string;
  presence: "online" | "away" | "offline";
  lastHeartbeatAt: string | null;
}

export function normalizeAgentStatus(status: string): OfficeAgent["status"] {
  if (status === "active" || status === "running") return "active";
  if (status === "paused") return "paused";
  if (status === "error") return "error";
  return "idle";
}

export function agentToOfficeAgent(agent: Agent): OfficeAgent {
  return {
    id: agent.id,
    name: agent.name,
    shortname: agent.urlKey
      ? agent.urlKey.slice(0, 3).toUpperCase()
      : agent.name.slice(0, 3).toUpperCase(),
    status: normalizeAgentStatus(agent.status),
  };
}

function calcGridSize(count: number): { rows: number; cols: number } {
  if (count === 0) return { rows: 0, cols: 0 };
  const cols = Math.min(count, 4);
  const rows = Math.ceil(count / cols);
  return { rows, cols };
}

export const officeApi = {
  async getLayout(companyId: string): Promise<OfficeLayout> {
    try {
      const layout = await api.get<OfficeLayout | null>(`/companies/${companyId}/office/layout`);
      if (layout && layout.agents?.length) return layout;
    } catch {
      // Fall through to agent-based layout
    }
    // Fallback: transform agents list into office layout
    const agents = await agentsApi.list(companyId);
    const officeAgents = agents
      .filter((a) => a.status !== "terminated")
      .map(agentToOfficeAgent);
    return {
      agents: officeAgents,
      gridSize: calcGridSize(officeAgents.length),
    };
  },

  async saveLayout(
    companyId: string,
    layoutData: Record<string, unknown>,
  ): Promise<unknown> {
    return api.put<unknown>(`/companies/${companyId}/office/layout`, { layoutData });
  },

  async getPresence(companyId: string): Promise<OfficePresenceAgent[]> {
    return api.get<OfficePresenceAgent[]>(`/companies/${companyId}/office/presence`);
  },
};

export const officeKeys = {
  layout: (companyId: string) => ["office", "layout", companyId] as const,
  presence: (companyId: string) => ["office", "presence", companyId] as const,
};
