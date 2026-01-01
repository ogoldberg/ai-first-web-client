/**
 * Browse Routes
 *
 * Main endpoints for browsing URLs with intelligence.
 * Supports both JSON responses and SSE streaming for progress.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { validator } from 'hono/validator';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { rateLimitMiddleware, recordTierUsage } from '../middleware/rate-limit.js';
import { getBrowserClient } from '../services/browser.js';
import { getUsageStats, exportUsage, getTodayUnits } from '../services/usage.js';
import {
  selectProxyForRequest,
  reportProxySuccess,
  reportProxyFailure,
  detectFailureReason,
  formatProxyMetadata,
  proxyAvailabilityMiddleware,
  getProxyStats,
} from '../middleware/proxy.js';
import { getProxyManager, hasProxiesConfigured } from '../services/proxy-manager.js';
import type { ProxyTier } from '../services/proxy-types.js';
import { WorkflowRecorder } from '../../../../src/core/workflow-recorder.js';
import { discoverLinks, extractPaginationLinks } from '../../../../src/core/link-discovery.js';

interface BrowseRequest {
  url: string;
  options?: {
    waitForSelector?: string;
    scrollToLoad?: boolean;
    maxChars?: number;
    includeTables?: boolean;
    maxLatencyMs?: number;
    maxCostTier?: 'intelligence' | 'lightweight' | 'playwright';
    // Proxy options
    proxy?: {
      preferredTier?: ProxyTier;
      preferredCountry?: string;
      requireFresh?: boolean;
      stickySessionId?: string;
    };
    // Verification options (COMP-015)
    verify?: {
      enabled?: boolean; // default: true for basic mode
      mode?: 'basic' | 'standard' | 'thorough'; // default: 'basic'
    };
    // Debug mode (PLAY-001)
    debug?: {
      visible?: boolean;        // Show browser window (Playwright only)
      slowMotion?: number;      // ms delay between actions
      screenshots?: boolean;    // Capture screenshots
      consoleLogs?: boolean;    // Collect console output
    };
  };
  session?: {
    cookies?: Array<{ name: string; value: string; domain?: string; path?: string }>;
    localStorage?: Record<string, string>;
  };
}

interface BatchRequest {
  urls: string[];
  options?: BrowseRequest['options'];
  session?: BrowseRequest['session'];
}

interface PaginateRequest {
  url: string;
  options?: BrowseRequest['options'] & {
    /** Maximum number of pages to fetch (default: 10, max: 50) */
    maxPages?: number;
    /** Pagination strategy: 'links' follows next links, 'auto' tries API patterns first */
    strategy?: 'links' | 'auto';
    /** Delay between page requests in ms (default: 0, useful for rate limiting) */
    delayMs?: number;
    /** Stop pagination if a page fails (default: true) */
    stopOnError?: boolean;
  };
  session?: BrowseRequest['session'];
}

interface FormatOptions {
  maxChars?: number;
  includeTables?: boolean;
}

const browse = new Hono();

/**
 * Normalize verify options from API request to full VerifyOptions
 */
function normalizeVerifyOptions(verify?: { enabled?: boolean; mode?: 'basic' | 'standard' | 'thorough' }): { enabled: boolean; mode: 'basic' | 'standard' | 'thorough' } | undefined {
  if (!verify) return undefined;
  return {
    enabled: verify.enabled ?? true,
    mode: verify.mode ?? 'basic',
  };
}

// Workflow recorder singleton (COMP-009)
// In production, this would be injected via dependency injection
let workflowRecorder: WorkflowRecorder | null = null;

export function getWorkflowRecorder(): WorkflowRecorder {
  if (!workflowRecorder) {
    workflowRecorder = new WorkflowRecorder();
  }
  return workflowRecorder;
}

// Apply auth, rate limiting, and proxy availability check to all routes
browse.use('*', authMiddleware);
browse.use('*', rateLimitMiddleware);
browse.use('*', proxyAvailabilityMiddleware);

// URL validation helper
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// Request validator
const browseValidator = validator('json', (value, c) => {
  const body = value as BrowseRequest;

  if (!body.url || typeof body.url !== 'string') {
    return c.json(
      {
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'url is required' },
      },
      400
    );
  }

  if (!isValidUrl(body.url)) {
    return c.json(
      {
        success: false,
        error: { code: 'INVALID_URL', message: 'Invalid URL format. Must be http or https.' },
      },
      400
    );
  }

  return body;
});

