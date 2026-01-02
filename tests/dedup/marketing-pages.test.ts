/**
 * Marketing Pages Contract Tests
 *
 * These tests verify that marketing pages exist and render without errors.
 * They will fail if pages are removed incorrectly during deduplication.
 *
 * Purpose: Detect breakage when removing marketing pages from packages/api
 *
 * Note: These tests verify the API project's marketing pages. After deduplication,
 * these pages should ONLY exist in unbrowser-marketing repo.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';

// Import routes that will be affected by deduplication
import { landing } from '../../packages/api/src/routes/landing.js';
import { auth } from '../../packages/api/src/routes/auth.js';
import { pricingPage } from '../../packages/api/src/routes/pricing-page.js';
import { pricingCalculator } from '../../packages/api/src/routes/pricing-calculator.js';

describe('Marketing Pages in packages/api (TO BE REMOVED)', () => {
  /**
   * IMPORTANT: These tests document what CURRENTLY exists in packages/api.
   * After deduplication, these routes should be REMOVED from packages/api
   * and these tests should be DELETED or moved to unbrowser-marketing.
   */

  describe('Landing Page (/)', () => {
    let app: Hono;

    beforeAll(() => {
      app = new Hono();
      app.route('/', landing);
    });

    it('should render landing page', async () => {
      const res = await app.request('/');

      expect(res.status).toBe(200);
      const html = await res.text();

      // Verify key content exists
      expect(html).toContain('Unbrowser');
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('should contain navigation links', async () => {
      const res = await app.request('/');
      const html = await res.text();

      // Check for nav elements
      expect(html).toContain('href=');
      expect(html).toContain('Features');
    });

    it('should use correct cross-domain links for docs', async () => {
      const res = await app.request('/');
      const html = await res.text();

      // After PR #222, docs links should point to api.unbrowser.ai
      // This test will catch if someone adds relative /docs links again
      if (html.includes('href="/docs"')) {
        throw new Error(
          'Found relative /docs link in landing page. ' +
            'Docs are served from api.unbrowser.ai, not the marketing site. ' +
            'Use https://api.unbrowser.ai/docs instead.'
        );
      }
    });
  });

  describe('Auth Pages (/auth/*)', () => {
    let app: Hono;

    beforeAll(() => {
      app = new Hono();
      app.route('/auth', auth);
    });

    it('should render login page', async () => {
      const res = await app.request('/auth/login');

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Sign');
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('should render signup page', async () => {
      const res = await app.request('/auth/signup');

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('should use correct cross-domain links', async () => {
      const res = await app.request('/auth/login');
      const html = await res.text();

      if (html.includes('href="/docs"')) {
        throw new Error(
          'Found relative /docs link in auth page. ' +
            'Use https://api.unbrowser.ai/docs instead.'
        );
      }
    });
  });

  describe('Pricing Page (/pricing)', () => {
    let app: Hono;

    beforeAll(() => {
      app = new Hono();
      app.route('/pricing', pricingPage);
    });

    it('should render pricing page', async () => {
      const res = await app.request('/pricing');

      expect(res.status).toBe(200);
      const html = await res.text();

      expect(html).toContain('<!DOCTYPE html>');
      // Should contain pricing tiers
      expect(html.toLowerCase()).toContain('free');
    });

    it('should use correct cross-domain links', async () => {
      const res = await app.request('/pricing');
      const html = await res.text();

      if (html.includes('href="/docs"')) {
        throw new Error(
          'Found relative /docs link in pricing page. ' +
            'Use https://api.unbrowser.ai/docs instead.'
        );
      }
    });
  });

  describe('Pricing Calculator (/pricing/calculator)', () => {
    let app: Hono;

    beforeAll(() => {
      app = new Hono();
      app.route('/pricing', pricingCalculator);
    });

    it('should render calculator page', async () => {
      const res = await app.request('/pricing');

      expect(res.status).toBe(200);
      const html = await res.text();

      expect(html).toContain('<!DOCTYPE html>');
      expect(html.toLowerCase()).toContain('calculator');
    });

    it('should have calculate API endpoint', async () => {
      const res = await app.request('/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intelligenceRequests: 1000,
          lightweightRequests: 500,
          playwrightRequests: 100,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.calculations).toBeDefined();
    });

    it('should use correct cross-domain links', async () => {
      const res = await app.request('/pricing');
      const html = await res.text();

      if (html.includes('href="/docs"')) {
        throw new Error(
          'Found relative /docs link in calculator. ' +
            'Use https://api.unbrowser.ai/docs instead.'
        );
      }
    });
  });
});

describe('Marketing Pages Deduplication Checklist', () => {
  /**
   * This test documents the deduplication work needed.
   * It should be updated as work progresses.
   */

  it('should document files to be removed from packages/api', () => {
    const filesToRemove = [
      'packages/api/src/routes/landing.ts',
      'packages/api/src/routes/auth.ts',
      'packages/api/src/routes/pricing-page.ts',
      'packages/api/src/routes/pricing-calculator.ts',
      'packages/api/src/routes/dashboard-ui.ts',
    ];

    // This is documentation, not a real test
    expect(filesToRemove.length).toBeGreaterThan(0);

    console.log('\n=== Files to remove from packages/api (keep in unbrowser-marketing) ===');
    filesToRemove.forEach((f) => console.log(`  - ${f}`));
    console.log('\n');
  });

  it('should document that these pages exist in unbrowser-marketing', () => {
    const filesInMarketing = [
      'unbrowser-marketing/src/routes/landing.ts',
      'unbrowser-marketing/src/routes/auth.ts',
      'unbrowser-marketing/src/routes/pricing-page.ts',
      'unbrowser-marketing/src/routes/pricing-calculator.ts',
      'unbrowser-marketing/src/routes/dashboard-ui.ts',
    ];

    expect(filesInMarketing.length).toBeGreaterThan(0);
  });
});
