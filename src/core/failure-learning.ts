/**
 * Failure Learning Module
 *
 * Learns from API extraction failures to build anti-patterns
 * and implement smart retry strategies.
 *
 * This module:
 * 1. Classifies failures by type (auth, rate limit, timeout, etc.)
 * 2. Tracks failure patterns per domain/pattern
 * 3. Creates anti-patterns to avoid repeating mistakes
 * 4. Provides retry strategies based on failure type
 */

import { logger } from '../utils/logger.js';
import type {
  AntiPattern,
  FailureCategory,
  FailureClassification,
  FailureCounts,
  FailureRecord,
  RetryStrategy,
} from '../types/api-patterns.js';
import {
  ANTI_PATTERN_THRESHOLDS,
  RETRY_CONFIGS,
} from '../types/api-patterns.js';

const failureLogger = logger.create('FailureLearning');

// ============================================
// CONSTANTS
// ============================================

/** Maximum number of recent failures to keep per pattern */
const MAX_RECENT_FAILURES = 10;

/** Keywords indicating authentication issues */
const AUTH_KEYWORDS = [
  'unauthorized', 'authentication', 'auth', 'login', 'credential',
  'forbidden', 'access denied', 'permission', 'not allowed',
];

/** Keywords indicating rate limiting */
const RATE_LIMIT_KEYWORDS = [
  'rate limit', 'too many requests', 'throttle', 'quota exceeded',
  'slow down', 'try again later',
];

/** Keywords indicating server errors */
const SERVER_ERROR_KEYWORDS = [
  'internal server', 'service unavailable', 'bad gateway',
  'gateway timeout', 'temporarily unavailable',
];

/** Keywords indicating timeout */
const TIMEOUT_KEYWORDS = [
  'timeout', 'timed out', 'deadline exceeded', 'connection timeout',
  'request timeout', 'aborted',
];

/** Keywords indicating network errors */
const NETWORK_KEYWORDS = [
  'network', 'connection refused', 'connection reset', 'dns',
  'econnrefused', 'econnreset', 'enotfound', 'enetunreach',
];

/** Keywords indicating parse errors */
const PARSE_KEYWORDS = [
  'parse', 'json', 'xml', 'syntax', 'unexpected token',
  'invalid', 'malformed',
];

// ============================================
// FAILURE CLASSIFICATION
// ============================================

/**
 * Classify a failure based on HTTP response and/or error
 */
export function classifyFailure(
  statusCode: number | undefined,
  errorMessage: string,
  responseTime?: number
): FailureClassification {
  const messageLower = errorMessage.toLowerCase();

  // HTTP status code-based classification
  if (statusCode !== undefined) {
    if (statusCode === 401 || statusCode === 403) {
      return createClassification('auth_required', 1.0, errorMessage);
    }
    if (statusCode === 429) {
      return createClassification('rate_limited', 1.0, errorMessage);
    }
    if (statusCode === 404) {
      return createClassification('wrong_endpoint', 1.0, errorMessage);
    }
    if (statusCode >= 500 && statusCode < 600) {
      return createClassification('server_error', 0.9, errorMessage);
    }
    if (statusCode >= 400 && statusCode < 500) {
      // Other 4xx errors - could be various issues
      if (containsKeywords(messageLower, AUTH_KEYWORDS)) {
        return createClassification('auth_required', 0.8, errorMessage);
      }
      if (containsKeywords(messageLower, RATE_LIMIT_KEYWORDS)) {
        return createClassification('rate_limited', 0.8, errorMessage);
      }
      return createClassification('wrong_endpoint', 0.6, errorMessage);
    }
  }

  // Error message-based classification
  if (containsKeywords(messageLower, TIMEOUT_KEYWORDS)) {
    return createClassification('timeout', 0.9, errorMessage);
  }
  if (containsKeywords(messageLower, NETWORK_KEYWORDS)) {
    return createClassification('network_error', 0.9, errorMessage);
  }
  if (containsKeywords(messageLower, RATE_LIMIT_KEYWORDS)) {
    return createClassification('rate_limited', 0.8, errorMessage);
  }
  if (containsKeywords(messageLower, AUTH_KEYWORDS)) {
    return createClassification('auth_required', 0.8, errorMessage);
  }
  if (containsKeywords(messageLower, SERVER_ERROR_KEYWORDS)) {
    return createClassification('server_error', 0.8, errorMessage);
  }
  if (containsKeywords(messageLower, PARSE_KEYWORDS)) {
    return createClassification('parse_error', 0.8, errorMessage);
  }

  // Check for validation-related messages
  if (messageLower.includes('missing') && messageLower.includes('field')) {
    return createClassification('validation_failed', 0.9, errorMessage);
  }
  if (messageLower.includes('content too short') || messageLower.includes('too short')) {
    return createClassification('content_too_short', 0.9, errorMessage);
  }
  if (messageLower.includes('required field')) {
    return createClassification('validation_failed', 0.9, errorMessage);
  }

  // Default to unknown
  return createClassification('unknown', 0.3, errorMessage);
}

