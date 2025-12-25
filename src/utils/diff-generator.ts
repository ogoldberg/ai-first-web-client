/**
 * Diff Generator - Line-level diff generation for content comparison
 *
 * Provides:
 * - Line-by-line diff using Myers algorithm (LCS-based)
 * - Unified diff format output (like git diff)
 * - Context-aware diff with configurable context lines
 * - Inline diff for showing character-level changes
 * - Summary statistics and change counts
 *
 * Part of F-010: Diff Generation for Content Changes
 */

/**
 * A single diff operation
 */
export interface DiffOp {
  /** Type of operation */
  type: 'equal' | 'insert' | 'delete';

  /** The line content */
  line: string;

  /** Line number in old content (1-indexed, undefined for inserts) */
  oldLineNumber?: number;

  /** Line number in new content (1-indexed, undefined for deletes) */
  newLineNumber?: number;
}

/**
 * A hunk in a unified diff (group of changes with context)
 */
export interface DiffHunk {
  /** Starting line in old content */
  oldStart: number;

  /** Number of lines from old content */
  oldCount: number;

  /** Starting line in new content */
  newStart: number;

  /** Number of lines from new content */
  newCount: number;

  /** The operations in this hunk */
  operations: DiffOp[];
}

/**
 * Full diff result with statistics and formatting
 */
export interface DiffResult {
  /** Whether there are any changes */
  hasChanges: boolean;

  /** All diff operations */
  operations: DiffOp[];

  /** Hunks (groups of changes with context) */
  hunks: DiffHunk[];

  /** Statistics about the diff */
  stats: DiffStats;

  /** Unified diff format string */
  unifiedDiff: string;

  /** Side-by-side diff format */
  sideBySideDiff: SideBySideLine[];

  /** Summary string */
  summary: string;
}

/**
 * Statistics about a diff
 */
export interface DiffStats {
  /** Total lines in old content */
  oldLineCount: number;

  /** Total lines in new content */
  newLineCount: number;

  /** Number of lines added */
  linesAdded: number;

  /** Number of lines deleted */
  linesDeleted: number;

  /** Number of lines unchanged */
  linesUnchanged: number;

  /** Number of hunks (change groups) */
  hunkCount: number;
}

/**
 * A line in side-by-side diff format
 */
export interface SideBySideLine {
  /** Line number in old content */
  oldLineNumber?: number;

  /** Content from old version */
  oldContent?: string;

  /** Line number in new content */
  newLineNumber?: number;

  /** Content from new version */
  newContent?: string;

  /** Type of change */
  type: 'equal' | 'insert' | 'delete' | 'modify';
}

/**
 * Options for diff generation
 */
export interface DiffOptions {
  /** Number of context lines around changes (default: 3) */
  contextLines?: number;

  /** Ignore whitespace changes (default: false) */
  ignoreWhitespace?: boolean;

  /** Ignore case (default: false) */
  ignoreCase?: boolean;

  /** Label for old content in unified diff (default: 'old') */
  oldLabel?: string;

  /** Label for new content in unified diff (default: 'new') */
  newLabel?: string;

  /** Maximum line length before truncation (default: no limit) */
  maxLineLength?: number;
}

const DEFAULT_OPTIONS: Required<DiffOptions> = {
  contextLines: 3,
  ignoreWhitespace: false,
  ignoreCase: false,
  oldLabel: 'old',
  newLabel: 'new',
  maxLineLength: 0,
};

/**
 * Generate a diff between two strings
 *
 * @param oldContent - Original content
 * @param newContent - Modified content
 * @param options - Diff options
 * @returns Full diff result with multiple formats
 */
export function generateDiff(
  oldContent: string,
  newContent: string,
  options: DiffOptions = {}
): DiffResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Split into lines
  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);

  // Normalize lines if needed
  const compareOld = normalizeLines(oldLines, opts);
  const compareNew = normalizeLines(newLines, opts);

  // Compute LCS-based diff
  const operations = computeDiff(oldLines, newLines, compareOld, compareNew);

  // Check if there are any changes
  const hasChanges = operations.some((op) => op.type !== 'equal');

  // Compute statistics
  const stats = computeStats(operations, oldLines.length, newLines.length);

  // Generate hunks
  const hunks = generateHunks(operations, opts.contextLines);
  stats.hunkCount = hunks.length;

  // Generate unified diff format
  const unifiedDiff = generateUnifiedDiff(hunks, opts);

  // Generate side-by-side diff
  const sideBySideDiff = generateSideBySide(operations);

  // Generate summary
  const summary = generateSummary(stats);

  return {
    hasChanges,
    operations,
    hunks,
    stats,
    unifiedDiff,
    sideBySideDiff,
    summary,
  };
}

