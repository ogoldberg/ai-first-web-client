/**
 * Lightweight Renderer - JS-capable HTML renderer without full browser overhead
 *
 * This module provides a middle ground between static HTML parsing (like justjshtml)
 * and full browser automation (Playwright). It can execute JavaScript in a sandboxed
 * environment using linkedom for DOM and Node's vm module for script execution.
 *
 * Use cases:
 * - Sites that need basic JS execution to render content
 * - Server-rendered pages with light client hydration
 * - Pages that fetch data via API and inject into DOM
 *
 * Does NOT handle:
 * - Heavy anti-bot protection (Cloudflare, reCAPTCHA)
 * - Complex user interactions (hover states, drag-drop)
 * - WebGL/Canvas rendering
 * - WebSocket connections
 */

import { parseHTML } from 'linkedom';
import { CookieJar, Cookie } from 'tough-cookie';
import vm from 'node:vm';
import { URL } from 'node:url';
import { TIMEOUTS } from '../utils/timeouts.js';

export interface LightweightRenderOptions {
  // Timeout for the entire render operation (ms)
  timeout?: number;
  // Timeout for individual script execution (ms)
  scriptTimeout?: number;
  // Whether to execute scripts
  executeScripts?: boolean;
  // Wait for async content after script execution (ms)
  asyncWaitTime?: number;
  // Custom headers to send with requests
  headers?: Record<string, string>;
  // User agent string
  userAgent?: string;
  // Whether to follow redirects
  followRedirects?: boolean;
  // Maximum redirects to follow
  maxRedirects?: number;
  // Skip scripts matching these patterns
  skipScriptPatterns?: RegExp[];
  // Cookies to send with requests
  cookies?: Cookie[];
}

export interface LightweightRenderResult {
  // Final HTML after JS execution
  html: string;
  // URL after any redirects
  finalUrl: string;
  // Whether JavaScript was executed
  jsExecuted: boolean;
  // Number of scripts executed
  scriptsExecuted: number;
  // Scripts that were skipped (analytics, etc.)
  scriptsSkipped: number;
  // Scripts that failed
  scriptErrors: Array<{ src?: string; error: string }>;
  // Network requests made during rendering (fetch/XHR)
  networkRequests: Array<{
    url: string;
    method: string;
    status?: number;
    contentType?: string;
  }>;
  // Cookies received
  cookies: Cookie[];
  // Timing information
  timing: {
    fetchTime: number;
    parseTime: number;
    scriptTime: number;
    totalTime: number;
  };
  // Detected characteristics
  detection: {
    isJSHeavy: boolean;
    hasAsyncContent: boolean;
    needsFullBrowser: boolean;
    reason?: string;
  };
}

// Default patterns to skip (analytics, tracking, ads)
const DEFAULT_SKIP_PATTERNS = [
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /gtag/i,
  /facebook\.net/i,
  /twitter\.com\/widgets/i,
  /connect\.facebook/i,
  /platform\.twitter/i,
  /hotjar\.com/i,
  /segment\.io/i,
  /segment\.com/i,
  /mixpanel\.com/i,
  /sentry\.io/i,
  /newrelic\.com/i,
  /doubleclick\.net/i,
  /adsense/i,
  /adsbygoogle/i,
  /cloudflare.*challenge/i,
  /recaptcha/i,
  /hcaptcha/i,
];

// Patterns that indicate this page needs a full browser
const NEEDS_FULL_BROWSER_PATTERNS = [
  /cloudflare/i,
  /challenge-platform/i,
  /cf-chl-bypass/i,
  /__cf_chl/i,
  /recaptcha/i,
  /hcaptcha/i,
  /turnstile/i,
];

const DEFAULT_OPTIONS: LightweightRenderOptions = {
  timeout: TIMEOUTS.NETWORK_FETCH,
  scriptTimeout: TIMEOUTS.SCRIPT_EXECUTION,
  executeScripts: true,
  asyncWaitTime: 2000,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  followRedirects: true,
  maxRedirects: 5,
  skipScriptPatterns: DEFAULT_SKIP_PATTERNS,
};

