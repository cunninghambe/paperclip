import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import type { DiffFile } from "../../api/execution-workspaces";

interface DiffViewerProps {
  files: DiffFile[];
  stats: { additions: number; deletions: number; filesChanged: number };
  className?: string;
}

const STATUS_BADGE: Record<DiffFile["status"], string> = {
  added: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  modified: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  deleted: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  renamed: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
};

function patchLineClassName(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---")) return "text-muted-foreground/50";
  if (line.startsWith("+")) return "bg-green-500/10 text-green-800 dark:text-green-300";
  if (line.startsWith("-")) return "bg-red-500/10 text-red-800 dark:text-red-300";
  if (line.startsWith("@@")) return "text-muted-foreground bg-muted/50 text-xs";
  return "";
}

function PatchLines({ patch }: { patch: string }) {
  return (
    <pre className="font-mono text-xs leading-relaxed overflow-x-auto p-0">
      {patch.split("\n").map((line, i) => (
        <div key={i} className={cn("px-4", patchLineClassName(line))}>
          {line || " "}
        </div>
      ))}
    </pre>
  );
}

function FileDiffSection({
  file,
  expanded,
  onToggle,
}: {
  file: DiffFile;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <div>
      <div
        className="flex items-center gap-2 px-4 py-2 hover:bg-accent/50 cursor-pointer border-b border-border"
        onClick={onToggle}
      >
        <Chevron className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0",
            STATUS_BADGE[file.status],
          )}
        >
          {file.status}
        </span>
        <span className="font-mono text-xs truncate flex-1 text-foreground">{file.path}</span>
        <span className="text-xs whitespace-nowrap shrink-0">
          <span className="text-green-600">+{file.additions}</span>{" "}
          <span className="text-red-600">-{file.deletions}</span>
        </span>
      </div>
      {expanded && file.patch && (
        <div className="border-b border-border">
          <PatchLines patch={file.patch} />
        </div>
      )}
    </div>
  );
}

export function DiffViewer({ files, stats, className }: DiffViewerProps) {
  const defaultExpanded = files.length <= 5;
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    () => new Set(defaultExpanded ? files.map((f) => f.path) : []),
  );

  function toggleFile(path: string) {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <div className={cn("rounded-md border border-border overflow-hidden", className)}>
      <div className="text-sm font-medium px-4 py-3 border-b border-border">
        {stats.filesChanged} files changed,{" "}
        <span className="text-green-600">+{stats.additions} additions</span>,{" "}
        <span className="text-red-600">-{stats.deletions} deletions</span>
      </div>
      <div>
        {files.map((file) => (
          <FileDiffSection
            key={file.path}
            file={file}
            expanded={expandedFiles.has(file.path)}
            onToggle={() => toggleFile(file.path)}
          />
        ))}
      </div>
    </div>
  );
}
