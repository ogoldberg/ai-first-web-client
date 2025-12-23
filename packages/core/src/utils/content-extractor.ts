/**
 * Content Extractor - Converts HTML to clean markdown with table support
 * Enhanced with field-level confidence tracking (CX-002)
 */

import TurndownService from 'turndown';
import * as cheerio from 'cheerio';
import {
  type FieldConfidence,
  type ExtractionSource,
  createFieldConfidence,
  aggregateConfidence,
  SOURCE_CONFIDENCE_SCORES,
} from '../types/field-confidence.js';
import {
  type SelectorAttempt,
  type TitleAttempt,
  type SelectorSource,
  type TitleSource,
} from '../types/decision-trace.js';

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

/**
 * Title extraction metadata for confidence tracking
 */
export interface TitleExtraction {
  title: string;
  source: 'title_tag' | 'h1' | 'og_title' | 'unknown';
  confidence: FieldConfidence;
}

/**
 * Content extraction metadata for confidence tracking
 */
export interface ContentExtraction {
  markdown: string;
  text: string;
  source: 'main' | 'article' | 'role_main' | 'content_class' | 'body_fallback';
  selector: string;
  confidence: FieldConfidence;
}

/**
 * Enhanced extraction result with confidence tracking (CX-002)
 */
export interface ExtractionResultWithConfidence {
  markdown: string;
  text: string;
  title: string;
  confidence: {
    title: FieldConfidence;
    content: FieldConfidence;
    overall: FieldConfidence;
  };
  metadata: {
    titleSource: TitleExtraction['source'];
    contentSource: ContentExtraction['source'];
    contentSelector: string;
  };
}

/**
 * Enhanced extraction result with decision trace (CX-003)
 */
export interface ExtractionResultWithTrace extends ExtractionResultWithConfidence {
  trace: {
    titleAttempts: TitleAttempt[];
    selectorAttempts: SelectorAttempt[];
  };
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
   * Extract clean content with field-level confidence tracking (CX-002)
   * Returns enhanced result with per-field confidence scores
   */
  extractWithConfidence(html: string, url: string): ExtractionResultWithConfidence {
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $('script, style, noscript, iframe, svg, nav, footer, aside, .ads, .advertisement, #cookie-banner').remove();

    // Extract title with confidence tracking
    const titleExtraction = this.extractTitleWithConfidence($);

    // Extract main content with confidence tracking
    const contentExtraction = this.extractContentWithConfidence($, url);

    // Compute overall confidence
    const overall = aggregateConfidence(
      [titleExtraction.confidence, contentExtraction.confidence],
      [0.3, 0.7] // Content weighted higher than title
    );

    return {
      markdown: contentExtraction.markdown,
      text: contentExtraction.text,
      title: titleExtraction.title,
      confidence: {
        title: titleExtraction.confidence,
        content: contentExtraction.confidence,
        overall,
      },
      metadata: {
        titleSource: titleExtraction.source,
        contentSource: contentExtraction.source,
        contentSelector: contentExtraction.selector,
      },
    };
  }

  /**
   * Extract clean content with decision trace (CX-003)
   * Returns enhanced result with per-field confidence and decision trace
   */
  extractWithTrace(html: string, url: string): ExtractionResultWithTrace {
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $('script, style, noscript, iframe, svg, nav, footer, aside, .ads, .advertisement, #cookie-banner').remove();

    // Extract title with trace
    const titleResult = this.extractTitleWithTrace($);

    // Extract content with trace
    const contentResult = this.extractContentWithTrace($, url);

    // Compute overall confidence
    const overall = aggregateConfidence(
      [titleResult.extraction.confidence, contentResult.extraction.confidence],
      [0.3, 0.7] // Content weighted higher than title
    );

    return {
      markdown: contentResult.extraction.markdown,
      text: contentResult.extraction.text,
      title: titleResult.extraction.title,
      confidence: {
        title: titleResult.extraction.confidence,
        content: contentResult.extraction.confidence,
        overall,
      },
      metadata: {
        titleSource: titleResult.extraction.source,
        contentSource: contentResult.extraction.source,
        contentSelector: contentResult.extraction.selector,
      },
      trace: {
        titleAttempts: titleResult.attempts,
        selectorAttempts: contentResult.attempts,
      },
    };
  }

