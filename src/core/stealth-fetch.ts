/**
 * Stealth Fetch Module
 *
 * Provides TLS fingerprint impersonation for bypassing bot detection.
 * Uses CycleTLS when available for browser-like TLS fingerprints.
 *
 * This is inspired by yt-dlp's use of curl_cffi for TLS fingerprinting,
 * adapted for the Node.js ecosystem using CycleTLS.
 *
 * @see https://github.com/Danny-Dasilva/CycleTLS
 * @see https://github.com/lexiforest/curl_cffi
 */

import { logger } from '../utils/logger.js';

const log = logger.intelligence;

/**
 * Browser fingerprint profiles
 * Based on real browser JA3/JA4 fingerprints
 */
export const BROWSER_PROFILES = {
  // Chrome 120 on Windows
  chrome_120: {
    ja3: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513-21,29-23-24,0',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    headers: {
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
    },
  },

  // Firefox 121 on Windows
  firefox_121: {
    ja3: '771,4865-4867-4866-49195-49199-52393-52392-49196-49200-49162-49161-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-51-43-13-45-28-21,29-23-24-25-256-257,0',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    headers: {
      'upgrade-insecure-requests': '1',
    },
  },

  // Safari 17 on macOS
  safari_17: {
    ja3: '771,4865-4866-4867-49196-49195-52393-49200-49199-52392-49188-49187-49192-49191-49162-49161-49172-49171-157-156-53-47-255,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-21,29-23-24,0',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    headers: {},
  },

  // Chrome on Android
  chrome_android: {
    ja3: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513-21,29-23-24,0',
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
    headers: {
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
    },
  },

  // Chrome on iOS (uses Safari's engine)
  chrome_ios: {
    ja3: '771,4865-4866-4867-49196-49195-52393-49200-49199-52392-49188-49187-49192-49191-49162-49161-49172-49171-157-156-53-47-255,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-21,29-23-24,0',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1',
    headers: {},
  },
} as const;

export type BrowserProfile = keyof typeof BROWSER_PROFILES;

/**
 * Stealth fetch options
 */
export interface StealthFetchOptions {
  /** Browser profile to impersonate */
  profile?: BrowserProfile;
  /** Custom JA3 fingerprint */
  ja3?: string;
  /** Custom user agent */
  userAgent?: string;
  /** Additional headers */
  headers?: Record<string, string>;
  /** Request timeout in ms */
  timeout?: number;
  /** Proxy URL */
  proxy?: string;
  /** Follow redirects */
  followRedirects?: boolean;
  /** Maximum redirects to follow */
  maxRedirects?: number;
}

/**
 * Stealth fetch response
 */
export interface StealthFetchResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  url: string;
  redirected: boolean;
}

// Lazy-loaded CycleTLS instance
let cycleTLSInstance: any = null;
let cycleTLSAvailable: boolean | null = null;

/**
 * Check if CycleTLS is available
 */
export async function isCycleTLSAvailable(): Promise<boolean> {
  if (cycleTLSAvailable !== null) {
    return cycleTLSAvailable;
  }

  try {
    const cycleTLSModule = await import('cycletls');
    // Dynamic import with type assertion - cycletls exports a function as default
    const initCycleTLS = cycleTLSModule.default as unknown as (initOptions?: { port?: number; debug?: boolean; timeout?: number; executablePath?: string }) => Promise<typeof cycleTLSInstance>;
    cycleTLSInstance = await initCycleTLS();
    cycleTLSAvailable = true;
    log.info('CycleTLS initialized successfully');
    return true;
  } catch (error) {
    cycleTLSAvailable = false;
    log.debug('CycleTLS not available, using standard fetch', { error: String(error) });
    return false;
  }
}

/**
 * Get or initialize CycleTLS
 */
async function getCycleTLS(): Promise<any> {
  if (cycleTLSInstance) {
    return cycleTLSInstance;
  }

  const available = await isCycleTLSAvailable();
  if (!available) {
    throw new Error('CycleTLS is not available');
  }

  return cycleTLSInstance;
}

/**
 * Cleanup CycleTLS instance
 * Call this when shutting down to clean up resources
 */
export async function cleanupCycleTLS(): Promise<void> {
  if (cycleTLSInstance) {
    try {
      await cycleTLSInstance.exit();
      cycleTLSInstance = null;
      log.debug('CycleTLS cleaned up');
    } catch (error) {
      log.warn('Error cleaning up CycleTLS', { error: String(error) });
    }
  }
}

