/**
 * ContentExtractor - In-browser content extraction
 *
 * Runs in the user's browser to extract structured content
 * from loaded pages. Uses patterns from Unbrowser Cloud.
 *
 * Note: Custom extraction functions are NOT supported in the SDK
 * for security reasons. Custom extraction logic runs server-side
 * in Unbrowser Cloud and results are returned via patterns.
 */

import type { ExtractionOptions, FetchResult } from '../types.js';

interface SitePattern {
  domain: string;
  version: string;
  selectors: {
    title?: string;
    content?: string;
    author?: string;
    date?: string;
    [key: string]: string | undefined;
  };
  contentStructure?: {
    type: 'article' | 'list' | 'forum' | 'product' | 'unknown';
  };
}

/**
 * Extract content from a document
 */
export async function extractContent(
  doc: Document,
  options: ExtractionOptions,
  pattern?: SitePattern
): Promise<FetchResult['content']> {
  const content: FetchResult['content'] = {};

  // Extract HTML if requested
  if (options.html) {
    content.html = doc.documentElement.outerHTML;
  }

  // Extract text content
  if (options.text !== false) {
    content.text = extractText(doc, pattern);
  }

  // Extract as markdown
  if (options.markdown) {
    content.markdown = htmlToMarkdown(doc.body, pattern);
  }

  // Extract structured data (JSON-LD, microdata)
  if (options.structured) {
    content.structured = extractStructuredData(doc);
  }

  // Extract by custom selectors
  if (options.selectors) {
    content.selectors = extractBySelectors(doc, options.selectors);
  }

  // Use pattern-based extraction
  if (options.usePatterns && pattern) {
    const patternContent = extractWithPattern(doc, pattern);
    Object.assign(content, patternContent);
  }

  // Note: options.custom is intentionally not supported in browser SDK
  // for security reasons. Custom extraction runs server-side.

  return content;
}

/**
 * Extract clean text from document
 */
function extractText(doc: Document, pattern?: SitePattern): string {
  // Use pattern selector if available
  if (pattern?.selectors?.content) {
    const contentEl = doc.querySelector(pattern.selectors.content);
    if (contentEl) {
      return cleanText(contentEl.textContent || '');
    }
  }

  // Try common content containers
  const contentSelectors = [
    'article',
    'main',
    '[role="main"]',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.content',
    '#content',
  ];

  for (const selector of contentSelectors) {
    const el = doc.querySelector(selector);
    if (el) {
      return cleanText(el.textContent || '');
    }
  }

  // Fall back to body, excluding nav/footer/aside
  const body = doc.body.cloneNode(true) as HTMLElement;
  const excludeSelectors = ['nav', 'footer', 'aside', 'header', '.sidebar', '.comments'];
  for (const selector of excludeSelectors) {
    body.querySelectorAll(selector).forEach((el) => el.remove());
  }

  return cleanText(body.textContent || '');
}

/**
 * Convert HTML to markdown
 */