  /**
   * Extract title with trace of all attempts (CX-003)
   */
  private extractTitleWithTrace($: cheerio.CheerioAPI): {
    extraction: TitleExtraction;
    attempts: TitleAttempt[];
  } {
    const attempts: TitleAttempt[] = [];

    // Define title sources to try in order
    const titleSources: Array<{
      source: TitleSource;
      selector: string;
      getValue: () => string | undefined;
      confidenceScore: number;
    }> = [
      {
        source: 'og_title',
        selector: 'meta[property="og:title"]',
        getValue: () => $('meta[property="og:title"]').attr('content'),
        confidenceScore: SOURCE_CONFIDENCE_SCORES.structured_data,
      },
      {
        source: 'title_tag',
        selector: 'title',
        getValue: () => $('title').text(),
        confidenceScore: 0.85,
      },
      {
        source: 'h1',
        selector: 'h1:first',
        getValue: () => $('h1').first().text(),
        confidenceScore: 0.70,
      },
    ];

    let selectedExtraction: TitleExtraction | null = null;

    for (const { source, selector, getValue, confidenceScore } of titleSources) {
      const value = getValue();
      const found = !!(value && value.trim());

      attempts.push({
        source,
        selector,
        found,
        value: found ? value!.trim() : undefined,
        confidenceScore,
        selected: false, // Will update the selected one below
      });

      if (found && !selectedExtraction) {
        selectedExtraction = {
          title: value!.trim(),
          source,
          confidence: createFieldConfidence(
            confidenceScore,
            source === 'og_title' ? 'structured_data' : source === 'title_tag' ? 'selector_match' : 'heuristic',
            `Title from ${selector}`
          ),
        };
        // Mark this attempt as selected
        attempts[attempts.length - 1].selected = true;
      }
    }

    // Fallback if nothing found
    if (!selectedExtraction) {
      attempts.push({
        source: 'unknown',
        selector: 'none',
        found: false,
        confidenceScore: 0,
        selected: true,
      });

      selectedExtraction = {
        title: '',
        source: 'unknown',
        confidence: createFieldConfidence(0, 'fallback', 'No title element found'),
      };
    }

    return {
      extraction: selectedExtraction,
      attempts,
    };
  }

  /**
   * Extract content with trace of all selector attempts (CX-003)
   */
  private extractContentWithTrace(
    $: cheerio.CheerioAPI,
    url: string
  ): {
    extraction: ContentExtraction;
    attempts: SelectorAttempt[];
  } {
    const attempts: SelectorAttempt[] = [];

    // Content selectors in order of preference
    const contentSelectors: Array<{
      selector: string;
      source: SelectorSource;
      confidenceScore: number;
      extractionSource: ExtractionSource;
    }> = [
      { selector: 'main', source: 'main', confidenceScore: 0.85, extractionSource: 'selector_match' },
      { selector: 'article', source: 'article', confidenceScore: 0.85, extractionSource: 'selector_match' },
      { selector: '[role="main"]', source: 'role_main', confidenceScore: 0.80, extractionSource: 'selector_match' },
      { selector: '.content, #content, .main', source: 'content_class', confidenceScore: 0.70, extractionSource: 'heuristic' },
    ];

    let selectedExtraction: ContentExtraction | null = null;

    for (const { selector, source, confidenceScore, extractionSource } of contentSelectors) {
      const element = $(selector).first();
      const matched = element.length > 0;
      const elementHtml = matched ? element.html() : null;
      const contentLength = elementHtml ? elementHtml.length : 0;

      let skipReason: string | undefined;
      if (!matched) {
        skipReason = 'No elements found';
      } else if (contentLength <= 100) {
        skipReason = `Insufficient content (${contentLength} chars)`;
      }

      attempts.push({
        selector,
        source,
        matched,
        contentLength,
        confidenceScore,
        selected: false, // Will update the selected one below
        skipReason,
      });

      if (matched && contentLength > 100 && !selectedExtraction) {
        const markdown = this.turndown.turndown(elementHtml!);
        const text = element.text().replace(/\s+/g, ' ').trim();

        selectedExtraction = {
          markdown,
          text,
          source,
          selector,
          confidence: createFieldConfidence(
            confidenceScore,
            extractionSource,
            `Content extracted from ${selector} element`
          ),
        };
        // Mark this attempt as selected
        attempts[attempts.length - 1].selected = true;
      }
    }

    // Fallback to body
    if (!selectedExtraction) {
      const bodyHtml = $('body').html() || '';
      const markdown = this.turndown.turndown(bodyHtml);
      const text = $('body').text().replace(/\s+/g, ' ').trim();

      attempts.push({
        selector: 'body',
        source: 'body_fallback',
        matched: true,
        contentLength: bodyHtml.length,
        confidenceScore: SOURCE_CONFIDENCE_SCORES.fallback,
        selected: true,
        skipReason: undefined,
      });

      selectedExtraction = {
        markdown,
        text,
        source: 'body_fallback',
        selector: 'body',
        confidence: createFieldConfidence(
          SOURCE_CONFIDENCE_SCORES.fallback,
          'fallback',
          'Content extracted from body - no semantic container found'
        ),
      };
    }

    return {
      extraction: selectedExtraction,
      attempts,
    };
  }

