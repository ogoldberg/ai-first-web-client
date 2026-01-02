/**
 * API-Only Verification Tests
 *
 * These tests verify that packages/api ONLY contains API routes,
 * not marketing pages. They should FAIL before deduplication
 * and PASS after.
 *
 * Run with: npm test -- tests/dedup/api-only.test.ts
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const API_ROUTES_DIR = path.join(process.cwd(), 'packages/api/src/routes');

// Files that SHOULD exist in packages/api (API functionality)
const EXPECTED_API_FILES = [
  'browse.ts',
  'health.ts',
  'docs.ts',
  'admin.ts',
  'admin-ui.ts',
  'tenants.ts',
  'billing.ts',
  'workflows.ts',
  'discovery.ts',
  'beta.ts',
  'dashboard.ts', // API dashboard data, not UI
  'llm-docs.ts',
  'marketplace.ts',
  'predictions.ts',
  'skill-packs.ts',
  'pdf.ts',
  'inspection-ui.ts', // API inspection tool
];

// Files that should NOT exist in packages/api (belong in unbrowser-marketing)
const MARKETING_FILES_TO_REMOVE = [
  'landing.ts',
  'auth.ts',
  'pricing-page.ts',
  'pricing-calculator.ts',
  'dashboard-ui.ts',
];

describe('API Package Should Only Contain API Routes', () => {
  describe('Marketing files that should be removed', () => {
    /**
     * These tests will FAIL before deduplication (files exist)
     * and PASS after deduplication (files removed).
     *
     * Skip these tests until ready to deduplicate.
     */

    it.skip('should NOT have landing.ts (belongs in unbrowser-marketing)', () => {
      const filePath = path.join(API_ROUTES_DIR, 'landing.ts');
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it.skip('should NOT have auth.ts (belongs in unbrowser-marketing)', () => {
      const filePath = path.join(API_ROUTES_DIR, 'auth.ts');
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it.skip('should NOT have pricing-page.ts (belongs in unbrowser-marketing)', () => {
      const filePath = path.join(API_ROUTES_DIR, 'pricing-page.ts');
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it.skip('should NOT have pricing-calculator.ts (belongs in unbrowser-marketing)', () => {
      const filePath = path.join(API_ROUTES_DIR, 'pricing-calculator.ts');
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it.skip('should NOT have dashboard-ui.ts (belongs in unbrowser-marketing)', () => {
      const filePath = path.join(API_ROUTES_DIR, 'dashboard-ui.ts');
      expect(fs.existsSync(filePath)).toBe(false);
    });
  });

  describe('Marketing files currently present (to be removed)', () => {
    /**
     * These tests document what currently exists.
     * They will be removed after deduplication.
     */

    MARKETING_FILES_TO_REMOVE.forEach((file) => {
      it(`currently has ${file} (will be removed)`, () => {
        const filePath = path.join(API_ROUTES_DIR, file);
        const exists = fs.existsSync(filePath);

        if (exists) {
          console.log(`  WARNING: ${file} exists in packages/api - should be in unbrowser-marketing only`);
        }

        // This documents current state - doesn't fail
        expect(true).toBe(true);
      });
    });
  });

  describe('API files that should remain', () => {
    EXPECTED_API_FILES.forEach((file) => {
      it(`should have ${file}`, () => {
        const filePath = path.join(API_ROUTES_DIR, file);
        expect(fs.existsSync(filePath)).toBe(true);
      });
    });
  });
});

describe('SDK Package Should Be Removed', () => {
  const SDK_DIR = path.join(process.cwd(), 'packages/core');

  describe('SDK directory (to be removed)', () => {
    /**
     * These tests will FAIL before deduplication (directory exists)
     * and PASS after deduplication (directory removed).
     *
     * Skip these tests until ready to deduplicate.
     */

    it.skip('should NOT have packages/core directory (SDK in rabbit-found/unbrowser)', () => {
      expect(fs.existsSync(SDK_DIR)).toBe(false);
    });
  });

  describe('SDK directory currently present (to be removed)', () => {
    it('currently has packages/core (will be removed)', () => {
      const exists = fs.existsSync(SDK_DIR);

      if (exists) {
        console.log('  WARNING: packages/core exists - SDK should be in rabbit-found/unbrowser only');
      }

      // This documents current state - doesn't fail
      expect(true).toBe(true);
    });
  });
});

describe('Deduplication Summary', () => {
  it('should report current duplication status', () => {
    const duplications: string[] = [];

    // Check marketing files
    MARKETING_FILES_TO_REMOVE.forEach((file) => {
      const filePath = path.join(API_ROUTES_DIR, file);
      if (fs.existsSync(filePath)) {
        duplications.push(`packages/api/src/routes/${file}`);
      }
    });

    // Check SDK
    const sdkDir = path.join(process.cwd(), 'packages/core');
    if (fs.existsSync(sdkDir)) {
      duplications.push('packages/core/ (entire SDK)');
    }

    console.log('\n=== DEDUPLICATION STATUS ===');
    if (duplications.length === 0) {
      console.log('No duplications found - deduplication complete!');
    } else {
      console.log(`Found ${duplications.length} items to deduplicate:`);
      duplications.forEach((d) => console.log(`  - ${d}`));
    }
    console.log('============================\n');

    // This test always passes - it's just a report
    expect(true).toBe(true);
  });
});
