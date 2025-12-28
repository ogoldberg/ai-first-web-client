/**
 * Language-Aware Extraction Tests (INT-011)
 *
 * Tests for language detection and multi-language field mapping.
 */

import { describe, it, expect } from 'vitest';
import {
  detectPageLanguage,
  extractLanguageCode,
  getFieldVariants,
  getAllFieldVariants,
  translateFieldName,
  detectFieldCategory,
  createLanguageAwareMapping,
  extractFieldByCategory,
  extractContentLanguageAware,
  FIELD_TRANSLATIONS,
  type LanguageDetectionResult,
  type FieldCategory,
} from '../src/core/language-aware-extraction.js';

describe('Language Detection', () => {
  describe('detectPageLanguage', () => {
    it('should detect language from html lang attribute', () => {
      const html = '<html lang="es-ES"><body>Contenido en espanol</body></html>';
      const result = detectPageLanguage(html);
      expect(result.language).toBe('es');
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.source).toBe('html-lang');
      expect(result.locale).toBe('es-ES');
    });

    it('should detect language from html lang without region', () => {
      const html = '<html lang="de"><body>Inhalt auf Deutsch</body></html>';
      const result = detectPageLanguage(html);
      expect(result.language).toBe('de');
      expect(result.source).toBe('html-lang');
    });

    it('should detect language from meta content-language', () => {
      const html = '<html><head><meta http-equiv="content-language" content="fr-FR"></head></html>';
      const result = detectPageLanguage(html);
      expect(result.language).toBe('fr');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      expect(result.source).toBe('meta-content-language');
    });

    it('should detect language from meta content-language (reversed attributes)', () => {
      const html = '<html><head><meta content="pt-BR" http-equiv="content-language"></head></html>';
      const result = detectPageLanguage(html);
      expect(result.language).toBe('pt');
      expect(result.source).toBe('meta-content-language');
    });

    it('should detect language from og:locale', () => {
      const html = '<html><head><meta property="og:locale" content="it_IT"></head></html>';
      const result = detectPageLanguage(html);
      expect(result.language).toBe('it');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      expect(result.source).toBe('og-locale');
    });

    it('should detect language from og:locale (reversed attributes)', () => {
      const html = '<html><head><meta content="nl_NL" property="og:locale"></head></html>';
      const result = detectPageLanguage(html);
      expect(result.language).toBe('nl');
      expect(result.source).toBe('og-locale');
    });

    it('should detect language from URL subdomain', () => {
      const html = '<html><body>Content</body></html>';
      const result = detectPageLanguage(html, 'https://es.wikipedia.org/wiki/Pagina');
      expect(result.language).toBe('es');
      expect(result.source).toBe('url-pattern');
    });

    it('should detect language from URL path', () => {
      const html = '<html><body>Content</body></html>';
      const result = detectPageLanguage(html, 'https://example.com/fr/page');
      expect(result.language).toBe('fr');
      expect(result.source).toBe('url-pattern');
    });

    it('should detect language from URL query parameter', () => {
      const html = '<html><body>Content</body></html>';
      const result = detectPageLanguage(html, 'https://example.com/page?lang=de');
      expect(result.language).toBe('de');
      expect(result.source).toBe('url-pattern');
    });

    it('should detect language from hl query parameter', () => {
      const html = '<html><body>Content</body></html>';
      const result = detectPageLanguage(html, 'https://google.com/search?hl=ja');
      expect(result.language).toBe('ja');
      expect(result.source).toBe('url-pattern');
    });

    it('should detect Spanish from content analysis', () => {
      const html = `
        <html><body>
          Los requisitos para la solicitud son los siguientes:
          documentos necesarios, fecha limite, y formulario de aplicacion.
          Puede obtener informacion sobre el tramite en nuestra oficina.
        </body></html>
      `;
      const result = detectPageLanguage(html);
      expect(result.language).toBe('es');
      expect(result.source).toBe('content-analysis');
    });

    it('should detect German from content analysis', () => {
      const html = `
        <html><body>
          Die Anforderungen fur den Antrag sind die folgenden:
          Dokumente, Frist und Formular. Sie werden bei uns informiert.
          Das Dokument ist fur alle Antragsteller erforderlich.
        </body></html>
      `;
      const result = detectPageLanguage(html);
      expect(result.language).toBe('de');
      expect(result.source).toBe('content-analysis');
    });

    it('should detect French from content analysis', () => {
      const html = `
        <html><body>
          Les exigences pour la demande sont les suivantes:
          documents, delai et formulaire. Vous serez informe.
          Le document est necessaire pour tous les demandeurs.
        </body></html>
      `;
      const result = detectPageLanguage(html);
      expect(result.language).toBe('fr');
      expect(result.source).toBe('content-analysis');
    });

    it('should return English as fallback with low confidence', () => {
      const html = '<html><body>123 456 789</body></html>';
      const result = detectPageLanguage(html);
      expect(result.language).toBe('en');
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.source).toBe('unknown');
    });

    it('should prioritize html lang over content analysis', () => {
      const html = `
        <html lang="en">
          <body>
            Los requisitos para la solicitud son los siguientes.
            Este documento esta en espanol pero el atributo dice ingles.
          </body>
        </html>
      `;
      const result = detectPageLanguage(html);
      expect(result.language).toBe('en');
      expect(result.source).toBe('html-lang');
    });
  });

  describe('extractLanguageCode', () => {
    it('should extract from simple code', () => {
      expect(extractLanguageCode('en')).toBe('en');
      expect(extractLanguageCode('es')).toBe('es');
    });

    it('should extract from locale with hyphen', () => {
      expect(extractLanguageCode('en-US')).toBe('en');
      expect(extractLanguageCode('es-ES')).toBe('es');
      expect(extractLanguageCode('pt-BR')).toBe('pt');
    });

    it('should extract from locale with underscore', () => {
      expect(extractLanguageCode('en_US')).toBe('en');
      expect(extractLanguageCode('fr_FR')).toBe('fr');
    });

    it('should convert 3-letter ISO codes', () => {
      expect(extractLanguageCode('eng')).toBe('en');
      expect(extractLanguageCode('spa')).toBe('es');
      expect(extractLanguageCode('deu')).toBe('de');
      expect(extractLanguageCode('fra')).toBe('fr');
      expect(extractLanguageCode('por')).toBe('pt');
    });

    it('should handle case insensitively', () => {
      expect(extractLanguageCode('EN-US')).toBe('en');
      expect(extractLanguageCode('ES-ES')).toBe('es');
    });
  });
});

