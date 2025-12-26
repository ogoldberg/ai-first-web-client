/**
 * Discovery Routes (FUZZ-001)
 *
 * Endpoints for proactive API discovery via fuzzing and other methods.
 */

import { Hono } from 'hono';
import { validator } from 'hono/validator';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { ApiDiscoveryOrchestrator } from '../../../../src/core/api-discovery-orchestrator.js';
import { LearningEngine } from '../../../../src/core/learning-engine.js';

interface FuzzDiscoveryRequest {
  domain: string;
  options?: {
    paths?: string[];
    methods?: string[];
    probeTimeout?: number;
    maxDuration?: number;
    learnPatterns?: boolean;
    headers?: Record<string, string>;
    successCodes?: number[];
  };
}

const discovery = new Hono();

// Apply auth and rate limiting
discovery.use('*', authMiddleware);
discovery.use('*', rateLimitMiddleware);

// Validator for fuzz discovery request
const fuzzValidator = validator('json', (value, c) => {
  const body = value as FuzzDiscoveryRequest;

  if (!body.domain || typeof body.domain !== 'string') {
    return c.json(
      {
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'domain is required' },
      },
      400
    );
  }

  return body;
});

/**
 * POST /v1/discover/fuzz
 * Discover API endpoints via fuzzing common paths
 */
discovery.post('/fuzz', requirePermission('browse'), fuzzValidator, async (c) => {
  const body = c.req.valid('json') as FuzzDiscoveryRequest;
  const startTime = Date.now();

  try {
    // Initialize learning engine (shared singleton would be better in production)
    const learningEngine = new LearningEngine();
    await learningEngine.initialize();

    // Create orchestrator
    const orchestrator = new ApiDiscoveryOrchestrator(learningEngine);

    // Run fuzzing discovery
    const result = await orchestrator.discoverViaFuzzing(
      body.domain.startsWith('http') ? body.domain : `https://${body.domain}`,
      {
        paths: body.options?.paths,
        methods: body.options?.methods,
        probeTimeout: body.options?.probeTimeout,
        maxDuration: body.options?.maxDuration,
        learnPatterns: body.options?.learnPatterns ?? true,
        headers: body.options?.headers,
        successCodes: body.options?.successCodes,
      }
    );

    return c.json({
      success: true,
      data: {
        domain: result.domain,
        baseUrl: result.baseUrl,
        discovered: result.successfulEndpoints.map(e => ({
          path: e.path,
          method: e.method,
          statusCode: e.statusCode,
          responseTime: e.responseTime,
          contentType: e.contentType,
        })),
        stats: {
          totalProbes: result.totalProbes,
          successfulEndpoints: result.successfulEndpoints.length,
          failedProbes: result.failedProbes,
          patternsLearned: result.patternsLearned,
          duration: result.duration,
        },
        metadata: {
          timestamp: Date.now(),
          requestDuration: Date.now() - startTime,
        },
      },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: 'DISCOVERY_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      500
    );
  }
});

export default discovery;
