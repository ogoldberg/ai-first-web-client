/**
 * Unbrowser API Server
 *
 * Hono-based REST API for the Unbrowser cloud service.
 * Provides intelligent browsing capabilities via HTTP endpoints.
 *
 * Domain Routing:
 * - unbrowser.ai / www.unbrowser.ai -> Marketing site (landing, pricing, auth, dashboard)
 * - api.unbrowser.ai -> API endpoints only
 * - localhost:3001 -> Both (for development)
 *
 * IMPORTANT: API routes that depend on llm-browser are dynamically imported
 * to avoid loading native modules in marketing-only mode.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { HTTPException } from 'hono/http-exception';
import { requestLoggerMiddleware } from './middleware/request-logger.js';

// Shared routes (no llm-browser dependency)
import { health } from './routes/health.js';
import { pricingCalculator } from './routes/pricing-calculator.js';

// Marketing routes (no llm-browser dependency)
import { auth } from './routes/auth.js';
import { dashboardUI } from './routes/dashboard-ui.js';
import { landing } from './routes/landing.js';
import { pricingPage } from './routes/pricing-page.js';
import { llmDocs } from './routes/llm-docs.js';

// Server mode - set via UNBROWSER_MODE environment variable
// - 'marketing': Only serve marketing pages (unbrowser.ai)
// - 'api': Only serve API endpoints (api.unbrowser.ai)
// - 'all' or unset: Serve everything (development/localhost)
const SERVER_MODE = process.env.UNBROWSER_MODE || 'all';

// Helper to check if we're in marketing-only mode
function isMarketingMode(): boolean {
  return SERVER_MODE === 'marketing';
}

// Helper to check if we're in API-only mode
function isApiMode(): boolean {
  return SERVER_MODE === 'api';
}

// Helper to check if we're serving all routes (development)
function isAllMode(): boolean {
  return SERVER_MODE === 'all' || !SERVER_MODE;
}

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
// SHARED ROUTES (available in all modes)
// =============================================================================
app.route('/health', health);

// =============================================================================
// API ROUTES (api.unbrowser.ai - UNBROWSER_MODE=api)
// =============================================================================

// Middleware to redirect API routes to api.unbrowser.ai when in marketing mode
const apiOnlyMiddleware = async (c: any, next: any) => {
  if (isMarketingMode()) {
    // Redirect to API domain
    const url = new URL(c.req.url);
    url.host = 'api.unbrowser.ai';
    url.protocol = 'https:';
    url.port = '';
    return c.redirect(url.toString(), 301);
  }
  return next();
};

// In marketing mode, redirect API routes to api.unbrowser.ai
if (isMarketingMode()) {
  app.use('/docs/*', apiOnlyMiddleware);
  app.use('/docs', apiOnlyMiddleware);
  app.use('/v1/*', apiOnlyMiddleware);
  app.use('/admin/*', apiOnlyMiddleware);
  app.use('/admin', apiOnlyMiddleware);
  app.use('/inspect/*', apiOnlyMiddleware);
  app.use('/inspect', apiOnlyMiddleware);
  app.use('/llm.txt', apiOnlyMiddleware);
  app.use('/llm.md', apiOnlyMiddleware);
}

// =============================================================================
// MARKETING ROUTES (unbrowser.ai - UNBROWSER_MODE=marketing)
// =============================================================================

// Middleware to redirect marketing routes to unbrowser.ai when in API mode
const marketingOnlyMiddleware = async (c: any, next: any) => {
  if (isApiMode()) {
    // Redirect to marketing domain
    const url = new URL(c.req.url);
    url.host = 'unbrowser.ai';
    url.protocol = 'https:';
    url.port = '';
    return c.redirect(url.toString(), 301);
  }
  return next();
};

// Only mount marketing routes if not in API-only mode
if (!isApiMode()) {
  // Authentication pages
  app.route('/auth', auth); // User authentication (signup, login, OAuth)

  // User dashboard
  app.route('/dashboard', dashboardUI); // User dashboard (API keys, usage, settings)

  // Pricing pages - calculator must be before pricing page to take precedence
  app.route('/pricing/calculator', pricingCalculator); // API-016: Interactive pricing calculator
  app.route('/pricing', pricingPage); // Marketing pricing page
} else {
  // In API mode, redirect marketing routes to unbrowser.ai
  app.use('/auth/*', marketingOnlyMiddleware);
  app.use('/auth', marketingOnlyMiddleware);
  app.use('/dashboard/*', marketingOnlyMiddleware);
  app.use('/dashboard', marketingOnlyMiddleware);
  app.use('/pricing/*', marketingOnlyMiddleware);
  app.use('/pricing', marketingOnlyMiddleware);
}

// =============================================================================
// ROOT ENDPOINT - Mode-aware routing
// =============================================================================

app.get('/', async (c, next) => {
  const accept = c.req.header('Accept') || '';

  // API mode - always serve JSON
  if (isApiMode()) {
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
        skillPacks: '/v1/skill-packs',
        workflows: '/v1/workflows',
        marketplace: '/v1/marketplace',
        billing: '/v1/billing',
        llmDocs: '/llm.txt',
      },
    });
  }

  // Marketing mode - always serve landing page
  if (isMarketingMode()) {
    return next(); // Fall through to landing page
  }

  // All mode (development) - content negotiation
  if (accept.includes('application/json') && !accept.includes('text/html')) {
    return c.json({
      name: 'Unbrowser API',
      version: '0.1.0',
      mode: SERVER_MODE,
      docs: '/docs',
      marketing: {
        landing: '/',
        pricing: '/pricing',
        auth: '/auth/login',
        dashboard: '/dashboard',
      },
      api: {
        browse: '/v1/browse',
        batch: '/v1/batch',
        fetch: '/v1/fetch',
        docs: '/docs',
        llmDocs: '/llm.txt',
      },
    });
  }

  // Serve landing page HTML for browsers
  return next();
});

// Mount landing page (only in marketing or all mode)
if (!isApiMode()) {
  app.route('', landing);
}

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
 * Initialize API routes (only when not in marketing mode)
 * This function dynamically imports routes that depend on llm-browser
 * to avoid loading native modules when they're not needed.
 */
async function initializeApiRoutes(): Promise<void> {
  if (isMarketingMode()) {
    console.log('Marketing mode: Skipping API route initialization');
    return;
  }

  console.log('Initializing API routes...');

  try {
    // Dynamic imports to avoid loading llm-browser in marketing mode
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

    // LLM documentation (also available in marketing mode via redirect)
    app.route('', llmDocs); // LLM documentation at /llm.txt, /llm.md

    console.log('API routes initialized');
  } catch (error) {
    console.error('Failed to initialize API routes:', error);
    console.error('API routes will not be available. This is expected in marketing-only mode.');
  }
}

export { app, initializeApiRoutes };
