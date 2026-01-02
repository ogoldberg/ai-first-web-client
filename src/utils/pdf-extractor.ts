/**
 * PDF Extractor - Extract text and structured data from PDF files
 *
 * Useful for:
 * - Processing government PDF documents
 * - Extracting text from official forms and regulations
 * - Handling downloadable visa requirement documents
 */

// Note: Requires pdf-parse package: npm install pdf-parse
// Also requires @types/pdf-parse for TypeScript

export interface PDFExtractResult {
  text: string;
  numPages: number;
  info: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creationDate?: Date;
    modificationDate?: Date;
  };
  metadata?: Record<string, unknown>;
}

export interface PDFPageContent {
  pageNumber: number;
  text: string;
}

/**
 * Extract text content from a PDF buffer
 */
export async function extractPDFText(pdfBuffer: Buffer): Promise<PDFExtractResult> {
  // Dynamic import to handle optional dependency
  // pdf-parse v2 uses a class-based API with PDFParse class
  let PDFParse: unknown;

  try {
    const module = await import('pdf-parse');
    PDFParse = module.PDFParse;
  } catch {
    throw new Error(
      'pdf-parse package not installed. Run: npm install pdf-parse'
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parser = new (PDFParse as any)({ data: new Uint8Array(pdfBuffer) });

  try {
    const [textResult, infoResult] = await Promise.all([
      parser.getText() as Promise<{ text: string }>,
      parser.getInfo() as Promise<{
        info?: {
          Title?: string;
          Author?: string;
          Subject?: string;
          Keywords?: string;
          CreationDate?: string;
          ModDate?: string;
        };
        numPages: number;
        metadata?: Record<string, unknown>;
      }>,
    ]);

    return {
      text: textResult.text,
      numPages: infoResult.numPages,
      info: {
        title: infoResult.info?.Title,
        author: infoResult.info?.Author,
        subject: infoResult.info?.Subject,
        keywords: infoResult.info?.Keywords,
        creationDate: infoResult.info?.CreationDate ? new Date(infoResult.info.CreationDate) : undefined,
        modificationDate: infoResult.info?.ModDate ? new Date(infoResult.info.ModDate) : undefined,
      },
      metadata: infoResult.metadata,
    };
  } finally {
    await parser.destroy();
  }
}

/**
 * Extract text from a PDF URL
 */
export async function extractPDFFromURL(url: string): Promise<PDFExtractResult> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/pdf')) {
    throw new Error(`URL does not return a PDF. Content-Type: ${contentType}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return extractPDFText(buffer);
}

/**
 * Extract text from a PDF file path
 */
export async function extractPDFFromFile(filePath: string): Promise<PDFExtractResult> {
  const fs = await import('fs/promises');
  const buffer = await fs.readFile(filePath);
  return extractPDFText(buffer);
}

/**
 * Extract structured sections from PDF text
 * Attempts to identify headers, paragraphs, and lists
 */
export function structurePDFContent(text: string): {
  sections: { heading: string; content: string }[];
  lists: string[][];
} {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const sections: { heading: string; content: string }[] = [];
  const lists: string[][] = [];

  let currentHeading = '';
  let currentContent: string[] = [];
  let currentList: string[] = [];
  let inList = false;

  for (const line of lines) {
    // Detect headings (all caps, short lines, or lines ending with colon)
    const isHeading =
      (line === line.toUpperCase() && line.length < 100 && line.length > 3) ||
      (line.endsWith(':') && line.length < 80);

    // Detect list items
    const isListItem =
      /^[\-\*\u2022\u2023\u25E6]\s/.test(line) ||
      /^\d+[\.\)]\s/.test(line) ||
      /^[a-z][\.\)]\s/i.test(line);

    if (isHeading) {
      // Save previous section
      if (currentHeading || currentContent.length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentContent.join('\n'),
        });
      }

      // Save previous list
      if (currentList.length > 0) {
        lists.push(currentList);
        currentList = [];
        inList = false;
      }

      currentHeading = line.replace(/:$/, '');
      currentContent = [];
    } else if (isListItem) {
      // Start or continue list
      if (!inList && currentList.length === 0) {
        inList = true;
      }
      // Clean up list item marker
      const cleanItem = line.replace(/^[\-\*\u2022\u2023\u25E6\d+a-z][\.\)]*\s*/i, '');
      currentList.push(cleanItem);
    } else {
      // Regular content
      if (inList && currentList.length > 0) {
        // End of list
        lists.push(currentList);
        currentList = [];
        inList = false;
      }
      currentContent.push(line);
    }
  }

  // Save final section
  if (currentHeading || currentContent.length > 0) {
    sections.push({
      heading: currentHeading,
      content: currentContent.join('\n'),
    });
  }

  // Save final list
  if (currentList.length > 0) {
    lists.push(currentList);
  }

  return { sections, lists };
}

/**
 * Extract key-value pairs from PDF (common in forms)
 */
export function extractKeyValuePairs(text: string): Map<string, string> {
  const pairs = new Map<string, string>();

  // Pattern: "Key: Value" or "Key - Value" or "Key  Value" (multiple spaces)
  const patterns = [
    /^([^:]+):\s*(.+)$/gm,
    /^([^-]+)\s+-\s+(.+)$/gm,
    /^(\S+(?:\s+\S+)*?)\s{2,}(.+)$/gm,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const key = match[1].trim();
      const value = match[2].trim();

      // Skip if key is too long (probably not a real key)
      if (key.length < 50 && value.length > 0) {
        pairs.set(key, value);
      }
    }
  }

  return pairs;
}

/**
 * Check if a URL points to a PDF
 */
export function isPDFUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.pathname.toLowerCase().endsWith('.pdf') ||
      parsed.searchParams.get('format')?.toLowerCase() === 'pdf'
    );
  } catch {
    return false;
  }
}

// Re-export PDF form extraction types and functions (INT-017)
export type {
  PDFFormField,
  PDFFormSection,
  PDFDocumentRequirement,
  PDFFormExtractionResult,
  PDFFormExtractionOptions,
  PDFFormFieldType,
  PDFFormInfo,
} from '../types/pdf-forms.js';

/**
 * PDF extractor class for stateful operations
 */
export class PDFExtractor {
  private cache: Map<string, PDFExtractResult> = new Map();

  /**
   * Extract with caching
   */
  async extract(source: string | Buffer): Promise<PDFExtractResult> {
    if (Buffer.isBuffer(source)) {
      return extractPDFText(source);
    }

    // Check cache for URLs
    if (this.cache.has(source)) {
      return this.cache.get(source)!;
    }

    let result: PDFExtractResult;

    if (source.startsWith('http://') || source.startsWith('https://')) {
      result = await extractPDFFromURL(source);
    } else {
      result = await extractPDFFromFile(source);
    }

    this.cache.set(source, result);
    return result;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get structured content
   */
  async extractStructured(source: string | Buffer): Promise<{
    result: PDFExtractResult;
    sections: { heading: string; content: string }[];
    lists: string[][];
    keyValues: Map<string, string>;
  }> {
    const result = await this.extract(source);
    const { sections, lists } = structurePDFContent(result.text);
    const keyValues = extractKeyValuePairs(result.text);

    return {
      result,
      sections,
      lists,
      keyValues,
    };
  }

  /**
   * Extract form fields from PDF (INT-017)
   *
   * Extracts fillable form fields (AcroForms) from PDFs using pdf-lib.
   * Also extracts document requirements from text content.
   *
   * @example
   * ```typescript
   * const extractor = new PDFExtractor();
   * const result = await extractor.extractFormFields('https://example.gov/form.pdf', {
   *   language: 'es',
   *   extractDocumentRequirements: true,
   * });
   * console.log(`Found ${result.fields.length} form fields`);
   * ```
   */
  async extractFormFields(
    source: string | Buffer,
    options?: import('../types/pdf-forms.js').PDFFormExtractionOptions
  ): Promise<import('../types/pdf-forms.js').PDFFormExtractionResult> {
    // Dynamic import to make pdf-lib optional
    const { extractPDFFormFields } = await import(
      '../core/pdf-form-extractor.js'
    );

    if (Buffer.isBuffer(source)) {
      return extractPDFFormFields(source, options);
    }

    // Get the buffer first
    const buffer = await this.getBuffer(source);
    return extractPDFFormFields(buffer, options);
  }

  /**
   * Get buffer from source (URL or file path)
   */
  private async getBuffer(source: string): Promise<Buffer> {
    if (source.startsWith('http://') || source.startsWith('https://')) {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch PDF: ${response.status} ${response.statusText}`
        );
      }
      return Buffer.from(await response.arrayBuffer());
    } else {
      const fs = await import('fs/promises');
      return fs.readFile(source);
    }
  }
}

// Default instance
export const pdfExtractor = new PDFExtractor();
