/**
 * Hermes Gateway adapter for Paperclip.
 *
 * Communicates with an already-running Hermes daemon via a file-based
 * inbox/outbox protocol. This is the "gateway" variant — Hermes runs
 * as a long-lived process and Paperclip deposits wake messages as JSON
 * files in a watched inbox directory.
 *
 * Compare to `hermes_local` (hermes-paperclip-adapter) which spawns a
 * Hermes CLI subprocess for each run.
 *
 * @packageDocumentation
 */

import { ADAPTER_TYPE, ADAPTER_LABEL } from "./shared/constants.js";

export const type = ADAPTER_TYPE;
export const label = ADAPTER_LABEL;

/**
 * Models available through the Hermes Gateway.
 *
 * Hermes supports any model via its configured provider. Use detectModel()
 * or manual configuration — there are no curated placeholder IDs here.
 */
export const models: { id: string; label: string }[] = [];

export const agentConfigurationDoc = `# hermes_gateway agent configuration

Adapter: hermes_gateway

Use when:
- Hermes Agent is already running as a long-lived daemon on the same host.
- You want Paperclip to communicate with it via file-based inbox/outbox messaging.
- You do NOT want Paperclip to spawn a new Hermes process per run.

Don't use when:
- You want Paperclip to start and stop Hermes for each heartbeat (use hermes_local instead).
- Hermes is running on a remote host without a shared filesystem.

## How it works

On each heartbeat wake:
1. Paperclip checks that Hermes is alive via kill(pid, 0) using the configured PID file.
2. Paperclip writes \`{runId}.json\` to the inbox directory (atomic: write-to-tmp then rename).
3. The Hermes daemon picks up the file and processes the task.
4. When done, Hermes writes \`{runId}.json\` to the outbox directory.
5. Paperclip reads the response, cleans up the outbox file, and completes the run.

## Configuration Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| inboxDir | string | /workspace/.hermes/inbox | Directory where Paperclip writes wake messages |
| outboxDir | string | /workspace/.hermes/outbox | Directory where Hermes writes response files |
| pidFile | string | ~/.hermes/hermes.pid | Path to the Hermes daemon PID file |
| timeoutSec | number | 120 | Execution timeout in seconds |
| pollIntervalMs | number | 500 | How often to poll outbox for response |
| externalDirs | string[] | [] | Platform skill directories to expose to Hermes via external_dirs |
| paperclipApiUrl | string | (auto) | Override for the Paperclip API base URL |

## Skills Integration

Use \`externalDirs\` to give Hermes agents read-only access to platform skills
(SearXNG, STT, G2G, GDP) without modifying their local ~/.hermes/skills/:

\`\`\`json
{
  "externalDirs": ["/platform/skills/"]
}
\`\`\`

Hermes's progressive skill disclosure means platform skills only load when needed.
Hermes agents can still create/edit/delete their own skills via the skill_manage tool —
the platform does not interfere with agent-managed skills.

## Inbox Message Format

\`\`\`json
{
  "runId": "...",
  "agentId": "...",
  "companyId": "...",
  "message": "Paperclip wake text with HTTP workflow instructions",
  "env": { "PAPERCLIP_RUN_ID": "...", "PAPERCLIP_AGENT_ID": "...", ... },
  "paperclip": { "runId": "...", "taskId": "...", ... },
  "externalDirs": ["/platform/skills/"],
  "timestamp": "2026-04-01T00:00:00.000Z"
}
\`\`\`

## Outbox Response Format

\`\`\`json
{
  "exitCode": 0,
  "summary": "Optional response text",
  "model": "optional-model-id",
  "provider": "hermes",
  "usage": { "inputTokens": 100, "outputTokens": 200 }
}
\`\`\`

## Liveness Check

No HTTP health endpoint. Paperclip uses \`kill(pid, 0)\` on the PID from the configured
PID file. Configure Hermes to write its PID: \`hermes serve --pid-file ~/.hermes/hermes.pid\`
`;
