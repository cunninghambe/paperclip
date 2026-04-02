export const type = "openclaw_gateway";
export const label = "OpenClaw Gateway";

export const models: { id: string; label: string }[] = [
  { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "anthropic/claude-opus-4-6", label: "Claude Opus 4.6" },
  { id: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { id: "openai/gpt-4o", label: "GPT-4o" },
  { id: "openai/o3-mini", label: "o3-mini" },
  { id: "google/gemini-2.5-pro-preview", label: "Gemini 2.5 Pro" },
  { id: "google/gemini-2.5-flash-preview:thinking", label: "Gemini 2.5 Flash (Thinking)" },
  { id: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3 (Free)" },
  { id: "meta-llama/llama-4-maverick:free", label: "Llama 4 Maverick (Free)" },
];

export const agentConfigurationDoc = `# openclaw_gateway agent configuration

Adapter: openclaw_gateway

Use when:
- You want Paperclip to invoke OpenClaw over the Gateway WebSocket protocol.
- You want native gateway auth/connect semantics instead of HTTP /v1/responses or /hooks/*.

Don't use when:
- You only expose OpenClaw HTTP endpoints.
- Your deployment does not permit outbound WebSocket access from the Paperclip server.

Core fields:
- url (string, required): OpenClaw gateway WebSocket URL (ws:// or wss://)
- headers (object, optional): handshake headers; supports x-openclaw-token / x-openclaw-auth
- authToken (string, optional): shared gateway token override
- password (string, optional): gateway shared password, if configured

Gateway connect identity fields:
- clientId (string, optional): gateway client id (default gateway-client)
- clientMode (string, optional): gateway client mode (default backend)
- clientVersion (string, optional): client version string
- role (string, optional): gateway role (default operator)
- scopes (string[] | comma string, optional): gateway scopes (default ["operator.admin"])
- disableDeviceAuth (boolean, optional): disable signed device payload in connect params (default false)

Request behavior fields:
- payloadTemplate (object, optional): additional fields merged into gateway agent params
- workspaceRuntime (object, optional): reserved workspace runtime metadata; workspace runtime services are manually controlled from the workspace UI and are not auto-started by heartbeats
- timeoutSec (number, optional): adapter timeout in seconds (default 120)
- waitTimeoutMs (number, optional): agent.wait timeout override (default timeoutSec * 1000)
- autoPairOnFirstConnect (boolean, optional): on first "pairing required", attempt device.pair.list/device.pair.approve via shared auth, then retry once (default true)
- paperclipApiUrl (string, optional): absolute Paperclip base URL advertised in wake text

Session routing fields:
- sessionKeyStrategy (string, optional): issue (default), fixed, or run
- sessionKey (string, optional): fixed session key when strategy=fixed (default paperclip)

Standard outbound payload additions:
- paperclip (object): standardized Paperclip context added to every gateway agent request
- paperclip.workspace (object, optional): resolved execution workspace for this run
- paperclip.workspaces (array, optional): additional workspace hints Paperclip exposed to the run
- paperclip.workspaceRuntime (object, optional): reserved workspace runtime metadata when explicitly supplied outside normal heartbeat execution

Standard result metadata supported:
- meta.runtimeServices (array, optional): normalized adapter-managed runtime service reports
- meta.previewUrl (string, optional): shorthand single preview URL
- meta.previewUrls (string[], optional): shorthand multiple preview URLs
`;
