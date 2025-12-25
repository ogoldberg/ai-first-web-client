/**
 * AI Feedback Tool Handlers
 *
 * Handlers for the ai_feedback MCP tool that allows AI users to report
 * issues with browsing quality, accuracy, and performance.
 */

import type { SmartBrowser } from '../../core/smart-browser.js';
import type {
  FeedbackCategory,
  FeedbackSentiment,
  FeedbackSubmission,
} from '../../types/feedback.js';
import { jsonResponse, errorResponse, type McpResponse } from '../response-formatters.js';
import { logger } from '../../utils/logger.js';

const log = logger.create('FeedbackHandler');

/**
 * Feedback action types
 */
export type FeedbackAction = 'submit' | 'list' | 'stats' | 'anomalies';

/**
 * Arguments for ai_feedback tool
 */
export interface AiFeedbackArgs {
  action: FeedbackAction;
  // For submit action
  category?: FeedbackCategory;
  sentiment?: FeedbackSentiment;
  subtype?: string;
  severity?: string;
  url?: string;
  domain?: string;
  message?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  patternId?: string;
  skillId?: string;
  requestId?: string;
  suggestedAction?: string;
  contentSnippet?: string;
  errorMessage?: string;
  responseTime?: number;
  statusCode?: number;
  // For list action
  limit?: number;
  offset?: number;
  filterCategory?: FeedbackCategory;
  filterSentiment?: FeedbackSentiment;
  // For stats action
  periodHours?: number;
}

/**
 * Handle ai_feedback tool call
 */
export async function handleAiFeedback(
  smartBrowser: SmartBrowser,
  action: FeedbackAction,
  args: AiFeedbackArgs,
  sessionId: string
): Promise<McpResponse> {
  const feedbackService = smartBrowser.getFeedbackService();

  if (!feedbackService) {
    return errorResponse(new Error('Feedback service not available'));
  }

  // Default tenant ID for local MCP server
  const tenantId = 'local';

  switch (action) {
    case 'submit': {
      return await handleSubmit(feedbackService, tenantId, sessionId, args);
    }

    case 'list': {
      return handleList(feedbackService, tenantId, args);
    }

    case 'stats': {
      return handleStats(feedbackService, tenantId, args);
    }

    case 'anomalies': {
      return handleAnomalies(feedbackService, tenantId, args);
    }

    default: {
      return errorResponse(
        new Error(`Unknown action: ${action}. Valid actions: submit, list, stats, anomalies`)
      );
    }
  }
}

/**
 * Handle submit action
 */
async function handleSubmit(
  feedbackService: import('../../core/feedback-service.js').FeedbackService,
  tenantId: string,
  sessionId: string,
  args: AiFeedbackArgs
): Promise<McpResponse> {
  // Validate required fields
  if (!args.category) {
    return errorResponse(new Error('category is required for submit action'));
  }

  if (!args.sentiment) {
    return errorResponse(new Error('sentiment is required for submit action'));
  }

  if (!args.url) {
    return errorResponse(new Error('url is required for submit action'));
  }

  // Extract domain from URL if not provided
  let domain = args.domain;
  if (!domain) {
    try {
      const parsedUrl = new URL(args.url);
      domain = parsedUrl.hostname;
    } catch {
      return errorResponse(new Error('Invalid URL provided'));
    }
  }

  // Build submission object
  const submission: FeedbackSubmission = {
    category: args.category,
    sentiment: args.sentiment,
    subtype: args.subtype as FeedbackSubmission['subtype'],
    severity: args.severity as FeedbackSubmission['severity'],
    context: {
      url: args.url,
      domain,
      operation: args.requestId ? 'browse' : undefined,
      skillId: args.skillId,
      patternId: args.patternId,
      requestId: args.requestId,
    },
    message: args.message,
    expectedBehavior: args.expectedBehavior,
    actualBehavior: args.actualBehavior,
    evidence: {
      contentSnippet: args.contentSnippet,
      errorMessage: args.errorMessage,
      responseTime: args.responseTime,
      statusCode: args.statusCode,
    },
    suggestedAction: args.suggestedAction as FeedbackSubmission['suggestedAction'],
  };

  // Clean up undefined evidence fields
  if (submission.evidence) {
    const evidence = submission.evidence;
    if (!evidence.contentSnippet && !evidence.errorMessage &&
        !evidence.responseTime && !evidence.statusCode) {
      submission.evidence = undefined;
    }
  }

  log.info('Submitting feedback', {
    tenantId,
    sessionId,
    category: args.category,
    sentiment: args.sentiment,
    domain,
  });

  const result = await feedbackService.submitFeedback(tenantId, sessionId, submission);

  if (!result.success) {
    return jsonResponse({
      success: false,
      status: result.status,
      message: result.message,
      errors: result.validationErrors,
      anomalies: result.anomalyFlags,
    });
  }

  return jsonResponse({
    success: true,
    feedbackId: result.feedbackId,
    status: result.status,
    message: result.message,
    adjustmentsApplied: result.adjustmentsApplied || 0,
    notificationSent: result.notificationSent || false,
    anomalies: result.anomalyFlags,
  });
}

/**
 * Handle list action
 */
function handleList(
  feedbackService: import('../../core/feedback-service.js').FeedbackService,
  tenantId: string,
  args: AiFeedbackArgs
): McpResponse {
  const records = feedbackService.listFeedback(tenantId, {
    limit: args.limit,
    offset: args.offset,
    category: args.filterCategory,
    sentiment: args.filterSentiment,
  });

  return jsonResponse({
    count: records.length,
    feedback: records.map(r => ({
      id: r.id,
      category: r.submission.category,
      sentiment: r.submission.sentiment,
      subtype: r.submission.subtype,
      severity: r.submission.severity,
      domain: r.submission.context.domain,
      url: r.submission.context.url,
      message: r.submission.message,
      status: r.status,
      adjustments: r.adjustments.length,
      anomalies: r.anomalyFlags.length,
      createdAt: new Date(r.createdAt).toISOString(),
    })),
  });
}

/**
 * Handle stats action
 */
function handleStats(
  feedbackService: import('../../core/feedback-service.js').FeedbackService,
  tenantId: string,
  args: AiFeedbackArgs
): McpResponse {
  const periodHours = args.periodHours || 24;
  const stats = feedbackService.getStats(tenantId, periodHours);

  return jsonResponse({
    period: {
      hours: periodHours,
      start: new Date(stats.period.start).toISOString(),
      end: new Date(stats.period.end).toISOString(),
    },
    summary: {
      total: stats.total,
      anomaliesDetected: stats.anomaliesDetected,
      escalationsRequired: stats.escalationsRequired,
      adjustmentsApplied: stats.adjustmentsApplied,
      adjustmentsReverted: stats.adjustmentsReverted,
    },
    byCategory: stats.byCategory,
    bySentiment: stats.bySentiment,
    byStatus: stats.byStatus,
  });
}

/**
 * Handle anomalies action
 */
function handleAnomalies(
  feedbackService: import('../../core/feedback-service.js').FeedbackService,
  tenantId: string,
  args: AiFeedbackArgs
): McpResponse {
  const limit = args.limit || 20;
  const anomalies = feedbackService.getAnomalies(tenantId, limit);

  return jsonResponse({
    count: anomalies.length,
    anomalies: anomalies.map(a => ({
      type: a.type,
      severity: a.severity,
      description: a.description,
      detectedAt: new Date(a.detectedAt).toISOString(),
    })),
  });
}
