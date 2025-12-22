/**
 * HackerNews Site Handler
 *
 * Extracts content from HackerNews using the Firebase API.
 * Supports individual items (stories, comments) and the front page (top stories).
 */

import { BaseSiteHandler, type FetchFunction, type SiteHandlerOptions, type SiteHandlerResult } from './types.js';
import { logger } from '../../utils/logger.js';

const log = logger.intelligence;

const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';

export class HackerNewsHandler extends BaseSiteHandler {
  readonly name = 'HackerNews';
  readonly strategy = 'api:hackernews' as const;

  canHandle(url: string): boolean {
    const parsed = this.parseUrl(url);
    if (!parsed) return false;
    return parsed.hostname === 'news.ycombinator.com';
  }

  async extract(
    url: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null> {
    try {
      // Check if this is an item page
      const itemId = this.getItemId(url);

      if (itemId) {
        return await this.extractItem(url, itemId, fetch, opts);
      } else {
        return await this.extractTopStories(url, fetch, opts);
      }
    } catch (error) {
      log.debug(`HackerNews API failed: ${error}`);
      return null;
    }
  }

  /**
   * Extract a single item (story, comment, etc.)
   */
  private async extractItem(
    url: string,
    itemId: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null> {
    const apiUrl = `${HN_API_BASE}/item/${itemId}.json`;
    log.debug(`Trying HackerNews item API: ${apiUrl}`);

    const response = await fetch(apiUrl, opts);
    if (!response.ok) {
      log.debug(`HackerNews API returned ${response.status}`);
      return null;
    }

    const item = (await response.json()) as Record<string, unknown>;
    if (!item || !item.id) {
      return null;
    }

    const formatted = this.formatItem(item);

    if (formatted.text.length < (opts.minContentLength || 100)) {
      return null;
    }

    log.info('HackerNews item API extraction successful', {
      itemId,
      contentLength: formatted.text.length,
    });

    return this.createResult(url, apiUrl, {
      title: formatted.title,
      text: formatted.text,
      markdown: formatted.markdown,
      structured: item,
    });
  }

  /**
   * Extract top stories from the front page
   */
  private async extractTopStories(
    url: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null> {
    const topStoriesUrl = `${HN_API_BASE}/topstories.json`;
    log.debug(`Trying HackerNews top stories API: ${topStoriesUrl}`);

    const response = await fetch(topStoriesUrl, opts);
    if (!response.ok) {
      return null;
    }

    const storyIds = (await response.json()) as number[];
    if (!Array.isArray(storyIds) || storyIds.length === 0) {
      return null;
    }

    // Fetch top 20 stories in parallel
    const top20Ids = storyIds.slice(0, 20);
    const storyPromises = top20Ids.map(async (id) => {
      try {
        const storyResponse = await fetch(`${HN_API_BASE}/item/${id}.json`, opts);
        if (storyResponse.ok) {
          return (await storyResponse.json()) as Record<string, unknown>;
        }
      } catch {
        // Skip failed fetches
      }
      return null;
    });

    const stories = (await Promise.all(storyPromises)).filter(Boolean) as Array<
      Record<string, unknown>
    >;

    if (stories.length === 0) {
      return null;
    }

    const formatted = this.formatStories(stories);

    log.info('HackerNews top stories API extraction successful', {
      storiesCount: stories.length,
      contentLength: formatted.text.length,
    });

    return this.createResult(url, topStoriesUrl, {
      title: formatted.title,
      text: formatted.text,
      markdown: formatted.markdown,
      structured: { stories },
    });
  }

  /**
   * Extract item ID from HackerNews URL
   */
  private getItemId(url: string): string | null {
    const parsed = this.parseUrl(url);
    if (!parsed) return null;
    return parsed.searchParams.get('id');
  }

  /**
   * Format HackerNews item data into readable text/markdown
   */
  private formatItem(item: Record<string, unknown>): {
    title: string;
    text: string;
    markdown: string;
  } {
    const lines: string[] = [];
    const markdownLines: string[] = [];

    const title = String(item.title || 'HackerNews Item');
    const author = String(item.by || 'unknown');
    const score = item.score || 0;
    const itemUrl = String(item.url || '');
    const itemText = String(item.text || '');
    const time = item.time ? new Date(Number(item.time) * 1000).toISOString() : '';
    const descendants = item.descendants || 0;
    const type = String(item.type || 'story');

    // Text format
    lines.push(`[${score}] ${title}`);
    lines.push(`by ${author} | ${time}`);
    if (itemUrl) {
      lines.push(`Link: ${itemUrl}`);
    }
    if (itemText) {
      // HN text is HTML, strip basic tags
      const cleanText = itemText
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      lines.push(cleanText);
    }
    if (type === 'story') {
      lines.push(`${descendants} comments`);
    }

    // Markdown format
    markdownLines.push(`# ${title}`);
    markdownLines.push(`**Score:** ${score} | **Author:** ${author} | **Posted:** ${time}`);
    if (itemUrl) {
      markdownLines.push(`[Original Link](${itemUrl})`);
    }
    markdownLines.push('');
    if (itemText) {
      const cleanText = itemText
        .replace(/<p>/g, '\n\n')
        .replace(/<[^>]+>/g, '')
        .trim();
      markdownLines.push(cleanText);
    }
    if (type === 'story') {
      markdownLines.push(`*${descendants} comments*`);
    }

    return {
      title,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }

  /**
   * Format HackerNews front page stories
   */
  private formatStories(stories: Array<Record<string, unknown>>): {
    title: string;
    text: string;
    markdown: string;
  } {
    const lines: string[] = [];
    const markdownLines: string[] = [];

    lines.push('HackerNews Top Stories');
    lines.push('='.repeat(50));
    markdownLines.push('# HackerNews Top Stories');
    markdownLines.push('');

    for (const story of stories) {
      const title = String(story.title || 'Untitled');
      const author = String(story.by || 'unknown');
      const score = story.score || 0;
      const itemUrl = String(story.url || '');
      const descendants = story.descendants || 0;
      const id = story.id;

      // Text format
      lines.push(`[${score}] ${title}`);
      lines.push(`  by ${author} | ${descendants} comments`);
      if (itemUrl) {
        lines.push(`  ${itemUrl}`);
      }
      lines.push('');

      // Markdown format
      markdownLines.push(`## [${title}](https://news.ycombinator.com/item?id=${id})`);
      markdownLines.push(
        `**Score:** ${score} | **Author:** ${author} | **Comments:** ${descendants}`
      );
      if (itemUrl) {
        markdownLines.push(`[Original Link](${itemUrl})`);
      }
      markdownLines.push('---');
      markdownLines.push('');
    }

    return {
      title: 'HackerNews Top Stories',
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }
}

// Export singleton instance
export const hackerNewsHandler = new HackerNewsHandler();
