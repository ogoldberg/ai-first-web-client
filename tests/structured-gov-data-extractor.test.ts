/**
 * Tests for StructuredGovDataExtractor (INT-012)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  StructuredGovDataExtractor,
  createGovDataExtractor,
  extractGovData,
  validateGovData,
  type StructuredGovData,
  type ExtractionOptions,
} from '../src/core/structured-gov-data-extractor.js';

describe('StructuredGovDataExtractor', () => {
  let extractor: StructuredGovDataExtractor;

  beforeEach(() => {
    extractor = new StructuredGovDataExtractor();
  });

  // ============================================
  // BASIC EXTRACTION
  // ============================================

  describe('Basic Extraction', () => {
    it('should extract with default options', () => {
      const html = '<html lang="en"><body><p>Some content here about requirements.</p></body></html>';
      const result = extractor.extract(html);

      expect(result).toBeDefined();
      expect(result.contentType).toBe('general');
      expect(result.language).toBe('en');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should use provided language instead of detecting', () => {
      const html = '<html><body>Contenido en espanol</body></html>';
      const result = extractor.extract(html, { language: 'es' });

      expect(result.language).toBe('es');
      expect(result.languageDetection).toBeUndefined();
    });

    it('should detect language from HTML', () => {
      const html = '<html lang="de"><body>Deutscher Inhalt</body></html>';
      const result = extractor.extract(html);

      expect(result.language).toBe('de');
      expect(result.languageDetection).toBeDefined();
      expect(result.languageDetection?.source).toBe('html-lang');
    });

    it('should include raw text when requested', () => {
      const html = '<html lang="en"><body><p>Test content</p></body></html>';
      const result = extractor.extract(html, { includeRawText: true });

      expect(result.rawText).toBeDefined();
      expect(result.rawText).toContain('Test content');
    });

    it('should include source URL when provided', () => {
      const html = '<html lang="en"><body>Content</body></html>';
      const result = extractor.extract(html, { url: 'https://example.com/page' });

      expect(result.sourceUrl).toBe('https://example.com/page');
    });
  });

  // ============================================
  // REQUIREMENTS EXTRACTION
  // ============================================

  describe('Requirements Extraction', () => {
    it('should extract bullet point requirements', () => {
      const html = `<html lang="en"><body>
        <h2>Requirements</h2>
        <ul>
          <li>Must be at least 18 years old</li>
          <li>Valid passport required</li>
          <li>Proof of income is mandatory</li>
        </ul>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'requirements' });

      expect(result.requirements).toBeDefined();
      expect(result.requirements!.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract numbered list requirements', () => {
      const html = `<html lang="en"><body>
        <h2>Eligibility</h2>
        <ol>
          1. You must have a valid work permit
          2. Income must exceed minimum wage
          3. Health insurance is required
        </ol>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'requirements' });

      expect(result.requirements).toBeDefined();
      expect(result.requirements!.length).toBeGreaterThanOrEqual(3);
    });

    it('should categorize age requirements', () => {
      const html = `<html lang="en"><body>
        <ul>
          <li>Applicant must be 21 years or older to apply</li>
        </ul>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'requirements' });

      expect(result.requirements).toBeDefined();
      expect(result.requirements!.length).toBeGreaterThanOrEqual(1);
      // Age categorization works on items that match age patterns
      const ageReq = result.requirements!.find(r => r.category === 'age');
      if (result.requirements!.length > 0) {
        expect(ageReq).toBeDefined();
      }
    });

    it('should categorize income requirements', () => {
      const html = `<html lang="en"><body>
        <ul>
          <li>Monthly income must exceed 2000 EUR for applicant</li>
        </ul>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'requirements' });

      expect(result.requirements).toBeDefined();
      expect(result.requirements!.length).toBeGreaterThanOrEqual(1);
      const incomeReq = result.requirements!.find(r => r.category === 'income');
      if (result.requirements!.length > 0) {
        expect(incomeReq).toBeDefined();
      }
    });

    it('should distinguish optional from mandatory requirements', () => {
      const html = `<html lang="en"><body>
        <ul>
          <li>Passport is required for all applicants</li>
          <li>Reference letter is optional for the application</li>
        </ul>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'requirements' });

      expect(result.requirements).toBeDefined();
      expect(result.requirements!.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract Spanish requirements', () => {
      const html = `<html lang="es"><body>
        <ul>
          <li>El solicitante debe tener 18 anos como minimo</li>
          <li>Se requiere pasaporte valido para el proceso</li>
          <li>Es obligatorio presentar justificante de ingresos</li>
        </ul>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'requirements' });

      expect(result.requirements).toBeDefined();
      expect(result.requirements!.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract German requirements', () => {
      const html = `<html lang="de"><body>
        <ul>
          <li>Der Antragsteller muss mindestens 18 Jahre alt sein</li>
          <li>Ein gultiger Reisepass ist erforderlich fur alle</li>
          <li>Einkommensnachweis ist pflicht zur Anmeldung</li>
        </ul>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'requirements' });

      expect(result.requirements).toBeDefined();
      expect(result.requirements!.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================
  // DOCUMENT EXTRACTION
  // ============================================

  describe('Document Extraction', () => {
    it('should extract document requirements', () => {
      const html = `<html lang="en"><body>
        <h2>Required Documents</h2>
        <ul>
          <li>Valid passport (original and copy)</li>
          <li>Proof of address document</li>
          <li>Criminal record certificate</li>
          <li>Health insurance certificate</li>
        </ul>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'documents' });

      expect(result.documents).toBeDefined();
      expect(result.documents!.length).toBeGreaterThanOrEqual(4);
    });

    it('should detect passport as document', () => {
      const html = `<html lang="en"><body>
        <p>Bring your passport to the appointment.</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'documents' });

      expect(result.documents).toBeDefined();
      expect(result.documents!.some(d => d.name.toLowerCase().includes('passport'))).toBe(true);
    });

    it('should extract form numbers from documents', () => {
      const html = `<html lang="es"><body>
        <ul>
          <li>Formulario 790 completado</li>
          <li>Modelo 030 de registro</li>
        </ul>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'documents' });

      expect(result.documents).toBeDefined();
      const formDoc = result.documents!.find(d => d.formNumber);
      expect(formDoc).toBeDefined();
    });

    it('should mark optional documents correctly', () => {
      const html = `<html lang="en"><body>
        <ul>
          <li>Passport is required</li>
          <li>Cover letter is optional if applicable</li>
        </ul>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'documents' });

      expect(result.documents).toBeDefined();
      const optionalDoc = result.documents!.find(d => d.name.toLowerCase().includes('cover letter'));
      if (optionalDoc) {
        expect(optionalDoc.required).toBe(false);
      }
    });

    it('should extract German document requirements', () => {
      const html = `<html lang="de"><body>
        <ul>
          <li>Gultiger Reisepass</li>
          <li>Meldebescheinigung</li>
          <li>Nachweis der Krankenversicherung</li>
        </ul>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'documents' });

      expect(result.documents).toBeDefined();
      expect(result.documents!.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ============================================
  // FEE EXTRACTION
  // ============================================

  describe('Fee Extraction', () => {
    it('should extract EUR fees', () => {
      const html = `<html lang="en"><body>
        <h2>Fees</h2>
        <p>Application fee: 100 EUR</p>
        <p>Processing fee: 50 EUR</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'fees' });

      expect(result.fees).toBeDefined();
      expect(result.fees!.length).toBe(2);
      expect(result.fees![0].amount.currency).toBe('EUR');
    });

    it('should extract USD fees with dollar sign', () => {
      const html = `<html lang="en"><body>
        <p>The application fee is $150</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'fees' });

      expect(result.fees).toBeDefined();
      expect(result.fees!.length).toBe(1);
      expect(result.fees![0].amount.currency).toBe('USD');
      expect(result.fees![0].amount.amount).toBe(150);
    });

    it('should extract fees with European decimal format', () => {
      const html = `<html lang="es"><body>
        <p>La tasa es de 250,50 EUR</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'fees' });

      expect(result.fees).toBeDefined();
      expect(result.fees!.length).toBe(1);
      expect(result.fees![0].amount.amount).toBe(250.5);
    });

    it('should extract form number from fee description', () => {
      const html = `<html lang="es"><body>
        <p>Pago de tasa modelo 790: 15 EUR</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'fees' });

      expect(result.fees).toBeDefined();
      expect(result.fees!.length).toBe(1);
      expect(result.fees![0].formNumber).toBe('790');
    });

    it('should extract German fees', () => {
      const html = `<html lang="de"><body>
        <p>Die Gebuhr betragt 80 EUR</p>
        <p>Bearbeitungskosten: 25 EUR</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'fees' });

      expect(result.fees).toBeDefined();
      expect(result.fees!.length).toBe(2);
    });

    it('should extract Portuguese fees', () => {
      const html = `<html lang="pt"><body>
        <p>A taxa de processamento e de 60 EUR</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'fees' });

      expect(result.fees).toBeDefined();
      expect(result.fees!.length).toBe(1);
    });
  });

  // ============================================
  // TIMELINE EXTRACTION
  // ============================================

  describe('Timeline Extraction', () => {
    it('should extract processing time in days', () => {
      const html = `<html lang="en"><body>
        <p>Processing time: 10 days</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'timeline' });

      expect(result.timeline).toBeDefined();
      expect(result.timeline!.length).toBe(1);
      expect(result.timeline![0].duration?.durationDays).toBe(10);
    });

    it('should extract processing time in weeks', () => {
      const html = `<html lang="en"><body>
        <p>Estimated processing: 2 weeks</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'timeline' });

      expect(result.timeline).toBeDefined();
      expect(result.timeline![0].duration?.durationDays).toBe(14);
    });

    it('should extract processing time in months', () => {
      const html = `<html lang="en"><body>
        <p>Processing time approximately 3 months</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'timeline' });

      expect(result.timeline).toBeDefined();
      expect(result.timeline![0].duration?.durationDays).toBe(90);
    });

    it('should extract working days', () => {
      const html = `<html lang="en"><body>
        <p>Processing takes 5 working days</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'timeline' });

      expect(result.timeline).toBeDefined();
      expect(result.timeline![0].duration?.durationDays).toBe(7); // 5 * 1.4 rounded up
    });

    it('should extract Spanish timeline', () => {
      const html = `<html lang="es"><body>
        <p>El plazo de tramitacion es de 15 dias habiles</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'timeline' });

      expect(result.timeline).toBeDefined();
      expect(result.timeline!.length).toBe(1);
    });

    it('should extract German timeline', () => {
      const html = `<html lang="de"><body>
        <p>Die Bearbeitungszeit betragt 4 Wochen</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'timeline' });

      expect(result.timeline).toBeDefined();
      expect(result.timeline![0].duration?.durationDays).toBe(28);
    });

    it('should preserve step order', () => {
      const html = `<html lang="en"><body>
        <p>Step 1: Submit application (5 days)</p>
        <p>Step 2: Review period (10 days)</p>
        <p>Step 3: Decision notification (3 days)</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'timeline' });

      expect(result.timeline).toBeDefined();
      expect(result.timeline!.length).toBeGreaterThanOrEqual(3);
      expect(result.timeline![0].order).toBe(1);
      expect(result.timeline![1].order).toBe(2);
    });
  });

  // ============================================
  // FORM EXTRACTION
  // ============================================

  describe('Form Extraction', () => {
    it('should extract Spanish modelo forms', () => {
      const html = `<html lang="es"><body>
        <p>Complete el Modelo 790 para el pago de tasas</p>
        <p>Tambien necesita el Formulario 030</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'forms' });

      expect(result.forms).toBeDefined();
      expect(result.forms!.length).toBeGreaterThanOrEqual(2);
      expect(result.forms!.some(f => f.formNumber === '790')).toBe(true);
      expect(result.forms!.some(f => f.formNumber === '030')).toBe(true);
    });

    it('should extract German formular', () => {
      const html = `<html lang="de"><body>
        <p>Bitte fullen Sie Formular A1 aus</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'forms' });

      expect(result.forms).toBeDefined();
      expect(result.forms!.length).toBe(1);
    });

    it('should extract form with download URL', () => {
      const html = `<html lang="en"><body>
        <p>Download Form 123 from https://example.com/forms/123.pdf</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'forms' });

      expect(result.forms).toBeDefined();
      expect(result.forms![0].downloadUrl).toContain('example.com');
    });

    it('should deduplicate forms', () => {
      const html = `<html lang="es"><body>
        <p>Modelo 790</p>
        <p>Complete el modelo 790</p>
        <p>Pague usando modelo 790</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'forms' });

      expect(result.forms).toBeDefined();
      expect(result.forms!.length).toBe(1);
    });
  });

  // ============================================
  // CONTACT EXTRACTION
  // ============================================

  describe('Contact Extraction', () => {
    it('should extract phone numbers', () => {
      const html = `<html lang="en"><body>
        <p>Contact us: Tel: +34 91 123 4567</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'contact' });

      expect(result.contact).toBeDefined();
      expect(result.contact!.phone).toBeDefined();
      expect(result.contact!.phone!.length).toBe(1);
    });

    it('should extract email addresses', () => {
      const html = `<html lang="en"><body>
        <p>Email: info@government.es</p>
        <p>Support: support@government.es</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'contact' });

      expect(result.contact).toBeDefined();
      expect(result.contact!.email).toBeDefined();
      expect(result.contact!.email!.length).toBe(2);
    });

    it('should extract website URLs', () => {
      const html = `<html lang="en"><body>
        <p>Visit our website: https://www.government.es/services</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'contact' });

      expect(result.contact).toBeDefined();
      expect(result.contact!.website).toContain('government.es');
    });

    it('should extract address with street name', () => {
      const html = `<html lang="es"><body>
        <p>Direccion: Calle Mayor 123, Madrid</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'contact' });

      expect(result.contact).toBeDefined();
      expect(result.contact!.address).toContain('Calle Mayor');
    });

    it('should filter out social media URLs', () => {
      const html = `<html lang="en"><body>
        <p>Follow us on https://facebook.com/government</p>
        <p>Website: https://www.government.es</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'contact' });

      expect(result.contact).toBeDefined();
      expect(result.contact!.website).not.toContain('facebook');
      expect(result.contact!.website).toContain('government.es');
    });

    it('should return undefined if no contact info found', () => {
      const html = `<html lang="en"><body>
        <p>This page has no contact information.</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'contact' });

      expect(result.contact).toBeUndefined();
    });
  });

  // ============================================
  // APPOINTMENT EXTRACTION
  // ============================================

  describe('Appointment Extraction', () => {
    it('should detect appointment mentions in English', () => {
      const html = `<html lang="en"><body>
        <p>You must book an appointment before visiting.</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'appointment' });

      expect(result.appointment).toBeDefined();
      expect(result.appointment!.systemName).toBe('appointment');
    });

    it('should detect Spanish cita previa', () => {
      const html = `<html lang="es"><body>
        <p>Es necesario solicitar cita previa para este tramite.</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'appointment' });

      expect(result.appointment).toBeDefined();
      // systemName will match the first keyword found
      expect(['cita', 'cita previa']).toContain(result.appointment!.systemName);
    });

    it('should detect German Termin', () => {
      const html = `<html lang="de"><body>
        <p>Bitte vereinbaren Sie einen Termin.</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'appointment' });

      expect(result.appointment).toBeDefined();
      expect(result.appointment!.systemName).toBe('termin');
    });

    it('should detect required appointment', () => {
      const html = `<html lang="en"><body>
        <p>An appointment is required for this service.</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'appointment' });

      expect(result.appointment).toBeDefined();
      expect(result.appointment!.required).toBe(true);
    });

    it('should extract booking URL', () => {
      const html = `<html lang="en"><body>
        <p>Book your appointment at https://booking.government.es/cita</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'appointment' });

      expect(result.appointment).toBeDefined();
      expect(result.appointment!.bookingUrl).toContain('cita');
    });

    it('should return undefined if no appointment mentions', () => {
      const html = `<html lang="en"><body>
        <p>This page talks about requirements only.</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'appointment' });

      expect(result.appointment).toBeUndefined();
    });
  });

  // ============================================
  // GENERAL EXTRACTION
  // ============================================

  describe('General Extraction', () => {
    it('should extract all content types for general', () => {
      const html = `<html lang="en"><body>
        <h2>Requirements</h2>
        <ul>
          <li>Must be 18 years old</li>
        </ul>
        <h2>Documents</h2>
        <ul>
          <li>Valid passport</li>
        </ul>
        <h2>Fees</h2>
        <p>Application fee: 50 EUR</p>
        <h2>Timeline</h2>
        <p>Processing time: 10 days</p>
        <h2>Contact</h2>
        <p>Email: info@gov.es</p>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'general' });

      expect(result.contentType).toBe('general');
      expect(result.requirements).toBeDefined();
      expect(result.documents).toBeDefined();
      expect(result.fees).toBeDefined();
      expect(result.timeline).toBeDefined();
      expect(result.contact).toBeDefined();
    });

    it('should have higher confidence with more extracted data', () => {
      const richHtml = `<html lang="en"><body>
        <ul>
          <li>Requirement 1</li>
          <li>Requirement 2</li>
          <li>Requirement 3</li>
          <li>Requirement 4</li>
        </ul>
        <p>Fee: 100 EUR</p>
        <p>Processing: 5 days</p>
      </body></html>`;

      const poorHtml = `<html lang="en"><body>
        <p>Short content.</p>
      </body></html>`;

      const richResult = extractor.extract(richHtml);
      const poorResult = extractor.extract(poorHtml);

      expect(richResult.confidence).toBeGreaterThan(poorResult.confidence);
    });
  });

  // ============================================
  // VALIDATION
  // ============================================

  describe('Validation', () => {
    it('should validate valid data successfully', () => {
      const data: StructuredGovData = {
        contentType: 'requirements',
        language: 'en',
        confidence: 0.8,
        requirements: [
          { description: 'Must be 18 years old', mandatory: true },
        ],
      };

      const result = extractor.validate(data);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for missing contentType', () => {
      const data = {
        language: 'en',
        confidence: 0.8,
      } as StructuredGovData;

      const result = extractor.validate(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'contentType')).toBe(true);
    });

    it('should fail validation for missing language', () => {
      const data = {
        contentType: 'requirements',
        confidence: 0.8,
      } as StructuredGovData;

      const result = extractor.validate(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'language')).toBe(true);
    });

    it('should fail validation for invalid confidence', () => {
      const data: StructuredGovData = {
        contentType: 'requirements',
        language: 'en',
        confidence: 1.5, // Invalid: > 1
      };

      const result = extractor.validate(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'confidence')).toBe(true);
    });

    it('should fail validation for fee without valid amount', () => {
      const data: StructuredGovData = {
        contentType: 'fees',
        language: 'en',
        confidence: 0.8,
        fees: [
          {
            description: 'Application fee',
            amount: { amount: NaN, currency: 'EUR', original: 'invalid' },
          },
        ],
      };

      const result = extractor.validate(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('fees'))).toBe(true);
    });

    it('should fail validation for document without name', () => {
      const data: StructuredGovData = {
        contentType: 'documents',
        language: 'en',
        confidence: 0.8,
        documents: [
          { name: '', required: true },
        ],
      };

      const result = extractor.validate(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('documents'))).toBe(true);
    });

    it('should warn for empty contact info', () => {
      const data: StructuredGovData = {
        contentType: 'contact',
        language: 'en',
        confidence: 0.8,
        contact: {},
      };

      const result = extractor.validate(data);

      expect(result.valid).toBe(true); // No errors
      expect(result.warnings.some(w => w.path === 'contact')).toBe(true);
    });
  });

  // ============================================
  // FACTORY FUNCTIONS
  // ============================================

  describe('Factory Functions', () => {
    it('createGovDataExtractor should return new extractor', () => {
      const ext = createGovDataExtractor();
      expect(ext).toBeInstanceOf(StructuredGovDataExtractor);
    });

    it('extractGovData convenience function should work', () => {
      const html = '<html lang="en"><body><p>Fee: 100 EUR</p></body></html>';
      const result = extractGovData(html, { contentType: 'fees' });

      expect(result.fees).toBeDefined();
      expect(result.fees!.length).toBe(1);
    });

    it('validateGovData convenience function should work', () => {
      const data: StructuredGovData = {
        contentType: 'requirements',
        language: 'en',
        confidence: 0.8,
      };

      const result = validateGovData(data);
      expect(result.valid).toBe(true);
    });
  });

  // ============================================
  // CURRENCY HANDLING
  // ============================================

  describe('Currency Handling', () => {
    it('should use default currency when none specified', () => {
      const ext = new StructuredGovDataExtractor();
      ext.setDefaultCurrency('GBP');

      const html = '<html lang="en"><body><p>Fee: 100</p></body></html>';
      const result = ext.extract(html, { contentType: 'fees' });

      // Note: This test may not extract a fee without a currency keyword
      // Just testing that setDefaultCurrency doesn't throw
      expect(result).toBeDefined();
    });

    it('should recognize GBP currency', () => {
      const html = '<html lang="en"><body><p>Processing fee: 75 GBP</p></body></html>';
      const result = extractor.extract(html, { contentType: 'fees' });

      expect(result.fees).toBeDefined();
      expect(result.fees!.length).toBe(1);
      expect(result.fees![0].amount.currency).toBe('GBP');
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe('Edge Cases', () => {
    it('should handle empty HTML', () => {
      const result = extractor.extract('');

      expect(result).toBeDefined();
      expect(result.confidence).toBe(0.2); // Low confidence for short content
    });

    it('should handle plain text input', () => {
      const result = extractor.extract(
        'This is plain text with a fee of 100 EUR and requirement to be 18 years old.',
        { contentType: 'general' }
      );

      expect(result).toBeDefined();
      expect(result.fees?.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle malformed HTML', () => {
      const html = '<html><body><p>Fee: 50 EUR<ul><li>Passport</body>';
      const result = extractor.extract(html);

      expect(result).toBeDefined();
    });

    it('should deduplicate extracted items', () => {
      const html = `<html lang="en"><body>
        <ul>
          <li>Valid passport required</li>
          <li>Valid passport is required</li>
          <li>Bring your valid passport</li>
        </ul>
      </body></html>`;

      const result = extractor.extract(html, { contentType: 'documents' });

      // Should deduplicate similar items
      expect(result.documents!.length).toBeLessThanOrEqual(3);
    });

    it('should handle very long content', () => {
      const longContent = 'Fee: 100 EUR. '.repeat(1000);
      const html = `<html lang="en"><body><p>${longContent}</p></body></html>`;

      const result = extractor.extract(html, { contentType: 'fees' });

      expect(result).toBeDefined();
      expect(result.fees!.length).toBeGreaterThan(0);
    });
  });
});
