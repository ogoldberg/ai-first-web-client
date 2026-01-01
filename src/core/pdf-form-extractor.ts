/**
 * PDF Form Extractor (INT-017)
 *
 * Extracts fillable form fields from PDFs using pdf-lib for AcroForm access
 * and pdf-parse for text extraction. Integrates with language-aware extraction
 * for multi-language form support.
 *
 * @example
 * ```typescript
 * import { extractPDFFormFields, createPDFFormExtractor } from 'llm-browser/sdk';
 *
 * // Quick extraction from URL
 * const result = await extractPDFFormFields('https://example.gov/form.pdf');
 * console.log(`Found ${result.fields.length} form fields`);
 *
 * // With options
 * const result2 = await extractPDFFormFields(pdfBuffer, {
 *   language: 'es',
 *   extractDocumentRequirements: true,
 *   groupIntoSections: true,
 * });
 *
 * // Using extractor class for caching
 * const extractor = createPDFFormExtractor();
 * const result3 = await extractor.extract(pdfBuffer);
 * ```
 */

import type {
  PDFFormField,
  PDFFormSection,
  PDFDocumentRequirement,
  PDFFormExtractionResult,
  PDFFormExtractionOptions,
  PDFFormFieldType,
  PDFFormInfo,
} from '../types/pdf-forms.js';
import { extractPDFText, structurePDFContent } from '../utils/pdf-extractor.js';
import { detectPageLanguage } from './language-aware-extraction.js';

// ============================================
// DOCUMENT REQUIREMENT KEYWORDS BY LANGUAGE
// ============================================

const DOCUMENT_KEYWORDS: Record<string, string[]> = {
  en: [
    'document',
    'certificate',
    'proof',
    'form',
    'passport',
    'id',
    'license',
    'application',
    'required',
    'submit',
    'attach',
    'provide',
    'copy',
    'original',
    'certified',
    'notarized',
  ],
  es: [
    'documento',
    'certificado',
    'justificante',
    'formulario',
    'pasaporte',
    'dni',
    'nie',
    'permiso',
    'solicitud',
    'requerido',
    'presentar',
    'adjuntar',
    'aportar',
    'copia',
    'original',
    'compulsada',
  ],
  pt: [
    'documento',
    'certificado',
    'comprovante',
    'formulario',
    'passaporte',
    'bi',
    'cc',
    'nif',
    'licenca',
    'requerido',
    'submeter',
    'anexar',
    'fornecer',
    'copia',
    'original',
  ],
  de: [
    'dokument',
    'bescheinigung',
    'nachweis',
    'formular',
    'reisepass',
    'ausweis',
    'genehmigung',
    'antrag',
    'erforderlich',
    'einreichen',
    'beilegen',
    'vorlegen',
    'kopie',
    'original',
    'beglaubigt',
  ],
  fr: [
    'document',
    'certificat',
    'justificatif',
    'formulaire',
    'passeport',
    'carte',
    'permis',
    'demande',
    'requis',
    'soumettre',
    'joindre',
    'fournir',
    'copie',
    'original',
    'certifie',
  ],
  it: [
    'documento',
    'certificato',
    'attestato',
    'modulo',
    'passaporto',
    'carta',
    'permesso',
    'domanda',
    'richiesto',
    'presentare',
    'allegare',
    'fornire',
    'copia',
    'originale',
    'autenticato',
  ],
};

// ============================================
// FORM NUMBER PATTERNS (INTERNATIONAL)
// ============================================

const FORM_NUMBER_PATTERNS = [
  // Spanish: Modelo 790, Modelo 030, etc.
  /(?:model[oa]?|formulario?)\s*(\d+[A-Z]?)/gi,
  // French: Cerfa 12345, Cerfa n12345
  /(?:cerfa|formulaire)\s*[:\s]*n?[o]?\s*(\d+[\*]?\d*)/gi,
  // US: Form I-94, Form W-9, Form 1040
  /(?:form)\s+([A-Z]{0,2}[\s-]?\d+[A-Z]?)/gi,
  // UK: Form FLR(M), Form SET(O)
  /(?:form)\s+([A-Z]{2,4}\s*\([A-Z]\))/gi,
  // Generic: Application Form No. 123
  /(?:application\s+)?form\s+(?:no\.?\s*)?(\d+[A-Z]?)/gi,
  // German: Formular 123, Antrag 456
  /(?:formular|antrag)\s*(?:nr\.?\s*)?(\d+[A-Z]?)/gi,
];

