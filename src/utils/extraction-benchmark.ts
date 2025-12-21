/**
 * Extraction Quality Benchmarking (O-006)
 *
 * Provides an offline corpus-based regression suite for content extraction and table parsing.
 * Compares actual extraction results against expected results to measure quality.
 */

import { ContentExtractor } from './content-extractor.js';
import { ConfidenceLevel } from '../types/field-confidence.js';
import { logger as loggerFactory } from './logger.js';

const logger = loggerFactory.create('ExtractionBenchmark');

// ============================================
// Types
// ============================================

/**
 * Expected extraction results for a corpus entry
 */
export interface ExpectedExtractionResult {
  /** Expected title text */
  title?: string;
  /** Expected title source (og_title, title_tag, h1, etc.) */
  titleSource?: 'og_title' | 'title_tag' | 'h1' | 'unknown';
  /** Content expectations */
  content?: {
    /** Expected minimum content length */
    minLength?: number;
    /** Expected maximum content length */
    maxLength?: number;
    /** Phrases that must appear in the content */
    mustContain?: string[];
    /** Phrases that must NOT appear (navigation, ads, etc.) */
    mustNotContain?: string[];
    /** Sample text to fuzzy match */
    sampleText?: string;
  };
  /** Expected tables */
  tables?: ExpectedTable[];
  /** Expected confidence levels */
  confidence?: {
    title?: ConfidenceLevel;
    content?: ConfidenceLevel;
    overall?: ConfidenceLevel;
  };
  /** Links expectations */
  links?: {
    minCount?: number;
    mustInclude?: string[];
  };
}

export interface ExpectedTable {
  /** Expected headers (partial match OK) */
  headers?: string[];
  /** Expected row count */
  rowCount?: number;
  /** Expected minimum row count */
  minRowCount?: number;
  /** Sample rows for validation */
  sampleRows?: string[][];
  /** Expected caption */
  caption?: string;
  /** Expected table ID */
  id?: string;
}

/**
 * Corpus entry with HTML and expected results
 */
export interface CorpusEntry {
  /** Unique ID for the entry */
  id: string;
  /** Name/description of the test case */
  name: string;
  /** HTML content to extract from */
  html: string;
  /** URL to use for extraction context */
  url: string;
  /** Expected extraction results */
  expected: ExpectedExtractionResult;
  /** Tags for categorization */
  tags?: string[];
  /** Whether this is an edge case */
  isEdgeCase?: boolean;
}

/**
 * Result of benchmarking a single corpus entry
 */
export interface BenchmarkResult {
  /** Corpus entry ID */
  id: string;
  /** Corpus entry name */
  name: string;
  /** Whether all checks passed */
  passed: boolean;
  /** Detailed metrics */
  metrics: ExtractionMetrics;
  /** List of failures */
  failures: BenchmarkFailure[];
  /** Extraction timing in milliseconds */
  durationMs: number;
}

export interface BenchmarkFailure {
  /** What was being checked */
  check: string;
  /** Expected value */
  expected: unknown;
  /** Actual value */
  actual: unknown;
  /** Severity: error means hard failure, warning means quality issue */
  severity: 'error' | 'warning';
  /** Human-readable message */
  message: string;
}

/**
 * Metrics for extraction quality
 */
export interface ExtractionMetrics {
  /** Title metrics */
  title: {
    exactMatch: boolean;
    fuzzyScore: number;
    sourceMatch: boolean;
    confidenceScore: number;
    confidenceLevel: ConfidenceLevel;
  };
  /** Content metrics */
  content: {
    length: number;
    lengthInRange: boolean;
    containsAllRequired: boolean;
    excludesAllForbidden: boolean;
    fuzzyMatchScore: number;
    confidenceScore: number;
    confidenceLevel: ConfidenceLevel;
  };
  /** Table metrics */
  tables: {
    expectedCount: number;
    actualCount: number;
    matchedTables: number;
    headerAccuracy: number;
    rowCountAccuracy: number;
    sampleRowsMatch: boolean;
  };
  /** Link metrics */
  links: {
    count: number;
    meetsMinimum: boolean;
    includesRequired: boolean;
  };
  /** Overall score (0-100) */
  overallScore: number;
}

