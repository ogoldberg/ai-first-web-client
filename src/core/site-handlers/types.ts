/**
 * Site Handler Types
 *
 * Common types and interfaces for site-specific API handlers.
 * These handlers extract content from specific websites using their APIs.
 */

import type { ExtractionStrategy } from '../content-intelligence.js';

/**
 * Result from a site handler extraction
 */
export interface SiteHandlerResult {
  content: {
    title: string;
    text: string;
    markdown: string;
    structured?: Record<string, unknown>;
  };
  meta: {
    url: string;
    finalUrl: string;
    strategy: ExtractionStrategy;
    confidence: 'high' | 'medium' | 'low';
  };
  warnings: string[];
}

/**
 * Options passed to site handlers
 */
export interface SiteHandlerOptions {
  timeout?: number;
  minContentLength?: number;
  headers?: Record<string, string>;
  userAgent?: string;
}

/**
 * Fetch function type that handlers use for HTTP requests
 * This allows dependency injection of the cookie-aware fetch
 */
export type FetchFunction = (
  url: string,
  opts: SiteHandlerOptions & { headers?: Record<string, string> }
) => Promise<Response>;

/**
 * Interface that all site handlers must implement
 */
export interface SiteHandler {
  /**
   * Name of the site this handler supports
   */
  readonly name: string;

  /**
   * The extraction strategy identifier
   */
  readonly strategy: ExtractionStrategy;

  /**
   * Check if this handler can process the given URL
   */
  canHandle(url: string): boolean;

  /**
   * Extract content from the URL using this site's API
   * Returns null if extraction fails or content is insufficient
   */
  extract(
    url: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null>;
}

/**
 * Base class with common utilities for site handlers
 */
export abstract class BaseSiteHandler implements SiteHandler {
  abstract readonly name: string;
  abstract readonly strategy: ExtractionStrategy;

  abstract canHandle(url: string): boolean;
  abstract extract(
    url: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null>;

  /**
   * Parse a URL safely, returning null on failure
   */
  protected parseUrl(url: string): URL | null {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  }

  /**
   * Check if response is JSON
   */
  protected isJsonResponse(response: Response): boolean {
    const contentType = response.headers.get('content-type') || '';
    return contentType.includes('application/json');
  }

  /**
   * Format large numbers with commas
   */
  protected formatNumber(num: number): string {
    return num.toLocaleString('en-US');
  }

  /**
   * Format a date in a consistent way
   */
  protected formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  /**
   * Escape text for markdown
   */
  protected escapeMarkdown(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');
  }

  /**
   * Create a successful result
   */
  protected createResult(
    url: string,
    finalUrl: string,
    content: {
      title: string;
      text: string;
      markdown: string;
      structured?: Record<string, unknown>;
    },
    confidence: 'high' | 'medium' | 'low' = 'high',
    warnings: string[] = []
  ): SiteHandlerResult {
    return {
      content,
      meta: {
        url,
        finalUrl,
        strategy: this.strategy,
        confidence,
      },
      warnings,
    };
  }
}
