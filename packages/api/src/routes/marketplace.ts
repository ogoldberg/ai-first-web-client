/**
 * Pattern Marketplace API Routes (FEAT-005)
 *
 * Community-driven pattern sharing and discovery
 *
 * Public Endpoints (no auth):
 * - GET /v1/marketplace/patterns - Search patterns
 * - GET /v1/marketplace/patterns/:id - Get pattern details
 * - GET /v1/marketplace/patterns/:id/ratings - Get pattern ratings
 * - GET /v1/marketplace/analytics - Get marketplace analytics
 *
 * Authenticated Endpoints:
 * - POST /v1/marketplace/patterns - Publish pattern
 * - PATCH /v1/marketplace/patterns/:id - Update pattern
 * - DELETE /v1/marketplace/patterns/:id - Delete pattern
 * - POST /v1/marketplace/patterns/:id/install - Install pattern
 * - DELETE /v1/marketplace/patterns/:id/install - Uninstall pattern
 * - POST /v1/marketplace/patterns/:id/rate - Rate pattern
 * - POST /v1/marketplace/patterns/:id/report - Report pattern
 * - GET /v1/marketplace/my/patterns - Get user's published patterns
 * - GET /v1/marketplace/my/installations - Get user's installed patterns
 * - GET /v1/marketplace/my/patterns/:id/stats - Get pattern statistics
 *
 * Admin Endpoints:
 * - POST /v1/marketplace/patterns/:id/moderate - Moderate pattern
 * - GET /v1/marketplace/admin/reports - Get all reports
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, requirePermission, optionalAuthMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { getMarketplaceService } from '../../../../src/services/pattern-marketplace.js';

const marketplace = new Hono();

// ============================================
// Request Validators
// ============================================

const patternCategorySchema = z.enum([
  'ecommerce',
  'government',
  'news',
  'social-media',
  'documentation',
  'finance',
  'real-estate',
  'jobs',
  'travel',
  'health',
  'education',
  'entertainment',
  'sports',
  'weather',
  'other',
]);

const patternTypeSchema = z.enum(['api', 'selector', 'workflow', 'skill', 'websocket']);

const publishPatternValidator = zValidator(
  'json',
  z.object({
    patternType: patternTypeSchema,
    patternData: z.any(),
    name: z.string().min(3).max(200),
    description: z.string().min(10).max(2000),
    category: patternCategorySchema,
    tags: z.array(z.string()).min(1).max(10),
    domain: z.string().min(1).max(500),
    targetSite: z.string().max(200).optional(),
    exampleUrl: z.string().url().optional(),
    version: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
    changelog: z.string().max(1000).optional(),
    updateExisting: z.string().uuid().optional(),
  })
);

const updatePatternValidator = zValidator(
  'json',
  z.object({
    name: z.string().min(3).max(200).optional(),
    description: z.string().min(10).max(2000).optional(),
    category: patternCategorySchema.optional(),
    tags: z.array(z.string()).min(1).max(10).optional(),
    targetSite: z.string().max(200).optional(),
    exampleUrl: z.string().url().optional(),
    version: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
    changelog: z.string().max(1000).optional(),
    patternData: z.any().optional(),
  })
);

const ratePatternValidator = zValidator(
  'json',
  z.object({
    rating: z.number().int().min(1).max(5),
    review: z.string().max(2000).optional(),
    title: z.string().max(200).optional(),
    verified: z.boolean().optional(),
  })
);

const reportPatternValidator = zValidator(
  'json',
  z.object({
    reason: z.enum(['spam', 'broken', 'inappropriate', 'duplicate', 'malicious', 'other']),
    details: z.string().max(1000).optional(),
  })
);

const moderatePatternValidator = zValidator(
  'json',
  z.object({
    status: z.enum(['pending', 'approved', 'rejected', 'flagged', 'suspended']),
    notes: z.string().max(1000).optional(),
  })
);

const searchPatternsValidator = zValidator(
  'query',
  z.object({
    query: z.string().optional(),
    category: patternCategorySchema.optional(),
    patternType: patternTypeSchema.optional(),
    tags: z.string().optional(), // Comma-separated
    domain: z.string().optional(),
    authorId: z.string().uuid().optional(),
    minRating: z.string().transform(Number).optional(),
    minInstalls: z.string().transform(Number).optional(),
    verified: z.string().transform(v => v === 'true').optional(),
    featured: z.string().transform(v => v === 'true').optional(),
    official: z.string().transform(v => v === 'true').optional(),
    sortBy: z.enum(['relevance', 'rating', 'installs', 'newest', 'updated']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    page: z.string().transform(Number).optional(),
    limit: z.string().transform(Number).optional(),
  })
);

// ============================================
// Public Endpoints (No Auth Required)
// ============================================

/**
 * GET /v1/marketplace/patterns
 * Search and discover patterns
 */
