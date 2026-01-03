/**
 * UnbrowserConnect - Main SDK class
 *
 * Orchestrates fetching content through the user's browser
 * using iframes (background) or popups (auth-required).
 */

import type {
  ConnectConfig,
  FetchOptions,
  FetchResult,
  FetchError,
  ConnectError,
  BatchFetchOptions,
  BatchFetchResult,
  FetchProgress,
} from './types.js';
import { BackgroundFetcher } from './fetchers/background-fetcher.js';
import { PopupFetcher } from './fetchers/popup-fetcher.js';
import { PatternCache } from './patterns/pattern-cache.js';
import { MessageBus } from './communication/message-bus.js';

export class UnbrowserConnect {
  private config: Required<Pick<ConnectConfig, 'appId' | 'apiKey' | 'apiUrl' | 'debug'>> & ConnectConfig;
  private initialized = false;
  private backgroundFetcher: BackgroundFetcher;
  private popupFetcher: PopupFetcher;
  private patternCache: PatternCache;
  private messageBus: MessageBus;

  constructor(config: ConnectConfig) {
    if (!config.appId || !config.apiKey) {
      throw new Error('appId and apiKey are required');
    }

    this.config = {
      apiUrl: 'https://api.unbrowser.ai',
      debug: false,
      ...config,
    };

    this.messageBus = new MessageBus({
      debug: this.config.debug,
    });

    this.patternCache = new PatternCache({
      apiUrl: this.config.apiUrl,
      apiKey: this.config.apiKey,
      appId: this.config.appId,
    });

    this.backgroundFetcher = new BackgroundFetcher({
      messageBus: this.messageBus,
      patternCache: this.patternCache,
      debug: this.config.debug,
    });

    this.popupFetcher = new PopupFetcher({
      messageBus: this.messageBus,
      patternCache: this.patternCache,
      theme: this.config.theme,
      debug: this.config.debug,
    });
  }

  /**
   * Initialize the SDK
   * Syncs patterns from server, sets up message handlers
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    this.log('Initializing Unbrowser Connect...');

    // Initialize message bus for cross-origin communication
    this.messageBus.init();

    // Sync patterns from server (non-blocking, can use cached)
    await this.patternCache.sync().catch((err) => {
      this.log('Pattern sync failed, using cached patterns:', err);
    });

    this.initialized = true;

    if (this.config.onReady) {
      this.config.onReady();
    }

    this.log('Unbrowser Connect initialized');
  }

  /**
   * Fetch content from a URL through the user's browser
   */
  async fetch(options: FetchOptions): Promise<FetchResult | FetchError> {
    if (!this.initialized) {
      await this.init();
    }

    const { url, mode = 'background', requiresAuth = false } = options;

    // Validate URL
    try {
      new URL(url);
    } catch {
      return this.createError('INVALID_URL', `Invalid URL: ${url}`);
    }

    const startTime = Date.now();

    // Report initial progress
    this.reportProgress(options.onProgress, 'initializing', 0, 'Starting fetch...');

    try {
      let result: FetchResult | FetchError;

      if (mode === 'background' && !requiresAuth) {
        // Try background (iframe) first
        result = await this.backgroundFetcher.fetch(options);

        // If iframe is blocked, escalate to popup
        if (!result.success && result.error.code === 'IFRAME_BLOCKED') {
          this.log('Iframe blocked, escalating to popup mode');
          result = await this.popupFetcher.fetch({ ...options, mode: 'popup' });
        }
      } else {
        // Use popup for auth-required or explicit popup mode
        result = await this.popupFetcher.fetch(options);
      }

      // Add timing metadata if successful
      if (result.success) {
        result.meta.duration = Date.now() - startTime;
      }

      this.reportProgress(options.onProgress, 'complete', 100, 'Fetch complete');

      return result;
    } catch (error) {
      const connectError = this.createError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Unknown error'
      );

      if (this.config.onError) {
        this.config.onError(connectError.error);
      }

      return connectError;
    }
  }

  /**
   * Fetch multiple URLs with concurrency control
   */
  async batchFetch(options: BatchFetchOptions): Promise<BatchFetchResult> {
    if (!this.initialized) {
      await this.init();
    }

    const { urls, options: fetchOptions = {}, concurrency = 3, continueOnError = true } = options;

    const results: (FetchResult | FetchError)[] = [];
    let succeeded = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((url) =>
          this.fetch({ ...fetchOptions, url }).then((result) => {
            if (result.success) {
              succeeded++;
            } else {
              failed++;
              if (!continueOnError) {
                throw new Error(`Fetch failed for ${url}: ${result.error.message}`);
              }
            }
            return result;
          })
        )
      );

      results.push(...batchResults);

      if (options.onProgress) {
        options.onProgress(results.length, urls.length, results);
      }
    }

    return {
      total: urls.length,
      succeeded,
      failed,
      results,
    };
  }

  /**
   * Check if a URL can be fetched via background mode
   * (Tests for X-Frame-Options blocking)
   */
  async canFetchBackground(url: string): Promise<boolean> {
    return this.backgroundFetcher.canEmbed(url);
  }

  /**
   * Get the pattern for a domain (for debugging)
   */
  getPattern(domain: string): unknown {
    return this.patternCache.get(domain);
  }

  /**
   * Force sync patterns from server
   */
  async syncPatterns(): Promise<void> {
    await this.patternCache.sync();
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.messageBus.destroy();
    this.backgroundFetcher.destroy();
    this.popupFetcher.destroy();
    this.initialized = false;
  }

  private createError(code: FetchError['error']['code'], message: string): FetchError {
    return {
      success: false,
      error: { code, message },
    };
  }

  private reportProgress(
    callback: FetchOptions['onProgress'],
    stage: FetchProgress['stage'],
    percent: number,
    message: string
  ): void {
    if (callback) {
      callback({ stage, percent, message });
    }
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log('[UnbrowserConnect]', ...args);
    }
  }
}

/**
 * Factory function for creating Connect instance
 */
export function createConnect(config: ConnectConfig): UnbrowserConnect {
  return new UnbrowserConnect(config);
}