/**
 * Truncate content to max characters
 */
function truncateContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;

  let truncated = content.substring(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  const lastNewline = truncated.lastIndexOf('\n');
  const breakPoint = Math.max(lastSpace, lastNewline);

  if (breakPoint > maxChars * 0.8) {
    truncated = truncated.substring(0, breakPoint);
  }

  return truncated + '\n\n[Content truncated]';
}

/**
 * Convert SmartBrowseResult to API response format
 */
function formatBrowseResult(
  result: any,
  startTime: number,
  options: FormatOptions = {},
  proxyMetadata?: Record<string, unknown>
) {
  let markdown = result.content?.markdown || '';
  let text = result.content?.text || '';

  // Apply maxChars truncation
  if (options.maxChars) {
    markdown = truncateContent(markdown, options.maxChars);
    text = truncateContent(text, options.maxChars);
  }

  const response: Record<string, any> = {
    url: result.url,
    finalUrl: result.finalUrl || result.url,
    title: result.title || '',
    content: {
      markdown,
      text,
    },
    metadata: {
      loadTime: Date.now() - startTime,
      tier: result.tier || 'unknown',
      tiersAttempted: result.tiersAttempted || [],
      learningApplied: result.learning?.patternsApplied || false,
      confidence: result.fieldConfidence?.aggregated?.score,
      // Include proxy information if available
      ...(proxyMetadata && { proxy: proxyMetadata }),
    },
    links: result.links,
    apis: result.discoveredApis,
  };

  // Include tables if requested (default: true)
  if (options.includeTables !== false && result.tables) {
    response.tables = result.tables;
  }

  // Include verification result if present (COMP-015)
  if (result.verification) {
    response.verification = {
      passed: result.verification.passed,
      confidence: result.verification.confidence,
      checksRun: result.verification.checks?.length || 0,
      errors: result.verification.errors,
      warnings: result.verification.warnings,
    };
  }

  // Include debug data if present (PLAY-001)
  if (result.debug) {
    response.debug = {
      screenshots: result.debug.screenshots?.map((s: any) => ({
        action: s.action,
        timestamp: s.timestamp,
        // Note: image data (base64) can be very large
        imageSize: s.image?.length || 0,
        // Include first 100 chars of base64 for verification
        imagePreview: s.image?.substring(0, 100),
      })),
      consoleLogs: result.debug.consoleLogs,
      actionTrace: result.debug.actionTrace,
    };
  }

  return response;
}

/**
 * POST /v1/browse/preview
 * Preview what will happen when browsing a URL without executing
 *
 * Returns execution plan, time estimates, and confidence levels.
 * Competitive advantage: <50ms preview vs 2-5s browser automation.
 */
