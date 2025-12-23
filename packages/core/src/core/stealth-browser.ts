/**
 * Stealth Browser - Anti-bot evasion for Playwright
 *
 * Wraps playwright-extra with the stealth plugin to bypass common bot detection.
 * This module is OPTIONAL - falls back to regular Playwright if stealth deps aren't installed.
 *
 * The stealth plugin handles:
 * - navigator.webdriver removal
 * - chrome.runtime patching
 * - WebGL vendor/renderer spoofing
 * - Plugin array spoofing
 * - User agent consistency fixes
 * - Permission API overrides
 * - iframe.contentWindow fixes
 *
 * Install optional dependencies:
 *   npm install playwright-extra puppeteer-extra-plugin-stealth
 */

import type { Browser, BrowserContext, LaunchOptions } from 'playwright';
import { createRequire } from 'module';
import { logger } from '../utils/logger.js';

const require = createRequire(import.meta.url);

// Stealth availability tracking
let stealthLoadAttempted = false;
let stealthAvailable = false;
let stealthLoadError: string | null = null;

// Lazy-loaded stealth modules
let chromiumExtra: any = null;
let stealthPlugin: any = null;

/**
 * Browser fingerprint profile for consistent identity
 */
export interface BrowserFingerprint {
  userAgent: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  locale: string;
  timezoneId: string;
  platform: string;
  // Client hints for modern browsers
  clientHints?: {
    brands: Array<{ brand: string; version: string }>;
    mobile: boolean;
    platform: string;
    platformVersion: string;
  };
}

/**
 * Common Chrome user agents with matching platforms
 */
const USER_AGENT_POOL: Array<{ userAgent: string; platform: string; brands: Array<{ brand: string; version: string }> }> = [
  {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    platform: 'macOS',
    brands: [
      { brand: 'Not_A Brand', version: '8' },
      { brand: 'Chromium', version: '120' },
      { brand: 'Google Chrome', version: '120' },
    ],
  },
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    platform: 'Windows',
    brands: [
      { brand: 'Not_A Brand', version: '8' },
      { brand: 'Chromium', version: '120' },
      { brand: 'Google Chrome', version: '120' },
    ],
  },
  {
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    platform: 'Linux',
    brands: [
      { brand: 'Not_A Brand', version: '8' },
      { brand: 'Chromium', version: '120' },
      { brand: 'Google Chrome', version: '120' },
    ],
  },
  {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    platform: 'macOS',
    brands: [
      { brand: 'Not_A Brand', version: '8' },
      { brand: 'Chromium', version: '121' },
      { brand: 'Google Chrome', version: '121' },
    ],
  },
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    platform: 'Windows',
    brands: [
      { brand: 'Not_A Brand', version: '8' },
      { brand: 'Chromium', version: '121' },
      { brand: 'Google Chrome', version: '121' },
    ],
  },
];

/**
 * Common viewport sizes from real browser usage
 */
const VIEWPORT_POOL = [
  { width: 1920, height: 1080 }, // Full HD - most common
  { width: 1366, height: 768 },  // Laptops
  { width: 1536, height: 864 },  // Scaled laptops
  { width: 1440, height: 900 },  // MacBook Pro
  { width: 1680, height: 1050 }, // Larger displays
  { width: 2560, height: 1440 }, // 2K displays
];

/**
 * Device scale factors
 */
const SCALE_FACTORS = [1, 1.25, 1.5, 2];

/**
 * Timezone/locale combinations that make sense together
 */
const LOCALE_TIMEZONE_PAIRS = [
  { locale: 'en-US', timezoneId: 'America/New_York' },
  { locale: 'en-US', timezoneId: 'America/Los_Angeles' },
  { locale: 'en-US', timezoneId: 'America/Chicago' },
  { locale: 'en-GB', timezoneId: 'Europe/London' },
  { locale: 'de-DE', timezoneId: 'Europe/Berlin' },
  { locale: 'fr-FR', timezoneId: 'Europe/Paris' },
  { locale: 'ja-JP', timezoneId: 'Asia/Tokyo' },
];

