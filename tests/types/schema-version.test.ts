/**
 * Tests for Response Schema Versioning (CX-001)
 *
 * Validates the schema versioning system that allows LLM clients to:
 * - Detect breaking changes in response formats
 * - Handle different versions appropriately
 * - Migrate code when versions change
 */

import { describe, it, expect } from 'vitest';
import {
  SCHEMA_VERSION,
  withSchemaVersion,
  addSchemaVersion,
  isVersionedResponse,
  parseSchemaVersion,
  isSchemaCompatible,
  type SchemaVersionInfo,
  type VersionedResponse,
} from '../../src/types/schema-version.js';

describe('schema-version', () => {
  describe('SCHEMA_VERSION constant', () => {
    it('should be a valid version string', () => {
      expect(SCHEMA_VERSION).toBeDefined();
      expect(typeof SCHEMA_VERSION).toBe('string');
      expect(SCHEMA_VERSION).toMatch(/^\d+\.\d+$/);
    });

    it('should be 1.0 for initial release', () => {
      expect(SCHEMA_VERSION).toBe('1.0');
    });
  });

  describe('withSchemaVersion', () => {
    it('should wrap data in versioned response', () => {
      const data = { foo: 'bar', count: 42 };
      const result = withSchemaVersion(data);

      expect(result.schemaVersion).toBe(SCHEMA_VERSION);
      expect(result.data).toBe(data);
    });

    it('should work with empty objects', () => {
      const result = withSchemaVersion({});

      expect(result.schemaVersion).toBe(SCHEMA_VERSION);
      expect(result.data).toEqual({});
    });

    it('should work with arrays', () => {
      const data = [1, 2, 3];
      const result = withSchemaVersion(data);

      expect(result.schemaVersion).toBe(SCHEMA_VERSION);
      expect(result.data).toEqual([1, 2, 3]);
    });

    it('should preserve complex nested structures', () => {
      const data = {
        patterns: [{ name: 'test', confidence: 0.9 }],
        stats: { total: 100, active: 50 },
        metadata: null,
      };
      const result = withSchemaVersion(data);

      expect(result.schemaVersion).toBe(SCHEMA_VERSION);
      expect(result.data).toEqual(data);
    });
  });

  describe('addSchemaVersion', () => {
    it('should add schemaVersion as sibling field', () => {
      const response = { patterns: [], stats: { total: 0 } };
      const result = addSchemaVersion(response);

      expect(result.schemaVersion).toBe(SCHEMA_VERSION);
      expect(result.patterns).toEqual([]);
      expect(result.stats).toEqual({ total: 0 });
    });

    it('should not nest the data', () => {
      const response = { foo: 'bar' };
      const result = addSchemaVersion(response);

      expect(result).toHaveProperty('schemaVersion');
      expect(result).toHaveProperty('foo', 'bar');
      expect(result).not.toHaveProperty('data');
    });

    it('should work with complex objects', () => {
      const response = {
        domain: 'example.com',
        apis: [{ endpoint: '/api/v1', method: 'GET' }],
        learning: { confidence: 'high' },
      };
      const result = addSchemaVersion(response);

      expect(result.schemaVersion).toBe(SCHEMA_VERSION);
      expect(result.domain).toBe('example.com');
      expect(result.apis).toHaveLength(1);
      expect(result.learning).toEqual({ confidence: 'high' });
    });

    it('should override any existing schemaVersion field', () => {
      const response = { schemaVersion: '0.5', data: 'test' };
      const result = addSchemaVersion(response);

      expect(result.schemaVersion).toBe(SCHEMA_VERSION);
    });
  });

  describe('isVersionedResponse', () => {
    it('should return true for valid versioned responses', () => {
      expect(isVersionedResponse({ schemaVersion: '1.0' })).toBe(true);
      expect(isVersionedResponse({ schemaVersion: '2.5', data: {} })).toBe(true);
      expect(isVersionedResponse({ schemaVersion: '1.0', foo: 'bar' })).toBe(true);
    });

    it('should return false for non-versioned objects', () => {
      expect(isVersionedResponse({})).toBe(false);
      expect(isVersionedResponse({ version: '1.0' })).toBe(false);
      expect(isVersionedResponse({ data: {} })).toBe(false);
    });

    it('should return false for non-string schemaVersion', () => {
      expect(isVersionedResponse({ schemaVersion: 1.0 })).toBe(false);
      expect(isVersionedResponse({ schemaVersion: null })).toBe(false);
      expect(isVersionedResponse({ schemaVersion: undefined })).toBe(false);
    });

    it('should return false for non-objects', () => {
      expect(isVersionedResponse(null)).toBe(false);
      expect(isVersionedResponse(undefined)).toBe(false);
      expect(isVersionedResponse('string')).toBe(false);
      expect(isVersionedResponse(123)).toBe(false);
      expect(isVersionedResponse([])).toBe(false);
    });

    it('should work as type guard', () => {
      const obj: unknown = { schemaVersion: '1.0', patterns: [] };

      if (isVersionedResponse(obj)) {
        // TypeScript should recognize this as SchemaVersionInfo
        expect(obj.schemaVersion).toBe('1.0');
      } else {
        throw new Error('Expected isVersionedResponse to return true');
      }
    });
  });

  describe('parseSchemaVersion', () => {
    it('should parse valid version strings', () => {
      expect(parseSchemaVersion('1.0')).toEqual({ major: 1, minor: 0 });
      expect(parseSchemaVersion('2.5')).toEqual({ major: 2, minor: 5 });
      expect(parseSchemaVersion('10.20')).toEqual({ major: 10, minor: 20 });
    });

    it('should handle single digit versions', () => {
      expect(parseSchemaVersion('1.2')).toEqual({ major: 1, minor: 2 });
    });

    it('should handle malformed versions gracefully', () => {
      expect(parseSchemaVersion('')).toEqual({ major: 0, minor: 0 });
      expect(parseSchemaVersion('1')).toEqual({ major: 1, minor: 0 });
      expect(parseSchemaVersion('invalid')).toEqual({ major: 0, minor: 0 });
    });
  });

  describe('isSchemaCompatible', () => {
    it('should return true for same major version', () => {
      expect(isSchemaCompatible('1.0', '1.0')).toBe(true);
      expect(isSchemaCompatible('1.0', '1.5')).toBe(true);
      expect(isSchemaCompatible('1.5', '1.0')).toBe(true);
      expect(isSchemaCompatible('2.0', '2.10')).toBe(true);
    });

    it('should return false for different major versions', () => {
      expect(isSchemaCompatible('1.0', '2.0')).toBe(false);
      expect(isSchemaCompatible('2.0', '1.0')).toBe(false);
      expect(isSchemaCompatible('1.5', '2.0')).toBe(false);
    });

    it('should use SCHEMA_VERSION as default server version', () => {
      expect(isSchemaCompatible(SCHEMA_VERSION)).toBe(true);
      expect(isSchemaCompatible('1.0')).toBe(true);
      expect(isSchemaCompatible('1.5')).toBe(true);
    });

    it('should work with the current schema version', () => {
      const { major } = parseSchemaVersion(SCHEMA_VERSION);

      // Same major version should be compatible
      expect(isSchemaCompatible(`${major}.0`)).toBe(true);
      expect(isSchemaCompatible(`${major}.99`)).toBe(true);

      // Different major version should not be compatible
      expect(isSchemaCompatible(`${major + 1}.0`)).toBe(false);
    });
  });

  describe('type definitions', () => {
    it('SchemaVersionInfo should have schemaVersion field', () => {
      const info: SchemaVersionInfo = { schemaVersion: '1.0' };
      expect(info.schemaVersion).toBeDefined();
    });

    it('VersionedResponse should wrap data with schemaVersion', () => {
      const response: VersionedResponse<{ foo: string }> = {
        schemaVersion: '1.0',
        data: { foo: 'bar' },
      };
      expect(response.schemaVersion).toBe('1.0');
      expect(response.data.foo).toBe('bar');
    });
  });

  describe('integration with JSON serialization', () => {
    it('should serialize correctly with addSchemaVersion', () => {
      const response = { status: 'ok', count: 5 };
      const versioned = addSchemaVersion(response);
      const serialized = JSON.stringify(versioned);
      const parsed = JSON.parse(serialized);

      expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
      expect(parsed.status).toBe('ok');
      expect(parsed.count).toBe(5);
    });

    it('should serialize correctly with withSchemaVersion', () => {
      const data = { items: [1, 2, 3] };
      const versioned = withSchemaVersion(data);
      const serialized = JSON.stringify(versioned);
      const parsed = JSON.parse(serialized);

      expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
      expect(parsed.data.items).toEqual([1, 2, 3]);
    });

    it('should maintain schema version through round-trip', () => {
      const original = addSchemaVersion({ test: true });
      const roundTripped = JSON.parse(JSON.stringify(original));

      expect(isVersionedResponse(roundTripped)).toBe(true);
      expect(roundTripped.schemaVersion).toBe(original.schemaVersion);
    });
  });
});