// ============================================
// OPTIONAL INDICATOR PATTERNS
// ============================================

const OPTIONAL_PATTERNS: Record<string, RegExp[]> = {
  en: [
    /\(optional\)/i,
    /\boptional\b/i,
    /\bif\s+applicable\b/i,
    /\bwhen\s+available\b/i,
    /\bif\s+any\b/i,
    /\bmay\s+provide\b/i,
    /\brecommended\b/i,
  ],
  es: [
    /\(opcional\)/i,
    /\bopcional\b/i,
    /\bsi\s+procede\b/i,
    /\bsi\s+aplica\b/i,
    /\bcuando\s+corresponda\b/i,
    /\brecomendado\b/i,
  ],
  pt: [
    /\(opcional\)/i,
    /\bopcional\b/i,
    /\bse\s+aplicavel\b/i,
    /\bquando\s+disponivel\b/i,
    /\brecomendado\b/i,
  ],
  de: [
    /\(optional\)/i,
    /\boptional\b/i,
    /\bfalls\s+zutreffend\b/i,
    /\bwenn\s+vorhanden\b/i,
    /\bempfohlen\b/i,
  ],
  fr: [
    /\(facultatif\)/i,
    /\bfacultatif\b/i,
    /\ble\s+cas\s+echeant\b/i,
    /\bsi\s+applicable\b/i,
    /\brecommande\b/i,
  ],
  it: [
    /\(facoltativo\)/i,
    /\bfacoltativo\b/i,
    /\bse\s+applicabile\b/i,
    /\bquando\s+disponibile\b/i,
    /\braccomandato\b/i,
  ],
};

// ============================================
// PDF FORM EXTRACTOR CLASS
// ============================================

/**
 * Extracts form fields and document requirements from PDF files.
 * Uses pdf-lib for AcroForm field extraction and pdf-parse for text content.
 */
export class PDFFormExtractor {
  private cache: Map<string, PDFFormExtractionResult> = new Map();

