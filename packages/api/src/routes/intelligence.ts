/**
 * Intelligence Routes
 *
 * HTTP API endpoints for AI browser tools integration.
 * These endpoints allow AI browser tools (Claude-in-Chrome, Atlas, Comet, etc.)
 * to check if Unbrowser can handle a URL before using browser automation.
 *
 * Usage:
 * 1. Call GET /v1/intelligence/check?url=... to see if Unbrowser can handle it
 * 2. If canFetchDirectly=true, call POST /v1/intelligence/get to get content
 * 3. If success=true, use the content (no browser needed!)
 * 4. If success=false, use browserHints for effective automation
 */

import { Hono } from 'hono';
import { validator } from 'hono/validator';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import {
  handleUnbrowserGet,
  handleUnbrowserCheck,
  type UnbrowserGetArgs,
  type UnbrowserCheckArgs,
} from '../../../../src/mcp/handlers/intelligence-handlers.js';

export const intelligence = new Hono();

// Apply auth and rate limiting to all intelligence routes
intelligence.use('*', authMiddleware);
intelligence.use('*', rateLimitMiddleware);

/**
 * GET /v1/intelligence/check
 *
 * Check what Unbrowser knows about a URL BEFORE browsing.
 * Use this to decide whether to try GET or go straight to browser automation.
 *
 * Query params:
 * - url: The URL to check (required)
 *
 * Returns:
 * - canFetchDirectly: boolean - whether unbrowser_get is likely to work
 * - reason: why or why not
 * - knowledge: learned patterns, template type, success rate
 * - quirks: rate limits, anti-bot info, auth requirements
 * - recommendations: suggested approach
 * - knownSelectors: CSS selectors that work on this site
 */
intelligence.get(
  '/check',
  validator('query', (value, c) => {
    const url = value['url'];
    if (!url || typeof url !== 'string') {
      return c.json(
        {
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'Missing required query parameter: url',
          },
        },
        400
      );
    }
    // Validate URL format
    try {
      new URL(url);
    } catch {
      return c.json(
        {
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'Invalid URL format',
          },
        },
        400
      );
    }
    return { url };
  }),
  async (c) => {
    const { url } = c.req.valid('query');

    try {
      const args: UnbrowserCheckArgs = { url };
      const result = await handleUnbrowserCheck(args);

      // Extract the JSON content from the MCP response format
      const content = result.content?.[0];
      if (content?.type === 'text' && content.text) {
        const parsed = JSON.parse(content.text);
        return c.json({
          success: true,
          ...parsed,
        });
      }

      return c.json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unexpected response format',
        },
      }, 500);
    } catch (error) {
      console.error('Intelligence check error:', error);
      return c.json(
        {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        },
        500
      );
    }
  }
);

/**
 * POST /v1/intelligence/get
 *
 * Get content from a URL WITHOUT browser automation.
 * The server attempts to fetch using cache, discovered APIs, or stealth fetch.
 *
 * Body:
 * - url: The URL to fetch (required)
 * - extract: What to extract - 'auto' | 'product' | 'article' | 'structured' | 'markdown' | 'text'
 * - maxAge: Accept cached data up to N seconds old (default: 3600)
 * - timeout: Fetch timeout in ms (default: 15000)
 *
 * Returns:
 * - success: boolean
 * - source: 'cache' | 'api' | 'fetch' | 'unavailable'
 * - content: { title, markdown, text, structured } if successful
 * - fallback: { reason, suggestion } if browser automation needed
 * - browserHints: { selectors, stealthMode, rateLimit } for effective browsing
 */
intelligence.post(
  '/get',
  validator('json', (value, c) => {
    const url = value['url'];
    if (!url || typeof url !== 'string') {
      return c.json(
        {
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'Missing required field: url',
          },
        },
        400
      );
    }
    // Validate URL format
    try {
      new URL(url);
    } catch {
      return c.json(
        {
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'Invalid URL format',
          },
        },
        400
      );
    }

    // Validate extract type if provided
    const extract = value['extract'];
    const validExtractTypes = ['auto', 'product', 'article', 'structured', 'markdown', 'text'];
    if (extract && !validExtractTypes.includes(extract)) {
      return c.json(
        {
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: `Invalid extract type. Valid types: ${validExtractTypes.join(', ')}`,
          },
        },
        400
      );
    }

    return {
      url,
      extract: extract || 'auto',
      maxAge: typeof value['maxAge'] === 'number' ? value['maxAge'] : 3600,
      timeout: typeof value['timeout'] === 'number' ? value['timeout'] : 15000,
    };
  }),
  async (c) => {
    const args = c.req.valid('json') as UnbrowserGetArgs;

    try {
      const result = await handleUnbrowserGet(args);

      // Extract the JSON content from the MCP response format
      const content = result.content?.[0];
      if (content?.type === 'text' && content.text) {
        const parsed = JSON.parse(content.text);
        return c.json(parsed);
      }

      return c.json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unexpected response format',
        },
      }, 500);
    } catch (error) {
      console.error('Intelligence get error:', error);
      return c.json(
        {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        },
        500
      );
    }
  }
);

/**
 * GET /v1/intelligence/status
 *
 * Get status and statistics about the intelligence service.
 */
intelligence.get('/status', async (c) => {
  return c.json({
    success: true,
    service: 'unbrowser-intelligence',
    version: '1.0.0',
    description: 'AI browser tools integration - try Unbrowser FIRST before browser automation',
    endpoints: {
      check: {
        method: 'GET',
        path: '/v1/intelligence/check',
        description: 'Check if Unbrowser can handle a URL',
      },
      get: {
        method: 'POST',
        path: '/v1/intelligence/get',
        description: 'Get content from a URL without browser automation',
      },
    },
    compatibleWith: [
      'Claude-in-Chrome',
      'OpenAI Atlas',
      'Perplexity Comet',
      'browser-use',
      'Playwright MCP',
      'Any LLM-driven browser',
    ],
  });
});

export default intelligence;