/**
 * Aggregate results for a full benchmark run
 */
export interface BenchmarkSummary {
  /** Total entries processed */
  totalEntries: number;
  /** Number that passed all checks */
  passed: number;
  /** Number with at least one failure */
  failed: number;
  /** Pass rate (0-1) */
  passRate: number;
  /** Average overall score */
  averageScore: number;
  /** Average extraction time in ms */
  averageDurationMs: number;
  /** Per-category results */
  byCategory: Record<string, CategorySummary>;
  /** Individual results */
  results: BenchmarkResult[];
  /** Timestamp */
  timestamp: string;
}

export interface CategorySummary {
  total: number;
  passed: number;
  averageScore: number;
}

// ============================================
// ExtractionBenchmark Class
// ============================================

export class ExtractionBenchmark {
  private extractor: ContentExtractor;
  private corpus: CorpusEntry[] = [];

  constructor(extractor?: ContentExtractor) {
    this.extractor = extractor ?? new ContentExtractor();
  }

  /**
   * Add a corpus entry for benchmarking
   */
  addEntry(entry: CorpusEntry): void {
    // Validate entry
    if (!entry.id || !entry.html || !entry.url) {
      throw new Error(`Invalid corpus entry: missing id, html, or url`);
    }
    // Check for duplicate IDs
    if (this.corpus.some(e => e.id === entry.id)) {
      throw new Error(`Duplicate corpus entry ID: ${entry.id}`);
    }
    this.corpus.push(entry);
    logger.debug('Added corpus entry', { id: entry.id, name: entry.name });
  }

  /**
   * Add multiple corpus entries
   */
  addEntries(entries: CorpusEntry[]): void {
    for (const entry of entries) {
      this.addEntry(entry);
    }
  }

  /**
   * Load corpus from a manifest object
   */
  loadCorpus(entries: CorpusEntry[]): void {
    this.corpus = [];
    this.addEntries(entries);
    logger.info('Loaded corpus', { count: entries.length });
  }

  /**
   * Get corpus entry count
   */
  getEntryCount(): number {
    return this.corpus.length;
  }

  /**
   * Get corpus entries (for inspection)
   */
  getEntries(): readonly CorpusEntry[] {
    return this.corpus;
  }

