/**
 * Inspection UI Tests (F-013)
 *
 * Tests for the human-in-the-loop inspection UI.
 */

import { describe, it, expect } from 'vitest';
import { app } from '../../packages/api/src/app.js';

describe('Inspection UI (F-013)', () => {
  describe('GET /inspect', () => {
    it('should return HTML page', async () => {
      const response = await app.request('/inspect');

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
    });

    it('should include page title', async () => {
      const response = await app.request('/inspect');
      const html = await response.text();

      expect(html).toContain('<title>Unbrowser Inspection UI</title>');
    });

    it('should include URL input field', async () => {
      const response = await app.request('/inspect');
      const html = await response.text();

      expect(html).toContain('id="urlInput"');
      expect(html).toContain('placeholder="https://example.com"');
    });

    it('should include browse button', async () => {
      const response = await app.request('/inspect');
      const html = await response.text();

      expect(html).toContain('id="browseBtn"');
      expect(html).toContain('Browse');
    });

    it('should include option checkboxes', async () => {
      const response = await app.request('/inspect');
      const html = await response.text();

      expect(html).toContain('id="optIncludeTrace"');
      expect(html).toContain('id="optIncludeNetwork"');
      expect(html).toContain('id="optForcePlaywright"');
    });

    it('should include tabs for different views', async () => {
      const response = await app.request('/inspect');
      const html = await response.text();

      expect(html).toContain('data-tab="tiers"');
      expect(html).toContain('data-tab="selectors"');
      expect(html).toContain('data-tab="content"');
      expect(html).toContain('data-tab="json"');
    });

    it('should include tier cascade section', async () => {
      const response = await app.request('/inspect');
      const html = await response.text();

      expect(html).toContain('id="tierCascade"');
      expect(html).toContain('Tier Cascade');
    });

    it('should include selector list section', async () => {
      const response = await app.request('/inspect');
      const html = await response.text();

      expect(html).toContain('id="selectorList"');
      expect(html).toContain('Content Selectors');
    });

    it('should include title attempts section', async () => {
      const response = await app.request('/inspect');
      const html = await response.text();

      expect(html).toContain('id="titleAttempts"');
      expect(html).toContain('Title Extraction');
    });

    it('should include content preview section', async () => {
      const response = await app.request('/inspect');
      const html = await response.text();

      expect(html).toContain('id="contentPreview"');
      expect(html).toContain('Extracted Content');
    });

    it('should include raw JSON view section', async () => {
      const response = await app.request('/inspect');
      const html = await response.text();

      expect(html).toContain('id="jsonPreview"');
      expect(html).toContain('Raw Response');
    });

    it('should include summary stats', async () => {
      const response = await app.request('/inspect');
      const html = await response.text();

      expect(html).toContain('id="statFinalTier"');
      expect(html).toContain('id="statTiersAttempted"');
      expect(html).toContain('id="statSelectorsAttempted"');
      expect(html).toContain('id="statContentLength"');
      expect(html).toContain('id="statConfidence"');
      expect(html).toContain('id="statDuration"');
    });

    it('should include CSS styles', async () => {
      const response = await app.request('/inspect');
      const html = await response.text();

      expect(html).toContain('<style>');
      expect(html).toContain('--bg-primary');
      expect(html).toContain('--accent-blue');
    });

    it('should include JavaScript for interactivity', async () => {
      const response = await app.request('/inspect');
      const html = await response.text();

      expect(html).toContain('<script>');
      expect(html).toContain('function doBrowse');
      expect(html).toContain('function switchTab');
      expect(html).toContain('function renderTierCascade');
      expect(html).toContain('function renderSelectors');
    });

    it('should use safe DOM manipulation (no innerHTML with variables)', async () => {
      const response = await app.request('/inspect');
      const html = await response.text();

      // The script should use textContent and createElement, not innerHTML with untrusted data
      expect(html).toContain('createElement');
      expect(html).toContain('textContent');
      expect(html).toContain('clearElement');
    });

    it('should include loading state', async () => {
      const response = await app.request('/inspect');
      const html = await response.text();

      expect(html).toContain('id="loadingState"');
      expect(html).toContain('loading-spinner');
    });

    it('should include error state', async () => {
      const response = await app.request('/inspect');
      const html = await response.text();

      expect(html).toContain('id="errorState"');
      expect(html).toContain('error-message');
    });
  });

  describe('Root endpoint', () => {
    it('should list inspection UI in endpoints', async () => {
      const response = await app.request('/', {
        headers: { Accept: 'application/json' },
      });
      const json = await response.json();

      // In 'all' mode with JSON Accept header, API info is returned
      expect(json.api).toHaveProperty('docs');
    });
  });
});
