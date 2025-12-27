/**
 * Tests for JSON Schema Validation (FEAT-001)
 *
 * Tests schema validation feature in VerificationEngine.
 * Validates against JSON Schema draft-07 specification.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VerificationEngine } from '../../src/core/verification-engine.js';
import type { SmartBrowseResult } from '../../src/core/smart-browser.js';
import type { VerifyOptions, JSONSchema } from '../../src/types/verification.js';

// Helper to create mock browse result
const createMockResult = (content: any): SmartBrowseResult => ({
  url: 'https://example.com',
  content: {
    markdown: 'Test content with enough length to pass the minimum content check which is 50 characters by default',
    text: 'Test content with enough length to pass the minimum content check which is 50 characters by default',
    html: '<p>Test content with enough length to pass the minimum content check</p>',
    structuredData: content,
  },
  metadata: {
    title: 'Test Page',
    description: '',
    tier: 'intelligence',
    fetchTime: 100,
    detectionResults: {
      botChallengeDetected: false,
      rateLimitDetected: false,
      loginRequired: false,
      ipBlockDetected: false,
      regionBlockDetected: false,
      captchaDetected: false,
    },
  },
  // Include network request with 200 status to pass built-in checks
  network: [
    {
      url: 'https://example.com',
      method: 'GET',
      status: 200,
      type: 'document',
      timing: { start: 0, end: 100 },
    },
  ],
  console: [],
});

describe('Schema Validation (FEAT-001)', () => {
  let engine: VerificationEngine;

  beforeEach(() => {
    engine = new VerificationEngine();
  });

  describe('Basic Schema Validation', () => {
    it('should pass validation for valid data matching schema', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          price: { type: 'number' },
          title: { type: 'string' },
        },
        required: ['price', 'title'],
      };

      const result = createMockResult({
        price: 29.99,
        title: 'Product Name',
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(true);
      expect(verification.schemaErrors).toEqual([]);
      expect(verification.errors).toHaveLength(0);
    });

    it('should fail validation when required field is missing', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          price: { type: 'number' },
          title: { type: 'string' },
        },
        required: ['price', 'title'],
      };

      const result = createMockResult({
        price: 29.99,
        // title is missing
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(false);
      expect(verification.schemaErrors).toBeDefined();
      expect(verification.schemaErrors!.length).toBeGreaterThan(0);
      expect(verification.schemaErrors![0].keyword).toBe('required');
      expect(verification.schemaErrors![0].message).toContain('title');
    });

    it('should fail validation when field has wrong type', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          price: { type: 'number' },
          title: { type: 'string' },
        },
      };

      const result = createMockResult({
        price: '29.99', // Should be number, not string
        title: 'Product Name',
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(false);
      expect(verification.schemaErrors).toBeDefined();
      expect(verification.schemaErrors!.length).toBeGreaterThan(0);
      expect(verification.schemaErrors![0].keyword).toBe('type');
      expect(verification.schemaErrors![0].path).toBe('/price');
    });
  });

  describe('Advanced Schema Validation', () => {
    it('should validate nested object structures', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          product: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              price: { type: 'number', minimum: 0 },
              inStock: { type: 'boolean' },
            },
            required: ['id', 'price'],
          },
        },
        required: ['product'],
      };

      const result = createMockResult({
        product: {
          id: '12345',
          price: 29.99,
          inStock: true,
        },
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(true);
      expect(verification.schemaErrors).toEqual([]);
    });

    it('should validate array items', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                quantity: { type: 'integer', minimum: 1 },
              },
              required: ['id', 'quantity'],
            },
            minItems: 1,
          },
        },
        required: ['items'],
      };

      const result = createMockResult({
        items: [
          { id: 'item1', quantity: 2 },
          { id: 'item2', quantity: 5 },
        ],
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(true);
      expect(verification.schemaErrors).toEqual([]);
    });

    it('should fail when array item violates schema', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                quantity: { type: 'integer', minimum: 1 },
              },
              required: ['id', 'quantity'],
            },
          },
        },
      };

      const result = createMockResult({
        items: [
          { id: 'item1', quantity: 2 },
          { id: 'item2', quantity: 0 }, // Violates minimum: 1
        ],
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(false);
      expect(verification.schemaErrors).toBeDefined();
      expect(verification.schemaErrors!.some(e => e.keyword === 'minimum')).toBe(true);
    });

    it('should validate string patterns', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
          },
          phone: {
            type: 'string',
            pattern: '^\\d{3}-\\d{3}-\\d{4}$',
          },
        },
        required: ['email'],
      };

      const result = createMockResult({
        email: 'test@example.com',
        phone: '555-123-4567',
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(true);
      expect(verification.schemaErrors).toEqual([]);
    });

    it('should fail validation for invalid pattern', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
          },
        },
      };

      const result = createMockResult({
        email: 'not-an-email', // Doesn't match pattern
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(false);
      expect(verification.schemaErrors).toBeDefined();
      expect(verification.schemaErrors!.some(e => e.keyword === 'pattern')).toBe(true);
    });

    it('should validate enum values', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['pending', 'active', 'completed', 'cancelled'],
          },
        },
        required: ['status'],
      };

      const result = createMockResult({
        status: 'active',
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(true);
      expect(verification.schemaErrors).toEqual([]);
    });

    it('should fail validation for invalid enum value', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['pending', 'active', 'completed', 'cancelled'],
          },
        },
      };

      const result = createMockResult({
        status: 'invalid-status',
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(false);
      expect(verification.schemaErrors).toBeDefined();
      expect(verification.schemaErrors!.some(e => e.keyword === 'enum')).toBe(true);
    });
  });

  describe('Numeric Constraints', () => {
    it('should validate minimum and maximum constraints', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          age: {
            type: 'integer',
            minimum: 0,
            maximum: 150,
          },
          price: {
            type: 'number',
            minimum: 0.01,
            maximum: 999999.99,
          },
        },
      };

      const result = createMockResult({
        age: 25,
        price: 49.99,
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(true);
      expect(verification.schemaErrors).toEqual([]);
    });

    it('should fail when value exceeds maximum', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          quantity: {
            type: 'integer',
            maximum: 100,
          },
        },
      };

      const result = createMockResult({
        quantity: 150, // Exceeds maximum
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(false);
      expect(verification.schemaErrors).toBeDefined();
      expect(verification.schemaErrors!.some(e => e.keyword === 'maximum')).toBe(true);
    });

    it('should fail when value is below minimum', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          price: {
            type: 'number',
            minimum: 0.01,
          },
        },
      };

      const result = createMockResult({
        price: 0, // Below minimum
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(false);
      expect(verification.schemaErrors).toBeDefined();
      expect(verification.schemaErrors!.some(e => e.keyword === 'minimum')).toBe(true);
    });
  });

  describe('String Constraints', () => {
    it('should validate minLength and maxLength', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          username: {
            type: 'string',
            minLength: 3,
            maxLength: 20,
          },
          description: {
            type: 'string',
            minLength: 10,
            maxLength: 500,
          },
        },
      };

      const result = createMockResult({
        username: 'john_doe',
        description: 'This is a valid description with enough characters.',
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(true);
      expect(verification.schemaErrors).toEqual([]);
    });

    it('should fail when string is too short', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          username: {
            type: 'string',
            minLength: 3,
          },
        },
      };

      const result = createMockResult({
        username: 'ab', // Too short
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(false);
      expect(verification.schemaErrors).toBeDefined();
      expect(verification.schemaErrors!.some(e => e.keyword === 'minLength')).toBe(true);
    });

    it('should fail when string is too long', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          username: {
            type: 'string',
            maxLength: 10,
          },
        },
      };

      const result = createMockResult({
        username: 'this_username_is_way_too_long',
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(false);
      expect(verification.schemaErrors).toBeDefined();
      expect(verification.schemaErrors!.some(e => e.keyword === 'maxLength')).toBe(true);
    });
  });

  describe('Array Constraints', () => {
    it('should validate minItems and maxItems', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 10,
          },
        },
      };

      const result = createMockResult({
        tags: ['tag1', 'tag2', 'tag3'],
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(true);
      expect(verification.schemaErrors).toEqual([]);
    });

    it('should fail when array has too few items', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
            minItems: 2,
          },
        },
      };

      const result = createMockResult({
        tags: ['tag1'], // Only 1 item, but minItems is 2
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(false);
      expect(verification.schemaErrors).toBeDefined();
      expect(verification.schemaErrors!.some(e => e.keyword === 'minItems')).toBe(true);
    });

    it('should fail when array has too many items', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 3,
          },
        },
      };

      const result = createMockResult({
        tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'],
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(false);
      expect(verification.schemaErrors).toBeDefined();
      expect(verification.schemaErrors!.some(e => e.keyword === 'maxItems')).toBe(true);
    });
  });

  describe('Schema Validation Integration', () => {
    it('should work alongside standard verification checks', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          price: { type: 'number' },
        },
        required: ['price'],
      };

      const result = createMockResult({
        price: 29.99,
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'standard', // Includes built-in checks
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(true);
      // Should have both built-in checks AND schema check
      expect(verification.checks.length).toBeGreaterThan(1);
      expect(verification.checks.some(c => c.type === 'schema')).toBe(true);
    });

    it('should skip schema validation when validateSchema is false', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          price: { type: 'number' },
        },
        required: ['price'],
      };

      const result = createMockResult({
        // Invalid data, but validateSchema is false
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: false,
        schema,
      };

      const verification = await engine.verify(result, options);

      // Should not include schema errors
      expect(verification.schemaErrors).toBeUndefined();
      expect(verification.checks.every(c => c.type !== 'schema')).toBe(true);
    });

    it('should provide detailed error paths for debugging', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          product: {
            type: 'object',
            properties: {
              variants: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    sku: { type: 'string' },
                    price: { type: 'number', minimum: 0 },
                  },
                  required: ['sku', 'price'],
                },
              },
            },
          },
        },
      };

      const result = createMockResult({
        product: {
          variants: [
            { sku: 'ABC123', price: 10 },
            { sku: 'DEF456' }, // Missing price
          ],
        },
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(false);
      expect(verification.schemaErrors).toBeDefined();
      expect(verification.schemaErrors!.length).toBeGreaterThan(0);

      // Should have detailed path to the error
      const error = verification.schemaErrors!.find(e => e.keyword === 'required');
      expect(error).toBeDefined();
      expect(error!.path).toContain('/product/variants');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty content gracefully', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          data: { type: 'string' },
        },
      };

      const result: SmartBrowseResult = {
        url: 'https://example.com',
        content: {
          markdown: '',
          text: '',
          html: '',
        },
        metadata: {
          title: '',
          description: '',
          tier: 'intelligence',
          fetchTime: 100,
          detectionResults: {
            botChallengeDetected: false,
            rateLimitDetected: false,
            loginRequired: false,
            ipBlockDetected: false,
            regionBlockDetected: false,
            captchaDetected: false,
          },
        },
        network: [
          {
            url: 'https://example.com',
            method: 'GET',
            status: 200,
            type: 'document',
            timing: { start: 0, end: 100 },
          },
        ],
        console: [],
      };

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      // Should fail because content is too short (minLength: 50 built-in check)
      // Schema validation passes because an empty object satisfies a schema with no required properties
      expect(verification.passed).toBe(false);
      expect(verification.schemaErrors).toBeDefined();
      // The schema validation passes (empty array), but the built-in content check fails
      expect(verification.schemaErrors).toEqual([]);
      // Check that content length check failed
      expect(verification.errors.some(e => e.includes('Content too short'))).toBe(true);
    });

    it('should validate against content if structuredData is not present', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          markdown: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['markdown'],
      };

      const result: SmartBrowseResult = {
        url: 'https://example.com',
        content: {
          markdown: 'Test content with enough length to pass the minimum content check which is 50 characters by default',
          text: 'Test content with enough length to pass the minimum content check which is 50 characters by default',
          html: '<p>Test content with enough length to pass the minimum content check</p>',
          // No structuredData - should validate against content object
        },
        metadata: {
          title: 'Test',
          description: '',
          tier: 'intelligence',
          fetchTime: 100,
          detectionResults: {
            botChallengeDetected: false,
            rateLimitDetected: false,
            loginRequired: false,
            ipBlockDetected: false,
            regionBlockDetected: false,
            captchaDetected: false,
          },
        },
        network: [
          {
            url: 'https://example.com',
            method: 'GET',
            status: 200,
            type: 'document',
            timing: { start: 0, end: 100 },
          },
        ],
        console: [],
      };

      const options: VerifyOptions = {
        enabled: true,
        mode: 'basic',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      // Should validate against content object itself
      expect(verification.passed).toBe(true);
      expect(verification.schemaErrors).toEqual([]);
    });
  });

  describe('Real-World Use Cases', () => {
    it('should validate e-commerce product schema', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9]+$' },
          name: { type: 'string', minLength: 1 },
          price: { type: 'number', minimum: 0 },
          currency: { type: 'string', enum: ['USD', 'EUR', 'GBP'] },
          inStock: { type: 'boolean' },
          images: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
          },
          rating: {
            type: 'number',
            minimum: 0,
            maximum: 5,
          },
        },
        required: ['id', 'name', 'price', 'currency', 'inStock'],
      };

      const result = createMockResult({
        id: '12345',
        name: 'Wireless Headphones',
        price: 89.99,
        currency: 'USD',
        inStock: true,
        images: [
          'https://example.com/image1.jpg',
          'https://example.com/image2.jpg',
        ],
        rating: 4.5,
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'standard',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(true);
      expect(verification.schemaErrors).toEqual([]);
    });

    it('should validate API pagination response schema', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
              },
              required: ['id', 'title'],
            },
          },
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'integer', minimum: 1 },
              perPage: { type: 'integer', minimum: 1 },
              total: { type: 'integer', minimum: 0 },
              hasMore: { type: 'boolean' },
            },
            required: ['page', 'total', 'hasMore'],
          },
        },
        required: ['data', 'pagination'],
      };

      const result = createMockResult({
        data: [
          { id: '1', title: 'Item 1' },
          { id: '2', title: 'Item 2' },
        ],
        pagination: {
          page: 1,
          perPage: 10,
          total: 42,
          hasMore: true,
        },
      });

      const options: VerifyOptions = {
        enabled: true,
        mode: 'standard',
        validateSchema: true,
        schema,
      };

      const verification = await engine.verify(result, options);

      expect(verification.passed).toBe(true);
      expect(verification.schemaErrors).toEqual([]);
    });
  });
});
