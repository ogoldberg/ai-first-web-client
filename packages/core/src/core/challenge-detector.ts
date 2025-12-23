/**
 * Challenge Detector
 *
 * Detects and attempts to solve interactive challenges (CAPTCHAs, bot checks, etc.)
 * on blocked pages. When a challenge page is detected, this module:
 *
 * 1. Identifies interactive elements (checkboxes, buttons, iframes)
 * 2. Determines if they're clickable/solvable
 * 3. Optionally attempts to click them with human-like behavior
 * 4. Reports the result for LLM-assisted follow-up
 *
 * Supported challenge types:
 * - PerimeterX (#px-captcha)
 * - Cloudflare Turnstile
 * - hCaptcha
 * - reCAPTCHA
 * - DataDome
 * - Generic checkbox/button challenges
 */

import type { Page, ElementHandle } from 'playwright';
import type { ChallengeElement, BotDetectionType } from '../types/index.js';
import { HumanActions, BehavioralDelays } from './stealth-browser.js';
import { logger } from '../utils/logger.js';

/**
 * Known challenge selectors by detection type
 */
const CHALLENGE_SELECTORS: Record<BotDetectionType, string[]> = {
  perimeterx: [
    '#px-captcha',
    '#px-captcha-wrapper',
    '[id*="px-captcha"]',
    '[class*="px-captcha"]',
  ],
  cloudflare: [
    '#challenge-form',
    '#challenge-running',
    '.cf-challenge-container',
    'iframe[src*="challenges.cloudflare.com"]',
  ],
  turnstile: [
    'iframe[src*="challenges.cloudflare.com/turnstile"]',
    '[data-turnstile-callback]',
    '.cf-turnstile',
  ],
  datadome: [
    'iframe[src*="datadome"]',
    '#datadome-captcha',
    '[class*="datadome"]',
  ],
  recaptcha: [
    '.g-recaptcha',
    'iframe[src*="google.com/recaptcha"]',
    '#recaptcha',
  ],
  akamai: [
    '#akamai-challenge',
    '[data-akamai-challenge]',
  ],
  unknown: [],
};

/**
 * Generic interactive element selectors for any challenge page
 */
const GENERIC_CHALLENGE_SELECTORS = [
  // Checkboxes
  'input[type="checkbox"]:not([disabled])',
  '[role="checkbox"]:not([disabled])',

  // Buttons that look like challenge buttons
  'button:not([disabled]):not([aria-hidden="true"])',
  'input[type="submit"]:not([disabled])',
  'input[type="button"]:not([disabled])',

  // Specific challenge button patterns
  'button[class*="verify"]',
  'button[class*="challenge"]',
  'button[class*="continue"]',
  'button[class*="submit"]',
  '[class*="challenge"] button',
  '[class*="captcha"] button',

  // Press and hold elements (PerimeterX)
  '[class*="press"]',
  '[class*="hold"]',

  // Iframes that might contain challenges
  'iframe[src*="captcha"]',
  'iframe[src*="challenge"]',
  'iframe[src*="verify"]',
];

/**
 * Text patterns that indicate a clickable challenge element
 */
const CHALLENGE_TEXT_PATTERNS = [
  /verify/i,
  /i.?m not a robot/i,
  /human/i,
  /continue/i,
  /press and hold/i,
  /click to verify/i,
  /check.?box/i,
];

export interface ChallengeDetectionResult {
  /** Whether a challenge was detected */
  detected: boolean;

  /** Type of bot detection system */
  detectionType?: BotDetectionType;

  /** Interactive elements found */
  elements: ChallengeElement[];

  /** Whether we attempted to solve the challenge */
  solveAttempted: boolean;

  /** Result of solve attempt */
  solveResult?: 'success' | 'failed' | 'no_change' | 'requires_human';

  /** Time spent on detection and solving */
  duration: number;
}

export interface ChallengeDetectorOptions {
  /** Attempt to automatically solve simple challenges */
  autoSolve?: boolean;

  /** Maximum time to wait for challenge resolution (ms) */
  solveTimeout?: number;

  /** Type of detection if already known */
  detectionType?: BotDetectionType;
}

/**
 * Detect challenge elements on a page
 */