/**
 * Generate a random but consistent browser fingerprint
 * @param seed Optional seed for deterministic fingerprint (e.g., domain name)
 */
export function generateFingerprint(seed?: string): BrowserFingerprint {
  // Simple hash function for seed-based randomness
  const hash = (str: string): number => {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  };

  // Seeded random function
  const seededRandom = (max: number, offset = 0): number => {
    if (seed) {
      return (hash(seed + offset.toString()) % max);
    }
    return Math.floor(Math.random() * max);
  };

  const uaEntry = USER_AGENT_POOL[seededRandom(USER_AGENT_POOL.length, 0)];
  const viewport = VIEWPORT_POOL[seededRandom(VIEWPORT_POOL.length, 1)];
  const scaleFactor = SCALE_FACTORS[seededRandom(SCALE_FACTORS.length, 2)];
  const localeTz = LOCALE_TIMEZONE_PAIRS[seededRandom(LOCALE_TIMEZONE_PAIRS.length, 3)];

  return {
    userAgent: uaEntry.userAgent,
    viewport,
    deviceScaleFactor: scaleFactor,
    locale: localeTz.locale,
    timezoneId: localeTz.timezoneId,
    platform: uaEntry.platform,
    clientHints: {
      brands: uaEntry.brands,
      mobile: false,
      platform: uaEntry.platform,
      platformVersion: uaEntry.platform === 'Windows' ? '10.0.0' : '10.15.7',
    },
  };
}

/**
 * Try to load stealth modules dynamically
 */
async function tryLoadStealth(): Promise<boolean> {
  if (stealthLoadAttempted) {
    return stealthAvailable;
  }

  stealthLoadAttempted = true;

  try {
    // Try to load playwright-extra (optional dependency)
    // @ts-ignore - optional dependency, may not be installed
    const playwrightExtra = await import('playwright-extra');
    chromiumExtra = playwrightExtra.chromium;

    // Try to load stealth plugin (optional dependency)
    // @ts-ignore - optional dependency, may not be installed
    const stealthModule = await import('puppeteer-extra-plugin-stealth');
    stealthPlugin = stealthModule.default;

    // Apply stealth plugin
    chromiumExtra.use(stealthPlugin());

    stealthAvailable = true;
    logger.browser.info('Stealth mode available', {
      playwrightExtra: true,
      stealthPlugin: true,
    });

    return true;
  } catch (error) {
    stealthLoadError = error instanceof Error ? error.message : 'Failed to load stealth modules';
    logger.browser.debug('Stealth mode not available', { error: stealthLoadError });
    logger.browser.debug('To enable stealth mode: npm install playwright-extra puppeteer-extra-plugin-stealth');
    return false;
  }
}

/**
 * Check if stealth mode is available
 */
export function isStealthAvailable(): boolean {
  if (!stealthLoadAttempted) {
    // Quick check without loading
    try {
      require.resolve('playwright-extra');
      require.resolve('puppeteer-extra-plugin-stealth');
      return true;
    } catch {
      return false;
    }
  }
  return stealthAvailable;
}

/**
 * Get the stealth load error if any
 */
export function getStealthError(): string | null {
  return stealthLoadError;
}

/**
 * Stealth browser configuration
 */
export interface StealthBrowserConfig {
  /** Enable stealth mode (default: true if deps available) */
  stealth?: boolean | 'auto';
  /** Custom fingerprint to use */
  fingerprint?: BrowserFingerprint;
  /** Generate fingerprint from seed (e.g., domain name for consistency) */
  fingerprintSeed?: string;
  /** Standard Playwright launch options */
  launchOptions?: LaunchOptions;
}

/**
 * Launch a browser with stealth mode if available
 */
