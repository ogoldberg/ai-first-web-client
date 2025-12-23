/**
 * MCP Response Formatters
 *
 * Utilities for formatting SDK responses for MCP tool consumption.
 * These formatters handle:
 * - Content truncation with sensible defaults
 * - Output size controls
 * - Schema versioning
 * - Structured error responses
 */

import { addSchemaVersion } from '../types/schema-version.js';
import {
  buildStructuredError,
  type ErrorContext,
  type ClassificationContext,
} from '../types/errors.js';
import { UrlSafetyError } from '../utils/url-safety.js';
import type { SmartBrowseResult } from '../core/smart-browser.js';

/**
 * MCP response content type
 * This matches the expected return type for MCP tool handlers
 */
export type McpResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/**
 * Options for formatting browse results
 */
export interface BrowseFormatOptions {
  maxChars?: number;
  includeTables?: boolean;
  includeNetwork?: boolean;
  includeConsole?: boolean;
  includeHtml?: boolean;
  includeInsights?: boolean;
}

/**
 * Create a versioned JSON response for MCP tools
 * All successful responses include schemaVersion for client compatibility
 */
export function jsonResponse(data: object, indent: number = 2): McpResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(addSchemaVersion(data), null, indent) }],
  };
}

/**
 * Create a structured error response for MCP tools (CX-004)
 *
 * Returns a structured error with:
 * - category: High-level error category (network, auth, content, etc.)
 * - code: Specific error code for programmatic handling
 * - retryable: Whether the error is likely to succeed on retry
 * - recommendedActions: Suggested actions for LLM recovery
 * - context: Additional context about the error
 */
export function errorResponse(
  error: Error | string,
  classificationContext?: ClassificationContext,
  errorContext?: ErrorContext
): McpResponse {
  // Extract security category from UrlSafetyError if applicable
  const securityCategory = error instanceof UrlSafetyError ? error.category : undefined;

  // Build classification context with security category
  const fullClassificationContext: ClassificationContext = {
    ...classificationContext,
    securityCategory: securityCategory || classificationContext?.securityCategory,
  };

  // Build structured error
  const structuredError = buildStructuredError(error, fullClassificationContext, errorContext);

  return {
    content: [{ type: 'text', text: JSON.stringify(structuredError) }],
    isError: true,
  };
}

/**
 * Truncate content to a maximum length, breaking at word boundaries
 */
export function truncateContent(
  content: string,
  maxChars: number
): { content: string; wasTruncated: boolean; originalLength: number } {
  if (content.length <= maxChars) {
    return { content, wasTruncated: false, originalLength: content.length };
  }

  let truncated = content.substring(0, maxChars);

  // Try to break at a word/sentence boundary
  const lastSpace = truncated.lastIndexOf(' ');
  const lastNewline = truncated.lastIndexOf('\n');
  const breakPoint = Math.max(lastSpace, lastNewline);

  if (breakPoint > maxChars * 0.8) {
    truncated = truncated.substring(0, breakPoint);
  }

  truncated += '\n\n[Content truncated - reached maxChars limit]';

  return {
    content: truncated,
    wasTruncated: true,
    originalLength: content.length,
  };
}

/**
 * Format a SmartBrowseResult for MCP consumption
 *
 * Applies output size controls and structures the response for LLM consumption.
 */
