/**
 * Progress Event Types for SmartBrowser.browse()
 *
 * Provides real-time progress updates during browse operations.
 * Useful for long-running operations like multi-page scraping,
 * skill execution, and tiered fetching.
 */

/**
 * Progress stages during a browse operation
 */
export type BrowseProgressStage =
  | 'initializing'        // Setting up, validating URL
  | 'skill_matching'      // Finding applicable skills
  | 'tiered_fetching'     // Trying lightweight rendering tiers
  | 'page_loading'        // Loading page with browser
  | 'waiting'             // Waiting for selector/content
  | 'skill_executing'     // Executing matched skill
  | 'content_extracting'  // Extracting content from page
  | 'validating'          // Validating extracted content
  | 'pagination'          // Following pagination
  | 'complete';           // Operation finished

/**
 * Progress event emitted during browse operations
 */
export interface BrowseProgressEvent {
  /** Current stage of the operation */
  stage: BrowseProgressStage;

  /** Human-readable description of current activity */
  message: string;

  /** Progress percentage (0-100) if determinable, undefined otherwise */
  percent?: number;

  /** Current URL being processed */
  url: string;

  /** Elapsed time in milliseconds since operation started */
  elapsedMs: number;

  /** Optional additional details */
  details?: {
    /** Which tier is being tried during tiered_fetching */
    tier?: string;
    /** Number of tiers attempted */
    tiersAttempted?: number;
    /** Which skill is being applied */
    skillName?: string;
    /** Current page number during pagination */
    currentPage?: number;
    /** Total pages to fetch (if known) */
    totalPages?: number;
    /** Selector being waited for */
    waitingFor?: string;
    /** Retry attempt number */
    retryAttempt?: number;
  };
}

/**
 * Callback function for receiving progress events
 */
export type OnProgressCallback = (event: BrowseProgressEvent) => void;

/**
 * Helper to create progress events with consistent structure
 */
export function createProgressEvent(
  stage: BrowseProgressStage,
  message: string,
  url: string,
  startTime: number,
  details?: BrowseProgressEvent['details'],
  percent?: number
): BrowseProgressEvent {
  return {
    stage,
    message,
    url,
    elapsedMs: Date.now() - startTime,
    ...(percent !== undefined && { percent }),
    ...(details && { details }),
  };
}

/**
 * Estimate progress percentage based on stage
 * These are approximate values to give users a sense of progress
 */
export function estimateProgressPercent(stage: BrowseProgressStage): number {
  switch (stage) {
    case 'initializing':
      return 5;
    case 'skill_matching':
      return 10;
    case 'tiered_fetching':
      return 20;
    case 'page_loading':
      return 40;
    case 'waiting':
      return 50;
    case 'skill_executing':
      return 60;
    case 'content_extracting':
      return 75;
    case 'validating':
      return 90;
    case 'pagination':
      return 95;
    case 'complete':
      return 100;
    default:
      return 0;
  }
}
