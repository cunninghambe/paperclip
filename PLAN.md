# Plan: Paperclip MCP Server (Task 19)

## Summary
Create a Model Context Protocol (MCP) server that wraps the Paperclip REST API, exposing 22 tools via stdio transport. The MCP server runs as a standalone Node process, makes HTTP calls to the running Paperclip server, and is launchable via `paperclipai mcp`.

---

## Phase 1: Auth + MCP Server Core (server package)

**Description:** Add `@modelcontextprotocol/sdk` dependency, create the auth resolution module, the MCP server with all 22 tool registrations, and the stdio entry point.

### Files to Create

#### 1. `server/src/mcp/auth.ts` (~50 lines)
Auth resolution with 3-tier fallback:
```ts
export interface McpAuthConfig {
  apiBase: string;   // default http://localhost:3100
  apiKey: string;
}

export function resolveAuth(): McpAuthConfig
```

**Resolution order:**
1. `PAPERCLIP_API_KEY` env var → `apiKey`; `PAPERCLIP_API_URL` env var → `apiBase`
2. `PAPERCLIP_SESSION_TOKEN` env var → `apiKey` (alias for session-based auth)
3. Read `~/.paperclip-mcp.json` → `{ apiBase?, apiKey? }`
4. Throw descriptive error if no key found

`apiBase` defaults to `PAPERCLIP_API_URL` || config file || `http://localhost:3100`.

Internal `apiFetch(path, init?)` helper:
- Wraps `fetch(apiBase + path, { headers: { Authorization: Bearer, Content-Type: application/json }, ...init })`
- Parses JSON response; throws on non-OK with status + message
- Exported for use by server.ts

#### 2. `server/src/mcp/server.ts` (~400 lines)
Main MCP server with 22 tool registrations.

**Import pattern (SDK v1.x — verify at install time):**
```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
```

**Export:**
```ts
export function createPaperclipMcpServer(auth: McpAuthConfig): McpServer
```

**22 tool registrations using `server.tool(name, description, schema, handler)`:**

| Tool | Method | API Path | Input Schema (Zod) |
|------|--------|----------|---------------------|
| `companies_list` | GET | `/api/companies` | `{}` (empty) |
| `companies_get` | GET | `/api/companies/:id` | `{ companyId: z.string() }` |
| `companies_create` | POST | `/api/companies` | `{ name: z.string(), issuePrefix: z.string().optional(), ... }` |
| `companies_update` | PATCH | `/api/companies/:id` | `{ companyId: z.string(), ...updateFields }` |
| `agents_list` | GET | `/api/companies/:companyId/agents` | `{ companyId: z.string() }` |
| `agents_get` | GET | `/api/agents/:id` | `{ agentId: z.string() }` |
| `agents_create` | POST | `/api/companies/:companyId/agents` | `{ companyId: z.string(), name: z.string(), role: z.string().optional(), ... }` |
| `agents_update` | PATCH | `/api/agents/:id` | `{ agentId: z.string(), ...updateFields }` |
| `agents_wakeup` | POST | `/api/agents/:id/wakeup` | `{ agentId: z.string(), issueId: z.string().optional(), message: z.string().optional() }` |
| `agents_lifecycle` | POST | `/api/agents/:id/:action` | `{ agentId: z.string(), action: z.enum(["pause","resume","terminate"]) }` |
| `issues_list` | GET | `/api/companies/:companyId/issues` | `{ companyId: z.string(), status?: z.string(), assigneeId?: z.string(), query?: z.string() }` |
| `issues_get` | GET | `/api/issues/:id` | `{ issueId: z.string() }` |
| `issues_create` | POST | `/api/companies/:companyId/issues` | `{ companyId: z.string(), title: z.string(), description?: z.string(), priority?: z.string(), ... }` |
| `issues_update` | PATCH | `/api/issues/:id` | `{ issueId: z.string(), ...updateFields }` |
| `issues_comment` | POST | `/api/issues/:id/comments` | `{ issueId: z.string(), body: z.string(), authorType?: z.string() }` |
| `issues_comments` | GET | `/api/issues/:id/comments` | `{ issueId: z.string() }` |
| `runs_list` | GET | `/api/companies/:companyId/heartbeat-runs` | `{ companyId: z.string(), agentId?: z.string(), limit?: z.number() }` |
| `runs_get` | GET | `/api/heartbeat-runs/:runId` | `{ runId: z.string() }` |
| `runs_cancel` | POST | `/api/heartbeat-runs/:runId/cancel` | `{ runId: z.string() }` |
| `approvals_list` | GET | `/api/companies/:companyId/approvals` | `{ companyId: z.string() }` |
| `approvals_decide` | POST | `/api/approvals/:id/:decision` | `{ approvalId: z.string(), decision: z.enum(["approve","reject"]), reason?: z.string() }` |
| `platform_status` | GET | `/api/health` | `{}` (empty) |

