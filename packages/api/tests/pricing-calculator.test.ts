/**
 * Pricing Calculator Tests (API-016)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/app.js';

describe('Pricing Calculator', () => {
  describe('GET /pricing', () => {
    it('should return the pricing calculator HTML page', async () => {
      const res = await app.request('/pricing');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');

      const html = await res.text();
      expect(html).toContain('Pricing Calculator');
      expect(html).toContain('Intelligence Tier');
      expect(html).toContain('Lightweight Tier');
      expect(html).toContain('Playwright Tier');
    });

    it('should include preset buttons', async () => {
      const res = await app.request('/pricing');
      const html = await res.text();

      expect(html).toContain('Hobby Project');
      expect(html).toContain('Startup');
      expect(html).toContain('Growth');
      expect(html).toContain('Enterprise');
    });

    it('should include tier results section', async () => {
      const res = await app.request('/pricing');
      const html = await res.text();

      expect(html).toContain('tier-results');
      expect(html).toContain('Estimated Costs');
    });

    it('should include unit cost information', async () => {
      const res = await app.request('/pricing');
      const html = await res.text();

      expect(html).toContain('1 unit each');
      expect(html).toContain('5 units each');
      expect(html).toContain('25 units each');
    });

    it('should include call-to-action section', async () => {
      const res = await app.request('/pricing');
      const html = await res.text();

      expect(html).toContain('Ready to get started?');
      expect(html).toContain('View Documentation');
      expect(html).toContain('Contact Sales');
    });
  });

  describe('POST /pricing/calculate', () => {
    it('should calculate costs for basic usage', async () => {
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

      // Verify input summary
      expect(data.data.input.totalRequests).toBe(1600);
      // Units: 1000*1 + 500*5 + 100*25 = 1000 + 2500 + 2500 = 6000
      expect(data.data.input.totalUnits).toBe(6000);
    });

    it('should calculate Free tier correctly when eligible', async () => {
      const res = await app.request('/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intelligenceRequests: 500,
          lightweightRequests: 200,
          playwrightRequests: 0, // No playwright = Free tier eligible
        }),
      });

      const data = await res.json();
      const freeTier = data.data.calculations.find((c: any) => c.tier === 'FREE');

      expect(freeTier.eligible).toBe(true);
      expect(freeTier.monthlyCost).toBe(0);
    });

    it('should mark Free tier ineligible when Playwright is needed', async () => {
      const res = await app.request('/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intelligenceRequests: 100,
          lightweightRequests: 50,
          playwrightRequests: 10, // Playwright needed
        }),
      });

      const data = await res.json();
      const freeTier = data.data.calculations.find((c: any) => c.tier === 'FREE');

      expect(freeTier.eligible).toBe(false);
      expect(freeTier.reason).toBe('Playwright tier not available');
    });

    it('should calculate Starter tier with base + usage', async () => {
      const res = await app.request('/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intelligenceRequests: 5000, // 5000 units
          lightweightRequests: 2000, // 10000 units
          playwrightRequests: 200, // 5000 units
        }),
      });

      const data = await res.json();
      const starterTier = data.data.calculations.find((c: any) => c.tier === 'STARTER');

      // Total units = 5000 + 10000 + 5000 = 20000
      // Units cost = 20000 / 1000 * 0.50 = $10
      // Monthly cost = $29 base + $10 = $39
      expect(starterTier.eligible).toBe(true);
      expect(starterTier.breakdown.baseFee).toBe(29);
      expect(starterTier.breakdown.unitsCost).toBe(10);
      expect(starterTier.monthlyCost).toBe(39);
    });

    it('should calculate Team tier with lower rate', async () => {
      const res = await app.request('/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intelligenceRequests: 5000,
          lightweightRequests: 2000,
          playwrightRequests: 200,
        }),
      });

      const data = await res.json();
      const teamTier = data.data.calculations.find((c: any) => c.tier === 'TEAM');

      // Total units = 20000
      // Units cost = 20000 / 1000 * 0.40 = $8
      // Monthly cost = $250 base + $8 = $258
      expect(teamTier.eligible).toBe(true);
      expect(teamTier.breakdown.baseFee).toBe(250);
      expect(teamTier.breakdown.unitsCost).toBe(8);
      expect(teamTier.monthlyCost).toBe(258);
    });

    it('should detect when usage exceeds tier limits', async () => {
      const res = await app.request('/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intelligenceRequests: 25000, // Exceeds FREE limit (3000)
          lightweightRequests: 5000,
          playwrightRequests: 0,
        }),
      });

      const data = await res.json();
      const freeTier = data.data.calculations.find((c: any) => c.tier === 'FREE');

      expect(freeTier.withinLimits).toBe(false);
    });

    it('should mark Enterprise tier as custom pricing', async () => {
      const res = await app.request('/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intelligenceRequests: 100000,
          lightweightRequests: 50000,
          playwrightRequests: 10000,
        }),
      });

      const data = await res.json();
      const enterpriseTier = data.data.calculations.find((c: any) => c.tier === 'ENTERPRISE');

      expect(enterpriseTier.eligible).toBe(true);
      expect(enterpriseTier.monthlyCost).toBeNull();
      expect(enterpriseTier.recommendation).toBe('Contact sales for custom pricing');
    });

    it('should recommend the cheapest tier within limits', async () => {
      const res = await app.request('/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intelligenceRequests: 1000,
          lightweightRequests: 500,
          playwrightRequests: 0, // No playwright = Free eligible
        }),
      });

      const data = await res.json();

      // Free tier should be recommended (it's $0 and within limits)
      expect(data.data.recommended).toBe('FREE');
    });

    it('should recommend Starter when Free is ineligible', async () => {
      const res = await app.request('/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intelligenceRequests: 1000,
          lightweightRequests: 500,
          playwrightRequests: 10, // Needs Playwright
        }),
      });

      const data = await res.json();

      // Starter should be recommended (cheapest with Playwright)
      expect(data.data.recommended).toBe('STARTER');
    });

    it('should recommend Enterprise for very high usage', async () => {
      const res = await app.request('/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intelligenceRequests: 500000, // Exceeds all limits
          lightweightRequests: 100000,
          playwrightRequests: 50000,
        }),
      });

      const data = await res.json();

      // Should recommend Enterprise for extremely high usage
      expect(data.data.recommended).toBe('ENTERPRISE');
    });

    it('should handle zero usage', async () => {
      const res = await app.request('/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intelligenceRequests: 0,
          lightweightRequests: 0,
          playwrightRequests: 0,
        }),
      });

      const data = await res.json();

      expect(data.data.input.totalRequests).toBe(0);
      expect(data.data.input.totalUnits).toBe(0);
      expect(data.data.recommended).toBe('FREE');
    });

    it('should handle missing fields with defaults', async () => {
      const res = await app.request('/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.data.input.intelligenceRequests).toBe(0);
      expect(data.data.input.lightweightRequests).toBe(0);
      expect(data.data.input.playwrightRequests).toBe(0);
    });

    it('should calculate overage costs correctly', async () => {
      const res = await app.request('/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intelligenceRequests: 35000, // Exceeds Starter 30000 limit
          lightweightRequests: 0,
          playwrightRequests: 0,
        }),
      });

      const data = await res.json();
      const starterTier = data.data.calculations.find((c: any) => c.tier === 'STARTER');

      // Total requests = 35000, exceeds 30000 by 5000
      expect(starterTier.withinLimits).toBe(false);

      // Overage calculation:
      // Overage requests = 5000
      // Overage percentage = 5000/35000 = 0.143
      // Total units = 35000 * 1 = 35000
      // Overage units = 35000 * 0.143 = 5000
      // Overage cost = (5000/1000) * 0.50 * 1.5 = $3.75
      expect(starterTier.overageCost).toBeCloseTo(3.75, 2);
    });
  });

  describe('Root endpoint includes pricing calculator', () => {
    it('should list pricing calculator in endpoints', async () => {
      const res = await app.request('/');
      const data = await res.json();

      expect(data.endpoints.pricingCalculator).toBe('/pricing');
    });
  });
});