/**
 * Check if text contains any of the keywords
 */
function containsKeywords(text: string, keywords: string[]): boolean {
  return keywords.some(keyword => text.includes(keyword));
}

/**
 * Create a failure classification object
 */
function createClassification(
  category: FailureCategory,
  confidence: number,
  originalMessage: string
): FailureClassification {
  const retryConfig = RETRY_CONFIGS[category];

  return {
    category,
    confidence,
    recommendedStrategy: retryConfig.strategy,
    suggestedWaitMs: retryConfig.config?.initialDelayMs,
    shouldCreateAntiPattern: shouldCreateAntiPatternForCategory(category),
    message: originalMessage,
  };
}

/**
 * Determine if an anti-pattern should be created for this category
 */
function shouldCreateAntiPatternForCategory(category: FailureCategory): boolean {
  // These categories warrant creating an anti-pattern
  return [
    'auth_required',
    'wrong_endpoint',
    'parse_error',
    'validation_failed',
  ].includes(category);
}

// ============================================
// FAILURE TRACKING
// ============================================

/**
 * Create a failure record from classification
 */
export function createFailureRecord(
  classification: FailureClassification,
  domain: string,
  attemptedUrl: string,
  patternId: string,
  statusCode?: number,
  responseTime?: number
): FailureRecord {
  return {
    timestamp: Date.now(),
    category: classification.category,
    statusCode,
    message: classification.message,
    domain,
    attemptedUrl,
    patternId,
    responseTime,
  };
}

/**
 * Create an empty failure counts object
 */
export function createEmptyFailureCounts(): FailureCounts {
  return {
    auth_required: 0,
    rate_limited: 0,
    wrong_endpoint: 0,
    server_error: 0,
    timeout: 0,
    parse_error: 0,
    validation_failed: 0,
    content_too_short: 0,
    network_error: 0,
    unknown: 0,
  };
}

/**
 * Increment failure count for a category
 */
export function incrementFailureCount(
  counts: FailureCounts,
  category: FailureCategory
): FailureCounts {
  return {
    ...counts,
    [category]: counts[category] + 1,
  };
}

/**
 * Add a failure record to a list, keeping only the most recent
 */
export function addFailureRecord(
  records: FailureRecord[],
  newRecord: FailureRecord
): FailureRecord[] {
  const updated = [...records, newRecord];
  if (updated.length > MAX_RECENT_FAILURES) {
    return updated.slice(-MAX_RECENT_FAILURES);
  }
  return updated;
}

/**
 * Get failures within a time window
 */
export function getRecentFailures(
  records: FailureRecord[],
  windowMs: number = ANTI_PATTERN_THRESHOLDS.timeWindowMs
): FailureRecord[] {
  const cutoff = Date.now() - windowMs;
  return records.filter(r => r.timestamp > cutoff);
}

