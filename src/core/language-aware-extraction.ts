/**
 * Language-Aware Extraction (INT-011)
 *
 * Provides language detection and multi-language field mapping for content extraction.
 * Enables extraction of content from pages in any language with automatic field name translation.
 *
 * Key Features:
 * - Auto-detect page language from HTML attributes, meta tags, and content analysis
 * - Map common field names across languages (e.g., "requisitos" -> "requirements")
 * - Extensible to any language through the field mapping registry
 * - Confidence scoring for language detection
 */

import type { ContentMapping } from '../types/api-patterns.js';

// ============================================
// TYPES
// ============================================

/**
 * Result of language detection
 */
export interface LanguageDetectionResult {
  /** Detected ISO 639-1 language code (e.g., "en", "es", "de") */
  language: string;
  /** Confidence in the detection (0-1) */
  confidence: number;
  /** How the language was detected */
  source: LanguageDetectionSource;
  /** Full locale if available (e.g., "en-US", "es-ES") */
  locale?: string;
}

export type LanguageDetectionSource =
  | 'html-lang'           // <html lang="...">
  | 'meta-content-language' // <meta http-equiv="content-language">
  | 'og-locale'           // <meta property="og:locale">
  | 'content-analysis'    // Detected from content patterns
  | 'url-pattern'         // Detected from URL (e.g., /es/, es.example.com)
  | 'unknown';

/**
 * Extended ContentMapping with multi-language support
 */
export interface LanguageAwareContentMapping extends ContentMapping {
  /**
   * Language-specific field overrides
   * Maps ISO 639-1 codes to partial ContentMapping overrides
   */
  languageFieldMap?: Record<string, Partial<ContentMapping>>;
}

/**
 * Field category for semantic grouping
 */
export type FieldCategory =
  | 'title'
  | 'description'
  | 'body'
  | 'requirements'
  | 'documents'
  | 'fees'
  | 'timeline'
  | 'application'
  | 'status'
  | 'contact'
  | 'address'
  | 'date'
  | 'deadline'
  | 'price'
  | 'name'
  | 'author'
  | 'summary';

// ============================================
// LANGUAGE DETECTION
// ============================================

/**
 * Detect the language of an HTML page
 *
 * Detection order (by reliability):
 * 1. html lang attribute (most reliable)
 * 2. Content-Language meta tag
 * 3. Open Graph locale
 * 4. URL patterns (subdomain or path)
 * 5. Content analysis (least reliable)
 *
 * @param html - The HTML content to analyze
 * @param url - Optional URL for pattern-based detection
 * @returns Language detection result with confidence
 */
