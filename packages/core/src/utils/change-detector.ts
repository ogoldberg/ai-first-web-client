/**
 * Change Detector - Identifies content changes between page versions
 *
 * Useful for:
 * - Detecting when government websites update their content
 * - Flagging stale knowledge base entries
 * - Tracking regulatory changes
 */

import * as crypto from 'crypto';

export interface ContentFingerprint {
  hash: string;
  textLength: number;
  wordCount: number;
  structureHash: string;
  timestamp: number;
}

export interface ContentChange {
  type: 'added' | 'removed' | 'modified';
  section?: string;
  oldValue?: string;
  newValue?: string;
  significance: 'low' | 'medium' | 'high';
}

export interface ChangeReport {
  hasChanges: boolean;
  overallSignificance: 'none' | 'low' | 'medium' | 'high';
  changes: ContentChange[];
  oldFingerprint: ContentFingerprint;
  newFingerprint: ContentFingerprint;
  summary: string;
}

/**
 * Create a fingerprint of content for comparison
 */
export function createFingerprint(content: string): ContentFingerprint {
  // Normalize whitespace for consistent comparison
  const normalizedText = content.replace(/\s+/g, ' ').trim();

  // Create hash of full content
  const hash = crypto.createHash('md5').update(normalizedText).digest('hex');

  // Create structure hash (just the pattern of paragraphs/sections)
  const structurePattern = content
    .split(/\n\n+/)
    .map((block) => {
      if (block.startsWith('#')) return 'H';
      if (block.startsWith('- ') || block.startsWith('* ')) return 'L';
      if (block.match(/^\d+\./)) return 'N';
      if (block.startsWith('|')) return 'T';
      return 'P';
    })
    .join('');
  const structureHash = crypto.createHash('md5').update(structurePattern).digest('hex');

  return {
    hash,
    textLength: normalizedText.length,
    wordCount: normalizedText.split(/\s+/).length,
    structureHash,
    timestamp: Date.now(),
  };
}

/**
 * Compare two fingerprints for quick change detection
 */
export function hasContentChanged(
  oldFingerprint: ContentFingerprint,
  newFingerprint: ContentFingerprint
): boolean {
  return oldFingerprint.hash !== newFingerprint.hash;
}

/**
 * Get significance of changes based on fingerprint comparison
 */
export function getChangeSignificance(
  oldFingerprint: ContentFingerprint,
  newFingerprint: ContentFingerprint
): 'none' | 'low' | 'medium' | 'high' {
  if (oldFingerprint.hash === newFingerprint.hash) {
    return 'none';
  }

  // Structure changed = significant
  if (oldFingerprint.structureHash !== newFingerprint.structureHash) {
    return 'high';
  }

  // Large content change
  const lengthChange = Math.abs(newFingerprint.textLength - oldFingerprint.textLength);
  const lengthChangePercent = lengthChange / oldFingerprint.textLength;

  if (lengthChangePercent > 0.2) {
    return 'high';
  }
  if (lengthChangePercent > 0.05) {
    return 'medium';
  }

  return 'low';
}

/**
 * Detailed comparison between two content versions
 */
export function compareContent(oldContent: string, newContent: string): ChangeReport {
  const oldFingerprint = createFingerprint(oldContent);
  const newFingerprint = createFingerprint(newContent);

  if (!hasContentChanged(oldFingerprint, newFingerprint)) {
    return {
      hasChanges: false,
      overallSignificance: 'none',
      changes: [],
      oldFingerprint,
      newFingerprint,
      summary: 'No changes detected',
    };
  }

  const changes: ContentChange[] = [];

  // Split into paragraphs/sections for comparison
  const oldSections = oldContent.split(/\n\n+/).filter((s) => s.trim());
  const newSections = newContent.split(/\n\n+/).filter((s) => s.trim());

  // Find added sections
  for (const section of newSections) {
    const normalizedNew = section.replace(/\s+/g, ' ').trim();
    const exists = oldSections.some((old) => old.replace(/\s+/g, ' ').trim() === normalizedNew);

    if (!exists) {
      // Check if it's a modification of an existing section
      const similar = findSimilarSection(section, oldSections);
      if (similar) {
        changes.push({
          type: 'modified',
          oldValue: similar.substring(0, 200),
          newValue: section.substring(0, 200),
          significance: categorizeChange(section),
        });
      } else {
        changes.push({
          type: 'added',
          newValue: section.substring(0, 200),
          significance: categorizeChange(section),
        });
      }
    }
  }

  // Find removed sections
  for (const section of oldSections) {
    const normalizedOld = section.replace(/\s+/g, ' ').trim();
    const exists = newSections.some((newS) => newS.replace(/\s+/g, ' ').trim() === normalizedOld);
    const wasMofidied = changes.some(
      (c) => c.type === 'modified' && c.oldValue === section.substring(0, 200)
    );

    if (!exists && !wasMofidied) {
      changes.push({
        type: 'removed',
        oldValue: section.substring(0, 200),
        significance: categorizeChange(section),
      });
    }
  }

  const overallSignificance = getChangeSignificance(oldFingerprint, newFingerprint);

  return {
    hasChanges: true,
    overallSignificance,
    changes,
    oldFingerprint,
    newFingerprint,
    summary: generateSummary(changes, overallSignificance),
  };
}