/**
 * Count failures by category within a time window
 */
export function countRecentFailuresByCategory(
  records: FailureRecord[],
  category: FailureCategory,
  windowMs: number = ANTI_PATTERN_THRESHOLDS.timeWindowMs
): number {
  const recent = getRecentFailures(records, windowMs);
  return recent.filter(r => r.category === category).length;
}

// ============================================
// ANTI-PATTERN MANAGEMENT
// ============================================

/**
 * Create an anti-pattern from repeated failures
 *
 * Note: The caller (maybeCreateAntiPattern) pre-filters failures by category,
 * so all failures will have the same category. We just take from the first.
 */
export function createAntiPattern(
  failures: FailureRecord[],
  sourcePatternId?: string
): AntiPattern | null {
  if (failures.length < ANTI_PATTERN_THRESHOLDS.minFailures) {
    return null;
  }

  // Failures are pre-filtered by category, so we take from the first record
  const dominantCategory = failures[0].category;

  // Get unique domains
  const domains = [...new Set(failures.map(f => f.domain))];

  // Get URL patterns (simplified - just use the domain patterns)
  const urlPatterns = domains.map(d => `^https?://(www\\.)?${d.replace(/\./g, '\\.')}`);

  // Determine suppression duration
  let suppressionDurationMs: number;
  switch (dominantCategory) {
    case 'auth_required':
      suppressionDurationMs = ANTI_PATTERN_THRESHOLDS.authSuppressionMs;
      break;
    case 'rate_limited':
      suppressionDurationMs = ANTI_PATTERN_THRESHOLDS.rateLimitSuppressionMs;
      break;
    default:
      suppressionDurationMs = ANTI_PATTERN_THRESHOLDS.defaultSuppressionMs;
  }

  const now = Date.now();
  const id = `anti:${sourcePatternId || 'unknown'}:${dominantCategory}:${now}`;

  return {
    id,
    sourcePatternId,
    domains,
    urlPatterns,
    failureCategory: dominantCategory,
    reason: `${failures.length} failures of type ${dominantCategory} in ${domains.join(', ')}`,
    recommendedAction: RETRY_CONFIGS[dominantCategory].strategy,
    suppressionDurationMs,
    createdAt: now,
    expiresAt: suppressionDurationMs > 0 ? now + suppressionDurationMs : 0,
    failureCount: failures.length,
    lastFailure: Math.max(...failures.map(f => f.timestamp)),
  };
}

/**
 * Check if an anti-pattern is still active
 */
export function isAntiPatternActive(antiPattern: AntiPattern): boolean {
  // expiresAt of 0 means never expires
  if (antiPattern.expiresAt === 0) {
    return true;
  }
  return Date.now() < antiPattern.expiresAt;
}

/**
 * Check if a URL matches any active anti-patterns
 */
export function matchAntiPatterns(
  url: string,
  antiPatterns: AntiPattern[]
): AntiPattern[] {
  const activePatterns = antiPatterns.filter(isAntiPatternActive);
  const matches: AntiPattern[] = [];

  for (const antiPattern of activePatterns) {
    for (const pattern of antiPattern.urlPatterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(url)) {
          matches.push(antiPattern);
          break;
        }
      } catch {
        // Invalid regex pattern, skip
      }
    }
  }

  return matches;
}

/**
 * Update an existing anti-pattern with new failure data
 */
export function updateAntiPattern(
  existing: AntiPattern,
  newFailure: FailureRecord
): AntiPattern {
  const now = Date.now();

  // Extend suppression if still failing
  let newExpiresAt = existing.expiresAt;
  if (existing.expiresAt > 0) {
    // Extend by the original suppression duration
    newExpiresAt = now + existing.suppressionDurationMs;
  }

  return {
    ...existing,
    failureCount: existing.failureCount + 1,
    lastFailure: now,
    expiresAt: newExpiresAt,
  };
}

// ============================================
// RETRY STRATEGY HELPERS
// ============================================

