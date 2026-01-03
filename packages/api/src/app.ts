/**
 * Unbrowser API Server
 *
 * Hono-based REST API for the Unbrowser cloud service.
 * Provides intelligent browsing capabilities via HTTP endpoints.
 *
 * Domain: api.unbrowser.ai
 *
 * Marketing routes (/, /pricing, /auth, /dashboard) are served from
 * www.unbrowser.ai by the unbrowser-marketing project. This API server
 * redirects any marketing route requests to the marketing domain.
 *
 * IMPORTANT: API routes that depend on unbrowser are dynamically imported
 * to avoid loading native modules when not needed.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { HTTPException } from 'hono/http-exception';
import { requestLoggerMiddleware } from './middleware/request-logger.js';

// Shared routes (no unbrowser dependency)
import { health } from './routes/health.js';
import { llmDocs } from './routes/llm-docs.js';

// Marketing domain for redirects
const MARKETING_DOMAIN = process.env.MARKETING_DOMAIN || 'www.unbrowser.ai';

// Create the main Hono app
const app = new Hono();

// Global middleware
app.use('*', requestLoggerMiddleware);
app.use(
  '*',
  secureHeaders({
    // Content Security Policy - restrict resource loading
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'], // unpkg for Swagger UI
      styleSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://fonts.googleapis.com'], // unpkg for Swagger UI, Google Fonts
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      objectSrc: ["'none'"],
      mediaSrc: ["'none'"],
      frameSrc: ["'none'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: [],
    },
    // Prevent MIME type sniffing
    xContentTypeOptions: 'nosniff',
    // Prevent clickjacking
    xFrameOptions: 'DENY',
    // Enable XSS filter in older browsers
    xXssProtection: '1; mode=block',
    // Referrer policy - only send origin for cross-origin requests
    referrerPolicy: 'strict-origin-when-cross-origin',
    // Strict Transport Security - enforce HTTPS
    strictTransportSecurity: 'max-age=31536000; includeSubDomains',
    // Prevent browser features we don't need
    permissionsPolicy: {
      camera: [],
      microphone: [],
      geolocation: [],
      accelerometer: [],
      gyroscope: [],
      magnetometer: [],
      payment: [],
      usb: [],
    },
  })
);
app.use('*', prettyJSON());
// CORS configuration - environment-aware origin handling
const corsOrigins =
  process.env.NODE_ENV === 'production'
    ? ['https://unbrowser.ai', 'https://www.unbrowser.ai', 'https://api.unbrowser.ai']
    : ['https://unbrowser.ai', 'http://localhost:3000', 'http://localhost:3001'];

app.use(
  '*',
  cors({
    origin: corsOrigins,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposeHeaders: [
      'X-Request-Id',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'Retry-After',
    ],
    maxAge: 86400, // 24 hours
    credentials: true,
  })
);

// =============================================================================
// SHARED ROUTES
// =============================================================================
app.route('/health', health);

// =============================================================================
// MARKETING ROUTES - Redirect to www.unbrowser.ai
// =============================================================================

// Middleware to redirect marketing routes to the marketing domain
const redirectToMarketing = async (c: any) => {
  const url = new URL(c.req.url);
  url.host = MARKETING_DOMAIN;
  url.protocol = 'https:';
  url.port = '';
  return c.redirect(url.toString(), 301);
};

// Redirect all marketing routes to www.unbrowser.ai
const marketingPaths = ['/auth', '/dashboard', '/pricing'];
for (const path of marketingPaths) {
  app.get(`${path}/*`, redirectToMarketing);
  app.get(path, redirectToMarketing);
}

// =============================================================================
// ROOT ENDPOINT - API welcome or redirect to marketing
// =============================================================================

app.get('/', async (c) => {
  const accept = c.req.header('Accept') || '';

  // If browser is requesting HTML, redirect to marketing site
  if (accept.includes('text/html') && !accept.includes('application/json')) {
    return c.redirect(`https://${MARKETING_DOMAIN}/`, 301);
  }

  // API clients get JSON response
  return c.json({
    name: 'Unbrowser API',
    version: '0.1.0',
    docs: '/docs',
    marketing: `https://${MARKETING_DOMAIN}`,
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
      skillPacks: '/v1/skill-packs',
      workflows: '/v1/workflows',
      marketplace: '/v1/marketplace',
      billing: '/v1/billing',
      llmDocs: '/llm.txt',
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

/**
 * Initialize API routes
 * This function dynamically imports routes that depend on unbrowser
 * to avoid loading native modules at startup.
 */
