import type { ExecutionWorkspace, ExecutionWorkspaceCloseReadiness, WorkspaceOperation } from "@paperclipai/shared";
import { api } from "./client";

export interface FileEntry {
  name: string;
  path: string;
  kind: "file" | "dir" | "symlink";
  size: number;
  modifiedAt: string;
}

export interface FileContent {
  path: string;
  content: string;
  size: number;
  binary: boolean;
  language: string;
}

export interface WorkspaceDiff {
  baseRef: string;
  headRef: string;
  files: DiffFile[];
  stats: { additions: number; deletions: number; filesChanged: number };
}

export interface DiffFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  oldPath?: string;
  patch: string;
}

export interface GitFileStatus {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed" | "untracked";
  staged: boolean;
}

export const executionWorkspacesApi = {
  list: (
    companyId: string,
    filters?: {
      projectId?: string;
      projectWorkspaceId?: string;
      issueId?: string;
      status?: string;
      reuseEligible?: boolean;
    },
  ) => {
    const params = new URLSearchParams();
    if (filters?.projectId) params.set("projectId", filters.projectId);
    if (filters?.projectWorkspaceId) params.set("projectWorkspaceId", filters.projectWorkspaceId);
    if (filters?.issueId) params.set("issueId", filters.issueId);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.reuseEligible) params.set("reuseEligible", "true");
    const qs = params.toString();
    return api.get<ExecutionWorkspace[]>(`/companies/${companyId}/execution-workspaces${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => api.get<ExecutionWorkspace>(`/execution-workspaces/${id}`),
  getCloseReadiness: (id: string) =>
    api.get<ExecutionWorkspaceCloseReadiness>(`/execution-workspaces/${id}/close-readiness`),
  listWorkspaceOperations: (id: string) =>
    api.get<WorkspaceOperation[]>(`/execution-workspaces/${id}/workspace-operations`),
  controlRuntimeServices: (id: string, action: "start" | "stop" | "restart") =>
    api.post<{ workspace: ExecutionWorkspace; operation: WorkspaceOperation }>(
      `/execution-workspaces/${id}/runtime-services/${action}`,
      {},
    ),
  update: (id: string, data: Record<string, unknown>) => api.patch<ExecutionWorkspace>(`/execution-workspaces/${id}`, data),
  listFiles: (id: string, dirPath: string = ".") =>
    api.get<FileEntry[]>(`/execution-workspaces/${id}/files?path=${encodeURIComponent(dirPath)}`),
  getFileContent: (id: string, filePath: string) =>
    api.get<FileContent>(`/execution-workspaces/${id}/files/content?path=${encodeURIComponent(filePath)}`),
  getGitDiff: (id: string) =>
    api.get<WorkspaceDiff>(`/execution-workspaces/${id}/git/diff`),
  getGitStatus: (id: string) =>
    api.get<GitFileStatus[]>(`/execution-workspaces/${id}/git/status`),
  downloadUrl: (id: string, filePath: string) =>
    `/api/execution-workspaces/${id}/files/download?path=${encodeURIComponent(filePath)}`,
};
