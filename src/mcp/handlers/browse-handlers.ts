/**
 * Browse Tool Handlers
 *
 * Handlers for smart_browse, batch_browse, and domain intelligence tools.
 * These are the primary browsing tools for the MCP server.
 */

import type { SmartBrowser } from '../../core/smart-browser.js';
import type {
  DomainCapabilitiesSummary,
  DomainKnowledgeSummary,
} from '../../core/smart-browser.js';
import {
  jsonResponse,
  errorResponse,
  formatBrowseResult,
  formatBatchResults,
  type McpResponse,
  type BrowseFormatOptions,
} from '../response-formatters.js';
import { logger } from '../../utils/logger.js';

/**
 * Arguments for smart_browse tool
 */
export interface SmartBrowseArgs {
  url: string;
  contentType?: string;
  followPagination?: boolean;
  maxPages?: number;
  checkForChanges?: boolean;
  waitForSelector?: string;
  scrollToLoad?: boolean;
  sessionProfile?: string;
  maxChars?: number;
  includeTables?: boolean;
  includeNetwork?: boolean;
  includeConsole?: boolean;
  includeHtml?: boolean;
  includeInsights?: boolean;
  includeDecisionTrace?: boolean;
  maxLatencyMs?: number;
  maxCostTier?: 'intelligence' | 'lightweight' | 'playwright';
  freshnessRequirement?: 'realtime' | 'cached' | 'any';
}

/**
 * Arguments for batch_browse tool
 */
export interface BatchBrowseArgs {
  urls: string[];
  contentType?: string;
  waitForSelector?: string;
  scrollToLoad?: boolean;
  sessionProfile?: string;
  maxChars?: number;
  includeTables?: boolean;
  includeNetwork?: boolean;
  includeConsole?: boolean;
  concurrency?: number;
  stopOnError?: boolean;
  continueOnRateLimit?: boolean;
  perUrlTimeoutMs?: number;
  totalTimeoutMs?: number;
  maxLatencyMs?: number;
  maxCostTier?: 'intelligence' | 'lightweight' | 'playwright';
}

/**
 * Handle smart_browse tool call
 */
export async function handleSmartBrowse(
  smartBrowser: SmartBrowser,
  args: SmartBrowseArgs
): Promise<McpResponse> {
  const result = await smartBrowser.browse(args.url, {
    contentType: args.contentType as any,
    followPagination: args.followPagination,
    maxPages: args.maxPages,
    checkForChanges: args.checkForChanges,
    waitForSelector: args.waitForSelector,
    scrollToLoad: args.scrollToLoad,
    sessionProfile: args.sessionProfile,
    validateContent: true,
    enableLearning: true,
    includeDecisionTrace: args.includeDecisionTrace,
    maxLatencyMs: args.maxLatencyMs,
    maxCostTier: args.maxCostTier,
    freshnessRequirement: args.freshnessRequirement,
  });

  // Output size control options
  const formatOptions: BrowseFormatOptions = {
    maxChars: args.maxChars,
    includeTables: args.includeTables !== false,
    includeNetwork: args.includeNetwork === true,
    includeConsole: args.includeConsole === true,
    includeHtml: args.includeHtml === true,
    includeInsights: args.includeInsights !== false,
  };

  // Format result using shared formatter
  const formattedResult = formatBrowseResult(result, formatOptions);

  // Fetch domain insights if requested (TC-002)
  if (formatOptions.includeInsights) {
    const domain = new URL(result.url).hostname;
    try {
      const [capabilities, intelligence] = await Promise.all([
        smartBrowser.getDomainCapabilities(domain),
        smartBrowser.getDomainIntelligence(domain),
      ]);

      // Add domain insights to intelligence section
      const intelligenceSection = formattedResult.intelligence as Record<string, unknown>;
      intelligenceSection.domainCapabilities = capabilities.capabilities;
      intelligenceSection.domainKnowledge = {
        patternCount: intelligence.knownPatterns,
        successRate: intelligence.successRate,
        recommendedWaitStrategy: intelligence.recommendedWaitStrategy,
        recommendations: capabilities.recommendations.slice(0, 3),
      };
    } catch (error) {
      logger.server.warn('Failed to fetch domain insights', { domain, error });
    }
  }

  return jsonResponse(formattedResult);
}

/**
 * Handle batch_browse tool call
 */
