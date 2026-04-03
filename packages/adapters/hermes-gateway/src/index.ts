export const type = "hermes_gateway";
export const label = "Hermes Gateway";

export const models: { id: string; label: string }[] = [
  { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "anthropic/claude-opus-4-6", label: "Claude Opus 4.6" },
  { id: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { id: "openai/gpt-4o", label: "GPT-4o" },
  { id: "openai/o3-mini", label: "o3-mini" },
  { id: "google/gemini-2.5-pro-preview", label: "Gemini 2.5 Pro" },
  { id: "google/gemini-2.5-flash-preview:thinking", label: "Gemini 2.5 Flash (Thinking)" },
  { id: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3 (Free)" },
  { id: "deepseek/deepseek-r1:free", label: "DeepSeek R1 (Free)" },
  { id: "qwen/qwen3.6-plus:free", label: "Qwen 3.6 Plus (Free)" },
  { id: "meta-llama/llama-4-maverick:free", label: "Llama 4 Maverick (Free)" },
  { id: "mistralai/mistral-small-3.1-24b-instruct:free", label: "Mistral Small 3.1 (Free)" },
];

export const agentConfigurationDoc = `# hermes_gateway agent configuration

Adapter: hermes_gateway

Use when:
- You want Paperclip to wake a Hermes agent via file-based messaging.
- The Hermes runtime is running locally and writes a pid file.
- You want skills to be accessible from the platform skills directory.

Don't use when:
- You want HTTP-based gateway communication (use openclaw_gateway instead).
- The Hermes runtime is remote (file-based messaging requires a shared filesystem).

Core fields:
- workspaceDir (string, optional): root directory for Hermes files (default /workspace or HERMES_WORKSPACE env)
- inboxDir (string, optional): inbox directory (default {workspaceDir}/.hermes/inbox)
- outboxDir (string, optional): outbox directory (default {workspaceDir}/.hermes/outbox)
- pidFile (string, optional): path to Hermes pid file (default {workspaceDir}/.hermes/hermes.pid)
- timeoutSec (number, optional): adapter timeout in seconds (default 120)
- pollIntervalMs (number, optional): interval to poll for response in ms (default 500)
- skipLivenessCheck (boolean, optional): skip kill -0 check (default false)
- paperclipApiUrl (string, optional): absolute Paperclip base URL advertised in wake text

Payload customization:
- payloadTemplate (object, optional): additional fields merged into the inbox wake message

Process wake flow:
1. Adapter checks Hermes process liveness via kill -0 <pid> (from pidFile).
2. Adapter writes {runId}.json to inboxDir with the wake message.
3. Adapter polls outboxDir/{runId}.json until response appears or timeout.
4. Hermes agent reads inbox, processes the task, writes outbox response.

Response file format (written by Hermes to outboxDir/{runId}.json):
{
  "runId": "...",
  "status": "ok" | "error" | "timeout",
  "summary": "agent response text",
  "exitCode": 0,
  "model": "claude-3-5-sonnet",
  "provider": "anthropic",
  "usage": { "inputTokens": 0, "outputTokens": 0 },
  "costUsd": 0.0,
  "completedAt": "ISO timestamp"
}

Skills configuration:
Set skills.external_dirs in ~/.hermes/config.yaml to point to the platform skills directory:
  skills:
    external_dirs:
      - /opt/autogeny-platform/skills
`;