  /**
   * Run benchmark on a single entry
   */
  async benchmarkEntry(entry: CorpusEntry): Promise<BenchmarkResult> {
    const startTime = Date.now();
    const failures: BenchmarkFailure[] = [];

    // Run extraction with confidence
    const result = this.extractor.extractWithConfidence(entry.html, entry.url);
    const tables = this.extractor.extractTables(entry.html);
    const links = this.extractor.extractLinks(entry.html);

    // Calculate metrics
    const metrics = this.calculateMetrics(entry.expected, result, tables, links);

    // Check title
    if (entry.expected.title !== undefined) {
      if (!metrics.title.exactMatch) {
        failures.push({
          check: 'title.exactMatch',
          expected: entry.expected.title,
          actual: result.title,
          severity: metrics.title.fuzzyScore < 0.5 ? 'error' : 'warning',
          message: `Title mismatch: expected "${entry.expected.title}", got "${result.title}"`,
        });
      }
    }

    if (entry.expected.titleSource !== undefined) {
      if (!metrics.title.sourceMatch) {
        failures.push({
          check: 'title.source',
          expected: entry.expected.titleSource,
          actual: result.metadata?.titleSource,
          severity: 'warning',
          message: `Title source mismatch: expected "${entry.expected.titleSource}", got "${result.metadata?.titleSource}"`,
        });
      }
    }

    // Check content
    if (entry.expected.content) {
      const content = entry.expected.content;

      if (!metrics.content.lengthInRange) {
        failures.push({
          check: 'content.length',
          expected: { min: content.minLength, max: content.maxLength },
          actual: metrics.content.length,
          severity: 'error',
          message: `Content length ${metrics.content.length} not in expected range [${content.minLength ?? 0}, ${content.maxLength ?? 'inf'}]`,
        });
      }

      if (!metrics.content.containsAllRequired && content.mustContain) {
        const missing = content.mustContain.filter(
          phrase => !result.text.toLowerCase().includes(phrase.toLowerCase())
        );
        failures.push({
          check: 'content.mustContain',
          expected: content.mustContain,
          actual: missing,
          severity: 'error',
          message: `Content missing required phrases: ${missing.join(', ')}`,
        });
      }

      if (!metrics.content.excludesAllForbidden && content.mustNotContain) {
        const found = content.mustNotContain.filter(phrase =>
          result.text.toLowerCase().includes(phrase.toLowerCase())
        );
        failures.push({
          check: 'content.mustNotContain',
          expected: [],
          actual: found,
          severity: 'error',
          message: `Content contains forbidden phrases: ${found.join(', ')}`,
        });
      }
    }

    // Check tables
    if (entry.expected.tables && entry.expected.tables.length > 0) {
      if (metrics.tables.actualCount < metrics.tables.expectedCount) {
        failures.push({
          check: 'tables.count',
          expected: metrics.tables.expectedCount,
          actual: metrics.tables.actualCount,
          severity: 'error',
          message: `Expected ${metrics.tables.expectedCount} tables, found ${metrics.tables.actualCount}`,
        });
      }

      if (metrics.tables.headerAccuracy < 1.0) {
        failures.push({
          check: 'tables.headers',
          expected: 'all headers match',
          actual: `${Math.round(metrics.tables.headerAccuracy * 100)}% accuracy`,
          severity: metrics.tables.headerAccuracy < 0.5 ? 'error' : 'warning',
          message: `Table header accuracy: ${Math.round(metrics.tables.headerAccuracy * 100)}%`,
        });
      }
    }

    // Check confidence levels
    if (entry.expected.confidence) {
      const conf = entry.expected.confidence;

      if (conf.title && !this.confidenceLevelMatches(metrics.title.confidenceLevel, conf.title)) {
        failures.push({
          check: 'confidence.title',
          expected: conf.title,
          actual: metrics.title.confidenceLevel,
          severity: 'warning',
          message: `Title confidence level mismatch: expected ${conf.title}, got ${metrics.title.confidenceLevel}`,
        });
      }

      if (
        conf.content &&
        !this.confidenceLevelMatches(metrics.content.confidenceLevel, conf.content)
      ) {
        failures.push({
          check: 'confidence.content',
          expected: conf.content,
          actual: metrics.content.confidenceLevel,
          severity: 'warning',
          message: `Content confidence level mismatch: expected ${conf.content}, got ${metrics.content.confidenceLevel}`,
        });
      }
    }

    // Check links
    if (entry.expected.links) {
      if (!metrics.links.meetsMinimum) {
        failures.push({
          check: 'links.count',
          expected: entry.expected.links.minCount,
          actual: metrics.links.count,
          severity: 'warning',
          message: `Expected at least ${entry.expected.links.minCount} links, found ${metrics.links.count}`,
        });
      }

      if (!metrics.links.includesRequired && entry.expected.links.mustInclude) {
        const linkHrefs = links.map(l => l.href);
        const missing = entry.expected.links.mustInclude.filter(
          href => !linkHrefs.some(h => h.includes(href))
        );
        failures.push({
          check: 'links.mustInclude',
          expected: entry.expected.links.mustInclude,
          actual: missing,
          severity: 'warning',
          message: `Missing required links: ${missing.join(', ')}`,
        });
      }
    }

    const durationMs = Date.now() - startTime;
    const errorCount = failures.filter(f => f.severity === 'error').length;

    return {
      id: entry.id,
      name: entry.name,
      passed: errorCount === 0,
      metrics,
      failures,
      durationMs,
    };
  }

