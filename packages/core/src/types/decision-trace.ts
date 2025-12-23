/**
 * Decision Trace Types (CX-003)
 *
 * Provides detailed tracing of decisions made during browse operations.
 * Enables LLM clients to understand:
 * - Which rendering tiers were attempted and why each succeeded/failed
 * - Which selectors were tried for content extraction
 * - What validators ran and their outcomes
 * - What fallbacks were used and why
 */

import type { RenderTier } from './index.js';

/**
 * Content selector source categories
 */
export type SelectorSource = 'main' | 'article' | 'role_main' | 'content_class' | 'body_fallback';

/**
 * Title extraction source categories
 */
export type TitleSource = 'og_title' | 'title_tag' | 'h1' | 'unknown';

/**
 * Validation details for a tier attempt
 */
export interface TierValidationDetails {
  /** Length of extracted content text */
  contentLength: number;

  /** Whether semantic HTML markers were found (main, article, h1, etc.) */
  hasSemanticMarkers: boolean;

  /** Incomplete content markers detected (loading..., please wait, etc.) */
  incompleteMarkers?: string[];
}

/**
 * Individual tier attempt in the rendering cascade
 */
export interface TierAttempt {
  /** Which rendering tier was attempted */
  tier: RenderTier;

  /** Whether this tier succeeded */
  success: boolean;

  /** Time spent on this tier attempt in milliseconds */
  durationMs: number;

  /** Reason for failure (if success is false) */
  failureReason?: string;

  /** Detailed validation results */
  validationDetails?: TierValidationDetails;

  /** Extraction strategy used (for intelligence tier) */
  extractionStrategy?: string;
}

/**
 * Individual selector attempt during content extraction
 */
export interface SelectorAttempt {
  /** CSS selector that was tried */
  selector: string;

  /** Category of the selector */
  source: SelectorSource;

  /** Whether the selector matched any elements */
  matched: boolean;

  /** Length of content found (0 if no match) */
  contentLength: number;

  /** Base confidence score for this selector */
  confidenceScore: number;

  /** Whether this selector was chosen as the final result */
  selected: boolean;

  /** Reason for skipping (if not selected) */
  skipReason?: string;
}

/**
 * Individual title extraction attempt
 */
export interface TitleAttempt {
  /** Source of title extraction */
  source: TitleSource;

  /** Selector or meta tag used */
  selector: string;

  /** Whether a title was found at this source */
  found: boolean;

  /** The title value if found */
  value?: string;

  /** Confidence score for this source */
  confidenceScore: number;

  /** Whether this source was chosen as the final title */
  selected: boolean;
}

/**
 * Summary of the decision trace
 */
export interface DecisionTraceSummary {
  /** Total number of rendering tiers attempted */
  tiersAttempted: number;

  /** Number of tiers that failed before success */
  tiersFailed: number;

  /** Total number of content selectors attempted */
  selectorsAttempted: number;

  /** Whether body fallback was used for content */
  fallbackUsed: boolean;

  /** Which tier ultimately succeeded */
  finalTier: RenderTier;

  /** Which selector was used for content */
  finalSelector: string;

  /** Which source was used for title */
  finalTitleSource: TitleSource;
}

/**
 * Full decision trace for a browse operation
 */
export interface DecisionTrace {
  /** All rendering tier attempts in order */
  tiers: TierAttempt[];

  /** All content selector attempts in order */
  selectors: SelectorAttempt[];

  /** All title extraction attempts in order */
  title: TitleAttempt[];

  /** Summary statistics */
  summary: DecisionTraceSummary;
}

/**
 * Create an empty decision trace
 */
export function createEmptyTrace(): DecisionTrace {
  return {
    tiers: [],
    selectors: [],
    title: [],
    summary: {
      tiersAttempted: 0,
      tiersFailed: 0,
      selectorsAttempted: 0,
      fallbackUsed: false,
      finalTier: 'playwright',
      finalSelector: 'body',
      finalTitleSource: 'unknown',
    },
  };
}

/**
 * Create a tier attempt record
 */
export function createTierAttempt(
  tier: RenderTier,
  success: boolean,
  durationMs: number,
  options?: {
    failureReason?: string;
    validationDetails?: TierValidationDetails;
    extractionStrategy?: string;
  }
): TierAttempt {
  return {
    tier,
    success,
    durationMs,
    ...options,
  };
}

/**
 * Create a selector attempt record
 */
export function createSelectorAttempt(
  selector: string,
  source: SelectorSource,
  matched: boolean,
  contentLength: number,
  confidenceScore: number,
  selected: boolean,
  skipReason?: string
): SelectorAttempt {
  return {
    selector,
    source,
    matched,
    contentLength,
    confidenceScore,
    selected,
    skipReason,
  };
}

/**
 * Create a title attempt record
 */
export function createTitleAttempt(
  source: TitleSource,
  selector: string,
  found: boolean,
  confidenceScore: number,
  selected: boolean,
  value?: string
): TitleAttempt {
  return {
    source,
    selector,
    found,
    confidenceScore,
    selected,
    value,
  };
}

/**
 * Compute summary from trace data
 */
export function computeTraceSummary(
  tiers: TierAttempt[],
  selectors: SelectorAttempt[],
  titleAttempts: TitleAttempt[]
): DecisionTraceSummary {
  const successfulTier = tiers.find(t => t.success);
  const selectedSelector = selectors.find(s => s.selected);
  const selectedTitle = titleAttempts.find(t => t.selected);

  return {
    tiersAttempted: tiers.length,
    tiersFailed: tiers.filter(t => !t.success).length,
    selectorsAttempted: selectors.length,
    fallbackUsed: selectedSelector?.source === 'body_fallback',
    finalTier: successfulTier?.tier ?? 'playwright',
    finalSelector: selectedSelector?.selector ?? 'body',
    finalTitleSource: selectedTitle?.source ?? 'unknown',
  };
}

/**
 * Build a complete decision trace from component data
 */
export function buildDecisionTrace(
  tiers: TierAttempt[],
  selectors: SelectorAttempt[],
  titleAttempts: TitleAttempt[]
): DecisionTrace {
  return {
    tiers,
    selectors,
    title: titleAttempts,
    summary: computeTraceSummary(tiers, selectors, titleAttempts),
  };
}
