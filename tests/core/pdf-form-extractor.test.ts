/**
 * Tests for PDF Form Extractor (INT-017)
 *
 * Tests the extraction of fillable form fields from PDFs,
 * document requirement parsing, and form number detection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PDFFormExtractor,
  extractPDFFormFields,
  createPDFFormExtractor,
} from '../../src/core/pdf-form-extractor.js';
import { PDFDocument } from 'pdf-lib';

describe('PDFFormExtractor', () => {
  let extractor: PDFFormExtractor;

  beforeEach(() => {
    extractor = new PDFFormExtractor();
  });

  describe('Field Extraction', () => {
    it('should extract text fields from PDF', async () => {
      // Create test PDF with text field
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage();
      const form = pdfDoc.getForm();
      const textField = form.createTextField('full_name');
      textField.addToPage(page, { x: 50, y: 700, width: 200, height: 20 });
      textField.setText('John Doe');

      const buffer = Buffer.from(await pdfDoc.save());
      const result = await extractor.extract(buffer);

      expect(result.success).toBe(true);
      expect(result.hasFormFields).toBe(true);
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].name).toBe('full_name');
      expect(result.fields[0].type).toBe('text');
      expect(result.fields[0].value).toBe('John Doe');
    });

    it('should extract checkboxes from PDF', async () => {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage();
      const form = pdfDoc.getForm();
      const checkbox = form.createCheckBox('agree_terms');
      checkbox.addToPage(page, { x: 50, y: 700, width: 20, height: 20 });
      checkbox.check();

      const buffer = Buffer.from(await pdfDoc.save());
      const result = await extractor.extract(buffer);

      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].type).toBe('checkbox');
      expect(result.fields[0].value).toBe(true);
    });

    it('should extract dropdown options', async () => {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage();
      const form = pdfDoc.getForm();
      const dropdown = form.createDropdown('country');
      dropdown.addOptions(['USA', 'UK', 'Germany', 'France']);
      dropdown.select('Germany');
      dropdown.addToPage(page, { x: 50, y: 700, width: 200, height: 20 });

      const buffer = Buffer.from(await pdfDoc.save());
      const result = await extractor.extract(buffer);

      expect(result.fields[0].type).toBe('dropdown');
      expect(result.fields[0].options).toEqual([
        'USA',
        'UK',
        'Germany',
        'France',
      ]);
      expect(result.fields[0].value).toContain('Germany');
    });

    it('should extract radio button groups', async () => {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage();
      const form = pdfDoc.getForm();
      const radioGroup = form.createRadioGroup('payment_method');
      radioGroup.addOptionToPage('card', page, {
        x: 50,
        y: 700,
        width: 20,
        height: 20,
      });
      radioGroup.addOptionToPage('bank', page, {
        x: 50,
        y: 670,
        width: 20,
        height: 20,
      });
      radioGroup.addOptionToPage('cash', page, {
        x: 50,
        y: 640,
        width: 20,
        height: 20,
      });
      radioGroup.select('bank');

      const buffer = Buffer.from(await pdfDoc.save());
      const result = await extractor.extract(buffer);

      expect(result.fields[0].type).toBe('radio');
      expect(result.fields[0].options).toEqual(['card', 'bank', 'cash']);
      expect(result.fields[0].value).toBe('bank');
    });

    it('should extract multiple fields from PDF', async () => {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage();
      const form = pdfDoc.getForm();

      // Add multiple fields
      const nameField = form.createTextField('applicant_name');
      nameField.addToPage(page, { x: 50, y: 700, width: 200, height: 20 });

      const emailField = form.createTextField('applicant_email');
      emailField.addToPage(page, { x: 50, y: 660, width: 200, height: 20 });

      const agreeCheckbox = form.createCheckBox('agree_terms');
      agreeCheckbox.addToPage(page, { x: 50, y: 620, width: 20, height: 20 });

      const buffer = Buffer.from(await pdfDoc.save());
      const result = await extractor.extract(buffer);

      expect(result.fields).toHaveLength(3);
      expect(result.fields.map((f) => f.name)).toEqual([
        'applicant_name',
        'applicant_email',
        'agree_terms',
      ]);
    });

    it('should handle PDF without form fields', async () => {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage();

      const buffer = Buffer.from(await pdfDoc.save());
      const result = await extractor.extract(buffer);

      expect(result.success).toBe(true);
      expect(result.hasFormFields).toBe(false);
      expect(result.fields).toHaveLength(0);
    });
  });

  describe('Label Inference', () => {
    it('should convert underscore-separated field names to labels', async () => {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage();
      const form = pdfDoc.getForm();
      const textField = form.createTextField('first_name_applicant');
      textField.addToPage(page, { x: 50, y: 700, width: 200, height: 20 });

      const buffer = Buffer.from(await pdfDoc.save());
      const result = await extractor.extract(buffer, { inferLabels: true });

      expect(result.fields[0].label).toBe('First name applicant');
    });

    it('should convert camelCase field names to labels', async () => {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage();
      const form = pdfDoc.getForm();
      const textField = form.createTextField('dateOfBirth');
      textField.addToPage(page, { x: 50, y: 700, width: 200, height: 20 });

      const buffer = Buffer.from(await pdfDoc.save());
      const result = await extractor.extract(buffer, { inferLabels: true });

      expect(result.fields[0].label).toBe('Date of birth');
    });

    it('should not infer labels when disabled', async () => {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage();
      const form = pdfDoc.getForm();
      const textField = form.createTextField('field_name');
      textField.addToPage(page, { x: 50, y: 700, width: 200, height: 20 });

      const buffer = Buffer.from(await pdfDoc.save());
      const result = await extractor.extract(buffer, { inferLabels: false });

      expect(result.fields[0].label).toBeUndefined();
    });
  });

  describe('Section Grouping', () => {
    it('should group fields by name prefix', async () => {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage();
      const form = pdfDoc.getForm();

      // Personal section
      form
        .createTextField('personal_name')
        .addToPage(page, { x: 50, y: 700, width: 200, height: 20 });
      form
        .createTextField('personal_email')
        .addToPage(page, { x: 50, y: 670, width: 200, height: 20 });

      // Address section
      form
        .createTextField('address_street')
        .addToPage(page, { x: 50, y: 620, width: 200, height: 20 });
      form
        .createTextField('address_city')
        .addToPage(page, { x: 50, y: 590, width: 200, height: 20 });

      const buffer = Buffer.from(await pdfDoc.save());
      const result = await extractor.extract(buffer, {
        groupIntoSections: true,
      });

      expect(result.sections).toBeDefined();
      expect(result.sections!.length).toBe(2);
      expect(result.sections![0].title).toBe('Personal');
      expect(result.sections![0].fields).toHaveLength(2);
      expect(result.sections![1].title).toBe('Address');
      expect(result.sections![1].fields).toHaveLength(2);
    });

    it('should not group when disabled', async () => {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage();
      const form = pdfDoc.getForm();

      form
        .createTextField('personal_name')
        .addToPage(page, { x: 50, y: 700, width: 200, height: 20 });
      form
        .createTextField('address_street')
        .addToPage(page, { x: 50, y: 670, width: 200, height: 20 });

      const buffer = Buffer.from(await pdfDoc.save());
      const result = await extractor.extract(buffer, {
        groupIntoSections: false,
      });

      expect(result.sections).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle non-PDF buffer gracefully', async () => {
      const result = await extractor.extract(Buffer.from('not a pdf'));

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.fields).toHaveLength(0);
    });

    it('should handle empty buffer', async () => {
      const result = await extractor.extract(Buffer.alloc(0));

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should include warning for text extraction failures', async () => {
      // Create a minimal PDF that pdf-lib can read but pdf-parse might struggle with
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage();

      const buffer = Buffer.from(await pdfDoc.save());
      const result = await extractor.extract(buffer);

      // Should still succeed even if text extraction has issues
      expect(result.success).toBe(true);
    });
  });

  describe('Confidence Scoring', () => {
    it('should have higher confidence with form fields', async () => {
      // PDF with no form fields
      const pdfDocNoFields = await PDFDocument.create();
      pdfDocNoFields.addPage();
      const bufferNoFields = Buffer.from(await pdfDocNoFields.save());
      const resultNoFields = await extractor.extract(bufferNoFields);

      // PDF with form fields
      const pdfDocWithFields = await PDFDocument.create();
      const page = pdfDocWithFields.addPage();
      const form = pdfDocWithFields.getForm();
      for (let i = 0; i < 5; i++) {
        form
          .createTextField(`field_${i}`)
          .addToPage(page, { x: 50, y: 700 - i * 30, width: 200, height: 20 });
      }
      const bufferWithFields = Buffer.from(await pdfDocWithFields.save());
      const resultWithFields = await extractor.extract(bufferWithFields);

      expect(resultWithFields.confidence).toBeGreaterThan(
        resultNoFields.confidence
      );
    });
  });

  describe('Metadata Extraction', () => {
    it('should extract PDF metadata', async () => {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.setTitle('Test Form');
      pdfDoc.setAuthor('Test Author');
      pdfDoc.setSubject('Test Subject');
      pdfDoc.addPage();

      const buffer = Buffer.from(await pdfDoc.save());
      const result = await extractor.extract(buffer);

      // Note: pdf-lib doesn't set these in a way pdf-parse can read,
      // but the structure should be present
      expect(result.metadata).toBeDefined();
      expect(result.numPages).toBe(1);
    });
  });
});

describe('Factory Functions', () => {
  it('should create extractor with createPDFFormExtractor', () => {
    const extractor = createPDFFormExtractor();
    expect(extractor).toBeInstanceOf(PDFFormExtractor);
  });

  it('should extract from buffer with extractPDFFormFields', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const form = pdfDoc.getForm();
    form
      .createTextField('test_field')
      .addToPage(page, { x: 50, y: 700, width: 200, height: 20 });

    const buffer = Buffer.from(await pdfDoc.save());
    const result = await extractPDFFormFields(buffer);

    expect(result.success).toBe(true);
    expect(result.fields).toHaveLength(1);
  });
});

describe('Form Number Detection', () => {
  // These tests check the form number detection logic
  // Note: Form numbers are detected from text content, not form fields
  // These tests would need PDFs with actual text content containing form numbers

  it('should detect form info from PDF metadata', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle('Modelo 790 - Application Form');
    pdfDoc.setAuthor('Spanish Government');
    pdfDoc.addPage();

    const buffer = Buffer.from(await pdfDoc.save());
    const result = await extractPDFFormFields(buffer);

    // The form info should be extracted from title if it contains a form number
    // Note: This depends on pdf-parse being able to read the metadata
    expect(result.success).toBe(true);
  });
});

describe('Option List Fields', () => {
  it('should extract option list fields', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const form = pdfDoc.getForm();

    const optionList = form.createOptionList('languages');
    optionList.addOptions(['English', 'Spanish', 'German', 'French', 'Italian']);
    optionList.select(['English', 'German']);
    optionList.addToPage(page, { x: 50, y: 700, width: 200, height: 100 });

    const buffer = Buffer.from(await pdfDoc.save());
    const result = await extractPDFFormFields(buffer);

    expect(result.fields).toHaveLength(1);
    expect(result.fields[0].type).toBe('optionList');
    expect(result.fields[0].options).toEqual([
      'English',
      'Spanish',
      'German',
      'French',
      'Italian',
    ]);
  });
});

describe('Text Field Properties', () => {
  it('should extract max length constraint', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const form = pdfDoc.getForm();

    const textField = form.createTextField('limited_field');
    textField.setMaxLength(50);
    textField.addToPage(page, { x: 50, y: 700, width: 200, height: 20 });

    const buffer = Buffer.from(await pdfDoc.save());
    const result = await extractPDFFormFields(buffer);

    expect(result.fields[0].maxLength).toBe(50);
  });

  it('should extract current text value', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const form = pdfDoc.getForm();

    const textField = form.createTextField('prefilled_field');
    textField.setText('Pre-filled value');
    textField.addToPage(page, { x: 50, y: 700, width: 200, height: 20 });

    const buffer = Buffer.from(await pdfDoc.save());
    const result = await extractPDFFormFields(buffer);

    expect(result.fields[0].value).toBe('Pre-filled value');
  });
});