/**
 * Find a similar section (for detecting modifications vs additions)
 */
function findSimilarSection(target: string, sections: string[]): string | undefined {
  const targetWords = new Set(target.toLowerCase().split(/\s+/));

  for (const section of sections) {
    const sectionWords = new Set(section.toLowerCase().split(/\s+/));

    // Calculate Jaccard similarity
    const intersection = new Set([...targetWords].filter((w) => sectionWords.has(w)));
    const union = new Set([...targetWords, ...sectionWords]);
    const similarity = intersection.size / union.size;

    // If more than 50% similar, consider it a modification
    if (similarity > 0.5) {
      return section;
    }
  }

  return undefined;
}

/**
 * Categorize the significance of a change based on content
 */
function categorizeChange(content: string): 'low' | 'medium' | 'high' {
  const lowerContent = content.toLowerCase();

  // High-significance keywords for immigration/visa context
  const highSignificance = [
    'requirement',
    'required',
    'must',
    'mandatory',
    'deadline',
    'fee',
    'cost',
    'price',
    'income',
    'minimum',
    'maximum',
    'visa',
    'permit',
    'application',
    'document',
    'effective',
    'valid',
    'expire',
  ];

  const mediumSignificance = [
    'may',
    'should',
    'recommend',
    'option',
    'alternative',
    'process',
    'step',
    'procedure',
  ];

  for (const keyword of highSignificance) {
    if (lowerContent.includes(keyword)) {
      return 'high';
    }
  }

  for (const keyword of mediumSignificance) {
    if (lowerContent.includes(keyword)) {
      return 'medium';
    }
  }

  return 'low';
}

/**
 * Generate a human-readable summary of changes
 */
function generateSummary(changes: ContentChange[], significance: 'none' | 'low' | 'medium' | 'high'): string {
  if (changes.length === 0) {
    return 'No significant changes detected';
  }

  const added = changes.filter((c) => c.type === 'added').length;
  const removed = changes.filter((c) => c.type === 'removed').length;
  const modified = changes.filter((c) => c.type === 'modified').length;
  const highSig = changes.filter((c) => c.significance === 'high').length;

  const parts: string[] = [];

  if (added > 0) parts.push(`${added} section${added > 1 ? 's' : ''} added`);
  if (removed > 0) parts.push(`${removed} section${removed > 1 ? 's' : ''} removed`);
  if (modified > 0) parts.push(`${modified} section${modified > 1 ? 's' : ''} modified`);

  let summary = parts.join(', ');

  if (highSig > 0) {
    summary += ` (${highSig} high-significance change${highSig > 1 ? 's' : ''})`;
  }

  return summary;
}

/**
 * Extract key numbers/values from content for comparison
 * Useful for detecting threshold changes
 */
export function extractKeyValues(content: string): Map<string, string> {
  const values = new Map<string, string>();

  // Currency amounts
  const currencyMatches = content.matchAll(/(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:EUR|USD|\$|euros?)/gi);
  for (const match of currencyMatches) {
    const key = `currency_${values.size}`;
    values.set(key, match[0]);
  }

  // Percentages
  const percentMatches = content.matchAll(/(\d+(?:\.\d+)?)\s*%/g);
  for (const match of percentMatches) {
    const key = `percent_${values.size}`;
    values.set(key, match[0]);
  }

  // Durations
  const durationMatches = content.matchAll(/(\d+)\s*(?:days?|weeks?|months?|years?)/gi);
  for (const match of durationMatches) {
    const key = `duration_${values.size}`;
    values.set(key, match[0]);
  }

  return values;
}

/**
 * Compare key values between two versions
 */
export function compareKeyValues(
  oldContent: string,
  newContent: string
): { changed: boolean; differences: { type: string; old: string; new: string }[] } {
  const oldValues = extractKeyValues(oldContent);
  const newValues = extractKeyValues(newContent);

  const differences: { type: string; old: string; new: string }[] = [];

  // Compare old values to new
  for (const [key, oldVal] of oldValues) {
    const newVal = newValues.get(key);
    if (!newVal || oldVal !== newVal) {
      const type = key.split('_')[0];
      differences.push({
        type,
        old: oldVal,
        new: newVal || '(removed)',
      });
    }
  }

  // Check for new values
  for (const [key, newVal] of newValues) {
    if (!oldValues.has(key)) {
      const type = key.split('_')[0];
      differences.push({
        type,
        old: '(new)',
        new: newVal,
      });
    }
  }

  return {
    changed: differences.length > 0,
    differences,
  };
}
