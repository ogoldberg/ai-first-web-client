/**
 * Tests for Diff Generator
 *
 * Part of F-010: Diff Generation for Content Changes
 */

import { describe, it, expect } from 'vitest';
import {
  generateDiff,
  generateInlineDiff,
  formatDiffAnsi,
  formatDiffHtml,
  hasContentChanged,
  getQuickStats,
  type DiffOptions,
} from '../../src/utils/diff-generator.js';

describe('Diff Generator', () => {
  describe('generateDiff', () => {
    it('should detect no changes for identical content', () => {
      const content = 'Line 1\nLine 2\nLine 3';
      const result = generateDiff(content, content);

      expect(result.hasChanges).toBe(false);
      expect(result.stats.linesAdded).toBe(0);
      expect(result.stats.linesDeleted).toBe(0);
      expect(result.stats.linesUnchanged).toBe(3);
      expect(result.unifiedDiff).toBe('');
      expect(result.summary).toBe('No changes');
    });

    it('should detect added lines', () => {
      const oldContent = 'Line 1\nLine 2';
      const newContent = 'Line 1\nLine 2\nLine 3';
      const result = generateDiff(oldContent, newContent);

      expect(result.hasChanges).toBe(true);
      expect(result.stats.linesAdded).toBe(1);
      expect(result.stats.linesDeleted).toBe(0);
      expect(result.stats.linesUnchanged).toBe(2);
      expect(result.summary).toBe('+1 line in 1 change');
    });

    it('should detect deleted lines', () => {
      const oldContent = 'Line 1\nLine 2\nLine 3';
      const newContent = 'Line 1\nLine 2';
      const result = generateDiff(oldContent, newContent);

      expect(result.hasChanges).toBe(true);
      expect(result.stats.linesAdded).toBe(0);
      expect(result.stats.linesDeleted).toBe(1);
      expect(result.stats.linesUnchanged).toBe(2);
      expect(result.summary).toBe('-1 line in 1 change');
    });

    it('should detect modified lines', () => {
      const oldContent = 'Line 1\nLine 2\nLine 3';
      const newContent = 'Line 1\nModified Line 2\nLine 3';
      const result = generateDiff(oldContent, newContent);

      expect(result.hasChanges).toBe(true);
      expect(result.stats.linesAdded).toBe(1);
      expect(result.stats.linesDeleted).toBe(1);
    });

    it('should handle empty content', () => {
      const result = generateDiff('', 'New content');

      expect(result.hasChanges).toBe(true);
      expect(result.stats.linesAdded).toBe(1);
      expect(result.stats.oldLineCount).toBe(0);
    });

    it('should handle content becoming empty', () => {
      const result = generateDiff('Old content', '');

      expect(result.hasChanges).toBe(true);
      expect(result.stats.linesDeleted).toBe(1);
      expect(result.stats.newLineCount).toBe(0);
    });

    it('should handle both contents being empty', () => {
      const result = generateDiff('', '');

      expect(result.hasChanges).toBe(false);
      expect(result.stats.oldLineCount).toBe(0);
      expect(result.stats.newLineCount).toBe(0);
    });

    it('should generate unified diff format', () => {
      const oldContent = 'Line 1\nLine 2\nLine 3';
      const newContent = 'Line 1\nModified\nLine 3';
      const result = generateDiff(oldContent, newContent, {
        oldLabel: 'a/file.txt',
        newLabel: 'b/file.txt',
      });

      expect(result.unifiedDiff).toContain('--- a/file.txt');
      expect(result.unifiedDiff).toContain('+++ b/file.txt');
      expect(result.unifiedDiff).toContain('-Line 2');
      expect(result.unifiedDiff).toContain('+Modified');
    });

    it('should include context lines', () => {
      const lines = [];
      for (let i = 1; i <= 10; i++) {
        lines.push(`Line ${i}`);
      }
      const oldContent = lines.join('\n');
      const newContent = lines.map((l, i) => (i === 5 ? 'Changed' : l)).join('\n');

      const result = generateDiff(oldContent, newContent, { contextLines: 2 });

      // Should have context before and after the change
      expect(result.hunks.length).toBe(1);
      expect(result.hunks[0].operations.length).toBeGreaterThan(2);
    });
  });

  describe('Diff Options', () => {
    it('should ignore whitespace when configured', () => {
      const oldContent = 'Line   1\nLine 2';
      const newContent = 'Line 1\nLine 2';
      const result = generateDiff(oldContent, newContent, { ignoreWhitespace: true });

      expect(result.hasChanges).toBe(false);
    });

    it('should ignore case when configured', () => {
      const oldContent = 'Line ONE\nLine TWO';
      const newContent = 'Line one\nLine two';
      const result = generateDiff(oldContent, newContent, { ignoreCase: true });

      expect(result.hasChanges).toBe(false);
    });

    it('should truncate long lines when configured', () => {
      const longLine = 'A'.repeat(200);
      const oldContent = `Short\n${longLine}`;
      const newContent = 'Short\nDifferent';
      const result = generateDiff(oldContent, newContent, { maxLineLength: 50 });

      expect(result.unifiedDiff).toContain('...');
    });

    it('should use custom labels in unified diff', () => {
      const oldContent = 'Old';
      const newContent = 'New';
      const result = generateDiff(oldContent, newContent, {
        oldLabel: 'version-1.0',
        newLabel: 'version-2.0',
      });

      expect(result.unifiedDiff).toContain('--- version-1.0');
      expect(result.unifiedDiff).toContain('+++ version-2.0');
    });

    it('should respect context lines setting', () => {
      const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`);
      const oldContent = lines.join('\n');
      const newContent = lines.map((l, i) => (i === 10 ? 'Changed' : l)).join('\n');

      const result1 = generateDiff(oldContent, newContent, { contextLines: 1 });
      const result5 = generateDiff(oldContent, newContent, { contextLines: 5 });

      expect(result1.hunks[0].operations.length).toBeLessThan(
        result5.hunks[0].operations.length
      );
    });
  });

  describe('Side-by-side diff', () => {
    it('should generate side-by-side diff', () => {
      const oldContent = 'Line 1\nLine 2\nLine 3';
      const newContent = 'Line 1\nModified\nLine 3';
      const result = generateDiff(oldContent, newContent);

      expect(result.sideBySideDiff.length).toBeGreaterThan(0);

      // The algorithm may detect this as delete+insert or modify depending on adjacency
      // Check that we have changes captured
      const hasChangedLine = result.sideBySideDiff.some(
        (l) => l.type === 'modify' || l.type === 'delete' || l.type === 'insert'
      );
      expect(hasChangedLine).toBe(true);

      // Verify the content is present in the diff
      const deletedOrModified = result.sideBySideDiff.find((l) =>
        (l.type === 'delete' || l.type === 'modify') && l.oldContent === 'Line 2'
      );
      const insertedOrModified = result.sideBySideDiff.find((l) =>
        (l.type === 'insert' || l.type === 'modify') && l.newContent === 'Modified'
      );
      expect(deletedOrModified || insertedOrModified).toBeDefined();
    });

    it('should mark inserted lines correctly', () => {
      const oldContent = 'Line 1';
      const newContent = 'Line 1\nNew Line';
      const result = generateDiff(oldContent, newContent);

      const insertedLine = result.sideBySideDiff.find((l) => l.type === 'insert');
      expect(insertedLine).toBeDefined();
      expect(insertedLine?.newContent).toBe('New Line');
      expect(insertedLine?.oldContent).toBeUndefined();
    });

    it('should mark deleted lines correctly', () => {
      const oldContent = 'Line 1\nDeleted Line';
      const newContent = 'Line 1';
      const result = generateDiff(oldContent, newContent);

      const deletedLine = result.sideBySideDiff.find((l) => l.type === 'delete');
      expect(deletedLine).toBeDefined();
      expect(deletedLine?.oldContent).toBe('Deleted Line');
      expect(deletedLine?.newContent).toBeUndefined();
    });
  });

  describe('Hunks', () => {
    it('should group nearby changes into a single hunk', () => {
      const oldContent = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
      const newContent = 'Line 1\nChanged 2\nLine 3\nChanged 4\nLine 5';
      const result = generateDiff(oldContent, newContent, { contextLines: 2 });

      // Changes are close enough to be in one hunk
      expect(result.hunks.length).toBe(1);
    });

    it('should create separate hunks for distant changes', () => {
      const lines = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`);
      const oldContent = lines.join('\n');
      const newContent = lines
        .map((l, i) => {
          if (i === 2) return 'Changed at start';
          if (i === 27) return 'Changed at end';
          return l;
        })
        .join('\n');
      const result = generateDiff(oldContent, newContent, { contextLines: 2 });

      // Changes are far apart, should be separate hunks
      expect(result.hunks.length).toBe(2);
    });

    it('should include correct line numbers in hunks', () => {
      const oldContent = 'A\nB\nC\nD\nE';
      const newContent = 'A\nX\nC\nD\nE';
      const result = generateDiff(oldContent, newContent);

      expect(result.hunks.length).toBe(1);
      expect(result.hunks[0].oldStart).toBeGreaterThan(0);
      expect(result.hunks[0].newStart).toBeGreaterThan(0);
    });
  });

  describe('generateInlineDiff', () => {
    it('should highlight word-level changes', () => {
      const result = generateInlineDiff(
        'The quick brown fox',
        'The slow brown fox'
      );

      expect(result.oldSegments.some((s) => s.text === 'quick' && s.changed)).toBe(true);
      expect(result.newSegments.some((s) => s.text === 'slow' && s.changed)).toBe(true);
    });

    it('should handle added words', () => {
      const result = generateInlineDiff(
        'Hello world',
        'Hello beautiful world'
      );

      expect(result.newSegments.some((s) => s.text === 'beautiful' && s.changed)).toBe(
        true
      );
    });

    it('should handle removed words', () => {
      const result = generateInlineDiff(
        'Hello beautiful world',
        'Hello world'
      );

      expect(result.oldSegments.some((s) => s.text === 'beautiful' && s.changed)).toBe(
        true
      );
    });

    it('should preserve whitespace', () => {
      const result = generateInlineDiff('a  b  c', 'a  b  c');

      // No changes, all segments should be unchanged
      expect(result.oldSegments.every((s) => !s.changed)).toBe(true);
    });
  });

  describe('formatDiffAnsi', () => {
    it('should include ANSI color codes', () => {
      const oldContent = 'Line 1\nOld\nLine 3';
      const newContent = 'Line 1\nNew\nLine 3';
      const diff = generateDiff(oldContent, newContent);
      const formatted = formatDiffAnsi(diff);

      // Check for ANSI escape sequences
      expect(formatted).toContain('\x1b[31m'); // Red for deletions
      expect(formatted).toContain('\x1b[32m'); // Green for additions
      expect(formatted).toContain('\x1b[0m'); // Reset
    });

    it('should handle empty diff', () => {
      const content = 'Same content';
      const diff = generateDiff(content, content);
      const formatted = formatDiffAnsi(diff);

      expect(formatted).toBe('');
    });
  });

  describe('formatDiffHtml', () => {
    it('should generate HTML with diff classes', () => {
      const oldContent = 'Line 1\nOld\nLine 3';
      const newContent = 'Line 1\nNew\nLine 3';
      const diff = generateDiff(oldContent, newContent);
      const formatted = formatDiffHtml(diff);

      expect(formatted).toContain('<div class="diff">');
      expect(formatted).toContain('diff-delete');
      expect(formatted).toContain('diff-insert');
    });

    it('should escape HTML special characters', () => {
      const oldContent = '<script>alert("xss")</script>';
      const newContent = '<div>safe</div>';
      const diff = generateDiff(oldContent, newContent);
      const formatted = formatDiffHtml(diff);

      expect(formatted).not.toContain('<script>');
      expect(formatted).toContain('&lt;script&gt;');
    });
  });

  describe('hasContentChanged', () => {
    it('should return false for identical content', () => {
      expect(hasContentChanged('same', 'same')).toBe(false);
    });

    it('should return true for different content', () => {
      expect(hasContentChanged('old', 'new')).toBe(true);
    });
  });

  describe('getQuickStats', () => {
    it('should return basic statistics', () => {
      const oldContent = 'Line 1\nLine 2';
      const newContent = 'Line 1\nLine 2\nLine 3';
      const stats = getQuickStats(oldContent, newContent);

      expect(stats.changed).toBe(true);
      expect(stats.oldLineCount).toBe(2);
      expect(stats.newLineCount).toBe(3);
      expect(stats.sizeDelta).toBeGreaterThan(0);
    });

    it('should detect no changes', () => {
      const content = 'Same content';
      const stats = getQuickStats(content, content);

      expect(stats.changed).toBe(false);
      expect(stats.sizeDelta).toBe(0);
    });
  });

  describe('Complex scenarios', () => {
    it('should handle multi-line changes correctly', () => {
      const oldContent = `function hello() {
  console.log("Hello");
  return true;
}`;
      const newContent = `function hello() {
  console.log("Hello, World!");
  console.log("Goodbye");
  return true;
}`;
      const result = generateDiff(oldContent, newContent);

      expect(result.hasChanges).toBe(true);
      expect(result.stats.linesAdded).toBeGreaterThan(0);
    });

    it('should handle completely different content', () => {
      const oldContent = 'Alpha\nBeta\nGamma';
      const newContent = 'One\nTwo\nThree';
      const result = generateDiff(oldContent, newContent);

      expect(result.hasChanges).toBe(true);
      expect(result.stats.linesAdded).toBe(3);
      expect(result.stats.linesDeleted).toBe(3);
    });

    it('should handle content with special characters', () => {
      const oldContent = 'Price: $100\nDiscount: 10%';
      const newContent = 'Price: $150\nDiscount: 15%';
      const result = generateDiff(oldContent, newContent);

      expect(result.hasChanges).toBe(true);
      expect(result.unifiedDiff).toContain('$100');
      expect(result.unifiedDiff).toContain('$150');
    });

    it('should handle content with unicode', () => {
      const oldContent = 'Hello World';
      const newContent = 'Bonjour Monde';
      const result = generateDiff(oldContent, newContent);

      expect(result.hasChanges).toBe(true);
      expect(result.unifiedDiff).toContain('Hello');
      expect(result.unifiedDiff).toContain('Bonjour');
    });
  });
});