export function detectPageLanguage(
  html: string,
  url?: string
): LanguageDetectionResult {
  // 1. Check html lang attribute (highest confidence)
  const htmlLangMatch = html.match(/<html[^>]*\slang=["']([^"']+)["']/i);
  if (htmlLangMatch) {
    const fullLocale = htmlLangMatch[1];
    const language = extractLanguageCode(fullLocale);
    return {
      language,
      confidence: 0.95,
      source: 'html-lang',
      locale: fullLocale,
    };
  }

  // 2. Check meta content-language
  const metaLangMatch = html.match(
    /<meta[^>]*http-equiv=["']content-language["'][^>]*content=["']([^"']+)["']/i
  );
  if (metaLangMatch) {
    const fullLocale = metaLangMatch[1];
    const language = extractLanguageCode(fullLocale);
    return {
      language,
      confidence: 0.9,
      source: 'meta-content-language',
      locale: fullLocale,
    };
  }

  // Also check for the reversed attribute order
  const metaLangMatch2 = html.match(
    /<meta[^>]*content=["']([^"']+)["'][^>]*http-equiv=["']content-language["']/i
  );
  if (metaLangMatch2) {
    const fullLocale = metaLangMatch2[1];
    const language = extractLanguageCode(fullLocale);
    return {
      language,
      confidence: 0.9,
      source: 'meta-content-language',
      locale: fullLocale,
    };
  }

  // 3. Check Open Graph locale
  const ogLocaleMatch = html.match(
    /<meta[^>]*property=["']og:locale["'][^>]*content=["']([^"']+)["']/i
  );
  if (ogLocaleMatch) {
    const fullLocale = ogLocaleMatch[1].replace('_', '-');
    const language = extractLanguageCode(fullLocale);
    return {
      language,
      confidence: 0.85,
      source: 'og-locale',
      locale: fullLocale,
    };
  }

  // Also check reversed attribute order
  const ogLocaleMatch2 = html.match(
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:locale["']/i
  );
  if (ogLocaleMatch2) {
    const fullLocale = ogLocaleMatch2[1].replace('_', '-');
    const language = extractLanguageCode(fullLocale);
    return {
      language,
      confidence: 0.85,
      source: 'og-locale',
      locale: fullLocale,
    };
  }

  // 4. Check URL patterns
  if (url) {
    const urlLanguage = detectLanguageFromUrl(url);
    if (urlLanguage) {
      return {
        language: urlLanguage,
        confidence: 0.75,
        source: 'url-pattern',
      };
    }
  }

  // 5. Content analysis (fallback)
  const contentLanguage = detectLanguageFromContent(html);
  if (contentLanguage) {
    return {
      language: contentLanguage.language,
      confidence: contentLanguage.confidence,
      source: 'content-analysis',
    };
  }

  // Default to English with low confidence
  return {
    language: 'en',
    confidence: 0.3,
    source: 'unknown',
  };
}

/**
 * Extract ISO 639-1 language code from a locale string
 */
export function extractLanguageCode(locale: string): string {
  // Handle formats: "en", "en-US", "en_US", "eng"
  const normalized = locale.toLowerCase().replace('_', '-');
  const parts = normalized.split('-');
  const code = parts[0];

  // Convert 3-letter codes to 2-letter if known
  const iso3to2: Record<string, string> = {
    eng: 'en',
    spa: 'es',
    deu: 'de',
    fra: 'fr',
    por: 'pt',
    ita: 'it',
    nld: 'nl',
    pol: 'pl',
    rus: 'ru',
    jpn: 'ja',
    zho: 'zh',
    kor: 'ko',
    ara: 'ar',
  };

  return iso3to2[code] || code.substring(0, 2);
}

/**
 * Detect language from URL patterns
 */
function detectLanguageFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);

    // Check subdomain (e.g., es.wikipedia.org, fr.example.com)
    const subdomainMatch = parsed.hostname.match(/^([a-z]{2})\.(?!www\.)/i);
    if (subdomainMatch && isValidLanguageCode(subdomainMatch[1])) {
      return subdomainMatch[1].toLowerCase();
    }

    // Check path prefix (e.g., /es/, /en-us/, /fr-fr/)
    const pathMatch = parsed.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//i);
    if (pathMatch && isValidLanguageCode(pathMatch[1].substring(0, 2))) {
      return pathMatch[1].substring(0, 2).toLowerCase();
    }

    // Check query parameter (e.g., ?lang=es, ?locale=fr)
    const langParam = parsed.searchParams.get('lang') ||
                      parsed.searchParams.get('locale') ||
                      parsed.searchParams.get('language') ||
                      parsed.searchParams.get('hl');
    if (langParam && isValidLanguageCode(langParam.substring(0, 2))) {
      return langParam.substring(0, 2).toLowerCase();
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Detect language from content patterns (stopwords, character frequencies)
 */
function detectLanguageFromContent(html: string): { language: string; confidence: number } | null {
  // Remove HTML tags and get text content
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();

  if (text.length < 50) {
    return null;
  }

  // Check for language-specific patterns
  const patterns: Record<string, { words: string[]; weight: number }> = {
    es: {
      words: ['requisitos', 'documentos', 'solicitud', 'informacion', 'trámite', 'fecha', 'plazo', 'y', 'el', 'la', 'de', 'que', 'en', 'los', 'las', 'por', 'con', 'para', 'como', 'sobre', 'puede', 'debe', 'tambien', 'cuando', 'desde', 'hasta', 'todos', 'este'],
      weight: 1,
    },
    pt: {
      words: ['requisitos', 'documentos', 'solicita', 'informa', 'prazo', 'o', 'a', 'de', 'que', 'em', 'os', 'as', 'por', 'com', 'para', 'como', 'sobre', 'pode', 'deve', 'tambem', 'quando', 'desde', 'todos', 'este', 'voce'],
      weight: 1,
    },
    de: {
      words: ['anforderungen', 'dokumente', 'antrag', 'informationen', 'frist', 'und', 'der', 'die', 'das', 'ist', 'von', 'mit', 'auf', 'fur', 'sie', 'werden', 'haben', 'wird', 'sind', 'bei', 'nach', 'durch', 'oder', 'ihre', 'kann'],
      weight: 1,
    },
    fr: {
      words: ['exigences', 'documents', 'demande', 'informations', 'delai', 'et', 'le', 'la', 'les', 'de', 'du', 'des', 'que', 'est', 'en', 'pour', 'avec', 'sur', 'dans', 'qui', 'par', 'vous', 'votre', 'peut', 'sont'],
      weight: 1,
    },
    it: {
      words: ['requisiti', 'documenti', 'domanda', 'informazioni', 'scadenza', 'e', 'il', 'la', 'di', 'che', 'in', 'per', 'con', 'sono', 'del', 'della', 'un', 'una', 'come', 'dal', 'questo', 'questi', 'essere'],
      weight: 1,
    },
    nl: {
      words: ['vereisten', 'documenten', 'aanvraag', 'informatie', 'termijn', 'en', 'de', 'het', 'van', 'een', 'is', 'op', 'te', 'dat', 'voor', 'met', 'in', 'zijn', 'worden', 'als', 'bij', 'naar', 'door', 'ook', 'kan'],
      weight: 1,
    },
    en: {
      words: ['requirements', 'documents', 'application', 'information', 'deadline', 'the', 'and', 'of', 'to', 'in', 'is', 'for', 'with', 'that', 'are', 'on', 'as', 'be', 'at', 'this', 'have', 'from', 'or', 'your', 'can'],
      weight: 0.8, // Lower weight for English as default fallback
    },
  };

  // Count matches for each language
  const scores: Record<string, number> = {};
  const words = text.split(/\s+/);
  const wordSet = new Set(words);

  for (const [lang, { words: langWords, weight }] of Object.entries(patterns)) {
    let matches = 0;
    for (const word of langWords) {
      if (wordSet.has(word)) {
        matches++;
      }
    }
    scores[lang] = (matches / langWords.length) * weight;
  }

  // Find best match
  let bestLang = 'en';
  let bestScore = 0;

  for (const [lang, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestLang = lang;
    }
  }

  // Require minimum confidence
  if (bestScore < 0.1) {
    return null;
  }

  // Convert score to confidence (0-0.7 range for content analysis)
  const confidence = Math.min(0.7, 0.3 + bestScore * 0.5);

  return { language: bestLang, confidence };
}

/**
 * Check if a string is a valid ISO 639-1 language code
 */
function isValidLanguageCode(code: string): boolean {
  const validCodes = new Set([
    'aa', 'ab', 'af', 'ak', 'sq', 'am', 'ar', 'an', 'hy', 'as', 'av', 'ae', 'ay', 'az',
    'ba', 'bm', 'eu', 'be', 'bn', 'bh', 'bi', 'bo', 'bs', 'br', 'bg', 'my', 'ca', 'cs',
    'ch', 'ce', 'zh', 'cu', 'cv', 'kw', 'co', 'cr', 'cy', 'da', 'de', 'dv', 'nl', 'dz',
    'en', 'eo', 'et', 'ee', 'fo', 'fa', 'fj', 'fi', 'fr', 'fy', 'ff', 'ka', 'gd', 'ga',
    'gl', 'gv', 'el', 'gn', 'gu', 'ht', 'ha', 'he', 'hz', 'hi', 'ho', 'hr', 'hu', 'ig',
    'is', 'io', 'ii', 'iu', 'ie', 'ia', 'id', 'ik', 'it', 'jv', 'ja', 'kl', 'kn', 'ks',
    'kr', 'kk', 'km', 'ki', 'rw', 'ky', 'kv', 'kg', 'ko', 'kj', 'ku', 'lo', 'la', 'lv',
    'li', 'ln', 'lt', 'lb', 'lu', 'lg', 'mk', 'mh', 'ml', 'mi', 'mr', 'ms', 'mg', 'mt',
    'mn', 'na', 'nv', 'nr', 'nd', 'ng', 'ne', 'nn', 'nb', 'no', 'ny', 'oc', 'oj', 'or',
    'om', 'os', 'pa', 'pi', 'pl', 'pt', 'ps', 'qu', 'rm', 'ro', 'rn', 'ru', 'sg', 'sa',
    'si', 'sk', 'sl', 'se', 'sm', 'sn', 'sd', 'so', 'st', 'es', 'sc', 'sr', 'ss', 'su',
    'sw', 'sv', 'ty', 'ta', 'tt', 'te', 'tg', 'tl', 'th', 'ti', 'to', 'tn', 'ts', 'tk',
    'tr', 'tw', 'ug', 'uk', 'ur', 'uz', 've', 'vi', 'vo', 'wa', 'wo', 'xh', 'yi', 'yo',
    'za', 'zu',
  ]);
  return validCodes.has(code.toLowerCase());
}

// ============================================
// MULTI-LANGUAGE FIELD MAPPING
// ============================================

/**
 * Multi-language field name registry
 * Maps English field names to their equivalents in other languages
 */
export const FIELD_TRANSLATIONS: Record<FieldCategory, Record<string, string[]>> = {
  title: {
    en: ['title', 'name', 'heading'],
    es: ['titulo', 'nombre', 'encabezado'],
    pt: ['titulo', 'nome', 'cabecalho'],
    de: ['titel', 'name', 'uberschrift'],
    fr: ['titre', 'nom', 'en-tete'],
    it: ['titolo', 'nome', 'intestazione'],
    nl: ['titel', 'naam', 'kop'],
  },
  description: {
    en: ['description', 'desc', 'summary', 'about'],
    es: ['descripcion', 'resumen', 'acerca'],
    pt: ['descricao', 'resumo', 'sobre'],
    de: ['beschreibung', 'zusammenfassung', 'uber'],
    fr: ['description', 'resume', 'apropos'],
    it: ['descrizione', 'sommario', 'info'],
    nl: ['beschrijving', 'samenvatting', 'over'],
  },
  body: {
    en: ['body', 'content', 'text', 'article'],
    es: ['cuerpo', 'contenido', 'texto', 'articulo'],
    pt: ['corpo', 'conteudo', 'texto', 'artigo'],
    de: ['inhalt', 'text', 'artikel', 'korper'],
    fr: ['corps', 'contenu', 'texte', 'article'],
    it: ['corpo', 'contenuto', 'testo', 'articolo'],
    nl: ['inhoud', 'tekst', 'artikel', 'lichaam'],
  },
  requirements: {
    en: ['requirements', 'required', 'prerequisites', 'conditions'],
    es: ['requisitos', 'requerimientos', 'condiciones', 'necesarios'],
    pt: ['requisitos', 'requerimentos', 'condicoes', 'necessarios'],
    de: ['anforderungen', 'voraussetzungen', 'bedingungen', 'erforderlich'],
    fr: ['exigences', 'conditions', 'prerequis', 'necessaires'],
    it: ['requisiti', 'condizioni', 'prerequisiti', 'necessari'],
    nl: ['vereisten', 'voorwaarden', 'condities', 'nodig'],
  },
  documents: {
    en: ['documents', 'documentation', 'files', 'papers'],
    es: ['documentos', 'documentacion', 'archivos', 'papeles'],
    pt: ['documentos', 'documentacao', 'arquivos', 'papeis'],
    de: ['dokumente', 'dokumentation', 'unterlagen', 'papiere'],
    fr: ['documents', 'documentation', 'fichiers', 'papiers'],
    it: ['documenti', 'documentazione', 'file', 'carte'],
    nl: ['documenten', 'documentatie', 'bestanden', 'papieren'],
  },
  fees: {
    en: ['fees', 'fee', 'cost', 'costs', 'price', 'pricing', 'charges'],
    es: ['tasas', 'tasa', 'tarifa', 'tarifas', 'costo', 'costos', 'precio', 'precios'],
    pt: ['taxas', 'taxa', 'tarifa', 'tarifas', 'custo', 'custos', 'preco', 'precos'],
    de: ['gebuhren', 'gebuhr', 'kosten', 'preis', 'preise'],
    fr: ['frais', 'cout', 'couts', 'tarif', 'tarifs', 'prix'],
    it: ['tasse', 'costo', 'costi', 'tariffa', 'tariffe', 'prezzo', 'prezzi'],
    nl: ['kosten', 'prijs', 'prijzen', 'tarief', 'tarieven'],
  },
  timeline: {
    en: ['timeline', 'duration', 'processing', 'time', 'period'],
    es: ['plazo', 'duracion', 'tiempo', 'periodo', 'tramitacion'],
    pt: ['prazo', 'duracao', 'tempo', 'periodo', 'tramitacao'],
    de: ['frist', 'dauer', 'zeitraum', 'bearbeitungszeit'],
    fr: ['delai', 'duree', 'temps', 'periode', 'traitement'],
    it: ['scadenza', 'durata', 'tempo', 'periodo', 'elaborazione'],
    nl: ['termijn', 'duur', 'tijd', 'periode', 'verwerking'],
  },
  application: {
    en: ['application', 'apply', 'request', 'form', 'submission'],
    es: ['solicitud', 'aplicacion', 'peticion', 'formulario', 'tramite'],
    pt: ['solicitacao', 'aplicacao', 'pedido', 'formulario', 'requerimento'],
    de: ['antrag', 'anwendung', 'anfrage', 'formular', 'einreichung'],
    fr: ['demande', 'application', 'requete', 'formulaire', 'soumission'],
    it: ['domanda', 'applicazione', 'richiesta', 'modulo', 'presentazione'],
    nl: ['aanvraag', 'applicatie', 'verzoek', 'formulier', 'indiening'],
  },
  status: {
    en: ['status', 'state', 'situation', 'condition'],
    es: ['estado', 'situacion', 'condicion'],
    pt: ['estado', 'situacao', 'condicao'],
    de: ['status', 'zustand', 'lage'],
    fr: ['statut', 'etat', 'situation', 'condition'],
    it: ['stato', 'situazione', 'condizione'],
    nl: ['status', 'staat', 'situatie', 'conditie'],
  },
  contact: {
    en: ['contact', 'email', 'phone', 'telephone', 'address'],
    es: ['contacto', 'correo', 'telefono', 'direccion'],
    pt: ['contato', 'email', 'telefone', 'endereco'],
    de: ['kontakt', 'email', 'telefon', 'adresse'],
    fr: ['contact', 'email', 'telephone', 'adresse'],
    it: ['contatto', 'email', 'telefono', 'indirizzo'],
    nl: ['contact', 'email', 'telefoon', 'adres'],
  },
  address: {
    en: ['address', 'location', 'office', 'place'],
    es: ['direccion', 'ubicacion', 'oficina', 'lugar'],
    pt: ['endereco', 'localizacao', 'escritorio', 'lugar'],
    de: ['adresse', 'standort', 'buro', 'ort'],
    fr: ['adresse', 'emplacement', 'bureau', 'lieu'],
    it: ['indirizzo', 'posizione', 'ufficio', 'luogo'],
    nl: ['adres', 'locatie', 'kantoor', 'plaats'],
  },
  date: {
    en: ['date', 'when', 'day'],
    es: ['fecha', 'cuando', 'dia'],
    pt: ['data', 'quando', 'dia'],
    de: ['datum', 'wann', 'tag'],
    fr: ['date', 'quand', 'jour'],
    it: ['data', 'quando', 'giorno'],
    nl: ['datum', 'wanneer', 'dag'],
  },
  deadline: {
    en: ['deadline', 'due', 'expiry', 'expires', 'limit'],
    es: ['fecha_limite', 'vencimiento', 'expira', 'limite'],
    pt: ['prazo_final', 'vencimento', 'expira', 'limite'],
    de: ['frist', 'fallig', 'ablauf', 'limit'],
    fr: ['date_limite', 'echeance', 'expire', 'limite'],
    it: ['scadenza', 'termine', 'scade', 'limite'],
    nl: ['deadline', 'vervaldatum', 'verloopt', 'limiet'],
  },
  price: {
    en: ['price', 'cost', 'amount', 'total', 'value'],
    es: ['precio', 'costo', 'importe', 'total', 'valor'],
    pt: ['preco', 'custo', 'valor', 'total', 'quantia'],
    de: ['preis', 'kosten', 'betrag', 'gesamt', 'wert'],
    fr: ['prix', 'cout', 'montant', 'total', 'valeur'],
    it: ['prezzo', 'costo', 'importo', 'totale', 'valore'],
    nl: ['prijs', 'kosten', 'bedrag', 'totaal', 'waarde'],
  },
  name: {
    en: ['name', 'fullname', 'full_name'],
    es: ['nombre', 'nombre_completo'],
    pt: ['nome', 'nome_completo'],
    de: ['name', 'vollstandiger_name'],
    fr: ['nom', 'nom_complet'],
    it: ['nome', 'nome_completo'],
    nl: ['naam', 'volledige_naam'],
  },
  author: {
    en: ['author', 'by', 'written_by', 'creator'],
    es: ['autor', 'por', 'escrito_por', 'creador'],
    pt: ['autor', 'por', 'escrito_por', 'criador'],
    de: ['autor', 'von', 'geschrieben_von', 'ersteller'],
    fr: ['auteur', 'par', 'ecrit_par', 'createur'],
    it: ['autore', 'di', 'scritto_da', 'creatore'],
    nl: ['auteur', 'door', 'geschreven_door', 'maker'],
  },
  summary: {
    en: ['summary', 'abstract', 'overview', 'brief'],
    es: ['resumen', 'abstracto', 'vista_general', 'breve'],
    pt: ['resumo', 'sumario', 'visao_geral', 'breve'],
    de: ['zusammenfassung', 'abstrakt', 'uberblick', 'kurz'],
    fr: ['resume', 'abstrait', 'apercu', 'bref'],
    it: ['sommario', 'astratto', 'panoramica', 'breve'],
    nl: ['samenvatting', 'abstract', 'overzicht', 'kort'],
  },
};

/**
 * Get field name variants for a given category and language
 *
 * @param category - The semantic field category
 * @param language - The target language code (ISO 639-1)
 * @returns Array of field name variants in that language
 */
export function getFieldVariants(
  category: FieldCategory,
  language: string
): string[] {
  const categoryTranslations = FIELD_TRANSLATIONS[category];
  if (!categoryTranslations) {
    return [];
  }

  // Get language-specific variants
  const variants = categoryTranslations[language] || [];

  // If not English, also include English as fallback
  if (language !== 'en') {
    const englishVariants = categoryTranslations.en || [];
    return [...variants, ...englishVariants];
  }

  return variants;
}

/**
 * Get all field name variants for a category across all supported languages
 */
export function getAllFieldVariants(category: FieldCategory): string[] {
  const categoryTranslations = FIELD_TRANSLATIONS[category];
  if (!categoryTranslations) {
    return [];
  }

  const allVariants: string[] = [];
  for (const variants of Object.values(categoryTranslations)) {
    allVariants.push(...variants);
  }

  return [...new Set(allVariants)];
}

/**
 * Translate a field name from one language to another
 *
 * @param fieldName - The field name to translate
 * @param fromLanguage - Source language (or 'auto' to detect)
 * @param toLanguage - Target language
 * @returns Translated field name or original if no translation found
 */
export function translateFieldName(
  fieldName: string,
  fromLanguage: string | 'auto',
  toLanguage: string
): string {
  const normalizedField = fieldName.toLowerCase().replace(/[-_]/g, '');

  // Find which category this field belongs to
  for (const [category, translations] of Object.entries(FIELD_TRANSLATIONS)) {
    for (const [lang, variants] of Object.entries(translations)) {
      const normalizedVariants = variants.map(v => v.toLowerCase().replace(/[-_]/g, ''));
      if (normalizedVariants.includes(normalizedField)) {
        // Found the category, return the first variant in target language
        const targetVariants = (FIELD_TRANSLATIONS[category as FieldCategory] as Record<string, string[]>)[toLanguage];
        if (targetVariants && targetVariants.length > 0) {
          return targetVariants[0];
        }
        break;
      }
    }
  }

  // No translation found, return original
  return fieldName;
}

/**
 * Detect the semantic category of a field name
 *
 * @param fieldName - The field name to categorize
 * @returns The detected category or undefined if not recognized
 */
export function detectFieldCategory(fieldName: string): FieldCategory | undefined {
  const normalizedField = fieldName.toLowerCase().replace(/[-_]/g, '');

  for (const [category, translations] of Object.entries(FIELD_TRANSLATIONS)) {
    for (const variants of Object.values(translations)) {
      const normalizedVariants = variants.map(v => v.toLowerCase().replace(/[-_]/g, ''));
      if (normalizedVariants.includes(normalizedField)) {
        return category as FieldCategory;
      }
    }
  }

  return undefined;
}

/**
 * Create a language-aware content mapping from a base mapping
 *
 * @param baseMapping - The base content mapping (typically English)
 * @param targetLanguage - The target language for the mapping
 * @returns A content mapping with language-appropriate field names
 */
export function createLanguageAwareMapping(
  baseMapping: ContentMapping,
  targetLanguage: string
): ContentMapping {
  if (targetLanguage === 'en') {
    return baseMapping;
  }

  const translatedMapping: ContentMapping = {
    title: translateFieldPath(baseMapping.title, targetLanguage),
    description: baseMapping.description
      ? translateFieldPath(baseMapping.description, targetLanguage)
      : undefined,
    body: baseMapping.body
      ? translateFieldPath(baseMapping.body, targetLanguage)
      : undefined,
    metadata: baseMapping.metadata
      ? Object.fromEntries(
          Object.entries(baseMapping.metadata).map(([key, path]) => [
            key,
            translateFieldPath(path, targetLanguage),
          ])
        )
      : undefined,
  };

  return translatedMapping;
}

/**
 * Translate a JSONPath or dot notation path
 * Only translates the field names, preserving array notation
 */
function translateFieldPath(path: string, targetLanguage: string): string {
  // Split by dots and brackets
  const parts = path.split(/(\[[\d]+\]|\.)/);

  return parts
    .map(part => {
      if (part === '.' || part.startsWith('[')) {
        return part;
      }
      return translateFieldName(part, 'auto', targetLanguage);
    })
    .join('');
}

// ============================================
// LANGUAGE-AWARE EXTRACTION
// ============================================

/**
 * Extract content with language awareness
 * Tries field names in the detected language first, then falls back to English
 *
 * @param data - The data object to extract from
 * @param fieldCategory - The semantic category of the field to extract
 * @param language - The detected page language
 * @returns The extracted value or null
 */
export function extractFieldByCategory(
  data: unknown,
  fieldCategory: FieldCategory,
  language: string
): unknown {
  if (typeof data !== 'object' || data === null) {
    return null;
  }

  const obj = data as Record<string, unknown>;

  // Get field variants in priority order
  const variants = getFieldVariants(fieldCategory, language);

  // Try each variant
  for (const variant of variants) {
    // Direct field access
    if (variant in obj && obj[variant] !== null && obj[variant] !== undefined) {
      return obj[variant];
    }

    // Case-insensitive access
    const lowerVariant = variant.toLowerCase();
    for (const [key, value] of Object.entries(obj)) {
      if (key.toLowerCase() === lowerVariant && value !== null && value !== undefined) {
        return value;
      }
    }
  }

  return null;
}

/**
 * Extract content from a data object using language-aware field detection
 *
 * @param data - The data object to extract from
 * @param language - The detected page language
 * @returns Extracted title, description, and body
 */
export function extractContentLanguageAware(
  data: unknown,
  language: string
): { title: string | null; description: string | null; body: string | null } {
  const title = extractFieldByCategory(data, 'title', language);
  const description = extractFieldByCategory(data, 'description', language);
  const body = extractFieldByCategory(data, 'body', language);

  return {
    title: typeof title === 'string' ? title : null,
    description: typeof description === 'string' ? description : null,
    body: typeof body === 'string' ? body : null,
  };
}

// ============================================
// EXPORTS
// ============================================

export const LanguageAwareExtraction = {
  // Detection
  detectPageLanguage,
  extractLanguageCode,

  // Field mapping
  getFieldVariants,
  getAllFieldVariants,
  translateFieldName,
  detectFieldCategory,
  createLanguageAwareMapping,

  // Extraction
  extractFieldByCategory,
  extractContentLanguageAware,

  // Data
  FIELD_TRANSLATIONS,
};
