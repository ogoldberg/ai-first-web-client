/**
 * YouTube API Handler
 *
 * Extracts video information from youtube.com using oEmbed API.
 * Enhanced data available with YOUTUBE_API_KEY environment variable.
 */

import { logger } from '../../utils/logger.js';
import {
  BaseSiteHandler,
  type FetchFunction,
  type SiteHandlerOptions,
  type SiteHandlerResult,
} from './types.js';

// YouTube oEmbed API response type
interface YouTubeOEmbedResponse {
  title: string;
  author_name: string;
  author_url: string;
  type: string;
  height: number;
  width: number;
  version: string;
  provider_name: string;
  provider_url: string;
  thumbnail_height: number;
  thumbnail_width: number;
  thumbnail_url: string;
  html: string;
}

// YouTube Data API v3 response type
interface YouTubeDataAPIResponse {
  items?: Array<{
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      channelId?: string;
      channelTitle?: string;
      tags?: string[];
      categoryId?: string;
    };
    statistics?: {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
    };
    contentDetails?: {
      duration?: string;
    };
  }>;
}

// Enhanced YouTube data from Data API v3
interface YouTubeEnhancedData {
  description: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string;
  duration: string;
  tags: string[];
  categoryId: string;
  channelId: string;
  channelTitle: string;
}

// YouTube hostnames for URL detection
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
]);

export class YouTubeHandler extends BaseSiteHandler {
  readonly name = 'YouTube';
  readonly strategy = 'api:youtube' as const;

  canHandle(url: string): boolean {
    const parsed = this.parseUrl(url);
    if (!parsed) return false;

    const hostname = parsed.hostname.toLowerCase();
    if (!YOUTUBE_HOSTS.has(hostname)) {
      return false;
    }

    // Only handle video URLs
    return this.getVideoId(url) !== null;
  }

