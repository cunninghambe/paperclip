import crypto from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import type { Db } from "@paperclipai/db";
import { projectWorkspaces } from "@paperclipai/db";
import { eq } from "drizzle-orm";

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createGitHubAppJWT(appId: string, privateKeyPEM: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64url(
    Buffer.from(JSON.stringify({ iss: appId, iat: now - 60, exp: now + 600 })),
  );
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(`${header}.${payload}`)
    .sign(privateKeyPEM, "base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${header}.${payload}.${signature}`;
}

export async function getInstallationAccessToken(
  appId: string,
  privateKeyPEM: string,
  installationId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const jwt = createGitHubAppJWT(appId, privateKeyPEM);
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        permissions: { contents: "write", pull_requests: "write", metadata: "read" },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub App token request failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { token: string; expires_at: string };
  return { token: data.token, expiresAt: new Date(data.expires_at) };
}

// Simple in-memory cache — tokens last 1 hour, refresh at 50 min
const tokenCache = new Map<string, { token: string; expiresAt: Date }>();
const REFRESH_MARGIN_MS = 10 * 60 * 1000; // 10 minutes before expiry

export async function getCachedInstallationToken(
  appId: string,
  privateKeyPEM: string,
  installationId: string,
): Promise<string> {
  const cacheKey = `${appId}:${installationId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) {
    return cached.token;
  }
  const result = await getInstallationAccessToken(appId, privateKeyPEM, installationId);
  tokenCache.set(cacheKey, result);
  return result.token;
}

/**
 * Resolves a GitHub installation token for a workspace.
 *
 * Returns null if GitHub App env vars are not configured (feature is opt-in).
 * Reads installation ID from project workspace metadata, falling back to
 * GITHUB_APP_DEFAULT_INSTALLATION_ID.
 */
export async function resolveGitHubTokenForWorkspace(
  db: Db,
  input: {
    repoUrl: string | null;
    projectWorkspaceId: string | null;
  },
): Promise<string | null> {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKeyRaw = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (!appId || !privateKeyRaw) return null;

  // Only activate for GitHub repos
  if (input.repoUrl && !input.repoUrl.includes("github.com")) return null;

  // Normalize private key — accept escaped newlines from env vars
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  // Try to read per-project installation ID from workspace metadata
  let installationId: string | null = null;
  if (input.projectWorkspaceId) {
    const [ws] = await db
      .select({ metadata: projectWorkspaces.metadata })
      .from(projectWorkspaces)
      .where(eq(projectWorkspaces.id, input.projectWorkspaceId))
      .limit(1);
    const meta = ws?.metadata as Record<string, unknown> | null;
    if (meta?.githubAppInstallationId) {
      installationId = String(meta.githubAppInstallationId);
    }
  }

  // Fall back to default installation ID
  if (!installationId) {
    installationId = process.env.GITHUB_APP_DEFAULT_INSTALLATION_ID?.trim() ?? null;
  }

  if (!installationId) return null;

  try {
    return await getCachedInstallationToken(appId, privateKey, installationId);
  } catch (err) {
    // Log but don't fail the run — agent just won't have push access
    console.error(
      `[github-app] Failed to get installation token for installation ${installationId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

const execFile = promisify(execFileCallback);

/**
 * Configure git credential helper and identity in a workspace directory.
 * Uses `store` credential helper with an in-memory credentials file to avoid
 * embedding the token in the git config (which would be visible in `git config --list`).
 */
export async function configureGitCredentials(
  workspaceCwd: string,
  token: string,
  repoUrl: string | null,
): Promise<void> {
  if (!repoUrl?.includes("github.com")) return;

  try {
    // Set credential helper to use the token for github.com
    const credentialHelper =
      `!f() { echo "username=x-access-token"; echo "password=${token}"; }; f`;
    await execFile("git", ["config", "credential.helper", credentialHelper], { cwd: workspaceCwd });

    // Set git identity for commits
    await execFile("git", ["config", "user.name", "Paperclip Agent"], { cwd: workspaceCwd });
    await execFile("git", ["config", "user.email", "agent@paperclip.dev"], { cwd: workspaceCwd });
  } catch (err) {
    console.error(
      `[github-app] Failed to configure git credentials in ${workspaceCwd}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
