import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { executionWorkspaceService } from "../services/index.js";
import { assertCompanyAccess } from "./authz.js";
import { badRequest, notFound } from "../errors.js";

const execFileAsync = promisify(execFile);
const ONE_MB = 1024 * 1024;

// ── Types ────────────────────────────────────────────────────────────────────

interface FileEntry {
  name: string;
  path: string;
  kind: "file" | "dir" | "symlink";
  size: number;
  modifiedAt: string;
}

interface FileContent {
  path: string;
  content: string;
  size: number;
  binary: boolean;
  language: string;
}

interface DiffFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  oldPath?: string;
  patch: string;
}

interface WorkspaceDiff {
  baseRef: string;
  headRef: string;
  files: DiffFile[];
  stats: { additions: number; deletions: number; filesChanged: number };
}

interface GitFileStatus {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed" | "untracked";
  staged: boolean;
}

// ── Security ─────────────────────────────────────────────────────────────────

function resolveWorkspacePath(cwd: string, relativePath: string): string {
  if (!relativePath || relativePath.includes("\0")) {
    throw badRequest("Invalid path");
  }
  const resolved = path.resolve(cwd, relativePath);
  if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
    throw badRequest("Path outside workspace");
  }
  return resolved;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectLanguage(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "typescript", ".tsx": "tsx", ".js": "javascript", ".jsx": "jsx",
    ".py": "python", ".rs": "rust", ".go": "go", ".java": "java",
    ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".md": "markdown",
    ".html": "html", ".css": "css", ".scss": "scss", ".sql": "sql",
    ".sh": "shell", ".bash": "shell", ".toml": "toml", ".xml": "xml",
  };
  return map[ext] ?? "plaintext";
}

function isBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, 8192);
  return sample.includes(0);
}

function parseNumstat(output: string): Map<string, { additions: number; deletions: number }> {
  const stats = new Map<string, { additions: number; deletions: number }>();
  for (const line of output.split("\n")) {
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const additions = parseInt(parts[0] ?? "-", 10);
    const deletions = parseInt(parts[1] ?? "-", 10);
    const filePath = parts[2] ?? "";
    stats.set(filePath, {
      additions: isNaN(additions) ? 0 : additions,
      deletions: isNaN(deletions) ? 0 : deletions,
    });
  }
  return stats;
}

function parseDiffPatches(rawDiff: string, stats: Map<string, { additions: number; deletions: number }>): DiffFile[] {
  const chunks = rawDiff.split(/(?=^diff --git )/m).filter(Boolean);
  return chunks.map((chunk): DiffFile => {
    const headerMatch = /^diff --git a\/(.*?) b\/(.*)$/m.exec(chunk);
    const bPath = headerMatch?.[2] ?? "";
    const aPath = headerMatch?.[1] ?? "";
    const fileStat = stats.get(bPath) ?? stats.get(aPath) ?? { additions: 0, deletions: 0 };

    let status: DiffFile["status"] = "modified";
    let oldPath: string | undefined;
    if (/^new file mode/m.test(chunk)) status = "added";
    else if (/^deleted file mode/m.test(chunk)) status = "deleted";
    else if (/^rename from /m.test(chunk)) {
      status = "renamed";
      const fromMatch = /^rename from (.+)$/m.exec(chunk);
      oldPath = fromMatch?.[1];
    }

    return { path: bPath, status, additions: fileStat.additions, deletions: fileStat.deletions, ...(oldPath ? { oldPath } : {}), patch: chunk };
  });
}

