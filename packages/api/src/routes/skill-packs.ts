/**
 * Skill Pack API Routes (PACK-001)
 *
 * Enables distributing and installing pre-learned browsing skills via REST API.
 * Skill packs are portable collections of browsing patterns that can be shared
 * across Unbrowser instances or distributed via npm.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import type {
  SkillPack,
  SkillExportOptions,
  SkillImportOptions,
  SkillImportResult,
  SkillVertical,
} from '../../../src/types/index.js';

const app = new Hono();

// Apply authentication and rate limiting to all skill pack endpoints
app.use('*', authMiddleware);
app.use('*', rateLimitMiddleware);

/**
 * POST /v1/skill-packs/export
 *
 * Export a skill pack from the current ProceduralMemory instance.
 *
 * Request body:
 * {
 *   "domainPatterns": ["github.com", "*.linkedin.com"],  // Optional
 *   "verticals": ["developer", "social"],                 // Optional
 *   "includeAntiPatterns": true,                          // Optional, default: true
 *   "includeWorkflows": true,                             // Optional, default: true
 *   "minSuccessRate": 0.8,                                // Optional, default: 0
 *   "minUsageCount": 10,                                  // Optional, default: 0
 *   "packName": "My Skill Pack",                          // Optional
 *   "packDescription": "Skills for X"                     // Optional
 * }
 *
 * Response:
 * {
 *   "pack": { ... },       // The exported SkillPack
 *   "downloadUrl": "..."   // URL to download as .json file (optional)
 * }
 */
app.post('/export', async (c: Context) => {
  const body = await c.req.json<SkillExportOptions>();

  // Get SmartBrowser instance from context (injected by browse middleware)
  const { browser } = c.get('services');
  if (!browser) {
    throw new HTTPException(500, { message: 'Browser service not available' });
  }

  try {
    const proceduralMemory = browser.getProceduralMemory();
    const pack = proceduralMemory.exportSkillPack(body);

    return c.json({
      success: true,
      pack,
      metadata: {
        skillCount: pack.skills.length,
        antiPatternCount: pack.antiPatterns.length,
        workflowCount: pack.workflows.length,
        version: pack.metadata.version,
        createdAt: pack.metadata.createdAt,
      },
    });
  } catch (error: any) {
    throw new HTTPException(400, { message: `Export failed: ${error.message}` });
  }
});

/**
 * POST /v1/skill-packs/import
 *
 * Import a skill pack into the current ProceduralMemory instance.
 *
 * Request body:
 * {
 *   "pack": { ... },                        // Required: The SkillPack to import
 *   "conflictResolution": "skip",           // Optional: 'skip' | 'overwrite' | 'merge' | 'rename'
 *   "domainFilter": ["github.com"],         // Optional
 *   "verticalFilter": ["developer"],        // Optional
 *   "importAntiPatterns": true,             // Optional, default: true
 *   "importWorkflows": true,                // Optional, default: true
 *   "resetMetrics": false,                  // Optional, default: false
 *   "namePrefix": "imported-"               // Optional
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "result": {
 *     "skillsImported": 42,
 *     "skillsSkipped": 3,
 *     "skillsMerged": 0,
 *     "antiPatternsImported": 5,
 *     "workflowsImported": 2,
 *     "errors": [],
 *     "warnings": []
 *   }
 * }
 */
app.post('/import', async (c: Context) => {
  const body = await c.req.json<{ pack: SkillPack; options?: SkillImportOptions }>();

  if (!body.pack) {
    throw new HTTPException(400, { message: 'Missing required field: pack' });
  }

  const { browser } = c.get('services');
  if (!browser) {
    throw new HTTPException(500, { message: 'Browser service not available' });
  }

  try {
    const proceduralMemory = browser.getProceduralMemory();
    const packJson = JSON.stringify(body.pack);
    const result = await proceduralMemory.importSkillPack(packJson, body.options || {});

    return c.json({
      success: result.success,
      result,
    });
  } catch (error: any) {
    throw new HTTPException(400, { message: `Import failed: ${error.message}` });
  }
});

/**
 * GET /v1/skill-packs/library
 *
 * List available official skill packs from Unbrowser's library.
 *
 * Query params:
 * - vertical: Filter by vertical (e.g., ?vertical=developer)
 * - search: Search by name or description
 *
 * Response:
 * {
 *   "packs": [
 *     {
 *       "id": "@unbrowser/skills-github",
 *       "name": "GitHub Skills",
 *       "description": "Repository browsing, API discovery, and code extraction",
 *       "version": "1.0.0",
 *       "verticals": ["developer"],
 *       "skillCount": 25,
 *       "downloadCount": 1234,
 *       "verified": true
 *     }
 *   ]
 * }
 */
