/**
 * PDF Form Field Types (INT-017)
 *
 * Represents fillable form fields extracted from PDF AcroForms.
 * Aligned with existing FormField interface from form-submission-learner.ts
 */

/**
 * Types of PDF form fields
 */
export type PDFFormFieldType =
  | 'text' // Text input
  | 'checkbox' // Checkbox
  | 'radio' // Radio button group
  | 'dropdown' // Dropdown/select
  | 'optionList' // Multi-select list
  | 'button' // Push button
  | 'signature' // Signature field
  | 'unknown';

/**
 * A single form field extracted from a PDF
 */
export interface PDFFormField {
  /** Field name (from PDF internal name) */
  name: string;
  /** Field type */
  type: PDFFormFieldType;
  /** Human-readable label (extracted from nearby text or tooltip) */
  label?: string;
  /** Whether the field is required (inferred from annotations or field properties) */
  required: boolean;
  /** Current value (if filled) */
  value?: string | boolean | string[];
  /** Default value */
  defaultValue?: string;
  /** Tooltip text (from field annotations) */
  tooltip?: string;
  /** For dropdowns/option lists: available choices */
  options?: string[];
  /** Maximum length for text fields */
  maxLength?: number;
  /** Whether field is read-only */
  readOnly: boolean;
  /** Page number where field appears (1-indexed) */
  pageNumber: number;
  /** Field position on page (for layout analysis) */
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Form section grouping related fields
 */
export interface PDFFormSection {
  /** Section title (inferred from headings or field grouping) */
  title?: string;
  /** Fields in this section */
  fields: PDFFormField[];
  /** Section description */
  description?: string;
  /** Order within the form */
  order: number;
}

/**
 * Document mentioned or required in the PDF
 */
export interface PDFDocumentRequirement {
  /** Document name */
  name: string;
  /** Description or details */
  description?: string;
  /** Whether required or optional */
  required: boolean;
  /** Form field name if linked to upload field */
  linkedFieldName?: string;
  /** Notes about the document */
  notes?: string;
  /** Related form number if mentioned */
  formNumber?: string;
  /** Source text where this was found */
  sourceText?: string;
}

/**
 * Form identification info
 */
export interface PDFFormInfo {
  /** Form number/code (e.g., "Modelo 790", "Cerfa 12345") */
  formNumber?: string;
  /** Form name */
  formName?: string;
  /** Issuing authority */
  authority?: string;
  /** Detected language */
  language?: string;
}

/**
 * Complete result of PDF form extraction
 */
export interface PDFFormExtractionResult {
  /** Whether extraction was successful */
  success: boolean;
  /** Number of pages in PDF */
  numPages: number;
  /** PDF metadata */
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creator?: string;
    producer?: string;
    creationDate?: Date;
    modificationDate?: Date;
  };
  /** Whether PDF has fillable form fields (AcroForm) */
  hasFormFields: boolean;
  /** All extracted form fields */
  fields: PDFFormField[];
  /** Fields grouped by inferred sections */
  sections?: PDFFormSection[];
  /** Document requirements mentioned in PDF text */
  documentRequirements: PDFDocumentRequirement[];
  /** Form identification */
  formInfo?: PDFFormInfo;
  /** Confidence score (0-1) */
  confidence: number;
  /** Extraction warnings */
  warnings: string[];
  /** Error message if failed */
  error?: string;
}

/**
 * Options for PDF form extraction
 */
export interface PDFFormExtractionOptions {
  /** Extract document requirements from text (default: true) */
  extractDocumentRequirements?: boolean;
  /** Try to group fields into sections (default: true) */
  groupIntoSections?: boolean;
  /** Try to infer labels from surrounding text (default: true) */
  inferLabels?: boolean;
  /** Include field positions (default: false) */
  includePositions?: boolean;
  /** Language hint for document parsing */
  language?: string;
}