marketplace.get('/patterns', searchPatternsValidator, async (c) => {
  const query = c.req.valid('query');

  try {
    const service = getMarketplaceService();
    const filters = {
      ...query,
      tags: query.tags ? query.tags.split(',').map(t => t.trim()) : undefined,
    };

    const result = service.searchPatterns(filters);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || 'Failed to search patterns',
      },
      500
    );
  }
});

/**
 * GET /v1/marketplace/patterns/:id
 * Get pattern details
 */
marketplace.get('/patterns/:id', async (c) => {
  const patternId = c.req.param('id');

  try {
    const service = getMarketplaceService();
    const pattern = service.getPattern(patternId);

    if (!pattern) {
      return c.json(
        {
          success: false,
          error: 'Pattern not found',
        },
        404
      );
    }

    return c.json({
      success: true,
      data: pattern,
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || 'Failed to get pattern',
      },
      500
    );
  }
});

/**
 * GET /v1/marketplace/patterns/:id/ratings
 * Get pattern ratings and reviews
 */
marketplace.get('/patterns/:id/ratings', async (c) => {
  const patternId = c.req.param('id');

  try {
    const service = getMarketplaceService();
    const ratings = service.getPatternRatings(patternId);

    return c.json({
      success: true,
      data: { ratings },
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || 'Failed to get ratings',
      },
      500
    );
  }
});

/**
 * GET /v1/marketplace/analytics
 * Get marketplace-wide analytics
 */
marketplace.get('/analytics', async (c) => {
  try {
    const service = getMarketplaceService();
    const analytics = service.getMarketplaceAnalytics();

    return c.json({
      success: true,
      data: analytics,
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || 'Failed to get analytics',
      },
      500
    );
  }
});

// ============================================
// Authenticated Endpoints
// ============================================

// Apply auth and rate limiting to remaining routes
marketplace.use('*', authMiddleware);
marketplace.use('*', rateLimitMiddleware);

/**
 * POST /v1/marketplace/patterns
 * Publish a new pattern or update existing
 */
marketplace.post('/patterns', requirePermission('browse'), publishPatternValidator, async (c) => {
  const tenant = c.get('tenant');
  const body = c.req.valid('json');

  try {
    const service = getMarketplaceService();
    const pattern = await service.publishPattern({
      ...body,
      tenantId: tenant.id,
    });

    return c.json(
      {
        success: true,
        data: pattern,
      },
      201
    );
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || 'Failed to publish pattern',
      },
      400
    );
  }
});

/**
 * PATCH /v1/marketplace/patterns/:id
 * Update pattern metadata
 */
marketplace.patch('/patterns/:id', requirePermission('browse'), updatePatternValidator, async (c) => {
  const tenant = c.get('tenant');
  const patternId = c.req.param('id');
  const body = c.req.valid('json');

  try {
    const service = getMarketplaceService();
    const pattern = await service.updatePattern(patternId, tenant.id, body);

    return c.json({
      success: true,
      data: pattern,
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || 'Failed to update pattern',
      },
      400
    );
  }
});

/**
 * DELETE /v1/marketplace/patterns/:id
 * Delete a pattern
 */
marketplace.delete('/patterns/:id', requirePermission('browse'), async (c) => {
  const tenant = c.get('tenant');
  const patternId = c.req.param('id');

  try {
    const service = getMarketplaceService();
    await service.deletePattern(patternId, tenant.id, false);

    return c.json({
      success: true,
      data: { message: 'Pattern deleted successfully' },
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || 'Failed to delete pattern',
      },
      400
    );
  }
});

/**
 * POST /v1/marketplace/patterns/:id/install
 * Install a pattern
 */
marketplace.post('/patterns/:id/install', requirePermission('browse'), async (c) => {
  const tenant = c.get('tenant');
  const patternId = c.req.param('id');

  try {
    const service = getMarketplaceService();
    const installation = await service.installPattern(patternId, tenant.id);

    return c.json(
      {
        success: true,
        data: installation,
      },
      201
    );
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || 'Failed to install pattern',
      },
      400
    );
  }
});

