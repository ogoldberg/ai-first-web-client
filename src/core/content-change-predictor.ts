/**
 * Content Change Predictor (GAP-011)
 *
 * Learns content update patterns and predicts when content will change.
 * Enables optimal polling intervals to minimize unnecessary fetches.
 *
 * Features:
 * - Pattern detection (hourly, daily, weekly, workday, monthly)
 * - Change prediction with confidence scoring
 * - Polling interval optimization
 * - Temporal analysis (time of day, day of week)
 *
 * @example
 * ```typescript
 * const predictor = new ContentChangePredictor();
 *
 * // Record observations
 * predictor.recordObservation('news.example.com', '/api/feed', 'hash1', true);
 * predictor.recordObservation('news.example.com', '/api/feed', 'hash2', true);
 *
 * // Get prediction
 * const analysis = predictor.analyzePattern('news.example.com', '/api/feed');
 * console.log(analysis.pattern.detectedPattern); // 'daily'
 * console.log(analysis.pattern.recommendedPollIntervalMs); // 3600000
 *
 * // Check if we should poll
 * const recommendation = predictor.shouldCheckNow('news.example.com', '/api/feed');
 * if (recommendation.shouldPoll) {
 *   // Fetch content
 * }
 * ```
 */

import { logger } from '../utils/logger.js';
import type {
  ContentChangePattern,
  ContentChangePredictionConfig,
  ContentChangeAnalysis,
  PollRecommendation,
  ChangePatternType,
  ChangeObservation,
  TemporalPattern,
  ChangeFrequencyStats,
  ChangePrediction,
  // INT-018: Enhanced prediction types
  CalendarTrigger,
  SeasonalPattern,
  UrgencyLevel,
  PredictionAccuracyRecord,
} from '../types/content-change.js';
import { DEFAULT_CHANGE_PREDICTION_CONFIG } from '../types/content-change.js';

const log = logger.create('ContentChangePredictor');

/**
 * Generates a unique pattern ID
 */
