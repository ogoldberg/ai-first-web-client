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

// Tool handlers
export {
  // Browse handlers
  handleSmartBrowse,
  handleBatchBrowse,
  handleGetDomainIntelligence,
  handleGetDomainCapabilities,
  type SmartBrowseArgs,
  type BatchBrowseArgs,
  // Debug handlers
  handleCaptureScreenshot,
  handleExportHar,
  handleGetLearningStats,
  handleGetLearningEffectiveness,
  handleDebugTraces,
  type DebugTracesAction,
  // Session handlers
  handleSessionManagement,
  handleExecuteApiCall,
  handleGetBrowserProviders,
  type SessionAction,
  // Admin handlers
  handleTierManagement,
  handleGetPerformanceMetrics,
  handleContentTracking,
  handleUsageAnalytics,
  handleGetAnalyticsDashboard,
  handleGetSystemStatus,
  handleToolSelectionMetrics,
  type TierAction,
  type ContentTrackingAction,
  type UsageAnalyticsAction,
  type ToolSelectionMetricsAction,
  // Skill handlers
  handleSkillManagement,
  type SkillAction,
  // Feedback handlers
  handleAiFeedback,
  type FeedbackAction,
  type AiFeedbackArgs,
  // Webhook handlers
  handleWebhookManagement,
  type WebhookAction,
  type WebhookManagementArgs,
} from './handlers/index.js';
