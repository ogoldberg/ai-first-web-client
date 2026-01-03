/**
 * BackgroundFetcher - Invisible iframe-based content fetching
 *
 * Loads URLs in a hidden iframe and extracts content.
 * Only works for sites that don't set X-Frame-Options.
 */

import type {
  FetchOptions,
  FetchResult,
  FetchError,
  ExtractionOptions,
} from '../types.js';
import type { MessageBus } from '../communication/message-bus.js';
import type { PatternCache } from '../patterns/pattern-cache.js';
import { extractContent } from '../extraction/content-extractor.js';

interface BackgroundFetcherConfig {
  messageBus: MessageBus;
  patternCache: PatternCache;
  debug?: boolean;
}

export class BackgroundFetcher {
  private config: BackgroundFetcherConfig;
  private container: HTMLDivElement | null = null;
  private activeIframes = new Map<string, HTMLIFrameElement>();

  constructor(config: BackgroundFetcherConfig) {
    this.config = config;
  }

  /**
   * Fetch content via hidden iframe
   */
  async fetch(options: FetchOptions): Promise<FetchResult | FetchError> {
    const { url, timeout = 30000, extract, onProgress } = options;

    this.ensureContainer();

    const iframe = document.createElement('iframe');
    const fetchId = this.generateId();

    // Hide the iframe
    iframe.style.cssText = `
      position: absolute;
      width: 1px;
      height: 1px;
      left: -9999px;
      visibility: hidden;
    `;
    iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');

    return new Promise((resolve) => {
      let resolved = false;
      let loadAttempted = false;

      const cleanup = () => {
        if (this.activeIframes.has(fetchId)) {
          this.activeIframes.delete(fetchId);
          iframe.remove();
        }
      };

      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({
            success: false,
            error: { code: 'TIMEOUT', message: `Fetch timed out after ${timeout}ms` },
          });
        }
      }, timeout);

      // Handle load errors (X-Frame-Options blocking)
      iframe.onerror = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          cleanup();
          resolve({
            success: false,
            error: { code: 'IFRAME_BLOCKED', message: 'Site blocks iframe embedding' },
          });
        }
      };

      // Handle successful load
      iframe.onload = async () => {
        loadAttempted = true;
        onProgress?.({ stage: 'extracting', percent: 75, message: 'Extracting content...' });

        try {
          // Check if we can access the content (same-origin policy)
          const doc = iframe.contentDocument;
          const win = iframe.contentWindow;

          if (!doc || !win) {
            throw new Error('Cannot access iframe content (blocked by CORS)');
          }

          // Check for X-Frame-Options error page
          const body = doc.body?.textContent?.toLowerCase() || '';
          if (
            body.includes('refused to connect') ||
            body.includes('refused to display') ||
            body.includes('x-frame-options')
          ) {
            throw new Error('IFRAME_BLOCKED');
          }

          // Get pattern for this domain
          const domain = new URL(url).hostname;
          const pattern = this.config.patternCache.get(domain);

          // Extract content
          const content = await extractContent(doc, extract || {}, pattern);

          clearTimeout(timeoutId);
          resolved = true;
          cleanup();

          resolve({
            success: true,
            url: win.location.href,
            title: doc.title,
            content,
            meta: {
              duration: 0, // Set by caller
              mode: 'background',
              authenticated: false,
              contentType: 'text/html',
              patternsUsed: pattern ? [domain] : undefined,
            },
          });
        } catch (error) {
          clearTimeout(timeoutId);
          resolved = true;
          cleanup();

          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          if (errorMessage === 'IFRAME_BLOCKED') {
            resolve({
              success: false,
              error: { code: 'IFRAME_BLOCKED', message: 'Site blocks iframe embedding' },
            });
          } else {
            resolve({
              success: false,
              error: { code: 'EXTRACTION_FAILED', message: errorMessage },
            });
          }
        }
      };

      // Start loading
      this.activeIframes.set(fetchId, iframe);
      this.container!.appendChild(iframe);
      onProgress?.({ stage: 'loading', percent: 25, message: 'Loading page...' });

      // Set src to start navigation
      iframe.src = url;

      // Detect X-Frame-Options by checking if load never fires
      setTimeout(() => {
        if (!loadAttempted && !resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          cleanup();
          resolve({
            success: false,
            error: { code: 'IFRAME_BLOCKED', message: 'Site blocks iframe embedding' },
          });
        }
      }, 5000); // Give 5s for load event
    });
  }

  /**
   * Check if a URL can be embedded in an iframe
   */
  async canEmbed(url: string): Promise<boolean> {
    try {
      // Try a HEAD request to check headers
      const response = await fetch(url, {
        method: 'HEAD',
        mode: 'no-cors',
      });

      // If we get here, we can't really check headers due to CORS
      // Fall back to optimistic assumption
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    for (const iframe of this.activeIframes.values()) {
      iframe.remove();
    }
    this.activeIframes.clear();

    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  private ensureContainer(): void {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'unbrowser-connect-container';
      this.container.style.cssText = `
        position: absolute;
        width: 0;
        height: 0;
        overflow: hidden;
        pointer-events: none;
      `;
      document.body.appendChild(this.container);
    }
  }

  private generateId(): string {
    return `bg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log('[BackgroundFetcher]', ...args);
    }
  }
}