function parsePortcelain(output: string): GitFileStatus[] {
  const results: GitFileStatus[] = [];
  const entries = output.split("\0").filter(Boolean);
  for (const entry of entries) {
    if (entry.length < 3) continue;
    const xy = entry.slice(0, 2);
    const filePath = entry.slice(3);
    const x = xy[0] ?? " ";
    const y = xy[1] ?? " ";

    const statusMap: Record<string, GitFileStatus["status"]> = {
      "M": "modified", "A": "added", "D": "deleted", "R": "renamed",
    };

    if (x === "?" && y === "?") {
      results.push({ path: filePath, status: "untracked", staged: false });
    } else {
      if (x !== " " && x !== "?") {
        results.push({ path: filePath, status: statusMap[x] ?? "modified", staged: true });
      }
      if (y !== " " && y !== "?") {
        results.push({ path: filePath, status: statusMap[y] ?? "modified", staged: false });
      }
    }
  }
  return results;
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function workspaceFilesRoutes(db: Db) {
  const router = Router();
  const svc = executionWorkspaceService(db);

  router.get("/execution-workspaces/:id/files", async (req, res) => {
    const workspace = await svc.getById(req.params.id);
    if (!workspace) throw notFound("Execution workspace not found");
    assertCompanyAccess(req, workspace.companyId);
    if (!workspace.cwd) throw badRequest("Workspace has no local path");

    const relativePath = (req.query.path as string | undefined) ?? ".";
    const target = resolveWorkspacePath(workspace.cwd, relativePath);
    const entries = await fsp.readdir(target, { withFileTypes: true });

    const files: FileEntry[] = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(target, entry.name);
        const stat = await fsp.stat(entryPath);
        const rel = path.relative(workspace.cwd!, entryPath);
        const kind = entry.isSymbolicLink() ? "symlink" : entry.isDirectory() ? "dir" : "file";
        return { name: entry.name, path: rel, kind, size: stat.size, modifiedAt: stat.mtime.toISOString() };
      }),
    );

    res.json(files);
  });

  router.get("/execution-workspaces/:id/files/content", async (req, res) => {
    const workspace = await svc.getById(req.params.id);
    if (!workspace) throw notFound("Execution workspace not found");
    assertCompanyAccess(req, workspace.companyId);
    if (!workspace.cwd) throw badRequest("Workspace has no local path");

    const relativePath = req.query.path as string | undefined;
    if (!relativePath) throw badRequest("path query parameter required");
    const target = resolveWorkspacePath(workspace.cwd, relativePath);

    const stat = await fsp.stat(target);
    if (stat.isDirectory()) throw badRequest("Path is a directory");

    const readSize = Math.min(stat.size, ONE_MB);
    const fd = await fsp.open(target, "r");
    const buf = Buffer.alloc(readSize);
    try {
      await fd.read(buf, 0, readSize, 0);
    } finally {
      await fd.close();
    }

    const binary = isBinary(buf);
    const content = binary ? "" : buf.toString("utf-8");
    const result: FileContent = { path: relativePath, content, size: stat.size, binary, language: detectLanguage(path.basename(target)) };
    res.json(result);
  });

  router.get("/execution-workspaces/:id/files/download", async (req, res) => {
    const workspace = await svc.getById(req.params.id);
    if (!workspace) throw notFound("Execution workspace not found");
    assertCompanyAccess(req, workspace.companyId);
    if (!workspace.cwd) throw badRequest("Workspace has no local path");

    const relativePath = req.query.path as string | undefined;
    if (!relativePath) throw badRequest("path query parameter required");
    const target = resolveWorkspacePath(workspace.cwd, relativePath);

    const stat = await fsp.stat(target);
    const basename = path.basename(target);

    if (stat.isDirectory()) {
      res.setHeader("Content-Disposition", `attachment; filename="${basename}.tar.gz"`);
      res.setHeader("Content-Type", "application/gzip");
      const tar = execFile("tar", ["-czf", "-", "-C", path.dirname(target), basename]);
      tar.stdout?.pipe(res);
      tar.on("error", (err) => { if (!res.headersSent) res.destroy(err); });
    } else {
      res.setHeader("Content-Disposition", `attachment; filename="${basename}"`);
      res.setHeader("Content-Type", "application/octet-stream");
      fs.createReadStream(target).pipe(res);
    }
  });

  router.get("/execution-workspaces/:id/git/diff", async (req, res) => {
    const workspace = await svc.getById(req.params.id);
    if (!workspace) throw notFound("Execution workspace not found");
    assertCompanyAccess(req, workspace.companyId);
    if (!workspace.cwd) throw badRequest("Workspace has no local path");

    const baseRef = workspace.baseRef;
    if (!baseRef) throw badRequest("Workspace has no baseRef");
    const cwd = workspace.cwd;

    const [numstatResult, patchResult, headResult] = await Promise.all([
      execFileAsync("git", ["diff", "--numstat", `${baseRef}...HEAD`], { cwd }),
      execFileAsync("git", ["diff", `${baseRef}...HEAD`], { cwd, maxBuffer: 5 * 1024 * 1024 }),
      execFileAsync("git", ["rev-parse", "HEAD"], { cwd }),
    ]);

    const statsMap = parseNumstat(numstatResult.stdout);
    const diffFiles = parseDiffPatches(patchResult.stdout, statsMap);

    const totalStats = diffFiles.reduce(
      (acc, f) => ({ additions: acc.additions + f.additions, deletions: acc.deletions + f.deletions, filesChanged: acc.filesChanged + 1 }),
      { additions: 0, deletions: 0, filesChanged: 0 },
    );

    const result: WorkspaceDiff = { baseRef, headRef: headResult.stdout.trim(), files: diffFiles, stats: totalStats };
    res.json(result);
  });

  router.get("/execution-workspaces/:id/git/status", async (req, res) => {
    const workspace = await svc.getById(req.params.id);
    if (!workspace) throw notFound("Execution workspace not found");
    assertCompanyAccess(req, workspace.companyId);
    if (!workspace.cwd) throw badRequest("Workspace has no local path");

    const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1", "-z"], { cwd: workspace.cwd });
    res.json(parsePortcelain(stdout));
  });

  return router;
}
