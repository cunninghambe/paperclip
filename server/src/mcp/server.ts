/**
 * Paperclip Platform MCP Server
 *
 * 22 tools across 6 domains: companies, agents, issues, runs, approvals, status.
 *
 * Configure in Claude Code (~/.claude/mcp.json):
 * {
 *   "mcpServers": {
 *     "paperclip": {
 *       "command": "node",
 *       "args": ["/opt/autogeny-platform/server/dist/mcp/index.js"],
 *       "env": {
 *         "PAPERCLIP_API_URL": "http://5.161.200.212:3100/api",
 *         "PAPERCLIP_API_KEY": "your-token"
 *       }
 *     }
 *   }
 * }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { resolveAuth } from "./auth.js";

const { apiUrl, headers } = resolveAuth();

async function apiFetch<T>(
  path: string,
  opts?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, {
    method: opts?.method ?? "GET",
    headers,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function err(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

const server = new Server(
  { name: "paperclip", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── Companies ──────────────────────────────────────────────────────────
    {
      name: "companies_list",
      description: "List all companies/organizations you have access to",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "companies_get",
      description: "Get details of a specific company including agent count and settings",
      inputSchema: {
        type: "object",
        properties: { companyId: { type: "string", description: "Company UUID" } },
        required: ["companyId"],
      },
    },
    {
      name: "companies_create",
      description: "Create a new company/organization",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Company name" },
          description: { type: "string", description: "Optional description" },
        },
        required: ["name"],
      },
    },
    {
      name: "companies_update",
      description: "Update company settings (name, coordination mode, budget)",
      inputSchema: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          name: { type: "string" },
          coordinationMode: {
            type: "string",
            enum: ["structured", "sequential", "auto"],
          },
          budgetMonthlyCents: { type: "number", description: "Monthly budget in cents" },
        },
        required: ["companyId"],
      },
    },

    // ── Agents ─────────────────────────────────────────────────────────────
    {
      name: "agents_list",
      description: "List all agents in a company with their status, adapter type, and model",
      inputSchema: {
        type: "object",
        properties: { companyId: { type: "string" } },
        required: ["companyId"],
      },
    },
    {
      name: "agents_get",
      description: "Get full details of an agent including config, runtime state, last heartbeat",
      inputSchema: {
        type: "object",
        properties: { agentId: { type: "string" } },
        required: ["agentId"],
      },
    },
    {
      name: "agents_create",
      description: "Create a new agent in a company",
      inputSchema: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          name: { type: "string" },
          adapterType: {
            type: "string",
            enum: [
              "claude_local",
              "hermes_local",
              "codex_local",
              "gemini_local",
              "openclaw_gateway",
              "opencode_local",
              "pi_local",
              "cursor",
            ],
          },
          role: { type: "string", description: "Agent role description" },
          title: { type: "string", description: "Agent title/position" },
          model: { type: "string", description: "Model ID (e.g. claude-sonnet-4-6)" },
          reportsTo: { type: "string", description: "Agent ID this agent reports to" },
        },
        required: ["companyId", "name", "adapterType"],
      },
    },
    {
      name: "agents_update",
      description: "Update agent name, role, model, or adapter config",
      inputSchema: {
        type: "object",
        properties: {
          agentId: { type: "string" },
          name: { type: "string" },
          role: { type: "string" },
          title: { type: "string" },
          adapterConfig: { type: "object", description: "Adapter-specific config" },
        },
        required: ["agentId"],
      },
    },
    {
      name: "agents_wakeup",
      description: "Wake up an agent to start working on a new heartbeat run",
      inputSchema: {
        type: "object",
        properties: {
          agentId: { type: "string" },
          reason: { type: "string", description: "Reason or instructions for this run" },
          issueId: { type: "string", description: "Issue to work on" },
        },
        required: ["agentId"],
      },
    },
    {
      name: "agents_lifecycle",
      description: "Pause, resume, or terminate an agent",
      inputSchema: {
        type: "object",
        properties: {
          agentId: { type: "string" },
          action: { type: "string", enum: ["pause", "resume", "terminate"] },
        },
        required: ["agentId", "action"],
      },
    },

    // ── Issues ─────────────────────────────────────────────────────────────
    {
      name: "issues_list",
      description: "List issues in a company with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          status: {
            type: "string",
            description: "Comma-separated statuses: backlog,todo,in_progress,done,cancelled",
          },
          assigneeAgentId: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          limit: { type: "number", description: "Max results (default 50)" },
        },
        required: ["companyId"],
      },
    },
    {
      name: "issues_get",
      description: "Get full issue details including description and status",
      inputSchema: {
        type: "object",
        properties: { issueId: { type: "string" } },
        required: ["issueId"],
      },
    },
    {
      name: "issues_create",
      description: "Create a new issue/task and optionally assign to an agent",
      inputSchema: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          assigneeAgentId: { type: "string" },
          parentId: { type: "string", description: "Parent issue ID for sub-tasks" },
        },
        required: ["companyId", "title"],
      },
    },
    {
      name: "issues_update",
      description: "Update issue status, assignee, priority, or description",
      inputSchema: {
        type: "object",
        properties: {
          issueId: { type: "string" },
          status: {
            type: "string",
            enum: ["backlog", "todo", "in_progress", "in_review", "blocked", "done", "cancelled"],
          },
          assigneeAgentId: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["issueId"],
      },
    },
    {
      name: "issues_comment",
      description: "Post a comment on an issue",
      inputSchema: {
        type: "object",
        properties: {
          issueId: { type: "string" },
          body: { type: "string", description: "Comment text (markdown supported)" },
        },
        required: ["issueId", "body"],
      },
    },
    {
      name: "issues_comments",
      description: "List all comments on an issue",
      inputSchema: {
        type: "object",
        properties: { issueId: { type: "string" } },
        required: ["issueId"],
      },
    },

    // ── Runs ───────────────────────────────────────────────────────────────
    {
      name: "runs_list",
      description: "List recent agent heartbeat runs for a company",
      inputSchema: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          agentId: { type: "string", description: "Filter by agent" },
          limit: { type: "number", description: "Max results (default 20)" },
        },
        required: ["companyId"],
      },
    },
    {
      name: "runs_get",
      description: "Get full run details including status, duration, and error",
      inputSchema: {
        type: "object",
        properties: { runId: { type: "string" } },
        required: ["runId"],
      },
    },
    {
      name: "runs_cancel",
      description: "Cancel an active agent run",
      inputSchema: {
        type: "object",
        properties: {
          runId: { type: "string" },
          reason: { type: "string" },
        },
        required: ["runId"],
      },
    },

    // ── Approvals ──────────────────────────────────────────────────────────
    {
      name: "approvals_list",
      description: "List pending (and recent) approvals for a company",
      inputSchema: {
        type: "object",
        properties: { companyId: { type: "string" } },
        required: ["companyId"],
      },
    },
    {
      name: "approvals_decide",
      description: "Approve or reject a pending approval request",
      inputSchema: {
        type: "object",
        properties: {
          approvalId: { type: "string" },
          decision: { type: "string", enum: ["approved", "rejected"] },
          reason: { type: "string", description: "Optional reason for decision" },
        },
        required: ["approvalId", "decision"],
      },
    },

    // ── Platform Status ────────────────────────────────────────────────────
    {
      name: "platform_status",
      description: "Get platform health, version, deployment mode, and running state",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      // ── Companies ────────────────────────────────────────────────────────
      case "companies_list":
        return ok(await apiFetch("/companies"));

      case "companies_get": {
        const { companyId } = args as { companyId: string };
        return ok(await apiFetch(`/companies/${companyId}`));
      }

      case "companies_create": {
        const { name: compName, description } = args as { name: string; description?: string };
        return ok(await apiFetch("/companies", { method: "POST", body: { name: compName, description } }));
      }

      case "companies_update": {
        const { companyId, ...patch } = args as {
          companyId: string;
          name?: string;
          coordinationMode?: string;
          budgetMonthlyCents?: number;
        };
        return ok(await apiFetch(`/companies/${companyId}`, { method: "PATCH", body: patch }));
      }

      // ── Agents ───────────────────────────────────────────────────────────
      case "agents_list": {
        const { companyId } = args as { companyId: string };
        return ok(await apiFetch(`/companies/${companyId}/agents`));
      }

      case "agents_get": {
        const { agentId } = args as { agentId: string };
        return ok(await apiFetch(`/agents/${agentId}`));
      }

      case "agents_create": {
        const { companyId, ...agentData } = args as {
          companyId: string;
          name: string;
          adapterType: string;
          role?: string;
          title?: string;
          model?: string;
          reportsTo?: string;
        };
        return ok(await apiFetch(`/companies/${companyId}/agents`, { method: "POST", body: agentData }));
      }

      case "agents_update": {
        const { agentId, ...patch } = args as {
          agentId: string;
          name?: string;
          role?: string;
          title?: string;
          adapterConfig?: Record<string, unknown>;
        };
        return ok(await apiFetch(`/agents/${agentId}`, { method: "PATCH", body: patch }));
      }

      case "agents_wakeup": {
        const { agentId, reason, issueId } = args as {
          agentId: string;
          reason?: string;
          issueId?: string;
        };
        return ok(await apiFetch(`/agents/${agentId}/wakeup`, { method: "POST", body: { reason, issueId } }));
      }

      case "agents_lifecycle": {
        const { agentId, action } = args as { agentId: string; action: "pause" | "resume" | "terminate" };
        return ok(await apiFetch(`/agents/${agentId}/${action}`, { method: "POST" }));
      }

      // ── Issues ───────────────────────────────────────────────────────────
      case "issues_list": {
        const { companyId, status, assigneeAgentId, priority, limit } = args as {
          companyId: string;
          status?: string;
          assigneeAgentId?: string;
          priority?: string;
          limit?: number;
        };
        const params = new URLSearchParams();
        if (status) params.set("status", status);
        if (assigneeAgentId) params.set("assigneeAgentId", assigneeAgentId);
        if (priority) params.set("priority", priority);
        if (limit) params.set("limit", String(limit));
        return ok(await apiFetch(`/companies/${companyId}/issues?${params}`));
      }

      case "issues_get": {
        const { issueId } = args as { issueId: string };
        return ok(await apiFetch(`/issues/${issueId}`));
      }

      case "issues_create": {
        const { companyId, ...issueData } = args as {
          companyId: string;
          title: string;
          description?: string;
          priority?: string;
          assigneeAgentId?: string;
          parentId?: string;
        };
        return ok(await apiFetch(`/companies/${companyId}/issues`, { method: "POST", body: issueData }));
      }

      case "issues_update": {
        const { issueId, ...patch } = args as {
          issueId: string;
          status?: string;
          assigneeAgentId?: string;
          priority?: string;
          title?: string;
          description?: string;
        };
        return ok(await apiFetch(`/issues/${issueId}`, { method: "PATCH", body: patch }));
      }

      case "issues_comment": {
        const { issueId, body } = args as { issueId: string; body: string };
        return ok(await apiFetch(`/issues/${issueId}/comments`, { method: "POST", body: { body } }));
      }

      case "issues_comments": {
        const { issueId } = args as { issueId: string };
        return ok(await apiFetch(`/issues/${issueId}/comments`));
      }

      // ── Runs ─────────────────────────────────────────────────────────────
      case "runs_list": {
        const { companyId, agentId, limit } = args as {
          companyId: string;
          agentId?: string;
          limit?: number;
        };
        const params = new URLSearchParams();
        if (agentId) params.set("agentId", agentId);
        if (limit) params.set("limit", String(limit));
        return ok(await apiFetch(`/companies/${companyId}/heartbeat-runs?${params}`));
      }

      case "runs_get": {
        const { runId } = args as { runId: string };
        return ok(await apiFetch(`/heartbeat-runs/${runId}`));
      }

      case "runs_cancel": {
        const { runId, reason } = args as { runId: string; reason?: string };
        return ok(await apiFetch(`/heartbeat-runs/${runId}/cancel`, { method: "POST", body: { reason } }));
      }

      // ── Approvals ────────────────────────────────────────────────────────
      case "approvals_list": {
        const { companyId } = args as { companyId: string };
        return ok(await apiFetch(`/companies/${companyId}/approvals`));
      }

      case "approvals_decide": {
        const { approvalId, decision, reason } = args as {
          approvalId: string;
          decision: "approved" | "rejected";
          reason?: string;
        };
        return ok(await apiFetch(`/approvals/${approvalId}`, { method: "PATCH", body: { status: decision, reason } }));
      }

      // ── Platform Status ──────────────────────────────────────────────────
      case "platform_status":
        return ok(await apiFetch("/health"));

      default:
        return { content: [{ type: "text" as const, text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (e) {
    return err(e);
  }
});

export async function startMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Paperclip MCP server running on stdio");
}
