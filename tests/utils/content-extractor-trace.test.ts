/**
 * Tests for ContentExtractor extractWithTrace method (CX-003)
 *
 * Tests the decision trace functionality that provides detailed
 * information about which selectors and title sources were tried.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContentExtractor } from '../../src/utils/content-extractor.js';

describe('ContentExtractor extractWithTrace', () => {
  let extractor: ContentExtractor;

  beforeEach(() => {
    extractor = new ContentExtractor();
  });

  describe('title attempts', () => {
    it('should record OpenGraph title as first attempt when present', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta property="og:title" content="OG Title">
          <title>HTML Title</title>
        </head>
        <body><main><p>Content</p></main></body>
        </html>
      `;

      const result = extractor.extractWithTrace(html, 'https://example.com');

      expect(result.trace.titleAttempts.length).toBeGreaterThanOrEqual(2);

      const ogAttempt = result.trace.titleAttempts.find(a => a.source === 'og_title');
      expect(ogAttempt).toBeDefined();
      expect(ogAttempt?.found).toBe(true);
      expect(ogAttempt?.selected).toBe(true);
      expect(ogAttempt?.value).toBe('OG Title');

      const titleTagAttempt = result.trace.titleAttempts.find(a => a.source === 'title_tag');
      expect(titleTagAttempt).toBeDefined();
      expect(titleTagAttempt?.found).toBe(true);
      expect(titleTagAttempt?.selected).toBe(false);
    });

    it('should fall back to title tag when no OG title', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>HTML Title</title></head>
        <body><main><p>Content</p></main></body>
        </html>
      `;

      const result = extractor.extractWithTrace(html, 'https://example.com');

      const ogAttempt = result.trace.titleAttempts.find(a => a.source === 'og_title');
      expect(ogAttempt?.found).toBe(false);
      expect(ogAttempt?.selected).toBe(false);

      const titleTagAttempt = result.trace.titleAttempts.find(a => a.source === 'title_tag');
      expect(titleTagAttempt?.found).toBe(true);
      expect(titleTagAttempt?.selected).toBe(true);
      expect(titleTagAttempt?.value).toBe('HTML Title');
    });

    it('should fall back to h1 when no title or OG title', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <body>
          <main>
            <h1>Heading Title</h1>
            <p>Content</p>
          </main>
        </body>
        </html>
      `;

      const result = extractor.extractWithTrace(html, 'https://example.com');

      const h1Attempt = result.trace.titleAttempts.find(a => a.source === 'h1');
      expect(h1Attempt?.found).toBe(true);
      expect(h1Attempt?.selected).toBe(true);
      expect(h1Attempt?.value).toBe('Heading Title');
    });

    it('should record unknown when no title source found', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <body><main><p>Content only</p></main></body>
        </html>
      `;

      const result = extractor.extractWithTrace(html, 'https://example.com');

      const unknownAttempt = result.trace.titleAttempts.find(a => a.source === 'unknown');
      expect(unknownAttempt).toBeDefined();
      expect(unknownAttempt?.selected).toBe(true);
    });
  });

  describe('selector attempts', () => {
    it('should record main element as first selected when present with sufficient content', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Test</title></head>
        <body>
          <main>
            <p>This is the main content area with sufficient text to pass the content length validation check.</p>
          </main>
          <article>
            <p>This is article content that should not be selected.</p>
          </article>
        </body>
        </html>
      `;

      const result = extractor.extractWithTrace(html, 'https://example.com');

      const mainAttempt = result.trace.selectorAttempts.find(a => a.selector === 'main');
      expect(mainAttempt).toBeDefined();
      expect(mainAttempt?.matched).toBe(true);
      expect(mainAttempt?.selected).toBe(true);
      expect(mainAttempt?.contentLength).toBeGreaterThan(100);

      const articleAttempt = result.trace.selectorAttempts.find(a => a.selector === 'article');
      expect(articleAttempt?.selected).toBe(false);
    });

    it('should try article when main has insufficient content', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Test</title></head>
        <body>
          <main><p>Short</p></main>
          <article>
            <p>This is article content with enough text to pass the validation check. It has more than 100 characters of content.</p>
          </article>
        </body>
        </html>
      `;

      const result = extractor.extractWithTrace(html, 'https://example.com');

      const mainAttempt = result.trace.selectorAttempts.find(a => a.selector === 'main');
      expect(mainAttempt?.matched).toBe(true);
      expect(mainAttempt?.selected).toBe(false);
      expect(mainAttempt?.skipReason).toContain('Insufficient content');

      const articleAttempt = result.trace.selectorAttempts.find(a => a.selector === 'article');
      expect(articleAttempt?.selected).toBe(true);
    });

    it('should record all selector attempts before fallback', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Test</title></head>
        <body>
          <div>Just a div with content</div>
        </body>
        </html>
      `;

      const result = extractor.extractWithTrace(html, 'https://example.com');

      // Should have tried main, article, role_main, content_class before body
      expect(result.trace.selectorAttempts.length).toBeGreaterThanOrEqual(4);

      const bodyAttempt = result.trace.selectorAttempts.find(a => a.source === 'body_fallback');
      expect(bodyAttempt).toBeDefined();
      expect(bodyAttempt?.selected).toBe(true);

      // All other selectors should not be selected
      const nonBodyAttempts = result.trace.selectorAttempts.filter(a => a.source !== 'body_fallback');
      for (const attempt of nonBodyAttempts) {
        expect(attempt.selected).toBe(false);
      }
    });

    it('should record skip reasons for non-matching selectors', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Test</title></head>
        <body>
          <article>
            <p>This is article content with sufficient text to be selected as the main content area.</p>
          </article>
        </body>
        </html>
      `;

      const result = extractor.extractWithTrace(html, 'https://example.com');

      const mainAttempt = result.trace.selectorAttempts.find(a => a.selector === 'main');
      expect(mainAttempt?.matched).toBe(false);
      expect(mainAttempt?.skipReason).toBe('No elements found');
    });
  });

  describe('integration with confidence and metadata', () => {
    it('should include confidence data alongside trace', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Test Page</title></head>
        <body>
          <main>
            <p>Main content with sufficient text for validation to pass and show high confidence.</p>
          </main>
        </body>
        </html>
      `;

      const result = extractor.extractWithTrace(html, 'https://example.com');

      expect(result.confidence).toBeDefined();
      expect(result.confidence.title).toBeDefined();
      expect(result.confidence.content).toBeDefined();
      expect(result.confidence.overall).toBeDefined();
    });

    it('should include metadata alongside trace', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Test Page</title></head>
        <body>
          <main>
            <p>Main content with sufficient text for validation to pass and show high confidence.</p>
          </main>
        </body>
        </html>
      `;

      const result = extractor.extractWithTrace(html, 'https://example.com');

      expect(result.metadata).toBeDefined();
      expect(result.metadata.titleSource).toBe('title_tag');
      expect(result.metadata.contentSource).toBe('main');
      expect(result.metadata.contentSelector).toBe('main');
    });

    it('should match trace to metadata', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta property="og:title" content="OG Title">
        </head>
        <body>
          <article>
            <p>Article content with enough text to be selected as the main content element.</p>
          </article>
        </body>
        </html>
      `;

      const result = extractor.extractWithTrace(html, 'https://example.com');

      // Verify trace matches metadata
      const selectedTitle = result.trace.titleAttempts.find(a => a.selected);
      expect(selectedTitle?.source).toBe(result.metadata.titleSource);

      const selectedSelector = result.trace.selectorAttempts.find(a => a.selected);
      expect(selectedSelector?.source).toBe(result.metadata.contentSource);
    });
  });
});