export async function launchStealthBrowser(config: StealthBrowserConfig = {}): Promise<{
  browser: Browser;
  fingerprint: BrowserFingerprint;
  stealthEnabled: boolean;
}> {
  const stealthMode = config.stealth ?? 'auto';
  const fingerprint = config.fingerprint ?? generateFingerprint(config.fingerprintSeed);

  // Determine if we should use stealth
  let usesStealth = false;
  if (stealthMode === true || stealthMode === 'auto') {
    usesStealth = await tryLoadStealth();
    if (stealthMode === true && !usesStealth) {
      throw new Error(
        'Stealth mode requested but not available. ' +
        'Install: npm install playwright-extra puppeteer-extra-plugin-stealth'
      );
    }
  }

  const launchOptions: LaunchOptions = {
    headless: true,
    ...config.launchOptions,
  };

  let browser: Browser;

  if (usesStealth && chromiumExtra) {
    logger.browser.info('Launching browser with stealth mode', {
      fingerprint: {
        platform: fingerprint.platform,
        viewport: fingerprint.viewport,
        locale: fingerprint.locale,
      },
    });

    browser = await chromiumExtra.launch(launchOptions);
  } else {
    // Fall back to regular Playwright
    const pw = await import('playwright');
    browser = await pw.chromium.launch(launchOptions);
  }

  return {
    browser,
    fingerprint,
    stealthEnabled: usesStealth,
  };
}

/**
 * Context initialization scripts for additional evasion
 * These run before any page scripts and patch detectable properties
 */
export const EVASION_SCRIPTS = {
  /**
   * Remove navigator.webdriver property
   */
  removeWebdriver: `
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  `,

  /**
   * Patch navigator.permissions.query to hide automation
   */
  patchPermissions: `
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => {
      if (parameters.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission });
      }
      return originalQuery(parameters);
    };
  `,

  /**
   * Spoof plugins array to look like real browser
   */
  spoofPlugins: `
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const plugins = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
        ];
        plugins.item = (index) => plugins[index] || null;
        plugins.namedItem = (name) => plugins.find(p => p.name === name) || null;
        plugins.refresh = () => {};
        return plugins;
      },
    });
  `,

  /**
   * Spoof mimeTypes to match plugins
   */
  spoofMimeTypes: `
    Object.defineProperty(navigator, 'mimeTypes', {
      get: () => {
        const mimeTypes = [
          { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
          { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' },
        ];
        mimeTypes.item = (index) => mimeTypes[index] || null;
        mimeTypes.namedItem = (name) => mimeTypes.find(m => m.type === name) || null;
        return mimeTypes;
      },
    });
  `,

  /**
   * Fix chrome.runtime to exist but be empty (expected on real Chrome)
   */
  fixChromeRuntime: `
    if (!window.chrome) {
      window.chrome = {};
    }
    if (!window.chrome.runtime) {
      window.chrome.runtime = {};
    }
  `,

  /**
   * Patch languages to be consistent
   */
  patchLanguages: (locale: string) => `
    Object.defineProperty(navigator, 'languages', {
      get: () => ['${locale}', '${locale.split('-')[0]}'],
    });
    Object.defineProperty(navigator, 'language', {
      get: () => '${locale}',
    });
  `,
};

/**
 * Get all evasion scripts combined for a fingerprint
 */
export function getEvasionScripts(fingerprint: BrowserFingerprint): string {
  return [
    EVASION_SCRIPTS.removeWebdriver,
    EVASION_SCRIPTS.patchPermissions,
    EVASION_SCRIPTS.spoofPlugins,
    EVASION_SCRIPTS.spoofMimeTypes,
    EVASION_SCRIPTS.fixChromeRuntime,
    EVASION_SCRIPTS.patchLanguages(fingerprint.locale),
  ].join('\n');
}

/**
 * Create a stealth browser context with all evasion measures
 */
export async function createStealthContext(
  browser: Browser,
  fingerprint: BrowserFingerprint,
  options: {
    /** Apply evasion scripts (default: true) */
    applyEvasionScripts?: boolean;
  } = {}
): Promise<BrowserContext> {
  const applyEvasion = options.applyEvasionScripts ?? true;

  const context = await browser.newContext({
    userAgent: fingerprint.userAgent,
    viewport: fingerprint.viewport,
    deviceScaleFactor: fingerprint.deviceScaleFactor,
    locale: fingerprint.locale,
    timezoneId: fingerprint.timezoneId,
  });

  if (applyEvasion) {
    // Add initialization script that runs before every page
    await context.addInitScript(getEvasionScripts(fingerprint));
  }

  return context;
}

