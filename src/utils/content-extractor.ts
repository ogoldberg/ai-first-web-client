/**
 * Content Extractor - Converts HTML to clean markdown
 */

import TurndownService from 'turndown';
import * as cheerio from 'cheerio';

export class ContentExtractor {
  private turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
    });

    // Remove elements we don't want
    this.turndown.remove(['script', 'style', 'noscript', 'iframe', 'svg']);
  }

  /**
   * Extract clean content from HTML
   */
  extract(html: string, url: string): {
    markdown: string;
    text: string;
    title: string;
  } {
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $('script, style, noscript, iframe, svg, nav, footer, aside, .ads, .advertisement, #cookie-banner').remove();

    // Extract title
    const title = $('title').text() || $('h1').first().text() || '';

    // Get main content - try common content containers
    let mainContent = $('main, article, [role="main"], .content, #content, .main').first();
    if (mainContent.length === 0) {
      mainContent = $('body');
    }

    const cleanHtml = mainContent.html() || '';

    // Convert to markdown
    const markdown = this.turndown.turndown(cleanHtml);

    // Extract plain text
    const text = mainContent.text().replace(/\s+/g, ' ').trim();

    return {
      markdown,
      text,
      title: title.trim(),
    };
  }

  /**
   * Extract structured data from HTML
   */
  extractStructured(html: string, selectors: Record<string, string>): Record<string, any>[] {
    const $ = cheerio.load(html);
    const results: Record<string, any>[] = [];

    // Find the common container for all selectors
    const firstSelector = Object.values(selectors)[0];
    const elements = $(firstSelector).length;

    for (let i = 0; i < elements; i++) {
      const item: Record<string, any> = {};

      for (const [key, selector] of Object.entries(selectors)) {
        const element = $(selector).eq(i);
        item[key] = element.text().trim() || element.attr('href') || element.attr('src');
      }

      results.push(item);
    }

    return results;
  }
}
