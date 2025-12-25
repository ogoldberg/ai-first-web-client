/**
 * MCP Handler Exports
 *
 * Unified exports for all MCP tool handlers.
 */

// Browse handlers
export {
  handleSmartBrowse,
  handleBatchBrowse,
  handleGetDomainIntelligence,
  handleGetDomainCapabilities,
  type SmartBrowseArgs,
  type BatchBrowseArgs,
} from './browse-handlers.js';

// Debug handlers
export {
  handleCaptureScreenshot,
  handleExportHar,
  handleGetLearningStats,
  handleGetLearningEffectiveness,
  handleDebugTraces,
  type DebugTracesAction,
} from './debug-handlers.js';

// Session handlers
export {
  handleSessionManagement,
  handleExecuteApiCall,
  handleGetBrowserProviders,
  type SessionAction,
} from './session-handlers.js';

// Admin handlers
export {
  handleTierManagement,
  handleGetPerformanceMetrics,
  handleContentTracking,
  handleUsageAnalytics,
  handleGetAnalyticsDashboard,
  handleGetSystemStatus,
  handleToolSelectionMetrics,
  handleSkillPromptAnalytics,
  type TierAction,
  type ContentTrackingAction,
  type UsageAnalyticsAction,
  type ToolSelectionMetricsAction,
  type SkillPromptAnalyticsAction,
} from './admin-handlers.js';

// Skill handlers
export { handleSkillManagement, type SkillAction } from './skill-handlers.js';

// Feedback handlers
export { handleAiFeedback, type FeedbackAction, type AiFeedbackArgs } from './feedback-handlers.js';
