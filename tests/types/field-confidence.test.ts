/**
 * Tests for Field-Level Confidence Map (CX-002)
 *
 * Validates the field-level confidence system that allows LLM clients to:
 * - Understand reliability of each extracted field
 * - Weight different data appropriately when making decisions
 * - Request re-extraction for low-confidence fields
 */

import { describe, it, expect } from 'vitest';
import {
  scoreToLevel,
  createFieldConfidence,
  aggregateConfidence,
  boostForValidation,
  confidenceFromSource,
  SOURCE_CONFIDENCE_SCORES,
  type FieldConfidence,
  type ExtractionSource,
  type ConfidenceLevel,
} from '../../src/types/field-confidence.js';

describe('field-confidence', () => {
  describe('scoreToLevel', () => {
    it('should return very_high for scores >= 0.9', () => {
      expect(scoreToLevel(0.9)).toBe('very_high');
      expect(scoreToLevel(0.95)).toBe('very_high');
      expect(scoreToLevel(1.0)).toBe('very_high');
    });

    it('should return high for scores >= 0.7 and < 0.9', () => {
      expect(scoreToLevel(0.7)).toBe('high');
      expect(scoreToLevel(0.85)).toBe('high');
      expect(scoreToLevel(0.89)).toBe('high');
    });

    it('should return medium for scores >= 0.5 and < 0.7', () => {
      expect(scoreToLevel(0.5)).toBe('medium');
      expect(scoreToLevel(0.6)).toBe('medium');
      expect(scoreToLevel(0.69)).toBe('medium');
    });

    it('should return low for scores >= 0.3 and < 0.5', () => {
      expect(scoreToLevel(0.3)).toBe('low');
      expect(scoreToLevel(0.4)).toBe('low');
      expect(scoreToLevel(0.49)).toBe('low');
    });

    it('should return very_low for scores < 0.3', () => {
      expect(scoreToLevel(0.0)).toBe('very_low');
      expect(scoreToLevel(0.1)).toBe('very_low');
      expect(scoreToLevel(0.29)).toBe('very_low');
    });
  });

  describe('createFieldConfidence', () => {
    it('should create a FieldConfidence object from score and source', () => {
      const confidence = createFieldConfidence(0.85, 'selector_match', 'Test reason');

      expect(confidence).toEqual({
        score: 0.85,
        level: 'high',
        source: 'selector_match',
        reason: 'Test reason',
      });
    });

    it('should clamp score to 0-1 range', () => {
      const high = createFieldConfidence(1.5, 'api_response');
      expect(high.score).toBe(1);

      const low = createFieldConfidence(-0.5, 'fallback');
      expect(low.score).toBe(0);
    });

    it('should compute level from score', () => {
      const veryHigh = createFieldConfidence(0.95, 'structured_data');
      expect(veryHigh.level).toBe('very_high');

      const low = createFieldConfidence(0.35, 'heuristic');
      expect(low.level).toBe('low');
    });

    it('should work without reason', () => {
      const confidence = createFieldConfidence(0.75, 'meta_tags');

      expect(confidence.reason).toBeUndefined();
      expect(confidence.score).toBe(0.75);
    });
  });

  describe('aggregateConfidence', () => {
    it('should return unknown for empty array', () => {
      const result = aggregateConfidence([]);

      expect(result.score).toBe(0);
      expect(result.source).toBe('unknown');
      expect(result.reason).toContain('No fields');
    });

    it('should compute weighted geometric mean', () => {
      const confidences: FieldConfidence[] = [
        createFieldConfidence(0.9, 'selector_match'),
        createFieldConfidence(0.6, 'heuristic'),
      ];

      const result = aggregateConfidence(confidences);

      // Geometric mean of 0.9 and 0.6 is sqrt(0.9 * 0.6) = ~0.735
      expect(result.score).toBeGreaterThan(0.7);
      expect(result.score).toBeLessThan(0.8);
    });

    it('should apply weights when provided', () => {
      const confidences: FieldConfidence[] = [
        createFieldConfidence(0.9, 'selector_match'),
        createFieldConfidence(0.3, 'fallback'),
      ];

      // Weight heavily toward the high-confidence source
      const weighted = aggregateConfidence(confidences, [0.9, 0.1]);

      // Without weights would give ~0.52 (geometric mean)
      // With weights heavily on high value, should be higher
      expect(weighted.score).toBeGreaterThan(0.6);
    });

    it('should identify lowest confidence source', () => {
      const confidences: FieldConfidence[] = [
        createFieldConfidence(0.9, 'selector_match'),
        createFieldConfidence(0.3, 'fallback'),
      ];

      const result = aggregateConfidence(confidences);

      expect(result.source).toBe('fallback');
      expect(result.reason).toContain('fallback');
    });

    it('should handle single confidence', () => {
      const confidences: FieldConfidence[] = [
        createFieldConfidence(0.85, 'api_response', 'Test'),
      ];

      const result = aggregateConfidence(confidences);

      expect(result.score).toBeCloseTo(0.85, 2);
    });

    it('should handle zero total weight', () => {
      const confidences: FieldConfidence[] = [
        createFieldConfidence(0.9, 'selector_match'),
        createFieldConfidence(0.6, 'heuristic'),
      ];

      // Pass zero weights
      const result = aggregateConfidence(confidences, [0, 0]);

      expect(result.score).toBe(0);
      expect(result.source).toBe('unknown');
      expect(result.reason).toContain('zero total weight');
    });
  });

  describe('boostForValidation', () => {
    it('should increase score when validation passes', () => {
      const original = createFieldConfidence(0.7, 'heuristic');
      const boosted = boostForValidation(original, true);

      expect(boosted.score).toBeCloseTo(0.8, 10);
      expect(boosted.reason?.toLowerCase()).toMatch(/validat/i);
    });

    it('should decrease score when validation fails', () => {
      const original = createFieldConfidence(0.7, 'heuristic');
      const reduced = boostForValidation(original, false);

      expect(reduced.score).toBeCloseTo(0.6, 10);
      expect(reduced.reason?.toLowerCase()).toContain('validation failed');
    });

    it('should not exceed 1.0 when boosting', () => {
      const original = createFieldConfidence(0.95, 'api_response');
      const boosted = boostForValidation(original, true);

      expect(boosted.score).toBe(1.0);
    });

    it('should not go below 0.0 when reducing', () => {
      const original = createFieldConfidence(0.05, 'fallback');
      const reduced = boostForValidation(original, false);

      expect(reduced.score).toBe(0);
    });

    it('should use custom boost amount', () => {
      const original = createFieldConfidence(0.5, 'heuristic');
      const boosted = boostForValidation(original, true, 0.2);

      expect(boosted.score).toBe(0.7);
    });

    it('should update level after boost', () => {
      const original = createFieldConfidence(0.68, 'heuristic');
      expect(original.level).toBe('medium');

      const boosted = boostForValidation(original, true, 0.1);
      expect(boosted.level).toBe('high');
    });
  });

  describe('confidenceFromSource', () => {
    it('should create confidence from source with default score', () => {
      const structured = confidenceFromSource('structured_data');
      expect(structured.score).toBe(0.95);
      expect(structured.source).toBe('structured_data');
      expect(structured.level).toBe('very_high');

      const heuristic = confidenceFromSource('heuristic');
      expect(heuristic.score).toBe(0.50);
      expect(heuristic.source).toBe('heuristic');
      expect(heuristic.level).toBe('medium');
    });

    it('should include reason when provided', () => {
      const conf = confidenceFromSource('api_response', 'Extracted from REST API');

      expect(conf.reason).toBe('Extracted from REST API');
    });
  });

  describe('SOURCE_CONFIDENCE_SCORES', () => {
    it('should have scores for all extraction sources', () => {
      const sources: ExtractionSource[] = [
        'structured_data',
        'api_response',
        'graphql',
        'framework_data',
        'selector_match',
        'learned_pattern',
        'meta_tags',
        'heuristic',
        'fallback',
        'unknown',
      ];

      for (const source of sources) {
        expect(SOURCE_CONFIDENCE_SCORES[source]).toBeDefined();
        expect(SOURCE_CONFIDENCE_SCORES[source]).toBeGreaterThanOrEqual(0);
        expect(SOURCE_CONFIDENCE_SCORES[source]).toBeLessThanOrEqual(1);
      }
    });

    it('should have structured data higher than fallback', () => {
      expect(SOURCE_CONFIDENCE_SCORES.structured_data).toBeGreaterThan(
        SOURCE_CONFIDENCE_SCORES.fallback
      );
    });

    it('should have api_response equal to structured_data', () => {
      expect(SOURCE_CONFIDENCE_SCORES.api_response).toBe(
        SOURCE_CONFIDENCE_SCORES.structured_data
      );
    });

    it('should order sources by reliability', () => {
      expect(SOURCE_CONFIDENCE_SCORES.structured_data).toBeGreaterThan(
        SOURCE_CONFIDENCE_SCORES.selector_match
      );
      expect(SOURCE_CONFIDENCE_SCORES.selector_match).toBeGreaterThan(
        SOURCE_CONFIDENCE_SCORES.heuristic
      );
      expect(SOURCE_CONFIDENCE_SCORES.heuristic).toBeGreaterThan(
        SOURCE_CONFIDENCE_SCORES.fallback
      );
      expect(SOURCE_CONFIDENCE_SCORES.fallback).toBeGreaterThan(
        SOURCE_CONFIDENCE_SCORES.unknown
      );
    });
  });

  describe('type definitions', () => {
    it('ConfidenceLevel should have correct values', () => {
      const levels: ConfidenceLevel[] = ['very_high', 'high', 'medium', 'low', 'very_low'];
      expect(levels).toHaveLength(5);
    });

    it('FieldConfidence should have required fields', () => {
      const conf: FieldConfidence = {
        score: 0.85,
        level: 'high',
        source: 'selector_match',
      };

      expect(conf.score).toBeDefined();
      expect(conf.level).toBeDefined();
      expect(conf.source).toBeDefined();
      expect(conf.reason).toBeUndefined();
    });
  });
});
