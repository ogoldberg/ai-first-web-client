/**
 * @unbrowser/mcp
 *
 * MCP (Model Context Protocol) server for Unbrowser.
 *
 * This package provides the MCP interface for Claude and other LLM clients.
 * It wraps @unbrowser/core to provide tool-based access to browsing capabilities.
 *
 * For programmatic access without MCP, use @unbrowser/core directly.
 *
 * @example
 * ```bash
 * # Add to Claude Desktop config
 * {
 *   "mcpServers": {
 *     "unbrowser": {
 *       "command": "npx",
 *       "args": ["@unbrowser/mcp"]
 *     }
 *   }
 * }
 * ```
 *
 * @packageDocumentation
 */

// Note: This package will be fully implemented in SDK-009
// when MCP tools are refactored as thin wrappers over @unbrowser/core.
//
// For now, the existing src/index.ts in the root continues to serve
// as the MCP server entry point.

export const VERSION = '0.1.0-alpha.1';

/**
 * Placeholder for MCP server initialization.
 * Will be implemented in SDK-009.
 */
export function startServer(): void {
  console.error('@unbrowser/mcp - Not yet implemented');
  console.error('');
  console.error('This package is a placeholder. Use the root package instead:');
  console.error('  npm install llm-browser');
  console.error('  npx llm-browser');
  console.error('');
  console.error('Documentation: https://github.com/ogoldberg/ai-first-web-client#readme');
  process.exit(1);
}
