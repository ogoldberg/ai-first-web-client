/**
 * Field-Level Confidence Map (CX-002)
 *
 * Provides per-field confidence scores in MCP tool responses.
 * This allows LLM clients to:
 * - Weight different fields appropriately when making decisions
 * - Know which extracted data is reliable vs uncertain
 * - Request re-extraction for low-confidence fields
 *
 * Confidence Scale: 0.0 to 1.0
 * - 1.0: Extracted from structured data (JSON-LD, API, schema)
 * - 0.8-0.9: Strong selector match, validated
 * - 0.6-0.8: Selector match, partially validated
 * - 0.4-0.6: Heuristic extraction, needs verification
 * - 0.2-0.4: Fallback extraction, low reliability
 * - 0.0-0.2: Best-effort guess, treat with caution
 */

/**
 * Confidence level with human-readable label
 */
export type ConfidenceLevel = 'very_high' | 'high' | 'medium' | 'low' | 'very_low';

/**
 * Single field confidence entry
 */
export interface FieldConfidence {
  /** Numeric confidence score (0.0 to 1.0) */
  score: number;

  /** Human-readable confidence level */
  level: ConfidenceLevel;

  /** Source that provided this data */
  source: ExtractionSource;

  /** Optional reason explaining the confidence */
  reason?: string;
}

/**
 * Source of the extracted data
 */
export type ExtractionSource =
  | 'structured_data'    // JSON-LD, Schema.org, OpenGraph
  | 'api_response'       // Direct API call
  | 'graphql'            // GraphQL introspection
  | 'selector_match'     // CSS/XPath selector match
  | 'learned_pattern'    // Previously learned pattern
  | 'framework_data'     // Next.js/Nuxt/Gatsby __NEXT_DATA__
  | 'meta_tags'          // HTML meta tags
  | 'heuristic'          // Heuristic extraction
  | 'fallback'           // Fallback/best-effort extraction
  | 'unknown';           // Source not tracked

/**
 * Confidence map for browse result fields
 */
export interface BrowseFieldConfidence {
  /** Confidence in extracted title */
  title: FieldConfidence;

  /** Confidence in markdown content */
  content: FieldConfidence;

  /** Confidence in tables (if present) */
  tables?: TableConfidence[];

  /** Confidence in discovered APIs */
  discoveredApis?: ApiConfidence[];

  /** Overall extraction confidence */
  overall: FieldConfidence;
}

/**
 * Confidence for an extracted table
 */
export interface TableConfidence {
  /** Table index in the result */
  index: number;

  /** Confidence in header detection */
  headers: FieldConfidence;

  /** Confidence in data extraction */
  data: FieldConfidence;

  /** Confidence in caption extraction (if present) */
  caption?: FieldConfidence;
}

/**
 * Confidence for a discovered API
 */
export interface ApiConfidence {
  /** API endpoint */
  endpoint: string;

  /** Confidence in endpoint detection */
  endpointConfidence: FieldConfidence;

  /** Confidence in method detection */
  methodConfidence: FieldConfidence;

  /** Confidence in bypass capability */
  bypassConfidence: FieldConfidence;
}

/**
 * Convert numeric score to confidence level
 */
export function scoreToLevel(score: number): ConfidenceLevel {
  if (score >= 0.9) return 'very_high';
  if (score >= 0.7) return 'high';
  if (score >= 0.5) return 'medium';
  if (score >= 0.3) return 'low';
  return 'very_low';
}

/**
 * Create a FieldConfidence object from score and source
 */
export function createFieldConfidence(
  score: number,
  source: ExtractionSource,
  reason?: string
): FieldConfidence {
  return {
    score: Math.max(0, Math.min(1, score)),
    level: scoreToLevel(score),
    source,
    reason,
  };
}

/**
 * Combine multiple confidences into an aggregate score
 * Uses weighted geometric mean to penalize low confidence more heavily
 */
export function aggregateConfidence(
  confidences: FieldConfidence[],
  weights?: number[]
): FieldConfidence {
  if (confidences.length === 0) {
    return createFieldConfidence(0, 'unknown', 'No fields to aggregate');
  }

  const effectiveWeights = weights || confidences.map(() => 1);
  const totalWeight = effectiveWeights.reduce((a, b) => a + b, 0);

  // Guard against division by zero
  if (totalWeight === 0) {
    return createFieldConfidence(0, 'unknown', 'Cannot aggregate with zero total weight');
  }

  // Weighted geometric mean
  const logSum = confidences.reduce((sum, conf, i) => {
    const weight = effectiveWeights[i] / totalWeight;
    // Use small epsilon to avoid log(0)
    return sum + weight * Math.log(Math.max(conf.score, 0.001));
  }, 0);

  const score = Math.exp(logSum);

  // Find the lowest-confidence source as the limiting factor
  const lowestConf = confidences.reduce((min, conf) =>
    conf.score < min.score ? conf : min
  );

  return createFieldConfidence(
    score,
    lowestConf.source,
    `Aggregated from ${confidences.length} fields, limited by ${lowestConf.source}`
  );
}

/**
 * Boost confidence based on validation
 */
export function boostForValidation(
  confidence: FieldConfidence,
  validationPassed: boolean,
  boost: number = 0.1
): FieldConfidence {
  const scoreAdjustment = validationPassed ? boost : -boost;
  const newScore = Math.max(0, Math.min(1, confidence.score + scoreAdjustment));
  const validationReason = validationPassed ? 'validated' : 'validation failed';

  return {
    ...confidence,
    score: newScore,
    level: scoreToLevel(newScore),
    reason: confidence.reason
      ? `${confidence.reason}; ${validationReason}`
      : validationPassed ? 'Validation passed' : 'Validation failed',
  };
}

/**
 * Confidence scores by extraction source
 */
export const SOURCE_CONFIDENCE_SCORES: Record<ExtractionSource, number> = {
  structured_data: 0.95,
  api_response: 0.95,
  graphql: 0.90,
  framework_data: 0.90,
  selector_match: 0.75,
  learned_pattern: 0.70,
  meta_tags: 0.65,
  heuristic: 0.50,
  fallback: 0.30,
  unknown: 0.20,
};

/**
 * Create confidence from extraction source with default score
 */
export function confidenceFromSource(
  source: ExtractionSource,
  reason?: string
): FieldConfidence {
  return createFieldConfidence(
    SOURCE_CONFIDENCE_SCORES[source],
    source,
    reason
  );
}
