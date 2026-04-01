import type { AdapterConfigFieldsProps } from "../types";
import {
  Field,
  DraftInput,
} from "../../components/agent-config-primitives";
import { ChoosePathButton } from "../../components/PathInstructionsModal";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

const inboxDirHint =
  "Directory where Paperclip writes wake messages. Hermes watches this directory. Defaults to /workspace/.hermes/inbox";

const outboxDirHint =
  "Directory where Hermes writes response files. Paperclip polls here. Defaults to /workspace/.hermes/outbox";

const pidFileHint =
  "Path to the Hermes daemon PID file. Used for process liveness checks (kill -0). Defaults to ~/.hermes/hermes.pid";

const externalDirsHint =
  "Comma-separated list of platform skill directories to expose to Hermes (e.g. /platform/skills/). Hermes agents can access but not modify these skills.";

// CreateConfigValues is the base type but our adapter uses custom adapterConfig fields.
// In create mode we store directly in adapterConfig via set(); in edit mode via mark().
// We use a loose cast for create-mode values to avoid TypeScript coupling.

function getString(obj: Record<string, unknown> | null | undefined, key: string): string {
  if (!obj) return "";
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

export function HermesGatewayConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createValues = values as unknown as Record<string, unknown> | null;

  return (
    <>
      <Field label="Inbox directory" hint={inboxDirHint}>
        <div className="flex items-center gap-2">
          <DraftInput
            value={
              isCreate
                ? getString(createValues, "inboxDir")
                : eff("adapterConfig", "inboxDir", String(config.inboxDir ?? ""))
            }
            onCommit={(v) => {
              if (isCreate) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (set as any)?.({ inboxDir: v || undefined });
              } else {
                mark("adapterConfig", "inboxDir", v || undefined);
              }
            }}
            immediate
            className={inputClass}
            placeholder="/workspace/.hermes/inbox"
          />
          <ChoosePathButton />
        </div>
      </Field>

      <Field label="Outbox directory" hint={outboxDirHint}>
        <div className="flex items-center gap-2">
          <DraftInput
            value={
              isCreate
                ? getString(createValues, "outboxDir")
                : eff("adapterConfig", "outboxDir", String(config.outboxDir ?? ""))
            }
            onCommit={(v) => {
              if (isCreate) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (set as any)?.({ outboxDir: v || undefined });
              } else {
                mark("adapterConfig", "outboxDir", v || undefined);
              }
            }}
            immediate
            className={inputClass}
            placeholder="/workspace/.hermes/outbox"
          />
          <ChoosePathButton />
        </div>
      </Field>

      <Field label="PID file" hint={pidFileHint}>
        <div className="flex items-center gap-2">
          <DraftInput
            value={
              isCreate
                ? getString(createValues, "pidFile")
                : eff("adapterConfig", "pidFile", String(config.pidFile ?? ""))
            }
            onCommit={(v) => {
              if (isCreate) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (set as any)?.({ pidFile: v || undefined });
              } else {
                mark("adapterConfig", "pidFile", v || undefined);
              }
            }}
            immediate
            className={inputClass}
            placeholder="~/.hermes/hermes.pid"
          />
          <ChoosePathButton />
        </div>
      </Field>

      <Field label="Platform skill directories (external_dirs)" hint={externalDirsHint}>
        <DraftInput
          value={
            isCreate
              ? getString(createValues, "externalDirs")
              : eff(
                  "adapterConfig",
                  "externalDirs",
                  (() => {
                    const v = config.externalDirs;
                    if (Array.isArray(v)) return v.join(", ");
                    return String(v ?? "");
                  })(),
                )
          }
          onCommit={(v) => {
            const dirs = v
              ? v
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : undefined;
            if (isCreate) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (set as any)?.({ externalDirs: dirs && dirs.length > 0 ? dirs.join(", ") : undefined });
            } else {
              mark("adapterConfig", "externalDirs", dirs && dirs.length > 0 ? dirs : undefined);
            }
          }}
          immediate
          className={inputClass}
          placeholder="/platform/skills/"
        />
      </Field>
    </>
  );
}