export function formatBrowseResult(
  result: SmartBrowseResult,
  options: BrowseFormatOptions = {}
): Record<string, unknown> {
  const {
    maxChars,
    includeTables = true,
    includeNetwork = false,
    includeConsole = false,
    includeHtml = false,
  } = options;

  // Apply maxChars truncation to markdown content
  let markdown = result.content.markdown;
  let wasTruncated = false;
  let originalLength: number | undefined;

  if (maxChars) {
    const truncateResult = truncateContent(markdown, maxChars);
    markdown = truncateResult.content;
    wasTruncated = truncateResult.wasTruncated;
    originalLength = truncateResult.originalLength;
  }

  // Build content object based on flags
  const contentOutput: Record<string, unknown> = {
    markdown,
    textLength: result.content.text.length,
  };

  if (wasTruncated) {
    contentOutput.truncated = true;
    contentOutput.originalLength = originalLength;
  }

  if (includeHtml) {
    contentOutput.html = result.content.html;
  }

  // Format result for LLM consumption
  const formattedResult: Record<string, unknown> = {
    url: result.url,
    title: result.title,
    content: contentOutput,
    metadata: result.metadata,
    // Learning insights (key differentiator)
    intelligence: {
      confidenceLevel: result.learning.confidenceLevel,
      domainGroup: result.learning.domainGroup,
      validationPassed: result.learning.validationResult?.valid,
      validationIssues: result.learning.validationResult?.reasons,
      contentChanged: result.learning.contentChanged,
      recommendedRefreshHours: result.learning.recommendedRefreshHours,
      paginationAvailable: !!result.learning.paginationDetected,
      selectorsSucceeded: result.learning.selectorsSucceeded.length,
      selectorsFailed: result.learning.selectorsFailed.length,
      // Procedural memory insights
      skillApplied: result.learning.skillApplied,
      skillsMatched: result.learning.skillsMatched?.length || 0,
      trajectoryRecorded: result.learning.trajectoryRecorded,
      // Tiered rendering insights
      renderTier: result.learning.renderTier,
      tierFellBack: result.learning.tierFellBack,
      tierReason: result.learning.tierReason,
      // Budget tracking (CX-005)
      budgetInfo: result.learning.budgetInfo,
      // Domain insights (TC-002)
      domainCapabilities: result.learning.domainCapabilities,
      domainKnowledge: result.learning.domainKnowledge,
    },
    // Discovered APIs for future direct access
    discoveredApis: result.discoveredApis.map(api => ({
      endpoint: api.endpoint,
      method: api.method,
      canBypassBrowser: api.canBypass,
      confidence: api.confidence,
    })),
  };

  // Conditionally include tables
  if (includeTables && result.tables && result.tables.length > 0) {
    formattedResult.tables = result.tables;
  }

  // Conditionally include network data
  if (includeNetwork && result.network && result.network.length > 0) {
    formattedResult.network = result.network.map(req => ({
      url: req.url,
      method: req.method,
      status: req.status,
      contentType: req.contentType,
      duration: req.duration,
    }));
  }

  // Conditionally include console logs
  if (includeConsole && result.console && result.console.length > 0) {
    formattedResult.console = result.console;
  }

  // Additional pages if pagination was followed
  if (result.additionalPages && result.additionalPages.length > 0) {
    formattedResult.additionalPages = result.additionalPages.map(page => ({
      url: page.url,
      textLength: page.content.text.length,
    }));
  }

  // Conditionally include decision trace (CX-003)
  if (result.decisionTrace) {
    formattedResult.decisionTrace = result.decisionTrace;
  }

  return formattedResult;
}

/**
 * Format batch browse results for MCP consumption
 */
export function formatBatchResults(
  results: Array<{
    url: string;
    status: string;
    durationMs: number;
    index: number;
    error?: string;
    errorCode?: string;
    result?: SmartBrowseResult;
  }>,
  options: BrowseFormatOptions = {}
): Record<string, unknown>[] {
  const { maxChars, includeTables = true, includeNetwork = false, includeConsole = false } = options;

  return results.map(item => {
    const formatted: Record<string, unknown> = {
      url: item.url,
      status: item.status,
      durationMs: item.durationMs,
      index: item.index,
    };

    if (item.error) {
      formatted.error = item.error;
      formatted.errorCode = item.errorCode;
    }

    if (item.result) {
      // Apply maxChars truncation
      let markdown = item.result.content.markdown;
      let wasTruncated = false;

      if (maxChars && markdown.length > maxChars) {
        const truncateResult = truncateContent(markdown, maxChars);
        markdown = truncateResult.content;
        wasTruncated = truncateResult.wasTruncated;
      }

      formatted.title = item.result.title;
      formatted.content = {
        markdown,
        textLength: item.result.content.text.length,
        ...(wasTruncated ? { truncated: true } : {}),
      };
      formatted.metadata = item.result.metadata;
      formatted.intelligence = {
        confidenceLevel: item.result.learning.confidenceLevel,
        renderTier: item.result.learning.renderTier,
        tierFellBack: item.result.learning.tierFellBack,
      };

      if (includeTables && item.result.tables && item.result.tables.length > 0) {
        formatted.tables = item.result.tables;
      }

      if (includeNetwork && item.result.network && item.result.network.length > 0) {
        formatted.network = item.result.network.map(req => ({
          url: req.url,
          method: req.method,
          status: req.status,
        }));
      }

      if (includeConsole && item.result.console && item.result.console.length > 0) {
        formatted.console = item.result.console;
      }

      if (item.result.discoveredApis && item.result.discoveredApis.length > 0) {
        formatted.discoveredApis = item.result.discoveredApis.map(api => ({
          endpoint: api.endpoint,
          method: api.method,
          canBypassBrowser: api.canBypass,
        }));
      }
    }

    return formatted;
  });
}