function generatePatternId(): string {
  return `ccp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Creates a key for pattern lookup
 */
function getPatternKey(domain: string, urlPattern: string): string {
  return `${domain}:${urlPattern}`;
}

/**
 * Content Change Predictor
 *
 * Learns when content changes and predicts future changes.
 */
export class ContentChangePredictor {
  /** Stored patterns by domain:urlPattern key */
  private patterns: Map<string, ContentChangePattern> = new Map();

  /** Configuration */
  private config: ContentChangePredictionConfig;

  constructor(config: Partial<ContentChangePredictionConfig> = {}) {
    this.config = { ...DEFAULT_CHANGE_PREDICTION_CONFIG, ...config };
  }

  /**
   * Record an observation of content check
   */
  recordObservation(
    domain: string,
    urlPattern: string,
    contentHash: string | undefined,
    changed: boolean
  ): ContentChangePattern {
    const key = getPatternKey(domain, urlPattern);
    let pattern = this.patterns.get(key);

    const observation: ChangeObservation = {
      checkedAt: Date.now(),
      changed,
      contentHash,
    };

    if (!pattern) {
      // Create new pattern
      pattern = this.createNewPattern(domain, urlPattern);
      this.patterns.set(key, pattern);
    }

    // Add observation
    pattern.recentObservations.push(observation);

    // Trim observations if needed
    if (pattern.recentObservations.length > this.config.maxObservationsToKeep) {
      pattern.recentObservations = pattern.recentObservations.slice(
        -this.config.maxObservationsToKeep
      );
    }

    // Record change timestamp if content changed
    if (changed) {
      pattern.changeTimestamps.push(observation.checkedAt);

      // Trim change timestamps if needed
      if (pattern.changeTimestamps.length > this.config.maxChangeTimestamps) {
        pattern.changeTimestamps = pattern.changeTimestamps.slice(
          -this.config.maxChangeTimestamps
        );
      }
    }

    // Update frequency stats
    pattern.frequencyStats = this.calculateFrequencyStats(pattern.changeTimestamps);

    // Re-analyze pattern if we have enough data
    const changesCount = pattern.changeTimestamps.length;
    const observationsCount = pattern.recentObservations.length;

    if (
      changesCount >= this.config.minChangesForPattern &&
      observationsCount >= this.config.minObservationsForPattern
    ) {
      this.analyzeAndUpdatePattern(pattern);
    }

    log.debug('Recorded content observation', {
      domain,
      urlPattern,
      changed,
      totalChanges: changesCount,
      totalObservations: observationsCount,
      detectedPattern: pattern.detectedPattern,
    });

    return pattern;
  }

  /**
   * Get a pattern by domain and URL pattern
   */
  getPattern(domain: string, urlPattern: string): ContentChangePattern | null {
    const key = getPatternKey(domain, urlPattern);
    return this.patterns.get(key) || null;
  }

  /**
   * Analyze a pattern and return detailed analysis
   */
  analyzePattern(domain: string, urlPattern: string): ContentChangeAnalysis {
    const key = getPatternKey(domain, urlPattern);
    let pattern = this.patterns.get(key);

    if (!pattern) {
      pattern = this.createNewPattern(domain, urlPattern);
      this.patterns.set(key, pattern);
    }

    const changesCount = pattern.changeTimestamps.length;
    const observationsCount = pattern.recentObservations.length;

    const hasEnoughData =
      changesCount >= this.config.minChangesForPattern &&
      observationsCount >= this.config.minObservationsForPattern;

    // Re-analyze if we have enough data
    if (hasEnoughData) {
      this.analyzeAndUpdatePattern(pattern);
    }

    // Generate summary and recommendations
    const { summary, recommendations } = this.generateAnalysisSummary(pattern, hasEnoughData);

    return {
      pattern,
      hasEnoughData,
      summary,
      recommendations,
    };
  }

  /**
   * Check if we should poll this content now
   */
  shouldCheckNow(domain: string, urlPattern: string, now: number = Date.now()): PollRecommendation {
    const key = getPatternKey(domain, urlPattern);
    const pattern = this.patterns.get(key);

    // No pattern - recommend checking
    if (!pattern) {
      return {
        shouldPoll: true,
        reason: 'No pattern data available, recommend checking',
        nextCheckAt: now,
        confidence: 0,
      };
    }

    // Get last observation time
    const lastCheck = pattern.recentObservations.length > 0
      ? pattern.recentObservations[pattern.recentObservations.length - 1].checkedAt
      : 0;

    // Calculate time since last check
    const timeSinceLastCheck = now - lastCheck;

    // Static content - check less frequently
    if (pattern.detectedPattern === 'static') {
      const staticInterval = this.config.maxPollIntervalMs;
      if (timeSinceLastCheck < staticInterval) {
        return {
          shouldPoll: false,
          reason: 'Content is static, no need to check frequently',
          nextCheckAt: lastCheck + staticInterval,
          confidence: pattern.patternConfidence,
        };
      }
    }

    // Check if we've waited long enough based on recommended interval
    if (timeSinceLastCheck < pattern.recommendedPollIntervalMs * 0.8) {
      return {
        shouldPoll: false,
        reason: 'Too soon since last check',
        nextCheckAt: lastCheck + pattern.recommendedPollIntervalMs,
        confidence: pattern.patternConfidence,
      };
    }

    // If we have a prediction, check if we're in the prediction window
    if (pattern.nextPrediction && pattern.patternConfidence >= this.config.confidenceThresholdForPrediction) {
      const prediction = pattern.nextPrediction;
      const windowStart = prediction.predictedAt - prediction.uncertaintyWindowMs;
      const windowEnd = prediction.predictedAt + prediction.uncertaintyWindowMs;

      // We're before the prediction window
      if (now < windowStart) {
        // Only check if we're past the recommended interval
        if (timeSinceLastCheck >= pattern.recommendedPollIntervalMs) {
          return {
            shouldPoll: true,
            reason: 'Past recommended interval, checking before prediction window',
            nextCheckAt: windowStart,
            confidence: pattern.patternConfidence * 0.7,
          };
        }
        return {
          shouldPoll: false,
          reason: 'Waiting for predicted change window',
          nextCheckAt: windowStart,
          confidence: pattern.patternConfidence,
        };
      }

      // We're in the prediction window - definitely check
      if (now >= windowStart && now <= windowEnd) {
        return {
          shouldPoll: true,
          reason: 'Within predicted change window',
          nextCheckAt: now,
          confidence: prediction.confidence,
        };
      }

      // We're past the prediction window - check now
      if (now > windowEnd) {
        return {
          shouldPoll: true,
          reason: 'Past prediction window, should check for changes',
          nextCheckAt: now,
          confidence: pattern.patternConfidence * 0.5,
        };
      }
    }

    // Default: check based on recommended interval
    if (timeSinceLastCheck >= pattern.recommendedPollIntervalMs) {
      return {
        shouldPoll: true,
        reason: 'Recommended poll interval elapsed',
        nextCheckAt: now,
        confidence: pattern.patternConfidence,
      };
    }

    return {
      shouldPoll: false,
      reason: 'Within recommended poll interval',
      nextCheckAt: lastCheck + pattern.recommendedPollIntervalMs,
      confidence: pattern.patternConfidence,
    };
  }

  /**
   * Get all patterns
   */
  getAllPatterns(): ContentChangePattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Export patterns for persistence
   */
  exportPatterns(): Record<string, ContentChangePattern> {
    const data: Record<string, ContentChangePattern> = {};
    for (const [key, pattern] of Array.from(this.patterns.entries())) {
      data[key] = pattern;
    }
    return data;
  }

  /**
   * Import patterns from persistence
   */
  importPatterns(data: Record<string, ContentChangePattern>): void {
    this.patterns.clear();
    for (const [key, pattern] of Object.entries(data)) {
      this.patterns.set(key, pattern);
    }
    log.info('Imported content change patterns', { count: this.patterns.size });
  }

  /**
   * Create a new empty pattern
   */
  private createNewPattern(domain: string, urlPattern: string): ContentChangePattern {
    return {
      id: generatePatternId(),
      urlPattern,
      domain,
      detectedPattern: 'unknown',
      patternConfidence: 0,
      frequencyStats: {
        avgIntervalHours: 0,
        minIntervalHours: 0,
        maxIntervalHours: 0,
        stdDevHours: 0,
        changeCount: 0,
        observationCount: 0,
      },
      recommendedPollIntervalMs: this.config.maxPollIntervalMs,
      recentObservations: [],
      changeTimestamps: [],
      createdAt: Date.now(),
      lastAnalyzedAt: Date.now(),
      predictionSuccessCount: 0,
      predictionAttemptCount: 0,
    };
  }

  /**
   * Calculate frequency statistics from change timestamps
   */
  private calculateFrequencyStats(timestamps: number[]): ChangeFrequencyStats {
    if (timestamps.length < 2) {
      return {
        avgIntervalHours: 0,
        minIntervalHours: 0,
        maxIntervalHours: 0,
        stdDevHours: 0,
        changeCount: timestamps.length,
        observationCount: timestamps.length,
      };
    }

    // Calculate intervals between changes
    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      const intervalMs = timestamps[i] - timestamps[i - 1];
      const intervalHours = intervalMs / (1000 * 60 * 60);
      intervals.push(intervalHours);
    }

    // Calculate statistics
    const avgIntervalHours = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const minIntervalHours = Math.min(...intervals);
    const maxIntervalHours = Math.max(...intervals);

    // Calculate standard deviation
    const squaredDiffs = intervals.map(i => Math.pow(i - avgIntervalHours, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
    const stdDevHours = Math.sqrt(avgSquaredDiff);

    return {
      avgIntervalHours,
      minIntervalHours,
      maxIntervalHours,
      stdDevHours,
      changeCount: timestamps.length,
      observationCount: timestamps.length,
    };
  }

  /**
   * Analyze timestamps and detect pattern type
   */
  private detectPatternType(timestamps: number[]): {
    type: ChangePatternType;
    confidence: number;
    temporalPattern?: TemporalPattern;
  } {
    if (timestamps.length < this.config.minChangesForPattern) {
      return { type: 'unknown', confidence: 0 };
    }

    // Check for static content (no changes in a long time)
    const lastChange = timestamps[timestamps.length - 1];
    const daysSinceLastChange = (Date.now() - lastChange) / (1000 * 60 * 60 * 24);
    if (daysSinceLastChange > this.config.staticContentDaysThreshold) {
      return { type: 'static', confidence: 0.8 };
    }

    // Analyze time-of-day patterns
    const hoursOfDay = timestamps.map(ts => new Date(ts).getUTCHours());
    const daysOfWeek = timestamps.map(ts => new Date(ts).getUTCDay());

    // Calculate intervals
    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }

    const avgIntervalHours = intervals.length > 0
      ? intervals.reduce((a, b) => a + b, 0) / intervals.length / (1000 * 60 * 60)
      : 0;

    // Check for hourly pattern (changes every N hours consistently)
    const hourlyPattern = this.detectHourlyPattern(intervals);
    if (hourlyPattern.isMatch && hourlyPattern.confidence > 0.7) {
      return {
        type: 'hourly',
        confidence: hourlyPattern.confidence,
        temporalPattern: {
          typicalHoursOfDay: [], // N/A for hourly
          typicalDaysOfWeek: [], // N/A for hourly
          timezone: 'UTC',
        },
      };
    }

    // Check for daily pattern (same time each day)
    const dailyPattern = this.detectDailyPattern(timestamps, hoursOfDay);
    if (dailyPattern.isMatch && dailyPattern.confidence > 0.6) {
      return {
        type: 'daily',
        confidence: dailyPattern.confidence,
        temporalPattern: {
          typicalHoursOfDay: dailyPattern.typicalHours,
          typicalDaysOfWeek: [],
          timezone: 'UTC',
        },
      };
    }

    // Check for workday pattern (weekdays only)
    const workdayPattern = this.detectWorkdayPattern(daysOfWeek);
    if (workdayPattern.isMatch && workdayPattern.confidence > 0.6) {
      return {
        type: 'workday',
        confidence: workdayPattern.confidence,
        temporalPattern: {
          typicalHoursOfDay: this.findTypicalHours(hoursOfDay),
          typicalDaysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
          timezone: 'UTC',
        },
      };
    }

    // Check for weekly pattern (specific days of week)
    const weeklyPattern = this.detectWeeklyPattern(timestamps, daysOfWeek);
    if (weeklyPattern.isMatch && weeklyPattern.confidence > 0.6) {
      return {
        type: 'weekly',
        confidence: weeklyPattern.confidence,
        temporalPattern: {
          typicalHoursOfDay: this.findTypicalHours(hoursOfDay),
          typicalDaysOfWeek: weeklyPattern.typicalDays,
          timezone: 'UTC',
        },
      };
    }

    // Check for monthly pattern
    const monthlyPattern = this.detectMonthlyPattern(timestamps);
    if (monthlyPattern.isMatch && monthlyPattern.confidence > 0.6) {
      return {
        type: 'monthly',
        confidence: monthlyPattern.confidence,
        temporalPattern: {
          typicalHoursOfDay: this.findTypicalHours(hoursOfDay),
          typicalDaysOfWeek: [],
          typicalDaysOfMonth: monthlyPattern.typicalDays,
          timezone: 'UTC',
        },
      };
    }

    // Default to irregular if no pattern detected
    return {
      type: 'irregular',
      confidence: 0.5,
      temporalPattern: {
        typicalHoursOfDay: this.findTypicalHours(hoursOfDay),
        typicalDaysOfWeek: this.findTypicalDays(daysOfWeek),
        timezone: 'UTC',
      },
    };
  }

  /**
   * Detect hourly pattern (consistent intervals)
   */
  private detectHourlyPattern(intervalsMs: number[]): { isMatch: boolean; confidence: number } {
    if (intervalsMs.length < 3) {
      return { isMatch: false, confidence: 0 };
    }

    const avgInterval = intervalsMs.reduce((a, b) => a + b, 0) / intervalsMs.length;

    // Check if intervals are consistent (within 20% of average)
    const tolerance = avgInterval * 0.2;
    const consistentCount = intervalsMs.filter(i =>
      Math.abs(i - avgInterval) <= tolerance
    ).length;

    const consistency = consistentCount / intervalsMs.length;

    // Hourly pattern: average interval should be between 30 min and 12 hours
    const avgHours = avgInterval / (1000 * 60 * 60);
    const isReasonableInterval = avgHours >= 0.5 && avgHours <= 12;

    return {
      isMatch: consistency > 0.7 && isReasonableInterval,
      confidence: consistency * 0.9,
    };
  }

  /**
   * Detect daily pattern (same hour each day)
   */
  private detectDailyPattern(
    timestamps: number[],
    hoursOfDay: number[]
  ): { isMatch: boolean; confidence: number; typicalHours: number[] } {
    if (hoursOfDay.length < 3) {
      return { isMatch: false, confidence: 0, typicalHours: [] };
    }

    // Find typical hours (most common hours with tolerance)
    const typicalHours = this.findTypicalHours(hoursOfDay);

    if (typicalHours.length === 0) {
      return { isMatch: false, confidence: 0, typicalHours: [] };
    }

    // Count how many changes fall within typical hours (with tolerance)
    const tolerance = this.config.timeOfDayToleranceHours;
    const matchingCount = hoursOfDay.filter(hour =>
      typicalHours.some(typical =>
        Math.abs(hour - typical) <= tolerance || Math.abs(hour - typical - 24) <= tolerance
      )
    ).length;

    const matchRatio = matchingCount / hoursOfDay.length;

    // Also check that changes span multiple days (not all same day)
    const uniqueDays = new Set(
      timestamps.map(ts => new Date(ts).toISOString().substring(0, 10))
    );

    return {
      isMatch: matchRatio > 0.6 && uniqueDays.size >= 3,
      confidence: matchRatio * 0.9,
      typicalHours,
    };
  }

  /**
   * Detect workday pattern (weekdays only)
   */
  private detectWorkdayPattern(daysOfWeek: number[]): { isMatch: boolean; confidence: number } {
    if (daysOfWeek.length < 5) {
      return { isMatch: false, confidence: 0 };
    }

    // Count weekday vs weekend changes
    const weekdayCount = daysOfWeek.filter(d => d >= 1 && d <= 5).length;
    const weekendCount = daysOfWeek.filter(d => d === 0 || d === 6).length;

    const weekdayRatio = weekdayCount / daysOfWeek.length;

    // Need to have mostly weekday changes and very few weekend changes
    return {
      isMatch: weekdayRatio > 0.85 && weekendCount <= 1,
      confidence: weekdayRatio,
    };
  }

  /**
   * Detect weekly pattern (specific days of week)
   */
  private detectWeeklyPattern(
    timestamps: number[],
    daysOfWeek: number[]
  ): { isMatch: boolean; confidence: number; typicalDays: number[] } {
    if (daysOfWeek.length < 4) {
      return { isMatch: false, confidence: 0, typicalDays: [] };
    }

    // Find most common days
    const typicalDays = this.findTypicalDays(daysOfWeek);

    if (typicalDays.length === 0 || typicalDays.length > 3) {
      return { isMatch: false, confidence: 0, typicalDays: [] };
    }

    // Count matches
    const matchingCount = daysOfWeek.filter(d => typicalDays.includes(d)).length;
    const matchRatio = matchingCount / daysOfWeek.length;

    // Check that changes span multiple weeks
    const weeks = new Set(
      timestamps.map(ts => {
        const d = new Date(ts);
        return `${d.getUTCFullYear()}-W${Math.floor(d.getTime() / (7 * 24 * 60 * 60 * 1000))}`;
      })
    );

    return {
      isMatch: matchRatio > 0.7 && weeks.size >= 3,
      confidence: matchRatio * 0.85,
      typicalDays,
    };
  }

  /**
   * Detect monthly pattern (specific days of month)
   */
  private detectMonthlyPattern(
    timestamps: number[]
  ): { isMatch: boolean; confidence: number; typicalDays: number[] } {
    if (timestamps.length < 3) {
      return { isMatch: false, confidence: 0, typicalDays: [] };
    }

    const daysOfMonth = timestamps.map(ts => new Date(ts).getUTCDate());

    // Find most common days of month
    const dayCounts: Record<number, number> = {};
    daysOfMonth.forEach(d => {
      dayCounts[d] = (dayCounts[d] || 0) + 1;
    });

    // Find days that appear frequently
    const totalChanges = timestamps.length;
    const typicalDays = Object.entries(dayCounts)
      .filter(([_, count]) => count >= 2 || count / totalChanges > 0.3)
      .map(([day]) => parseInt(day, 10))
      .sort((a, b) => a - b);

    if (typicalDays.length === 0 || typicalDays.length > 5) {
      return { isMatch: false, confidence: 0, typicalDays: [] };
    }

    // Check that timestamps span multiple months
    const months = new Set(
      timestamps.map(ts => {
        const d = new Date(ts);
        return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      })
    );

    const matchingCount = daysOfMonth.filter(d =>
      typicalDays.some(typical => Math.abs(d - typical) <= 2)
    ).length;
    const matchRatio = matchingCount / daysOfMonth.length;

    return {
      isMatch: matchRatio > 0.7 && months.size >= 2,
      confidence: matchRatio * 0.8,
      typicalDays,
    };
  }

  /**
   * Find typical hours from a list of hours
   */
  private findTypicalHours(hours: number[]): number[] {
    if (hours.length === 0) return [];

    // Count occurrences of each hour
    const hourCounts: Record<number, number> = {};
    hours.forEach(h => {
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    });

    // Find hours that appear frequently (>25% of changes)
    const threshold = hours.length * 0.25;
    const typicalHours = Object.entries(hourCounts)
      .filter(([_, count]) => count >= threshold || count >= 2)
      .map(([hour]) => parseInt(hour, 10))
      .sort((a, b) => a - b);

    return typicalHours;
  }

  /**
   * Find typical days of week from a list
   */
  private findTypicalDays(days: number[]): number[] {
    if (days.length === 0) return [];

    // Count occurrences
    const dayCounts: Record<number, number> = {};
    days.forEach(d => {
      dayCounts[d] = (dayCounts[d] || 0) + 1;
    });

    // Find days that appear frequently (>25% of changes)
    const threshold = days.length * 0.25;
    const typicalDays = Object.entries(dayCounts)
      .filter(([_, count]) => count >= threshold || count >= 2)
      .map(([day]) => parseInt(day, 10))
      .sort((a, b) => a - b);

    return typicalDays;
  }

  /**
   * Calculate recommended poll interval based on pattern
   */
  private calculateRecommendedInterval(pattern: ContentChangePattern): number {
    const { frequencyStats, detectedPattern } = pattern;

    // Static content - maximum interval
    if (detectedPattern === 'static') {
      return this.config.maxPollIntervalMs;
    }

    // Unknown pattern - start with frequent checks
    if (detectedPattern === 'unknown' || frequencyStats.changeCount < 2) {
      // Start with 1 hour and adjust as we learn
      return Math.min(60 * 60 * 1000, this.config.maxPollIntervalMs);
    }

    // Use 80% of average interval for a buffer
    const avgIntervalMs = frequencyStats.avgIntervalHours * 60 * 60 * 1000;
    let recommendedMs = avgIntervalMs * 0.8;

    // Apply confidence adjustment - less confident = more frequent checks
    if (pattern.patternConfidence < 0.5) {
      recommendedMs *= 0.5; // Double the check frequency
    } else if (pattern.patternConfidence < 0.7) {
      recommendedMs *= 0.7; // 30% more frequent
    }

    // Apply irregular pattern adjustment
    if (detectedPattern === 'irregular') {
      recommendedMs *= 0.6; // 40% more frequent for unpredictable content
    }

    // Clamp to min/max
    return Math.max(
      this.config.minPollIntervalMs,
      Math.min(this.config.maxPollIntervalMs, recommendedMs)
    );
  }

  /**
   * Generate next change prediction
   */
  private generatePrediction(pattern: ContentChangePattern): ChangePrediction | undefined {
    const { detectedPattern, temporalPattern, frequencyStats, changeTimestamps } = pattern;

    if (changeTimestamps.length < 2) {
      return undefined;
    }

    const lastChange = changeTimestamps[changeTimestamps.length - 1];
    const now = Date.now();
    let predictedAt: number;
    let uncertaintyWindowMs: number;
    let reason: string;

    switch (detectedPattern) {
      case 'static':
        // Predict far in the future
        predictedAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days
        uncertaintyWindowMs = 7 * 24 * 60 * 60 * 1000; // 7 day window
        reason = 'Content appears static, change unlikely';
        break;

      case 'hourly': {
        const avgIntervalMs = frequencyStats.avgIntervalHours * 60 * 60 * 1000;
        predictedAt = lastChange + avgIntervalMs;
        // Adjust if prediction is in the past
        while (predictedAt < now) {
          predictedAt += avgIntervalMs;
        }
        uncertaintyWindowMs = avgIntervalMs * 0.2;
        reason = `Expected every ~${frequencyStats.avgIntervalHours.toFixed(1)} hours`;
        break;
      }

      case 'daily': {
        // Predict next occurrence at typical hour
        const typicalHour = temporalPattern?.typicalHoursOfDay[0] ?? 12;
        const nextDate = new Date();
        nextDate.setUTCHours(typicalHour, 0, 0, 0);
        if (nextDate.getTime() <= now) {
          nextDate.setUTCDate(nextDate.getUTCDate() + 1);
        }
        predictedAt = nextDate.getTime();
        uncertaintyWindowMs = this.config.timeOfDayToleranceHours * 60 * 60 * 1000;
        reason = `Daily updates typically at ${typicalHour}:00 UTC`;
        break;
      }

      case 'workday': {
        // Predict next workday at typical hour
        const typicalHour = temporalPattern?.typicalHoursOfDay[0] ?? 9;
        const nextDate = new Date();
        nextDate.setUTCHours(typicalHour, 0, 0, 0);
        if (nextDate.getTime() <= now) {
          nextDate.setUTCDate(nextDate.getUTCDate() + 1);
        }
        // Skip to next weekday
        while (nextDate.getUTCDay() === 0 || nextDate.getUTCDay() === 6) {
          nextDate.setUTCDate(nextDate.getUTCDate() + 1);
        }
        predictedAt = nextDate.getTime();
        uncertaintyWindowMs = this.config.timeOfDayToleranceHours * 60 * 60 * 1000;
        reason = `Workday updates typically at ${typicalHour}:00 UTC`;
        break;
      }

      case 'weekly': {
        // Predict next occurrence on typical day
        const typicalDay = temporalPattern?.typicalDaysOfWeek[0] ?? 1; // Default Monday
        const typicalHour = temporalPattern?.typicalHoursOfDay[0] ?? 9;
        const nextDate = new Date();
        nextDate.setUTCHours(typicalHour, 0, 0, 0);
        // Find next occurrence of the typical day
        while (nextDate.getUTCDay() !== typicalDay || nextDate.getTime() <= now) {
          nextDate.setUTCDate(nextDate.getUTCDate() + 1);
        }
        predictedAt = nextDate.getTime();
        uncertaintyWindowMs = this.config.timeOfDayToleranceHours * 60 * 60 * 1000;
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        reason = `Weekly updates on ${dayNames[typicalDay]} at ${typicalHour}:00 UTC`;
        break;
      }

      case 'monthly': {
        // Predict next occurrence on typical day of month
        const typicalDayOfMonth = temporalPattern?.typicalDaysOfMonth?.[0] ?? 1;
        const typicalHour = temporalPattern?.typicalHoursOfDay[0] ?? 9;
        const nextDate = new Date();
        nextDate.setUTCDate(typicalDayOfMonth);
        nextDate.setUTCHours(typicalHour, 0, 0, 0);
        if (nextDate.getTime() <= now) {
          nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
        }
        predictedAt = nextDate.getTime();
        uncertaintyWindowMs = 24 * 60 * 60 * 1000; // 1 day window for monthly
        reason = `Monthly updates on day ${typicalDayOfMonth}`;
        break;
      }

      case 'irregular':
      default: {
        // Use average interval for irregular patterns
        const avgIntervalMs = frequencyStats.avgIntervalHours * 60 * 60 * 1000;
        predictedAt = lastChange + avgIntervalMs;
        while (predictedAt < now) {
          predictedAt += avgIntervalMs;
        }
        uncertaintyWindowMs = avgIntervalMs * 0.4; // Wide window for irregular
        reason = `Irregular updates, ~${frequencyStats.avgIntervalHours.toFixed(1)} hours average`;
        break;
      }
    }

    // Calculate prediction confidence based on pattern confidence and sample size
    let confidence = pattern.patternConfidence;

    // Reduce confidence for predictions far in the future
    const hoursUntilPrediction = (predictedAt - now) / (60 * 60 * 1000);
    if (hoursUntilPrediction > 72) {
      confidence *= 0.7;
    } else if (hoursUntilPrediction > 24) {
      confidence *= 0.85;
    }

    // Reduce confidence for irregular patterns
    if (detectedPattern === 'irregular') {
      confidence *= 0.6;
    }

    return {
      predictedAt,
      confidence: Math.max(0.1, Math.min(1, confidence)),
      uncertaintyWindowMs,
      reason,
    };
  }

  /**
   * Analyze and update a pattern in place
   */
  private analyzeAndUpdatePattern(pattern: ContentChangePattern): void {
    const detection = this.detectPatternType(pattern.changeTimestamps);

    pattern.detectedPattern = detection.type;
    pattern.patternConfidence = detection.confidence;
    pattern.temporalPattern = detection.temporalPattern;
    pattern.lastAnalyzedAt = Date.now();

    // Update recommended poll interval
    pattern.recommendedPollIntervalMs = this.calculateRecommendedInterval(pattern);

    // Generate prediction if confidence is high enough
    if (pattern.patternConfidence >= this.config.confidenceThresholdForPrediction) {
      pattern.nextPrediction = this.generatePrediction(pattern);
    }

    // INT-018: Detect calendar triggers and seasonal patterns
    pattern.calendarTriggers = this.detectCalendarTriggers(pattern.changeTimestamps);
    pattern.seasonalPattern = this.detectSeasonalPatterns(pattern.changeTimestamps);
    pattern.urgencyLevel = this.calculateUrgency(pattern.domain, pattern.urlPattern);

    log.info('Pattern analyzed', {
      domain: pattern.domain,
      urlPattern: pattern.urlPattern,
      detectedPattern: pattern.detectedPattern,
      confidence: pattern.patternConfidence.toFixed(2),
      recommendedIntervalHours: (pattern.recommendedPollIntervalMs / (60 * 60 * 1000)).toFixed(1),
      nextPrediction: pattern.nextPrediction?.predictedAt
        ? new Date(pattern.nextPrediction.predictedAt).toISOString()
        : undefined,
      calendarTriggers: pattern.calendarTriggers?.length || 0,
      urgencyLevel: pattern.urgencyLevel,
    });
  }

  /**
   * Generate analysis summary and recommendations
   */
  private generateAnalysisSummary(
    pattern: ContentChangePattern,
    hasEnoughData: boolean
  ): { summary: string; recommendations: string[] } {
    const recommendations: string[] = [];
    let summary: string;

    if (!hasEnoughData) {
      summary = `Insufficient data for pattern detection. Have ${pattern.changeTimestamps.length} changes, need ${this.config.minChangesForPattern}.`;
      recommendations.push('Continue monitoring to collect more data points');
      recommendations.push(`Check content periodically (every ${(pattern.recommendedPollIntervalMs / (60 * 60 * 1000)).toFixed(1)} hours)`);
      return { summary, recommendations };
    }

    const { detectedPattern, patternConfidence, frequencyStats, temporalPattern } = pattern;

    switch (detectedPattern) {
      case 'static':
        summary = 'Content appears static (no changes detected recently)';
        recommendations.push('Check infrequently (every 24 hours max)');
        recommendations.push('Consider subscribing to RSS/webhooks instead');
        break;

      case 'hourly':
        summary = `Content updates approximately every ${frequencyStats.avgIntervalHours.toFixed(1)} hours`;
        recommendations.push(`Poll every ${(pattern.recommendedPollIntervalMs / (60 * 60 * 1000)).toFixed(1)} hours`);
        break;

      case 'daily':
        summary = `Content updates daily, typically around ${temporalPattern?.typicalHoursOfDay.join(', ')}:00 UTC`;
        recommendations.push('Poll once daily near typical update time');
        if (temporalPattern?.typicalHoursOfDay[0] !== undefined) {
          recommendations.push(`Best check time: ${temporalPattern.typicalHoursOfDay[0]}:00 UTC`);
        }
        break;

      case 'workday':
        summary = 'Content updates on weekdays only';
        recommendations.push('Skip weekend checks');
        if (temporalPattern?.typicalHoursOfDay[0] !== undefined) {
          recommendations.push(`Check during business hours (~${temporalPattern.typicalHoursOfDay[0]}:00 UTC)`);
        }
        break;

      case 'weekly':
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const typicalDays = temporalPattern?.typicalDaysOfWeek.map(d => dayNames[d]).join(', ') || 'unknown';
        summary = `Content updates weekly on ${typicalDays}`;
        recommendations.push(`Poll on ${typicalDays}`);
        break;

      case 'monthly':
        summary = `Content updates monthly on day(s) ${temporalPattern?.typicalDaysOfMonth?.join(', ')}`;
        recommendations.push('Check monthly near typical update date');
        break;

      case 'irregular':
        summary = `Content changes irregularly, averaging every ${frequencyStats.avgIntervalHours.toFixed(1)} hours`;
        recommendations.push('Poll frequently due to unpredictable changes');
        recommendations.push(`Recommended interval: ${(pattern.recommendedPollIntervalMs / (60 * 60 * 1000)).toFixed(1)} hours`);
        break;

      default:
        summary = 'Pattern not yet determined';
        recommendations.push('Continue monitoring to establish pattern');
    }

    // Add confidence note
    if (patternConfidence >= 0.8) {
      recommendations.push(`High confidence (${(patternConfidence * 100).toFixed(0)}%) - predictions reliable`);
    } else if (patternConfidence >= 0.5) {
      recommendations.push(`Medium confidence (${(patternConfidence * 100).toFixed(0)}%) - monitor for pattern changes`);
    } else {
      recommendations.push(`Low confidence (${(patternConfidence * 100).toFixed(0)}%) - continue gathering data`);
    }

    return { summary, recommendations };
  }

  // ============================================================================
  // INT-018: Enhanced Prediction Methods
  // ============================================================================

  /**
   * Detect calendar-based triggers (annual dates with consistent changes)
   * Examples: Government fee updates on Jan 1, fiscal year changes on Apr 1
   */
  private detectCalendarTriggers(timestamps: number[]): CalendarTrigger[] {
    if (timestamps.length < this.config.minCalendarTriggerObservations) {
      return [];
    }

    // Group changes by month-day combination
    const monthDayCounts = new Map<string, { month: number; day: number; years: number[] }>();

    for (const ts of timestamps) {
      const date = new Date(ts);
      const month = date.getUTCMonth() + 1; // 1-12
      const day = date.getUTCDate();
      const year = date.getUTCFullYear();
      const key = `${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

      if (!monthDayCounts.has(key)) {
        monthDayCounts.set(key, { month, day, years: [] });
      }
      const entry = monthDayCounts.get(key)!;
      if (!entry.years.includes(year)) {
        entry.years.push(year);
      }
    }

    // Find dates that have changes in multiple years
    const triggers: CalendarTrigger[] = [];

    for (const entry of Array.from(monthDayCounts.values())) {
      if (entry.years.length >= this.config.minCalendarTriggerObservations) {
        const yearsArray = entry.years.slice().sort((a, b) => b - a);
        const confidence = Math.min(0.95, 0.5 + (entry.years.length * 0.15));

        triggers.push({
          month: entry.month,
          dayOfMonth: entry.day,
          historicalCount: entry.years.length,
          confidence,
          lastObservedYear: yearsArray[0],
        });
      }
    }

    // Sort by confidence descending
    return triggers.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Detect seasonal patterns (month/day probability distributions)
   */
  private detectSeasonalPatterns(timestamps: number[]): SeasonalPattern | undefined {
    if (timestamps.length < this.config.minObservationsForPattern) {
      return undefined;
    }

    // Count changes per month (0-11)
    const monthlyCounts = new Array(12).fill(0);
    // Count changes per day of month (0-30 for days 1-31)
    const dayOfMonthCounts = new Array(31).fill(0);

    for (const ts of timestamps) {
      const date = new Date(ts);
      monthlyCounts[date.getUTCMonth()]++;
      dayOfMonthCounts[date.getUTCDate() - 1]++;
    }

    const totalChanges = timestamps.length;

    // Calculate probabilities
    const monthlyProbability = monthlyCounts.map(c => c / totalChanges);
    const dayOfMonthProbability = dayOfMonthCounts.map(c => c / totalChanges);

    // Calculate average probability for threshold detection
    const avgMonthlyProb = 1 / 12;
    const avgDayProb = 1 / 31;
    const threshold = this.config.seasonalHighChangeThreshold;

    // Find high-change months and days
    const highChangeMonths: number[] = [];
    for (let i = 0; i < 12; i++) {
      if (monthlyProbability[i] >= avgMonthlyProb * threshold) {
        highChangeMonths.push(i + 1); // Convert to 1-12
      }
    }

    const highChangeDays: number[] = [];
    for (let i = 0; i < 31; i++) {
      if (dayOfMonthProbability[i] >= avgDayProb * threshold) {
        highChangeDays.push(i + 1); // Convert to 1-31
      }
    }

    return {
      monthlyProbability,
      dayOfMonthProbability,
      totalObservations: totalChanges,
      highChangeMonths,
      highChangeDays,
    };
  }

  /**
   * Record prediction accuracy for learning
   * Call this after checking content to compare predicted vs actual change
   */
  recordPredictionAccuracy(
    domain: string,
    urlPattern: string,
    actualChanged: boolean,
    actualChangeAt?: number
  ): void {
    const key = getPatternKey(domain, urlPattern);
    const pattern = this.patterns.get(key);

    if (!pattern || !pattern.nextPrediction) {
      return;
    }

    const prediction = pattern.nextPrediction;
    const now = actualChangeAt || Date.now();

    // Initialize accuracy history if needed
    if (!pattern.accuracyHistory) {
      pattern.accuracyHistory = [];
    }

    // Calculate if prediction was accurate
    const windowStart = prediction.predictedAt - prediction.uncertaintyWindowMs;
    const windowEnd = prediction.predictedAt + prediction.uncertaintyWindowMs;
    const wasAccurate = actualChanged && now >= windowStart && now <= windowEnd;

    // Calculate error
    const errorMs = actualChanged ? (now - prediction.predictedAt) : null;

    const record: PredictionAccuracyRecord = {
      predictedAt: prediction.predictedAt,
      predictedChangeAt: prediction.predictedAt,
      actualChangeAt: actualChanged ? now : null,
      wasAccurate,
      errorMs,
      patternType: pattern.detectedPattern,
      confidenceAtPrediction: prediction.confidence,
    };

    pattern.accuracyHistory.push(record);

    // Update success counters
    pattern.predictionAttemptCount++;
    if (wasAccurate) {
      pattern.predictionSuccessCount++;
    }

    // Trim accuracy history if needed
    if (pattern.accuracyHistory.length > this.config.maxAccuracyRecords) {
      pattern.accuracyHistory = pattern.accuracyHistory.slice(-this.config.maxAccuracyRecords);
    }

    log.debug('Recorded prediction accuracy', {
      domain,
      urlPattern,
      wasAccurate,
      errorMs,
      successRate: pattern.predictionAttemptCount > 0
        ? (pattern.predictionSuccessCount / pattern.predictionAttemptCount).toFixed(2)
        : 'N/A',
    });
  }

  /**
   * Calculate urgency level for refresh prioritization
   * 0 = Low (static content, check weekly)
   * 1 = Normal (regular patterns, follow schedule)
   * 2 = High (approaching predicted change, check soon)
   * 3 = Critical (calendar trigger imminent, check immediately)
   */
  calculateUrgency(domain: string, urlPattern: string, now: number = Date.now()): UrgencyLevel {
    const key = getPatternKey(domain, urlPattern);
    const pattern = this.patterns.get(key);

    if (!pattern) {
      return 1; // Normal urgency for unknown patterns
    }

    // Static content = low urgency
    if (pattern.detectedPattern === 'static') {
      return 0;
    }

    // Check for imminent calendar triggers
    if (pattern.calendarTriggers && pattern.calendarTriggers.length > 0) {
      const leadTimeMs = this.config.calendarTriggerLeadDays * 24 * 60 * 60 * 1000;
      const currentDate = new Date(now);
      const currentYear = currentDate.getUTCFullYear();

      for (const trigger of pattern.calendarTriggers) {
        // Check this year's trigger date
        const triggerDate = new Date(Date.UTC(currentYear, trigger.month - 1, trigger.dayOfMonth));

        // If trigger date has passed this year, check next year
        if (triggerDate.getTime() < now) {
          triggerDate.setUTCFullYear(currentYear + 1);
        }

        const timeUntilTrigger = triggerDate.getTime() - now;

        // Critical if within lead time
        if (timeUntilTrigger <= leadTimeMs && trigger.confidence >= 0.7) {
          log.debug('Calendar trigger approaching', {
            domain,
            month: trigger.month,
            day: trigger.dayOfMonth,
            daysUntil: Math.ceil(timeUntilTrigger / (24 * 60 * 60 * 1000)),
          });
          return 3; // Critical
        }
      }
    }

    // Check for approaching prediction window
    if (pattern.nextPrediction && pattern.patternConfidence >= this.config.confidenceThresholdForPrediction) {
      const prediction = pattern.nextPrediction;
      const windowStart = prediction.predictedAt - prediction.uncertaintyWindowMs;
      const earlyCheckMs = this.config.earlyCheckWindowHours * 60 * 60 * 1000;

      // Within prediction window = high urgency
      if (now >= windowStart && now <= prediction.predictedAt + prediction.uncertaintyWindowMs) {
        return 2;
      }

      // Approaching prediction window = high urgency
      if (now >= windowStart - earlyCheckMs && now < windowStart) {
        return 2;
      }
    }

    // Irregular patterns get elevated urgency
    if (pattern.detectedPattern === 'irregular') {
      return 1; // Normal but could miss changes
    }

    // Default: normal urgency
    return 1;
  }

  /**
   * Get urgency for a pattern (convenience method that also updates the pattern)
   */
  updateUrgency(domain: string, urlPattern: string, now: number = Date.now()): UrgencyLevel {
    const urgency = this.calculateUrgency(domain, urlPattern, now);
    const key = getPatternKey(domain, urlPattern);
    const pattern = this.patterns.get(key);

    if (pattern) {
      pattern.urgencyLevel = urgency;
    }

    return urgency;
  }

  /**
   * Get all patterns with their urgency levels, sorted by urgency (highest first)
   */
  getPatternsWithUrgency(now: number = Date.now()): Array<ContentChangePattern & { currentUrgency: UrgencyLevel }> {
    const results: Array<ContentChangePattern & { currentUrgency: UrgencyLevel }> = [];

    for (const pattern of Array.from(this.patterns.values())) {
      const urgency = this.calculateUrgency(pattern.domain, pattern.urlPattern, now);
      pattern.urgencyLevel = urgency;
      results.push({
        ...pattern,
        currentUrgency: urgency,
      });
    }

    // Sort by urgency descending, then by next prediction time ascending
    return results.sort((a, b) => {
      if (b.currentUrgency !== a.currentUrgency) {
        return b.currentUrgency - a.currentUrgency;
      }
      // Same urgency: sort by next predicted change
      const aNext = a.nextPrediction?.predictedAt || Infinity;
      const bNext = b.nextPrediction?.predictedAt || Infinity;
      return aNext - bNext;
    });
  }

  /**
   * Get prediction accuracy statistics for a pattern
   */
  getAccuracyStats(domain: string, urlPattern: string): {
    totalPredictions: number;
    successfulPredictions: number;
    successRate: number;
    avgErrorMs: number | null;
    recentAccuracy: number | null;
  } | null {
    const key = getPatternKey(domain, urlPattern);
    const pattern = this.patterns.get(key);

    if (!pattern) {
      return null;
    }

    const successRate = pattern.predictionAttemptCount > 0
      ? pattern.predictionSuccessCount / pattern.predictionAttemptCount
      : 0;

    // Calculate average error from accuracy history
    let avgErrorMs: number | null = null;
    if (pattern.accuracyHistory && pattern.accuracyHistory.length > 0) {
      const errors = pattern.accuracyHistory
        .filter(r => r.errorMs !== null)
        .map(r => Math.abs(r.errorMs!));

      if (errors.length > 0) {
        avgErrorMs = errors.reduce((a, b) => a + b, 0) / errors.length;
      }
    }

    // Calculate recent accuracy (last 10 predictions)
    let recentAccuracy: number | null = null;
    if (pattern.accuracyHistory && pattern.accuracyHistory.length > 0) {
      const recent = pattern.accuracyHistory.slice(-10);
      const recentSuccesses = recent.filter(r => r.wasAccurate).length;
      recentAccuracy = recentSuccesses / recent.length;
    }

    return {
      totalPredictions: pattern.predictionAttemptCount,
      successfulPredictions: pattern.predictionSuccessCount,
      successRate,
      avgErrorMs,
      recentAccuracy,
    };
  }
}
