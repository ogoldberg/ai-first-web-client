/**
 * Unbrowser API Server
 *
 * Hono-based REST API for the Unbrowser cloud service.
 * Provides intelligent browsing capabilities via HTTP endpoints.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { HTTPException } from 'hono/http-exception';
import { health } from './routes/health.js';
import { browse } from './routes/browse.js';
import { admin } from './routes/admin.js';
import workflows from './routes/workflows.js';
import { billing } from './routes/billing.js';
import { docs } from './routes/docs.js';
import { requestLoggerMiddleware } from './middleware/request-logger.js';

// Create the main Hono app
const app = new Hono();

// Global middleware
app.use('*', requestLoggerMiddleware);
app.use('*', secureHeaders());
app.use('*', prettyJSON());
app.use(
  '*',
  cors({
    origin: ['https://unbrowser.ai', 'http://localhost:3000'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 86400,
    credentials: true,
  })
);

// Mount routes
app.route('/health', health);
app.route('/docs', docs); // API-011: Interactive API documentation
app.route('/v1', browse);
app.route('/v1/admin', admin);
app.route('/v1/workflows', workflows); // COMP-009: Workflow recording
app.route('/v1/billing', billing); // API-007: Stripe billing integration

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'Unbrowser API',
    version: '0.1.0',
    docs: '/docs',
    endpoints: {
      docs: '/docs',
      openapi: '/docs/openapi.json',
      gettingStarted: '/docs/getting-started',
      health: '/health',
      browse: '/v1/browse',
      batch: '/v1/batch',
      fetch: '/v1/fetch',
      intelligence: '/v1/domains/:domain/intelligence',
      usage: '/v1/usage',
      adminLogs: '/v1/admin/logs',
      workflows: '/v1/workflows',
      recordWorkflow: '/v1/workflows/record/start',
      replayWorkflow: '/v1/workflows/:id/replay',
      billing: '/v1/billing',
      billingWebhook: '/v1/billing/webhook',
    },
  });
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${c.req.method} ${c.req.path} not found`,
      },
    },
    404
  );
});

// Global error handler
app.onError((err, c) => {
  // Handle HTTPException (auth errors, rate limits, etc.)
  if (err instanceof HTTPException) {
    const status = err.status;
    let code = 'ERROR';

    // Map status codes to error codes
    if (status === 401) code = 'UNAUTHORIZED';
    else if (status === 403) code = 'FORBIDDEN';
    else if (status === 429) code = 'RATE_LIMIT_EXCEEDED';
    else if (status === 400) code = 'BAD_REQUEST';

    return c.json(
      {
        success: false,
        error: {
          code,
          message: err.message,
        },
      },
      status
    );
  }

  // Log unexpected errors
  console.error('Unhandled error:', err);

  // Don't expose internal error details in production
  const isDev = process.env.NODE_ENV === 'development';

  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: isDev ? err.message : 'An internal error occurred',
        ...(isDev && { stack: err.stack }),
      },
    },
    500
  );
});

export { app };