export async function detectChallengeElements(
  page: Page,
  options: ChallengeDetectorOptions = {}
): Promise<ChallengeDetectionResult> {
  const startTime = Date.now();
  const detectionType = options.detectionType;
  const elements: ChallengeElement[] = [];

  logger.smartBrowser.debug('Detecting challenge elements', { detectionType });

  // Wait a bit for challenge elements to appear (they may load dynamically)
  await BehavioralDelays.sleep(500, 1000);

  // Get selectors to check based on detection type
  const selectorsToCheck = [
    ...(detectionType ? CHALLENGE_SELECTORS[detectionType] : []),
    ...GENERIC_CHALLENGE_SELECTORS,
  ];

  // Try to wait for known challenge element to appear
  if (detectionType && CHALLENGE_SELECTORS[detectionType].length > 0) {
    const primarySelector = CHALLENGE_SELECTORS[detectionType][0];
    try {
      await page.waitForSelector(primarySelector, { timeout: 3000 });
      logger.smartBrowser.debug('Found primary challenge selector', { selector: primarySelector });
    } catch {
      // Element not found, continue with other selectors
      logger.smartBrowser.debug('Primary challenge selector not found', { selector: primarySelector });
    }
  }

  // Find all potential challenge elements
  for (const selector of selectorsToCheck) {
    try {
      const handles = await page.$$(selector);

      for (const handle of handles) {
        const element = await analyzeElement(handle, selector);
        if (element) {
          elements.push(element);
        }
      }
    } catch (e) {
      // Selector might not match - that's fine
    }
  }

  // Also check for elements inside iframes (common for CAPTCHAs)
  try {
    const iframes = await page.$$('iframe');
    logger.smartBrowser.debug('Checking iframes for challenge elements', { iframeCount: iframes.length });

    for (const iframe of iframes) {
      try {
        const frame = await iframe.contentFrame();
        if (!frame) continue;

        // Check for challenge elements inside iframe
        for (const selector of GENERIC_CHALLENGE_SELECTORS.slice(0, 10)) {
          try {
            const handles = await frame.$$(selector);
            for (const handle of handles) {
              const element = await analyzeElement(handle, `iframe >> ${selector}`);
              if (element) {
                // Mark as coming from iframe
                element.type = 'captcha';
                elements.push(element);
              }
            }
          } catch {
            // Ignore errors in iframe element detection
          }
        }
      } catch {
        // Frame may be cross-origin
      }
    }
  } catch (e) {
    logger.smartBrowser.debug('Error checking iframes for challenge elements', {
      error: e instanceof Error ? e.message : 'Unknown error',
    });
  }

  // Deduplicate elements by bounding box
  const uniqueElements = deduplicateElements(elements);

  // Sort by likelihood of being the main challenge element
  uniqueElements.sort((a, b) => {
    // Prefer captcha-specific types
    if (a.type === 'captcha' && b.type !== 'captcha') return -1;
    if (b.type === 'captcha' && a.type !== 'captcha') return 1;

    // Prefer checkboxes (common for human verification)
    if (a.type === 'checkbox' && b.type !== 'checkbox') return -1;
    if (b.type === 'checkbox' && a.type !== 'checkbox') return 1;

    // Prefer elements with challenge-related text
    const aHasChallengeText = CHALLENGE_TEXT_PATTERNS.some(p =>
      p.test(a.text || '')
    );
    const bHasChallengeText = CHALLENGE_TEXT_PATTERNS.some(p =>
      p.test(b.text || '')
    );
    if (aHasChallengeText && !bHasChallengeText) return -1;
    if (bHasChallengeText && !aHasChallengeText) return 1;

    // Prefer larger elements (more prominent)
    const aSize = (a.boundingBox?.width || 0) * (a.boundingBox?.height || 0);
    const bSize = (b.boundingBox?.width || 0) * (b.boundingBox?.height || 0);
    return bSize - aSize;
  });

  const detected = uniqueElements.length > 0;
  let solveAttempted = false;
  let solveResult: ChallengeDetectionResult['solveResult'];

  // Attempt to solve if requested
  if (detected && options.autoSolve) {
    const result = await attemptSolve(page, uniqueElements, options);
    solveAttempted = result.attempted;
    solveResult = result.result;

    // Update elements with click results
    for (const el of uniqueElements) {
      const updatedEl = result.elementResults.find(
        r => r.selector === el.selector
      );
      if (updatedEl) {
        el.clickAttempted = updatedEl.clickAttempted;
        el.clickResult = updatedEl.clickResult;
      }
    }
  }

  const duration = Date.now() - startTime;

  logger.smartBrowser.debug('Challenge detection complete', {
    detected,
    elementCount: uniqueElements.length,
    solveAttempted,
    solveResult,
    duration,
  });

  return {
    detected,
    detectionType,
    elements: uniqueElements,
    solveAttempted,
    solveResult,
    duration,
  };
}