describe('Field Mapping', () => {
  describe('getFieldVariants', () => {
    it('should return Spanish variants for requirements', () => {
      const variants = getFieldVariants('requirements', 'es');
      expect(variants).toContain('requisitos');
      expect(variants).toContain('requerimientos');
      // Should also include English fallback
      expect(variants).toContain('requirements');
    });

    it('should return German variants for fees', () => {
      const variants = getFieldVariants('fees', 'de');
      expect(variants).toContain('gebuhren');
      expect(variants).toContain('kosten');
      expect(variants).toContain('fees'); // English fallback
    });

    it('should return only English for English language', () => {
      const variants = getFieldVariants('documents', 'en');
      expect(variants).toContain('documents');
      expect(variants).not.toContain('documentos');
    });

    it('should return empty array for unknown category', () => {
      const variants = getFieldVariants('unknown_category' as FieldCategory, 'es');
      expect(variants).toEqual([]);
    });

    it('should return English fallback for unknown language', () => {
      const variants = getFieldVariants('title', 'xx');
      // Should still include English as fallback
      expect(variants).toContain('title');
    });
  });

  describe('getAllFieldVariants', () => {
    it('should return variants in all languages', () => {
      const variants = getAllFieldVariants('requirements');
      expect(variants).toContain('requirements'); // English
      expect(variants).toContain('requisitos'); // Spanish/Portuguese
      expect(variants).toContain('anforderungen'); // German
      expect(variants).toContain('exigences'); // French
    });

    it('should return unique values', () => {
      const variants = getAllFieldVariants('title');
      const uniqueVariants = [...new Set(variants)];
      expect(variants.length).toBe(uniqueVariants.length);
    });
  });

  describe('translateFieldName', () => {
    it('should translate from English to Spanish', () => {
      expect(translateFieldName('requirements', 'en', 'es')).toBe('requisitos');
      expect(translateFieldName('documents', 'en', 'es')).toBe('documentos');
      expect(translateFieldName('fees', 'en', 'es')).toBe('tasas');
    });

    it('should translate from Spanish to English', () => {
      expect(translateFieldName('requisitos', 'es', 'en')).toBe('requirements');
      expect(translateFieldName('documentos', 'es', 'en')).toBe('documents');
    });

    it('should translate from German to French', () => {
      expect(translateFieldName('anforderungen', 'de', 'fr')).toBe('exigences');
      expect(translateFieldName('dokumente', 'de', 'fr')).toBe('documents');
    });

    it('should return original if no translation found', () => {
      expect(translateFieldName('unknown_field', 'en', 'es')).toBe('unknown_field');
    });

    it('should handle auto-detection of source language', () => {
      expect(translateFieldName('requisitos', 'auto', 'en')).toBe('requirements');
      expect(translateFieldName('anforderungen', 'auto', 'en')).toBe('requirements');
    });

    it('should handle case insensitively', () => {
      expect(translateFieldName('REQUIREMENTS', 'en', 'es')).toBe('requisitos');
      expect(translateFieldName('Requisitos', 'es', 'en')).toBe('requirements');
    });
  });

  describe('detectFieldCategory', () => {
    it('should detect category for English fields', () => {
      expect(detectFieldCategory('requirements')).toBe('requirements');
      expect(detectFieldCategory('documents')).toBe('documents');
      expect(detectFieldCategory('fees')).toBe('fees');
      expect(detectFieldCategory('timeline')).toBe('timeline');
    });

    it('should detect category for Spanish fields', () => {
      expect(detectFieldCategory('requisitos')).toBe('requirements');
      expect(detectFieldCategory('documentos')).toBe('documents');
      expect(detectFieldCategory('tasas')).toBe('fees');
      expect(detectFieldCategory('plazo')).toBe('timeline');
    });

    it('should detect category for German fields', () => {
      expect(detectFieldCategory('anforderungen')).toBe('requirements');
      expect(detectFieldCategory('dokumente')).toBe('documents');
      expect(detectFieldCategory('gebuhren')).toBe('fees');
    });

    it('should return undefined for unknown fields', () => {
      expect(detectFieldCategory('xyz_unknown')).toBeUndefined();
    });

    it('should handle case insensitively', () => {
      expect(detectFieldCategory('REQUIREMENTS')).toBe('requirements');
      expect(detectFieldCategory('Requisitos')).toBe('requirements');
    });
  });

  describe('createLanguageAwareMapping', () => {
    it('should return unchanged mapping for English', () => {
      const mapping = { title: 'title', body: 'content', description: 'summary' };
      const result = createLanguageAwareMapping(mapping, 'en');
      expect(result).toEqual(mapping);
    });

    it('should translate fields for Spanish', () => {
      const mapping = { title: 'title', body: 'body', description: 'description' };
      const result = createLanguageAwareMapping(mapping, 'es');
      expect(result.title).toBe('titulo');
      expect(result.body).toBe('cuerpo');
      expect(result.description).toBe('descripcion');
    });

    it('should translate fields for German', () => {
      const mapping = { title: 'title', body: 'body' };
      const result = createLanguageAwareMapping(mapping, 'de');
      expect(result.title).toBe('titel');
      expect(result.body).toBe('inhalt');
    });

    it('should preserve undefined fields', () => {
      const mapping = { title: 'title' };
      const result = createLanguageAwareMapping(mapping, 'es');
      expect(result.description).toBeUndefined();
      expect(result.body).toBeUndefined();
    });
  });
});

