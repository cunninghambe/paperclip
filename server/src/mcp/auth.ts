import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface McpAuth {
  apiUrl: string;
  headers: Record<string, string>;
}

export function resolveAuth(): McpAuth {
  const apiUrl = process.env.PAPERCLIP_API_URL ?? "http://localhost:3100/api";

  const token =
    process.env.PAPERCLIP_API_KEY ?? process.env.PAPERCLIP_SESSION_TOKEN;

  if (token) {
    return {
      apiUrl,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };
  }

  // Fall back to config file
  const configPath = path.join(os.homedir(), ".paperclip-mcp.json");
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
        apiUrl?: string;
        token?: string;
      };
      if (config.token) {
        return {
          apiUrl: config.apiUrl ?? apiUrl,
          headers: {
            Authorization: `Bearer ${config.token}`,
            "Content-Type": "application/json",
          },
        };
      }
    } catch {
      // ignore malformed config
    }
  }

  throw new Error(
    "No auth configured. Set PAPERCLIP_API_KEY env var or create ~/.paperclip-mcp.json with { apiUrl, token }."
  );
}
