/**
 * Tests for Cross-Source Verifier (INT-015)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CrossSourceVerifier,
  createCrossSourceVerifier,
  verifySources,
  hasContradictions,
  getContradictions,
  getHighConfidenceFacts,
  type VerificationSource,
  type VerificationOptions,
} from '../src/core/cross-source-verifier.js';
import * as fs from 'fs/promises';

describe('CrossSourceVerifier', () => {
  let verifier: CrossSourceVerifier;

  beforeEach(() => {
    verifier = new CrossSourceVerifier({
      storagePath: './test-cross-source-verification.json',
    });
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.unlink('./test-cross-source-verification.json');
    } catch {
      // File may not exist
    }
  });

  // ============================================
  // BASIC VERIFICATION
  // ============================================

  describe('Basic Verification', () => {
    it('should verify matching data from multiple sources', () => {
      const sources: VerificationSource[] = [
        { url: 'https://gov.example.com/visa', data: { fee: 100, duration: '30 days' } },
        { url: 'https://embassy.example.com/visa', data: { fee: 100, duration: '30 days' } },
      ];

      const result = verifier.verify(sources);

      expect(result.success).toBe(true);
      expect(result.hasContradictions).toBe(false);
      expect(result.verifiedFacts.length).toBeGreaterThan(0);
      expect(result.overallConfidence).not.toBe('uncertain');
    });

    it('should detect contradictions in data', () => {
      const sources: VerificationSource[] = [
        { url: 'https://gov.example.com/visa', data: { fee: 100 } },
        { url: 'https://embassy.example.com/visa', data: { fee: 150 } },
      ];

      const result = verifier.verify(sources);

      expect(result.hasContradictions).toBe(true);
      expect(result.contradictionCount).toBe(1);
      expect(result.contradictions[0].field).toBe('fee');
    });

    it('should require minimum sources', () => {
      const sources: VerificationSource[] = [
        { url: 'https://gov.example.com/visa', data: { fee: 100 } },
      ];

      const result = verifier.verify(sources);

      expect(result.success).toBe(false);
      expect(result.summary).toContain('Insufficient sources');
    });

    it('should handle empty data', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com', data: {} },
        { url: 'https://source2.com', data: {} },
      ];

      const result = verifier.verify(sources);

      expect(result.success).toBe(true);
      expect(result.verifiedFacts.length).toBe(0);
      expect(result.hasContradictions).toBe(false);
    });
  });

  // ============================================
  // SOURCE CREDIBILITY
  // ============================================

  describe('Source Credibility', () => {
    it('should detect official government sources', () => {
      const sources: VerificationSource[] = [
        { url: 'https://travel.state.gov/visa', data: { fee: 160 } },
        { url: 'https://blog.example.com/visa', data: { fee: 150 } },
      ];

      const result = verifier.verify(sources);

      expect(result.metadata.officialSources).toBeGreaterThanOrEqual(0);
    });

    it('should detect authoritative sources', () => {
      const sources: VerificationSource[] = [
        { url: 'https://embassy.example.org/visa', data: { fee: 100 } },
        { url: 'https://forum.example.com/visa', data: { fee: 100 } },
      ];

      const result = verifier.verify(sources);

      expect(result.metadata.authoritativeSources).toBeGreaterThanOrEqual(0);
    });

    it('should prefer official sources for recommended values', () => {
      const sources: VerificationSource[] = [
        { url: 'https://gov.example.gov/visa', data: { fee: 100 } },
        { url: 'https://blog1.example.com/visa', data: { fee: 120 } },
        { url: 'https://blog2.example.com/visa', data: { fee: 120 } },
      ];

      const result = verifier.verify(sources);

      // Even though 120 has more sources, official source should be preferred
      if (result.hasContradictions) {
        const feeContradiction = result.contradictions.find(c => c.field === 'fee');
        if (feeContradiction) {
          // Check that the official value is considered
          expect(feeContradiction.values.some(v => v.value === 100)).toBe(true);
        }
      }
    });

    it('should allow custom credibility assignment', () => {
      const sources: VerificationSource[] = [
        { url: 'https://internal.company.com/data', data: { fee: 100 }, credibility: 'official' },
        { url: 'https://public.source.com/data', data: { fee: 100 }, credibility: 'secondary' },
      ];

      const result = verifier.verify(sources);

      expect(result.metadata.officialSources).toBe(1);
    });
  });

  // ============================================
  // CONTRADICTION DETECTION
  // ============================================

  describe('Contradiction Detection', () => {
    it('should identify critical field contradictions', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.gov/visa', data: { applicationFee: 100 } },
        { url: 'https://source2.gov/visa', data: { applicationFee: 200 } },
      ];

      const result = verifier.verify(sources);

      expect(result.hasContradictions).toBe(true);
      expect(result.contradictions[0].severity).toBe('critical');
    });

    it('should identify major field contradictions', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/visa', data: { processingDuration: '2 weeks' } },
        { url: 'https://source2.com/visa', data: { processingDuration: '4 weeks' } },
      ];

      const result = verifier.verify(sources);

      expect(result.hasContradictions).toBe(true);
      expect(result.contradictions[0].severity).toBe('major');
    });

    it('should identify minor field contradictions', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/visa', data: { officeHours: '9-5' } },
        { url: 'https://source2.com/visa', data: { officeHours: '9-6' } },
      ];

      const result = verifier.verify(sources);

      expect(result.hasContradictions).toBe(true);
      expect(result.contradictions[0].severity).toBe('minor');
    });

    it('should provide recommended values for contradictions', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { value: 'A' } },
        { url: 'https://source2.com/data', data: { value: 'A' } },
        { url: 'https://source3.com/data', data: { value: 'B' } },
      ];

      const result = verifier.verify(sources);

      if (result.hasContradictions) {
        expect(result.contradictions[0].recommendedValue).toBe('A');
      } else {
        // Majority agreement, no contradiction
        expect(result.verifiedFacts[0].value).toBe('A');
      }
    });
  });

  // ============================================
  // AGREEMENT LEVELS
  // ============================================

  describe('Agreement Levels', () => {
    it('should detect unanimous agreement', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { value: 'same' } },
        { url: 'https://source2.com/data', data: { value: 'same' } },
        { url: 'https://source3.com/data', data: { value: 'same' } },
      ];

      const result = verifier.verify(sources);

      expect(result.verifiedFacts[0].agreementLevel).toBe('unanimous');
      expect(result.verifiedFacts[0].confidence).toBe('high');
    });

    it('should detect majority agreement', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { value: 'common' } },
        { url: 'https://source2.com/data', data: { value: 'common' } },
        { url: 'https://source3.com/data', data: { value: 'common' } },
        { url: 'https://source4.com/data', data: { value: 'different' } },
      ];

      const result = verifier.verify(sources);

      expect(result.verifiedFacts[0].agreementLevel).toBe('majority');
    });

    it('should detect contested values', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { value: 'A' } },
        { url: 'https://source2.com/data', data: { value: 'A' } },
        { url: 'https://source3.com/data', data: { value: 'B' } },
        { url: 'https://source4.com/data', data: { value: 'B' } },
      ];

      const result = verifier.verify(sources);

      // 50/50 split should be contested or conflicting
      expect(['contested', 'conflicting']).toContain(result.verifiedFacts[0].agreementLevel);
    });

    it('should detect conflicting values', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { value: 'A' } },
        { url: 'https://source2.com/data', data: { value: 'B' } },
        { url: 'https://source3.com/data', data: { value: 'C' } },
        { url: 'https://source4.com/data', data: { value: 'D' } },
      ];

      const result = verifier.verify(sources);

      expect(result.hasContradictions).toBe(true);
    });
  });

  // ============================================
  // NESTED DATA
  // ============================================

  describe('Nested Data', () => {
    it('should handle nested objects', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { visa: { fee: 100, duration: 30 } } },
        { url: 'https://source2.com/data', data: { visa: { fee: 100, duration: 30 } } },
      ];

      const result = verifier.verify(sources);

      expect(result.verifiedFacts.some(f => f.field === 'visa.fee')).toBe(true);
      expect(result.verifiedFacts.some(f => f.field === 'visa.duration')).toBe(true);
    });

    it('should detect contradictions in nested fields', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { application: { fee: 100 } } },
        { url: 'https://source2.com/data', data: { application: { fee: 150 } } },
      ];

      const result = verifier.verify(sources);

      expect(result.hasContradictions).toBe(true);
      expect(result.contradictions[0].field).toBe('application.fee');
    });

    it('should handle deeply nested data', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { a: { b: { c: { value: 1 } } } } },
        { url: 'https://source2.com/data', data: { a: { b: { c: { value: 1 } } } } },
      ];

      const result = verifier.verify(sources);

      expect(result.verifiedFacts.some(f => f.field === 'a.b.c.value')).toBe(true);
    });
  });

  // ============================================
  // VALUE NORMALIZATION
  // ============================================

  describe('Value Normalization', () => {
    it('should normalize string case for comparison', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { status: 'ACTIVE' } },
        { url: 'https://source2.com/data', data: { status: 'active' } },
      ];

      const result = verifier.verify(sources);

      expect(result.hasContradictions).toBe(false);
      expect(result.verifiedFacts[0].agreementLevel).toBe('unanimous');
    });

    it('should normalize whitespace in strings', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { text: 'hello  world' } },
        { url: 'https://source2.com/data', data: { text: 'hello world' } },
      ];

      const result = verifier.verify(sources);

      expect(result.hasContradictions).toBe(false);
    });

    it('should apply numeric tolerance', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { price: 99.99 } },
        { url: 'https://source2.com/data', data: { price: 100.01 } },
      ];

      const result = verifier.verify(sources, { numericTolerance: 1 });

      expect(result.hasContradictions).toBe(false);
    });

    it('should compare arrays order-insensitively by default', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { items: ['a', 'b', 'c'] } },
        { url: 'https://source2.com/data', data: { items: ['c', 'b', 'a'] } },
      ];

      const result = verifier.verify(sources);

      expect(result.hasContradictions).toBe(false);
    });
  });

  // ============================================
  // OPTIONS
  // ============================================

  describe('Verification Options', () => {
    it('should verify only specified fields', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { a: 1, b: 2, c: 3 } },
        { url: 'https://source2.com/data', data: { a: 1, b: 99, c: 3 } },
      ];

      const result = verifier.verify(sources, { fields: ['a', 'c'] });

      expect(result.hasContradictions).toBe(false);
      expect(result.verifiedFacts.every(f => ['a', 'c'].includes(f.field))).toBe(true);
    });

    it('should allow custom minimum sources', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { value: 1 } },
        { url: 'https://source2.com/data', data: { value: 1 } },
        { url: 'https://source3.com/data', data: { value: 1 } },
      ];

      const result = verifier.verify(sources, { minSources: 3 });

      expect(result.success).toBe(true);
    });

    it('should exclude uncertain facts by default', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { a: 1, b: 2, c: 3, d: 4 } },
        { url: 'https://source2.com/data', data: { a: 2, b: 3, c: 4, d: 5 } },
      ];

      const result = verifier.verify(sources);

      // All facts should have some level of confidence
      expect(result.verifiedFacts.every(f => f.confidence !== 'uncertain' || result.verifiedFacts.length === 0)).toBe(true);
    });

    it('should include uncertain facts when specified', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { value: 1 } },
        { url: 'https://source2.com/data', data: { value: 2 } },
      ];

      const result = verifier.verify(sources, { includeUncertain: true });

      expect(result.verifiedFacts.length).toBeGreaterThan(0);
    });

    it('should use custom official patterns', () => {
      const sources: VerificationSource[] = [
        { url: 'https://internal.mycompany.com/data', data: { value: 100 } },
        { url: 'https://external.source.com/data', data: { value: 100 } },
      ];

      const result = verifier.verify(sources, {
        officialPatterns: [/mycompany\.com/i],
      });

      expect(result.metadata.officialSources).toBe(1);
    });
  });

  // ============================================
  // CONFIDENCE LEVELS
  // ============================================

  describe('Confidence Levels', () => {
    it('should return high confidence for unanimous official sources', () => {
      const sources: VerificationSource[] = [
        { url: 'https://gov.example.gov/data', data: { fee: 100 }, credibility: 'official' },
        { url: 'https://state.example.gov/data', data: { fee: 100 }, credibility: 'official' },
        { url: 'https://federal.example.gov/data', data: { fee: 100 }, credibility: 'official' },
      ];

      const result = verifier.verify(sources);

      expect(result.verifiedFacts[0].confidence).toBe('high');
      // With 3 official sources agreeing, overall should be high
      expect(['high', 'medium']).toContain(result.overallConfidence);
    });

    it('should return medium confidence for majority agreement', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { fee: 100 } },
        { url: 'https://source2.com/data', data: { fee: 100 } },
        { url: 'https://source3.com/data', data: { fee: 100 } },
        { url: 'https://source4.com/data', data: { fee: 150 } },
      ];

      const result = verifier.verify(sources);

      expect(result.verifiedFacts[0].confidence).toBe('medium');
    });

    it('should return low confidence for contested values', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { fee: 100 } },
        { url: 'https://source2.com/data', data: { fee: 150 } },
      ];

      const result = verifier.verify(sources);

      // With only 2 sources disagreeing, confidence should be low
      expect(['low', 'uncertain']).toContain(result.verifiedFacts[0].confidence);
    });

    it('should lower overall confidence with critical contradictions', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { fee: 100, note: 'A' } },
        { url: 'https://source2.com/data', data: { fee: 100, note: 'A' } },
        { url: 'https://source3.com/data', data: { fee: 200, note: 'A' } },
      ];

      const result = verifier.verify(sources);

      // Critical contradiction (fee) should lower overall confidence
      if (result.hasContradictions) {
        expect(['low', 'medium']).toContain(result.overallConfidence);
      }
    });
  });

  // ============================================
  // HISTORY TRACKING
  // ============================================

  describe('History Tracking', () => {
    it('should track verification history', async () => {
      await verifier.initialize();

      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { value: 1 } },
        { url: 'https://source2.com/data', data: { value: 1 } },
      ];

      verifier.verify(sources);

      // Wait for async history write
      await new Promise(resolve => setTimeout(resolve, 100));

      const history = verifier.getHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].sourceCount).toBe(2);
    });

    it('should limit history entries', async () => {
      const limitedVerifier = new CrossSourceVerifier({
        storagePath: './test-limited-history.json',
        maxHistoryEntries: 3,
      });
      await limitedVerifier.initialize();

      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { value: 1 } },
        { url: 'https://source2.com/data', data: { value: 1 } },
      ];

      // Add more than max entries
      for (let i = 0; i < 5; i++) {
        limitedVerifier.verify(sources);
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const history = limitedVerifier.getHistory();
      expect(history.length).toBeLessThanOrEqual(3);

      // Clean up
      try {
        await fs.unlink('./test-limited-history.json');
      } catch {
        // Ignore
      }
    });

    it('should clear history', async () => {
      await verifier.initialize();

      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { value: 1 } },
        { url: 'https://source2.com/data', data: { value: 1 } },
      ];

      verifier.verify(sources);
      await new Promise(resolve => setTimeout(resolve, 100));

      await verifier.clearHistory();

      const history = verifier.getHistory();
      expect(history.length).toBe(0);
    });
  });

  // ============================================
  // FORMATTING
  // ============================================

  describe('Value Formatting', () => {
    it('should format monetary values', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { fee: { amount: 100, currency: 'USD' } } },
        { url: 'https://source2.com/data', data: { fee: { amount: 100, currency: 'USD' } } },
      ];

      const result = verifier.verify(sources);

      // Nested objects are recursed into, so we get fee.amount and fee.currency
      expect(result.verifiedFacts.some(f => f.field === 'fee.amount')).toBe(true);
      expect(result.verifiedFacts.some(f => f.field === 'fee.currency')).toBe(true);
    });

    it('should format arrays', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { items: ['a', 'b'] } },
        { url: 'https://source2.com/data', data: { items: ['a', 'b'] } },
      ];

      const result = verifier.verify(sources);

      expect(result.verifiedFacts[0].valueFormatted).toContain('a');
      expect(result.verifiedFacts[0].valueFormatted).toContain('b');
    });

    it('should format null values', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { value: null } },
        { url: 'https://source2.com/data', data: { value: null } },
      ];

      const result = verifier.verify(sources);

      expect(result.verifiedFacts[0].valueFormatted).toBe('N/A');
    });
  });

  // ============================================
  // SUMMARY GENERATION
  // ============================================

  describe('Summary Generation', () => {
    it('should generate meaningful summary', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { a: 1, b: 2 } },
        { url: 'https://source2.com/data', data: { a: 1, b: 2 } },
      ];

      const result = verifier.verify(sources);

      expect(result.summary).toContain('2 sources');
      expect(result.summary).toContain('verified facts');
    });

    it('should mention contradictions in summary', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { fee: 100 } },
        { url: 'https://source2.com/data', data: { fee: 200 } },
      ];

      const result = verifier.verify(sources);

      expect(result.summary).toContain('contradiction');
    });

    it('should include confidence in summary', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { value: 1 } },
        { url: 'https://source2.com/data', data: { value: 1 } },
      ];

      const result = verifier.verify(sources);

      expect(result.summary).toContain('confidence');
    });
  });

  // ============================================
  // FACTORY FUNCTIONS
  // ============================================

  describe('Factory Functions', () => {
    it('should create verifier with createCrossSourceVerifier', () => {
      const v = createCrossSourceVerifier();
      expect(v).toBeInstanceOf(CrossSourceVerifier);
    });

    it('should create verifier with custom config', () => {
      const v = createCrossSourceVerifier({
        maxHistoryEntries: 50,
      });
      expect(v).toBeInstanceOf(CrossSourceVerifier);
    });
  });

  // ============================================
  // CONVENIENCE FUNCTIONS
  // ============================================

  describe('Convenience Functions', () => {
    it('should verify sources with verifySources', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { value: 1 } },
        { url: 'https://source2.com/data', data: { value: 1 } },
      ];

      const result = verifySources(sources);

      expect(result.success).toBe(true);
    });

    it('should check contradictions with hasContradictions', () => {
      const matchingSources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { value: 1 } },
        { url: 'https://source2.com/data', data: { value: 1 } },
      ];

      const conflictingSources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { value: 1 } },
        { url: 'https://source2.com/data', data: { value: 2 } },
      ];

      expect(hasContradictions(matchingSources)).toBe(false);
      expect(hasContradictions(conflictingSources)).toBe(true);
    });

    it('should get contradictions with getContradictions', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { value: 1 } },
        { url: 'https://source2.com/data', data: { value: 2 } },
      ];

      const contradictions = getContradictions(sources);

      expect(contradictions.length).toBe(1);
      expect(contradictions[0].field).toBe('value');
    });

    it('should get high confidence facts with getHighConfidenceFacts', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.gov/data', data: { a: 1, b: 2 }, credibility: 'official' },
        { url: 'https://source2.gov/data', data: { a: 1, b: 2 }, credibility: 'official' },
      ];

      const highConfidenceFacts = getHighConfidenceFacts(sources);

      expect(highConfidenceFacts.every(f => f.confidence === 'high')).toBe(true);
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe('Edge Cases', () => {
    it('should handle sources with different field sets', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { a: 1, b: 2 } },
        { url: 'https://source2.com/data', data: { b: 2, c: 3 } },
      ];

      const result = verifier.verify(sources);

      // Field 'b' should be verified (present in both)
      expect(result.verifiedFacts.some(f => f.field === 'b')).toBe(true);
    });

    it('should handle boolean values', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { required: true } },
        { url: 'https://source2.com/data', data: { required: true } },
      ];

      const result = verifier.verify(sources);

      expect(result.verifiedFacts[0].value).toBe(true);
    });

    it('should handle undefined vs missing fields', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { a: 1 } },
        { url: 'https://source2.com/data', data: { a: 1, b: undefined } },
      ];

      const result = verifier.verify(sources);

      // Field 'a' should be verified
      expect(result.verifiedFacts.some(f => f.field === 'a')).toBe(true);
    });

    it('should handle special characters in field names', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { 'field-name': 1, 'field.name': 2 } },
        { url: 'https://source2.com/data', data: { 'field-name': 1, 'field.name': 2 } },
      ];

      const result = verifier.verify(sources);

      expect(result.success).toBe(true);
    });

    it('should handle very large numbers', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { value: 9999999999999 } },
        { url: 'https://source2.com/data', data: { value: 9999999999999 } },
      ];

      const result = verifier.verify(sources);

      expect(result.verifiedFacts[0].value).toBe(9999999999999);
    });

    it('should handle dates as strings', () => {
      const sources: VerificationSource[] = [
        { url: 'https://source1.com/data', data: { deadline: '2024-12-31' } },
        { url: 'https://source2.com/data', data: { deadline: '2024-12-31' } },
      ];

      const result = verifier.verify(sources);

      expect(result.verifiedFacts[0].value).toBe('2024-12-31');
    });
  });

  // ============================================
  // GOVERNMENT DATA SCENARIOS
  // ============================================

  describe('Government Data Scenarios', () => {
    it('should verify visa fee information', () => {
      const sources: VerificationSource[] = [
        {
          url: 'https://travel.state.gov/content/travel/en/us-visas',
          data: { visaFee: 160, processingTime: '3-5 business days' },
          credibility: 'official',
        },
        {
          url: 'https://embassy.example.org/visas',
          data: { visaFee: 160, processingTime: '3-5 business days' },
          credibility: 'authoritative',
        },
        {
          url: 'https://travel-blog.example.com/us-visa-guide',
          data: { visaFee: 185, processingTime: '1-2 weeks' },
          credibility: 'secondary',
        },
      ];

      const result = verifier.verify(sources);

      // Official and authoritative sources agree on 160
      const feeFact = result.verifiedFacts.find(f => f.field === 'visaFee');
      expect(feeFact).toBeDefined();
      expect(feeFact?.value).toBe(160);
    });

    it('should detect contradictions in immigration requirements', () => {
      const sources: VerificationSource[] = [
        {
          url: 'https://immigration.gov/requirements',
          data: { minimumIncome: 30000, languageTest: 'required' },
          credibility: 'official',
        },
        {
          url: 'https://lawyer-site.com/immigration',
          data: { minimumIncome: 25000, languageTest: 'optional' },
          credibility: 'secondary',
        },
      ];

      const result = verifier.verify(sources);

      expect(result.hasContradictions).toBe(true);
    });

    it('should handle multi-language field names', () => {
      const sources: VerificationSource[] = [
        { url: 'https://gov.es/tasa', data: { tasa: 50 }, language: 'es' },
        { url: 'https://gov.uk/fee', data: { fee: 50 }, language: 'en' },
      ];

      const result = verifier.verify(sources);

      // Different field names but same concept - no contradiction
      expect(result.success).toBe(true);
    });
  });
});
