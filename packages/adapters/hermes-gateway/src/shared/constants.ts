/**
 * Shared constants for the Hermes Gateway adapter.
 *
 * The Hermes Gateway adapter communicates with an already-running Hermes
 * daemon via a file-based inbox/outbox protocol. This is the gateway variant
 * (as opposed to hermes_local which spawns Hermes CLI directly).
 */

export const ADAPTER_TYPE = "hermes_gateway" as const;
export const ADAPTER_LABEL = "Hermes Gateway";

/**
 * Default directory where Paperclip writes wake messages for the Hermes daemon.
 * The Hermes daemon watches this directory and picks up {runId}.json files.
 */
export const DEFAULT_INBOX_DIR = "/workspace/.hermes/inbox";

/**
 * Default directory where the Hermes daemon writes response files.
 * Paperclip polls this directory for {runId}.json response files.
 */
export const DEFAULT_OUTBOX_DIR = "/workspace/.hermes/outbox";

/**
 * Default path to the Hermes daemon PID file, used for liveness checks.
 * The adapter performs a kill(pid, 0) probe before writing to the inbox.
 */
export const DEFAULT_PID_FILE = "~/.hermes/hermes.pid";

/**
 * How often (ms) to poll the outbox directory for a response file.
 */
export const DEFAULT_POLL_INTERVAL_MS = 500;

/**
 * Default execution timeout in seconds.
 */
export const DEFAULT_TIMEOUT_SEC = 120;

/**
 * Regex used to validate run IDs before using them in file paths.
 * Prevents path traversal attacks via malformed run IDs.
 */
export const SAFE_RUN_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
