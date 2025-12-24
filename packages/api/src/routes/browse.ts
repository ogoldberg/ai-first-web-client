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
import { getUsageStats, exportUsage, getTodayUnits, type Tier } from '../services/usage.js';

interface BrowseRequest {
  url: string;
  options?: {
    waitForSelector?: string;
    scrollToLoad?: boolean;
    maxChars?: number;
    includeTables?: boolean;
    maxLatencyMs?: number;
    maxCostTier?: 'intelligence' | 'lightweight' | 'playwright';
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

interface FormatOptions {
  maxChars?: number;
  includeTables?: boolean;
}

const browse = new Hono();

// Apply auth and rate limiting to all routes
browse.use('*', authMiddleware);
browse.use('*', rateLimitMiddleware);

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
function formatBrowseResult(result: any, startTime: number, options: FormatOptions = {}) {
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
    },
    links: result.links,
    apis: result.discoveredApis,
  };

  // Include tables if requested (default: true)
  if (options.includeTables !== false && result.tables) {
    response.tables = result.tables;
  }

  return response;
}

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
        });

        const result = {
          success: true,
          data: formatBrowseResult(browseResult, startTime, formatOptions),
        };

        // Record usage for the tier used
        const tenant = c.get('tenant');
        recordTierUsage(tenant.id, browseResult.tier || 'intelligence');

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

  try {
    const client = await getBrowserClient();

    const browseResult = await client.browse(body.url, {
      waitForSelector: body.options?.waitForSelector,
      scrollToLoad: body.options?.scrollToLoad,
      maxLatencyMs: body.options?.maxLatencyMs,
      maxCostTier: body.options?.maxCostTier,
    });

    // Record usage for the tier used
    const tenant = c.get('tenant');
    recordTierUsage(tenant.id, browseResult.tier || 'intelligence');

    return c.json({
      success: true,
      data: formatBrowseResult(browseResult, startTime, formatOptions),
    });
  } catch (error) {
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
            });

            // Record usage for the tier used
            recordTierUsage(tenant.id, browseResult.tier || 'intelligence');

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
 * GET /v1/domains/:domain/intelligence
 * Get learned patterns for a domain
 */
browse.get('/domains/:domain/intelligence', async (c) => {
  const domain = c.req.param('domain');

  try {
    const client = await getBrowserClient();
    const intelligence = await client.getDomainIntelligence(domain);

    return c.json({
      success: true,
      data: {
        domain,
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

export { browse };