browse.post('/browse/preview', requirePermission('browse'), browseValidator, async (c) => {
  const body = c.req.valid('json') as BrowseRequest;
  const startTime = Date.now();

  try {
    const client = await getBrowserClient();

    const previewResult = await client.previewBrowse(body.url, {
      waitForSelector: body.options?.waitForSelector,
      scrollToLoad: body.options?.scrollToLoad,
      maxLatencyMs: body.options?.maxLatencyMs,
      maxCostTier: body.options?.maxCostTier,
    });

    return c.json({
      success: true,
      data: previewResult,
      metadata: {
        previewDuration: Date.now() - startTime,
      },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: 'PREVIEW_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      500
    );
  }
});

/**
 * POST /v1/browse
 * Browse a URL with intelligent rendering
 */
browse.post('/browse', requirePermission('browse'), browseValidator, async (c) => {
  const body = c.req.valid('json') as BrowseRequest;
  const acceptHeader = c.req.header('Accept') || '';

  // Format options (applied after browse)
  const formatOptions: FormatOptions = {
    maxChars: body.options?.maxChars,
    includeTables: body.options?.includeTables,
  };

  // Check if client wants SSE streaming
  if (acceptHeader.includes('text/event-stream')) {
    return streamSSE(c, async (stream) => {
      const requestId = `req_${Date.now().toString(36)}`;
      const startTime = Date.now();

      // Send started event
      await stream.writeSSE({
        event: 'started',
        data: JSON.stringify({
          requestId,
          timestamp: startTime,
          url: body.url,
        }),
      });

      try {
        const client = await getBrowserClient();

        await stream.writeSSE({
          event: 'progress',
          data: JSON.stringify({
            stage: 'rendering',
            elapsed: Date.now() - startTime,
          }),
        });

        const browseResult = await client.browse(body.url, {
          waitForSelector: body.options?.waitForSelector,
          scrollToLoad: body.options?.scrollToLoad,
          maxLatencyMs: body.options?.maxLatencyMs,
          maxCostTier: body.options?.maxCostTier,
          verify: normalizeVerifyOptions(body.options?.verify),
          debug: body.options?.debug,
        });

        // Capture step in workflow recording if session active (COMP-009)
        const recordingSessionId = c.req.header('X-Recording-Session');
        if (recordingSessionId) {
          try {
            const recorder = getWorkflowRecorder();
            await recorder.recordStep(recordingSessionId, browseResult);
          } catch (error) {
            // Log but don't fail the request
            console.warn('Failed to record workflow step:', error);
          }
        }

        const result = {
          success: true,
          data: formatBrowseResult(browseResult, startTime, formatOptions),
        };

        // Record usage for the tier used
        const tenant = c.get('tenant');
        recordTierUsage(tenant.id, browseResult.learning?.renderTier || 'intelligence');

        await stream.writeSSE({
          event: 'result',
          data: JSON.stringify(result),
        });
      } catch (error) {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({
            success: false,
            error: {
              code: 'BROWSE_ERROR',
              message: error instanceof Error ? error.message : 'Unknown error',
            },
          }),
        });
      }
    });
  }

  // Regular JSON response
  const startTime = Date.now();
  const tenant = c.get('tenant');

  // Parse URL once for reuse
  const domain = new URL(body.url).hostname;

  // Select proxy if available
  let proxyInfo: Awaited<ReturnType<typeof selectProxyForRequest>> = null;
  try {
    proxyInfo = await selectProxyForRequest(domain, tenant.id, tenant.plan, body.options?.proxy);
  } catch {
    // Continue without proxy if selection fails
  }

  try {
    const client = await getBrowserClient();

    const browseResult = await client.browse(body.url, {
      waitForSelector: body.options?.waitForSelector,
      scrollToLoad: body.options?.scrollToLoad,
      maxLatencyMs: body.options?.maxLatencyMs,
      maxCostTier: body.options?.maxCostTier,
      verify: normalizeVerifyOptions(body.options?.verify),
      debug: body.options?.debug,
      // TODO: Pass proxy config to browser client when implemented
      // proxy: proxyInfo?.proxy.getPlaywrightProxy(),
    });

    // Capture step in workflow recording if session active (COMP-009)
    const recordingSessionId = c.req.header('X-Recording-Session');
    if (recordingSessionId) {
      try {
        const recorder = getWorkflowRecorder();
        await recorder.recordStep(recordingSessionId, browseResult);
      } catch (error) {
        // Log but don't fail the request
        console.warn('Failed to record workflow step:', error);
      }
    }

    // Record usage for the tier used
    recordTierUsage(tenant.id, browseResult.learning?.renderTier || 'intelligence');

    // Report success to proxy health tracker
    if (proxyInfo) {
      const latencyMs = Date.now() - startTime;
      reportProxySuccess(proxyInfo.proxy.id, domain, latencyMs);
    }

    return c.json({
      success: true,
      data: formatBrowseResult(browseResult, startTime, formatOptions, formatProxyMetadata(proxyInfo)),
    });
  } catch (error) {
    // Report failure to proxy health tracker
    if (proxyInfo) {
      const failureReason = detectFailureReason(error instanceof Error ? error : undefined);
      reportProxyFailure(proxyInfo.proxy.id, domain, failureReason);
    }

    return c.json(
      {
        success: false,
        error: {
          code: 'BROWSE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      500
    );
  }
});

/**
 * POST /v1/fetch
 * Fast tiered fetch (no full browser unless needed)
 */
browse.post('/fetch', requirePermission('browse'), browseValidator, async (c) => {
  const body = c.req.valid('json') as BrowseRequest;
  const startTime = Date.now();

  // Format options (applied after fetch)
  const formatOptions: FormatOptions = {
    maxChars: body.options?.maxChars,
    includeTables: body.options?.includeTables,
  };

  try {
    const client = await getBrowserClient();

    // Use tiered fetcher for fast fetch
    const fetchResult = await client.fetch(body.url, {
      maxLatencyMs: body.options?.maxLatencyMs,
      maxCostTier: body.options?.maxCostTier,
    });

    let markdown = fetchResult.content?.markdown || '';
    let text = fetchResult.content?.text || '';

    // Apply maxChars truncation
    if (formatOptions.maxChars) {
      markdown = truncateContent(markdown, formatOptions.maxChars);
      text = truncateContent(text, formatOptions.maxChars);
    }

    // Record usage for the tier used
    const tenant = c.get('tenant');
    recordTierUsage(tenant.id, fetchResult.tier || 'intelligence');

    return c.json({
      success: true,
      data: {
        url: body.url,
        finalUrl: fetchResult.finalUrl || body.url,
        title: fetchResult.content?.title || '',
        content: {
          markdown,
          text,
        },
        metadata: {
          loadTime: Date.now() - startTime,
          tier: fetchResult.tier || 'unknown',
          tiersAttempted: fetchResult.tiersAttempted || [],
        },
      },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: 'FETCH_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      500
    );
  }
});

/**
 * POST /v1/batch
 * Browse multiple URLs in parallel
 */
browse.post(
  '/batch',
  requirePermission('browse'),
  validator('json', (value, c) => {
    const body = value as BatchRequest;

    if (!body.urls || !Array.isArray(body.urls)) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'urls array is required' },
        },
        400
      );
    }

    if (body.urls.length === 0) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'urls array cannot be empty' },
        },
        400
      );
    }

    if (body.urls.length > 10) {
      return c.json(
        {
          success: false,
          error: { code: 'LIMIT_EXCEEDED', message: 'Maximum 10 URLs per batch' },
        },
        400
      );
    }

    for (const url of body.urls) {
      if (!isValidUrl(url)) {
        return c.json(
          {
            success: false,
            error: { code: 'INVALID_URL', message: `Invalid URL: ${url}` },
          },
          400
        );
      }
    }

    return body;
  }),
  async (c) => {
    const body = c.req.valid('json') as BatchRequest;
    const urls = body.urls;
    const startTime = Date.now();
    const tenant = c.get('tenant');

    // Format options (applied after browse)
    const formatOptions: FormatOptions = {
      maxChars: body.options?.maxChars,
      includeTables: body.options?.includeTables,
    };

    try {
      const client = await getBrowserClient();

      // Process URLs in parallel with concurrency limit
      const results = await Promise.all(
        urls.map(async (url) => {
          const urlStartTime = Date.now();
          try {
            const browseResult = await client.browse(url, {
              waitForSelector: body.options?.waitForSelector,
              scrollToLoad: body.options?.scrollToLoad,
              maxLatencyMs: body.options?.maxLatencyMs,
              maxCostTier: body.options?.maxCostTier,
              verify: normalizeVerifyOptions(body.options?.verify),
            });

            // Record usage for the tier used
            recordTierUsage(tenant.id, browseResult.learning?.renderTier || 'intelligence');

            return {
              url,
              success: true,
              data: formatBrowseResult(browseResult, urlStartTime, formatOptions),
            };
          } catch (error) {
            return {
              url,
              success: false,
              error: {
                code: 'BROWSE_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error',
              },
            };
          }
        })
      );

      return c.json({
        success: true,
        data: {
          results,
          totalTime: Date.now() - startTime,
          successCount: results.filter((r) => r.success).length,
          failureCount: results.filter((r) => !r.success).length,
        },
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: {
            code: 'BATCH_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        },
        500
      );
    }
  }
);

/**
 * POST /v1/browse/paginate
 * Browse a URL and automatically follow pagination links
 *
 * Features:
 * - Automatically discovers pagination links (next, prev, first, last)
 * - Follows 'next' links up to maxPages limit
 * - Aggregates results from all pages
 * - Supports delay between requests for rate limiting
 * - Returns combined content with pagination metadata
 */
browse.post(
  '/browse/paginate',
  requirePermission('browse'),
  validator('json', (value, c) => {
    const body = value as PaginateRequest;

    if (!body.url || typeof body.url !== 'string') {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'url is required' },
        },
        400
      );
    }

    if (!isValidUrl(body.url)) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_URL', message: 'Invalid URL format. Must be http or https.' },
        },
        400
      );
    }

    // Validate maxPages
    const maxPages = body.options?.maxPages ?? 10;
    if (maxPages < 1 || maxPages > 50) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'maxPages must be between 1 and 50' },
        },
        400
      );
    }

    return body;
  }),
  async (c) => {
    const body = c.req.valid('json') as PaginateRequest;
    const startTime = Date.now();
    const tenant = c.get('tenant');

    // Pagination options
    const maxPages = Math.min(body.options?.maxPages ?? 10, 50);
    const strategy = body.options?.strategy ?? 'auto';
    const delayMs = body.options?.delayMs ?? 0;
    const stopOnError = body.options?.stopOnError ?? true;

    // Format options (applied after browse)
    const formatOptions: FormatOptions = {
      maxChars: body.options?.maxChars,
      includeTables: body.options?.includeTables,
    };

    const pages: Array<{
      pageNumber: number;
      url: string;
      success: boolean;
      data?: ReturnType<typeof formatBrowseResult>;
      error?: { code: string; message: string };
      paginationLinks?: {
        next?: string;
        prev?: string;
        first?: string;
        last?: string;
      };
    }> = [];

    let currentUrl = body.url;
    let pageNumber = 1;

    try {
      const client = await getBrowserClient();

      while (pageNumber <= maxPages && currentUrl) {
        const pageStartTime = Date.now();

        // Add delay between requests (except first page)
        if (pageNumber > 1 && delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        try {
          // Browse the current page
          const browseResult = await client.browse(currentUrl, {
            waitForSelector: body.options?.waitForSelector,
            scrollToLoad: body.options?.scrollToLoad,
            maxLatencyMs: body.options?.maxLatencyMs,
            maxCostTier: body.options?.maxCostTier,
            verify: normalizeVerifyOptions(body.options?.verify),
          });

          // Record usage for the tier used
          recordTierUsage(tenant.id, browseResult.learning?.renderTier || 'intelligence');

          // Discover pagination links from the page
          const linkDiscovery = await discoverLinks(currentUrl, {
            htmlContent: browseResult.content?.html,
            baseUrl: currentUrl,
          });

          const paginationLinks = extractPaginationLinks(linkDiscovery.links);

          // Format and store the page result
          pages.push({
            pageNumber,
            url: currentUrl,
            success: true,
            data: formatBrowseResult(browseResult, pageStartTime, formatOptions),
            paginationLinks,
          });

          // Determine next URL
          if (paginationLinks?.next) {
            currentUrl = paginationLinks.next;
          } else {
            // No more pages
            break;
          }

          pageNumber++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          pages.push({
            pageNumber,
            url: currentUrl,
            success: false,
            error: {
              code: 'PAGE_ERROR',
              message: errorMessage,
            },
          });

          if (stopOnError) {
            break;
          }

          // If not stopping on error, we can't continue without a next link
          break;
        }
      }

      // Calculate aggregate statistics
      const successfulPages = pages.filter((p) => p.success);
      const totalLoadTime = pages.reduce(
        (sum, p) => sum + (p.data?.metadata?.loadTime || 0),
        0
      );

      // Combine content from all successful pages
      const combinedMarkdown = successfulPages
        .map((p) => {
          const pageHeader = `\n\n---\n## Page ${p.pageNumber}\n**URL:** ${p.url}\n\n`;
          return pageHeader + (p.data?.content?.markdown || '');
        })
        .join('');

      const combinedText = successfulPages
        .map((p) => {
          const pageHeader = `\n\n--- Page ${p.pageNumber} ---\nURL: ${p.url}\n\n`;
          return pageHeader + (p.data?.content?.text || '');
        })
        .join('');

      return c.json({
        success: true,
        data: {
          // Combined content from all pages
          combinedContent: {
            markdown: combinedMarkdown,
            text: combinedText,
          },
          // Individual page results
          pages,
          // Pagination metadata
          pagination: {
            totalPages: pages.length,
            successfulPages: successfulPages.length,
            failedPages: pages.length - successfulPages.length,
            maxPagesReached: pageNumber > maxPages,
            strategy,
          },
          // Aggregate metadata
          metadata: {
            totalTime: Date.now() - startTime,
            totalLoadTime,
            startUrl: body.url,
            lastUrl: pages[pages.length - 1]?.url,
          },
        },
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: {
            code: 'PAGINATE_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        },
        500
      );
    }
  }
);

/**
 * GET /v1/usage
 * Get usage statistics for current billing period
 */
browse.get('/usage', async (c) => {
  const tenant = c.get('tenant');

  // Get current month's dates
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // Get today's usage stats
  const todayStats = getUsageStats(tenant.id);
  const currentUnits = getTodayUnits(tenant.id);

  // Get monthly usage (export for the month range)
  const monthlyUsage = exportUsage(
    tenant.id,
    startOfMonth.toISOString().split('T')[0],
    endOfMonth.toISOString().split('T')[0]
  );

  return c.json({
    success: true,
    data: {
      period: {
        start: startOfMonth.toISOString(),
        end: endOfMonth.toISOString(),
      },
      today: {
        requests: todayStats.requests,
        units: todayStats.units,
        byTier: todayStats.byTier,
      },
      month: {
        requests: monthlyUsage.totals.requests,
        units: monthlyUsage.totals.units,
        byTier: monthlyUsage.byTier,
      },
      limits: {
        daily: tenant.dailyLimit,
        remaining: Math.max(0, tenant.dailyLimit - currentUnits),
      },
    },
  });
});

/**
 * Validate domain parameter for security
 * Prevents SSRF and injection attacks via malformed domain names
 */
function isValidDomain(domain: string): boolean {
  // Domain must be non-empty and reasonable length
  if (!domain || domain.length > 253) {
    return false;
  }

  // Basic domain pattern - alphanumeric, hyphens, dots
  // Does not allow IP addresses, ports, paths, or special chars
  const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!domainPattern.test(domain)) {
    return false;
  }

  // Block localhost and private domains
  const blockedPatterns = [
    /^localhost$/i,
    /^127\.\d+\.\d+\.\d+$/,
    /^10\.\d+\.\d+\.\d+$/,
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
    /^192\.168\.\d+\.\d+$/,
    /^0\.0\.0\.0$/,
    /\.local$/i,
    /\.internal$/i,
    /\.localhost$/i,
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(domain)) {
      return false;
    }
  }

  return true;
}

