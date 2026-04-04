import type { Command } from "commander";

export function registerMcpCommand(program: Command) {
  program
    .command("mcp")
    .description("Start the Paperclip MCP server (stdio transport)")
    .option(
      "--api-url <url>",
      "Paperclip API URL (overrides PAPERCLIP_API_URL env var)",
    )
    .option(
      "--api-key <key>",
      "Paperclip API key (overrides PAPERCLIP_API_KEY env var)",
    )
    .action(async (opts: { apiUrl?: string; apiKey?: string }) => {
      if (opts.apiUrl) process.env.PAPERCLIP_API_URL = opts.apiUrl;
      if (opts.apiKey) process.env.PAPERCLIP_API_KEY = opts.apiKey;

      // Dynamic import so the server only loads when the command is used
      const { startMcpServer } = await import(
        "../../server/dist/mcp/server.js"
      );
      await startMcpServer();
    });
}
