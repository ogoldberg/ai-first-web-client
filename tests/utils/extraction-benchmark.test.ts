/**
 * Tests for Extraction Quality Benchmarking (O-006)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ExtractionBenchmark,
  CorpusEntry,
  getStandardCorpus,
} from '../../src/utils/extraction-benchmark.js';

describe('ExtractionBenchmark', () => {
  let benchmark: ExtractionBenchmark;

  beforeEach(() => {
    benchmark = new ExtractionBenchmark();
  });

  describe('corpus management', () => {
    it('should add entries to corpus', () => {
      const entry: CorpusEntry = {
        id: 'test-1',
        name: 'Test Entry',
        html: '<html><head><title>Test</title></head><body><p>Hello</p></body></html>',
        url: 'https://example.com/test',
        expected: { title: 'Test' },
      };

      benchmark.addEntry(entry);
      expect(benchmark.getEntryCount()).toBe(1);
    });

    it('should reject entries with missing required fields', () => {
      expect(() => {
        benchmark.addEntry({
          id: '',
          name: 'Test',
          html: '<html></html>',
          url: 'https://example.com',
          expected: {},
        });
      }).toThrow('Invalid corpus entry');
    });

    it('should reject duplicate entry IDs', () => {
      const entry: CorpusEntry = {
        id: 'duplicate',
        name: 'First',
        html: '<html></html>',
        url: 'https://example.com',
        expected: {},
      };

      benchmark.addEntry(entry);

      expect(() => {
        benchmark.addEntry({ ...entry, name: 'Second' });
      }).toThrow('Duplicate corpus entry ID');
    });

    it('should load corpus from array', () => {
      const entries: CorpusEntry[] = [
        {
          id: 'test-1',
          name: 'Test 1',
          html: '<html><body>A</body></html>',
          url: 'https://example.com/1',
          expected: {},
        },
        {
          id: 'test-2',
          name: 'Test 2',
          html: '<html><body>B</body></html>',
          url: 'https://example.com/2',
          expected: {},
        },
      ];

      benchmark.loadCorpus(entries);
      expect(benchmark.getEntryCount()).toBe(2);
    });

    it('should clear corpus when loading new entries', () => {
      benchmark.addEntry({
        id: 'old',
        name: 'Old',
        html: '<html></html>',
        url: 'https://example.com',
        expected: {},
      });

      benchmark.loadCorpus([
        {
          id: 'new',
          name: 'New',
          html: '<html></html>',
          url: 'https://example.com',
          expected: {},
        },
      ]);

      expect(benchmark.getEntryCount()).toBe(1);
      expect(benchmark.getEntries()[0].id).toBe('new');
    });
  });

  describe('benchmarkEntry', () => {
    it('should pass when title matches exactly', async () => {
      const entry: CorpusEntry = {
        id: 'title-exact',
        name: 'Exact Title Match',
        html: '<html><head><title>Expected Title</title></head><body></body></html>',
        url: 'https://example.com',
        expected: { title: 'Expected Title' },
      };

      const result = await benchmark.benchmarkEntry(entry);
      expect(result.passed).toBe(true);
      expect(result.metrics.title.exactMatch).toBe(true);
    });

    it('should fail when title does not match', async () => {
      const entry: CorpusEntry = {
        id: 'title-mismatch',
        name: 'Title Mismatch',
        html: '<html><head><title>Actual Title</title></head><body></body></html>',
        url: 'https://example.com',
        expected: { title: 'Expected Title' },
      };

      const result = await benchmark.benchmarkEntry(entry);
      expect(result.metrics.title.exactMatch).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
      expect(result.failures.some(f => f.check === 'title.exactMatch')).toBe(true);
    });

    it('should prefer og:title over title tag', async () => {
      const entry: CorpusEntry = {
        id: 'og-title',
        name: 'OG Title Priority',
        html: `
          <html>
          <head>
            <title>Regular Title</title>
            <meta property="og:title" content="OG Title">
          </head>
          <body></body>
          </html>
        `,
        url: 'https://example.com',
        expected: {
          title: 'OG Title',
          titleSource: 'og_title',
        },
      };

      const result = await benchmark.benchmarkEntry(entry);
      expect(result.passed).toBe(true);
      expect(result.metrics.title.sourceMatch).toBe(true);
    });

    it('should validate content minimum length', async () => {
      const entry: CorpusEntry = {
        id: 'content-length',
        name: 'Content Length Check',
        html: '<html><body><main><p>Short</p></main></body></html>',
        url: 'https://example.com',
        expected: {
          content: { minLength: 100 },
        },
      };

      const result = await benchmark.benchmarkEntry(entry);
      expect(result.passed).toBe(false);
      expect(result.metrics.content.lengthInRange).toBe(false);
      expect(result.failures.some(f => f.check === 'content.length')).toBe(true);
    });

    it('should validate content contains required phrases', async () => {
      const entry: CorpusEntry = {
        id: 'content-contains',
        name: 'Content Contains Check',
        html: `
          <html><body>
            <main>
              <p>This article discusses programming and software development.</p>
            </main>
          </body></html>
        `,
        url: 'https://example.com',
        expected: {
          content: {
            mustContain: ['programming', 'software'],
          },
        },
      };

      const result = await benchmark.benchmarkEntry(entry);
      expect(result.passed).toBe(true);
      expect(result.metrics.content.containsAllRequired).toBe(true);
    });

    it('should fail when content missing required phrases', async () => {
      const entry: CorpusEntry = {
        id: 'content-missing',
        name: 'Content Missing Phrases',
        html: '<html><body><main><p>This is about cooking.</p></main></body></html>',
        url: 'https://example.com',
        expected: {
          content: {
            mustContain: ['programming', 'software'],
          },
        },
      };

      const result = await benchmark.benchmarkEntry(entry);
      expect(result.passed).toBe(false);
      expect(result.metrics.content.containsAllRequired).toBe(false);
    });

    it('should validate content excludes forbidden phrases', async () => {
      const entry: CorpusEntry = {
        id: 'content-excludes',
        name: 'Content Excludes Check',
        html: `
          <html><body>
            <nav>Navigation menu</nav>
            <main><p>Main content here.</p></main>
            <footer>Footer text</footer>
          </body></html>
        `,
        url: 'https://example.com',
        expected: {
          content: {
            mustNotContain: ['navigation', 'footer'],
          },
        },
      };

      const result = await benchmark.benchmarkEntry(entry);
      // The extractor should filter out nav/footer, so content should pass
      expect(result.metrics.content.excludesAllForbidden).toBe(true);
    });

    it('should extract and validate tables', async () => {
      const entry: CorpusEntry = {
        id: 'table-basic',
        name: 'Basic Table',
        html: `
          <html><body>
            <table id="data">
              <caption>Test Data</caption>
              <thead><tr><th>Name</th><th>Value</th></tr></thead>
              <tbody>
                <tr><td>Alpha</td><td>100</td></tr>
                <tr><td>Beta</td><td>200</td></tr>
              </tbody>
            </table>
          </body></html>
        `,
        url: 'https://example.com',
        expected: {
          tables: [
            {
              id: 'data',
              caption: 'Test Data',
              headers: ['Name', 'Value'],
              rowCount: 2,
            },
          ],
        },
      };

      const result = await benchmark.benchmarkEntry(entry);
      expect(result.passed).toBe(true);
      expect(result.metrics.tables.matchedTables).toBe(1);
      expect(result.metrics.tables.headerAccuracy).toBe(1.0);
    });

    it('should fail when table count is less than expected', async () => {
      const entry: CorpusEntry = {
        id: 'table-missing',
        name: 'Missing Tables',
        html: '<html><body><p>No tables here</p></body></html>',
        url: 'https://example.com',
        expected: {
          tables: [{ headers: ['A', 'B'] }],
        },
      };

      const result = await benchmark.benchmarkEntry(entry);
      expect(result.passed).toBe(false);
      expect(result.metrics.tables.actualCount).toBe(0);
      expect(result.failures.some(f => f.check === 'tables.count')).toBe(true);
    });

    it('should validate sample rows in tables', async () => {
      const entry: CorpusEntry = {
        id: 'table-rows',
        name: 'Table Sample Rows',
        html: `
          <html><body>
            <table>
              <thead><tr><th>X</th><th>Y</th></tr></thead>
              <tbody>
                <tr><td>1</td><td>2</td></tr>
                <tr><td>3</td><td>4</td></tr>
              </tbody>
            </table>
          </body></html>
        `,
        url: 'https://example.com',
        expected: {
          tables: [
            {
              headers: ['X', 'Y'],
              sampleRows: [['1', '2']],
            },
          ],
        },
      };

      const result = await benchmark.benchmarkEntry(entry);
      expect(result.metrics.tables.sampleRowsMatch).toBe(true);
    });

    it('should validate link count', async () => {
      const entry: CorpusEntry = {
        id: 'links-count',
        name: 'Link Count',
        html: `
          <html><body>
            <a href="/a">A</a>
            <a href="/b">B</a>
            <a href="/c">C</a>
          </body></html>
        `,
        url: 'https://example.com',
        expected: {
          links: { minCount: 3 },
        },
      };

      const result = await benchmark.benchmarkEntry(entry);
      expect(result.passed).toBe(true);
      expect(result.metrics.links.meetsMinimum).toBe(true);
    });

    it('should calculate overall score', async () => {
      const entry: CorpusEntry = {
        id: 'score-test',
        name: 'Score Calculation',
        html: `
          <html>
          <head><title>Test Page</title></head>
          <body>
            <main>
              <p>This is the main content of the test page with enough text.</p>
            </main>
          </body>
          </html>
        `,
        url: 'https://example.com',
        expected: {
          title: 'Test Page',
          content: {
            minLength: 10,
            mustContain: ['main content'],
          },
        },
      };

      const result = await benchmark.benchmarkEntry(entry);
      expect(result.metrics.overallScore).toBeGreaterThan(0);
      expect(result.metrics.overallScore).toBeLessThanOrEqual(100);
    });

    it('should record extraction duration', async () => {
      const entry: CorpusEntry = {
        id: 'duration-test',
        name: 'Duration Tracking',
        html: '<html><body><p>Test</p></body></html>',
        url: 'https://example.com',
        expected: {},
      };

      const result = await benchmark.benchmarkEntry(entry);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('runBenchmark', () => {
    it('should run benchmark on all entries', async () => {
      benchmark.loadCorpus([
        {
          id: 'test-1',
          name: 'Test 1',
          html: '<html><head><title>A</title></head><body></body></html>',
          url: 'https://example.com/1',
          expected: { title: 'A' },
        },
        {
          id: 'test-2',
          name: 'Test 2',
          html: '<html><head><title>B</title></head><body></body></html>',
          url: 'https://example.com/2',
          expected: { title: 'B' },
        },
      ]);

      const summary = await benchmark.runBenchmark();

      expect(summary.totalEntries).toBe(2);
      expect(summary.results.length).toBe(2);
    });

    it('should filter by tags', async () => {
      benchmark.loadCorpus([
        {
          id: 'basic-1',
          name: 'Basic 1',
          html: '<html></html>',
          url: 'https://example.com/1',
          expected: {},
          tags: ['basic'],
        },
        {
          id: 'advanced-1',
          name: 'Advanced 1',
          html: '<html></html>',
          url: 'https://example.com/2',
          expected: {},
          tags: ['advanced'],
        },
      ]);

      const summary = await benchmark.runBenchmark({ tags: ['basic'] });

      expect(summary.totalEntries).toBe(1);
      expect(summary.results[0].id).toBe('basic-1');
    });

    it('should calculate pass rate', async () => {
      benchmark.loadCorpus([
        {
          id: 'pass',
          name: 'Pass',
          html: '<html><head><title>Pass</title></head><body></body></html>',
          url: 'https://example.com/pass',
          expected: { title: 'Pass' },
        },
        {
          id: 'fail',
          name: 'Fail',
          html: '<html><head><title>Actual</title></head><body></body></html>',
          url: 'https://example.com/fail',
          expected: { title: 'Expected' },
        },
      ]);

      const summary = await benchmark.runBenchmark();

      expect(summary.passed).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.passRate).toBe(0.5);
    });

    it('should aggregate by category', async () => {
      benchmark.loadCorpus([
        {
          id: 'basic-1',
          name: 'Basic 1',
          html: '<html><head><title>A</title></head><body></body></html>',
          url: 'https://example.com/1',
          expected: { title: 'A' },
          tags: ['basic'],
        },
        {
          id: 'basic-2',
          name: 'Basic 2',
          html: '<html><head><title>B</title></head><body></body></html>',
          url: 'https://example.com/2',
          expected: { title: 'B' },
          tags: ['basic'],
        },
        {
          id: 'tables-1',
          name: 'Tables 1',
          html: '<html><body><table><tr><td>X</td></tr></table></body></html>',
          url: 'https://example.com/3',
          expected: {},
          tags: ['tables'],
        },
      ]);

      const summary = await benchmark.runBenchmark();

      expect(summary.byCategory['basic']).toBeDefined();
      expect(summary.byCategory['basic'].total).toBe(2);
      expect(summary.byCategory['tables']).toBeDefined();
      expect(summary.byCategory['tables'].total).toBe(1);
    });

    it('should handle empty corpus', async () => {
      const summary = await benchmark.runBenchmark();

      expect(summary.totalEntries).toBe(0);
      expect(summary.passRate).toBe(0);
      expect(summary.averageScore).toBe(0);
    });

    it('should include timestamp', async () => {
      benchmark.addEntry({
        id: 'test',
        name: 'Test',
        html: '<html></html>',
        url: 'https://example.com',
        expected: {},
      });

      const summary = await benchmark.runBenchmark();

      expect(summary.timestamp).toBeDefined();
      expect(new Date(summary.timestamp).getTime()).not.toBeNaN();
    });
  });

  describe('formatReport', () => {
    it('should generate human-readable report', async () => {
      benchmark.loadCorpus([
        {
          id: 'test-1',
          name: 'Test Entry',
          html: '<html><head><title>Test</title></head><body></body></html>',
          url: 'https://example.com',
          expected: { title: 'Test' },
          tags: ['basic'],
        },
      ]);

      const summary = await benchmark.runBenchmark();
      const report = benchmark.formatReport(summary);

      expect(report).toContain('EXTRACTION QUALITY BENCHMARK REPORT');
      expect(report).toContain('Total Entries: 1');
      expect(report).toContain('Passed: 1');
      expect(report).toContain('basic:');
    });

    it('should list failures in report', async () => {
      benchmark.loadCorpus([
        {
          id: 'fail-test',
          name: 'Failing Test',
          html: '<html><head><title>Wrong</title></head><body></body></html>',
          url: 'https://example.com',
          expected: { title: 'Expected Title' },
        },
      ]);

      const summary = await benchmark.runBenchmark();
      const report = benchmark.formatReport(summary);

      expect(report).toContain('FAILURES');
      expect(report).toContain('[fail-test]');
      expect(report).toContain('Title mismatch');
    });
  });

  describe('getStandardCorpus', () => {
    it('should return standard corpus entries', () => {
      const corpus = getStandardCorpus();

      expect(corpus.length).toBeGreaterThan(0);
      expect(corpus.every(e => e.id && e.name && e.html && e.url)).toBe(true);
    });

    it('should include entries with various tags', () => {
      const corpus = getStandardCorpus();
      const allTags = new Set(corpus.flatMap(e => e.tags ?? []));

      expect(allTags.has('basic')).toBe(true);
      expect(allTags.has('tables')).toBe(true);
    });

    it('should pass benchmark with reasonable scores', async () => {
      const corpus = getStandardCorpus();
      benchmark.loadCorpus(corpus);

      const summary = await benchmark.runBenchmark();

      // Standard corpus should have high pass rate
      expect(summary.passRate).toBeGreaterThan(0.5);
      expect(summary.averageScore).toBeGreaterThan(50);
    });
  });

  describe('confidence level matching', () => {
    it('should pass when actual confidence exceeds expected', async () => {
      const entry: CorpusEntry = {
        id: 'conf-high',
        name: 'High Confidence',
        html: `
          <html>
          <head>
            <meta property="og:title" content="OG Title">
          </head>
          <body></body>
          </html>
        `,
        url: 'https://example.com',
        expected: {
          confidence: { title: 'medium' },
        },
      };

      const result = await benchmark.benchmarkEntry(entry);
      // OG title should give high/very_high confidence, which exceeds medium
      expect(result.failures.some(f => f.check === 'confidence.title')).toBe(false);
    });

    it('should warn when confidence is lower than expected', async () => {
      const entry: CorpusEntry = {
        id: 'conf-low',
        name: 'Low Confidence',
        html: `
          <html>
          <head><title></title></head>
          <body><h1>H1 Title</h1></body>
          </html>
        `,
        url: 'https://example.com',
        expected: {
          confidence: { title: 'very_high' },
        },
      };

      const result = await benchmark.benchmarkEntry(entry);
      // H1 fallback gives medium confidence, which is less than very_high
      expect(result.failures.some(f => f.check === 'confidence.title')).toBe(true);
    });
  });

  describe('fuzzy matching', () => {
    it('should give partial credit for similar titles', async () => {
      const entry: CorpusEntry = {
        id: 'fuzzy-title',
        name: 'Fuzzy Title Match',
        html: '<html><head><title>The Complete Guide to Programming</title></head><body></body></html>',
        url: 'https://example.com',
        expected: { title: 'Complete Programming Guide' },
      };

      const result = await benchmark.benchmarkEntry(entry);
      // Not exact match, but fuzzy score should be > 0
      expect(result.metrics.title.exactMatch).toBe(false);
      expect(result.metrics.title.fuzzyScore).toBeGreaterThan(0.3);
    });
  });

  describe('edge cases', () => {
    it('should handle malformed HTML gracefully', async () => {
      const entry: CorpusEntry = {
        id: 'malformed',
        name: 'Malformed HTML',
        html: '<html><head><title>Test<body><p>Content without closing tags',
        url: 'https://example.com',
        expected: { title: 'Test' },
      };

      // Should not throw
      const result = await benchmark.benchmarkEntry(entry);
      expect(result.id).toBe('malformed');
    });

    it('should handle empty HTML', async () => {
      const entry: CorpusEntry = {
        id: 'empty',
        name: 'Empty HTML',
        html: '',
        url: 'https://example.com',
        expected: {},
      };

      const result = await benchmark.benchmarkEntry(entry);
      expect(result.id).toBe('empty');
    });

    it('should handle HTML with only whitespace', async () => {
      const entry: CorpusEntry = {
        id: 'whitespace',
        name: 'Whitespace Only',
        html: '   \n\t  \n   ',
        url: 'https://example.com',
        expected: {},
      };

      const result = await benchmark.benchmarkEntry(entry);
      expect(result.id).toBe('whitespace');
    });
  });
});