**Handler pattern (each tool):**
```ts
server.tool("companies_list", "List all companies", {}, async () => {
  const data = await apiFetch("/api/companies");
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});
```

**Error handling:** Wrap each handler in try/catch; on error return `{ content: [{ type: "text", text: errorMessage }], isError: true }`.

#### 3. `server/src/mcp/index.ts` (~15 lines)
Stdio entry point (run via `node dist/mcp/index.js` or `tsx src/mcp/index.ts`):
```ts
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveAuth } from "./auth.js";
import { createPaperclipMcpServer } from "./server.js";

const auth = resolveAuth();
const server = createPaperclipMcpServer(auth);
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Files to Modify

#### 4. `server/package.json`
Add dependency:
```json
"@modelcontextprotocol/sdk": "^1.29.0"
```

Note: The server already depends on `zod` 3.24.2. The SDK may need `zod/v4` — developer should check compatibility. If the SDK requires zod v4, use `zod` for tool schemas (the SDK auto-converts). If there's a conflict, use JSON Schema objects directly instead of Zod for tool input schemas.

### Acceptance Criteria
- [ ] `pnpm install` succeeds with new dependency
- [ ] `pnpm --filter @paperclipai/server build` compiles without errors
- [ ] `server/dist/mcp/index.js` exists after build
- [ ] Running `PAPERCLIP_API_KEY=test node server/dist/mcp/index.js` starts the MCP server (listens on stdin, no crash)
- [ ] `resolveAuth()` throws with clear message when no credentials configured
- [ ] `resolveAuth()` reads `~/.paperclip-mcp.json` as fallback
- [ ] All 22 tools are registered (verified by MCP `tools/list` handshake or unit tests)

### Dependencies
None — this is the foundation phase.

---

## Phase 2: CLI Command + Integration Wiring

**Description:** Add `paperclipai mcp` CLI command that starts the MCP server process, register it in the CLI entry point.

### Files to Create

#### 1. `cli/src/commands/mcp.ts` (~30 lines)
```ts
import type { Command } from "commander";

export function registerMcpCommand(program: Command): void {
  program
    .command("mcp")
    .description("Start the Paperclip MCP server (stdio transport)")
    .action(async () => {
      // Dynamic import to avoid pulling MCP deps into CLI bundle
      const { resolveAuth } = await import("@paperclipai/server/src/mcp/auth.js");
      const { createPaperclipMcpServer } = await import("@paperclipai/server/src/mcp/server.js");
      const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");

      const auth = resolveAuth();
      const server = createPaperclipMcpServer(auth);
      const transport = new StdioServerTransport();
      await server.connect(transport);
    });
}
```

**Alternative approach (simpler, preferred if dynamic imports break esbuild):** The CLI command can `fork()` or `execFile("node", [serverMcpEntryPath])` to start the entry point, inheriting stdio and env vars. This cleanly avoids any bundling issues.

**Decision point for developer:** Check if `@paperclipai/server` is resolvable at runtime when using the built CLI. If the CLI's esbuild config marks it as external (it does — see `cli/esbuild.config.mjs`), the dynamic import approach works. Verify at build time.

### Files to Modify

#### 2. `cli/src/index.ts`
Add import + registration (follow existing pattern at lines 11-21, 133-141):
```ts
import { registerMcpCommand } from "./commands/mcp.js";
// ... after registerPluginCommands(program) on line 141:
registerMcpCommand(program);
```

### Acceptance Criteria
- [ ] `paperclipai mcp --help` prints description
- [ ] `PAPERCLIP_API_KEY=test paperclipai mcp` starts MCP server on stdio (no crash, responds to MCP protocol)
- [ ] `pnpm --filter paperclipai build` succeeds (CLI build includes mcp command)
- [ ] MCP server is usable from Claude Desktop config: `{ "command": "paperclipai", "args": ["mcp"] }`

### Dependencies
Phase 1 (server MCP module must exist).

---

## Phase 3: Tests

**Description:** Comprehensive vitest test suite for auth resolution and all 22 MCP tools, using mocked HTTP calls.

### Files to Create

#### 1. `server/src/__tests__/mcp-auth.test.ts` (~80 lines)
Tests for `resolveAuth()`:

| Test | Description |
|------|-------------|
| reads PAPERCLIP_API_KEY env var | Set env, call resolveAuth, verify apiKey |
| reads PAPERCLIP_SESSION_TOKEN env var | Set env, call resolveAuth, verify apiKey |
| PAPERCLIP_API_KEY takes precedence over SESSION_TOKEN | Both set, verify API_KEY wins |
| reads PAPERCLIP_API_URL for apiBase | Set env, verify apiBase |
| falls back to ~/.paperclip-mcp.json | Mock `fs.readFileSync`, verify reads config |
| throws when no credentials found | No env, no file → descriptive error |
| defaults apiBase to http://localhost:3100 | No PAPERCLIP_API_URL, no config → default |

**Mocking pattern (match existing `cli/src/__tests__/http.test.ts`):**
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// vi.mock("node:fs") for config file reads
// Process.env manipulation via direct assignment + cleanup in afterEach
```