export class LightweightRenderer {
  private cookieJar: CookieJar;
  private options: LightweightRenderOptions;

  constructor(options: Partial<LightweightRenderOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.cookieJar = new CookieJar();
  }

  /**
   * Render a URL with optional JavaScript execution
   */
  async render(url: string, options: Partial<LightweightRenderOptions> = {}): Promise<LightweightRenderResult> {
    const opts = { ...this.options, ...options };
    const startTime = Date.now();
    const timing = { fetchTime: 0, parseTime: 0, scriptTime: 0, totalTime: 0 };

    // Add pre-existing cookies
    if (opts.cookies) {
      for (const cookie of opts.cookies) {
        await this.cookieJar.setCookie(cookie, url);
      }
    }

    // Fetch the HTML
    const fetchStart = Date.now();
    const { html: rawHtml, finalUrl, cookies } = await this.fetchWithCookies(url, opts);
    timing.fetchTime = Date.now() - fetchStart;

    // Check if this page needs a full browser
    const detection = this.detectPageCharacteristics(rawHtml, finalUrl);
    if (detection.needsFullBrowser) {
      return {
        html: rawHtml,
        finalUrl,
        jsExecuted: false,
        scriptsExecuted: 0,
        scriptsSkipped: 0,
        scriptErrors: [],
        networkRequests: [],
        cookies,
        timing: { ...timing, totalTime: Date.now() - startTime },
        detection,
      };
    }

    // Parse HTML into DOM
    const parseStart = Date.now();
    const { document, window } = parseHTML(rawHtml);
    timing.parseTime = Date.now() - parseStart;

    // Track network requests made by scripts
    const networkRequests: LightweightRenderResult['networkRequests'] = [];
    const scriptErrors: LightweightRenderResult['scriptErrors'] = [];
    let scriptsExecuted = 0;
    let scriptsSkipped = 0;

    // Execute scripts if enabled
    if (opts.executeScripts) {
      const scriptStart = Date.now();

      // Create execution context
      const context = this.createExecutionContext(
        window,
        document,
        finalUrl,
        networkRequests,
        opts
      );

      // Execute inline and external scripts
      const scripts = document.querySelectorAll('script');

      for (const script of scripts) {
        const src = script.getAttribute('src');
        const type = script.getAttribute('type');

        // Skip module scripts for now (complex dependency resolution)
        if (type === 'module') {
          scriptsSkipped++;
          continue;
        }

        // Skip scripts matching skip patterns
        if (src && this.shouldSkipScript(src, opts.skipScriptPatterns || [])) {
          scriptsSkipped++;
          continue;
        }

        try {
          let code: string;

          if (src) {
            // Fetch external script
            const scriptUrl = new URL(src, finalUrl).href;
            try {
              const response = await this.fetchWithCookies(scriptUrl, opts);
              code = response.html;
              networkRequests.push({
                url: scriptUrl,
                method: 'GET',
                status: 200,
                contentType: 'application/javascript',
              });
            } catch (e) {
              scriptErrors.push({ src: scriptUrl, error: String(e) });
              continue;
            }
          } else {
            code = script.textContent || '';
          }

          if (code.trim()) {
            // Execute with timeout
            await this.executeScript(code, context, opts.scriptTimeout || 5000);
            scriptsExecuted++;
          }
        } catch (error) {
          scriptErrors.push({
            src: src || 'inline',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Wait for async content
      if (opts.asyncWaitTime && opts.asyncWaitTime > 0) {
        await this.waitForAsyncContent(context, opts.asyncWaitTime);
      }

      timing.scriptTime = Date.now() - scriptStart;
    }

    // Serialize the DOM back to HTML
    const finalHtml = document.toString();
    timing.totalTime = Date.now() - startTime;

    // Update detection based on execution results
    detection.hasAsyncContent = networkRequests.length > 0;
    detection.isJSHeavy = scriptsExecuted > 10 || scriptErrors.length > 5;

    return {
      html: finalHtml,
      finalUrl,
      jsExecuted: Boolean(opts.executeScripts) && scriptsExecuted > 0,
      scriptsExecuted,
      scriptsSkipped,
      scriptErrors,
      networkRequests,
      cookies,
      timing,
      detection,
    };
  }

  /**
   * Quick static render without JS execution (fastest)
   */
  async renderStatic(url: string, options: Partial<LightweightRenderOptions> = {}): Promise<LightweightRenderResult> {
    return this.render(url, { ...options, executeScripts: false });
  }

  /**
   * Fetch URL with cookie handling and redirects
   */
  private async fetchWithCookies(
    url: string,
    opts: LightweightRenderOptions
  ): Promise<{ html: string; finalUrl: string; cookies: Cookie[] }> {
    let currentUrl = url;
    let redirectCount = 0;
    const maxRedirects = opts.maxRedirects || 5;

    while (true) {
      // Get cookies for this URL
      const cookieString = await this.cookieJar.getCookieString(currentUrl);

      const headers: Record<string, string> = {
        'User-Agent': opts.userAgent || DEFAULT_OPTIONS.userAgent!,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        ...opts.headers,
      };

      if (cookieString) {
        headers['Cookie'] = cookieString;
      }

      const response = await fetch(currentUrl, {
        headers,
        redirect: 'manual', // Handle redirects manually to track cookies
      });

      // Store any cookies from the response
      const setCookieHeaders = response.headers.getSetCookie?.() || [];
      for (const setCookie of setCookieHeaders) {
        try {
          await this.cookieJar.setCookie(setCookie, currentUrl);
        } catch {
          // Ignore invalid cookies
        }
      }

      // Handle redirects
      if (response.status >= 300 && response.status < 400 && opts.followRedirects) {
        const location = response.headers.get('location');
        if (location && redirectCount < maxRedirects) {
          currentUrl = new URL(location, currentUrl).href;
          redirectCount++;
          continue;
        }
      }

      const html = await response.text();
      const cookies = await this.cookieJar.getCookies(currentUrl);

      return { html, finalUrl: currentUrl, cookies };
    }
  }

  /**
   * Create a sandboxed execution context for JavaScript
   */
  private createExecutionContext(
    window: any,
    document: any,
    baseUrl: string,
    networkRequests: LightweightRenderResult['networkRequests'],
    opts: LightweightRenderOptions
  ): vm.Context {
    const url = new URL(baseUrl);

    // Create mock location object
    const location = {
      href: baseUrl,
      origin: url.origin,
      protocol: url.protocol,
      host: url.host,
      hostname: url.hostname,
      port: url.port,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      assign: () => {},
      replace: () => {},
      reload: () => {},
    };

    // Create mock navigator
    const navigator = {
      userAgent: opts.userAgent || DEFAULT_OPTIONS.userAgent,
      language: 'en-US',
      languages: ['en-US', 'en'],
      platform: 'MacIntel',
      vendor: 'Google Inc.',
      cookieEnabled: true,
      onLine: true,
    };

    // Create mock fetch that tracks requests
    const mockFetch = async (input: string | URL, init?: RequestInit): Promise<Response> => {
      const fetchUrl = new URL(input.toString(), baseUrl).href;
      const method = init?.method || 'GET';

      try {
        const cookieString = await this.cookieJar.getCookieString(fetchUrl);
        const headers: Record<string, string> = {
          'User-Agent': opts.userAgent || DEFAULT_OPTIONS.userAgent!,
          ...(init?.headers as Record<string, string>),
        };
        if (cookieString) {
          headers['Cookie'] = cookieString;
        }

        const response = await fetch(fetchUrl, {
          ...init,
          headers,
        });

        networkRequests.push({
          url: fetchUrl,
          method,
          status: response.status,
          contentType: response.headers.get('content-type') || undefined,
        });

        return response;
      } catch (error) {
        networkRequests.push({
          url: fetchUrl,
          method,
          status: 0,
        });
        throw error;
      }
    };

    // Create mock XMLHttpRequest
    const createXHR = () => {
      return class MockXMLHttpRequest {
        private _url: string = '';
        private _method: string = 'GET';
        private _headers: Record<string, string> = {};
        private _responseText: string = '';
        private _status: number = 0;
        private _readyState: number = 0;

        onreadystatechange: (() => void) | null = null;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;

        get responseText() { return this._responseText; }
        get status() { return this._status; }
        get readyState() { return this._readyState; }

        open(method: string, url: string) {
          this._method = method;
          this._url = new URL(url, baseUrl).href;
          this._readyState = 1;
        }

        setRequestHeader(name: string, value: string) {
          this._headers[name] = value;
        }

        async send(body?: any) {
          try {
            const response = await mockFetch(this._url, {
              method: this._method,
              headers: this._headers,
              body,
            });
            this._status = response.status;
            this._responseText = await response.text();
            this._readyState = 4;
            this.onreadystatechange?.();
            this.onload?.();
          } catch {
            this._readyState = 4;
            this._status = 0;
            this.onerror?.();
          }
        }
      };
    };

    // Pending timers for async wait
    const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

    // Mock setTimeout/setInterval
    const mockSetTimeout = (fn: Function, ms: number = 0, ...args: any[]) => {
      const timer = setTimeout(() => {
        pendingTimers.delete(timer);
        try { fn(...args); } catch {}
      }, Math.min(ms, 5000)); // Cap at 5 seconds
      pendingTimers.add(timer);
      return timer;
    };

    const mockSetInterval = (fn: Function, ms: number, ...args: any[]) => {
      // Don't allow intervals in lightweight renderer
      return 0;
    };

    const mockClearTimeout = (id: ReturnType<typeof setTimeout>) => {
      pendingTimers.delete(id);
      clearTimeout(id);
    };

    // Storage mocks
    const createStorage = () => {
      const data = new Map<string, string>();
      return {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => data.set(key, value),
        removeItem: (key: string) => data.delete(key),
        clear: () => data.clear(),
        key: (index: number) => Array.from(data.keys())[index] ?? null,
        get length() { return data.size; },
      };
    };

    const context = vm.createContext({
      // Window and document
      window,
      document,
      self: window,

      // Location and navigation
      location,
      history: { pushState: () => {}, replaceState: () => {}, go: () => {}, back: () => {}, forward: () => {} },

      // Navigator
      navigator,

      // Console (silent by default)
      console: {
        log: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
        trace: () => {},
        dir: () => {},
        table: () => {},
      },

      // Timers
      setTimeout: mockSetTimeout,
      setInterval: mockSetInterval,
      clearTimeout: mockClearTimeout,
      clearInterval: mockClearTimeout,
      requestAnimationFrame: (cb: Function) => mockSetTimeout(cb, 16),
      cancelAnimationFrame: mockClearTimeout,

      // Network
      fetch: mockFetch,
      XMLHttpRequest: createXHR(),

      // Storage
      localStorage: createStorage(),
      sessionStorage: createStorage(),

      // URL APIs
      URL,
      URLSearchParams,

      // Encoding
      btoa: (str: string) => Buffer.from(str).toString('base64'),
      atob: (str: string) => Buffer.from(str, 'base64').toString(),
      encodeURIComponent,
      decodeURIComponent,
      encodeURI,
      decodeURI,

      // JSON
      JSON,

      // Math and primitives
      Math,
      Date,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      Number,
      String,
      Boolean,
      Array,
      Object,
      RegExp,
      Error,
      TypeError,
      ReferenceError,
      SyntaxError,
      Map,
      Set,
      WeakMap,
      WeakSet,
      Promise,
      Symbol,
      Proxy,
      Reflect,

      // Node-specific that scripts might check
      global: undefined,
      process: undefined,
      require: undefined,
      module: undefined,
      exports: undefined,
      __dirname: undefined,
      __filename: undefined,

      // Stubs for things we don't support
      Worker: class { constructor() { throw new Error('Workers not supported'); } },
      WebSocket: class { constructor() { throw new Error('WebSocket not supported'); } },
      MutationObserver: class {
        observe() {}
        disconnect() {}
        takeRecords() { return []; }
      },
      IntersectionObserver: class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
      ResizeObserver: class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },

      // Screen mock
      screen: {
        width: 1920,
        height: 1080,
        availWidth: 1920,
        availHeight: 1080,
        colorDepth: 24,
        pixelDepth: 24,
      },

      // Performance mock
      performance: {
        now: () => Date.now(),
        timing: {},
        getEntriesByType: () => [],
        getEntriesByName: () => [],
      },

      // Event constructors (basic stubs)
      Event: class Event {
        type: string;
        constructor(type: string) { this.type = type; }
      },
      CustomEvent: class CustomEvent {
        type: string;
        detail: any;
        constructor(type: string, init?: { detail?: any }) {
          this.type = type;
          this.detail = init?.detail;
        }
      },
    });

    // Make window properties accessible directly
    context.window = context;

    return context;
  }

  /**
   * Execute a script with timeout
   */
  private async executeScript(code: string, context: vm.Context, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        vm.runInContext(code, context, {
          timeout,
          displayErrors: false,
        });
        resolve();
      } catch (error) {
        // Don't fail on script errors - many scripts aren't needed for content
        resolve();
      }
    });
  }

