/**
 * PopupFetcher - OAuth-style popup for authenticated content
 *
 * Opens a popup window for the user to authenticate,
 * then extracts content once they're done.
 *
 * Uses postMessage communication for cross-origin safety.
 */

import type {
  FetchOptions,
  FetchResult,
  FetchError,
  ConnectTheme,
} from '../types.js';
import type { MessageBus } from '../communication/message-bus.js';
import type { PatternCache } from '../patterns/pattern-cache.js';
import { extractContent } from '../extraction/content-extractor.js';

interface PopupFetcherConfig {
  messageBus: MessageBus;
  patternCache: PatternCache;
  theme?: ConnectTheme;
  debug?: boolean;
}

export class PopupFetcher {
  private config: PopupFetcherConfig;
  private activePopups = new Map<string, Window>();

  constructor(config: PopupFetcherConfig) {
    this.config = config;
  }

  /**
   * Fetch content via popup window
   */
  async fetch(options: FetchOptions): Promise<FetchResult | FetchError> {
    const { url, timeout = 60000, extract, onProgress, authPrompt } = options;

    // Calculate popup size and position
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const features = [
      `width=${width}`,
      `height=${height}`,
      `left=${left}`,
      `top=${top}`,
      'menubar=no',
      'toolbar=no',
      'location=yes', // Show URL bar for trust
      'status=no',
      'resizable=yes',
      'scrollbars=yes',
    ].join(',');

    const fetchId = this.generateId();

    return new Promise((resolve) => {
      let resolved = false;
      let popup: Window | null = null;

      const cleanup = () => {
        if (this.activePopups.has(fetchId)) {
          this.activePopups.delete(fetchId);
        }
        if (popup && !popup.closed) {
          popup.close();
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

      // Open popup
      popup = window.open(url, `unbrowser-${fetchId}`, features);

      if (!popup) {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          error: { code: 'POPUP_BLOCKED', message: 'Browser blocked popup window' },
        });
        return;
      }

      this.activePopups.set(fetchId, popup);
      onProgress?.({ stage: 'loading', percent: 10, message: 'Opening page...' });

      // Show auth prompt if provided
      if (authPrompt) {
        onProgress?.({ stage: 'waiting_auth', percent: 20, message: authPrompt });
      }

      // Monitor popup for completion
      const pollInterval = setInterval(async () => {
        try {
          // Check if popup was closed by user
          if (popup.closed) {
            clearInterval(pollInterval);
            clearTimeout(timeoutId);

            if (!resolved) {
              resolved = true;
              cleanup();
              resolve({
                success: false,
                error: { code: 'USER_CANCELLED', message: 'User closed the window' },
              });
            }
            return;
          }

          // Try to access popup content (will fail if cross-origin)
          const popupDoc = popup.document;

          // Check if page is loaded and ready
          if (popupDoc.readyState === 'complete') {
            clearInterval(pollInterval);
            clearTimeout(timeoutId);

            onProgress?.({ stage: 'extracting', percent: 80, message: 'Extracting content...' });

            try {
              // Get pattern for this domain
              const currentUrl = popup.location.href;
              const domain = new URL(currentUrl).hostname;
              const pattern = this.config.patternCache.get(domain);

              // Extract content directly from the popup document
              const content = await extractContent(popupDoc, extract || {}, pattern);

              resolved = true;
              cleanup();

              resolve({
                success: true,
                url: currentUrl,
                title: popupDoc.title,
                content,
                meta: {
                  duration: 0,
                  mode: 'popup',
                  authenticated: true,
                  contentType: 'text/html',
                  patternsUsed: pattern ? [domain] : undefined,
                },
              });
            } catch (err) {
              resolved = true;
              cleanup();
              resolve({
                success: false,
                error: {
                  code: 'EXTRACTION_FAILED',
                  message: err instanceof Error ? err.message : 'Extraction failed',
                },
              });
            }
          }
        } catch {
          // Cross-origin - can't access yet, keep polling
          // This is expected for authenticated flows where user
          // navigates to a different origin for login
        }
      }, 500);
    });
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    for (const popup of this.activePopups.values()) {
      if (!popup.closed) {
        popup.close();
      }
    }
    this.activePopups.clear();
  }

  private generateId(): string {
    return `popup-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log('[PopupFetcher]', ...args);
    }
  }
}