app.get('/library', async (c: Context) => {
  const vertical = c.req.query('vertical') as SkillVertical | undefined;
  const search = c.req.query('search');

  // Official skill packs catalog (hardcoded for now, could move to database)
  const allPacks = [
    {
      id: '@unbrowser/skills-github',
      name: 'GitHub Skills',
      description: 'Repository browsing, API discovery, code extraction, and issue tracking',
      version: '1.0.0',
      verticals: ['developer'] as SkillVertical[],
      domains: ['github.com'],
      skillCount: 25,
      downloadCount: 0,
      verified: true,
      npmUrl: 'https://www.npmjs.com/package/@unbrowser/skills-github',
    },
    {
      id: '@unbrowser/skills-linkedin',
      name: 'LinkedIn Skills',
      description: 'Profile extraction, company research, job posting analysis',
      version: '1.0.0',
      verticals: ['social'] as SkillVertical[],
      domains: ['linkedin.com'],
      skillCount: 18,
      downloadCount: 0,
      verified: true,
      npmUrl: 'https://www.npmjs.com/package/@unbrowser/skills-linkedin',
    },
    {
      id: '@unbrowser/skills-ecommerce',
      name: 'E-Commerce Skills',
      description: 'Product extraction, price monitoring, inventory tracking, cart automation',
      version: '1.0.0',
      verticals: ['ecommerce'] as SkillVertical[],
      domains: ['amazon.com', 'shopify.com', 'ebay.com'],
      skillCount: 32,
      downloadCount: 0,
      verified: true,
      npmUrl: 'https://www.npmjs.com/package/@unbrowser/skills-ecommerce',
    },
    {
      id: '@unbrowser/skills-news',
      name: 'News & Articles Skills',
      description: 'Article extraction, author detection, clean markdown conversion',
      version: '1.0.0',
      verticals: ['news'] as SkillVertical[],
      domains: ['medium.com', 'dev.to', 'hackernoon.com', 'substack.com'],
      skillCount: 15,
      downloadCount: 0,
      verified: true,
      npmUrl: 'https://www.npmjs.com/package/@unbrowser/skills-news',
    },
  ];

  // Filter by vertical
  let packs = allPacks;
  if (vertical) {
    packs = packs.filter((p) => p.verticals.includes(vertical));
  }

  // Search filter
  if (search) {
    const searchLower = search.toLowerCase();
    packs = packs.filter(
      (p) =>
        p.name.toLowerCase().includes(searchLower) ||
        p.description.toLowerCase().includes(searchLower)
    );
  }

  return c.json({
    success: true,
    packs,
    total: packs.length,
  });
});

/**
 * POST /v1/skill-packs/install
 *
 * Install a skill pack from Unbrowser's official library or from a URL.
 *
 * Request body:
 * {
 *   "packId": "@unbrowser/skills-github",  // Or custom URL
 *   "options": {
 *     "conflictResolution": "skip",
 *     "resetMetrics": false
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "result": { ... }  // SkillImportResult
 * }
 */
app.post('/install', async (c: Context) => {
  const body = await c.req.json<{ packId: string; options?: SkillImportOptions }>();

  if (!body.packId) {
    throw new HTTPException(400, { message: 'Missing required field: packId' });
  }

  const { browser } = c.get('services');
  if (!browser) {
    throw new HTTPException(500, { message: 'Browser service not available' });
  }

  try {
    // For now, return placeholder since we don't have published packs yet
    // In production, this would fetch from npm or a CDN
    throw new HTTPException(501, {
      message: 'Skill pack installation not yet implemented. Use import endpoint instead.',
    });

    // TODO: Implement actual installation:
    // 1. Fetch pack from npm/CDN based on packId
    // 2. Validate pack integrity
    // 3. Import using importSkillPack()
    // 4. Return result
  } catch (error: any) {
    throw new HTTPException(400, { message: `Installation failed: ${error.message}` });
  }
});

/**
 * GET /v1/skill-packs/stats
 *
 * Get statistics about the current skill pack state.
 *
 * Response:
 * {
 *   "totalSkills": 156,
 *   "totalWorkflows": 12,
 *   "totalAntiPatterns": 23,
 *   "byVertical": {
 *     "developer": 45,
 *     "ecommerce": 32,
 *     ...
 *   },
 *   "byTier": {
 *     "essential": 12,
 *     "domain-specific": 120,
 *     "advanced": 24
 *   },
 *   "loadingStats": {
 *     "totalLoaded": 35,
 *     "totalUnloaded": 121,
 *     "loadedDomains": ["github.com", "linkedin.com"]
 *   }
 * }
 */
app.get('/stats', async (c: Context) => {
  const { browser } = c.get('services');
  if (!browser) {
    throw new HTTPException(500, { message: 'Browser service not available' });
  }

  try {
    const proceduralMemory = browser.getProceduralMemory();
    const stats = proceduralMemory.getStats();
    const loadingStats = proceduralMemory.getLoadingStats();

    return c.json({
      success: true,
      totalSkills: stats.totalSkills,
      totalWorkflows: stats.totalWorkflows,
      totalAntiPatterns: stats.totalAntiPatterns,
      byVertical: stats.skillsByVertical,
      byTier: {
        essential: loadingStats.essential,
        'domain-specific': loadingStats.domainSpecific.loaded + loadingStats.domainSpecific.unloaded,
        advanced: loadingStats.advanced.loaded + loadingStats.advanced.unloaded,
      },
      loadingStats: {
        totalLoaded: loadingStats.totalLoaded,
        totalUnloaded: loadingStats.totalUnloaded,
        loadedDomains: loadingStats.loadedDomains,
      },
    });
  } catch (error: any) {
    throw new HTTPException(500, { message: `Failed to get stats: ${error.message}` });
  }
});

export { app as skillPacks };
