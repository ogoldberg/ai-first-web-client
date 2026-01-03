/**
 * Connect API Routes
 *
 * Endpoints for the Unbrowser Connect SDK, which allows B2B SaaS
 * applications to fetch web content through their users' browsers.
 *
 * Endpoints:
 * - POST /v1/connect/patterns - Sync extraction patterns
 * - POST /v1/connect/learn - Submit new patterns learned from usage
 * - GET /v1/connect/health - Connect service health check
 */

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';

const connect = new Hono();

/**
 * Site-specific extraction patterns
 * These are learned from Unbrowser's cloud processing and
 * synced to SDK clients for client-side extraction.
 */
interface SitePattern {
  domain: string;
  version: string;
  lastUpdated: string;
  selectors: {
    title?: string;
    content?: string;
    author?: string;
    date?: string;
    comments?: string;
    pagination?: string;
    [key: string]: string | undefined;
  };
  contentStructure?: {
    type: 'article' | 'list' | 'forum' | 'product' | 'unknown';
    pagination?: {
      nextSelector?: string;
      pageParamName?: string;
    };
  };
}

// In-memory pattern store (will be replaced with database)
const patterns: Map<string, SitePattern> = new Map([
  [
    'reddit.com',
    {
      domain: 'reddit.com',
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      selectors: {
        title: '.thing .title a',
        content: '.expando .md',
        author: '.thing .author',
        date: '.thing .live-timestamp',
        comments: '.thing .comments',
        upvotes: '.thing .score.unvoted',
      },
      contentStructure: {
        type: 'forum',
        pagination: {
          nextSelector: '.next-button a',
        },
      },
    },
  ],
  [
    'old.reddit.com',
    {
      domain: 'old.reddit.com',
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      selectors: {
        title: '.thing .title a',
        content: '.expando .md',
        author: '.thing .author',
        date: '.thing .live-timestamp',
        comments: '.thing .comments',
        upvotes: '.thing .score.unvoted',
      },
      contentStructure: {
        type: 'forum',
        pagination: {
          nextSelector: '.next-button a',
        },
      },
    },
  ],
]);

// Sync token for delta updates
let globalSyncToken = Date.now().toString(36);

/**
 * POST /v1/connect/patterns
 * Sync extraction patterns to SDK clients
 *
 * Request:
 * - syncToken?: string - Last sync token (for delta updates)
 *
 * Response:
 * - patterns: SitePattern[] - Patterns to cache
 * - syncToken: string - Token for next sync
 */
connect.post('/patterns', authMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { syncToken } = body as { syncToken?: string };

  // Get app ID from header
  const appId = c.req.header('X-App-Id');
  if (!appId) {
    return c.json({ error: 'Missing X-App-Id header' }, 400);
  }

  // If client has current token, return empty update
  if (syncToken === globalSyncToken) {
    return c.json({
      patterns: [],
      syncToken: globalSyncToken,
    });
  }

  // Return all patterns (in production, would filter by app permissions)
  const allPatterns = Array.from(patterns.values());

  return c.json({
    patterns: allPatterns,
    syncToken: globalSyncToken,
  });
});

/**
 * POST /v1/connect/learn
 * Submit learned patterns from SDK usage
 *
 * When the SDK encounters a site without patterns or extraction fails,
 * it can submit the page structure for server-side learning.
 *
 * Request:
 * - domain: string - The domain
 * - url: string - The specific URL
 * - html: string - Page HTML sample
 * - successfulSelectors?: Record<string, string> - Working selectors
 */
connect.post('/learn', authMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { domain, url, html, successfulSelectors } = body as {
    domain?: string;
    url?: string;
    html?: string;
    successfulSelectors?: Record<string, string>;
  };

  if (!domain || !url) {
    return c.json({ error: 'domain and url are required' }, 400);
  }

  // In production, this would:
  // 1. Queue the page for analysis
  // 2. Update pattern database
  // 3. Trigger pattern sync

  console.log(`[Connect] Learning from ${domain}:`, {
    url,
    htmlLength: html?.length || 0,
    selectors: successfulSelectors,
  });

  // Update sync token to trigger client refreshes
  globalSyncToken = Date.now().toString(36);

  return c.json({
    success: true,
    message: 'Pattern submitted for learning',
  });
});

/**
 * GET /v1/connect/health
 * Connect service health check
 */
connect.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    patterns: patterns.size,
    syncToken: globalSyncToken,
  });
});

/**
 * GET /v1/connect/patterns/:domain
 * Get pattern for a specific domain
 */
connect.get('/patterns/:domain', authMiddleware, (c) => {
  const domain = c.req.param('domain');

  const pattern = patterns.get(domain);
  if (!pattern) {
    return c.json({ error: 'No pattern for domain' }, 404);
  }

  return c.json({ pattern });
});

export { connect };
