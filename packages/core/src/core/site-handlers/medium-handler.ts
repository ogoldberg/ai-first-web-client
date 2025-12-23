/**
 * Medium API Handler
 *
 * Extracts articles from medium.com using the undocumented JSON API.
 * Supports main domain and subdomains.
 */

import { logger } from '../../utils/logger.js';
import {
  BaseSiteHandler,
  type FetchFunction,
  type SiteHandlerOptions,
  type SiteHandlerResult,
} from './types.js';

export class MediumHandler extends BaseSiteHandler {
  readonly name = 'Medium';
  readonly strategy = 'api:medium' as const;

  canHandle(url: string): boolean {
    const parsed = this.parseUrl(url);
    if (!parsed) return false;

    // Match main medium.com and any subdomain
    if (/^([a-z0-9-]+\.)?medium\.com$/i.test(parsed.hostname)) {
      return this.isArticle(url);
    }

    return false;
  }

  async extract(
    url: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null> {
    const jsonUrl = this.getJsonUrl(url);
    logger.intelligence.debug(`Trying Medium JSON API: ${jsonUrl}`);

    try {
      const response = await fetch(jsonUrl, {
        ...opts,
        headers: {
          ...opts.headers,
          Accept: 'application/json, text/html, */*',
          // Medium checks for common browser user agents
          'User-Agent':
            opts.userAgent ||
            'Mozilla/5.0 (compatible; ContentIntelligence/1.0)',
        },
      });

      if (!response.ok) {
        logger.intelligence.debug(`Medium API returned ${response.status}`);
        return null;
      }

      // Medium returns JSON with a security prefix
      const text = await response.text();

      // Strip the security prefix
      const jsonText = this.stripJsonPrefix(text);

      // Parse JSON
      let data: unknown;
      try {
        data = JSON.parse(jsonText);
      } catch {
        logger.intelligence.debug('Failed to parse Medium JSON response');
        return null;
      }

      // Extract article
      const article = this.extractArticle(data);
      if (!article) {
        logger.intelligence.debug('Could not extract article from Medium response');
        return null;
      }

      const formatted = this.formatArticle(article);

      if (formatted.text.length < (opts.minContentLength || 100)) {
        logger.intelligence.debug(`Medium content too short: ${formatted.text.length}`);
        return null;
      }

      logger.intelligence.info(`Medium API extraction successful`, {
        url: jsonUrl,
        contentLength: formatted.text.length,
        author: article.author,
        claps: article.claps,
      });

      return this.createResult(
        url,
        jsonUrl,
        {
          title: formatted.title,
          text: formatted.text,
          markdown: formatted.markdown,
          structured: formatted.structured,
        },
        'high'
      );
    } catch (error) {
      logger.intelligence.debug(`Medium API failed: ${error}`);
      return null;
    }
  }

  /**
   * Check if URL is a Medium article (has /@username/slug or /p/ or hash pattern)
   */
  private isArticle(url: string): boolean {
    const parsed = this.parseUrl(url);
    if (!parsed) return false;

    const pathname = parsed.pathname;
    // Articles typically have:
    // /@username/title-slug-hexid
    // /p/hexid
    // /title-slug-hexid (at root with hash suffix)
    // Publication paths: /publication-name/title-slug-hexid
    const articlePattern =
      /\/@[^/]+\/[^/]+$|\/p\/[a-f0-9]+$|\/[^/]+-[a-f0-9]+$/i;
    return articlePattern.test(pathname);
  }

  /**
   * Convert Medium URL to JSON API URL by appending ?format=json
   */
  private getJsonUrl(url: string): string {
    const parsed = new URL(url);
    // Remove trailing slash if present
    const path = parsed.pathname.replace(/\/$/, '');
    // Construct the JSON URL
    return `${parsed.origin}${path}?format=json`;
  }

  /**
   * Strip Medium's JSON hijacking protection prefix
   * Medium prepends `])}while(1);</x>` to JSON responses for security
   */
  private stripJsonPrefix(text: string): string {
    // Common prefixes used by Medium
    const prefixes = [
      '])}while(1);</x>',
      'while(1);',
      ")]}',",
      ')]}',
    ];
    for (const prefix of prefixes) {
      if (text.startsWith(prefix)) {
        return text.slice(prefix.length);
      }
    }
    return text;
  }

  /**
   * Extract article data from Medium's JSON response
   */
  private extractArticle(data: unknown): {
    title: string;
    subtitle: string;
    author: string;
    content: string;
    publishedAt: string;
    readingTime: number;
    claps: number;
    structured: Record<string, unknown>;
  } | null {
    try {
      const payload = data as Record<string, unknown>;
      const post = this.findPost(payload);

      if (!post) {
        return null;
      }

      const title = (post.title as string) || '';
      const postContent = post.content as Record<string, unknown> | undefined;
      const subtitle = (postContent?.subtitle as string) || '';
      const publishedAt = post.firstPublishedAt
        ? new Date(post.firstPublishedAt as number).toISOString()
        : '';
      const virtuals = post.virtuals as Record<string, unknown> | undefined;
      const readingTime = Math.ceil((virtuals?.readingTime as number) || 0);
      const claps = (virtuals?.totalClapCount as number) || 0;

      // Extract author info
      const creator = this.findCreator(payload, post.creatorId as string);
      const authorName =
        (creator?.name as string) ||
        (creator?.username as string) ||
        'Unknown Author';

      // Extract content from paragraphs
      const content = this.formatContent(post);

      return {
        title,
        subtitle,
        author: authorName,
        content,
        publishedAt,
        readingTime,
        claps,
        structured: post as Record<string, unknown>,
      };
    } catch (error) {
      logger.intelligence.debug(`Failed to extract Medium article: ${error}`);
      return null;
    }
  }

  /**
   * Find the main post object in Medium's JSON response
   */
  private findPost(
    payload: Record<string, unknown>
  ): Record<string, unknown> | null {
    // Medium's response structure: { payload: { value: { ... } } } or { payload: { references: { Post: { ... } } } }
    const payloadData = payload.payload as Record<string, unknown> | undefined;
    if (!payloadData) {
      return null;
    }

    // Try direct value
    if (payloadData.value && typeof payloadData.value === 'object') {
      return payloadData.value as Record<string, unknown>;
    }

    // Try references
    const references = payloadData.references as
      | Record<string, unknown>
      | undefined;
    if (references?.Post && typeof references.Post === 'object') {
      const posts = references.Post as Record<string, Record<string, unknown>>;
      const postIds = Object.keys(posts);
      if (postIds.length > 0) {
        return posts[postIds[0]];
      }
    }

    return null;
  }

  /**
   * Find creator (author) info in Medium's JSON response
   */
  private findCreator(
    payload: Record<string, unknown>,
    creatorId: string
  ): Record<string, unknown> | null {
    const payloadData = payload.payload as Record<string, unknown> | undefined;
    if (!payloadData) {
      return null;
    }

    const references = payloadData.references as
      | Record<string, unknown>
      | undefined;
    if (references?.User && typeof references.User === 'object') {
      const users = references.User as Record<string, Record<string, unknown>>;
      return users[creatorId] || null;
    }

    return null;
  }

  /**
   * Format Medium article content from paragraph data
   */
  private formatContent(post: Record<string, unknown>): string {
    const lines: string[] = [];
    const content = post.content as Record<string, unknown> | undefined;

    if (!content?.bodyModel) {
      return '';
    }

    const bodyModel = content.bodyModel as Record<string, unknown>;
    const paragraphs = bodyModel.paragraphs as
      | Array<Record<string, unknown>>
      | undefined;

    if (!paragraphs) {
      return '';
    }

    for (const paragraph of paragraphs) {
      const type = paragraph.type as number;
      const text = (paragraph.text as string) || '';

      // Skip empty paragraphs
      if (!text.trim()) {
        continue;
      }

      // Medium paragraph types:
      // 1 = Normal text
      // 3 = H3 header
      // 4 = Image (skip)
      // 6 = Blockquote
      // 7 = Pull quote
      // 8 = Code block
      // 9 = Bulleted list item
      // 10 = Ordered list item
      // 11 = Preformatted text
      // 13 = H4 header

      switch (type) {
        case 3: // H3
          lines.push(`## ${text}`);
          break;
        case 13: // H4
          lines.push(`### ${text}`);
          break;
        case 6: // Blockquote
        case 7: // Pull quote
          lines.push(`> ${text}`);
          break;
        case 8: // Code block
        case 11: // Preformatted
          lines.push('```');
          lines.push(text);
          lines.push('```');
          break;
        case 9: // Bulleted list
          lines.push(`- ${text}`);
          break;
        case 10: // Ordered list
          lines.push(`1. ${text}`);
          break;
        case 4: // Image
          // Skip images, just add caption if present
          if (text) {
            lines.push(`*${text}*`);
          }
          break;
        default:
          lines.push(text);
      }
      lines.push('');
    }

    return lines.join('\n').trim();
  }

  /**
   * Format Medium article data for output
   */
  private formatArticle(article: {
    title: string;
    subtitle: string;
    author: string;
    content: string;
    publishedAt: string;
    readingTime: number;
    claps: number;
    structured: Record<string, unknown>;
  }): {
    title: string;
    text: string;
    markdown: string;
    structured: Record<string, unknown>;
  } {
    const lines: string[] = [];
    const markdownLines: string[] = [];

    // Title
    lines.push(article.title);
    markdownLines.push(`# ${article.title}`);

    // Subtitle
    if (article.subtitle) {
      lines.push(article.subtitle);
      markdownLines.push('');
      markdownLines.push(`*${article.subtitle}*`);
    }

    lines.push('');
    markdownLines.push('');

    // Metadata
    const metaLine = `By ${article.author} | ${article.readingTime} min read | ${article.claps} claps`;
    lines.push(metaLine);
    markdownLines.push(
      `**By ${article.author}** | *${article.readingTime} min read* | ${article.claps} claps`
    );

    if (article.publishedAt) {
      const dateStr = new Date(article.publishedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      lines.push(`Published: ${dateStr}`);
      markdownLines.push(`*Published: ${dateStr}*`);
    }

    lines.push('');
    markdownLines.push('');
    markdownLines.push('---');
    markdownLines.push('');

    // Content
    lines.push(article.content);
    markdownLines.push(article.content);

    return {
      title: article.title,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
      structured: article.structured,
    };
  }
}

// Export singleton for convenience
export const mediumHandler = new MediumHandler();