async function initializeApiRoutes(): Promise<void> {
  console.log('Initializing API routes...');

  try {
    // Dynamic imports to load routes lazily
    const [
      docsModule,
      browseModule,
      discoveryModule,
      adminModule,
      dashboardModule,
      workflowsModule,
      skillPacksModule,
      marketplaceModule,
      billingModule,
      adminUIModule,
      inspectionUIModule,
      pdfModule,
      betaModule,
      predictionsModule,
      connectModule,
    ] = await Promise.all([
      import('./routes/docs.js'),
      import('./routes/browse.js'),
      import('./routes/discovery.js'),
      import('./routes/admin.js'),
      import('./routes/dashboard.js'),
      import('./routes/workflows.js'),
      import('./routes/skill-packs.js'),
      import('./routes/marketplace.js'),
      import('./routes/billing.js'),
      import('./routes/admin-ui.js'),
      import('./routes/inspection-ui.js'),
      import('./routes/pdf.js'),
      import('./routes/beta.js'),
      import('./routes/predictions.js'),
      import('./routes/connect.js'),
    ]);

    // Extract exports (some use named, some use default)
    const docs = docsModule.docs;
    const browse = browseModule.browse;
    const discovery = discoveryModule.default;
    const admin = adminModule.admin;
    const dashboard = dashboardModule.dashboard;
    const workflows = workflowsModule.default;
    const skillPacks = skillPacksModule.skillPacks;
    const marketplace = marketplaceModule.default;
    const billing = billingModule.billing;
    const adminUI = adminUIModule.adminUI;
    const inspectionUI = inspectionUIModule.inspectionUI;
    const pdf = pdfModule.pdf;
    const beta = betaModule.beta;
    const predictions = predictionsModule.default;
    const connect = connectModule.connect;

    // API documentation
    app.route('/docs', docs); // API-011: Interactive API documentation

    // Core API endpoints
    app.route('/v1', browse);
    app.route('/v1/discover', discovery); // FUZZ-001: API fuzzing discovery
    app.route('/v1/admin', admin);
    app.route('/v1/admin/dashboard', dashboard); // API-008: Admin dashboard API
    app.route('/v1/workflows', workflows); // COMP-009: Workflow recording
    app.route('/v1/skill-packs', skillPacks); // PACK-001: Skill pack distribution
    app.route('/v1/marketplace', marketplace); // FEAT-005: Pattern marketplace
    app.route('/v1/billing', billing); // API-007: Stripe billing integration

    // Admin UI
    app.route('/admin', adminUI); // API-008: Admin dashboard UI

    // Inspection UI
    app.route('/inspect', inspectionUI); // F-013: Human-in-the-loop inspection UI

    // PDF form extraction (INT-017)
    app.route('/v1/pdf', pdf); // PDF form field extraction

    // Beta program (API-017)
    app.route('/v1/beta', beta); // Beta waitlist, invites, feedback

    // Content change predictions (INT-018)
    app.route('/v1/predictions', predictions); // Content change predictions API

    // Unbrowser Connect SDK (CONN-001: B2B SaaS browser-side fetching)
    app.route('/v1/connect', connect); // Pattern sync, learning, health

    // LLM documentation (also available in marketing mode via redirect)
    app.route('', llmDocs); // LLM documentation at /llm.txt, /llm.md

    console.log('API routes initialized');
  } catch (error) {
    console.error('Failed to initialize API routes:', error);
    throw error;
  }
}

export { app, initializeApiRoutes };
