/**
 * Predictions Routes (INT-018)
 *
 * API endpoints for content change predictions, calendar triggers,
 * seasonal patterns, and urgency-based polling optimization.
 */

import { Hono } from 'hono';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { ContentChangePredictor } from '../../../../src/core/content-change-predictor.js';
import type { UrgencyLevel } from '../../../../src/types/content-change.js';

const predictions = new Hono();

// Apply auth and rate limiting
predictions.use('*', authMiddleware);
predictions.use('*', rateLimitMiddleware);

// Singleton predictor instance (in production, this would be persisted)
let predictorInstance: ContentChangePredictor | null = null;

function getPredictor(): ContentChangePredictor {
  if (!predictorInstance) {
    predictorInstance = new ContentChangePredictor();
  }
  return predictorInstance;
}

/**
 * GET /v1/predictions
 * List all content change patterns with urgency levels, sorted by urgency
 */
predictions.get('/', requirePermission('browse'), async (c) => {
  const startTime = Date.now();

  try {
    const predictor = getPredictor();
    const patterns = predictor.getPatternsWithUrgency();

    // Optional query params for filtering
    const minUrgency = c.req.query('minUrgency');
    const domain = c.req.query('domain');

    let filtered = patterns;

    if (minUrgency !== undefined) {
      const minLevel = parseInt(minUrgency, 10) as UrgencyLevel;
      filtered = filtered.filter(p => p.currentUrgency >= minLevel);
    }

    if (domain) {
      filtered = filtered.filter(p =>
        p.domain.toLowerCase().includes(domain.toLowerCase())
      );
    }

    return c.json({
      success: true,
      data: {
        patterns: filtered.map(p => ({
          id: p.id,
          domain: p.domain,
          urlPattern: p.urlPattern,
          detectedPattern: p.detectedPattern,
          patternConfidence: p.patternConfidence,
          urgencyLevel: p.currentUrgency,
          nextPrediction: p.nextPrediction
            ? {
                predictedAt: p.nextPrediction.predictedAt,
                confidence: p.nextPrediction.confidence,
                reason: p.nextPrediction.reason,
              }
            : null,
          calendarTriggers: p.calendarTriggers?.map(t => ({
            month: t.month,
            dayOfMonth: t.dayOfMonth,
            description: t.description,
            confidence: t.confidence,
            historicalCount: t.historicalCount,
          })),
          seasonalPattern: p.seasonalPattern
            ? {
                highChangeMonths: p.seasonalPattern.highChangeMonths,
                highChangeDays: p.seasonalPattern.highChangeDays,
                totalObservations: p.seasonalPattern.totalObservations,
              }
            : null,
          recommendedPollIntervalMs: p.recommendedPollIntervalMs,
          lastAnalyzedAt: p.lastAnalyzedAt,
          changeCount: p.frequencyStats.changeCount,
        })),
        summary: {
          totalPatterns: patterns.length,
          byUrgency: {
            critical: patterns.filter(p => p.currentUrgency === 3).length,
            high: patterns.filter(p => p.currentUrgency === 2).length,
            normal: patterns.filter(p => p.currentUrgency === 1).length,
            low: patterns.filter(p => p.currentUrgency === 0).length,
          },
          withCalendarTriggers: patterns.filter(
            p => p.calendarTriggers && p.calendarTriggers.length > 0
          ).length,
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
          code: 'PREDICTIONS_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      500
    );
  }
});

/**
 * GET /v1/predictions/:domain
 * Get predictions for a specific domain
 */
predictions.get('/:domain', requirePermission('browse'), async (c) => {
  const startTime = Date.now();
  const domain = c.req.param('domain');

  try {
    const predictor = getPredictor();
    const allPatterns = predictor.getPatternsWithUrgency();

    // Filter patterns for this domain
    const domainPatterns = allPatterns.filter(
      p => p.domain.toLowerCase() === domain.toLowerCase()
    );

    if (domainPatterns.length === 0) {
      return c.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `No patterns found for domain: ${domain}`,
          },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: {
        domain,
        patterns: domainPatterns.map(p => ({
          id: p.id,
          urlPattern: p.urlPattern,
          detectedPattern: p.detectedPattern,
          patternConfidence: p.patternConfidence,
          urgencyLevel: p.currentUrgency,
          nextPrediction: p.nextPrediction
            ? {
                predictedAt: p.nextPrediction.predictedAt,
                predictedAtISO: new Date(p.nextPrediction.predictedAt).toISOString(),
                confidence: p.nextPrediction.confidence,
                uncertaintyWindowMs: p.nextPrediction.uncertaintyWindowMs,
                reason: p.nextPrediction.reason,
              }
            : null,
          calendarTriggers: p.calendarTriggers,
          seasonalPattern: p.seasonalPattern,
          temporalPattern: p.temporalPattern,
          frequencyStats: p.frequencyStats,
          recommendedPollIntervalMs: p.recommendedPollIntervalMs,
          predictionSuccess: {
            attempts: p.predictionAttemptCount,
            successes: p.predictionSuccessCount,
            rate:
              p.predictionAttemptCount > 0
                ? p.predictionSuccessCount / p.predictionAttemptCount
                : null,
          },
          lastAnalyzedAt: p.lastAnalyzedAt,
          createdAt: p.createdAt,
        })),
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
          code: 'PREDICTIONS_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      500
    );
  }
});

/**
 * GET /v1/predictions/:domain/accuracy
 * Get prediction accuracy statistics for a domain
 */
predictions.get('/:domain/accuracy', requirePermission('browse'), async (c) => {
  const startTime = Date.now();
  const domain = c.req.param('domain');
  const urlPattern = c.req.query('urlPattern') || '.*';

  try {
    const predictor = getPredictor();
    const stats = predictor.getAccuracyStats(domain, urlPattern);

    if (!stats) {
      return c.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `No accuracy data for domain: ${domain}`,
          },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: {
        domain,
        urlPattern,
        accuracy: {
          totalPredictions: stats.totalPredictions,
          successfulPredictions: stats.successfulPredictions,
          successRate: stats.successRate,
          recentAccuracy: stats.recentAccuracy,
          averageErrorMs: stats.avgErrorMs,
          averageErrorHours: stats.avgErrorMs
            ? stats.avgErrorMs / (60 * 60 * 1000)
            : null,
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
          code: 'PREDICTIONS_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      500
    );
  }
});

/**
 * GET /v1/predictions/urgency/:level
 * Get all patterns with a specific urgency level or higher
 */
predictions.get('/urgency/:level', requirePermission('browse'), async (c) => {
  const startTime = Date.now();
  const levelStr = c.req.param('level');
  const level = parseInt(levelStr, 10);

  if (isNaN(level) || level < 0 || level > 3) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Urgency level must be 0, 1, 2, or 3',
        },
      },
      400
    );
  }

  try {
    const predictor = getPredictor();
    const patterns = predictor
      .getPatternsWithUrgency()
      .filter(p => p.currentUrgency >= level);

    return c.json({
      success: true,
      data: {
        urgencyLevel: level,
        urgencyName: ['low', 'normal', 'high', 'critical'][level],
        patterns: patterns.map(p => ({
          id: p.id,
          domain: p.domain,
          urlPattern: p.urlPattern,
          urgencyLevel: p.currentUrgency,
          nextPrediction: p.nextPrediction
            ? {
                predictedAt: p.nextPrediction.predictedAt,
                predictedAtISO: new Date(p.nextPrediction.predictedAt).toISOString(),
                reason: p.nextPrediction.reason,
              }
            : null,
          calendarTriggers: p.calendarTriggers?.slice(0, 3), // Top 3 triggers
          recommendedPollIntervalMs: p.recommendedPollIntervalMs,
        })),
        count: patterns.length,
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
          code: 'PREDICTIONS_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      500
    );
  }
});

/**
 * POST /v1/predictions/:domain/observe
 * Record an observation for content change prediction
 */
predictions.post('/:domain/observe', requirePermission('browse'), async (c) => {
  const startTime = Date.now();
  const domain = c.req.param('domain');

  try {
    const body = await c.req.json();
    const { urlPattern, contentHash, changed } = body;

    if (urlPattern === undefined || changed === undefined) {
      return c.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'urlPattern and changed are required',
          },
        },
        400
      );
    }

    const predictor = getPredictor();

    // Record prediction accuracy if there was a previous prediction
    if (changed) {
      predictor.recordPredictionAccuracy(domain, urlPattern, changed);
    }

    // Record the observation
    const pattern = predictor.recordObservation(
      domain,
      urlPattern,
      contentHash,
      changed
    );

    return c.json({
      success: true,
      data: {
        pattern: {
          id: pattern.id,
          domain: pattern.domain,
          urlPattern: pattern.urlPattern,
          detectedPattern: pattern.detectedPattern,
          patternConfidence: pattern.patternConfidence,
          urgencyLevel: pattern.urgencyLevel,
          nextPrediction: pattern.nextPrediction
            ? {
                predictedAt: pattern.nextPrediction.predictedAt,
                predictedAtISO: new Date(
                  pattern.nextPrediction.predictedAt
                ).toISOString(),
                confidence: pattern.nextPrediction.confidence,
                reason: pattern.nextPrediction.reason,
              }
            : null,
          recommendedPollIntervalMs: pattern.recommendedPollIntervalMs,
          changeCount: pattern.frequencyStats.changeCount,
          observationCount: pattern.frequencyStats.observationCount,
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
          code: 'PREDICTIONS_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      500
    );
  }
});

export default predictions;
