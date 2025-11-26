/**
 * Content Extractor - Converts HTML to clean markdown with table support
 */

import TurndownService from 'turndown';
import * as cheerio from 'cheerio';

export interface ExtractedTable {
  headers: string[];
  rows: string[][];
  caption?: string;
  id?: string;
}

export interface TableAsJSON {
  data: Record<string, string>[];
  headers: string[];
  caption?: string;
}

export class ContentExtractor {
  private turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
    });

    // Remove elements we don't want
    this.turndown.remove(['script', 'style', 'noscript', 'iframe'] as const);

    // Add table support to turndown
    this.turndown.addRule('tableCell', {
      filter: ['th', 'td'],
      replacement: (content) => {
        return ` ${content.trim().replace(/\|/g, '\\|')} |`;
      },
    });

    this.turndown.addRule('tableRow', {
      filter: 'tr',
      replacement: (content, node) => {
        return `|${content}\n`;
      },
    });

    this.turndown.addRule('table', {
      filter: 'table',
      replacement: (content, node) => {
        const $node = cheerio.load((node as unknown as { outerHTML: string }).outerHTML || '');
        const headerCells = $node('thead th, tr:first-child th').length;

        if (headerCells > 0) {
          // Insert separator row after header
          const lines = content.trim().split('\n');
          if (lines.length > 0) {
            const separator = '|' + ' --- |'.repeat(headerCells);
            lines.splice(1, 0, separator);
            return '\n\n' + lines.join('\n') + '\n\n';
          }
        }
        return '\n\n' + content + '\n\n';
      },
    });
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

  /**
   * Extract all tables from HTML as structured data
   */
  extractTables(html: string): ExtractedTable[] {
    const $ = cheerio.load(html);
    const tables: ExtractedTable[] = [];

    $('table').each((_, tableEl) => {
      const $table = $(tableEl);
      const headers: string[] = [];
      const rows: string[][] = [];

      // Get caption if exists
      const caption = $table.find('caption').text().trim() || undefined;
      const id = $table.attr('id') || undefined;

      // Extract headers from thead or first row
      const $headerRow = $table.find('thead tr').first();
      if ($headerRow.length > 0) {
        $headerRow.find('th, td').each((_, cell) => {
          headers.push($(cell).text().trim());
        });
      } else {
        // Try first row if no thead
        const $firstRow = $table.find('tr').first();
        const $headerCells = $firstRow.find('th');
        if ($headerCells.length > 0) {
          $headerCells.each((_, cell) => {
            headers.push($(cell).text().trim());
          });
        }
      }

      // Extract data rows
      const $bodyRows = $table.find('tbody tr');
      const rowsToProcess = $bodyRows.length > 0 ? $bodyRows : $table.find('tr').slice(headers.length > 0 ? 1 : 0);

      rowsToProcess.each((_, rowEl) => {
        const row: string[] = [];
        $(rowEl).find('td, th').each((_, cell) => {
          row.push($(cell).text().trim());
        });
        if (row.length > 0) {
          rows.push(row);
        }
      });

      // Only include tables with actual content
      if (rows.length > 0 || headers.length > 0) {
        tables.push({ headers, rows, caption, id });
      }
    });

    return tables;
  }

  /**
   * Extract tables as JSON objects (headers become keys)
   */
  extractTablesAsJSON(html: string): TableAsJSON[] {
    const tables = this.extractTables(html);
    const result: TableAsJSON[] = [];

    for (const table of tables) {
      // Skip tables without headers
      if (table.headers.length === 0) {
        continue;
      }

      const data: Record<string, string>[] = [];

      for (const row of table.rows) {
        const obj: Record<string, string> = {};
        for (let i = 0; i < table.headers.length; i++) {
          const key = table.headers[i] || `column_${i}`;
          obj[key] = row[i] || '';
        }
        data.push(obj);
      }

      result.push({
        data,
        headers: table.headers,
        caption: table.caption,
      });
    }

    return result;
  }

  /**
   * Find a specific table by ID, caption, or header content
   */
  findTable(
    html: string,
    criteria: { id?: string; caption?: string; headerContains?: string }
  ): ExtractedTable | undefined {
    const tables = this.extractTables(html);

    return tables.find((table) => {
      if (criteria.id && table.id === criteria.id) {
        return true;
      }
      if (criteria.caption && table.caption?.toLowerCase().includes(criteria.caption.toLowerCase())) {
        return true;
      }
      if (criteria.headerContains) {
        const headerText = table.headers.join(' ').toLowerCase();
        return headerText.includes(criteria.headerContains.toLowerCase());
      }
      return false;
    });
  }

  /**
   * Extract links from HTML with their context
   */
  extractLinks(html: string): { href: string; text: string; context: string }[] {
    const $ = cheerio.load(html);
    const links: { href: string; text: string; context: string }[] = [];

    $('a[href]').each((_, el) => {
      const $el = $(el);
      const href = $el.attr('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
        return;
      }

      const text = $el.text().trim();
      // Get surrounding context (parent text)
      const parent = $el.parent();
      const context = parent.text().trim().substring(0, 200);

      links.push({ href, text, context });
    });

    return links;
  }
}