  /**
   * Run benchmark on all corpus entries
   */
  async runBenchmark(options?: { tags?: string[] }): Promise<BenchmarkSummary> {
    let entries = this.corpus;

    // Filter by tags if specified
    if (options?.tags && options.tags.length > 0) {
      entries = entries.filter(e => e.tags?.some(t => options.tags!.includes(t)));
    }

    if (entries.length === 0) {
      return {
        totalEntries: 0,
        passed: 0,
        failed: 0,
        passRate: 0,
        averageScore: 0,
        averageDurationMs: 0,
        byCategory: {},
        results: [],
        timestamp: new Date().toISOString(),
      };
    }

    const results: BenchmarkResult[] = [];
    const byCategory: Record<string, { total: number; passed: number; scores: number[] }> = {};

    for (const entry of entries) {
      const result = await this.benchmarkEntry(entry);
      results.push(result);

      // Categorize by tags
      const tags = entry.tags ?? ['uncategorized'];
      for (const tag of tags) {
        if (!byCategory[tag]) {
          byCategory[tag] = { total: 0, passed: 0, scores: [] };
        }
        byCategory[tag].total++;
        if (result.passed) byCategory[tag].passed++;
        byCategory[tag].scores.push(result.metrics.overallScore);
      }
    }

    const passed = results.filter(r => r.passed).length;
    const totalScore = results.reduce((sum, r) => sum + r.metrics.overallScore, 0);
    const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

    return {
      totalEntries: results.length,
      passed,
      failed: results.length - passed,
      passRate: passed / results.length,
      averageScore: totalScore / results.length,
      averageDurationMs: totalDuration / results.length,
      byCategory: Object.fromEntries(
        Object.entries(byCategory).map(([tag, data]) => [
          tag,
          {
            total: data.total,
            passed: data.passed,
            averageScore: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
          },
        ])
      ),
      results,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Calculate metrics comparing actual vs expected results
   */
  private calculateMetrics(
    expected: ExpectedExtractionResult,
    result: ReturnType<ContentExtractor['extractWithConfidence']>,
    tables: ReturnType<ContentExtractor['extractTables']>,
    links: ReturnType<ContentExtractor['extractLinks']>
  ): ExtractionMetrics {
    // Title metrics
    const titleExactMatch = expected.title
      ? result.title.toLowerCase().trim() === expected.title.toLowerCase().trim()
      : true;
    const titleFuzzyScore = expected.title
      ? this.fuzzyMatch(result.title, expected.title)
      : 1.0;
    const titleSourceMatch = expected.titleSource
      ? result.metadata?.titleSource === expected.titleSource
      : true;

    // Content metrics
    const contentLength = result.text.length;
    const lengthInRange =
      (!expected.content?.minLength || contentLength >= expected.content.minLength) &&
      (!expected.content?.maxLength || contentLength <= expected.content.maxLength);
    const containsAllRequired =
      !expected.content?.mustContain ||
      expected.content.mustContain.every(phrase =>
        result.text.toLowerCase().includes(phrase.toLowerCase())
      );
    const excludesAllForbidden =
      !expected.content?.mustNotContain ||
      !expected.content.mustNotContain.some(phrase =>
        result.text.toLowerCase().includes(phrase.toLowerCase())
      );
    const contentFuzzyScore = expected.content?.sampleText
      ? this.fuzzyMatch(result.text, expected.content.sampleText)
      : 1.0;

    // Table metrics
    const expectedTableCount = expected.tables?.length ?? 0;
    const actualTableCount = tables.length;
    let matchedTables = 0;
    let headerAccuracySum = 0;
    let rowCountAccuracySum = 0;
    let sampleRowsMatch = true;

    if (expected.tables) {
      for (const expectedTable of expected.tables) {
        // Find matching table by id, caption, or headers
        const matchingTable = this.findMatchingTable(tables, expectedTable);
        if (matchingTable) {
          matchedTables++;

          // Header accuracy
          if (expectedTable.headers) {
            const headerMatches = expectedTable.headers.filter(h =>
              matchingTable.headers.some(
                actual => actual.toLowerCase().trim() === h.toLowerCase().trim()
              )
            ).length;
            headerAccuracySum += headerMatches / expectedTable.headers.length;
          } else {
            headerAccuracySum += 1.0;
          }

          // Row count accuracy
          if (expectedTable.rowCount !== undefined) {
            rowCountAccuracySum +=
              matchingTable.rows.length === expectedTable.rowCount ? 1.0 : 0.5;
          } else if (expectedTable.minRowCount !== undefined) {
            rowCountAccuracySum +=
              matchingTable.rows.length >= expectedTable.minRowCount ? 1.0 : 0.5;
          } else {
            rowCountAccuracySum += 1.0;
          }

          // Sample rows match
          if (expectedTable.sampleRows) {
            for (const sampleRow of expectedTable.sampleRows) {
              const found = matchingTable.rows.some(actualRow =>
                sampleRow.every((cell, i) =>
                  actualRow[i]?.toLowerCase().trim() === cell.toLowerCase().trim()
                )
              );
              if (!found) sampleRowsMatch = false;
            }
          }
        }
      }
    }

    const headerAccuracy = expectedTableCount > 0 ? headerAccuracySum / expectedTableCount : 1.0;
    const rowCountAccuracy =
      expectedTableCount > 0 ? rowCountAccuracySum / expectedTableCount : 1.0;

    // Link metrics
    const linkCount = links.length;
    const meetsMinimum = !expected.links?.minCount || linkCount >= expected.links.minCount;
    const includesRequired =
      !expected.links?.mustInclude ||
      expected.links.mustInclude.every(href => links.some(l => l.href.includes(href)));

    // Calculate overall score (0-100)
    const scores: number[] = [];

    // Title score (weighted 15%)
    const titleScore = (titleExactMatch ? 1.0 : titleFuzzyScore * 0.5) * (titleSourceMatch ? 1.0 : 0.9);
    scores.push(titleScore * 0.15);

    // Content score (weighted 40%)
    const contentScore =
      (lengthInRange ? 1.0 : 0.5) *
      (containsAllRequired ? 1.0 : 0.3) *
      (excludesAllForbidden ? 1.0 : 0.5) *
      (0.5 + contentFuzzyScore * 0.5);
    scores.push(contentScore * 0.4);

    // Table score (weighted 25%)
    const tableScore =
      expectedTableCount > 0
        ? (matchedTables / expectedTableCount) * headerAccuracy * rowCountAccuracy
        : 1.0;
    scores.push(tableScore * 0.25);

    // Confidence calibration score (weighted 10%)
    const confScore = result.confidence?.overall?.score ?? 0.5;
    scores.push(confScore * 0.1);

    // Link score (weighted 10%)
    const linkScore = (meetsMinimum ? 1.0 : 0.5) * (includesRequired ? 1.0 : 0.5);
    scores.push(linkScore * 0.1);

    const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) * 100);

    return {
      title: {
        exactMatch: titleExactMatch,
        fuzzyScore: titleFuzzyScore,
        sourceMatch: titleSourceMatch,
        confidenceScore: result.confidence?.title?.score ?? 0,
        confidenceLevel: result.confidence?.title?.level ?? 'unknown',
      },
      content: {
        length: contentLength,
        lengthInRange,
        containsAllRequired,
        excludesAllForbidden,
        fuzzyMatchScore: contentFuzzyScore,
        confidenceScore: result.confidence?.content?.score ?? 0,
        confidenceLevel: result.confidence?.content?.level ?? 'unknown',
      },
      tables: {
        expectedCount: expectedTableCount,
        actualCount: actualTableCount,
        matchedTables,
        headerAccuracy,
        rowCountAccuracy,
        sampleRowsMatch,
      },
      links: {
        count: linkCount,
        meetsMinimum,
        includesRequired,
      },
      overallScore,
    };
  }