describe('Language-Aware Extraction', () => {
  describe('extractFieldByCategory', () => {
    it('should extract from Spanish field names', () => {
      const data = {
        titulo: 'El Titulo',
        descripcion: 'La descripcion del documento',
        requisitos: 'Lista de requisitos',
      };

      expect(extractFieldByCategory(data, 'title', 'es')).toBe('El Titulo');
      expect(extractFieldByCategory(data, 'description', 'es')).toBe('La descripcion del documento');
      expect(extractFieldByCategory(data, 'requirements', 'es')).toBe('Lista de requisitos');
    });

    it('should extract from German field names', () => {
      const data = {
        titel: 'Der Titel',
        beschreibung: 'Die Beschreibung',
        anforderungen: 'Liste der Anforderungen',
      };

      expect(extractFieldByCategory(data, 'title', 'de')).toBe('Der Titel');
      expect(extractFieldByCategory(data, 'description', 'de')).toBe('Die Beschreibung');
      expect(extractFieldByCategory(data, 'requirements', 'de')).toBe('Liste der Anforderungen');
    });

    it('should fall back to English fields', () => {
      const data = {
        title: 'The Title',
        description: 'The description',
      };

      // Even when asking for Spanish, should find English fields
      expect(extractFieldByCategory(data, 'title', 'es')).toBe('The Title');
      expect(extractFieldByCategory(data, 'description', 'es')).toBe('The description');
    });

    it('should handle case-insensitive field names', () => {
      const data = {
        TITULO: 'El Titulo en mayusculas',
        Requisitos: 'Requisitos con capital',
      };

      expect(extractFieldByCategory(data, 'title', 'es')).toBe('El Titulo en mayusculas');
      expect(extractFieldByCategory(data, 'requirements', 'es')).toBe('Requisitos con capital');
    });

    it('should return null for non-object data', () => {
      expect(extractFieldByCategory('string', 'title', 'es')).toBeNull();
      expect(extractFieldByCategory(null, 'title', 'es')).toBeNull();
      expect(extractFieldByCategory(123, 'title', 'es')).toBeNull();
    });

    it('should return null when field not found', () => {
      const data = { other_field: 'value' };
      expect(extractFieldByCategory(data, 'title', 'es')).toBeNull();
    });
  });

  describe('extractContentLanguageAware', () => {
    it('should extract all content fields from Spanish data', () => {
      const data = {
        titulo: 'Titulo del Documento',
        descripcion: 'Breve descripcion del contenido',
        cuerpo: 'El cuerpo principal del documento con mas texto.',
      };

      const result = extractContentLanguageAware(data, 'es');
      expect(result.title).toBe('Titulo del Documento');
      expect(result.description).toBe('Breve descripcion del contenido');
      expect(result.body).toBe('El cuerpo principal del documento con mas texto.');
    });

    it('should extract all content fields from German data', () => {
      const data = {
        titel: 'Dokumenttitel',
        beschreibung: 'Kurze Beschreibung',
        inhalt: 'Der Hauptinhalt des Dokuments.',
      };

      const result = extractContentLanguageAware(data, 'de');
      expect(result.title).toBe('Dokumenttitel');
      expect(result.description).toBe('Kurze Beschreibung');
      expect(result.body).toBe('Der Hauptinhalt des Dokuments.');
    });

    it('should handle mixed language data', () => {
      const data = {
        title: 'English Title',
        descripcion: 'Spanish description',
        inhalt: 'German content',
      };

      // When detecting Spanish, should find Spanish fields first, then fallback
      const result = extractContentLanguageAware(data, 'es');
      expect(result.description).toBe('Spanish description');
      // Title should fall back to English
      expect(result.title).toBe('English Title');
    });

    it('should return nulls for empty object', () => {
      const result = extractContentLanguageAware({}, 'es');
      expect(result.title).toBeNull();
      expect(result.description).toBeNull();
      expect(result.body).toBeNull();
    });
  });
});