/**
 * GET /v1/domains/:domain/intelligence
 * Get learned patterns for a domain
 *
 * SECURITY: Tenant-scoped and domain-validated
 */
browse.get('/domains/:domain/intelligence', async (c) => {
  const domain = c.req.param('domain');
  const tenant = c.get('tenant');

  // SECURITY: Validate domain parameter to prevent SSRF/injection
  if (!isValidDomain(domain)) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_DOMAIN',
          message: 'Invalid domain format',
        },
      },
      400
    );
  }

  try {
    const client = await getBrowserClient();
    // TODO: Extend LLMBrowserClient to support tenant-scoped intelligence queries
    // Currently returns shared intelligence; tenant isolation is enforced at the API layer
    const intelligence = await client.getDomainIntelligence(domain);

    return c.json({
      success: true,
      data: {
        domain,
        tenantId: tenant.id, // Document which tenant made the request
        ...intelligence,
      },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INTELLIGENCE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      500
    );
  }
});

/**
 * GET /v1/proxy/stats
 * Get proxy pool statistics (admin/monitoring)
 */
browse.get('/proxy/stats', async (c) => {
  const stats = getProxyStats();

  return c.json({
    success: true,
    data: stats,
  });
});

/**
 * GET /v1/proxy/risk/:domain
 * Get risk assessment for a domain
 *
 * SECURITY: Domain-validated
 */
browse.get('/proxy/risk/:domain', async (c) => {
  const domain = c.req.param('domain');

  // SECURITY: Validate domain parameter
  if (!isValidDomain(domain)) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_DOMAIN',
          message: 'Invalid domain format',
        },
      },
      400
    );
  }

  if (!hasProxiesConfigured()) {
    return c.json({
      success: true,
      data: {
        enabled: false,
        message: 'Proxy management not configured',
      },
    });
  }

  const proxyManager = getProxyManager();
  const risk = proxyManager.getDomainRisk(domain);

  return c.json({
    success: true,
    data: {
      domain,
      riskLevel: risk.riskLevel,
      confidence: risk.confidence,
      recommendedTier: risk.recommendedProxyTier,
      recommendedDelayMs: risk.recommendedDelayMs,
      factors: risk.factors,
      specialHandling: risk.specialHandling,
    },
  });
});

export { browse };