  /**
   * Simple fuzzy match score (0-1)
   */
  private fuzzyMatch(actual: string, expected: string): number {
    const a = actual.toLowerCase().trim();
    const e = expected.toLowerCase().trim();

    if (a === e) return 1.0;
    if (a.includes(e) || e.includes(a)) return 0.8;

    // Jaccard similarity on words
    const aWords = new Set(a.split(/\s+/).filter(w => w.length > 2));
    const eWords = new Set(e.split(/\s+/).filter(w => w.length > 2));

    if (aWords.size === 0 || eWords.size === 0) return 0.0;

    const intersection = [...aWords].filter(w => eWords.has(w)).length;
    const union = new Set([...aWords, ...eWords]).size;

    return intersection / union;
  }

  /**
   * Find a table matching expected criteria
   */
  private findMatchingTable(
    tables: ReturnType<ContentExtractor['extractTables']>,
    expected: ExpectedTable
  ): (typeof tables)[0] | undefined {
    // Match by ID first
    if (expected.id) {
      const byId = tables.find(t => t.id === expected.id);
      if (byId) return byId;
    }

    // Match by caption
    if (expected.caption) {
      const byCaption = tables.find(
        t => t.caption?.toLowerCase().includes(expected.caption!.toLowerCase())
      );
      if (byCaption) return byCaption;
    }

    // Match by headers
    if (expected.headers && expected.headers.length > 0) {
      const byHeaders = tables.find(t =>
        expected.headers!.some(h => t.headers.some(th => th.toLowerCase().includes(h.toLowerCase())))
      );
      if (byHeaders) return byHeaders;
    }

    // Return first table if no specific criteria
    return tables[0];
  }