function htmlToMarkdown(element: Element, pattern?: SitePattern): string {
  const lines: string[] = [];

  function processNode(node: Node, depth = 0): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        lines.push(text);
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    const tagName = el.tagName.toLowerCase();

    // Skip non-content elements
    if (['script', 'style', 'nav', 'footer', 'aside'].includes(tagName)) {
      return;
    }

    switch (tagName) {
      case 'h1':
        lines.push(`\n# ${el.textContent?.trim()}\n`);
        break;
      case 'h2':
        lines.push(`\n## ${el.textContent?.trim()}\n`);
        break;
      case 'h3':
        lines.push(`\n### ${el.textContent?.trim()}\n`);
        break;
      case 'h4':
        lines.push(`\n#### ${el.textContent?.trim()}\n`);
        break;
      case 'h5':
        lines.push(`\n##### ${el.textContent?.trim()}\n`);
        break;
      case 'h6':
        lines.push(`\n###### ${el.textContent?.trim()}\n`);
        break;
      case 'p':
        lines.push(`\n${el.textContent?.trim()}\n`);
        break;
      case 'br':
        lines.push('\n');
        break;
      case 'hr':
        lines.push('\n---\n');
        break;
      case 'ul':
      case 'ol':
        lines.push('\n');
        el.querySelectorAll(':scope > li').forEach((li, i) => {
          const marker = tagName === 'ol' ? `${i + 1}.` : '-';
          lines.push(`${marker} ${li.textContent?.trim()}\n`);
        });
        lines.push('\n');
        break;
      case 'a': {
        const href = el.getAttribute('href');
        const text = el.textContent?.trim();
        if (href && text) {
          lines.push(`[${text}](${href})`);
        }
        break;
      }
      case 'img': {
        const alt = el.getAttribute('alt') || '';
        const src = el.getAttribute('src');
        if (src) {
          lines.push(`![${alt}](${src})`);
        }
        break;
      }
      case 'strong':
      case 'b':
        lines.push(`**${el.textContent?.trim()}**`);
        break;
      case 'em':
      case 'i':
        lines.push(`*${el.textContent?.trim()}*`);
        break;
      case 'code':
        lines.push(`\`${el.textContent?.trim()}\``);
        break;
      case 'pre':
        lines.push(`\n\`\`\`\n${el.textContent?.trim()}\n\`\`\`\n`);
        break;
      case 'blockquote': {
        const quoteLines = (el.textContent?.trim() || '').split('\n');
        quoteLines.forEach((line) => lines.push(`> ${line}\n`));
        break;
      }
      default:
        // Recursively process children
        for (const child of el.childNodes) {
          processNode(child, depth + 1);
        }
    }
  }

  // Use pattern content selector if available
  const contentEl = pattern?.selectors?.content
    ? element.querySelector(pattern.selectors.content) || element
    : element;

  processNode(contentEl);

  return lines
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extract JSON-LD and microdata
 */
function extractStructuredData(doc: Document): Record<string, unknown> {
  const structured: Record<string, unknown> = {};

  // Extract JSON-LD
  const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
  if (jsonLdScripts.length > 0) {
    structured.jsonLd = [];
    jsonLdScripts.forEach((script) => {
      try {
        const data = JSON.parse(script.textContent || '');
        (structured.jsonLd as unknown[]).push(data);
      } catch {
        // Invalid JSON-LD
      }
    });
  }

  // Extract Open Graph
  const ogTags: Record<string, string> = {};
  doc.querySelectorAll('meta[property^="og:"]').forEach((meta) => {
    const property = meta.getAttribute('property')?.replace('og:', '');
    const content = meta.getAttribute('content');
    if (property && content) {
      ogTags[property] = content;
    }
  });
  if (Object.keys(ogTags).length > 0) {
    structured.openGraph = ogTags;
  }

  // Extract Twitter cards
  const twitterTags: Record<string, string> = {};
  doc.querySelectorAll('meta[name^="twitter:"]').forEach((meta) => {
    const name = meta.getAttribute('name')?.replace('twitter:', '');
    const content = meta.getAttribute('content');
    if (name && content) {
      twitterTags[name] = content;
    }
  });
  if (Object.keys(twitterTags).length > 0) {
    structured.twitter = twitterTags;
  }

  return structured;
}

/**
 * Extract content using custom selectors
 */
function extractBySelectors(
  doc: Document,
  selectors: Record<string, string>
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};

  for (const [key, selector] of Object.entries(selectors)) {
    try {
      const elements = doc.querySelectorAll(selector);
      if (elements.length === 0) {
        continue;
      } else if (elements.length === 1) {
        result[key] = elements[0].textContent?.trim() || '';
      } else {
        result[key] = Array.from(elements).map((el) => el.textContent?.trim() || '');
      }
    } catch {
      // Invalid selector
    }
  }

  return result;
}

/**
 * Extract content using a site pattern
 */
function extractWithPattern(
  doc: Document,
  pattern: SitePattern
): Partial<FetchResult['content']> {
  const result: Partial<FetchResult['content']> = {};

  // Extract fields using pattern selectors
  const selectors: Record<string, string> = {};
  for (const [key, selector] of Object.entries(pattern.selectors)) {
    if (selector) {
      selectors[key] = selector;
    }
  }

  if (Object.keys(selectors).length > 0) {
    result.selectors = extractBySelectors(doc, selectors);
  }

  return result;
}

/**
 * Clean up extracted text
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}
