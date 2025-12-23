/**
 * Dev.to API Handler
 *
 * Extracts articles from dev.to using the public API.
 * Supports both individual articles and user article lists.
 */

import { logger } from '../../utils/logger.js';
import {
  BaseSiteHandler,
  type FetchFunction,
  type SiteHandlerOptions,
  type SiteHandlerResult,
} from './types.js';

// Routes to exclude from handling (not articles)
const EXCLUDED_ROUTES = [
  't',
  'api',
  'search',
  'top',
  'latest',
  'settings',
  'notifications',
  'reading-list',
];

export class DevToHandler extends BaseSiteHandler {
  readonly name = 'Dev.to';
  readonly strategy = 'api:devto' as const;

  canHandle(url: string): boolean {
    const parsed = this.parseUrl(url);
    if (!parsed) return false;

    const hostname = parsed.hostname.toLowerCase();

    // Match dev.to
    if (hostname === 'dev.to' || hostname === 'www.dev.to') {
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      // Need at least a username (and optionally an article slug)
      // Exclude tag pages (/t/...) and special routes
      if (pathParts.length >= 1 && !EXCLUDED_ROUTES.includes(pathParts[0])) {
        return true;
      }
    }

    return false;
  }

  async extract(
    url: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null> {
    const articleInfo = this.getArticleInfo(url);
    if (!articleInfo) {
      logger.intelligence.debug('Could not extract Dev.to article info from URL');
      return null;
    }

    try {
      let apiUrl: string;
      let isSingleArticle = false;

      if (articleInfo.slug) {
        // Fetch single article by username/slug
        apiUrl = `https://dev.to/api/articles/${articleInfo.username}/${articleInfo.slug}`;
        isSingleArticle = true;
      } else {
        // Fetch articles by username
        apiUrl = `https://dev.to/api/articles?username=${encodeURIComponent(articleInfo.username)}&per_page=10`;
      }

      logger.intelligence.debug(`Trying Dev.to API: ${apiUrl}`);

      const response = await fetch(apiUrl, {
        ...opts,
        headers: {
          ...opts.headers,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        logger.intelligence.debug(`Dev.to API returned ${response.status} for ${url}`);
        return null;
      }

      const data = await response.json();

      let formatted: { title: string; text: string; markdown: string };
      let structured: Record<string, unknown>;

      if (isSingleArticle) {
        const article = data as Record<string, unknown>;
        if (!article.title) {
          logger.intelligence.debug('Dev.to API returned invalid article data');
          return null;
        }
        formatted = this.formatArticle(article);
        structured = article;
      } else {
        const articles = data as Array<Record<string, unknown>>;
        if (!Array.isArray(articles) || articles.length === 0) {
          logger.intelligence.debug('Dev.to API returned no articles for user');
          return null;
        }
        formatted = this.formatArticleList(articleInfo.username, articles);
        structured = { articles, username: articleInfo.username };
      }

      if (formatted.text.length < (opts.minContentLength || 100)) {
        logger.intelligence.debug(`Dev.to content too short: ${formatted.text.length}`);
        return null;
      }

      logger.intelligence.info(`Dev.to API extraction successful`, {
        url,
        contentLength: formatted.text.length,
        isSingleArticle,
      });

      return this.createResult(
        url,
        apiUrl,
        {
          title: formatted.title,
          text: formatted.text,
          markdown: formatted.markdown,
          structured,
        },
        'high'
      );
    } catch (error) {
      logger.intelligence.debug(`Dev.to API failed: ${error}`);
      return null;
    }
  }

  /**
   * Extract article info from Dev.to URL
   * Returns { username, slug } for article URLs or { username } for profile URLs
   */
  private getArticleInfo(url: string): { username: string; slug?: string } | null {
    const parsed = this.parseUrl(url);
    if (!parsed) return null;

    const pathParts = parsed.pathname.split('/').filter(Boolean);

    if (pathParts.length >= 1) {
      const username = pathParts[0];
      const slug = pathParts.length >= 2 ? pathParts[1] : undefined;
      return { username, slug };
    }

    return null;
  }

  /**
   * Convert HTML to plain text
   */
  private htmlToPlainText(html: string): string {
    // Remove script and style tags
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Replace common block elements with newlines
    text = text.replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, '\n');
    text = text.replace(/<(br|hr)\s*\/?>/gi, '\n');

    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode HTML entities
    text = text.replace(/&nbsp;/gi, ' ');
    text = text.replace(/&amp;/gi, '&');
    text = text.replace(/&lt;/gi, '<');
    text = text.replace(/&gt;/gi, '>');
    text = text.replace(/&quot;/gi, '"');
    text = text.replace(/&#39;/gi, "'");

    // Normalize whitespace
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
    text = text.trim();

    return text;
  }

  /**
   * Format a single Dev.to article for output
   */
  private formatArticle(article: Record<string, unknown>): {
    title: string;
    text: string;
    markdown: string;
  } {
    const title = (article.title as string) || 'Untitled';
    const description = (article.description as string) || '';
    const bodyHtml = (article.body_html as string) || '';
    const bodyMarkdown = (article.body_markdown as string) || '';
    const user = article.user as Record<string, unknown> | undefined;
    const username =
      (user?.username as string) || (article.username as string) || 'unknown';
    const readingTime = article.reading_time_minutes as number;
    const publishedAt =
      (article.published_at as string) ||
      (article.readable_publish_date as string) ||
      '';
    const tags = (article.tag_list as string[]) || (article.tags as string[]) || [];
    const reactionsCount =
      (article.positive_reactions_count as number) ||
      (article.public_reactions_count as number) ||
      0;
    const commentsCount = (article.comments_count as number) || 0;
    const coverImage =
      (article.cover_image as string) || (article.social_image as string) || '';
    const articleUrl =
      (article.url as string) || (article.canonical_url as string) || '';

    // Build plain text
    const lines: string[] = [];
    lines.push(`${title}`);
    lines.push(`By @${username}`);
    if (publishedAt) lines.push(`Published: ${publishedAt}`);
    if (readingTime) lines.push(`Reading time: ${readingTime} min`);
    if (tags.length > 0) lines.push(`Tags: ${tags.join(', ')}`);
    lines.push(`Reactions: ${reactionsCount} | Comments: ${commentsCount}`);
    lines.push('');

    if (description) {
      lines.push(description);
      lines.push('');
    }

    // Convert HTML to plain text if we have it, otherwise use markdown
    if (bodyHtml) {
      const plainText = this.htmlToPlainText(bodyHtml);
      lines.push(plainText);
    } else if (bodyMarkdown) {
      lines.push(bodyMarkdown);
    }

    // Build markdown
    const markdownLines: string[] = [];
    markdownLines.push(`# ${title}`);
    markdownLines.push('');
    markdownLines.push(`> ${description || 'No description'}`);
    markdownLines.push('');
    markdownLines.push(`**Author:** [@${username}](https://dev.to/${username})`);
    if (publishedAt) markdownLines.push(`**Published:** ${publishedAt}`);
    if (readingTime) markdownLines.push(`**Reading time:** ${readingTime} min`);
    markdownLines.push(
      `**Reactions:** ${reactionsCount} | **Comments:** ${commentsCount}`
    );
    markdownLines.push('');

    if (tags.length > 0) {
      markdownLines.push('## Tags');
      markdownLines.push(tags.map((t) => `\`#${t}\``).join(' '));
      markdownLines.push('');
    }

    if (coverImage) {
      markdownLines.push(`![Cover](${coverImage})`);
      markdownLines.push('');
    }

    if (articleUrl) {
      markdownLines.push(`[Read on Dev.to](${articleUrl})`);
      markdownLines.push('');
    }

    // Add the article body
    if (bodyMarkdown) {
      markdownLines.push('---');
      markdownLines.push('');
      markdownLines.push(bodyMarkdown);
    } else if (bodyHtml) {
      markdownLines.push('---');
      markdownLines.push('');
      // Convert HTML to markdown (simplified)
      markdownLines.push(this.htmlToPlainText(bodyHtml));
    }

    return {
      title: `${title} - DEV Community`,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }

  /**
   * Format a list of Dev.to articles for output
   */
  private formatArticleList(
    username: string,
    articles: Array<Record<string, unknown>>
  ): { title: string; text: string; markdown: string } {
    const lines: string[] = [];
    lines.push(`Articles by @${username}`);
    lines.push(`Total: ${articles.length} articles`);
    lines.push('');

    for (const article of articles) {
      const title = (article.title as string) || 'Untitled';
      const description = (article.description as string) || '';
      const readingTime = article.reading_time_minutes as number;
      const publishedAt = (article.readable_publish_date as string) || '';
      const tags = (article.tag_list as string[]) || [];
      const reactionsCount = (article.positive_reactions_count as number) || 0;
      const commentsCount = (article.comments_count as number) || 0;

      lines.push(`- ${title}`);
      if (publishedAt) lines.push(`  Published: ${publishedAt}`);
      if (readingTime) lines.push(`  ${readingTime} min read`);
      if (tags.length > 0) lines.push(`  Tags: ${tags.slice(0, 3).join(', ')}`);
      lines.push(`  Reactions: ${reactionsCount} | Comments: ${commentsCount}`);
      if (description) lines.push(`  ${description.substring(0, 150)}...`);
      lines.push('');
    }

    const markdownLines: string[] = [];
    markdownLines.push(`# Articles by @${username}`);
    markdownLines.push('');
    markdownLines.push(`*${articles.length} articles*`);
    markdownLines.push('');

    for (const article of articles) {
      const title = (article.title as string) || 'Untitled';
      const description = (article.description as string) || '';
      const slug = (article.slug as string) || '';
      const readingTime = article.reading_time_minutes as number;
      const publishedAt = (article.readable_publish_date as string) || '';
      const tags = (article.tag_list as string[]) || [];
      const reactionsCount = (article.positive_reactions_count as number) || 0;
      const commentsCount = (article.comments_count as number) || 0;

      const articleUrl = slug ? `https://dev.to/${username}/${slug}` : '';
      markdownLines.push(`## [${title}](${articleUrl})`);
      markdownLines.push('');
      if (description) markdownLines.push(`> ${description}`);
      markdownLines.push('');
      const meta: string[] = [];
      if (publishedAt) meta.push(`**Published:** ${publishedAt}`);
      if (readingTime) meta.push(`**${readingTime} min read**`);
      meta.push(`${reactionsCount} reactions`);
      meta.push(`${commentsCount} comments`);
      markdownLines.push(meta.join(' | '));
      if (tags.length > 0) {
        markdownLines.push('');
        markdownLines.push(tags.map((t) => `\`#${t}\``).join(' '));
      }
      markdownLines.push('');
      markdownLines.push('---');
      markdownLines.push('');
    }

    return {
      title: `@${username} - DEV Community`,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }
}

// Export singleton for convenience
export const devtoHandler = new DevToHandler();
