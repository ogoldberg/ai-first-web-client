/**
 * MCP Module Exports
 *
 * Unified exports for all MCP-related functionality.
 */

// SDK client wrapper
export { McpSdkClient, getMcpSdkClient } from './sdk-client.js';

// Response formatters
export {
  jsonResponse,
  errorResponse,
  truncateContent,
  formatBrowseResult,
  formatBatchResults,
  type McpResponse,
  type BrowseFormatOptions,
} from './response-formatters.js';

// Tool schemas
export {
  DEBUG_TOOLS,
  ADMIN_TOOLS,
  getAllToolSchemas,
  getFilteredToolSchemas,
  // Individual schemas for reference
  smartBrowseSchema,
  batchBrowseSchema,
  executeApiCallSchema,
  sessionManagementSchema,
  apiAuthSchema,
} from './tool-schemas.js';
