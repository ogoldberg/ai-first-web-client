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
  dynamicHandlerStatsSchema,
} from './tool-schemas.js';

// Tool handlers
export {
  // Browse handlers
  handleSmartBrowse,
  handleBatchBrowse,
  type SmartBrowseArgs,
  type BatchBrowseArgs,
  // Debug handlers
  handleCaptureScreenshot,
  handleExportHar,
  handleDebugTraces,
  type DebugTracesAction,
  // Session handlers
  handleSessionManagement,
  handleExecuteApiCall,
  type SessionAction,
  // Feedback handlers
  handleAiFeedback,
  type FeedbackAction,
  type AiFeedbackArgs,
  // Webhook handlers
  handleWebhookManagement,
  type WebhookAction,
  type WebhookManagementArgs,
  // Dynamic handlers (yt-dlp inspired)
  handleDynamicHandlerStats,
  type DynamicHandlerStatsAction,
  type DynamicHandlerStatsArgs,
} from './handlers/index.js';