/**
 * Get Accept-Language header for a fingerprint
 */
export function getAcceptLanguage(fingerprint: BrowserFingerprint): string {
  const lang = fingerprint.locale;
  const baseLang = lang.split('-')[0];

  if (lang === baseLang) {
    return `${lang},en;q=0.9`;
  }

  return `${lang},${baseLang};q=0.9,en;q=0.8`;
}

/**
 * Get headers that should match the fingerprint
 */
export function getFingerprintHeaders(fingerprint: BrowserFingerprint): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept-Language': getAcceptLanguage(fingerprint),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Upgrade-Insecure-Requests': '1',
  };

  // Add client hints if available
  if (fingerprint.clientHints) {
    const brands = fingerprint.clientHints.brands
      .map(b => `"${b.brand}";v="${b.version}"`)
      .join(', ');

    headers['sec-ch-ua'] = brands;
    headers['sec-ch-ua-mobile'] = fingerprint.clientHints.mobile ? '?1' : '?0';
    headers['sec-ch-ua-platform'] = `"${fingerprint.clientHints.platform}"`;
  }

  return headers;
}

/**
 * Get HTTP fetch headers for stealth requests
 * This applies to ContentIntelligence and LightweightRenderer (non-Playwright tiers)
 */
export function getStealthFetchHeaders(options: {
  fingerprint?: BrowserFingerprint;
  fingerprintSeed?: string;
  /** Merge with additional headers */
  extraHeaders?: Record<string, string>;
} = {}): Record<string, string> {
  const fingerprint = options.fingerprint ?? generateFingerprint(options.fingerprintSeed);

  return {
    'User-Agent': fingerprint.userAgent,
    ...getFingerprintHeaders(fingerprint),
    ...options.extraHeaders,
  };
}

/**
 * Behavioral delay utilities for human-like timing
 */
export const BehavioralDelays = {
  /**
   * Random delay between actions (simulates human reaction time)
   * @param min Minimum delay in ms (default: 100)
   * @param max Maximum delay in ms (default: 500)
   */
  randomDelay(min = 100, max = 500): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  /**
   * Sleep for a random duration
   */
  async sleep(min = 100, max = 500): Promise<void> {
    const delay = this.randomDelay(min, max);
    await new Promise(resolve => setTimeout(resolve, delay));
  },

  /**
   * Get a jittered delay (for rate limiting backoff)
   * Adds randomness to avoid synchronized retries
   */
  jitteredDelay(baseDelay: number, jitterFactor = 0.3): number {
    const jitter = baseDelay * jitterFactor * (Math.random() * 2 - 1);
    return Math.max(0, Math.floor(baseDelay + jitter));
  },

  /**
   * Exponential backoff with jitter
   */
  exponentialBackoff(attempt: number, baseDelay = 1000, maxDelay = 30000): number {
    const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    return this.jitteredDelay(exponentialDelay);
  },
};

/**
 * Human-like mouse movement simulation
 * Uses Bezier curves to simulate natural hand movements
 */
