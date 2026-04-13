import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { FileText, Folder, FolderOpen, GitBranch, Loader2 } from "lucide-react";
import { FileViewer } from "@/components/workspace-browser/FileViewer";
import { DiffViewer } from "@/components/workspace-browser/DiffViewer";
import { executionWorkspacesApi, type FileEntry } from "@/api/execution-workspaces";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";

type Tab = "files" | "changes" | "runs";

// ── File tree ─────────────────────────────────────────────────────────────────

function FileTreeNode({
  entry,
  workspaceId,
  selectedPath,
  onSelect,
  depth,
}: {
  entry: FileEntry;
  workspaceId: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const indent = depth * 16 + 12;

  const { data: children } = useQuery({
    queryKey: queryKeys.executionWorkspaces.files(workspaceId, entry.path),
    queryFn: () => executionWorkspacesApi.listFiles(workspaceId, entry.path),
    enabled: entry.kind === "dir" && expanded,
  });

  if (entry.kind === "dir") {
    const Icon = expanded ? FolderOpen : Folder;
    return (
      <div>
        <button
          type="button"
          className="flex w-full items-center gap-2 py-1 pr-3 text-sm text-muted-foreground hover:bg-accent/30 hover:text-foreground"
          style={{ paddingLeft: indent }}
          onClick={() => setExpanded((v) => !v)}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{entry.name}</span>
        </button>
        {expanded && children?.map((child) => (
          <FileTreeNode
            key={child.path}
            entry={child}
            workspaceId={workspaceId}
            selectedPath={selectedPath}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 py-1 pr-3 text-sm text-muted-foreground hover:bg-accent/30 hover:text-foreground",
        entry.path === selectedPath && "bg-accent/20 text-foreground",
      )}
      style={{ paddingLeft: indent }}
      onClick={() => onSelect(entry.path)}
    >
      <FileText className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{entry.name}</span>
    </button>
  );
}

function FileTreeSidebar({
  workspaceId,
  selectedPath,
  onSelect,
}: {
  workspaceId: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const { data: rootEntries, isLoading, isError } = useQuery({
    queryKey: queryKeys.executionWorkspaces.files(workspaceId, "."),
    queryFn: () => executionWorkspacesApi.listFiles(workspaceId, "."),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !rootEntries) {
    return <p className="px-3 py-4 text-xs text-destructive">Failed to load files</p>;
  }

  return (
    <div className="py-1">
      {rootEntries.map((entry) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          workspaceId={workspaceId}
          selectedPath={selectedPath}
          onSelect={onSelect}
          depth={0}
        />
      ))}
    </div>
  );
}

// ── Tab content panels ────────────────────────────────────────────────────────

function FilesPanel({
  workspaceId,
  selectedFile,
}: {
  workspaceId: string;
  selectedFile: string | null;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.executionWorkspaces.fileContent(workspaceId, selectedFile ?? ""),
    queryFn: () => executionWorkspacesApi.getFileContent(workspaceId, selectedFile!),
    enabled: Boolean(selectedFile),
  });

  if (!selectedFile) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a file to view
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        Failed to load file content
      </div>
    );
  }

  return (
    <FileViewer
      content={data.content}
      language={data.language}
      filePath={data.path}
      binary={data.binary}
      workspaceId={workspaceId}
      className="h-full"
    />
  );
}

function ChangesPanel({ workspaceId }: { workspaceId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.executionWorkspaces.gitDiff(workspaceId),
    queryFn: () => executionWorkspacesApi.getGitDiff(workspaceId),
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No git diff available
      </div>
    );
  }

  if (data.files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No changes
      </div>
    );
  }

  return <DiffViewer files={data.files} stats={data.stats} className="h-full overflow-auto" />;
}

function RunsPanel({ workspaceId }: { workspaceId: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
      <p>Run transcripts are shown on the agent detail page.</p>
      <Link
        to={`/execution-workspaces/${workspaceId}`}
        className="text-sm underline underline-offset-2 hover:text-foreground"
      >
        View workspace detail
      </Link>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CLASSES: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  idle: "bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300",
  in_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  archived: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  cleanup_failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_CLASSES[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function WorkspaceBrowser() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setBreadcrumbs } = useBreadcrumbs();

  const [activeTab, setActiveTab] = useState<Tab>("files");
  const [selectedFile, setSelectedFile] = useState<string | null>(
    () => searchParams.get("file"),
  );

  const workspaceQuery = useQuery({
    queryKey: queryKeys.executionWorkspaces.detail(workspaceId!),
    queryFn: () => executionWorkspacesApi.get(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const workspace = workspaceQuery.data ?? null;

  useEffect(() => {
    if (!workspace) return;
    setBreadcrumbs([
      { label: "Workspaces" },
      { label: workspace.name, href: `/execution-workspaces/${workspace.id}` },
      { label: "Browse" },
    ]);
  }, [setBreadcrumbs, workspace]);

  function handleSelectFile(path: string) {
    setSelectedFile(path);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("file", path);
      return next;
    });
  }

  if (workspaceQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (workspaceQuery.isError || !workspace) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        Failed to load workspace
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "files", label: "Files" },
    { id: "changes", label: "Changes" },
    { id: "runs", label: "Runs" },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <h1 className="text-sm font-semibold">{workspace.name}</h1>
        {workspace.branchName && (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
            <GitBranch className="h-3 w-3" />
            {workspace.branchName}
          </span>
        )}
        <StatusBadge status={workspace.status} />
        <div className="ml-auto flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "rounded px-3 py-1.5 text-sm transition-colors",
                activeTab === tab.id
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <div className="w-72 shrink-0 overflow-y-auto border-r border-border">
          <FileTreeSidebar
            workspaceId={workspace.id}
            selectedPath={selectedFile}
            onSelect={handleSelectFile}
          />
        </div>

        {/* Content area */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-4">
          {activeTab === "files" && (
            <FilesPanel workspaceId={workspace.id} selectedFile={selectedFile} />
          )}
          {activeTab === "changes" && <ChangesPanel workspaceId={workspace.id} />}
          {activeTab === "runs" && <RunsPanel workspaceId={workspace.id} />}
        </div>
      </div>
    </div>
  );
}