  /**
   * Check if actual confidence level meets or exceeds expected
   */
  private confidenceLevelMatches(actual: ConfidenceLevel, expected: ConfidenceLevel): boolean {
    const levels: ConfidenceLevel[] = ['very_low', 'low', 'medium', 'high', 'very_high'];
    const actualIndex = levels.indexOf(actual);
    const expectedIndex = levels.indexOf(expected);
    // Allow actual to be equal or higher than expected
    return actualIndex >= expectedIndex;
  }

  /**
   * Format a benchmark summary as a human-readable report
   */
  formatReport(summary: BenchmarkSummary): string {
    const lines: string[] = [
      '='.repeat(60),
      'EXTRACTION QUALITY BENCHMARK REPORT',
      '='.repeat(60),
      '',
      `Timestamp: ${summary.timestamp}`,
      `Total Entries: ${summary.totalEntries}`,
      `Passed: ${summary.passed} (${Math.round(summary.passRate * 100)}%)`,
      `Failed: ${summary.failed}`,
      `Average Score: ${Math.round(summary.averageScore)}/100`,
      `Average Duration: ${Math.round(summary.averageDurationMs)}ms`,
      '',
      '-'.repeat(60),
      'BY CATEGORY',
      '-'.repeat(60),
    ];

    for (const [tag, data] of Object.entries(summary.byCategory)) {
      lines.push(
        `  ${tag}: ${data.passed}/${data.total} passed, avg score: ${Math.round(data.averageScore)}`
      );
    }

    if (summary.failed > 0) {
      lines.push('');
      lines.push('-'.repeat(60));
      lines.push('FAILURES');
      lines.push('-'.repeat(60));

      for (const result of summary.results.filter(r => !r.passed)) {
        lines.push('');
        lines.push(`[${result.id}] ${result.name}`);
        lines.push(`  Score: ${result.metrics.overallScore}/100`);
        for (const failure of result.failures) {
          const icon = failure.severity === 'error' ? 'X' : '!';
          lines.push(`  [${icon}] ${failure.message}`);
        }
      }
    }

    lines.push('');
    lines.push('='.repeat(60));

    return lines.join('\n');
  }
}

// ============================================
// Built-in Corpus Entries
// ============================================

/**
 * Standard corpus entries for common extraction scenarios
 */