  /**
   * Extract title with confidence tracking
   */
  private extractTitleWithConfidence($: cheerio.CheerioAPI): TitleExtraction {
    // Try OpenGraph title first (highest confidence for structured data)
    const ogTitle = $('meta[property="og:title"]').attr('content');
    if (ogTitle && ogTitle.trim()) {
      return {
        title: ogTitle.trim(),
        source: 'og_title',
        confidence: createFieldConfidence(
          SOURCE_CONFIDENCE_SCORES.structured_data,
          'structured_data',
          'OpenGraph title from meta tag'
        ),
      };
    }

    // Try <title> tag
    const titleTag = $('title').text();
    if (titleTag && titleTag.trim()) {
      return {
        title: titleTag.trim(),
        source: 'title_tag',
        confidence: createFieldConfidence(
          0.85, // High confidence - standard HTML element
          'selector_match',
          'Title from <title> element'
        ),
      };
    }

    // Try first h1
    const h1 = $('h1').first().text();
    if (h1 && h1.trim()) {
      return {
        title: h1.trim(),
        source: 'h1',
        confidence: createFieldConfidence(
          0.70, // Medium-high - h1 is usually the title
          'heuristic',
          'Title inferred from first <h1> element'
        ),
      };
    }

    // Fallback - no title found
    return {
      title: '',
      source: 'unknown',
      confidence: createFieldConfidence(
        0.0,
        'fallback',
        'No title element found'
      ),
    };
  }

  /**
   * Extract main content with confidence tracking
   */
  private extractContentWithConfidence(
    $: cheerio.CheerioAPI,
    url: string
  ): ContentExtraction {
    // Content selectors in order of preference with confidence scores
    const contentSelectors: Array<{
      selector: string;
      source: ContentExtraction['source'];
      confidenceScore: number;
      extractionSource: ExtractionSource;
    }> = [
      { selector: 'main', source: 'main', confidenceScore: 0.85, extractionSource: 'selector_match' },
      { selector: 'article', source: 'article', confidenceScore: 0.85, extractionSource: 'selector_match' },
      { selector: '[role="main"]', source: 'role_main', confidenceScore: 0.80, extractionSource: 'selector_match' },
      { selector: '.content, #content, .main', source: 'content_class', confidenceScore: 0.70, extractionSource: 'heuristic' },
    ];

    for (const { selector, source, confidenceScore, extractionSource } of contentSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        const elementHtml = element.html();
        if (elementHtml && elementHtml.length > 100) {
          const markdown = this.turndown.turndown(elementHtml);
          const text = element.text().replace(/\s+/g, ' ').trim();

          return {
            markdown,
            text,
            source,
            selector,
            confidence: createFieldConfidence(
              confidenceScore,
              extractionSource,
              `Content extracted from ${selector} element`
            ),
          };
        }
      }
    }

    // Fallback to body
    const bodyHtml = $('body').html() || '';
    const markdown = this.turndown.turndown(bodyHtml);
    const text = $('body').text().replace(/\s+/g, ' ').trim();

    return {
      markdown,
      text,
      source: 'body_fallback',
      selector: 'body',
      confidence: createFieldConfidence(
        SOURCE_CONFIDENCE_SCORES.fallback,
        'fallback',
        'Content extracted from body - no semantic container found'
      ),
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
