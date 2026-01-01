/**
 * PDF Routes (INT-017)
 *
 * Endpoints for PDF form extraction and analysis.
 * Provides AcroForm field extraction, document requirement parsing,
 * and form number detection from PDF files.
 */

import { Hono } from 'hono';
import type { PDFFormExtractionOptions } from '../../../../src/types/pdf-forms.js';

const pdf = new Hono();

/**
 * POST /v1/pdf/extract-forms
 *
 * Extract form fields and document requirements from a PDF file.
 * Accepts either a URL to fetch or base64-encoded PDF data.
 *
 * Request body:
 * - url: string (optional) - URL to fetch PDF from
 * - base64: string (optional) - Base64-encoded PDF data
 * - options: object (optional)
 *   - extractDocumentRequirements: boolean (default: true)
 *   - groupIntoSections: boolean (default: true)
 *   - inferLabels: boolean (default: true)
 *   - includePositions: boolean (default: false)
 *   - language: string (optional) - Language hint (e.g., 'es', 'de', 'fr')
 *
 * Response:
 * - success: boolean
 * - numPages: number
 * - hasFormFields: boolean
 * - fields: PDFFormField[]
 * - sections: PDFFormSection[] (optional)
 * - documentRequirements: PDFDocumentRequirement[]
 * - formInfo: { formNumber, formName, authority, language } (optional)
 * - confidence: number (0-1)
 * - warnings: string[]
 * - error: string (if failed)
 */
pdf.post('/extract-forms', async (c) => {
  const body = await c.req.json<{
    url?: string;
    base64?: string;
    options?: PDFFormExtractionOptions;
  }>();

  // Validate input
  if (!body.url && !body.base64) {
    return c.json(
      {
        success: false,
        error: 'Either url or base64 is required',
        code: 'INVALID_INPUT',
      },
      400
    );
  }

  if (body.url && body.base64) {
    return c.json(
      {
        success: false,
        error: 'Provide either url or base64, not both',
        code: 'INVALID_INPUT',
      },
      400
    );
  }

  try {
    // Dynamic import to avoid loading pdf-lib when not needed
    const { extractPDFFormFields } = await import(
      '../../../../src/core/pdf-form-extractor.js'
    );

    let buffer: Buffer;

    if (body.base64) {
      // Decode base64
      try {
        buffer = Buffer.from(body.base64, 'base64');
      } catch {
        return c.json(
          {
            success: false,
            error: 'Invalid base64 encoding',
            code: 'INVALID_BASE64',
          },
          400
        );
      }
    } else if (body.url) {
      // Fetch from URL
      try {
        const response = await fetch(body.url);
        if (!response.ok) {
          return c.json(
            {
              success: false,
              error: `Failed to fetch PDF: ${response.status} ${response.statusText}`,
              code: 'FETCH_FAILED',
            },
            400
          );
        }

        // Check content type
        const contentType = response.headers.get('content-type');
        if (contentType && !contentType.includes('application/pdf')) {
          return c.json(
            {
              success: false,
              error: `URL does not return a PDF. Content-Type: ${contentType}`,
              code: 'NOT_A_PDF',
            },
            400
          );
        }

        buffer = Buffer.from(await response.arrayBuffer());
      } catch (fetchError) {
        return c.json(
          {
            success: false,
            error: `Failed to fetch PDF: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
            code: 'FETCH_FAILED',
          },
          400
        );
      }
    } else {
      // Should never reach here due to earlier validation
      return c.json(
        {
          success: false,
          error: 'Either url or base64 is required',
          code: 'INVALID_INPUT',
        },
        400
      );
    }

    // Extract form fields
    const result = await extractPDFFormFields(buffer, body.options);

    return c.json(result);
  } catch (error) {
    console.error('PDF extraction error:', error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'PDF extraction failed',
        code: 'EXTRACTION_FAILED',
      },
      500
    );
  }
});

/**
 * GET /v1/pdf/info
 *
 * Get information about PDF extraction capabilities.
 */
pdf.get('/info', (c) => {
  return c.json({
    success: true,
    capabilities: {
      formFields: {
        supported: true,
        types: [
          'text',
          'checkbox',
          'radio',
          'dropdown',
          'optionList',
          'button',
          'signature',
        ],
        description: 'Extract fillable AcroForm fields from PDFs',
      },
      documentRequirements: {
        supported: true,
        languages: ['en', 'es', 'pt', 'de', 'fr', 'it'],
        description:
          'Parse document requirement lists from PDF text content',
      },
      formNumbers: {
        supported: true,
        patterns: [
          'Spanish: Modelo 790, Modelo 030',
          'French: Cerfa 12345',
          'US: Form I-94, Form W-9',
          'UK: Form FLR(M)',
          'German: Formular 123, Antrag 456',
        ],
        description: 'Detect international government form numbers',
      },
    },
    endpoints: {
      extractForms: {
        method: 'POST',
        path: '/v1/pdf/extract-forms',
        description: 'Extract form fields and requirements from a PDF',
      },
    },
  });
});

export { pdf };