  /**
   * Extract form fields and requirements from a PDF buffer
   */
  async extract(
    pdfBuffer: Buffer,
    options: PDFFormExtractionOptions = {}
  ): Promise<PDFFormExtractionResult> {
    const {
      extractDocumentRequirements = true,
      groupIntoSections = true,
      inferLabels = true,
      includePositions = false,
      language,
    } = options;

    const warnings: string[] = [];

    try {
      // Dynamic import pdf-lib (optional dependency)
      let PDFDocument: typeof import('pdf-lib').PDFDocument;
      try {
        const pdfLib = await import('pdf-lib');
        PDFDocument = pdfLib.PDFDocument;
      } catch {
        return {
          success: false,
          numPages: 0,
          metadata: {},
          hasFormFields: false,
          fields: [],
          documentRequirements: [],
          confidence: 0,
          warnings: ['pdf-lib package not installed. Run: npm install pdf-lib'],
          error:
            'pdf-lib package not installed. Run: npm install pdf-lib',
        };
      }

      // Load PDF with pdf-lib for form field access
      const pdfDoc = await PDFDocument.load(pdfBuffer, {
        ignoreEncryption: true, // Handle encrypted PDFs gracefully
      });

      const form = pdfDoc.getForm();
      const pdfFields = form.getFields();
      const numPages = pdfDoc.getPageCount();

      // Extract text content with pdf-parse for document requirements
      let textResult: Awaited<ReturnType<typeof extractPDFText>>;
      try {
        textResult = await extractPDFText(pdfBuffer);
      } catch (textError) {
        warnings.push(
          `Text extraction failed: ${textError instanceof Error ? textError.message : String(textError)}`
        );
        textResult = {
          text: '',
          numPages,
          info: {},
        };
      }

      // Detect language
      const detectedLanguage = language || this.detectLanguage(textResult.text);

      // Convert pdf-lib fields to our interface
      const fields: PDFFormField[] = [];
      for (let i = 0; i < pdfFields.length; i++) {
        try {
          const field = await this.convertField(
            pdfFields[i],
            inferLabels,
            includePositions,
            numPages
          );
          fields.push(field);
        } catch (fieldError) {
          warnings.push(
            `Failed to convert field ${i}: ${fieldError instanceof Error ? fieldError.message : String(fieldError)}`
          );
        }
      }

      // Extract document requirements from text
      const documentRequirements = extractDocumentRequirements
        ? this.extractDocumentRequirements(textResult.text, detectedLanguage)
        : [];

      // Group fields into sections if requested
      const sections = groupIntoSections
        ? this.groupFieldsIntoSections(fields, textResult.text)
        : undefined;

      // Extract form identification info
      const formInfo = this.extractFormInfo(
        textResult.text,
        textResult.info,
        detectedLanguage
      );

      // Calculate confidence
      const confidence = this.calculateConfidence(
        fields,
        documentRequirements,
        warnings
      );

      return {
        success: true,
        numPages,
        metadata: {
          title: textResult.info.title,
          author: textResult.info.author,
          subject: textResult.info.subject,
          keywords: textResult.info.keywords,
          creationDate: textResult.info.creationDate,
          modificationDate: textResult.info.modificationDate,
        },
        hasFormFields: fields.length > 0,
        fields,
        sections,
        documentRequirements,
        formInfo,
        confidence,
        warnings,
      };
    } catch (error) {
      return {
        success: false,
        numPages: 0,
        metadata: {},
        hasFormFields: false,
        fields: [],
        documentRequirements: [],
        confidence: 0,
        warnings,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Convert a pdf-lib field to our PDFFormField interface
   */
  private async convertField(
    field: import('pdf-lib').PDFField,
    inferLabels: boolean,
    includePositions: boolean,
    _totalPages: number
  ): Promise<PDFFormField> {
    const pdfLib = await import('pdf-lib');
    const {
      PDFTextField,
      PDFCheckBox,
      PDFRadioGroup,
      PDFDropdown,
      PDFOptionList,
      PDFButton,
      PDFSignature,
    } = pdfLib;

    const name = field.getName();
    const type = this.getFieldType(field, pdfLib);

    const result: PDFFormField = {
      name,
      type,
      required: false, // pdf-lib doesn't expose isRequired directly
      readOnly: false, // pdf-lib doesn't expose isReadOnly directly
      pageNumber: 1, // Default, accurate page requires widget analysis
    };

    // Extract type-specific properties
    if (field instanceof PDFTextField) {
      result.value = field.getText() || undefined;
      result.maxLength = field.getMaxLength();
    } else if (field instanceof PDFCheckBox) {
      result.value = field.isChecked();
    } else if (field instanceof PDFRadioGroup) {
      result.options = field.getOptions();
      result.value = field.getSelected() || undefined;
    } else if (field instanceof PDFDropdown) {
      result.options = field.getOptions();
      result.value = field.getSelected();
    } else if (field instanceof PDFOptionList) {
      result.options = field.getOptions();
      result.value = field.getSelected();
    }

    // Try to extract label from field name
    if (inferLabels && !result.label) {
      result.label = this.inferLabelFromName(name);
    }

    return result;
  }

  /**
   * Map pdf-lib field type to our enum
   */
  private getFieldType(
    field: import('pdf-lib').PDFField,
    pdfLib: typeof import('pdf-lib')
  ): PDFFormFieldType {
    const {
      PDFTextField,
      PDFCheckBox,
      PDFRadioGroup,
      PDFDropdown,
      PDFOptionList,
      PDFButton,
      PDFSignature,
    } = pdfLib;

    if (field instanceof PDFTextField) return 'text';
    if (field instanceof PDFCheckBox) return 'checkbox';
    if (field instanceof PDFRadioGroup) return 'radio';
    if (field instanceof PDFDropdown) return 'dropdown';
    if (field instanceof PDFOptionList) return 'optionList';
    if (field instanceof PDFButton) return 'button';
    if (field instanceof PDFSignature) return 'signature';
    return 'unknown';
  }

  /**
   * Infer human-readable label from field name
   */
  private inferLabelFromName(name: string): string {
    return (
      name
        // Convert underscores to spaces
        .replace(/_/g, ' ')
        // Insert space before capital letters (camelCase)
        .replace(/([A-Z])/g, ' $1')
        // Convert to lowercase
        .toLowerCase()
        // Remove extra spaces
        .replace(/\s+/g, ' ')
        // Trim
        .trim()
        // Capitalize first letter
        .replace(/^\w/, (c) => c.toUpperCase())
    );
  }

  /**
   * Detect language from text content
   */
  private detectLanguage(text: string): string {
    if (!text || text.length < 50) {
      return 'en';
    }

    // Use the language-aware detection utility
    const result = detectPageLanguage(`<html><body>${text}</body></html>`);
    return result.language;
  }

  /**
   * Check if text contains optional indicator
   */
  private isOptionalIndicator(text: string, language: string): boolean {
    const patterns = OPTIONAL_PATTERNS[language] || OPTIONAL_PATTERNS.en;
    return patterns.some((pattern) => pattern.test(text));
  }

  /**
   * Extract document requirements from PDF text
   */
  private extractDocumentRequirements(
    text: string,
    language: string
  ): PDFDocumentRequirement[] {
    const requirements: PDFDocumentRequirement[] = [];
    const { sections, lists } = structurePDFContent(text);

    // Get keywords for this language
    const docKeywords = DOCUMENT_KEYWORDS[language] || DOCUMENT_KEYWORDS.en;

    // Scan for document-related sections
    for (const section of sections) {
      const lowerHeading = section.heading.toLowerCase();
      const lowerContent = section.content.toLowerCase();

      // Check if section is about documents
      const isDocSection = docKeywords.some(
        (kw) => lowerHeading.includes(kw) || lowerContent.includes(kw)
      );

      if (isDocSection) {
        // Parse this section for individual documents
        const lines = section.content.split('\n');
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.length > 5 && trimmedLine.length < 200) {
            // Check for form numbers in the line
            let formNumber: string | undefined;
            for (const pattern of FORM_NUMBER_PATTERNS) {
              const match = trimmedLine.match(pattern);
              if (match) {
                formNumber = match[1];
                break;
              }
            }

            requirements.push({
              name: trimmedLine,
              required: !this.isOptionalIndicator(trimmedLine, language),
              sourceText: trimmedLine,
              formNumber,
            });
          }
        }
      }
    }

    // Also scan lists for document requirements
    for (const list of lists) {
      for (const item of list) {
        const lowerItem = item.toLowerCase();
        if (docKeywords.some((kw) => lowerItem.includes(kw))) {
          // Check for form numbers
          let formNumber: string | undefined;
          for (const pattern of FORM_NUMBER_PATTERNS) {
            const match = item.match(pattern);
            if (match) {
              formNumber = match[1];
              break;
            }
          }

          requirements.push({
            name: item,
            required: !this.isOptionalIndicator(item, language),
            sourceText: item,
            formNumber,
          });
        }
      }
    }

    return this.deduplicateRequirements(requirements);
  }

  /**
   * Remove duplicate document requirements
   */
  private deduplicateRequirements(
    requirements: PDFDocumentRequirement[]
  ): PDFDocumentRequirement[] {
    const seen = new Set<string>();
    return requirements.filter((req) => {
      const key = req.name.toLowerCase().trim();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Group fields into sections based on page layout or naming patterns
   */
  private groupFieldsIntoSections(
    fields: PDFFormField[],
    _text: string
  ): PDFFormSection[] {
    if (fields.length === 0) {
      return [];
    }

    const sections: PDFFormSection[] = [];
    let currentSection: PDFFormSection = {
      fields: [],
      order: 1,
    };

    // Group by field name prefixes (common pattern in forms)
    const prefixGroups = new Map<string, PDFFormField[]>();

    for (const field of fields) {
      // Extract prefix from field name (before first underscore or number)
      const prefixMatch = field.name.match(/^([a-zA-Z]+)/);
      const prefix = prefixMatch ? prefixMatch[1].toLowerCase() : 'general';

      if (!prefixGroups.has(prefix)) {
        prefixGroups.set(prefix, []);
      }
      prefixGroups.get(prefix)!.push(field);
    }

    // Convert groups to sections
    let order = 1;
    for (const [prefix, groupFields] of prefixGroups) {
      // Convert prefix to title
      const title = prefix.charAt(0).toUpperCase() + prefix.slice(1);

      sections.push({
        title,
        fields: groupFields,
        order: order++,
      });
    }

    // If only one section, don't bother with grouping
    if (sections.length === 1) {
      return [
        {
          fields,
          order: 1,
        },
      ];
    }

    return sections;
  }

  /**
   * Extract form identification info (form numbers, authority, etc.)
   */
  private extractFormInfo(
    text: string,
    pdfInfo: {
      title?: string;
      author?: string;
      subject?: string;
      keywords?: string;
    },
    language: string
  ): PDFFormInfo | undefined {
    const formInfo: PDFFormInfo = {
      language,
    };

    // Try to find form number in text
    for (const pattern of FORM_NUMBER_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        formInfo.formNumber = match[1];
        break;
      }
    }

    // Use PDF metadata
    if (pdfInfo.title) {
      // Check if title contains form number
      for (const pattern of FORM_NUMBER_PATTERNS) {
        const match = pdfInfo.title.match(pattern);
        if (match) {
          formInfo.formNumber = match[1];
          formInfo.formName = pdfInfo.title;
          break;
        }
      }
      if (!formInfo.formName) {
        formInfo.formName = pdfInfo.title;
      }
    }

    // Use author as authority
    if (pdfInfo.author) {
      formInfo.authority = pdfInfo.author;
    }

    // Return undefined if we didn't find anything useful
    if (
      !formInfo.formNumber &&
      !formInfo.formName &&
      !formInfo.authority
    ) {
      return undefined;
    }

    return formInfo;
  }

  /**
   * Calculate confidence score based on extraction results
   */
  private calculateConfidence(
    fields: PDFFormField[],
    documentRequirements: PDFDocumentRequirement[],
    warnings: string[]
  ): number {
    let confidence = 0.5; // Base confidence

    // Has form fields
    if (fields.length > 0) {
      confidence += 0.2;
    }

    // Has document requirements extracted
    if (documentRequirements.length > 0) {
      confidence += 0.15;
    }

    // Multiple form fields (more comprehensive form)
    if (fields.length >= 5) {
      confidence += 0.1;
    }

    // Deduct for warnings
    confidence -= warnings.length * 0.05;

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Clear the extraction cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// ============================================
// FACTORY AND CONVENIENCE FUNCTIONS
// ============================================

/**
 * Create a new PDF form extractor instance
 */
export function createPDFFormExtractor(): PDFFormExtractor {
  return new PDFFormExtractor();
}

/**
 * Extract form fields from a PDF source (URL, file path, or buffer)
 */
export async function extractPDFFormFields(
  source: string | Buffer,
  options?: PDFFormExtractionOptions
): Promise<PDFFormExtractionResult> {
  const extractor = new PDFFormExtractor();

  if (Buffer.isBuffer(source)) {
    return extractor.extract(source, options);
  }

  // Fetch from URL or read from file
  if (source.startsWith('http://') || source.startsWith('https://')) {
    try {
      const response = await fetch(source);
      if (!response.ok) {
        return {
          success: false,
          numPages: 0,
          metadata: {},
          hasFormFields: false,
          fields: [],
          documentRequirements: [],
          confidence: 0,
          warnings: [],
          error: `Failed to fetch PDF: ${response.status} ${response.statusText}`,
        };
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      return extractor.extract(buffer, options);
    } catch (error) {
      return {
        success: false,
        numPages: 0,
        metadata: {},
        hasFormFields: false,
        fields: [],
        documentRequirements: [],
        confidence: 0,
        warnings: [],
        error: `Failed to fetch PDF: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  } else {
    // File path
    try {
      const fs = await import('fs/promises');
      const buffer = await fs.readFile(source);
      return extractor.extract(buffer, options);
    } catch (error) {
      return {
        success: false,
        numPages: 0,
        metadata: {},
        hasFormFields: false,
        fields: [],
        documentRequirements: [],
        confidence: 0,
        warnings: [],
        error: `Failed to read PDF file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