  async extract(
    url: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null> {
    const videoId = this.getVideoId(url);
    if (!videoId) {
      logger.intelligence.debug('Could not extract YouTube video ID');
      return null;
    }

    // Normalize the URL for oEmbed
    const normalizedUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(normalizedUrl)}&format=json`;
    logger.intelligence.debug(`Trying YouTube oEmbed API: ${oembedUrl}`);

    try {
      // First try oEmbed (no API key required)
      const oembedResult = await this.fetchOEmbed(oembedUrl, fetch, opts);
      if (!oembedResult) {
        return null;
      }

      // Check for enhanced data via YouTube Data API v3
      const apiKey = process.env.YOUTUBE_API_KEY;
      let enhancedData: YouTubeEnhancedData | null = null;

      if (apiKey) {
        enhancedData = await this.fetchDataAPI(videoId, apiKey, fetch, opts);
      }

      // Format the result
      const formatted = this.formatVideoData(oembedResult, enhancedData, videoId);

      if (formatted.text.length < (opts.minContentLength || 50)) {
        logger.intelligence.debug(`YouTube content too short: ${formatted.text.length}`);
        return null;
      }

      logger.intelligence.info('YouTube API extraction successful', {
        videoId,
        title: oembedResult.title,
        author: oembedResult.author_name,
        hasEnhancedData: !!enhancedData,
      });

      return this.createResult(
        url,
        normalizedUrl,
        {
          title: formatted.title,
          text: formatted.text,
          markdown: formatted.markdown,
          structured: formatted.structured,
        },
        enhancedData ? 'high' : 'medium',
        apiKey
          ? []
          : ['YouTube Data API key not configured - using basic oEmbed data']
      );
    } catch (error) {
      logger.intelligence.debug(`YouTube API failed: ${error}`);
      return null;
    }
  }

  /**
   * Extract video ID from YouTube URL
   */
  private getVideoId(url: string): string | null {
    const parsed = this.parseUrl(url);
    if (!parsed) return null;

    const hostname = parsed.hostname.toLowerCase();

    // youtu.be/VIDEO_ID
    if (hostname === 'youtu.be') {
      return parsed.pathname.slice(1).split('/')[0] || null;
    }

    // youtube.com/watch?v=VIDEO_ID
    if (parsed.pathname === '/watch') {
      return parsed.searchParams.get('v');
    }

    // youtube.com/v/VIDEO_ID
    if (parsed.pathname.startsWith('/v/')) {
      return parsed.pathname.slice(3).split('/')[0] || null;
    }

    // youtube.com/embed/VIDEO_ID
    if (parsed.pathname.startsWith('/embed/')) {
      return parsed.pathname.slice(7).split('/')[0] || null;
    }

    // youtube.com/shorts/VIDEO_ID
    if (parsed.pathname.startsWith('/shorts/')) {
      return parsed.pathname.slice(8).split('/')[0] || null;
    }

    return null;
  }

  /**
   * Fetch YouTube oEmbed data
   */
  private async fetchOEmbed(
    oembedUrl: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<YouTubeOEmbedResponse | null> {
    try {
      const response = await fetch(oembedUrl, {
        ...opts,
        headers: {
          ...opts.headers,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        logger.intelligence.debug(`YouTube oEmbed returned ${response.status}`);
        return null;
      }

      const data = (await response.json()) as YouTubeOEmbedResponse;
      return data;
    } catch (error) {
      logger.intelligence.debug(`YouTube oEmbed fetch failed: ${error}`);
      return null;
    }
  }

  /**
   * Fetch enhanced data from YouTube Data API v3
   * Requires YOUTUBE_API_KEY env var
   */
  private async fetchDataAPI(
    videoId: string,
    apiKey: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<YouTubeEnhancedData | null> {
    const apiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${apiKey}&part=snippet,statistics,contentDetails`;

    try {
      const response = await fetch(apiUrl, {
        ...opts,
        headers: {
          ...opts.headers,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        logger.intelligence.debug(`YouTube Data API returned ${response.status}`);
        return null;
      }

      const data = (await response.json()) as YouTubeDataAPIResponse;

      if (!data.items || data.items.length === 0) {
        logger.intelligence.debug('YouTube Data API returned no items');
        return null;
      }

      const item = data.items[0];
      return {
        description: item.snippet?.description || '',
        viewCount: parseInt(item.statistics?.viewCount || '0', 10),
        likeCount: parseInt(item.statistics?.likeCount || '0', 10),
        commentCount: parseInt(item.statistics?.commentCount || '0', 10),
        publishedAt: item.snippet?.publishedAt || '',
        duration: item.contentDetails?.duration || '',
        tags: item.snippet?.tags || [],
        categoryId: item.snippet?.categoryId || '',
        channelId: item.snippet?.channelId || '',
        channelTitle: item.snippet?.channelTitle || '',
      };
    } catch (error) {
      logger.intelligence.debug(`YouTube Data API fetch failed: ${error}`);
      return null;
    }
  }

  /**
   * Format YouTube data into content result
   */
  private formatVideoData(
    oembed: YouTubeOEmbedResponse,
    enhanced: YouTubeEnhancedData | null,
    videoId: string
  ): {
    title: string;
    text: string;
    markdown: string;
    structured: Record<string, unknown>;
  } {
    const lines: string[] = [];
    const markdownLines: string[] = [];

    // Title
    lines.push(`Title: ${oembed.title}`);
    markdownLines.push(`# ${oembed.title}`);
    markdownLines.push('');

    // Author/Channel
    lines.push(`Channel: ${oembed.author_name}`);
    markdownLines.push(
      `**Channel:** [${oembed.author_name}](${oembed.author_url})`
    );
    markdownLines.push('');

    // Enhanced data if available
    if (enhanced) {
      // Description
      if (enhanced.description) {
        lines.push('');
        lines.push('Description:');
        lines.push(enhanced.description);
        markdownLines.push('## Description');
        markdownLines.push('');
        markdownLines.push(enhanced.description);
        markdownLines.push('');
      }

      // Statistics
      lines.push('');
      lines.push(`Views: ${this.formatNumber(enhanced.viewCount)}`);
      lines.push(`Likes: ${this.formatNumber(enhanced.likeCount)}`);
      lines.push(`Comments: ${this.formatNumber(enhanced.commentCount)}`);

      markdownLines.push('## Statistics');
      markdownLines.push('');
      markdownLines.push(
        `- **Views:** ${this.formatNumber(enhanced.viewCount)}`
      );
      markdownLines.push(
        `- **Likes:** ${this.formatNumber(enhanced.likeCount)}`
      );
      markdownLines.push(
        `- **Comments:** ${this.formatNumber(enhanced.commentCount)}`
      );
      markdownLines.push('');

      // Duration
      if (enhanced.duration) {
        const durationStr = this.formatDuration(enhanced.duration);
        lines.push(`Duration: ${durationStr}`);
        markdownLines.push(`- **Duration:** ${durationStr}`);
        markdownLines.push('');
      }

      // Published date
      if (enhanced.publishedAt) {
        const publishDate = new Date(enhanced.publishedAt).toLocaleDateString(
          'en-US',
          { year: 'numeric', month: 'long', day: 'numeric' }
        );
        lines.push(`Published: ${publishDate}`);
        markdownLines.push(`- **Published:** ${publishDate}`);
        markdownLines.push('');
      }

      // Tags
      if (enhanced.tags && enhanced.tags.length > 0) {
        lines.push(`Tags: ${enhanced.tags.join(', ')}`);
        markdownLines.push(`- **Tags:** ${enhanced.tags.join(', ')}`);
        markdownLines.push('');
      }
    }

    // Thumbnail
    if (oembed.thumbnail_url) {
      markdownLines.push('## Thumbnail');
      markdownLines.push('');
      markdownLines.push(`![${oembed.title}](${oembed.thumbnail_url})`);
      markdownLines.push('');
    }

    // Video link
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    markdownLines.push(`[Watch on YouTube](${videoUrl})`);

    // Build structured data
    const structured: Record<string, unknown> = {
      videoId,
      title: oembed.title,
      author: oembed.author_name,
      authorUrl: oembed.author_url,
      thumbnailUrl: oembed.thumbnail_url,
      thumbnailWidth: oembed.thumbnail_width,
      thumbnailHeight: oembed.thumbnail_height,
      providerName: oembed.provider_name,
      type: oembed.type,
    };

    if (enhanced) {
      structured.description = enhanced.description;
      structured.viewCount = enhanced.viewCount;
      structured.likeCount = enhanced.likeCount;
      structured.commentCount = enhanced.commentCount;
      structured.publishedAt = enhanced.publishedAt;
      structured.duration = enhanced.duration;
      structured.tags = enhanced.tags;
      structured.categoryId = enhanced.categoryId;
      structured.channelId = enhanced.channelId;
      structured.channelTitle = enhanced.channelTitle;
    }

    return {
      title: oembed.title,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
      structured,
    };
  }

  /**
   * Convert ISO 8601 duration (PT1H2M3S) to human-readable format
   */
  private formatDuration(isoDuration: string): string {
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return isoDuration;

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(' ');
  }
}

// Export singleton for convenience
export const youtubeHandler = new YouTubeHandler();