export const HumanMouseMovement = {
  /**
   * Generate a random point within the viewport
   */
  randomPoint(width: number, height: number): { x: number; y: number } {
    return {
      x: Math.floor(Math.random() * width),
      y: Math.floor(Math.random() * height),
    };
  },

  /**
   * Generate control points for a Bezier curve (human-like path)
   * Humans don't move in straight lines - they curve slightly
   */
  generateBezierPath(
    start: { x: number; y: number },
    end: { x: number; y: number },
    steps = 20
  ): Array<{ x: number; y: number }> {
    // Generate two control points with some randomness
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const distance = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
    const deviation = distance * 0.2; // Max 20% deviation from straight line

    const cp1 = {
      x: midX + (Math.random() - 0.5) * deviation,
      y: midY + (Math.random() - 0.5) * deviation,
    };
    const cp2 = {
      x: midX + (Math.random() - 0.5) * deviation,
      y: midY + (Math.random() - 0.5) * deviation,
    };

    // Generate points along the Bezier curve
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const mt = 1 - t;
      const mt2 = mt * mt;
      const mt3 = mt2 * mt;

      points.push({
        x: Math.round(mt3 * start.x + 3 * mt2 * t * cp1.x + 3 * mt * t2 * cp2.x + t3 * end.x),
        y: Math.round(mt3 * start.y + 3 * mt2 * t * cp1.y + 3 * mt * t2 * cp2.y + t3 * end.y),
      });
    }

    return points;
  },

  /**
   * Calculate realistic movement duration based on distance
   * Uses Fitts's Law approximation
   */
  calculateDuration(distance: number, targetSize = 50): number {
    const baseDuration = 200; // Minimum movement time in ms
    const a = 50; // Time to start moving
    const b = 150; // Movement coefficient

    // Fitts's Law: MT = a + b * log2(D/W + 1)
    const mt = a + b * Math.log2(distance / targetSize + 1);
    return Math.max(baseDuration, Math.round(mt));
  },

  /**
   * Generate random "looking around" movements
   * Humans often move mouse while reading/thinking
   */
  generateIdleMovements(
    viewport: { width: number; height: number },
    currentPos: { x: number; y: number },
    count = 3
  ): Array<{ x: number; y: number }> {
    const movements: Array<{ x: number; y: number }> = [];
    let pos = currentPos;

    for (let i = 0; i < count; i++) {
      // Small random movements (10-100px)
      const deltaX = (Math.random() - 0.5) * 100 + (Math.random() > 0.5 ? 10 : -10);
      const deltaY = (Math.random() - 0.5) * 100 + (Math.random() > 0.5 ? 10 : -10);

      const newPos = {
        x: Math.max(0, Math.min(viewport.width - 1, pos.x + deltaX)),
        y: Math.max(0, Math.min(viewport.height - 1, pos.y + deltaY)),
      };

      movements.push(newPos);
      pos = newPos;
    }

    return movements;
  },
};

/**
 * Stealth configuration that applies to all tiers
 */
export interface StealthConfig {
  /** Enable stealth mode (default: true) */
  enabled: boolean;
  /** Fingerprint to use (or generate from seed) */
  fingerprint?: BrowserFingerprint;
  /** Seed for consistent fingerprint generation (e.g., domain name) */
  fingerprintSeed?: string;
  /** Apply behavioral delays */
  behavioralDelays: boolean;
  /** Minimum delay between requests in ms */
  minDelay: number;
  /** Maximum delay between requests in ms */
  maxDelay: number;
}

export const DEFAULT_STEALTH_CONFIG: StealthConfig = {
  enabled: true,
  behavioralDelays: true,
  minDelay: 100,
  maxDelay: 500,
};

/**
 * Get stealth configuration from environment or defaults
 */
export function getStealthConfig(overrides?: Partial<StealthConfig>): StealthConfig {
  const envStealth = process.env.LLM_BROWSER_STEALTH;
  const enabled = envStealth ? envStealth !== 'false' && envStealth !== '0' : true;

  return {
    ...DEFAULT_STEALTH_CONFIG,
    enabled,
    ...overrides,
  };
}

/**
 * Human-like typing simulation
 * Varies typing speed to mimic natural human typing patterns
 */
export const HumanTyping = {
  /**
   * Calculate delay for next keystroke
   * Humans type faster for common letters, slower at word boundaries
   */
  getKeystrokeDelay(char: string, prevChar: string | null): number {
    // Base delay range (words per minute ~40-80)
    const baseMin = 50;
    const baseMax = 150;

    let delay = BehavioralDelays.randomDelay(baseMin, baseMax);

    // Slower at word boundaries (space, punctuation)
    if (char === ' ' || /[.,!?;:]/.test(char)) {
      delay += BehavioralDelays.randomDelay(50, 150);
    }

    // Slower after capitals (reaching for shift)
    if (/[A-Z]/.test(char)) {
      delay += BehavioralDelays.randomDelay(20, 60);
    }

    // Occasional pauses (thinking)
    if (Math.random() < 0.02) { // 2% chance
      delay += BehavioralDelays.randomDelay(200, 500);
    }

    return delay;
  },

  /**
   * Generate typing sequence with realistic delays
   */
  generateTypingSequence(text: string): Array<{ char: string; delayAfter: number }> {
    const sequence: Array<{ char: string; delayAfter: number }> = [];
    let prevChar: string | null = null;

    for (const char of text) {
      sequence.push({
        char,
        delayAfter: this.getKeystrokeDelay(char, prevChar),
      });
      prevChar = char;
    }

    return sequence;
  },
};

