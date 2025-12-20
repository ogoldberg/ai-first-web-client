/**
 * Tests for ContentExtractor field-level confidence (CX-002)
 *
 * Tests the extractWithConfidence method that provides per-field
 * confidence scores for title, content, and tables.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContentExtractor } from '../../src/utils/content-extractor.js';

describe('ContentExtractor confidence tracking', () => {
  let extractor: ContentExtractor;

  beforeEach(() => {
    extractor = new ContentExtractor();
  });

  describe('extractWithConfidence', () => {
    it('should extract content with confidence scores', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Test Page</title></head>
        <body>
          <main>
            <h1>Main Content</h1>
            <p>This is the main content of the page.</p>
          </main>
        </body>
        </html>
      `;

      const result = extractor.extractWithConfidence(html, 'https://example.com');

      expect(result.title).toBe('Test Page');
      expect(result.markdown).toContain('Main Content');
      expect(result.text).toContain('main content');

      // Should have confidence for all fields
      expect(result.confidence.title).toBeDefined();
      expect(result.confidence.content).toBeDefined();
      expect(result.confidence.overall).toBeDefined();

      // Title from <title> tag should have high confidence
      expect(result.confidence.title.score).toBeGreaterThan(0.8);
      expect(result.confidence.title.source).toBe('selector_match');

      // Content from <main> should have high confidence
      expect(result.confidence.content.score).toBeGreaterThan(0.8);
      expect(result.confidence.content.source).toBe('selector_match');
    });

    it('should have lower confidence for body fallback', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Test</title></head>
        <body>
          <div>Some content without semantic containers</div>
        </body>
        </html>
      `;

      const result = extractor.extractWithConfidence(html, 'https://example.com');

      // Content from body fallback should have lower confidence
      expect(result.confidence.content.score).toBeLessThan(0.5);
      expect(result.confidence.content.source).toBe('fallback');
      expect(result.metadata.contentSource).toBe('body_fallback');
    });

    it('should have highest confidence for OpenGraph title', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>HTML Title</title>
          <meta property="og:title" content="OpenGraph Title">
        </head>
        <body>
          <main><p>Content</p></main>
        </body>
        </html>
      `;

      const result = extractor.extractWithConfidence(html, 'https://example.com');

      expect(result.title).toBe('OpenGraph Title');
      expect(result.metadata.titleSource).toBe('og_title');
      expect(result.confidence.title.source).toBe('structured_data');
    });

    it('should use h1 as title fallback with lower confidence', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <body>
          <main>
            <h1>Heading Title</h1>
            <p>Some content here.</p>
          </main>
        </body>
        </html>
      `;

      const result = extractor.extractWithConfidence(html, 'https://example.com');

      expect(result.title).toBe('Heading Title');
      expect(result.metadata.titleSource).toBe('h1');
      expect(result.confidence.title.score).toBeGreaterThanOrEqual(0.5);
      expect(result.confidence.title.score).toBeLessThan(0.85);
    });

    it('should handle article content', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Article</title></head>
        <body>
          <article>
            <h1>Article Title</h1>
            <p>Article content goes here with enough text to pass validation.</p>
          </article>
        </body>
        </html>
      `;

      const result = extractor.extractWithConfidence(html, 'https://example.com');

      expect(result.metadata.contentSource).toBe('article');
      expect(result.confidence.content.score).toBeGreaterThan(0.8);
    });

    it('should track metadata about extraction', () => {
      // Need enough content (>100 chars) for the selector to be considered valid
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Test</title></head>
        <body>
          <div role="main">
            <p>Content with ARIA role. This paragraph contains more than one hundred characters of text to ensure the content length validation passes and the semantic container is recognized.</p>
          </div>
        </body>
        </html>
      `;

      const result = extractor.extractWithConfidence(html, 'https://example.com');

      expect(result.metadata.titleSource).toBe('title_tag');
      expect(result.metadata.contentSource).toBe('role_main');
      expect(result.metadata.contentSelector).toBe('[role="main"]');
    });

    it('should compute overall confidence from components', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Test</title></head>
        <body>
          <main><p>Good content here.</p></main>
        </body>
        </html>
      `;

      const result = extractor.extractWithConfidence(html, 'https://example.com');

      // Overall should be aggregate of title and content
      expect(result.confidence.overall.score).toBeGreaterThan(0);
      expect(result.confidence.overall.score).toBeLessThanOrEqual(1);
    });
  });
});