/**
 * Calculate wait time for retry based on category and attempt number
 */
export function calculateRetryWait(
  category: FailureCategory,
  attemptNumber: number
): number {
  const config = RETRY_CONFIGS[category].config;
  if (!config) {
    return 0; // No retry for this category
  }

  if (attemptNumber > config.maxRetries) {
    return -1; // No more retries
  }

  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attemptNumber - 1);
  return Math.min(delay, config.maxDelayMs);
}

/**
 * Check if a failure category should be retried
 */
export function shouldRetry(category: FailureCategory, attemptNumber: number): boolean {
  const config = RETRY_CONFIGS[category];
  if (config.strategy === 'none') {
    return false;
  }
  if (!config.config) {
    return false;
  }
  return attemptNumber <= config.config.maxRetries;
}

/**
 * Get the retry strategy for a failure category
 */
export function getRetryStrategy(category: FailureCategory): RetryStrategy {
  return RETRY_CONFIGS[category].strategy;
}

// ============================================
// PATTERN METRICS HELPERS
// ============================================

/**
 * Analyze pattern failure history to determine if it should be suppressed
 */
export function analyzePatternHealth(
  recentFailures: FailureRecord[],
  successCount: number,
  failureCount: number
): {
  isHealthy: boolean;
  dominantFailureType: FailureCategory | null;
  suggestedAction: RetryStrategy;
  reason: string;
} {
  // Calculate success rate
  const total = successCount + failureCount;
  const successRate = total > 0 ? successCount / total : 0;

  // Get recent failure count
  const recentCount = recentFailures.length;

  // If high success rate and few recent failures, pattern is healthy
  if (successRate > 0.8 && recentCount < 3) {
    return {
      isHealthy: true,
      dominantFailureType: null,
      suggestedAction: 'none',
      reason: `Pattern is healthy (${(successRate * 100).toFixed(0)}% success rate)`,
    };
  }

  // Find dominant failure type in recent failures
  const categoryCounts = new Map<FailureCategory, number>();
  for (const failure of recentFailures) {
    categoryCounts.set(
      failure.category,
      (categoryCounts.get(failure.category) || 0) + 1
    );
  }

  let dominantCategory: FailureCategory | null = null;
  let maxCount = 0;
  for (const [category, count] of categoryCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantCategory = category;
    }
  }

  // Determine if unhealthy
  const isUnhealthy = successRate < 0.3 || recentCount >= ANTI_PATTERN_THRESHOLDS.minFailures;

  if (isUnhealthy && dominantCategory) {
    return {
      isHealthy: false,
      dominantFailureType: dominantCategory,
      suggestedAction: RETRY_CONFIGS[dominantCategory].strategy,
      reason: `Pattern unhealthy: ${recentCount} recent failures, mostly ${dominantCategory}`,
    };
  }

  return {
    isHealthy: true,
    dominantFailureType: dominantCategory,
    suggestedAction: 'none',
    reason: 'Pattern is recovering',
  };
}

// ============================================
// LOGGING AND DIAGNOSTICS
// ============================================

/**
 * Log a failure with classification details
 */
export function logFailure(
  classification: FailureClassification,
  context: {
    domain: string;
    url: string;
    patternId?: string;
    statusCode?: number;
  }
): void {
  const logLevel = classification.confidence > 0.7 ? 'info' : 'debug';

  failureLogger[logLevel]('API failure classified', {
    category: classification.category,
    confidence: classification.confidence,
    strategy: classification.recommendedStrategy,
    shouldCreateAntiPattern: classification.shouldCreateAntiPattern,
    ...context,
  });
}

/**
 * Get a human-readable summary of failure history
 */
export function getFailureSummary(counts: FailureCounts): string {
  const parts: string[] = [];
  for (const [category, count] of Object.entries(counts)) {
    if (count > 0) {
      parts.push(`${category}: ${count}`);
    }
  }
  return parts.length > 0 ? parts.join(', ') : 'No failures';
}