export function getStandardCorpus(): CorpusEntry[] {
  return [
    // Simple article with clear structure
    {
      id: 'simple-article',
      name: 'Simple Article with Title and Main Content',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <title>The Art of Programming</title>
          <meta property="og:title" content="The Art of Programming - A Guide">
        </head>
        <body>
          <nav>Navigation Menu</nav>
          <main>
            <article>
              <h1>The Art of Programming</h1>
              <p>Programming is both an art and a science. It requires creativity, logic, and patience.</p>
              <p>Good programmers write code that is clean, maintainable, and efficient.</p>
              <p>This article explores the fundamental principles of software development.</p>
            </article>
          </main>
          <footer>Footer content</footer>
        </body>
        </html>
      `,
      url: 'https://example.com/articles/programming',
      expected: {
        title: 'The Art of Programming - A Guide',
        titleSource: 'og_title',
        content: {
          minLength: 100,
          mustContain: ['programming', 'art', 'science', 'creativity'],
          mustNotContain: ['navigation', 'footer'],
        },
        confidence: {
          title: 'high',
          content: 'high',
        },
      },
      tags: ['basic', 'article'],
    },

    // Page with tables
    {
      id: 'table-basic',
      name: 'Page with Basic Table',
      html: `
        <!DOCTYPE html>
        <html>
        <head><title>Price List</title></head>
        <body>
          <main>
            <h1>Product Price List</h1>
            <table id="prices">
              <caption>Current Prices</caption>
              <thead>
                <tr><th>Product</th><th>Price</th><th>Stock</th></tr>
              </thead>
              <tbody>
                <tr><td>Widget A</td><td>$10.00</td><td>In Stock</td></tr>
                <tr><td>Widget B</td><td>$15.00</td><td>Low Stock</td></tr>
                <tr><td>Widget C</td><td>$20.00</td><td>Out of Stock</td></tr>
              </tbody>
            </table>
          </main>
        </body>
        </html>
      `,
      url: 'https://example.com/prices',
      expected: {
        title: 'Price List',
        titleSource: 'title_tag',
        tables: [
          {
            id: 'prices',
            caption: 'Current Prices',
            headers: ['Product', 'Price', 'Stock'],
            rowCount: 3,
            sampleRows: [['Widget A', '$10.00', 'In Stock']],
          },
        ],
        confidence: {
          title: 'high',
        },
      },
      tags: ['tables', 'basic'],
    },

    // Page with multiple tables
    {
      id: 'table-multiple',
      name: 'Page with Multiple Tables',
      html: `
        <!DOCTYPE html>
        <html>
        <head><title>Statistics Report</title></head>
        <body>
          <article>
            <h1>Quarterly Statistics</h1>
            <h2>Sales Data</h2>
            <table>
              <thead><tr><th>Month</th><th>Revenue</th></tr></thead>
              <tbody>
                <tr><td>January</td><td>$100,000</td></tr>
                <tr><td>February</td><td>$120,000</td></tr>
              </tbody>
            </table>
            <h2>Customer Data</h2>
            <table>
              <thead><tr><th>Region</th><th>Customers</th></tr></thead>
              <tbody>
                <tr><td>North</td><td>5,000</td></tr>
                <tr><td>South</td><td>3,000</td></tr>
              </tbody>
            </table>
          </article>
        </body>
        </html>
      `,
      url: 'https://example.com/stats',
      expected: {
        title: 'Statistics Report',
        tables: [
          { headers: ['Month', 'Revenue'], rowCount: 2 },
          { headers: ['Region', 'Customers'], rowCount: 2 },
        ],
      },
      tags: ['tables', 'multiple'],
    },

    // H1 fallback for title
    {
      id: 'title-h1-fallback',
      name: 'Title from H1 Fallback',
      html: `
        <!DOCTYPE html>
        <html>
        <head><title></title></head>
        <body>
          <main>
            <h1>Welcome to Our Blog</h1>
            <p>This is the main content of our blog page.</p>
          </main>
        </body>
        </html>
      `,
      url: 'https://example.com/blog',
      expected: {
        title: 'Welcome to Our Blog',
        titleSource: 'h1',
        content: {
          minLength: 20,
          mustContain: ['main content', 'blog'],
        },
        confidence: {
          title: 'medium',
        },
      },
      tags: ['basic', 'edge-case'],
      isEdgeCase: true,
    },

    // Links extraction
    {
      id: 'links-basic',
      name: 'Page with Links',
      html: `
        <!DOCTYPE html>
        <html>
        <head><title>Resources</title></head>
        <body>
          <main>
            <h1>Useful Resources</h1>
            <p>Check out these helpful links:</p>
            <ul>
              <li><a href="https://example.com/docs">Documentation</a></li>
              <li><a href="https://example.com/api">API Reference</a></li>
              <li><a href="https://github.com/example">GitHub</a></li>
            </ul>
          </main>
        </body>
        </html>
      `,
      url: 'https://example.com/resources',
      expected: {
        title: 'Resources',
        links: {
          minCount: 3,
          mustInclude: ['/docs', '/api', 'github.com'],
        },
      },
      tags: ['basic', 'links'],
    },

    // Content filtering (should exclude nav, footer, ads)
    {
      id: 'content-filtering',
      name: 'Content with Noise to Filter',
      html: `
        <!DOCTYPE html>
        <html>
        <head><title>Clean Content Test</title></head>
        <body>
          <nav class="main-nav">Navigation should be removed</nav>
          <div class="ads">Advertisement content</div>
          <main>
            <article>
              <h1>The Real Content</h1>
              <p>This is the actual content that should be extracted.</p>
              <p>It contains important information for the reader.</p>
            </article>
          </main>
          <aside>Sidebar content</aside>
          <footer>Footer should be removed</footer>
        </body>
        </html>
      `,
      url: 'https://example.com/clean-test',
      expected: {
        title: 'Clean Content Test',
        content: {
          mustContain: ['real content', 'actual content', 'important information'],
          mustNotContain: ['navigation', 'advertisement', 'sidebar', 'footer'],
        },
      },
      tags: ['filtering', 'edge-case'],
      isEdgeCase: true,
    },

    // Minimal content (edge case)
    {
      id: 'minimal-content',
      name: 'Page with Minimal Content',
      html: `
        <!DOCTYPE html>
        <html>
        <head><title>Coming Soon</title></head>
        <body>
          <div>Under construction</div>
        </body>
        </html>
      `,
      url: 'https://example.com/soon',
      expected: {
        title: 'Coming Soon',
        content: {
          maxLength: 50,
        },
        confidence: {
          content: 'low',
        },
      },
      tags: ['edge-case', 'minimal'],
      isEdgeCase: true,
    },

    // Complex nested structure
    {
      id: 'nested-structure',
      name: 'Complex Nested HTML Structure',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Technical Documentation</title>
          <meta property="og:title" content="Tech Docs v2.0">
        </head>
        <body>
          <div class="wrapper">
            <div class="container">
              <main role="main">
                <div class="content-wrapper">
                  <article class="documentation">
                    <div class="article-content">
                      <h1>Getting Started Guide</h1>
                      <section>
                        <h2>Installation</h2>
                        <p>First, install the package using npm or yarn.</p>
                        <pre><code>npm install mypackage</code></pre>
                      </section>
                      <section>
                        <h2>Configuration</h2>
                        <p>Configure the package by creating a config file.</p>
                      </section>
                    </div>
                  </article>
                </div>
              </main>
            </div>
          </div>
        </body>
        </html>
      `,
      url: 'https://example.com/docs/getting-started',
      expected: {
        title: 'Tech Docs v2.0',
        titleSource: 'og_title',
        content: {
          mustContain: ['getting started', 'installation', 'configuration', 'npm install'],
        },
        confidence: {
          title: 'high',
          content: 'high',
        },
      },
      tags: ['complex', 'documentation'],
    },
  ];
}
