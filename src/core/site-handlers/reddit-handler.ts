/**
 * Reddit Site Handler
 *
 * Extracts content from Reddit using old.reddit.com HTML parsing.
 * The JSON API now requires authentication, so we use HTML as primary method.
 * Supports subreddit listings and post details with comments.
 *
 * @updated 2026-01-02 - Switched from JSON API (now blocked) to HTML parsing
 */

import * as cheerio from 'cheerio';
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
    // Use old.reddit.com for HTML parsing (JSON API now requires auth)
    const oldRedditUrl = this.getOldRedditUrl(url);
    log.debug(`Trying Reddit HTML extraction: ${oldRedditUrl}`);

    try {
      const response = await fetch(oldRedditUrl, {
        ...opts,
        headers: {
          ...opts.headers,
          'Accept': 'text/html',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok) {
        log.debug(`Reddit HTML returned ${response.status}`);
        return null;
      }

      const html = await response.text();

      // Check if we got blocked
      if (html.includes('whoa there, pardner!') || html.includes('Your request has been blocked')) {
        log.debug('Reddit blocked the request');
        return null;
      }

      const formatted = this.parseHtml(html, url);

      if (formatted.text.length < (opts.minContentLength || 100)) {
        log.debug(`Reddit content too short: ${formatted.text.length}`);
        return null;
      }

      log.info('Reddit HTML extraction successful', {
        url: oldRedditUrl,
        contentLength: formatted.text.length,
        postCount: formatted.postCount,
      });

      return this.createResult(url, oldRedditUrl, {
        title: formatted.title,
        text: formatted.text,
        markdown: formatted.markdown,
        structured: formatted.structured as Record<string, unknown>,
      });
    } catch (error) {
      log.debug(`Reddit HTML extraction failed: ${error}`);
      return null;
    }
  }

  /**
   * Convert any Reddit URL to old.reddit.com URL
   */
  private getOldRedditUrl(url: string): string {
    const parsed = new URL(url);
    // Replace www.reddit.com with old.reddit.com
    const hostname = parsed.hostname.replace(/^(www\.)?reddit\.com$/, 'old.reddit.com');
    return `https://${hostname}${parsed.pathname}${parsed.search}`;
  }

  /**
   * Parse old.reddit.com HTML to extract posts/comments
   */
  private parseHtml(html: string, originalUrl: string): {
    title: string;
    text: string;
    markdown: string;
    structured: unknown;
    postCount: number;
  } {
    const $ = cheerio.load(html);
    const lines: string[] = [];
    const markdownLines: string[] = [];
    const posts: Array<Record<string, unknown>> = [];

    // Extract subreddit name from URL or page
    const subredditMatch = originalUrl.match(/\/r\/([^/?]+)/);
    const subreddit = subredditMatch ? subredditMatch[1] : '';
    const title = subreddit ? `r/${subreddit} - Reddit` : 'Reddit';

    // Check if this is a post detail page or subreddit listing
    const isPostPage = /\/comments\//.test(originalUrl);

    if (isPostPage) {
      // Single post with comments
      const postTitle = $('a.title.may-blank').first().text().trim();
      const postAuthor = $('a.author').first().text().trim();
      const postScore = $('div.score.unvoted').first().text().trim();
      const postBody = $('div.usertext-body').first().text().trim();

      lines.push(postTitle || 'Reddit Post');
      lines.push(`by u/${postAuthor} | Score: ${postScore}`);
      if (postBody) {
        lines.push('');
        lines.push(postBody);
      }
      lines.push('');
      lines.push('--- Comments ---');

      markdownLines.push(`# ${postTitle || 'Reddit Post'}`);
      markdownLines.push(`**Author:** u/${postAuthor} | **Score:** ${postScore}`);
      if (postBody) {
        markdownLines.push('');
        markdownLines.push(postBody);
      }
      markdownLines.push('');
      markdownLines.push('## Comments');
      markdownLines.push('');

      // Extract comments
      $('div.comment').slice(0, 15).each((_, elem) => {
        const $comment = $(elem);
        const author = $comment.find('a.author').first().text().trim();
        const score = $comment.find('span.score.unvoted').first().text().trim();
        const body = $comment.find('div.usertext-body').first().text().trim();

        if (author && body) {
          lines.push(`[${score}] u/${author}:`);
          lines.push(`  ${body.substring(0, 300)}${body.length > 300 ? '...' : ''}`);
          lines.push('');

          markdownLines.push(`**u/${author}** (${score})`);
          markdownLines.push(body.substring(0, 500) + (body.length > 500 ? '...' : ''));
          markdownLines.push('');
        }
      });

      posts.push({
        title: postTitle,
        author: postAuthor,
        score: postScore,
        body: postBody,
        type: 'post_detail',
      });
    } else {
      // Subreddit listing
      markdownLines.push(`# ${title}`);
      markdownLines.push('');

      $('div.thing.link:not(.promoted)').slice(0, 25).each((_, elem) => {
        const $post = $(elem);
        const postTitle = $post.find('a.title').text().trim();
        const author = $post.find('a.author').text().trim();
        const score = $post.find('div.score.unvoted').text().trim() || '0';
        const comments = $post.find('a.bylink.comments').text().trim();
        const externalUrl = $post.attr('data-url') || '';

        if (postTitle) {
          // Text format
          lines.push(`[${score}] ${postTitle}`);
          lines.push(`  by u/${author} | ${comments}`);
          if (externalUrl && !externalUrl.includes('reddit.com')) {
            lines.push(`  Link: ${externalUrl}`);
          }
          lines.push('');

          // Markdown format
          markdownLines.push(`## ${postTitle}`);
          markdownLines.push(`**Score:** ${score} | **Author:** u/${author} | ${comments}`);
          if (externalUrl && !externalUrl.includes('reddit.com')) {
            markdownLines.push(`[External Link](${externalUrl})`);
          }
          markdownLines.push('---');
          markdownLines.push('');

          posts.push({
            title: postTitle,
            author,
            score,
            comments,
            url: externalUrl,
          });
        }
      });
    }

    return {
      title,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
      structured: { subreddit, posts, isPostPage },
      postCount: posts.length,
    };
  }

}


// Export singleton instance
export const redditHandler = new RedditHandler();
