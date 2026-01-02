/**
 * API-Only Verification Tests
 *
 * These tests verify that packages/api ONLY contains API routes,
 * not marketing pages (those belong in unbrowser-marketing repo).
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
const MARKETING_FILES = [
  'landing.ts',
  'auth.ts',
  'pricing-page.ts',
  'pricing-calculator.ts',
  'dashboard-ui.ts',
];

describe('API Package Should Only Contain API Routes', () => {
  describe('Marketing files should NOT exist (belong in unbrowser-marketing)', () => {
    MARKETING_FILES.forEach((file) => {
      it(`should NOT have ${file}`, () => {
        const filePath = path.join(API_ROUTES_DIR, file);
        expect(fs.existsSync(filePath)).toBe(false);
      });
    });
  });

  describe('API files that should exist', () => {
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
     * This test will FAIL before deduplication (directory exists)
     * and PASS after deduplication (directory removed).
     *
     * Skip this test until ready to remove SDK.
     */
    it.skip('should NOT have packages/core directory (SDK in rabbit-found/unbrowser)', () => {
      expect(fs.existsSync(SDK_DIR)).toBe(false);
    });
  });

  describe('SDK directory currently present (to be removed)', () => {
    it('currently has packages/core (will be removed later)', () => {
      const exists = fs.existsSync(SDK_DIR);

      if (exists) {
        console.log('  NOTE: packages/core exists - SDK removal is Phase 2');
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
    MARKETING_FILES.forEach((file) => {
      const filePath = path.join(API_ROUTES_DIR, file);
      if (fs.existsSync(filePath)) {
        duplications.push(`packages/api/src/routes/${file}`);
      }
    });

    // Check SDK
    const sdkDir = path.join(process.cwd(), 'packages/core');
    if (fs.existsSync(sdkDir)) {
      duplications.push('packages/core/ (SDK - Phase 2)');
    }

    console.log('\n=== DEDUPLICATION STATUS ===');
    if (duplications.length === 0) {
      console.log('All deduplication complete!');
    } else if (duplications.length === 1 && duplications[0].includes('SDK')) {
      console.log('Phase 1 (marketing pages) complete!');
      console.log('Phase 2 (SDK removal) pending:');
      duplications.forEach((d) => console.log(`  - ${d}`));
    } else {
      console.log(`Found ${duplications.length} items to deduplicate:`);
      duplications.forEach((d) => console.log(`  - ${d}`));
    }
    console.log('============================\n');

    // This test always passes - it's just a report
    expect(true).toBe(true);
  });
});