  /**
   * Wait for async content to settle
   */
  private async waitForAsyncContent(context: vm.Context, maxWait: number): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 100;

    // Simple wait - in a full implementation, we'd check for pending promises
    await new Promise(resolve => setTimeout(resolve, Math.min(maxWait, 1000)));
  }

  /**
   * Check if a script should be skipped
   */
  private shouldSkipScript(src: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(src));
  }

  /**
   * Detect page characteristics to determine if full browser is needed
   */
  private detectPageCharacteristics(html: string, url: string): LightweightRenderResult['detection'] {
    const detection = {
      isJSHeavy: false,
      hasAsyncContent: false,
      needsFullBrowser: false,
      reason: undefined as string | undefined,
    };

    // Check for anti-bot patterns
    for (const pattern of NEEDS_FULL_BROWSER_PATTERNS) {
      if (pattern.test(html)) {
        detection.needsFullBrowser = true;
        detection.reason = `Detected anti-bot protection: ${pattern.source}`;
        return detection;
      }
    }

    // Check for SPA markers (empty body with JS app root)
    const hasEmptyAppRoot = /<div\s+id=["'](root|app|__next|__nuxt)["'][^>]*>\s*<\/div>/i.test(html);
    const hasMinimalBody = /<body[^>]*>\s*<div/.test(html) && html.replace(/<script[\s\S]*?<\/script>/gi, '').length < 1000;

    if (hasEmptyAppRoot && hasMinimalBody) {
      detection.isJSHeavy = true;
      // Don't mark as needsFullBrowser yet - let's try to render first
    }

    // Check for noscript warning that suggests JS is required
    const noscriptMatch = html.match(/<noscript[^>]*>([\s\S]*?)<\/noscript>/i);
    if (noscriptMatch && /javascript|enable|required/i.test(noscriptMatch[1])) {
      detection.isJSHeavy = true;
    }

    return detection;
  }

  /**
   * Get cookies for a domain
   */
  async getCookies(url: string): Promise<Cookie[]> {
    return this.cookieJar.getCookies(url);
  }

  /**
   * Set cookies for a domain
   */
  async setCookies(cookies: Cookie[], url: string): Promise<void> {
    for (const cookie of cookies) {
      await this.cookieJar.setCookie(cookie, url);
    }
  }

  /**
   * Clear all cookies
   */
  async clearCookies(): Promise<void> {
    this.cookieJar = new CookieJar();
  }
}

// Export a singleton instance for convenience
export const lightweightRenderer = new LightweightRenderer();
