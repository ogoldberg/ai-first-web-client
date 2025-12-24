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
import { rateLimitMiddleware } from '../middleware/rate-limit.js';

interface BrowseRequest {
  url: string;
  options?: {
    contentType?: 'markdown' | 'text' | 'html';
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
 * POST /v1/browse
 * Browse a URL with intelligent rendering
 */
browse.post('/browse', requirePermission('browse'), browseValidator, async (c) => {
  const body = c.req.valid('json') as BrowseRequest;
  const tenant = c.get('tenant');
  const acceptHeader = c.req.header('Accept') || '';

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
        // TODO: Integrate with actual SmartBrowser
        // For now, return a placeholder response
        await stream.writeSSE({
          event: 'progress',
          data: JSON.stringify({
            stage: 'rendering',
            tier: 'intelligence',
            elapsed: Date.now() - startTime,
          }),
        });

        // Simulate browse operation
        await new Promise((resolve) => setTimeout(resolve, 100));

        const result = {
          success: true,
          data: {
            url: body.url,
            finalUrl: body.url,
            title: 'Page Title',
            content: {
              markdown: '# Placeholder\n\nBrowse integration pending.',
              text: 'Placeholder - Browse integration pending.',
            },
            metadata: {
              loadTime: Date.now() - startTime,
              tier: 'intelligence',
              tiersAttempted: ['intelligence'],
            },
          },
        };

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
    // TODO: Integrate with actual SmartBrowser
    // This is a placeholder that will be replaced with real browsing logic
    const result = {
      success: true,
      data: {
        url: body.url,
        finalUrl: body.url,
        title: 'Page Title',
        content: {
          markdown: '# Placeholder\n\nBrowse integration pending.',
          text: 'Placeholder - Browse integration pending.',
        },
        metadata: {
          loadTime: Date.now() - startTime,
          tier: 'intelligence',
          tiersAttempted: ['intelligence'],
        },
      },
    };

    return c.json(result);
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

  try {
    // TODO: Integrate with TieredFetcher
    const result = {
      success: true,
      data: {
        url: body.url,
        finalUrl: body.url,
        title: 'Fetched Page',
        content: {
          markdown: '# Placeholder\n\nFetch integration pending.',
          text: 'Placeholder - Fetch integration pending.',
        },
        metadata: {
          loadTime: Date.now() - startTime,
          tier: 'intelligence',
          tiersAttempted: ['intelligence'],
        },
      },
    };

    return c.json(result);
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

    // TODO: Integrate with SmartBrowser batch processing
    const results = urls.map((url) => ({
      url,
      success: true,
      data: {
        url,
        finalUrl: url,
        title: 'Batched Page',
        content: {
          markdown: '# Placeholder\n\nBatch integration pending.',
          text: 'Placeholder - Batch integration pending.',
        },
        metadata: {
          loadTime: Date.now() - startTime,
          tier: 'intelligence',
          tiersAttempted: ['intelligence'],
        },
      },
    }));

    return c.json({
      success: true,
      data: {
        results,
        totalTime: Date.now() - startTime,
      },
    });
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

  // TODO: Query actual usage from database
  // For now, return placeholder
  return c.json({
    success: true,
    data: {
      period: {
        start: startOfMonth.toISOString(),
        end: endOfMonth.toISOString(),
      },
      requests: {
        total: 0,
        byTier: {
          intelligence: 0,
          lightweight: 0,
          playwright: 0,
        },
      },
      limits: {
        daily: tenant.dailyLimit,
        remaining: tenant.dailyLimit,
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

  // TODO: Query actual patterns from database
  // For now, return placeholder
  return c.json({
    success: true,
    data: {
      domain,
      knownPatterns: 0,
      selectorChains: 0,
      validators: 0,
      paginationPatterns: 0,
      recentFailures: 0,
      successRate: 0,
      domainGroup: null,
      recommendedWaitStrategy: 'networkidle',
      shouldUseSession: false,
    },
  });
});

export { browse };
