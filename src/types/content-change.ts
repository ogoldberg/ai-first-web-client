/**
 * Content Change Prediction Types (GAP-011)
 *
 * Types for learning content update patterns and predicting when content will change.
 * Enables optimal polling intervals to minimize unnecessary fetches.
 *
 * @example
 * ```typescript
 * // Content that updates daily at 9 AM
 * const pattern: ContentChangePattern = {
 *   urlPattern: '/api/news/.*',
 *   domain: 'news.example.com',
 *   detectedPattern: 'daily',
 *   patternConfidence: 0.85,
 *   timesOfDay: [9], // 9 AM
 *   nextPredictedChange: Date.now() + 3600000,
 *   recommendedPollIntervalMs: 3600000, // 1 hour
 * };
 * ```
 */

/**
 * Types of detected change patterns
 */
export type ChangePatternType =
  | 'static' // Never or rarely changes (< 1/month)
  | 'hourly' // Changes every N hours
  | 'daily' // Changes at specific times each day
  | 'weekly' // Changes on specific days of week
  | 'workday' // Changes on weekdays only
  | 'monthly' // Changes on specific days of month
  | 'irregular' // Changes unpredictably
  | 'unknown'; // Not enough data to determine

/**
 * Historical snapshot of change observations
 */
export interface ChangeObservation {
  /** When the content was checked */
  checkedAt: number;
  /** Whether content changed since last check */
  changed: boolean;
  /** Hash of content (for deduplication) */
  contentHash?: string;
}

/**
 * Temporal pattern details for periodic changes
 */
export interface TemporalPattern {
  /** Hours of day when changes typically occur (0-23) */
  typicalHoursOfDay: number[];
  /** Days of week when changes occur (0=Sunday, 6=Saturday) */
  typicalDaysOfWeek: number[];
  /** Days of month when changes occur (1-31) */
  typicalDaysOfMonth?: number[];
  /** Timezone for interpretation (default: UTC) */
  timezone: string;
}

/**
 * Statistics about change frequency
 */
export interface ChangeFrequencyStats {
  /** Average hours between changes */
  avgIntervalHours: number;
  /** Minimum hours between changes observed */
  minIntervalHours: number;
  /** Maximum hours between changes observed */
  maxIntervalHours: number;
  /** Standard deviation of change intervals */
  stdDevHours: number;
  /** Number of change observations */
  changeCount: number;
  /** Number of total observations (checks) */
  observationCount: number;
}

/**
 * Prediction for next content change
 */
export interface ChangePrediction {
  /** Timestamp when change is predicted */
  predictedAt: number;
  /** Confidence in prediction (0-1) */
  confidence: number;
  /** Window around prediction (+/- milliseconds) */
  uncertaintyWindowMs: number;
  /** Reason for this prediction */
  reason: string;
}

/**
 * Full content change pattern with learning data
 */
export interface ContentChangePattern {
  /** Unique ID for this pattern */
  id: string;
  /** URL pattern (regex) this applies to */
  urlPattern: string;
  /** Domain for this pattern */
  domain: string;

  // Pattern detection
  /** Type of pattern detected */
  detectedPattern: ChangePatternType;
  /** Confidence in pattern detection (0-1) */
  patternConfidence: number;
  /** Temporal pattern details (for periodic patterns) */
  temporalPattern?: TemporalPattern;

  // Frequency statistics
  /** Change frequency statistics */
  frequencyStats: ChangeFrequencyStats;

  // Predictions
  /** Current prediction for next change */
  nextPrediction?: ChangePrediction;
  /** Recommended polling interval in milliseconds */
  recommendedPollIntervalMs: number;

  // Historical data
  /** Recent observations (limited to avoid unbounded growth) */
  recentObservations: ChangeObservation[];
  /** Change timestamps (when content actually changed) */
  changeTimestamps: number[];

  // Metadata
  /** When this pattern was created */
  createdAt: number;
  /** When pattern was last analyzed */
  lastAnalyzedAt: number;
  /** When pattern was last verified correct */
  lastVerifiedAt?: number;
  /** How many times prediction was correct */
  predictionSuccessCount: number;
  /** How many times prediction was made */
  predictionAttemptCount: number;
}

/**
 * Configuration for content change prediction
 */
export interface ContentChangePredictionConfig {
  /** Minimum observations before pattern detection (default: 5) */
  minObservationsForPattern: number;
  /** Minimum changes before pattern detection (default: 3) */
  minChangesForPattern: number;
  /** Maximum observations to keep in history (default: 100) */
  maxObservationsToKeep: number;
  /** Maximum change timestamps to keep (default: 50) */
  maxChangeTimestamps: number;
  /** Pattern confidence threshold to enable predictions (default: 0.5) */
  confidenceThresholdForPrediction: number;
  /** Hours before predicted change to start checking (default: 1) */
  earlyCheckWindowHours: number;
  /** Maximum recommended poll interval in ms (default: 24h) */
  maxPollIntervalMs: number;
  /** Minimum recommended poll interval in ms (default: 5 min) */
  minPollIntervalMs: number;
  /** Static content threshold: days without change (default: 30) */
  staticContentDaysThreshold: number;
  /** Tolerance for time-of-day matching in hours (default: 2) */
  timeOfDayToleranceHours: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_CHANGE_PREDICTION_CONFIG: ContentChangePredictionConfig = {
  minObservationsForPattern: 5,
  minChangesForPattern: 3,
  maxObservationsToKeep: 100,
  maxChangeTimestamps: 50,
  confidenceThresholdForPrediction: 0.5,
  earlyCheckWindowHours: 1,
  maxPollIntervalMs: 24 * 60 * 60 * 1000, // 24 hours
  minPollIntervalMs: 5 * 60 * 1000, // 5 minutes
  staticContentDaysThreshold: 30,
  timeOfDayToleranceHours: 2,
};

/**
 * Analysis result from content change predictor
 */
export interface ContentChangeAnalysis {
  /** The analyzed pattern */
  pattern: ContentChangePattern;
  /** Whether there's enough data for reliable prediction */
  hasEnoughData: boolean;
  /** Summary of what was learned */
  summary: string;
  /** Recommended actions */
  recommendations: string[];
}

/**
 * Result of shouldCheckNow() query
 */
export interface PollRecommendation {
  /** Whether to poll now */
  shouldPoll: boolean;
  /** Reason for recommendation */
  reason: string;
  /** When to check next (timestamp) */
  nextCheckAt: number;
  /** Confidence in recommendation (0-1) */
  confidence: number;
}