/**
 * Analyze an element to determine if it's a challenge element
 */
async function analyzeElement(
  handle: ElementHandle,
  selector: string
): Promise<ChallengeElement | null> {
  try {
    const boundingBox = await handle.boundingBox();

    // Skip hidden elements
    if (!boundingBox || boundingBox.width === 0 || boundingBox.height === 0) {
      return null;
    }

    // Get element info
    const elementInfo = await handle.evaluate((el: Element) => {
      const htmlEl = el as HTMLElement;
      const inputEl = el as HTMLInputElement;
      const tagName = el.tagName.toLowerCase();
      const type = inputEl.type?.toLowerCase() || '';
      const text = el.textContent?.trim().substring(0, 100) || '';
      const className = typeof htmlEl.className === 'string' ? htmlEl.className : '';
      const id = htmlEl.id || '';
      const role = el.getAttribute('role');
      const isVisible = htmlEl.offsetParent !== null;

      return { tagName, type, text, className, id, role, isVisible };
    });

    if (!elementInfo.isVisible) {
      return null;
    }

    // Determine element type
    let elementType: ChallengeElement['type'] = 'unknown';

    if (elementInfo.tagName === 'iframe') {
      elementType = 'captcha';
    } else if (
      elementInfo.tagName === 'input' &&
      elementInfo.type === 'checkbox'
    ) {
      elementType = 'checkbox';
    } else if (
      elementInfo.role === 'checkbox' ||
      selector.includes('checkbox')
    ) {
      elementType = 'checkbox';
    } else if (
      elementInfo.tagName === 'button' ||
      (elementInfo.tagName === 'input' &&
        ['button', 'submit'].includes(elementInfo.type))
    ) {
      elementType = 'button';
    } else if (
      selector.includes('captcha') ||
      elementInfo.className.includes('captcha') ||
      elementInfo.id.includes('captcha')
    ) {
      elementType = 'captcha';
    }

    // Determine if clickable
    const clickable =
      elementType === 'checkbox' ||
      elementType === 'button' ||
      (elementType === 'captcha' && elementInfo.tagName !== 'iframe');

    return {
      type: elementType,
      selector,
      text: elementInfo.text,
      boundingBox: {
        x: boundingBox.x,
        y: boundingBox.y,
        width: boundingBox.width,
        height: boundingBox.height,
      },
      clickable,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Remove duplicate elements based on overlapping bounding boxes
 */
function deduplicateElements(elements: ChallengeElement[]): ChallengeElement[] {
  const unique: ChallengeElement[] = [];

  for (const el of elements) {
    if (!el.boundingBox) {
      unique.push(el);
      continue;
    }

    const elBox = el.boundingBox; // Type narrowed above
    const isDuplicate = unique.some((existing) => {
      if (!existing.boundingBox || !elBox) return false;

      // Check if bounding boxes overlap significantly
      const overlap = getOverlapArea(elBox, existing.boundingBox);
      const elArea = elBox.width * elBox.height;
      const existingArea =
        existing.boundingBox.width * existing.boundingBox.height;
      const minArea = Math.min(elArea, existingArea);

      return overlap > minArea * 0.5;
    });

    if (!isDuplicate) {
      unique.push(el);
    }
  }

  return unique;
}

/**
 * Calculate overlap area between two bounding boxes
 */
function getOverlapArea(
  a: NonNullable<ChallengeElement['boundingBox']>,
  b: NonNullable<ChallengeElement['boundingBox']>
): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  if (x2 <= x1 || y2 <= y1) return 0;
  return (x2 - x1) * (y2 - y1);
}

/**
 * Attempt to solve the challenge by clicking elements
 */
async function attemptSolve(
  page: Page,
  elements: ChallengeElement[],
  options: ChallengeDetectorOptions
): Promise<{
  attempted: boolean;
  result?: ChallengeDetectionResult['solveResult'];
  elementResults: Array<{
    selector: string;
    clickAttempted: boolean;
    clickResult?: ChallengeElement['clickResult'];
  }>;
}> {
  const elementResults: Array<{
    selector: string;
    clickAttempted: boolean;
    clickResult?: ChallengeElement['clickResult'];
  }> = [];

  // Get clickable elements
  const clickableElements = elements.filter((el) => el.clickable);

  if (clickableElements.length === 0) {
    logger.smartBrowser.debug('No clickable challenge elements found');
    return {
      attempted: false,
      result: 'requires_human',
      elementResults,
    };
  }

  const timeout = options.solveTimeout || 10000;

  // Try clicking the most promising element first
  for (const el of clickableElements.slice(0, 3)) {
    if (!el.boundingBox) continue;

    logger.smartBrowser.debug('Attempting to click challenge element', {
      type: el.type,
      selector: el.selector,
      text: el.text?.substring(0, 30),
    });

    try {
      // Get current page content for comparison
      const beforeContent = await page.content();
      const beforeUrl = page.url();

      // Add a small delay before clicking (more human-like)
      await BehavioralDelays.sleep(500, 1500);

      // Click with human-like movement
      const centerX = el.boundingBox.x + el.boundingBox.width / 2;
      const centerY = el.boundingBox.y + el.boundingBox.height / 2;

      // Get current mouse position (approximate)
      const viewport = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));
      const currentPos = {
        x: Math.random() * viewport.width,
        y: Math.random() * viewport.height,
      };

      await HumanActions.clickLikeHuman(page, centerX, centerY, currentPos);

      // Wait for potential page change
      await BehavioralDelays.sleep(1000, 2000);

      // Check if page changed
      const afterUrl = page.url();
      const afterContent = await page.content();

      let clickResult: ChallengeElement['clickResult'];

      if (afterUrl !== beforeUrl) {
        clickResult = 'page_changed';
        logger.smartBrowser.debug('Challenge click caused page navigation', {
          from: beforeUrl,
          to: afterUrl,
        });
      } else if (afterContent !== beforeContent) {
        // Check if challenge is still present
        const stillBlocked = await isChallengeStillPresent(page, options.detectionType);
        if (stillBlocked) {
          clickResult = 'no_change';
        } else {
          clickResult = 'success';
          logger.smartBrowser.info('Challenge appears to be solved');
        }
      } else {
        clickResult = 'no_change';
      }

      elementResults.push({
        selector: el.selector,
        clickAttempted: true,
        clickResult,
      });

      // If successful, we're done
      if (clickResult === 'success' || clickResult === 'page_changed') {
        return {
          attempted: true,
          result: clickResult === 'success' ? 'success' : 'no_change',
          elementResults,
        };
      }
    } catch (error) {
      logger.smartBrowser.debug('Failed to click challenge element', {
        selector: el.selector,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      elementResults.push({
        selector: el.selector,
        clickAttempted: true,
        clickResult: 'failed',
      });
    }
  }

  return {
    attempted: true,
    result: 'failed',
    elementResults,
  };
}

/**
 * Check if a challenge is still present on the page
 */
async function isChallengeStillPresent(
  page: Page,
  detectionType?: BotDetectionType
): Promise<boolean> {
  // Check title for challenge indicators
  const title = await page.title();
  const titleIndicators = [
    'robot',
    'verify',
    'blocked',
    'challenge',
    'captcha',
    'access denied',
  ];

  if (titleIndicators.some((ind) => title.toLowerCase().includes(ind))) {
    return true;
  }

  // Check for challenge-specific selectors
  const selectors = [
    ...(detectionType ? CHALLENGE_SELECTORS[detectionType] : []),
    '#px-captcha',
    '.cf-challenge-container',
    '.g-recaptcha',
    '[class*="captcha"]',
  ];

  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        const box = await element.boundingBox();
        if (box && box.width > 0 && box.height > 0) {
          return true;
        }
      }
    } catch {
      // Selector didn't match
    }
  }

  return false;
}

/**
 * Wait for challenge to potentially resolve (after user interaction or timeout)
 */
export async function waitForChallengeResolution(
  page: Page,
  timeout: number = 30000
): Promise<{ resolved: boolean; newUrl?: string }> {
  const startUrl = page.url();
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    await BehavioralDelays.sleep(1000, 1000);

    // Check if URL changed (navigation after challenge)
    const currentUrl = page.url();
    if (currentUrl !== startUrl) {
      return { resolved: true, newUrl: currentUrl };
    }

    // Check if challenge is gone
    const stillPresent = await isChallengeStillPresent(page);
    if (!stillPresent) {
      return { resolved: true };
    }
  }

  return { resolved: false };
}
