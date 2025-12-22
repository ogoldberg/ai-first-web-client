/**
 * @llm-browser/mcp
 *
 * MCP (Model Context Protocol) server for LLM Browser.
 *
 * This package provides the MCP interface for Claude and other LLM clients.
 * It wraps @llm-browser/core to provide tool-based access to browsing capabilities.
 *
 * For programmatic access without MCP, use @llm-browser/core directly.
 *
 * @example
 * ```bash
 * # Add to Claude Desktop config
 * {
 *   "mcpServers": {
 *     "llm-browser": {
 *       "command": "npx",
 *       "args": ["@llm-browser/mcp"]
 *     }
 *   }
 * }
 * ```
 *
 * @packageDocumentation
 */

// Note: This package will be fully implemented in SDK-009
// when MCP tools are refactored as thin wrappers over @llm-browser/core.
//
// For now, the existing src/index.ts in the root continues to serve
// as the MCP server entry point.

export const VERSION = '0.5.0';

/**
 * Placeholder for MCP server initialization.
 * Will be implemented in SDK-009.
 */
export function startServer(): void {
  console.log('@llm-browser/mcp server - placeholder');
  console.log('Use the root package for now: npx llm-browser');
}