export async function handleBatchBrowse(
  smartBrowser: SmartBrowser,
  args: BatchBrowseArgs
): Promise<McpResponse> {
  const urls = args.urls;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return errorResponse(new Error('urls must be a non-empty array of strings'));
  }

  // Build browse options
  const browseOptions = {
    contentType: args.contentType as any,
    waitForSelector: args.waitForSelector,
    scrollToLoad: args.scrollToLoad,
    sessionProfile: args.sessionProfile,
    validateContent: true,
    enableLearning: true,
    maxLatencyMs: args.maxLatencyMs,
    maxCostTier: args.maxCostTier,
  };

  // Build batch options
  const batchOptions = {
    concurrency: args.concurrency,
    stopOnError: args.stopOnError,
    continueOnRateLimit: args.continueOnRateLimit,
    perUrlTimeoutMs: args.perUrlTimeoutMs,
    totalTimeoutMs: args.totalTimeoutMs,
  };

  // Output size control options
  const formatOptions: BrowseFormatOptions = {
    maxChars: args.maxChars,
    includeTables: args.includeTables !== false,
    includeNetwork: args.includeNetwork === true,
    includeConsole: args.includeConsole === true,
  };

  const batchResults = await smartBrowser.batchBrowse(urls, browseOptions, batchOptions);

  // Format results using shared formatter
  const formattedResults = formatBatchResults(batchResults, formatOptions);

  // Summary statistics
  const summary = {
    totalUrls: urls.length,
    successful: batchResults.filter(r => r.status === 'success').length,
    failed: batchResults.filter(r => r.status === 'error').length,
    skipped: batchResults.filter(r => r.status === 'skipped').length,
    rateLimited: batchResults.filter(r => r.status === 'rate_limited').length,
    totalDurationMs: batchResults.reduce((sum, r) => sum + r.durationMs, 0),
  };

  return jsonResponse({
    summary,
    results: formattedResults,
  });
}

/**
 * Generate recommendations based on domain intelligence
 */
function getRecommendations(intelligence: {
  knownPatterns: number;
  selectorChains: number;
  paginationPatterns: number;
  recentFailures: number;
  successRate: number;
  domainGroup: string | null;
  recommendedWaitStrategy: string;
  shouldUseSession: boolean;
}): string[] {
  const recommendations: string[] = [];

  if (intelligence.knownPatterns === 0) {
    recommendations.push('First visit to this domain - learning will begin automatically');
  }

  if (intelligence.successRate < 0.7) {
    recommendations.push(
      `Success rate is ${Math.round(intelligence.successRate * 100)}%. Consider using waitForSelector for more reliable extraction.`
    );
  }

  if (intelligence.recentFailures > 5) {
    recommendations.push('Many recent failures - site may be rate limiting or blocking');
  }

  if (intelligence.shouldUseSession) {
    recommendations.push(
      'This domain benefits from session persistence - use save_session after authentication'
    );
  }

  if (intelligence.domainGroup) {
    recommendations.push(
      `Part of ${intelligence.domainGroup} group - shared patterns will be applied`
    );
  }

  if (intelligence.selectorChains > 0) {
    recommendations.push(
      `${intelligence.selectorChains} learned selectors available for reliable extraction`
    );
  }

  if (intelligence.paginationPatterns > 0) {
    recommendations.push('Pagination patterns learned - use followPagination for multi-page content');
  }

  if (intelligence.recommendedWaitStrategy !== 'networkidle') {
    recommendations.push(
      `Use waitFor: '${intelligence.recommendedWaitStrategy}' for better results on this domain.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('Domain patterns are well-established. No special handling needed.');
  }

  return recommendations;
}

/**
 * Handle get_domain_intelligence tool call (deprecated)
 */
export async function handleGetDomainIntelligence(
  smartBrowser: SmartBrowser,
  domain: string
): Promise<McpResponse> {
  const intelligence = await smartBrowser.getDomainIntelligence(domain);

  return jsonResponse({
    domain,
    ...intelligence,
    recommendations: getRecommendations(intelligence),
    deprecation_notice:
      'This tool is deprecated. Domain insights are now automatically included in smart_browse responses with includeInsights=true (default).',
  });
}

/**
 * Handle get_domain_capabilities tool call (deprecated)
 */
export async function handleGetDomainCapabilities(
  smartBrowser: SmartBrowser,
  domain: string
): Promise<McpResponse> {
  const capabilities = await smartBrowser.getDomainCapabilities(domain);
  return jsonResponse({
    ...capabilities,
    deprecation_notice:
      'This tool is deprecated. Domain capabilities are now automatically included in smart_browse responses with includeInsights=true (default).',
  });
}
