/**
 * Site Handlers Index
 *
 * Central registry for all site-specific API handlers.
 * These handlers extract content from specific websites using their APIs.
 *
 * To add a new handler:
 * 1. Create a new file (e.g., mysite-handler.ts) extending BaseSiteHandler
 * 2. Export a singleton instance
 * 3. Import and add to the handlers array below
 */

// Export types
export type {
  SiteHandler,
  SiteHandlerResult,
  SiteHandlerOptions,
  FetchFunction,
} from './types.js';
export { BaseSiteHandler } from './types.js';

// Import handlers
import { redditHandler } from './reddit-handler.js';
import { hackerNewsHandler } from './hackernews-handler.js';
import { gitHubHandler } from './github-handler.js';
import { wikipediaHandler } from './wikipedia-handler.js';
import { stackOverflowHandler } from './stackoverflow-handler.js';
import { npmHandler } from './npm-handler.js';
import { pypiHandler } from './pypi-handler.js';
import { devtoHandler } from './devto-handler.js';
import { mediumHandler } from './medium-handler.js';
import { youtubeHandler } from './youtube-handler.js';
import { shopifyHandler } from './shopify-handler.js';
import { amazonHandler } from './amazon-handler.js';

// Export individual handlers for direct use
export { redditHandler } from './reddit-handler.js';
export { hackerNewsHandler } from './hackernews-handler.js';
export { gitHubHandler } from './github-handler.js';
export { wikipediaHandler } from './wikipedia-handler.js';
export { stackOverflowHandler } from './stackoverflow-handler.js';
export { npmHandler } from './npm-handler.js';
export { pypiHandler } from './pypi-handler.js';
export { devtoHandler } from './devto-handler.js';
export { mediumHandler } from './medium-handler.js';
export { youtubeHandler } from './youtube-handler.js';
export { shopifyHandler } from './shopify-handler.js';
export { amazonHandler } from './amazon-handler.js';

// Handler classes for custom instantiation
export { RedditHandler } from './reddit-handler.js';
export { HackerNewsHandler } from './hackernews-handler.js';
export { GitHubHandler } from './github-handler.js';
export { WikipediaHandler } from './wikipedia-handler.js';
export { StackOverflowHandler } from './stackoverflow-handler.js';
export { NpmHandler } from './npm-handler.js';
export { PyPIHandler } from './pypi-handler.js';
export { DevToHandler } from './devto-handler.js';
export { MediumHandler } from './medium-handler.js';
export { YouTubeHandler } from './youtube-handler.js';
export { ShopifyHandler } from './shopify-handler.js';
export { AmazonHandler } from './amazon-handler.js';

/**
 * All registered site handlers
 * Order matters: handlers are tried in sequence
 */
export const siteHandlers = [
  redditHandler,
  hackerNewsHandler,
  gitHubHandler,
  wikipediaHandler,
  stackOverflowHandler,
  npmHandler,
  pypiHandler,
  devtoHandler,
  mediumHandler,
  youtubeHandler,
  shopifyHandler,
  amazonHandler,
] as const;

/**
 * Find a handler that can process the given URL
 */
export function findHandler(url: string) {
  return siteHandlers.find((handler) => handler.canHandle(url)) || null;
}

/**
 * Get all handler names (useful for logging/debugging)
 */
export function getHandlerNames(): string[] {
  return siteHandlers.map((h) => h.name);
}
