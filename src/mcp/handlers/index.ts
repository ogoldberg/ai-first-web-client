/**
 * MCP Handler Exports
 *
 * Unified exports for all MCP tool handlers.
 */

// Browse handlers
export {
  handleSmartBrowse,
  handleBatchBrowse,
  type SmartBrowseArgs,
  type BatchBrowseArgs,
} from './browse-handlers.js';

// Debug handlers
export {
  handleCaptureScreenshot,
  handleExportHar,
  handleDebugTraces,
  type DebugTracesAction,
} from './debug-handlers.js';

// Session handlers
export {
  handleSessionManagement,
  handleExecuteApiCall,
  type SessionAction,
} from './session-handlers.js';

// Feedback handlers
export { handleAiFeedback, type FeedbackAction, type AiFeedbackArgs } from './feedback-handlers.js';

// Webhook handlers
export { handleWebhookManagement, type WebhookAction, type WebhookManagementArgs } from './webhook-handlers.js';