#### 2. `server/src/__tests__/mcp-server.test.ts` (~300 lines)
Tests for all 22 tools + server creation.

**Test approach:**
- Mock `global.fetch` via `vi.stubGlobal("fetch", mockFetch)` (matches http.test.ts pattern)
- Create server via `createPaperclipMcpServer(mockAuth)`
- For each tool, verify correct HTTP method + path + body

**Testing MCP tool calls — two options:**
1. **Preferred:** Use MCP's `InMemoryTransport` for client-server in-process testing:
   ```ts
   import { Client } from "@modelcontextprotocol/sdk/client/index.js";
   import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
   ```
2. **Fallback:** Extract handler functions from server.ts and test them directly.

**25 total tests:**
| Test group | Count |
|-----------|-------|
| companies_* (list, get, create, update) | 4 |
| agents_* (list, get, create, update, wakeup, lifecycle) | 6 |
| issues_* (list, get, create, update, comment, comments) | 6 |
| runs_* (list, get, cancel) | 3 |
| approvals_* (list, decide) | 2 |
| platform_status | 1 |
| error handling (API 500 → isError:true) | 1 |
| auth header sent correctly | 1 |
| server has exactly 22 tools registered | 1 |
| **Total** | **25** |

### Acceptance Criteria
- [ ] `pnpm --filter @paperclipai/server test` passes all new tests
- [ ] All 22 tools have at least 1 test verifying HTTP method + path
- [ ] Auth tests cover all 3 resolution tiers + error case
- [ ] No test requires a running Paperclip server (all HTTP mocked)
- [ ] Tests run in <5s total

### Dependencies
Phase 1 (imports auth.ts + server.ts).

---

## Gotchas & Risks

**G1: MCP SDK import paths.** The SDK v1.x uses deep subpath imports (`@modelcontextprotocol/sdk/server/mcp.js`). The newer v2 may use `@modelcontextprotocol/server` as a separate package. Developer should check at `pnpm add` time and adjust imports accordingly.

**G2: Zod version compatibility.** The SDK may require `zod/v4` while the project uses zod 3.24.2. If so, pass raw JSON Schema objects to `server.tool()` instead of Zod schemas, or install zod v4 as a secondary dep. The SDK's `tool()` method accepts both Zod schemas and raw JSON Schema.

**G3: CLI esbuild externals.** `@paperclipai/server` is marked external in `cli/esbuild.config.mjs`, so dynamic imports from the server package work at runtime. But `@modelcontextprotocol/sdk` is NOT in CLI externals — all MCP imports must go through the server package, not directly from CLI code.

**G4: ESM `.js` extensions.** All local imports must use `.js` extension (NodeNext module resolution). Enforced project-wide.

**G5: heartbeat-runs = "runs".** The task spec says `runs_list/get/cancel` — these map to heartbeat-run API routes: `/api/companies/:companyId/heartbeat-runs`, `/api/heartbeat-runs/:runId`, `/api/heartbeat-runs/:runId/cancel`.

**G6: agents_lifecycle dynamic routing.** The `action` param maps to separate routes: `/agents/:id/pause`, `/agents/:id/resume`, `/agents/:id/terminate`.

**G7: approvals_decide routing.** Maps to `/api/approvals/:id/approve` or `/api/approvals/:id/reject` based on `decision` param.

**G8: Config file path.** `~/.paperclip-mcp.json` must use `os.homedir()` + `path.join()`, not hardcoded `~`.