/**
 * Helper functions to apply human-like behavior to Playwright pages
 * These wrap common actions with realistic timing and movement
 */
export const HumanActions = {
  /**
   * Move mouse to element and click with human-like behavior
   * Includes curved path, variable speed, and pre-click pause
   */
  async clickLikeHuman(
    page: { mouse: { move: (x: number, y: number) => Promise<void>; click: (x: number, y: number) => Promise<void> }; evaluate: (fn: () => { width: number; height: number }) => Promise<{ width: number; height: number }> },
    targetX: number,
    targetY: number,
    currentPos: { x: number; y: number } = { x: 0, y: 0 }
  ): Promise<void> {
    // Generate curved path to target
    const path = HumanMouseMovement.generateBezierPath(currentPos, { x: targetX, y: targetY }, 15);

    // Move along path with variable delays
    for (const point of path) {
      await page.mouse.move(point.x, point.y);
      await new Promise(r => setTimeout(r, BehavioralDelays.randomDelay(5, 20)));
    }

    // Small pause before clicking (like a human aiming)
    await new Promise(r => setTimeout(r, BehavioralDelays.randomDelay(50, 150)));

    // Click
    await page.mouse.click(targetX, targetY);
  },

  /**
   * Type text with human-like variable speed
   */
  async typeLikeHuman(
    page: { keyboard: { type: (char: string) => Promise<void> } },
    text: string
  ): Promise<void> {
    const sequence = HumanTyping.generateTypingSequence(text);

    for (const { char, delayAfter } of sequence) {
      await page.keyboard.type(char);
      await new Promise(r => setTimeout(r, delayAfter));
    }
  },

  /**
   * Scroll page naturally (not instant jumps)
   */
  async scrollLikeHuman(
    page: { evaluate: (fn: (scrollTo: number) => void, arg: number) => Promise<void>; waitForTimeout: (ms: number) => Promise<void> },
    targetY: number,
    currentY: number = 0
  ): Promise<void> {
    const distance = Math.abs(targetY - currentY);
    const steps = Math.max(5, Math.floor(distance / 100)); // ~100px per step
    const direction = targetY > currentY ? 1 : -1;
    const stepSize = distance / steps;

    for (let i = 1; i <= steps; i++) {
      const nextY = currentY + (stepSize * i * direction);
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'auto' }), nextY);
      await page.waitForTimeout(BehavioralDelays.randomDelay(30, 80));
    }
  },

  /**
   * Simulate "reading" the page - random mouse movements and pauses
   */
  async simulateReading(
    page: { mouse: { move: (x: number, y: number) => Promise<void> }; evaluate: (fn: () => { width: number; height: number }) => Promise<{ width: number; height: number }> },
    durationMs: number = 2000
  ): Promise<void> {
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));

    const startTime = Date.now();
    let currentPos = HumanMouseMovement.randomPoint(viewport.width, viewport.height);

    while (Date.now() - startTime < durationMs) {
      // Generate idle movements
      const movements = HumanMouseMovement.generateIdleMovements(viewport, currentPos, 2);

      for (const pos of movements) {
        const path = HumanMouseMovement.generateBezierPath(currentPos, pos, 5);
        for (const point of path) {
          await page.mouse.move(point.x, point.y);
          await new Promise(r => setTimeout(r, BehavioralDelays.randomDelay(10, 30)));
        }
        currentPos = pos;

        // Pause as if reading
        await new Promise(r => setTimeout(r, BehavioralDelays.randomDelay(200, 500)));
      }
    }
  },

  /**
   * Wait a random "human" amount of time before taking action
   * Simulates reading/thinking time
   */
  async thinkBeforeAction(minMs: number = 500, maxMs: number = 2000): Promise<void> {
    await BehavioralDelays.sleep(minMs, maxMs);
  },
};