/**
 * Fetch with TLS fingerprint impersonation
 *
 * Falls back to standard fetch if CycleTLS is not available.
 */
export async function stealthFetch(
  url: string,
  options: StealthFetchOptions = {}
): Promise<StealthFetchResponse> {
  const {
    profile = 'chrome_120',
    ja3,
    userAgent,
    headers = {},
    timeout = 30000,
    proxy,
    followRedirects = true,
    maxRedirects = 5,
  } = options;

  const profileData = BROWSER_PROFILES[profile];
  const finalJa3 = ja3 || profileData.ja3;
  const finalUserAgent = userAgent || profileData.userAgent;
  const finalHeaders = {
    ...profileData.headers,
    ...headers,
    'User-Agent': finalUserAgent,
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
  };

  // Try CycleTLS first
  if (await isCycleTLSAvailable()) {
    try {
      const cycleTLS = await getCycleTLS();

      const response = await cycleTLS(
        url,
        {
          body: '',
          ja3: finalJa3,
          userAgent: finalUserAgent,
          headers: finalHeaders,
          timeout: timeout,
          proxy: proxy,
          disableRedirect: !followRedirects,
        },
        'get'
      );

      return {
        status: response.status,
        statusText: getStatusText(response.status),
        headers: response.headers || {},
        body: response.body || '',
        url: response.finalUrl || url,
        redirected: response.finalUrl !== url,
      };
    } catch (error) {
      log.warn('CycleTLS request failed, falling back to standard fetch', {
        error: String(error),
      });
    }
  }

  // Fallback to standard fetch
  return await standardFetch(url, finalHeaders, timeout, followRedirects, maxRedirects);
}

/**
 * Standard fetch fallback
 */
async function standardFetch(
  url: string,
  headers: Record<string, string>,
  timeout: number,
  followRedirects: boolean,
  maxRedirects: number
): Promise<StealthFetchResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
      redirect: followRedirects ? 'follow' : 'manual',
    });

    const body = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body,
      url: response.url,
      redirected: response.redirected,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get HTTP status text from status code
 */
function getStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    301: 'Moved Permanently',
    302: 'Found',
    304: 'Not Modified',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };
  return statusTexts[status] || 'Unknown';
}

/**
 * Fetch with random browser profile
 * Useful for avoiding fingerprint-based blocking
 */
export async function stealthFetchRandom(
  url: string,
  options: Omit<StealthFetchOptions, 'profile'> = {}
): Promise<StealthFetchResponse> {
  const profiles = Object.keys(BROWSER_PROFILES) as BrowserProfile[];
  const randomProfile = profiles[Math.floor(Math.random() * profiles.length)];

  return stealthFetch(url, { ...options, profile: randomProfile });
}

/**
 * Fetch with retry on fingerprint detection
 * Switches browser profiles on 403/429 responses
 */
export async function stealthFetchWithRetry(
  url: string,
  options: StealthFetchOptions = {},
  maxRetries: number = 3
): Promise<StealthFetchResponse> {
  const profiles = Object.keys(BROWSER_PROFILES) as BrowserProfile[];
  let lastError: Error | null = null;
  let profileIndex = 0;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const profile = profiles[profileIndex % profiles.length];

    try {
      const response = await stealthFetch(url, { ...options, profile });

      // If we get blocked, try a different profile
      if (response.status === 403 || response.status === 429) {
        log.debug(`Got ${response.status}, trying different profile`, {
          attempt,
          profile,
        });
        profileIndex++;
        continue;
      }

      return response;
    } catch (error) {
      lastError = error as Error;
      log.debug(`Stealth fetch attempt ${attempt + 1} failed`, {
        error: String(error),
      });
      profileIndex++;
    }
  }

  throw lastError || new Error('All stealth fetch attempts failed');
}

/**
 * Check if a site likely requires stealth fetching
 * Based on common bot detection patterns
 */
export function likelyNeedsStealth(url: string): boolean {
  const stealthDomains = [
    'amazon.',
    'linkedin.',
    'instagram.',
    'facebook.',
    'twitter.',
    'x.com',
    'cloudflare.',
    'akamai.',
    'datadome.',
    'perimeter',
    'incapsula.',
    'imperva.',
  ];

  const urlLower = url.toLowerCase();
  return stealthDomains.some((domain) => urlLower.includes(domain));
}

export default stealthFetch;
