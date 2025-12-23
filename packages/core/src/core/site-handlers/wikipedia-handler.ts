/**
 * Wikipedia API Handler
 *
 * Extracts content from Wikipedia articles using the REST API.
 * Supports all language versions of Wikipedia.
 */

import { logger } from '../../utils/logger.js';
import {
  BaseSiteHandler,
  type FetchFunction,
  type SiteHandlerOptions,
  type SiteHandlerResult,
} from './types.js';

export class WikipediaHandler extends BaseSiteHandler {
  readonly name = 'Wikipedia';
  readonly strategy = 'api:wikipedia' as const;

  canHandle(url: string): boolean {
    const parsed = this.parseUrl(url);
    if (!parsed) return false;
    return /^[a-z]{2,3}\.wikipedia\.org$/i.test(parsed.hostname);
  }

  async extract(
    url: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null> {
    const articleTitle = this.getArticleTitle(url);
    if (!articleTitle) {
      return null;
    }

    const apiBase = this.getApiBase(url);
    const encodedTitle = encodeURIComponent(articleTitle);
    const summaryUrl = `${apiBase}/page/summary/${encodedTitle}`;

    logger.intelligence.debug(`Trying Wikipedia API: ${summaryUrl}`);

    try {
      const response = await fetch(summaryUrl, {
        ...opts,
        headers: {
          ...opts.headers,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        logger.intelligence.debug(`Wikipedia API returned ${response.status}`);
        return null;
      }

      const data = (await response.json()) as Record<string, unknown>;

      if (!data.title || !data.extract) {
        return null;
      }

      const title = String(data.title);
      const extract = String(data.extract);
      const description = String(data.description || '');
      const thumbnail =
        (data.thumbnail as Record<string, unknown>)?.source || '';

      // Build formatted output
      const { text, markdown } = this.formatContent(
        title,
        description,
        extract,
        String(thumbnail)
      );

      if (text.length < (opts.minContentLength || 100)) {
        // Try to get full content if summary is too short
        return null;
      }

      logger.intelligence.info(`Wikipedia API extraction successful`, {
        article: title,
        contentLength: text.length,
      });

      return this.createResult(
        url,
        summaryUrl,
        {
          title,
          text,
          markdown,
          structured: data,
        },
        'high'
      );
    } catch (error) {
      logger.intelligence.debug(`Wikipedia API failed: ${error}`);
      return null;
    }
  }

  /**
   * Extract article title from Wikipedia URL
   */
  private getArticleTitle(url: string): string | null {
    const parsed = this.parseUrl(url);
    if (!parsed) return null;

    const match = parsed.pathname.match(/\/wiki\/(.+)/);
    if (match) {
      return decodeURIComponent(match[1].replace(/_/g, ' '));
    }
    return null;
  }

  /**
   * Get Wikipedia API base URL from article URL
   */
  private getApiBase(url: string): string {
    const parsed = this.parseUrl(url);
    if (!parsed) {
      return 'https://en.wikipedia.org/api/rest_v1';
    }
    return `https://${parsed.hostname}/api/rest_v1`;
  }

  /**
   * Format Wikipedia content into text and markdown
   */
  private formatContent(
    title: string,
    description: string,
    extract: string,
    thumbnail: string
  ): { text: string; markdown: string } {
    const lines: string[] = [];
    const markdownLines: string[] = [];

    // Text format
    lines.push(title);
    lines.push('='.repeat(title.length));
    if (description) lines.push(`(${description})`);
    lines.push('');
    lines.push(extract);

    // Markdown format
    markdownLines.push(`# ${title}`);
    if (description) markdownLines.push(`*${description}*`);
    markdownLines.push('');
    if (thumbnail) {
      markdownLines.push(`![${title}](${thumbnail})`);
      markdownLines.push('');
    }
    markdownLines.push(extract);

    return {
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }
}

// Export singleton for convenience
export const wikipediaHandler = new WikipediaHandler();