/**
 * Split content into lines, preserving empty lines
 */
function splitLines(content: string): string[] {
  if (content === '') return [];
  return content.split('\n');
}

/**
 * Normalize lines for comparison
 */
function normalizeLines(lines: string[], opts: Required<DiffOptions>): string[] {
  return lines.map((line) => {
    let normalized = line;
    if (opts.ignoreWhitespace) {
      normalized = normalized.replace(/\s+/g, ' ').trim();
    }
    if (opts.ignoreCase) {
      normalized = normalized.toLowerCase();
    }
    return normalized;
  });
}

/**
 * Generic LCS-based diff computation
 * Used by both line-level and word-level diff functions
 *
 * @param oldItems - Original items to compare
 * @param newItems - New items to compare
 * @param compareOld - Normalized old items for comparison (or same as oldItems)
 * @param compareNew - Normalized new items for comparison (or same as newItems)
 * @param mapResult - Function to map each operation to the desired output format
 * @returns Array of diff operations
 */
function computeLcsDiff<T, R>(
  oldItems: T[],
  newItems: T[],
  compareOld: T[],
  compareNew: T[],
  mapResult: (type: 'equal' | 'insert' | 'delete', item: T, oldIdx: number, newIdx: number) => R
): R[] {
  const m = oldItems.length;
  const n = newItems.length;

  // Build LCS table
  const lcs: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (compareOld[i] === compareNew[j]) {
        lcs[i][j] = lcs[i + 1][j + 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
  }

  // Backtrack to build diff
  const operations: R[] = [];
  let i = 0;
  let j = 0;
  let oldIdx = 1;
  let newIdx = 1;

  while (i < m || j < n) {
    if (i < m && j < n && compareOld[i] === compareNew[j]) {
      // Items are equal
      operations.push(mapResult('equal', newItems[j], oldIdx++, newIdx++));
      i++;
      j++;
    } else if (j < n && (i >= m || lcs[i][j + 1] >= lcs[i + 1][j])) {
      // Insert
      operations.push(mapResult('insert', newItems[j], -1, newIdx++));
      j++;
    } else {
      // Delete
      operations.push(mapResult('delete', oldItems[i], oldIdx++, -1));
      i++;
    }
  }

  return operations;
}

/**
 * Compute diff using Myers algorithm (LCS-based approach)
 * This is a simplified implementation that's efficient for typical content sizes
 */
function computeDiff(
  oldLines: string[],
  newLines: string[],
  compareOld: string[],
  compareNew: string[]
): DiffOp[] {
  return computeLcsDiff(
    oldLines,
    newLines,
    compareOld,
    compareNew,
    (type, line, oldIdx, newIdx): DiffOp => ({
      type,
      line,
      oldLineNumber: oldIdx > 0 ? oldIdx : undefined,
      newLineNumber: newIdx > 0 ? newIdx : undefined,
    })
  );
}

/**
 * Compute diff statistics
 */
function computeStats(
  operations: DiffOp[],
  oldLineCount: number,
  newLineCount: number
): DiffStats {
  let linesAdded = 0;
  let linesDeleted = 0;
  let linesUnchanged = 0;

  for (const op of operations) {
    switch (op.type) {
      case 'equal':
        linesUnchanged++;
        break;
      case 'insert':
        linesAdded++;
        break;
      case 'delete':
        linesDeleted++;
        break;
    }
  }

  return {
    oldLineCount,
    newLineCount,
    linesAdded,
    linesDeleted,
    linesUnchanged,
    hunkCount: 0, // Will be set later
  };
}

/**
 * Generate hunks from operations
 * Uses incremental line number tracking to avoid O(N*M) complexity
 */
function generateHunks(operations: DiffOp[], contextLines: number): DiffHunk[] {
  const hunks: DiffHunk[] = [];

  // Find change ranges
  const changeIndices: number[] = [];
  for (let i = 0; i < operations.length; i++) {
    if (operations[i].type !== 'equal') {
      changeIndices.push(i);
    }
  }

  if (changeIndices.length === 0) {
    return [];
  }

  // Track line numbers incrementally as we process hunks
  let trackedOldLine = 1;
  let trackedNewLine = 1;
  let trackedIndex = 0;

  // Helper to advance line tracking to a given index
  const advanceTrackingTo = (targetIndex: number): { oldLine: number; newLine: number } => {
    while (trackedIndex < targetIndex) {
      const op = operations[trackedIndex];
      if (op.type === 'equal' || op.type === 'delete') {
        trackedOldLine++;
      }
      if (op.type === 'equal' || op.type === 'insert') {
        trackedNewLine++;
      }
      trackedIndex++;
    }
    return { oldLine: trackedOldLine, newLine: trackedNewLine };
  };

  // Group changes that are close together
  let hunkStart = Math.max(0, changeIndices[0] - contextLines);
  let hunkEnd = Math.min(operations.length - 1, changeIndices[0] + contextLines);

  for (let i = 1; i < changeIndices.length; i++) {
    const changeIdx = changeIndices[i];
    const potentialStart = Math.max(0, changeIdx - contextLines);

    // If this change's context overlaps with current hunk, extend it
    if (potentialStart <= hunkEnd + 1) {
      hunkEnd = Math.min(operations.length - 1, changeIdx + contextLines);
    } else {
      // Advance tracking to hunk start and create hunk
      const lineNumbers = advanceTrackingTo(hunkStart);
      hunks.push(createHunk(operations, hunkStart, hunkEnd, lineNumbers.oldLine, lineNumbers.newLine));

      // Start new hunk
      hunkStart = potentialStart;
      hunkEnd = Math.min(operations.length - 1, changeIdx + contextLines);
    }
  }

  // Add final hunk
  const lineNumbers = advanceTrackingTo(hunkStart);
  hunks.push(createHunk(operations, hunkStart, hunkEnd, lineNumbers.oldLine, lineNumbers.newLine));

  return hunks;
}

/**
 * Create a hunk from a range of operations
 * Takes pre-computed starting line numbers to avoid redundant iteration
 */
function createHunk(
  operations: DiffOp[],
  start: number,
  end: number,
  oldStart: number,
  newStart: number
): DiffHunk {
  const hunkOps = operations.slice(start, end + 1);

  // Count lines in hunk
  let oldCount = 0;
  let newCount = 0;
  for (const op of hunkOps) {
    if (op.type === 'equal' || op.type === 'delete') {
      oldCount++;
    }
    if (op.type === 'equal' || op.type === 'insert') {
      newCount++;
    }
  }

  return {
    oldStart,
    oldCount,
    newStart,
    newCount,
    operations: hunkOps,
  };
}

/**
 * Generate unified diff format string
 */
function generateUnifiedDiff(hunks: DiffHunk[], opts: Required<DiffOptions>): string {
  if (hunks.length === 0) {
    return '';
  }

  const lines: string[] = [];

  // Header
  lines.push(`--- ${opts.oldLabel}`);
  lines.push(`+++ ${opts.newLabel}`);

  for (const hunk of hunks) {
    // Hunk header
    lines.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`);

    // Hunk content
    for (const op of hunk.operations) {
      let prefix: string;
      let content = op.line;

      switch (op.type) {
        case 'equal':
          prefix = ' ';
          break;
        case 'insert':
          prefix = '+';
          break;
        case 'delete':
          prefix = '-';
          break;
      }

      // Truncate if needed
      if (opts.maxLineLength > 0 && content.length > opts.maxLineLength) {
        content = content.substring(0, opts.maxLineLength - 3) + '...';
      }

      lines.push(prefix + content);
    }
  }

  return lines.join('\n');
}

/**
 * Generate side-by-side diff
 */
function generateSideBySide(operations: DiffOp[]): SideBySideLine[] {
  const lines: SideBySideLine[] = [];
  let i = 0;

  while (i < operations.length) {
    const op = operations[i];

    if (op.type === 'equal') {
      lines.push({
        type: 'equal',
        oldLineNumber: op.oldLineNumber,
        oldContent: op.line,
        newLineNumber: op.newLineNumber,
        newContent: op.line,
      });
      i++;
    } else if (op.type === 'delete') {
      // Check if next operation is an insert (indicates modification)
      if (i + 1 < operations.length && operations[i + 1].type === 'insert') {
        lines.push({
          type: 'modify',
          oldLineNumber: op.oldLineNumber,
          oldContent: op.line,
          newLineNumber: operations[i + 1].newLineNumber,
          newContent: operations[i + 1].line,
        });
        i += 2;
      } else {
        lines.push({
          type: 'delete',
          oldLineNumber: op.oldLineNumber,
          oldContent: op.line,
        });
        i++;
      }
    } else {
      // Insert
      lines.push({
        type: 'insert',
        newLineNumber: op.newLineNumber,
        newContent: op.line,
      });
      i++;
    }
  }

  return lines;
}

/**
 * Generate a summary of the diff
 */
function generateSummary(stats: DiffStats): string {
  const parts: string[] = [];

  if (stats.linesAdded > 0) {
    parts.push(`+${stats.linesAdded} line${stats.linesAdded === 1 ? '' : 's'}`);
  }
  if (stats.linesDeleted > 0) {
    parts.push(`-${stats.linesDeleted} line${stats.linesDeleted === 1 ? '' : 's'}`);
  }

  if (parts.length === 0) {
    return 'No changes';
  }

  const hunkInfo =
    stats.hunkCount > 0
      ? ` in ${stats.hunkCount} change${stats.hunkCount === 1 ? '' : 's'}`
      : '';

  return parts.join(', ') + hunkInfo;
}

/**
 * Generate inline diff showing character-level changes between two lines
 *
 * @param oldLine - Original line
 * @param newLine - Modified line
 * @returns Object with highlighted segments
 */
export function generateInlineDiff(
  oldLine: string,
  newLine: string
): {
  oldSegments: Array<{ text: string; changed: boolean }>;
  newSegments: Array<{ text: string; changed: boolean }>;
} {
  // Split into words for word-level diff
  const oldWords = tokenize(oldLine);
  const newWords = tokenize(newLine);

  // Compute word-level diff
  const wordOps = computeWordDiff(oldWords, newWords);

  // Build segments
  const oldSegments: Array<{ text: string; changed: boolean }> = [];
  const newSegments: Array<{ text: string; changed: boolean }> = [];

  for (const op of wordOps) {
    switch (op.type) {
      case 'equal':
        oldSegments.push({ text: op.word, changed: false });
        newSegments.push({ text: op.word, changed: false });
        break;
      case 'delete':
        oldSegments.push({ text: op.word, changed: true });
        break;
      case 'insert':
        newSegments.push({ text: op.word, changed: true });
        break;
    }
  }

  return { oldSegments, newSegments };
}

/**
 * Tokenize a line into words and whitespace
 * Uses regex split to separate words from whitespace while preserving both
 */
function tokenize(line: string): string[] {
  if (!line) {
    return [];
  }
  // Split by whitespace, keeping the whitespace as a token
  // The filter(Boolean) removes empty strings from leading/trailing whitespace
  return line.split(/(\s+)/).filter(Boolean);
}

interface WordOp {
  type: 'equal' | 'insert' | 'delete';
  word: string;
}

/**
 * Compute word-level diff using the generic LCS algorithm
 */
function computeWordDiff(oldWords: string[], newWords: string[]): WordOp[] {
  return computeLcsDiff(
    oldWords,
    newWords,
    oldWords,
    newWords,
    (type, word): WordOp => ({ type, word })
  );
}

/**
 * Format a diff for terminal output with ANSI colors
 *
 * @param diff - The diff result
 * @returns Formatted string with ANSI color codes
 */
export function formatDiffAnsi(diff: DiffResult): string {
  const RED = '\x1b[31m';
  const GREEN = '\x1b[32m';
  const CYAN = '\x1b[36m';
  const RESET = '\x1b[0m';

  const lines: string[] = [];

  for (const hunk of diff.hunks) {
    lines.push(`${CYAN}@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@${RESET}`);

    for (const op of hunk.operations) {
      switch (op.type) {
        case 'equal':
          lines.push(' ' + op.line);
          break;
        case 'insert':
          lines.push(`${GREEN}+${op.line}${RESET}`);
          break;
        case 'delete':
          lines.push(`${RED}-${op.line}${RESET}`);
          break;
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format a diff for HTML output
 *
 * @param diff - The diff result
 * @returns HTML string with styled diff
 */
export function formatDiffHtml(diff: DiffResult): string {
  const lines: string[] = ['<div class="diff">'];

  for (const hunk of diff.hunks) {
    lines.push(
      `<div class="diff-hunk-header">@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@</div>`
    );

    for (const op of hunk.operations) {
      const escapedLine = escapeHtml(op.line);

      switch (op.type) {
        case 'equal':
          lines.push(`<div class="diff-line diff-equal"> ${escapedLine}</div>`);
          break;
        case 'insert':
          lines.push(`<div class="diff-line diff-insert">+${escapedLine}</div>`);
          break;
        case 'delete':
          lines.push(`<div class="diff-line diff-delete">-${escapedLine}</div>`);
          break;
      }
    }
  }

  lines.push('</div>');
  return lines.join('\n');
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Quick check if content has changed (without full diff)
 *
 * @param oldContent - Original content
 * @param newContent - Modified content
 * @returns Whether content has changed
 */
export function hasContentChanged(oldContent: string, newContent: string): boolean {
  return oldContent !== newContent;
}

/**
 * Get quick stats without full diff computation
 *
 * @param oldContent - Original content
 * @param newContent - Modified content
 * @returns Basic statistics
 */
export function getQuickStats(
  oldContent: string,
  newContent: string
): {
  changed: boolean;
  oldLineCount: number;
  newLineCount: number;
  sizeDelta: number;
} {
  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);

  return {
    changed: oldContent !== newContent,
    oldLineCount: oldLines.length,
    newLineCount: newLines.length,
    sizeDelta: newContent.length - oldContent.length,
  };
}
