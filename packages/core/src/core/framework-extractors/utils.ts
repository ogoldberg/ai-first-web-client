/**
 * Framework Extractors Utilities
 *
 * Shared utility functions for framework data extraction.
 */

/**
 * Recursively extract text from an object
 * Returns a string with all text content found in the object
 */
export function extractTextFromObject(obj: unknown, visited = new Set<unknown>()): string {
  if (typeof obj !== 'object' || obj === null) {
    if (typeof obj === 'string' && obj.length > 20 && !obj.startsWith('http')) {
      return obj + '\n';
    }
    return '';
  }

  // Cycle detection to prevent infinite recursion
  if (visited.has(obj)) {
    return '';
  }
  visited.add(obj);

  let text = '';

  if (Array.isArray(obj)) {
    for (const item of obj) {
      text += extractTextFromObject(item, visited);
    }
  } else {
    const record = obj as Record<string, unknown>;
    // Prioritize content-like keys
    const contentKeys = [
      'content',
      'text',
      'body',
      'description',
      'summary',
      'article',
      'post',
      'message',
      'comment',
    ];

    for (const key of contentKeys) {
      if (key in record) {
        text += extractTextFromObject(record[key], visited);
      }
    }

    // Then other keys
    for (const [key, value] of Object.entries(record)) {
      if (!contentKeys.includes(key)) {
        text += extractTextFromObject(value, visited);
      }
    }
  }

  return text;
}

/**
 * Extract title from an object by looking for common title property names
 */
export function extractTitleFromObject(obj: unknown, visited = new Set<unknown>()): string {
  if (typeof obj !== 'object' || obj === null) return '';

  // Cycle detection to prevent infinite recursion
  if (visited.has(obj)) {
    return '';
  }
  visited.add(obj);

  const record = obj as Record<string, unknown>;
  const titleKeys = ['title', 'name', 'headline', 'heading', 'pageTitle', 'documentTitle'];

  for (const key of titleKeys) {
    if (typeof record[key] === 'string' && record[key]) {
      return record[key] as string;
    }
  }

  // Recursively search for title in nested objects
  for (const value of Object.values(record)) {
    if (typeof value === 'object' && value !== null) {
      const found = extractTitleFromObject(value, visited);
      if (found) return found;
    }
  }

  return '';
}

/**
 * Unescape JavaScript string escape sequences
 */
export function unescapeJavaScriptString(str: string): string {
  // Handle common JavaScript string escape sequences
  // Order matters: process backslash escapes before others
  return str
    .replace(/\\\\/g, '\x00') // Temporarily mark escaped backslashes
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\x00/g, '\\'); // Restore backslashes
}

/**
 * Simple HTML to plain text converter
 */
export function htmlToPlainText(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Replace common block elements with newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, '\n');
  text = text.replace(/<(br|hr)\s*\/?>/gi, '\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");

  // Normalize whitespace
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  text = text.trim();

  return text;
}
