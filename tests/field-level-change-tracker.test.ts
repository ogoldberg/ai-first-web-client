/**
 * Tests for Field-Level Change Tracker (INT-014)
 *
 * Tests cover:
 * - Basic field change detection (added, removed, modified)
 * - Numeric change detection (increased, decreased)
 * - Severity classification
 * - Category detection (fee, deadline, requirement, etc.)
 * - Multi-language support
 * - Array handling
 * - Nested object comparison
 * - History tracking
 * - Custom field mappings
 * - Filtering (ignore/only fields)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  FieldLevelChangeTracker,
  createFieldLevelChangeTracker,
  trackFieldChanges,
  getBreakingChanges,
  hasBreakingChanges,
  type FieldChange,
  type ChangeSeverity,
  type FieldCategory,
  type ChangeType,
} from '../src/core/field-level-change-tracker.js';

describe('FieldLevelChangeTracker', () => {
  let tracker: FieldLevelChangeTracker;
  const testStoragePath = './test-field-changes.json';

  beforeEach(() => {
    tracker = new FieldLevelChangeTracker({
      storagePath: testStoragePath,
      maxHistoryPerUrl: 10,
    });
  });

  afterEach(() => {
    // Cleanup test file
    if (fs.existsSync(testStoragePath)) {
      fs.unlinkSync(testStoragePath);
    }
  });

  // ============================================
  // BASIC CHANGE DETECTION
  // ============================================

  describe('Basic Change Detection', () => {
    it('should detect no changes for identical objects', () => {
      const data = { name: 'Test', value: 100 };
      const result = tracker.trackChanges(data, data);

      expect(result.hasChanges).toBe(false);
      expect(result.totalChanges).toBe(0);
      expect(result.changes).toHaveLength(0);
    });

    it('should detect added fields', () => {
      const oldData = { name: 'Test' };
      const newData = { name: 'Test', newField: 'value' };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.hasChanges).toBe(true);
      expect(result.totalChanges).toBe(1);
      expect(result.changes[0].changeType).toBe('added');
      expect(result.changes[0].fieldPath).toBe('newField');
      expect(result.changes[0].newValue).toBe('value');
      expect(result.changes[0].oldValue).toBeUndefined();
    });

    it('should detect removed fields', () => {
      const oldData = { name: 'Test', oldField: 'value' };
      const newData = { name: 'Test' };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.hasChanges).toBe(true);
      expect(result.totalChanges).toBe(1);
      expect(result.changes[0].changeType).toBe('removed');
      expect(result.changes[0].fieldPath).toBe('oldField');
      expect(result.changes[0].oldValue).toBe('value');
      expect(result.changes[0].newValue).toBeUndefined();
    });

    it('should detect modified fields', () => {
      const oldData = { name: 'Old Name' };
      const newData = { name: 'New Name' };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.hasChanges).toBe(true);
      expect(result.totalChanges).toBe(1);
      expect(result.changes[0].changeType).toBe('modified');
      expect(result.changes[0].oldValue).toBe('Old Name');
      expect(result.changes[0].newValue).toBe('New Name');
    });

    it('should detect multiple changes at once', () => {
      const oldData = { a: 1, b: 2, c: 3 };
      const newData = { a: 10, b: 2, d: 4 };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.hasChanges).toBe(true);
      expect(result.totalChanges).toBe(3); // a modified, c removed, d added
    });
  });

  // ============================================
  // NUMERIC CHANGE DETECTION
  // ============================================

  describe('Numeric Change Detection', () => {
    it('should detect increased numeric values', () => {
      const oldData = { fee: 100 };
      const newData = { fee: 150 };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].changeType).toBe('increased');
      expect(result.changes[0].percentageChange).toBe(50);
    });

    it('should detect decreased numeric values', () => {
      const oldData = { fee: 100 };
      const newData = { fee: 75 };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].changeType).toBe('decreased');
      expect(result.changes[0].percentageChange).toBe(-25);
    });

    it('should detect increased amounts in monetary objects', () => {
      const oldData = {
        applicationFee: { amount: 100, currency: 'EUR' },
      };
      const newData = {
        applicationFee: { amount: 120, currency: 'EUR' },
      };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].changeType).toBe('increased');
      expect(result.changes[0].percentageChange).toBe(20);
    });

    it('should detect decreased amounts in monetary objects', () => {
      const oldData = {
        applicationFee: { amount: 100, currency: 'EUR' },
      };
      const newData = {
        applicationFee: { amount: 80, currency: 'EUR' },
      };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].changeType).toBe('decreased');
      expect(result.changes[0].percentageChange).toBe(-20);
    });

    it('should handle zero values without division errors', () => {
      const oldData = { count: 0 };
      const newData = { count: 10 };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].changeType).toBe('increased');
      expect(result.changes[0].percentageChange).toBeUndefined(); // Can't calculate from 0
    });
  });

  // ============================================
  // DURATION CHANGE DETECTION
  // ============================================

  describe('Duration Change Detection', () => {
    it('should detect increased duration (days)', () => {
      const oldData = { processingTime: '10 days' };
      const newData = { processingTime: '15 days' };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].changeType).toBe('increased');
    });

    it('should detect decreased duration (weeks)', () => {
      const oldData = { processingTime: '4 weeks' };
      const newData = { processingTime: '2 weeks' };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].changeType).toBe('decreased');
    });

    it('should detect duration changes in Spanish', () => {
      const oldData = { tiempo: '10 dias' };
      const newData = { tiempo: '20 dias' };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].changeType).toBe('increased');
    });

    it('should detect duration changes in German', () => {
      const oldData = { dauer: '2 Wochen' };
      const newData = { dauer: '1 Woche' };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].changeType).toBe('decreased');
    });
  });

  // ============================================
  // CATEGORY DETECTION
  // ============================================

  describe('Category Detection', () => {
    it('should detect fee category from field name', () => {
      const oldData = { applicationFee: 100 };
      const newData = { applicationFee: 150 };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].category).toBe('fee');
    });

    it('should detect deadline category from field name', () => {
      const oldData = { submissionDeadline: '2024-01-01' };
      const newData = { submissionDeadline: '2024-02-01' };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].category).toBe('deadline');
    });

    it('should detect requirement category from field name', () => {
      const oldData = { requirementList: ['passport'] };
      const newData = { requirementList: ['passport', 'photo'] };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes.some(c => c.category === 'requirement')).toBe(true);
    });

    it('should detect document category from field name', () => {
      const oldData = { passportDocument: 'valid' };
      const newData = { passportDocument: 'expired' };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].category).toBe('document');
    });

    it('should detect contact category from field name', () => {
      const oldData = { contactEmail: 'old@example.com' };
      const newData = { contactEmail: 'new@example.com' };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].category).toBe('contact');
    });

    it('should detect appointment category from field name', () => {
      const oldData = { appointmentBooking: false };
      const newData = { appointmentBooking: true };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].category).toBe('appointment');
    });

    it('should detect category from Spanish field names', () => {
      const oldData = { tasa: 100 };
      const newData = { tasa: 150 };

      const result = tracker.trackChanges(oldData, newData, { language: 'es' });

      expect(result.changes[0].category).toBe('fee');
    });

    it('should detect category from German field names', () => {
      const oldData = { gebuhr: 100 };
      const newData = { gebuhr: 150 };

      const result = tracker.trackChanges(oldData, newData, { language: 'de' });

      expect(result.changes[0].category).toBe('fee');
    });

    it('should detect category from value content', () => {
      const oldData = {
        feeInfo: { amount: 100, currency: 'EUR' },
      };
      const newData = {
        feeInfo: { amount: 150, currency: 'EUR' },
      };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].category).toBe('fee');
    });

    it('should use custom field mappings', () => {
      const oldData = { customField: 'old' };
      const newData = { customField: 'new' };

      const result = tracker.trackChanges(oldData, newData, {
        customFieldMappings: { customField: 'fee' },
      });

      expect(result.changes[0].category).toBe('fee');
    });

    it('should fall back to "other" for unknown fields', () => {
      const oldData = { randomXyz: 'old' };
      const newData = { randomXyz: 'new' };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].category).toBe('other');
    });
  });

  // ============================================
  // SEVERITY CLASSIFICATION
  // ============================================

  describe('Severity Classification', () => {
    it('should classify fee increase as breaking', () => {
      const oldData = { fee: 100 };
      const newData = { fee: 150 };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].severity).toBe('breaking');
      expect(result.breakingChanges).toHaveLength(1);
    });

    it('should classify fee decrease as minor', () => {
      const oldData = { fee: 100 };
      const newData = { fee: 50 };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].severity).toBe('minor');
    });

    it('should classify new requirement as breaking', () => {
      const oldData = { requirements: ['a'] };
      const newData = { requirements: ['a', 'b'] };

      const result = tracker.trackChanges(oldData, newData);

      const addedReq = result.changes.find(c => c.changeType === 'added');
      expect(addedReq?.severity).toBe('breaking');
    });

    it('should classify deadline decrease as breaking', () => {
      const oldData = { deadline: '30 days' };
      const newData = { deadline: '10 days' };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].severity).toBe('breaking');
    });

    it('should classify deadline increase as minor', () => {
      const oldData = { deadline: '10 days' };
      const newData = { deadline: '30 days' };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].severity).toBe('minor');
    });

    it('should classify contact change as minor', () => {
      const oldData = { contactPhone: '123' };
      const newData = { contactPhone: '456' };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].severity).toBe('minor');
    });

    it('should classify new document requirement as breaking', () => {
      const oldData = {};
      const newData = { documentNeeded: 'criminal record' };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].severity).toBe('breaking');
    });

    it('should correctly count changes by severity', () => {
      const oldData = {
        fee: 100,         // will increase -> breaking
        deadline: '10 days',  // will increase -> minor
        contact: 'old',   // will change -> minor
      };
      const newData = {
        fee: 200,
        deadline: '30 days',
        contact: 'new',
      };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changesBySeverity.breaking).toBe(1);
      expect(result.changesBySeverity.minor).toBe(2);
    });
  });

  // ============================================
  // NESTED OBJECTS
  // ============================================

  describe('Nested Objects', () => {
    it('should track changes in nested objects', () => {
      const oldData = {
        contact: {
          name: 'John',
          phone: '123',
        },
      };
      const newData = {
        contact: {
          name: 'John',
          phone: '456',
        },
      };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.hasChanges).toBe(true);
      expect(result.changes[0].fieldPath).toBe('contact.phone');
    });

    it('should track deeply nested changes', () => {
      const oldData = {
        level1: {
          level2: {
            level3: {
              value: 'old',
            },
          },
        },
      };
      const newData = {
        level1: {
          level2: {
            level3: {
              value: 'new',
            },
          },
        },
      };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].fieldPath).toBe('level1.level2.level3.value');
    });

    it('should detect added nested objects', () => {
      const oldData = { outer: {} };
      const newData = { outer: { inner: { value: 1 } } };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.hasChanges).toBe(true);
      expect(result.changes[0].changeType).toBe('added');
    });

    it('should detect removed nested objects', () => {
      const oldData = { outer: { inner: { value: 1 } } };
      const newData = { outer: {} };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.hasChanges).toBe(true);
      expect(result.changes[0].changeType).toBe('removed');
    });
  });

  // ============================================
  // ARRAY HANDLING
  // ============================================

  describe('Array Handling', () => {
    it('should detect added items in simple arrays', () => {
      const oldData = { items: ['a', 'b'] };
      const newData = { items: ['a', 'b', 'c'] };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.hasChanges).toBe(true);
      const addedChange = result.changes.find(c => c.changeType === 'added');
      expect(addedChange?.newValue).toBe('c');
    });

    it('should detect removed items in simple arrays', () => {
      const oldData = { items: ['a', 'b', 'c'] };
      const newData = { items: ['a', 'b'] };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.hasChanges).toBe(true);
      const removedChange = result.changes.find(c => c.changeType === 'removed');
      expect(removedChange?.oldValue).toBe('c');
    });

    it('should handle object arrays with index comparison', () => {
      const oldData = {
        items: [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' },
        ],
      };
      const newData = {
        items: [
          { id: 1, name: 'Item 1 Modified' },
          { id: 2, name: 'Item 2' },
        ],
      };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.hasChanges).toBe(true);
      expect(result.changes[0].fieldPath).toBe('items[0].name');
    });

    it('should detect added items in object arrays', () => {
      const oldData = {
        items: [{ id: 1 }],
      };
      const newData = {
        items: [{ id: 1 }, { id: 2 }],
      };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.hasChanges).toBe(true);
      const addedChange = result.changes.find(c => c.changeType === 'added');
      expect(addedChange).toBeDefined();
    });

    it('should detect removed items in object arrays', () => {
      const oldData = {
        items: [{ id: 1 }, { id: 2 }],
      };
      const newData = {
        items: [{ id: 1 }],
      };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.hasChanges).toBe(true);
      const removedChange = result.changes.find(c => c.changeType === 'removed');
      expect(removedChange).toBeDefined();
    });

    it('should handle empty arrays', () => {
      const oldData = { items: [] };
      const newData = { items: ['new'] };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.hasChanges).toBe(true);
    });
  });

  // ============================================
  // FIELD FILTERING
  // ============================================

  describe('Field Filtering', () => {
    it('should ignore specified fields', () => {
      const oldData = { a: 1, b: 2, c: 3 };
      const newData = { a: 10, b: 20, c: 30 };

      const result = tracker.trackChanges(oldData, newData, {
        ignoreFields: ['b', 'c'],
      });

      expect(result.totalChanges).toBe(1);
      expect(result.changes[0].fieldPath).toBe('a');
    });

    it('should only track specified fields', () => {
      const oldData = { a: 1, b: 2, c: 3 };
      const newData = { a: 10, b: 20, c: 30 };

      const result = tracker.trackChanges(oldData, newData, {
        onlyFields: ['a'],
      });

      expect(result.totalChanges).toBe(1);
      expect(result.changes[0].fieldPath).toBe('a');
    });

    it('should ignore nested fields', () => {
      const oldData = {
        outer: { a: 1, b: 2 },
      };
      const newData = {
        outer: { a: 10, b: 20 },
      };

      const result = tracker.trackChanges(oldData, newData, {
        ignoreFields: ['outer.b'],
      });

      expect(result.totalChanges).toBe(1);
      expect(result.changes[0].fieldPath).toBe('outer.a');
    });
  });

  // ============================================
  // SUMMARY AND DESCRIPTION
  // ============================================

  describe('Summary and Description', () => {
    it('should generate a summary of changes', () => {
      const oldData = {
        fee: 100,
        name: 'old',
      };
      const newData = {
        fee: 200,
        name: 'new',
      };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.summary).toContain('2 changes detected');
    });

    it('should generate no changes summary', () => {
      const data = { a: 1 };
      const result = tracker.trackChanges(data, data);

      expect(result.summary).toBe('No changes detected');
    });

    it('should include severity counts in summary', () => {
      const oldData = { fee: 100 };
      const newData = { fee: 200 };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.summary).toContain('breaking');
    });

    it('should generate descriptions for added fields', () => {
      const oldData = {};
      const newData = { newField: 'value' };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].description).toContain('added');
      expect(result.changes[0].description).toContain('value');
    });

    it('should generate descriptions for removed fields', () => {
      const oldData = { oldField: 'value' };
      const newData = {};

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].description).toContain('removed');
      expect(result.changes[0].description).toContain('value');
    });

    it('should generate descriptions for increased values', () => {
      const oldData = { fee: 100 };
      const newData = { fee: 200 };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].description).toContain('increased');
      expect(result.changes[0].description).toContain('100');
      expect(result.changes[0].description).toContain('200');
    });

    it('should format field names for display', () => {
      const oldData = { applicationFee: 100 };
      const newData = { applicationFee: 200 };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].fieldName).toBe('Application Fee');
    });

    it('should format monetary values', () => {
      // When comparing nested objects, the tracker recurses into them
      // So we compare the inner amount change, not the whole object
      const oldData = {
        fee: { amount: 100, currency: 'EUR' },
      };
      const newData = {
        fee: { amount: 200, currency: 'EUR' },
      };

      const result = tracker.trackChanges(oldData, newData);

      // The change is detected on the nested 'amount' field
      expect(result.changes[0].fieldPath).toBe('fee.amount');
      expect(result.changes[0].oldValueFormatted).toBe('100');
      expect(result.changes[0].newValueFormatted).toBe('200');
    });
  });

  // ============================================
  // IMPACT MESSAGES
  // ============================================

  describe('Impact Messages', () => {
    it('should generate impact for breaking changes', () => {
      const oldData = { fee: 100 };
      const newData = { fee: 200 };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].impact).toContain('invalidate');
      expect(result.changes[0].impact).toContain('Budget');
    });

    it('should generate impact for deadline decrease', () => {
      const oldData = { deadline: '30 days' };
      const newData = { deadline: '10 days' };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].impact).toContain('sooner');
    });

    it('should generate impact for new requirement', () => {
      const oldData = {};
      const newData = { requirement: 'new' };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].impact).toContain('documentation');
    });
  });

  // ============================================
  // HISTORY TRACKING
  // ============================================

  describe('History Tracking', () => {
    it('should store changes in history when URL provided', async () => {
      await tracker.initialize();

      const oldData = { fee: 100 };
      const newData = { fee: 200 };

      tracker.trackChanges(oldData, newData, {
        url: 'https://example.com/test',
      });

      const history = await tracker.getHistory('https://example.com/test');
      expect(history).toHaveLength(1);
      expect(history[0].changes).toHaveLength(1);
    });

    it('should not store history when no changes', async () => {
      await tracker.initialize();

      const data = { fee: 100 };

      tracker.trackChanges(data, data, {
        url: 'https://example.com/test',
      });

      const history = await tracker.getHistory('https://example.com/test');
      expect(history).toHaveLength(0);
    });

    it('should limit history entries per URL', async () => {
      const limitedTracker = new FieldLevelChangeTracker({
        storagePath: testStoragePath,
        maxHistoryPerUrl: 3,
      });
      await limitedTracker.initialize();

      // Add 5 changes
      for (let i = 0; i < 5; i++) {
        limitedTracker.trackChanges(
          { fee: i },
          { fee: i + 1 },
          { url: 'https://example.com/test' }
        );
      }

      const history = await limitedTracker.getHistory('https://example.com/test');
      expect(history).toHaveLength(3);
    });

    it('should get tracked URLs', async () => {
      await tracker.initialize();

      tracker.trackChanges({ a: 1 }, { a: 2 }, { url: 'https://a.com' });
      tracker.trackChanges({ b: 1 }, { b: 2 }, { url: 'https://b.com' });

      const urls = await tracker.getTrackedUrls();
      expect(urls).toContain('https://a.com');
      expect(urls).toContain('https://b.com');
    });

    it('should clear history for specific URL', async () => {
      await tracker.initialize();

      tracker.trackChanges({ a: 1 }, { a: 2 }, { url: 'https://a.com' });
      tracker.trackChanges({ b: 1 }, { b: 2 }, { url: 'https://b.com' });

      await tracker.clearHistory('https://a.com');

      const urlsAfter = await tracker.getTrackedUrls();
      expect(urlsAfter).not.toContain('https://a.com');
      expect(urlsAfter).toContain('https://b.com');
    });

    it('should clear all history', async () => {
      await tracker.initialize();

      tracker.trackChanges({ a: 1 }, { a: 2 }, { url: 'https://a.com' });
      tracker.trackChanges({ b: 1 }, { b: 2 }, { url: 'https://b.com' });

      await tracker.clearAllHistory();

      const urls = await tracker.getTrackedUrls();
      expect(urls).toHaveLength(0);
    });
  });

  // ============================================
  // STATISTICS
  // ============================================

  describe('Statistics', () => {
    it('should calculate statistics across all URLs', async () => {
      await tracker.initialize();

      tracker.trackChanges(
        { fee: 100 },
        { fee: 200 },
        { url: 'https://a.com' }
      );
      tracker.trackChanges(
        { contact: 'old' },
        { contact: 'new' },
        { url: 'https://b.com' }
      );

      const stats = await tracker.getStatistics();

      expect(stats.totalUrls).toBe(2);
      expect(stats.totalRecords).toBe(2);
      expect(stats.changesBySeverity.breaking).toBe(1);
      expect(stats.changesBySeverity.minor).toBe(1);
    });

    it('should return recent changes in statistics', async () => {
      await tracker.initialize();

      tracker.trackChanges({ a: 1 }, { a: 2 }, { url: 'https://a.com' });

      const stats = await tracker.getStatistics();

      expect(stats.recentChanges).toHaveLength(1);
      expect(stats.recentChanges[0].url).toBe('https://a.com');
    });
  });

  // ============================================
  // CONVENIENCE FUNCTIONS
  // ============================================

  describe('Convenience Functions', () => {
    describe('trackFieldChanges', () => {
      it('should track changes using convenience function', () => {
        const result = trackFieldChanges(
          { fee: 100 },
          { fee: 200 }
        );

        expect(result.hasChanges).toBe(true);
        expect(result.changes[0].category).toBe('fee');
      });
    });

    describe('getBreakingChanges', () => {
      it('should return only breaking changes', () => {
        const changes = getBreakingChanges(
          { fee: 100, name: 'old' },
          { fee: 200, name: 'new' }
        );

        expect(changes).toHaveLength(1);
        expect(changes[0].category).toBe('fee');
      });

      it('should return empty array when no breaking changes', () => {
        const changes = getBreakingChanges(
          { name: 'old' },
          { name: 'new' }
        );

        expect(changes).toHaveLength(0);
      });
    });

    describe('hasBreakingChanges', () => {
      it('should return true when breaking changes exist', () => {
        const result = hasBreakingChanges(
          { fee: 100 },
          { fee: 200 }
        );

        expect(result).toBe(true);
      });

      it('should return false when no breaking changes', () => {
        const result = hasBreakingChanges(
          { name: 'old' },
          { name: 'new' }
        );

        expect(result).toBe(false);
      });
    });
  });

  // ============================================
  // FACTORY FUNCTIONS
  // ============================================

  describe('Factory Functions', () => {
    it('should create tracker with createFieldLevelChangeTracker', () => {
      const tracker = createFieldLevelChangeTracker({
        maxHistoryPerUrl: 50,
      });

      expect(tracker).toBeInstanceOf(FieldLevelChangeTracker);
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe('Edge Cases', () => {
    it('should handle null values', () => {
      const oldData = { value: null };
      const newData = { value: 'not null' };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.hasChanges).toBe(true);
      expect(result.changes[0].oldValueFormatted).toBe('null');
    });

    it('should handle empty objects', () => {
      const result = tracker.trackChanges({}, {});

      expect(result.hasChanges).toBe(false);
    });

    it('should handle type changes', () => {
      const oldData = { value: '100' };
      const newData = { value: 100 };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.hasChanges).toBe(true);
    });

    it('should handle boolean changes', () => {
      const oldData = { active: true };
      const newData = { active: false };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.hasChanges).toBe(true);
      expect(result.changes[0].changeType).toBe('modified');
    });

    it('should handle large arrays', () => {
      const oldData = { items: Array.from({ length: 100 }, (_, i) => i) };
      const newData = { items: Array.from({ length: 100 }, (_, i) => i + 1) };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.hasChanges).toBe(true);
    });

    it('should handle deeply nested changes efficiently', () => {
      const oldData = {
        l1: { l2: { l3: { l4: { l5: { value: 'old' } } } } },
      };
      const newData = {
        l1: { l2: { l3: { l4: { l5: { value: 'new' } } } } },
      };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.hasChanges).toBe(true);
      expect(result.changes[0].fieldPath).toBe('l1.l2.l3.l4.l5.value');
    });
  });

  // ============================================
  // GOVERNMENT DATA SCENARIOS
  // ============================================

  describe('Government Data Scenarios', () => {
    it('should track visa fee increase as breaking', () => {
      const oldData = {
        visaFee: { amount: 80, currency: 'EUR' },
        processingTime: '15 working days',
      };
      const newData = {
        visaFee: { amount: 100, currency: 'EUR' },
        processingTime: '15 working days',
      };

      const result = tracker.trackChanges(oldData, newData, {
        url: 'https://gov.example.com/visa',
        category: 'visa',
      });

      expect(result.breakingChanges).toHaveLength(1);
      expect(result.breakingChanges[0].category).toBe('fee');
      expect(result.breakingChanges[0].percentageChange).toBe(25);
    });

    it('should track new document requirement as breaking', () => {
      const oldData = {
        documents: ['passport', 'photo'],
      };
      const newData = {
        documents: ['passport', 'photo', 'criminal_record'],
      };

      const result = tracker.trackChanges(oldData, newData, {
        url: 'https://gov.example.com/visa',
      });

      expect(result.breakingChanges.length).toBeGreaterThan(0);
    });

    it('should track deadline reduction as breaking', () => {
      const oldData = {
        applicationDeadline: '60 days before travel',
      };
      const newData = {
        applicationDeadline: '30 days before travel',
      };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.breakingChanges).toHaveLength(1);
    });

    it('should track office hours change as minor', () => {
      const oldData = {
        officeHours: '9:00 - 17:00',
      };
      const newData = {
        officeHours: '8:00 - 16:00',
      };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].severity).toBe('minor');
    });

    it('should track eligibility change as major', () => {
      const oldData = {
        eligibility: 'EU citizens',
      };
      const newData = {
        eligibility: 'EU and EEA citizens',
      };

      const result = tracker.trackChanges(oldData, newData);

      expect(result.changes[0].severity).toBe('major');
    });

    it('should handle complex government data structure', () => {
      const oldData = {
        visa: {
          type: 'work',
          fees: {
            application: { amount: 100, currency: 'EUR' },
            processing: { amount: 50, currency: 'EUR' },
          },
          requirements: {
            documents: ['passport', 'photo'],
            eligibility: ['EU citizen', 'job offer'],
          },
          timeline: {
            processingDays: 15,
            validityMonths: 12,
          },
          contact: {
            email: 'visa@gov.example.com',
            phone: '+34 123 456 789',
          },
        },
      };

      const newData = {
        visa: {
          type: 'work',
          fees: {
            application: { amount: 120, currency: 'EUR' },  // Increased
            processing: { amount: 50, currency: 'EUR' },
          },
          requirements: {
            documents: ['passport', 'photo', 'health_certificate'],  // New doc
            eligibility: ['EU citizen', 'job offer'],
          },
          timeline: {
            processingDays: 20,  // Increased wait
            validityMonths: 12,
          },
          contact: {
            email: 'visa-new@gov.example.com',  // Changed
            phone: '+34 123 456 789',
          },
        },
      };

      const result = tracker.trackChanges(oldData, newData, {
        url: 'https://gov.example.com/visa',
        category: 'visa_application',
      });

      // Should detect: fee increase (breaking), new document (breaking),
      // timeline increase (major), email change (minor)
      expect(result.totalChanges).toBe(4);
      expect(result.breakingChanges.length).toBeGreaterThanOrEqual(2);
      expect(result.changesBySeverity.major).toBeGreaterThanOrEqual(1);
      expect(result.changesBySeverity.minor).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================
  // MULTI-LANGUAGE SUPPORT
  // ============================================

  describe('Multi-Language Support', () => {
    it('should detect Spanish fee fields', () => {
      const oldData = { tasaAdministrativa: 50 };
      const newData = { tasaAdministrativa: 75 };

      const result = tracker.trackChanges(oldData, newData, { language: 'es' });

      expect(result.changes[0].category).toBe('fee');
    });

    it('should detect Portuguese document fields', () => {
      const oldData = { documentoPassaporte: 'passaporte' };
      const newData = { documentoPassaporte: 'passaporte + foto' };

      const result = tracker.trackChanges(oldData, newData, { language: 'pt' });

      expect(result.changes[0].category).toBe('document');
    });

    it('should detect French deadline fields', () => {
      const oldData = { echeanceDate: '2024-01-01' };
      const newData = { echeanceDate: '2024-02-01' };

      const result = tracker.trackChanges(oldData, newData, { language: 'fr' });

      expect(result.changes[0].category).toBe('deadline');
    });

    it('should detect Italian appointment fields', () => {
      const oldData = { appuntamento: false };
      const newData = { appuntamento: true };

      const result = tracker.trackChanges(oldData, newData, { language: 'it' });

      expect(result.changes[0].category).toBe('appointment');
    });

    it('should fall back to English when language not supported', () => {
      const oldData = { fee: 100 };
      const newData = { fee: 200 };

      const result = tracker.trackChanges(oldData, newData, { language: 'xx' });

      expect(result.changes[0].category).toBe('fee');
    });
  });
});