/**
 * DELETE /v1/marketplace/patterns/:id/install
 * Uninstall a pattern
 */
marketplace.delete('/patterns/:id/install', requirePermission('browse'), async (c) => {
  const tenant = c.get('tenant');
  const patternId = c.req.param('id');

  try {
    const service = getMarketplaceService();
    await service.uninstallPattern(patternId, tenant.id);

    return c.json({
      success: true,
      data: { message: 'Pattern uninstalled successfully' },
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || 'Failed to uninstall pattern',
      },
      400
    );
  }
});

/**
 * POST /v1/marketplace/patterns/:id/rate
 * Rate a pattern
 */
marketplace.post('/patterns/:id/rate', requirePermission('browse'), ratePatternValidator, async (c) => {
  const tenant = c.get('tenant');
  const patternId = c.req.param('id');
  const body = c.req.valid('json');

  try {
    const service = getMarketplaceService();
    const rating = await service.ratePattern(patternId, tenant.id, body);

    return c.json(
      {
        success: true,
        data: rating,
      },
      201
    );
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || 'Failed to rate pattern',
      },
      400
    );
  }
});

/**
 * POST /v1/marketplace/patterns/:id/report
 * Report a pattern
 */
marketplace.post('/patterns/:id/report', requirePermission('browse'), reportPatternValidator, async (c) => {
  const tenant = c.get('tenant');
  const patternId = c.req.param('id');
  const body = c.req.valid('json');

  try {
    const service = getMarketplaceService();
    const report = await service.reportPattern(patternId, tenant.id, body.reason, body.details);

    return c.json(
      {
        success: true,
        data: report,
      },
      201
    );
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || 'Failed to report pattern',
      },
      400
    );
  }
});

/**
 * GET /v1/marketplace/my/patterns
 * Get user's published patterns
 */
marketplace.get('/my/patterns', requirePermission('browse'), async (c) => {
  const tenant = c.get('tenant');

  try {
    const service = getMarketplaceService();
    const result = service.searchPatterns({
      authorId: tenant.id,
      sortBy: 'newest',
      limit: 100,
    });

    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || 'Failed to get patterns',
      },
      500
    );
  }
});

/**
 * GET /v1/marketplace/my/installations
 * Get user's installed patterns
 */
marketplace.get('/my/installations', requirePermission('browse'), async (c) => {
  const tenant = c.get('tenant');

  try {
    const service = getMarketplaceService();
    const installations = service.getUserInstallations(tenant.id);

    return c.json({
      success: true,
      data: { installations },
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || 'Failed to get installations',
      },
      500
    );
  }
});

/**
 * GET /v1/marketplace/my/patterns/:id/stats
 * Get pattern statistics (for authors)
 */
marketplace.get('/my/patterns/:id/stats', requirePermission('browse'), async (c) => {
  const tenant = c.get('tenant');
  const patternId = c.req.param('id');

  try {
    const service = getMarketplaceService();
    const pattern = service.getPattern(patternId);

    if (!pattern) {
      return c.json(
        {
          success: false,
          error: 'Pattern not found',
        },
        404
      );
    }

    if (pattern.authorId !== tenant.id) {
      return c.json(
        {
          success: false,
          error: 'Unauthorized - not pattern author',
        },
        403
      );
    }

    const stats = service.getPatternStats(patternId);

    return c.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || 'Failed to get stats',
      },
      500
    );
  }
});

/**
 * POST /v1/marketplace/patterns/:id/moderate
 * Moderate a pattern (admin only)
 */
marketplace.post('/patterns/:id/moderate', requirePermission('admin'), moderatePatternValidator, async (c) => {
  const tenant = c.get('tenant');
  const patternId = c.req.param('id');
  const body = c.req.valid('json');

  try {
    const service = getMarketplaceService();
    const pattern = await service.moderatePattern(patternId, tenant.id, body.status, body.notes);

    return c.json({
      success: true,
      data: pattern,
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || 'Failed to moderate pattern',
      },
      400
    );
  }
});

/**
 * GET /v1/marketplace/admin/reports
 * Get all pattern reports (admin only)
 */
marketplace.get('/admin/reports', requirePermission('admin'), async (c) => {
  try {
    const service = getMarketplaceService();
    const reports = service.getAllReports();

    return c.json({
      success: true,
      data: { reports },
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || 'Failed to get reports',
      },
      500
    );
  }
});

export default marketplace;
