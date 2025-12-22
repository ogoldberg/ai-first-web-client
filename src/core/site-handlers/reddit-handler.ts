/**
 * Reddit Site Handler
 *
 * Extracts content from Reddit using their public JSON API.
 * Supports subreddit listings, post details with comments, and old.reddit.com.
 */

import { BaseSiteHandler, type FetchFunction, type SiteHandlerOptions, type SiteHandlerResult } from './types.js';
import { logger } from '../../utils/logger.js';

const log = logger.intelligence;

export class RedditHandler extends BaseSiteHandler {
  readonly name = 'Reddit';
  readonly strategy = 'api:reddit' as const;

  canHandle(url: string): boolean {
    const parsed = this.parseUrl(url);
    if (!parsed) return false;
    return /^(www\.|old\.)?reddit\.com$/i.test(parsed.hostname);
  }

  async extract(
    url: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null> {
    const jsonUrl = this.getJsonUrl(url);
    log.debug(`Trying Reddit JSON API: ${jsonUrl}`);

    try {
      const response = await fetch(jsonUrl, {
        ...opts,
        headers: {
          ...opts.headers,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        log.debug(`Reddit API returned ${response.status}`);
        return null;
      }

      if (!this.isJsonResponse(response)) {
        const contentType = response.headers.get('content-type') || '';
        log.debug(`Reddit API returned non-JSON: ${contentType}`);
        return null;
      }

      const data = await response.json();
      const formatted = this.formatData(data);

      if (formatted.text.length < (opts.minContentLength || 100)) {
        log.debug(`Reddit content too short: ${formatted.text.length}`);
        return null;
      }

      log.info('Reddit API extraction successful', {
        url: jsonUrl,
        contentLength: formatted.text.length,
      });

      return this.createResult(url, jsonUrl, {
        title: formatted.title,
        text: formatted.text,
        markdown: formatted.markdown,
        structured: formatted.structured as Record<string, unknown>,
      });
    } catch (error) {
      log.debug(`Reddit API failed: ${error}`);
      return null;
    }
  }

  /**
   * Convert Reddit URL to JSON API URL
   */
  private getJsonUrl(url: string): string {
    const parsed = new URL(url);
    // Remove trailing slash if present, then add .json
    let path = parsed.pathname.replace(/\/$/, '');
    // Don't double-add .json
    if (!path.endsWith('.json')) {
      path += '.json';
    }
    return `${parsed.origin}${path}${parsed.search}`;
  }

  /**
   * Format Reddit JSON data into readable text/markdown
   */
  private formatData(data: unknown): {
    title: string;
    text: string;
    markdown: string;
    structured: unknown;
  } {
    const lines: string[] = [];
    const markdownLines: string[] = [];
    let title = '';

    // Handle Listing (subreddit posts)
    if (this.isListing(data)) {
      const listing = data as {
        kind: string;
        data: { children: Array<{ kind: string; data: Record<string, unknown> }> };
      };
      title = 'Reddit Posts';

      for (const child of listing.data.children) {
        if (child.kind === 't3') {
          // Post
          const post = child.data;
          const postTitle = String(post.title || '');
          const author = String(post.author || 'unknown');
          const score = post.score || 0;
          const postUrl = String(post.url || '');
          const selftext = String(post.selftext || '');
          const subreddit = String(post.subreddit || '');
          const numComments = post.num_comments || 0;

          // Text format
          lines.push(`[${score}] ${postTitle}`);
          lines.push(`  by u/${author} in r/${subreddit}`);
          if (selftext) {
            lines.push(`  ${selftext.substring(0, 200)}${selftext.length > 200 ? '...' : ''}`);
          }
          if (postUrl && !postUrl.includes('reddit.com')) {
            lines.push(`  Link: ${postUrl}`);
          }
          lines.push(`  ${numComments} comments`);
          lines.push('');

          // Markdown format
          markdownLines.push(`## ${postTitle}`);
          markdownLines.push(
            `**Score:** ${score} | **Author:** u/${author} | **Subreddit:** r/${subreddit}`
          );
          if (selftext) {
            markdownLines.push('');
            markdownLines.push(selftext.substring(0, 500) + (selftext.length > 500 ? '...' : ''));
          }
          if (postUrl && !postUrl.includes('reddit.com')) {
            markdownLines.push(`[External Link](${postUrl})`);
          }
          markdownLines.push(`*${numComments} comments*`);
          markdownLines.push('---');
          markdownLines.push('');
        }
      }
    }
    // Handle post detail (array with post and comments)
    else if (Array.isArray(data) && data.length >= 1) {
      const postListing = data[0] as {
        data?: { children?: Array<{ data?: Record<string, unknown> }> };
      };
      if (postListing?.data?.children?.[0]?.data) {
        const post = postListing.data.children[0].data;
        title = String(post.title || 'Reddit Post');
        const author = String(post.author || 'unknown');
        const score = post.score || 0;
        const selftext = String(post.selftext || '');
        const subreddit = String(post.subreddit || '');

        lines.push(title);
        lines.push(`by u/${author} in r/${subreddit} | Score: ${score}`);
        lines.push('');
        if (selftext) {
          lines.push(selftext);
          lines.push('');
        }

        markdownLines.push(`# ${title}`);
        markdownLines.push(
          `**Author:** u/${author} | **Subreddit:** r/${subreddit} | **Score:** ${score}`
        );
        markdownLines.push('');
        if (selftext) {
          markdownLines.push(selftext);
          markdownLines.push('');
        }

        // Add comments if present
        if (data.length >= 2) {
          const commentsListing = data[1] as {
            data?: { children?: Array<{ kind: string; data?: Record<string, unknown> }> };
          };
          if (commentsListing?.data?.children) {
            lines.push('--- Comments ---');
            markdownLines.push('## Comments');
            markdownLines.push('');

            for (const comment of commentsListing.data.children.slice(0, 10)) {
              if (comment.kind === 't1' && comment.data) {
                const commentAuthor = String(comment.data.author || 'unknown');
                const commentBody = String(comment.data.body || '');
                const commentScore = comment.data.score || 0;

                lines.push(`[${commentScore}] u/${commentAuthor}:`);
                lines.push(
                  `  ${commentBody.substring(0, 300)}${commentBody.length > 300 ? '...' : ''}`
                );
                lines.push('');

                markdownLines.push(`**u/${commentAuthor}** (${commentScore} points)`);
                markdownLines.push(
                  commentBody.substring(0, 500) + (commentBody.length > 500 ? '...' : '')
                );
                markdownLines.push('');
              }
            }
          }
        }
      }
    }

    return {
      title: title || 'Reddit Content',
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
      structured: data,
    };
  }

  /**
   * Check if data is a Reddit Listing
   */
  private isListing(data: unknown): boolean {
    if (typeof data !== 'object' || data === null) return false;
    const obj = data as Record<string, unknown>;
    return obj.kind === 'Listing' && typeof obj.data === 'object' && obj.data !== null;
  }
}

// Export singleton instance
export const redditHandler = new RedditHandler();
