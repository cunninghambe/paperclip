#!/usr/bin/env node
/**
 * Paperclip MCP Server — standalone entry point
 *
 * Usage:
 *   PAPERCLIP_API_URL=http://localhost:3100/api PAPERCLIP_API_KEY=your-token node dist/mcp/index.js
 *
 * Or add to Claude Code MCP settings (~/.claude/mcp.json):
 *   {
 *     "mcpServers": {
 *       "paperclip": {
 *         "command": "node",
 *         "args": ["/opt/autogeny-platform/server/dist/mcp/index.js"],
 *         "env": {
 *           "PAPERCLIP_API_URL": "http://5.161.200.212:3100/api",
 *           "PAPERCLIP_API_KEY": "your-token"
 *         }
 *       }
 *     }
 *   }
 */

import { startMcpServer } from "./server.js";

startMcpServer().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