describe('Field Translation Coverage', () => {
  it('should have translations for all major languages', () => {
    const languages = ['en', 'es', 'pt', 'de', 'fr', 'it', 'nl'];
    const categories: FieldCategory[] = ['title', 'description', 'body', 'requirements', 'documents', 'fees'];

    for (const category of categories) {
      for (const lang of languages) {
        const variants = FIELD_TRANSLATIONS[category]?.[lang];
        expect(variants, `Missing ${category} for ${lang}`).toBeDefined();
        expect(variants?.length, `Empty ${category} for ${lang}`).toBeGreaterThan(0);
      }
    }
  });

  it('should have government-specific field translations', () => {
    // These are critical for MoveAhead integration
    const govCategories: FieldCategory[] = ['requirements', 'documents', 'fees', 'timeline', 'application', 'deadline'];

    for (const category of govCategories) {
      expect(FIELD_TRANSLATIONS[category]).toBeDefined();

      // Must have Spanish (for Spain, Latin America)
      expect(FIELD_TRANSLATIONS[category].es).toBeDefined();
      expect(FIELD_TRANSLATIONS[category].es.length).toBeGreaterThan(0);

      // Must have Portuguese (for Portugal, Brazil)
      expect(FIELD_TRANSLATIONS[category].pt).toBeDefined();

      // Must have German (for Germany, Austria, Switzerland)
      expect(FIELD_TRANSLATIONS[category].de).toBeDefined();
    }
  });
});
