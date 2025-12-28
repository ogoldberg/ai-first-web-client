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
 *
 * Supports 40+ languages across all major regions:
 * - Western European: en, es, pt, de, fr, it, nl
 * - Nordic: sv, no, da, fi
 * - Eastern European: pl, cs, sk, hu, ro, bg, hr, sl, sr, uk, ru
 * - Baltic: lt, lv, et
 * - Asian: zh, ja, ko, vi, th, id, ms, tl
 * - Middle Eastern: ar, he, tr, fa
 * - South Asian: hi, bn, ta
 * - Greek: el
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

  // Check for script-based detection first (CJK, Arabic, Hebrew, Thai, etc.)
  const scriptResult = detectLanguageFromScript(text);
  if (scriptResult) {
    return scriptResult;
  }

  // Check for language-specific patterns (stopwords)
  const patterns: Record<string, { words: string[]; weight: number }> = {
    // Western European
    es: {
      words: ['requisitos', 'documentos', 'solicitud', 'informacion', 'tramite', 'fecha', 'plazo', 'y', 'el', 'la', 'de', 'que', 'en', 'los', 'las', 'por', 'con', 'para', 'como', 'sobre', 'puede', 'debe', 'tambien', 'cuando', 'desde', 'hasta', 'todos', 'este'],
      weight: 1,
    },
    pt: {
      words: ['requisitos', 'documentos', 'solicita', 'informa', 'prazo', 'o', 'a', 'de', 'que', 'em', 'os', 'as', 'por', 'com', 'para', 'como', 'sobre', 'pode', 'deve', 'tambem', 'quando', 'desde', 'todos', 'este', 'voce', 'nao', 'mais'],
      weight: 1,
    },
    de: {
      words: ['anforderungen', 'dokumente', 'antrag', 'informationen', 'frist', 'und', 'der', 'die', 'das', 'ist', 'von', 'mit', 'auf', 'fur', 'sie', 'werden', 'haben', 'wird', 'sind', 'bei', 'nach', 'durch', 'oder', 'ihre', 'kann', 'nicht', 'auch'],
      weight: 1,
    },
    fr: {
      words: ['exigences', 'documents', 'demande', 'informations', 'delai', 'et', 'le', 'la', 'les', 'de', 'du', 'des', 'que', 'est', 'en', 'pour', 'avec', 'sur', 'dans', 'qui', 'par', 'vous', 'votre', 'peut', 'sont', 'pas', 'plus'],
      weight: 1,
    },
    it: {
      words: ['requisiti', 'documenti', 'domanda', 'informazioni', 'scadenza', 'e', 'il', 'la', 'di', 'che', 'in', 'per', 'con', 'sono', 'del', 'della', 'un', 'una', 'come', 'dal', 'questo', 'questi', 'essere', 'non', 'piu'],
      weight: 1,
    },
    nl: {
      words: ['vereisten', 'documenten', 'aanvraag', 'informatie', 'termijn', 'en', 'de', 'het', 'van', 'een', 'is', 'op', 'te', 'dat', 'voor', 'met', 'in', 'zijn', 'worden', 'als', 'bij', 'naar', 'door', 'ook', 'kan', 'niet', 'meer'],
      weight: 1,
    },
    // Nordic
    sv: {
      words: ['krav', 'dokument', 'ansokan', 'information', 'och', 'att', 'det', 'som', 'en', 'av', 'for', 'pa', 'ar', 'med', 'till', 'den', 'har', 'kan', 'om', 'inte', 'vara', 'eller', 'ska', 'sin', 'alla'],
      weight: 1,
    },
    no: {
      words: ['krav', 'dokumenter', 'soknad', 'informasjon', 'og', 'at', 'det', 'som', 'en', 'av', 'for', 'pa', 'er', 'med', 'til', 'den', 'har', 'kan', 'om', 'ikke', 'fra', 'eller', 'skal', 'sin', 'alle'],
      weight: 1,
    },
    da: {
      words: ['krav', 'dokumenter', 'ansogning', 'information', 'og', 'at', 'det', 'som', 'en', 'af', 'for', 'pa', 'er', 'med', 'til', 'den', 'har', 'kan', 'om', 'ikke', 'fra', 'eller', 'skal', 'sin', 'alle'],
      weight: 1,
    },
    fi: {
      words: ['vaatimukset', 'asiakirjat', 'hakemus', 'tiedot', 'ja', 'on', 'ei', 'se', 'kun', 'voi', 'ovat', 'ole', 'niin', 'kuin', 'mutta', 'vain', 'tai', 'siita', 'joka', 'etta', 'hanen', 'myos'],
      weight: 1,
    },
    // Eastern European
    pl: {
      words: ['wymagania', 'dokumenty', 'wniosek', 'informacje', 'i', 'w', 'na', 'z', 'do', 'jest', 'nie', 'to', 'sie', 'ze', 'o', 'jak', 'co', 'po', 'za', 'ale', 'czy', 'od', 'tak', 'dla', 'przez'],
      weight: 1,
    },
    cs: {
      words: ['pozadavky', 'dokumenty', 'zadost', 'informace', 'a', 'v', 'na', 'je', 'se', 'z', 'do', 'to', 'ze', 'pro', 's', 'o', 'jak', 'co', 'po', 'ale', 'nebo', 'od', 'tak', 'jako', 'jsou'],
      weight: 1,
    },
    sk: {
      words: ['poziadavky', 'dokumenty', 'ziadost', 'informacie', 'a', 'v', 'na', 'je', 'sa', 'z', 'do', 'to', 'ze', 'pre', 's', 'o', 'ako', 'co', 'po', 'ale', 'alebo', 'od', 'tak', 'su'],
      weight: 1,
    },
    hu: {
      words: ['kovetelmenyek', 'dokumentumok', 'kerelem', 'informacio', 'a', 'az', 'es', 'hogy', 'nem', 'van', 'ez', 'egy', 'meg', 'is', 'de', 'csak', 'vagy', 'mar', 'mint', 'akkor', 'mi', 'azt', 'volt', 'kell'],
      weight: 1,
    },
    ro: {
      words: ['cerinte', 'documente', 'cerere', 'informatii', 'si', 'in', 'de', 'la', 'pe', 'cu', 'ca', 'nu', 'este', 'a', 'un', 'o', 'se', 'mai', 'care', 'pentru', 'din', 'sau', 'sunt', 'sa', 'cel'],
      weight: 1,
    },
    bg: {
      words: ['iziskvaniya', 'dokumenti', 'zayavlenie', 'informatsiya', 'i', 'v', 'na', 'e', 'za', 's', 'ot', 'se', 'da', 'ne', 'sa', 'po', 'tova', 'kato', 'ili', 'pri', 'ot'],
      weight: 1,
    },
    hr: {
      words: ['zahtjevi', 'dokumenti', 'zahtjev', 'informacije', 'i', 'u', 'na', 'je', 'se', 'za', 's', 'od', 'da', 'ne', 'su', 'po', 'to', 'kao', 'ili', 'pri', 'biti'],
      weight: 1,
    },
    sl: {
      words: ['zahteve', 'dokumenti', 'vloga', 'informacije', 'in', 'v', 'na', 'je', 'se', 'za', 's', 'od', 'da', 'ne', 'so', 'po', 'to', 'kot', 'ali', 'pri', 'biti'],
      weight: 1,
    },
    sr: {
      words: ['zahtevi', 'dokumenti', 'zahtev', 'informacije', 'i', 'u', 'na', 'je', 'se', 'za', 's', 'od', 'da', 'ne', 'su', 'po', 'to', 'kao', 'ili', 'pri', 'biti'],
      weight: 1,
    },
    uk: {
      words: ['vymogy', 'dokumenty', 'zayava', 'informatsiya', 'i', 'v', 'na', 'ye', 'z', 'za', 'do', 'ne', 'shcho', 'yak', 'abo', 'ale', 'tse', 'vid', 'tak', 'bulo'],
      weight: 1,
    },
    ru: {
      words: ['trebovaniya', 'dokumenty', 'zayavka', 'informatsiya', 'i', 'v', 'na', 'c', 'po', 'za', 'ne', 'chto', 'kak', 'eto', 'no', 'iz', 'ili', 'tak', 'vse', 'on', 'bylo', 'dlya', 'tot'],
      weight: 1,
    },
    // Baltic
    lt: {
      words: ['reikalavimai', 'dokumentai', 'prasymas', 'informacija', 'ir', 'i', 'is', 'kad', 'tai', 'yra', 'su', 'ar', 'bet', 'kaip', 'jei', 'buvo', 'del', 'tik', 'po', 'nuo'],
      weight: 1,
    },
    lv: {
      words: ['prasibas', 'dokumenti', 'pieteikums', 'informacija', 'un', 'ir', 'ka', 'ar', 'uz', 'no', 'par', 'bet', 'vai', 'ja', 'ta', 'kas', 'pie', 'lai', 'tikai'],
      weight: 1,
    },
    et: {
      words: ['noudmised', 'dokumendid', 'taotlus', 'informatsioon', 'ja', 'on', 'ei', 'et', 'see', 'ka', 'kui', 'aga', 'mis', 'voi', 'nii', 'siis', 'oma', 'veel', 'seda'],
      weight: 1,
    },
    // Indonesian/Malay
    id: {
      words: ['persyaratan', 'dokumen', 'permohonan', 'informasi', 'dan', 'yang', 'di', 'ini', 'untuk', 'dengan', 'dari', 'pada', 'adalah', 'tidak', 'atau', 'oleh', 'juga', 'akan', 'ke', 'dapat', 'dalam'],
      weight: 1,
    },
    ms: {
      words: ['keperluan', 'dokumen', 'permohonan', 'maklumat', 'dan', 'yang', 'di', 'ini', 'untuk', 'dengan', 'dari', 'pada', 'adalah', 'tidak', 'atau', 'oleh', 'juga', 'akan', 'ke', 'boleh', 'dalam'],
      weight: 1,
    },
    // Vietnamese (romanized)
    vi: {
      words: ['yeucau', 'tailieu', 'dondangky', 'thongtin', 'va', 'cua', 'trong', 'co', 'la', 'khong', 'den', 'cho', 'duoc', 'nhu', 'voi', 'cac', 'se', 'thi', 'da', 'bang'],
      weight: 1,
    },
    // Tagalog/Filipino
    tl: {
      words: ['kinakailangan', 'dokumento', 'aplikasyon', 'impormasyon', 'ang', 'ng', 'sa', 'na', 'at', 'ay', 'mga', 'ito', 'para', 'kung', 'may', 'hindi', 'nang', 'siya', 'pero', 'kami'],
      weight: 1,
    },
    // Turkish
    tr: {
      words: ['gereksinimler', 'belgeler', 'basvuru', 'bilgi', 've', 'bir', 'bu', 'icin', 'de', 'ile', 'da', 'ne', 'ama', 'var', 'mi', 'ya', 'ki', 'olarak', 'olan', 'daha', 'cok'],
      weight: 1,
    },
    // Greek (romanized)
    el: {
      words: ['apaitiseis', 'engrafa', 'aitisi', 'plirofories', 'kai', 'to', 'na', 'sto', 'me', 'gia', 'apo', 'se', 'einai', 'den', 'tha', 'ta', 'pos', 'otan', 'auto'],
      weight: 1,
    },
    // English (default fallback)
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
 * Detect language from character scripts (CJK, Arabic, Hebrew, Thai, etc.)
 * This is more reliable than stopword detection for non-Latin scripts
 */
function detectLanguageFromScript(text: string): { language: string; confidence: number } | null {
  // Count characters in different scripts
  const scriptCounts: Record<string, number> = {
    cjk: 0,      // Chinese, Japanese Kanji, Korean Hanja
    hiragana: 0, // Japanese
    katakana: 0, // Japanese
    hangul: 0,   // Korean
    arabic: 0,   // Arabic, Persian, Urdu
    hebrew: 0,   // Hebrew
    thai: 0,     // Thai
    devanagari: 0, // Hindi, Sanskrit, Marathi
    bengali: 0,  // Bengali, Assamese
    tamil: 0,    // Tamil
    cyrillic: 0, // Russian, Ukrainian, Bulgarian, Serbian
    greek: 0,    // Greek
  };

  for (const char of text) {
    const code = char.charCodeAt(0);

    // CJK Unified Ideographs
    if ((code >= 0x4E00 && code <= 0x9FFF) ||
        (code >= 0x3400 && code <= 0x4DBF) ||
        (code >= 0x20000 && code <= 0x2A6DF)) {
      scriptCounts.cjk++;
    }
    // Japanese Hiragana
    else if (code >= 0x3040 && code <= 0x309F) {
      scriptCounts.hiragana++;
    }
    // Japanese Katakana
    else if (code >= 0x30A0 && code <= 0x30FF) {
      scriptCounts.katakana++;
    }
    // Korean Hangul
    else if ((code >= 0xAC00 && code <= 0xD7AF) ||
             (code >= 0x1100 && code <= 0x11FF)) {
      scriptCounts.hangul++;
    }
    // Arabic script
    else if ((code >= 0x0600 && code <= 0x06FF) ||
             (code >= 0x0750 && code <= 0x077F) ||
             (code >= 0xFB50 && code <= 0xFDFF)) {
      scriptCounts.arabic++;
    }
    // Hebrew script
    else if (code >= 0x0590 && code <= 0x05FF) {
      scriptCounts.hebrew++;
    }
    // Thai script
    else if (code >= 0x0E00 && code <= 0x0E7F) {
      scriptCounts.thai++;
    }
    // Devanagari (Hindi, Sanskrit)
    else if (code >= 0x0900 && code <= 0x097F) {
      scriptCounts.devanagari++;
    }
    // Bengali
    else if (code >= 0x0980 && code <= 0x09FF) {
      scriptCounts.bengali++;
    }
    // Tamil
    else if (code >= 0x0B80 && code <= 0x0BFF) {
      scriptCounts.tamil++;
    }
    // Cyrillic
    else if ((code >= 0x0400 && code <= 0x04FF) ||
             (code >= 0x0500 && code <= 0x052F)) {
      scriptCounts.cyrillic++;
    }
    // Greek
    else if (code >= 0x0370 && code <= 0x03FF) {
      scriptCounts.greek++;
    }
  }

  // Find dominant script
  let maxScript = '';
  let maxCount = 0;
  const totalNonLatin = Object.values(scriptCounts).reduce((a, b) => a + b, 0);

  for (const [script, count] of Object.entries(scriptCounts)) {
    if (count > maxCount) {
      maxCount = count;
      maxScript = script;
    }
  }

  // Need significant non-Latin characters
  if (maxCount < 10 || maxCount / text.length < 0.05) {
    return null;
  }

  // Map scripts to languages
  let language: string;
  switch (maxScript) {
    case 'hangul':
      language = 'ko';
      break;
    case 'hiragana':
    case 'katakana':
      language = 'ja';
      break;
    case 'cjk':
      // CJK could be Chinese, Japanese, or Korean - need more context
      // Default to Chinese if no Japanese kana or Korean hangul
      if (scriptCounts.hiragana > 0 || scriptCounts.katakana > 0) {
        language = 'ja';
      } else if (scriptCounts.hangul > 0) {
        language = 'ko';
      } else {
        language = 'zh';
      }
      break;
    case 'arabic':
      // Could be Arabic, Persian (Farsi), or Urdu
      // Default to Arabic
      language = 'ar';
      break;
    case 'hebrew':
      language = 'he';
      break;
    case 'thai':
      language = 'th';
      break;
    case 'devanagari':
      language = 'hi';
      break;
    case 'bengali':
      language = 'bn';
      break;
    case 'tamil':
      language = 'ta';
      break;
    case 'cyrillic':
      // Could be Russian, Ukrainian, Bulgarian, etc.
      // Default to Russian as most common
      language = 'ru';
      break;
    case 'greek':
      language = 'el';
      break;
    default:
      return null;
  }

  // Higher confidence for script-based detection
  const confidence = Math.min(0.85, 0.6 + (maxCount / text.length) * 0.5);

  return { language, confidence };
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
 *
 * Supported languages (40+):
 * - Western European: en, es, pt, de, fr, it, nl
 * - Nordic: sv, no, da, fi, is
 * - Eastern European: pl, cs, sk, hu, ro, bg, hr, sl, sr, uk, ru, be
 * - Baltic: lt, lv, et
 * - Asian: zh, ja, ko, vi, th, id, ms, tl
 * - Middle Eastern: ar, he, tr, fa
 * - South Asian: hi, bn, ta
 * - Greek: el
 */
export const FIELD_TRANSLATIONS: Record<FieldCategory, Record<string, string[]>> = {
  title: {
    // Western European
    en: ['title', 'name', 'heading'],
    es: ['titulo', 'nombre', 'encabezado'],
    pt: ['titulo', 'nome', 'cabecalho'],
    de: ['titel', 'name', 'uberschrift'],
    fr: ['titre', 'nom', 'en-tete'],
    it: ['titolo', 'nome', 'intestazione'],
    nl: ['titel', 'naam', 'kop'],
    // Nordic
    sv: ['titel', 'namn', 'rubrik'],
    no: ['tittel', 'navn', 'overskrift'],
    da: ['titel', 'navn', 'overskrift'],
    fi: ['otsikko', 'nimi', 'otsake'],
    is: ['titill', 'nafn', 'fyrirsogn'],
    // Eastern European
    pl: ['tytul', 'nazwa', 'naglowek'],
    cs: ['nazev', 'jmeno', 'nadpis'],
    sk: ['nazov', 'meno', 'nadpis'],
    hu: ['cim', 'nev', 'fejlec'],
    ro: ['titlu', 'nume', 'antet'],
    bg: ['zaglavie', 'ime', 'naslov'],
    hr: ['naslov', 'ime', 'zaglavlje'],
    sl: ['naslov', 'ime', 'glava'],
    sr: ['naslov', 'ime', 'zaglavlje'],
    uk: ['nazva', 'imya', 'zagolovok'],
    ru: ['nazvanie', 'imya', 'zagolovok'],
    be: ['nazva', 'imya', 'zagalovak'],
    // Baltic
    lt: ['pavadinimas', 'vardas', 'antraste'],
    lv: ['nosaukums', 'vards', 'virsraksts'],
    et: ['pealkiri', 'nimi', 'pealkiri'],
    // Asian
    zh: ['biaoti', 'mingcheng', 'title'],
    ja: ['taitoru', 'namae', 'midashi'],
    ko: ['jemok', 'ireum', 'pyoje'],
    vi: ['tieude', 'ten', 'dautrang'],
    th: ['huakho', 'chue', 'khamnam'],
    id: ['judul', 'nama', 'kepala'],
    ms: ['tajuk', 'nama', 'kepala'],
    tl: ['pamagat', 'pangalan', 'titulo'],
    // Middle Eastern
    ar: ['unwan', 'ism', 'raas'],
    he: ['koter', 'shem', 'rashit'],
    tr: ['baslik', 'isim', 'ad'],
    fa: ['onvan', 'nam', 'sar'],
    // South Asian
    hi: ['sheersk', 'naam', 'shirshak'],
    bn: ['shirshanama', 'naam', 'shirsha'],
    ta: ['talaippu', 'peyar', 'talaikuri'],
    // Greek
    el: ['titlos', 'onoma', 'kefali'],
  },
  description: {
    // Western European
    en: ['description', 'desc', 'summary', 'about'],
    es: ['descripcion', 'resumen', 'acerca'],
    pt: ['descricao', 'resumo', 'sobre'],
    de: ['beschreibung', 'zusammenfassung', 'uber'],
    fr: ['description', 'resume', 'apropos'],
    it: ['descrizione', 'sommario', 'info'],
    nl: ['beschrijving', 'samenvatting', 'over'],
    // Nordic
    sv: ['beskrivning', 'sammanfattning', 'om'],
    no: ['beskrivelse', 'sammendrag', 'om'],
    da: ['beskrivelse', 'resume', 'om'],
    fi: ['kuvaus', 'yhteenveto', 'tietoja'],
    is: ['lysing', 'samantekt', 'um'],
    // Eastern European
    pl: ['opis', 'streszczenie', 'o'],
    cs: ['popis', 'souhrn', 'o'],
    sk: ['popis', 'zhrnutie', 'o'],
    hu: ['leiras', 'osszefoglalas', 'rolunk'],
    ro: ['descriere', 'rezumat', 'despre'],
    bg: ['opisanie', 'rezume', 'za'],
    hr: ['opis', 'sazetak', 'o'],
    sl: ['opis', 'povzetek', 'o'],
    sr: ['opis', 'sazetak', 'o'],
    uk: ['opys', 'rezyume', 'pro'],
    ru: ['opisanie', 'rezyume', 'o'],
    be: ['apysanne', 'rezyume', 'pra'],
    // Baltic
    lt: ['aprasymas', 'santrauka', 'apie'],
    lv: ['apraksts', 'kopsavilkums', 'par'],
    et: ['kirjeldus', 'kokkuvote', 'meist'],
    // Asian
    zh: ['miaoshu', 'jianjie', 'guanyu'],
    ja: ['setsumei', 'gaiyou', 'nitsuite'],
    ko: ['seolmyeong', 'yoyak', 'soge'],
    vi: ['mota', 'tomtat', 've'],
    th: ['khamathip', 'sarup', 'kiaokap'],
    id: ['deskripsi', 'ringkasan', 'tentang'],
    ms: ['penerangan', 'ringkasan', 'tentang'],
    tl: ['paglalarawan', 'buod', 'tungkol'],
    // Middle Eastern
    ar: ['wasf', 'mulakhas', 'hawl'],
    he: ['teur', 'sikum', 'odot'],
    tr: ['aciklama', 'ozet', 'hakkinda'],
    fa: ['sharh', 'kholase', 'darbare'],
    // South Asian
    hi: ['vivaran', 'saransh', 'ke_bare_mein'],
    bn: ['bibaran', 'sarasangraha', 'somporkito'],
    ta: ['vivarippu', 'churukkam', 'patri'],
    // Greek
    el: ['perigrafi', 'perilipsi', 'shetika'],
  },
  body: {
    // Western European
    en: ['body', 'content', 'text', 'article'],
    es: ['cuerpo', 'contenido', 'texto', 'articulo'],
    pt: ['corpo', 'conteudo', 'texto', 'artigo'],
    de: ['inhalt', 'text', 'artikel', 'korper'],
    fr: ['corps', 'contenu', 'texte', 'article'],
    it: ['corpo', 'contenuto', 'testo', 'articolo'],
    nl: ['inhoud', 'tekst', 'artikel', 'lichaam'],
    // Nordic
    sv: ['kropp', 'innehall', 'text', 'artikel'],
    no: ['kropp', 'innhold', 'tekst', 'artikkel'],
    da: ['krop', 'indhold', 'tekst', 'artikel'],
    fi: ['runko', 'sisalto', 'teksti', 'artikkeli'],
    is: ['bolur', 'efni', 'texti', 'grein'],
    // Eastern European
    pl: ['tresc', 'zawartosc', 'tekst', 'artykul'],
    cs: ['obsah', 'text', 'clanek', 'telo'],
    sk: ['obsah', 'text', 'clanok', 'telo'],
    hu: ['torzs', 'tartalom', 'szoveg', 'cikk'],
    ro: ['corp', 'continut', 'text', 'articol'],
    bg: ['tqlo', 'sadarzhanie', 'tekst', 'statiq'],
    hr: ['tijelo', 'sadrzaj', 'tekst', 'clanak'],
    sl: ['telo', 'vsebina', 'besedilo', 'clanek'],
    sr: ['telo', 'sadrzaj', 'tekst', 'clanak'],
    uk: ['tilo', 'vmist', 'tekst', 'stattya'],
    ru: ['telo', 'soderzhanie', 'tekst', 'statya'],
    be: ['cela', 'zmest', 'tekst', 'artykul'],
    // Baltic
    lt: ['tekstas', 'turinys', 'straipsnis'],
    lv: ['teksts', 'saturs', 'raksts'],
    et: ['keha', 'sisu', 'tekst', 'artikkel'],
    // Asian
    zh: ['zhengwen', 'neirong', 'wenben'],
    ja: ['honbun', 'naiyou', 'tekisuto'],
    ko: ['bonmun', 'naeyong', 'tekst'],
    vi: ['noidung', 'vanban', 'baiviet'],
    th: ['nuea', 'nueha', 'khwam'],
    id: ['isi', 'konten', 'teks', 'artikel'],
    ms: ['kandungan', 'teks', 'artikel'],
    tl: ['katawan', 'nilalaman', 'teksto'],
    // Middle Eastern
    ar: ['matn', 'muhtawa', 'nass', 'maqal'],
    he: ['guf', 'tokhen', 'mamar'],
    tr: ['govde', 'icerik', 'metin', 'makale'],
    fa: ['matn', 'mohtava', 'maghale'],
    // South Asian
    hi: ['vishay', 'samgri', 'paath', 'lekh'],
    bn: ['mulatam', 'sarbodho', 'potro'],
    ta: ['udal', 'porul', 'katturai'],
    // Greek
    el: ['soma', 'periehomeno', 'keimeno', 'arthro'],
  },
  requirements: {
    // Western European
    en: ['requirements', 'required', 'prerequisites', 'conditions'],
    es: ['requisitos', 'requerimientos', 'condiciones', 'necesarios'],
    pt: ['requisitos', 'requerimentos', 'condicoes', 'necessarios'],
    de: ['anforderungen', 'voraussetzungen', 'bedingungen', 'erforderlich'],
    fr: ['exigences', 'conditions', 'prerequis', 'necessaires'],
    it: ['requisiti', 'condizioni', 'prerequisiti', 'necessari'],
    nl: ['vereisten', 'voorwaarden', 'condities', 'nodig'],
    // Nordic
    sv: ['krav', 'forutsattningar', 'villkor'],
    no: ['krav', 'forutsetninger', 'vilkar'],
    da: ['krav', 'forudsaetninger', 'betingelser'],
    fi: ['vaatimukset', 'edellytykset', 'ehdot'],
    is: ['krofur', 'skilyrdi', 'forsendur'],
    // Eastern European
    pl: ['wymagania', 'warunki', 'wymogi'],
    cs: ['pozadavky', 'predpoklady', 'podminky'],
    sk: ['poziadavky', 'predpoklady', 'podmienky'],
    hu: ['kovetelmenyek', 'feltetelei', 'szukseges'],
    ro: ['cerinte', 'conditii', 'necesare'],
    bg: ['iziskvaniq', 'usloviq', 'neobhodimi'],
    hr: ['zahtjevi', 'uvjeti', 'preduvjeti'],
    sl: ['zahteve', 'pogoji', 'potrebno'],
    sr: ['zahtevi', 'uslovi', 'preduslovi'],
    uk: ['vymogy', 'umovy', 'neobkhidne'],
    ru: ['trebovaniya', 'usloviya', 'neobhodimoe'],
    be: ['patrabavanni', 'umovy', 'neabhodna'],
    // Baltic
    lt: ['reikalavimai', 'salygos', 'butina'],
    lv: ['prasibas', 'nosacijumi', 'nepieciesams'],
    et: ['noudmised', 'tingimused', 'vajalik'],
    // Asian
    zh: ['yaoqiu', 'tiaojian', 'biyao'],
    ja: ['youken', 'jouken', 'hitsuyou'],
    ko: ['yogeon', 'jogeon', 'pilyo'],
    vi: ['yeucau', 'dieukien', 'canthiet'],
    th: ['khwamtongkan', 'nguenkhai'],
    id: ['persyaratan', 'ketentuan', 'syarat'],
    ms: ['keperluan', 'syarat', 'kelayakan'],
    tl: ['kinakailangan', 'kondisyon', 'pangangailangan'],
    // Middle Eastern
    ar: ['mutatalabat', 'shurut', 'matalabat'],
    he: ['drisot', 'tnaim', 'darush'],
    tr: ['gereksinimler', 'kosullar', 'sartlar'],
    fa: ['niazha', 'sharait', 'elzami'],
    // South Asian
    hi: ['aavashyakataayen', 'shartein', 'apekshit'],
    bn: ['proyojoniyota', 'sart', 'dorkari'],
    ta: ['thedaikal', 'nibanathanaikal'],
    // Greek
    el: ['apaitiseis', 'proapaitoumena', 'oroi'],
  },
  documents: {
    // Western European
    en: ['documents', 'documentation', 'files', 'papers'],
    es: ['documentos', 'documentacion', 'archivos', 'papeles'],
    pt: ['documentos', 'documentacao', 'arquivos', 'papeis'],
    de: ['dokumente', 'dokumentation', 'unterlagen', 'papiere'],
    fr: ['documents', 'documentation', 'fichiers', 'papiers'],
    it: ['documenti', 'documentazione', 'file', 'carte'],
    nl: ['documenten', 'documentatie', 'bestanden', 'papieren'],
    // Nordic
    sv: ['dokument', 'dokumentation', 'filer', 'papper'],
    no: ['dokumenter', 'dokumentasjon', 'filer', 'papirer'],
    da: ['dokumenter', 'dokumentation', 'filer', 'papirer'],
    fi: ['asiakirjat', 'dokumentaatio', 'tiedostot'],
    is: ['skjol', 'skjolun', 'skrar'],
    // Eastern European
    pl: ['dokumenty', 'dokumentacja', 'pliki', 'papiery'],
    cs: ['dokumenty', 'dokumentace', 'soubory', 'papiry'],
    sk: ['dokumenty', 'dokumentacia', 'subory', 'papiere'],
    hu: ['dokumentumok', 'dokumentacio', 'fajlok'],
    ro: ['documente', 'documentatie', 'fisiere', 'acte'],
    bg: ['dokumenti', 'dokumentaciq', 'faylove'],
    hr: ['dokumenti', 'dokumentacija', 'datoteke', 'papiri'],
    sl: ['dokumenti', 'dokumentacija', 'datoteke'],
    sr: ['dokumenti', 'dokumentacija', 'datoteke', 'papiri'],
    uk: ['dokumenty', 'dokumentatsiya', 'fayly', 'papery'],
    ru: ['dokumenty', 'dokumentatsiya', 'fayly', 'bumagi'],
    be: ['dakumenty', 'dakumentatyya', 'fayly'],
    // Baltic
    lt: ['dokumentai', 'dokumentacija', 'failai'],
    lv: ['dokumenti', 'dokumentacija', 'faili'],
    et: ['dokumendid', 'dokumentatsioon', 'failid'],
    // Asian
    zh: ['wenjian', 'wendang', 'ziliao'],
    ja: ['shorui', 'bunsho', 'fairu'],
    ko: ['seoryu', 'munseo', 'pail'],
    vi: ['taily', 'hosow', 'vanban'],
    th: ['ekasan', 'ekasarn'],
    id: ['dokumen', 'dokumentasi', 'berkas'],
    ms: ['dokumen', 'dokumentasi', 'fail'],
    tl: ['dokumento', 'papeles', 'talaan'],
    // Middle Eastern
    ar: ['wathaeq', 'tawthiq', 'malfat', 'awraq'],
    he: ['mismakhim', 'tiud', 'kvatim'],
    tr: ['belgeler', 'dokumantasyon', 'dosyalar', 'evraklar'],
    fa: ['madarek', 'asnad', 'parvande'],
    // South Asian
    hi: ['dastavez', 'dastavezon', 'kaagaz'],
    bn: ['dolilpotro', 'dokumenta', 'kagojpotro'],
    ta: ['asavangal', 'avanangal'],
    // Greek
    el: ['engrafa', 'tekmiriosi', 'arxeia'],
  },
  fees: {
    // Western European
    en: ['fees', 'fee', 'cost', 'costs', 'price', 'pricing', 'charges'],
    es: ['tasas', 'tasa', 'tarifa', 'tarifas', 'costo', 'costos', 'precio', 'precios'],
    pt: ['taxas', 'taxa', 'tarifa', 'tarifas', 'custo', 'custos', 'preco', 'precos'],
    de: ['gebuhren', 'gebuhr', 'kosten', 'preis', 'preise'],
    fr: ['frais', 'cout', 'couts', 'tarif', 'tarifs', 'prix'],
    it: ['tasse', 'costo', 'costi', 'tariffa', 'tariffe', 'prezzo', 'prezzi'],
    nl: ['kosten', 'prijs', 'prijzen', 'tarief', 'tarieven'],
    // Nordic
    sv: ['avgifter', 'kostnad', 'pris'],
    no: ['avgifter', 'gebyr', 'kostnad', 'pris'],
    da: ['gebyrer', 'omkostninger', 'pris'],
    fi: ['maksut', 'kustannukset', 'hinta'],
    is: ['gjold', 'kostnadur', 'verd'],
    // Eastern European
    pl: ['oplaty', 'koszt', 'koszty', 'cena'],
    cs: ['poplatky', 'naklady', 'cena'],
    sk: ['poplatky', 'naklady', 'cena'],
    hu: ['dijak', 'koltsegek', 'ar'],
    ro: ['taxe', 'costuri', 'pret'],
    bg: ['taksi', 'razhodi', 'cena'],
    hr: ['naknade', 'troskovi', 'cijena'],
    sl: ['pristojbine', 'stroski', 'cena'],
    sr: ['takse', 'troskovi', 'cena'],
    uk: ['zbory', 'vytraty', 'tsina'],
    ru: ['sbory', 'raskhody', 'stoimost', 'tsena'],
    be: ['zbory', 'vytraty', 'koshty'],
    // Baltic
    lt: ['mokesciai', 'kaina', 'islaidos'],
    lv: ['nodevas', 'maksa', 'izmaksas'],
    et: ['tasud', 'maksud', 'hind', 'kulud'],
    // Asian
    zh: ['feiyong', 'jiage', 'shoufei'],
    ja: ['ryoukin', 'hiyou', 'kakaku'],
    ko: ['yogeum', 'biyong', 'gagyeok'],
    vi: ['phi', 'chiphi', 'gia'],
    th: ['khakhai', 'khabarika', 'raka'],
    id: ['biaya', 'tarif', 'harga'],
    ms: ['bayaran', 'kos', 'harga'],
    tl: ['bayad', 'halaga', 'presyo'],
    // Middle Eastern
    ar: ['rusum', 'taklufa', 'siar'],
    he: ['agrot', 'mehir', 'avur'],
    tr: ['ucretler', 'masraflar', 'fiyat'],
    fa: ['hazine', 'gheymat', 'tarefe'],
    // South Asian
    hi: ['shulk', 'lagat', 'daam'],
    bn: ['sulka', 'khoroch', 'dam'],
    ta: ['kattanam', 'selavu', 'vilai'],
    // Greek
    el: ['teli', 'kostous', 'timi'],
  },
  timeline: {
    // Western European
    en: ['timeline', 'duration', 'processing', 'time', 'period'],
    es: ['plazo', 'duracion', 'tiempo', 'periodo', 'tramitacion'],
    pt: ['prazo', 'duracao', 'tempo', 'periodo', 'tramitacao'],
    de: ['frist', 'dauer', 'zeitraum', 'bearbeitungszeit'],
    fr: ['delai', 'duree', 'temps', 'periode', 'traitement'],
    it: ['scadenza', 'durata', 'tempo', 'periodo', 'elaborazione'],
    nl: ['termijn', 'duur', 'tijd', 'periode', 'verwerking'],
    // Nordic
    sv: ['tidslinje', 'varaktighet', 'tid', 'period'],
    no: ['tidslinje', 'varighet', 'tid', 'periode'],
    da: ['tidslinje', 'varighed', 'tid', 'periode'],
    fi: ['aikajana', 'kesto', 'aika', 'kausi'],
    is: ['timalina', 'lengd', 'timi', 'timabil'],
    // Eastern European
    pl: ['harmonogram', 'czas', 'okres', 'termin'],
    cs: ['casovy_plan', 'trvani', 'cas', 'obdobi'],
    sk: ['casovy_plan', 'trvanie', 'cas', 'obdobie'],
    hu: ['idovonal', 'idotartam', 'ido', 'idoszak'],
    ro: ['cronologie', 'durata', 'timp', 'perioada'],
    bg: ['vremeva_liniq', 'prodlzhitelnost', 'vreme', 'period'],
    hr: ['vremenski_okvir', 'trajanje', 'vrijeme', 'razdoblje'],
    sl: ['casovnica', 'trajanje', 'cas', 'obdobje'],
    sr: ['vremenska_linija', 'trajanje', 'vreme', 'period'],
    uk: ['chasova_shkala', 'tryvalist', 'chas', 'period'],
    ru: ['srok', 'dlitelnost', 'vremya', 'period'],
    be: ['termin', 'tryvanne', 'chas', 'peryyad'],
    // Baltic
    lt: ['terminas', 'trukme', 'laikas', 'laikotarpis'],
    lv: ['grafiks', 'ilgums', 'laiks', 'periods'],
    et: ['ajajoon', 'kestus', 'aeg', 'periood'],
    // Asian
    zh: ['shijian', 'qixian', 'qijian', 'shiduan'],
    ja: ['kikan', 'jikan', 'shorijiukn'],
    ko: ['gigan', 'sigan', 'cheoriseogan'],
    vi: ['thoigian', 'thoihan', 'kythan'],
    th: ['ralawela', 'chuangwela'],
    id: ['jadwal', 'durasi', 'waktu', 'periode'],
    ms: ['garis_masa', 'tempoh', 'masa'],
    tl: ['timeline', 'tagal', 'panahon'],
    // Middle Eastern
    ar: ['jadwal_zamani', 'mudda', 'waqt', 'fatra'],
    he: ['luh_zmanim', 'meshekh', 'zman', 'tkufa'],
    tr: ['zaman_cizelgesi', 'sure', 'zaman', 'donem'],
    fa: ['zamanband', 'modat', 'zaman', 'doreh'],
    // South Asian
    hi: ['samayrekha', 'avadhi', 'samay', 'kaal'],
    bn: ['somoyrekha', 'meyadkal', 'somoy'],
    ta: ['kalaakattam', 'kalaveli', 'neram'],
    // Greek
    el: ['xronodiagranna', 'diarkeia', 'xronos', 'periodos'],
  },
  application: {
    // Western European
    en: ['application', 'apply', 'request', 'form', 'submission'],
    es: ['solicitud', 'aplicacion', 'peticion', 'formulario', 'tramite'],
    pt: ['solicitacao', 'aplicacao', 'pedido', 'formulario', 'requerimento'],
    de: ['antrag', 'anwendung', 'anfrage', 'formular', 'einreichung'],
    fr: ['demande', 'application', 'requete', 'formulaire', 'soumission'],
    it: ['domanda', 'applicazione', 'richiesta', 'modulo', 'presentazione'],
    nl: ['aanvraag', 'applicatie', 'verzoek', 'formulier', 'indiening'],
    // Nordic
    sv: ['ansokan', 'begaran', 'formular'],
    no: ['soknad', 'forespdrsel', 'skjema'],
    da: ['ansdgning', 'anmodning', 'formular'],
    fi: ['hakemus', 'pyynto', 'lomake'],
    is: ['umsokn', 'beidni', 'eydublad'],
    // Eastern European
    pl: ['wniosek', 'zgloszenie', 'formularz'],
    cs: ['zadost', 'prihlaska', 'formular'],
    sk: ['ziadost', 'prihlaska', 'formular'],
    hu: ['palyazat', 'kerelem', 'urlap'],
    ro: ['cerere', 'aplicatie', 'formular'],
    bg: ['zayavlenie', 'molba', 'formular'],
    hr: ['zahtjev', 'prijava', 'obrazac'],
    sl: ['prijava', 'vloga', 'obrazec'],
    sr: ['prijava', 'zahtev', 'obrazac'],
    uk: ['zayava', 'zvernennya', 'forma'],
    ru: ['zayavka', 'zayavlenie', 'forma', 'anketa'],
    be: ['zayava', 'blank', 'forma'],
    // Baltic
    lt: ['paraisku', 'prasymas', 'forma'],
    lv: ['pieteikums', 'iesniegums', 'veidlapa'],
    et: ['taotlus', 'avaldus', 'vorm'],
    // Asian
    zh: ['shenqing', 'biaoge', 'tijiao'],
    ja: ['shinsei', 'oubo', 'teishutsu'],
    ko: ['sinchung', 'jiwon', 'jechul'],
    vi: ['dondangky', 'yeucau', 'biurmau'],
    th: ['baikamron', 'khokam', 'baibamrong'],
    id: ['permohonan', 'aplikasi', 'formulir'],
    ms: ['permohonan', 'borang', 'aplikasi'],
    tl: ['aplikasyon', 'kahilingan', 'porma'],
    // Middle Eastern
    ar: ['talab', 'tatbiq', 'istimara'],
    he: ['bakasha', 'tofes', 'hagasha'],
    tr: ['basvuru', 'talep', 'form'],
    fa: ['darkhast', 'form', 'takhasir'],
    // South Asian
    hi: ['aavedan', 'prarthana', 'form'],
    bn: ['abedon', 'darkhasta', 'form'],
    ta: ['virnnapam', 'maruvu', 'padivam'],
    // Greek
    el: ['aitisi', 'entipo', 'ipovoli'],
  },
  status: {
    // Western European
    en: ['status', 'state', 'situation', 'condition'],
    es: ['estado', 'situacion', 'condicion'],
    pt: ['estado', 'situacao', 'condicao'],
    de: ['status', 'zustand', 'lage'],
    fr: ['statut', 'etat', 'situation', 'condition'],
    it: ['stato', 'situazione', 'condizione'],
    nl: ['status', 'staat', 'situatie', 'conditie'],
    // Nordic
    sv: ['status', 'tillstand', 'situation'],
    no: ['status', 'tilstand', 'situasjon'],
    da: ['status', 'tilstand', 'situation'],
    fi: ['tila', 'tilanne', 'asema'],
    is: ['stada', 'astand', 'adstaedur'],
    // Eastern European
    pl: ['status', 'stan', 'sytuacja'],
    cs: ['stav', 'status', 'situace'],
    sk: ['stav', 'status', 'situacia'],
    hu: ['allapot', 'helyzet', 'status'],
    ro: ['stare', 'status', 'situatie'],
    bg: ['sustoyanie', 'status', 'situaciq'],
    hr: ['status', 'stanje', 'situacija'],
    sl: ['status', 'stanje', 'situacija'],
    sr: ['status', 'stanje', 'situacija'],
    uk: ['status', 'stan', 'sytuatsiya'],
    ru: ['status', 'sostoyanie', 'situatsiya'],
    be: ['status', 'stan', 'sytuatsyya'],
    // Baltic
    lt: ['busena', 'statusas', 'padetis'],
    lv: ['statuss', 'stavoklis', 'situacija'],
    et: ['staatus', 'seisund', 'olukord'],
    // Asian
    zh: ['zhuangtai', 'qingkuang', 'zhuangkuang'],
    ja: ['joutai', 'joukyou', 'suteetasu'],
    ko: ['sangtae', 'hyeonhwang', 'status'],
    vi: ['trangthai', 'tinhtrang', 'status'],
    th: ['sathana', 'sathanakan'],
    id: ['status', 'keadaan', 'kondisi'],
    ms: ['status', 'keadaan', 'situasi'],
    tl: ['katayuan', 'kalagayan', 'estado'],
    // Middle Eastern
    ar: ['hala', 'wadea', 'mawqif'],
    he: ['matzav', 'status', 'mikum'],
    tr: ['durum', 'hal', 'status'],
    fa: ['vaziyat', 'halat', 'status'],
    // South Asian
    hi: ['sthiti', 'dasha', 'halat'],
    bn: ['obostha', 'status', 'halat'],
    ta: ['nilai', 'nilamai', 'status'],
    // Greek
    el: ['katastasi', 'thesi', 'status'],
  },
  contact: {
    // Western European
    en: ['contact', 'email', 'phone', 'telephone', 'address'],
    es: ['contacto', 'correo', 'telefono', 'direccion'],
    pt: ['contato', 'email', 'telefone', 'endereco'],
    de: ['kontakt', 'email', 'telefon', 'adresse'],
    fr: ['contact', 'email', 'telephone', 'adresse'],
    it: ['contatto', 'email', 'telefono', 'indirizzo'],
    nl: ['contact', 'email', 'telefoon', 'adres'],
    // Nordic
    sv: ['kontakt', 'epost', 'telefon', 'adress'],
    no: ['kontakt', 'epost', 'telefon', 'adresse'],
    da: ['kontakt', 'email', 'telefon', 'adresse'],
    fi: ['yhteystiedot', 'sahkoposti', 'puhelin', 'osoite'],
    is: ['samband', 'tolvupostur', 'simi', 'heimilisfang'],
    // Eastern European
    pl: ['kontakt', 'email', 'telefon', 'adres'],
    cs: ['kontakt', 'email', 'telefon', 'adresa'],
    sk: ['kontakt', 'email', 'telefon', 'adresa'],
    hu: ['kapcsolat', 'email', 'telefon', 'cim'],
    ro: ['contact', 'email', 'telefon', 'adresa'],
    bg: ['kontakt', 'imail', 'telefon', 'adres'],
    hr: ['kontakt', 'email', 'telefon', 'adresa'],
    sl: ['kontakt', 'email', 'telefon', 'naslov'],
    sr: ['kontakt', 'email', 'telefon', 'adresa'],
    uk: ['kontakt', 'email', 'telefon', 'adresa'],
    ru: ['kontakt', 'email', 'telefon', 'adres'],
    be: ['kantakt', 'email', 'telefon', 'adras'],
    // Baltic
    lt: ['kontaktai', 'el_pastas', 'telefonas', 'adresas'],
    lv: ['kontakti', 'epasts', 'talrunis', 'adrese'],
    et: ['kontakt', 'email', 'telefon', 'aadress'],
    // Asian
    zh: ['lianxi', 'youxiang', 'dianhua', 'dizhi'],
    ja: ['renraku', 'meeru', 'denwa', 'juusho'],
    ko: ['yeollak', 'imeil', 'jeonhwa', 'juso'],
    vi: ['lienhe', 'email', 'dienthoai', 'diachi'],
    th: ['tidto', 'email', 'thorasap', 'thiyu'],
    id: ['kontak', 'email', 'telepon', 'alamat'],
    ms: ['hubungi', 'email', 'telefon', 'alamat'],
    tl: ['makipag_ugnayan', 'email', 'telepono', 'tirahan'],
    // Middle Eastern
    ar: ['ittissal', 'barid_ilktruni', 'hatif', 'unwan'],
    he: ['kesher', 'email', 'telefon', 'ktovet'],
    tr: ['iletisim', 'eposta', 'telefon', 'adres'],
    fa: ['tamas', 'email', 'telefon', 'adres'],
    // South Asian
    hi: ['sampark', 'email', 'phone', 'pata'],
    bn: ['jogajog', 'email', 'fon', 'thikana'],
    ta: ['thodarpu', 'email', 'tholaipaesi', 'mukavarri'],
    // Greek
    el: ['epikoinonia', 'email', 'tilefono', 'diefthinsi'],
  },
  address: {
    // Western European
    en: ['address', 'location', 'office', 'place'],
    es: ['direccion', 'ubicacion', 'oficina', 'lugar'],
    pt: ['endereco', 'localizacao', 'escritorio', 'lugar'],
    de: ['adresse', 'standort', 'buro', 'ort'],
    fr: ['adresse', 'emplacement', 'bureau', 'lieu'],
    it: ['indirizzo', 'posizione', 'ufficio', 'luogo'],
    nl: ['adres', 'locatie', 'kantoor', 'plaats'],
    // Nordic
    sv: ['adress', 'plats', 'kontor'],
    no: ['adresse', 'sted', 'kontor'],
    da: ['adresse', 'sted', 'kontor'],
    fi: ['osoite', 'sijainti', 'toimisto', 'paikka'],
    is: ['heimilisfang', 'stadsetning', 'skrifstofa'],
    // Eastern European
    pl: ['adres', 'lokalizacja', 'biuro', 'miejsce'],
    cs: ['adresa', 'misto', 'kancelar'],
    sk: ['adresa', 'miesto', 'kancelaria'],
    hu: ['cim', 'hely', 'iroda'],
    ro: ['adresa', 'locatie', 'birou'],
    bg: ['adres', 'mestopolozhenie', 'ofis'],
    hr: ['adresa', 'lokacija', 'ured', 'mjesto'],
    sl: ['naslov', 'lokacija', 'pisarna', 'kraj'],
    sr: ['adresa', 'lokacija', 'kancelarija', 'mesto'],
    uk: ['adresa', 'mistse', 'ofis'],
    ru: ['adres', 'mesto', 'ofis'],
    be: ['adras', 'mests', 'ofis'],
    // Baltic
    lt: ['adresas', 'vieta', 'biuras'],
    lv: ['adrese', 'vieta', 'birojs'],
    et: ['aadress', 'asukoht', 'kontor', 'koht'],
    // Asian
    zh: ['dizhi', 'weizhi', 'bangongshi', 'difang'],
    ja: ['juusho', 'basho', 'ofisu'],
    ko: ['juso', 'wichi', 'samussil', 'jangso'],
    vi: ['diachi', 'vitri', 'vanphong'],
    th: ['thiyu', 'thingtii', 'samnakngan'],
    id: ['alamat', 'lokasi', 'kantor', 'tempat'],
    ms: ['alamat', 'lokasi', 'pejabat', 'tempat'],
    tl: ['tirahan', 'lokasyon', 'opisina', 'lugar'],
    // Middle Eastern
    ar: ['unwan', 'mawqia', 'maktab', 'makan'],
    he: ['ktovet', 'mikom', 'misrad', 'makom'],
    tr: ['adres', 'konum', 'ofis', 'yer'],
    fa: ['adres', 'makan', 'ofis', 'mahal'],
    // South Asian
    hi: ['pata', 'sthan', 'karyalaya'],
    bn: ['thikana', 'sthan', 'karyalay'],
    ta: ['mukavarri', 'idam', 'aluvalam'],
    // Greek
    el: ['diefthinsi', 'topothesia', 'grafeio', 'meros'],
  },
  date: {
    // Western European
    en: ['date', 'when', 'day'],
    es: ['fecha', 'cuando', 'dia'],
    pt: ['data', 'quando', 'dia'],
    de: ['datum', 'wann', 'tag'],
    fr: ['date', 'quand', 'jour'],
    it: ['data', 'quando', 'giorno'],
    nl: ['datum', 'wanneer', 'dag'],
    // Nordic
    sv: ['datum', 'nar', 'dag'],
    no: ['dato', 'nar', 'dag'],
    da: ['dato', 'hvorndr', 'dag'],
    fi: ['paivamaara', 'milloin', 'paiva'],
    is: ['dagsetning', 'hvenær', 'dagur'],
    // Eastern European
    pl: ['data', 'kiedy', 'dzien'],
    cs: ['datum', 'kdy', 'den'],
    sk: ['datum', 'kedy', 'den'],
    hu: ['datum', 'mikor', 'nap'],
    ro: ['data', 'cand', 'zi'],
    bg: ['data', 'koga', 'den'],
    hr: ['datum', 'kada', 'dan'],
    sl: ['datum', 'kdaj', 'dan'],
    sr: ['datum', 'kada', 'dan'],
    uk: ['data', 'koly', 'den'],
    ru: ['data', 'kogda', 'den'],
    be: ['data', 'kali', 'dzen'],
    // Baltic
    lt: ['data', 'kada', 'diena'],
    lv: ['datums', 'kad', 'diena'],
    et: ['kuupaev', 'millal', 'paev'],
    // Asian
    zh: ['riqi', 'shijian', 'ri'],
    ja: ['hiduke', 'itsu', 'hi'],
    ko: ['naljja', 'eonje', 'il'],
    vi: ['ngay', 'khiao', 'ngaythang'],
    th: ['wanthi', 'meua', 'wan'],
    id: ['tanggal', 'kapan', 'hari'],
    ms: ['tarikh', 'bila', 'hari'],
    tl: ['petsa', 'kailan', 'araw'],
    // Middle Eastern
    ar: ['tarikh', 'mata', 'yawm'],
    he: ['taarich', 'matai', 'yom'],
    tr: ['tarih', 'ne_zaman', 'gun'],
    fa: ['tarikh', 'key', 'ruz'],
    // South Asian
    hi: ['tarikh', 'kab', 'din'],
    bn: ['tarikh', 'kokhon', 'din'],
    ta: ['theti', 'eppothu', 'naal'],
    // Greek
    el: ['imerominia', 'pote', 'imera'],
  },
  deadline: {
    // Western European
    en: ['deadline', 'due', 'expiry', 'expires', 'limit'],
    es: ['fecha_limite', 'vencimiento', 'expira', 'limite'],
    pt: ['prazo_final', 'vencimento', 'expira', 'limite'],
    de: ['frist', 'fallig', 'ablauf', 'limit'],
    fr: ['date_limite', 'echeance', 'expire', 'limite'],
    it: ['scadenza', 'termine', 'scade', 'limite'],
    nl: ['deadline', 'vervaldatum', 'verloopt', 'limiet'],
    // Nordic
    sv: ['deadline', 'forfallodatum', 'sista_dag'],
    no: ['frist', 'forfall', 'utloper'],
    da: ['deadline', 'forfaldsdato', 'udlober'],
    fi: ['maaraaika', 'eraapaiva', 'viimeinen'],
    is: ['frestur', 'lokadagur', 'endir'],
    // Eastern European
    pl: ['termin', 'ostateczny', 'wygasa'],
    cs: ['uzaverka', 'termin', 'expiruje'],
    sk: ['termin', 'uzavierka', 'vyprsi'],
    hu: ['hatarido', 'lejar', 'esedekesseg'],
    ro: ['termen_limita', 'expira', 'scadenta'],
    bg: ['krai', 'srok', 'izticha'],
    hr: ['rok', 'istice', 'krajnji'],
    sl: ['rok', 'pretek', 'zapadlost'],
    sr: ['rok', 'istice', 'krajnji'],
    uk: ['termin', 'dednlayn', 'zakinchuyetsya'],
    ru: ['srok', 'dedlayn', 'istekaet'],
    be: ['termin', 'skonchvaetsya'],
    // Baltic
    lt: ['terminas', 'galutine_data', 'baigiasi'],
    lv: ['termin', 'beigu_datums', 'izbeidzas'],
    et: ['tahtaeg', 'aegub', 'lopptahtaeg'],
    // Asian
    zh: ['jiezhi', 'daoqi', 'qixian'],
    ja: ['shimekiri', 'kigen', 'kijitsu'],
    ko: ['magam', 'gihal', 'manryo'],
    vi: ['hanchot', 'hethan', 'thoihan'],
    th: ['kamnot', 'sinsut', 'dexlain'],
    id: ['batas_waktu', 'tenggat', 'berakhir'],
    ms: ['tarikh_akhir', 'tamat'],
    tl: ['deadline', 'huling_araw', 'takda'],
    // Middle Eastern
    ar: ['mawaid_nihaei', 'taarikh_intihaa', 'had'],
    he: ['moed_acharon', 'zman_yefuga', 'tokef'],
    tr: ['son_tarih', 'vade', 'bitis'],
    fa: ['mohlat', 'tarikh_payan', 'engheza'],
    // South Asian
    hi: ['antim_tithi', 'samay_seema', 'nirdharit'],
    bn: ['ses_tarikh', 'smoy_sima'],
    ta: ['kadaisi_naal', 'mudivu', 'varaiyadam'],
    // Greek
    el: ['prothesmia', 'lixi', 'orio'],
  },
  price: {
    // Western European
    en: ['price', 'cost', 'amount', 'total', 'value'],
    es: ['precio', 'costo', 'importe', 'total', 'valor'],
    pt: ['preco', 'custo', 'valor', 'total', 'quantia'],
    de: ['preis', 'kosten', 'betrag', 'gesamt', 'wert'],
    fr: ['prix', 'cout', 'montant', 'total', 'valeur'],
    it: ['prezzo', 'costo', 'importo', 'totale', 'valore'],
    nl: ['prijs', 'kosten', 'bedrag', 'totaal', 'waarde'],
    // Nordic
    sv: ['pris', 'kostnad', 'belopp', 'total', 'varde'],
    no: ['pris', 'kostnad', 'belop', 'total', 'verdi'],
    da: ['pris', 'omkostning', 'belob', 'total', 'vaerdi'],
    fi: ['hinta', 'kustannus', 'maara', 'yhteensa', 'arvo'],
    is: ['verd', 'kostnadur', 'upphæd', 'samtals'],
    // Eastern European
    pl: ['cena', 'koszt', 'kwota', 'suma', 'wartosc'],
    cs: ['cena', 'naklady', 'castka', 'celkem', 'hodnota'],
    sk: ['cena', 'naklady', 'suma', 'celkom', 'hodnota'],
    hu: ['ar', 'koltseg', 'osszeg', 'osszes', 'ertek'],
    ro: ['pret', 'cost', 'suma', 'total', 'valoare'],
    bg: ['cena', 'razhod', 'suma', 'obshto', 'stoynost'],
    hr: ['cijena', 'trosak', 'iznos', 'ukupno', 'vrijednost'],
    sl: ['cena', 'strosek', 'znesek', 'skupaj', 'vrednost'],
    sr: ['cena', 'trosak', 'iznos', 'ukupno', 'vrednost'],
    uk: ['tsina', 'vartist', 'suma', 'vsogo'],
    ru: ['tsena', 'stoimost', 'summa', 'itogo'],
    be: ['cana', 'koshty', 'suma', 'usyago'],
    // Baltic
    lt: ['kaina', 'islaidos', 'suma', 'viso', 'verte'],
    lv: ['cena', 'izmaksas', 'summa', 'kopa', 'vertiba'],
    et: ['hind', 'maksumus', 'summa', 'kokku', 'vaartus'],
    // Asian
    zh: ['jiage', 'chengben', 'jine', 'zonge', 'jiazhi'],
    ja: ['nedan', 'kakaku', 'kingaku', 'goukei'],
    ko: ['gagyeok', 'biyong', 'geumak', 'chonghab'],
    vi: ['gia', 'chiphi', 'sotien', 'tongso', 'giatri'],
    th: ['raka', 'khakhai', 'ngoenruan', 'ruamthanmod'],
    id: ['harga', 'biaya', 'jumlah', 'total', 'nilai'],
    ms: ['harga', 'kos', 'jumlah', 'nilai'],
    tl: ['presyo', 'halaga', 'kabuuan', 'bilang'],
    // Middle Eastern
    ar: ['siar', 'taklifa', 'mablag', 'ijmali', 'qima'],
    he: ['mehir', 'avur', 'skum', 'sahkol', 'erekh'],
    tr: ['fiyat', 'maliyet', 'tutar', 'toplam', 'deger'],
    fa: ['gheymat', 'hazine', 'mablagh', 'jame', 'arzesh'],
    // South Asian
    hi: ['mulya', 'lagat', 'rashi', 'kul', 'mahatva'],
    bn: ['dam', 'khoroch', 'taka', 'total', 'mulya'],
    ta: ['vilai', 'selavu', 'thogai', 'motham', 'mathippu'],
    // Greek
    el: ['timi', 'kostos', 'poso', 'sinolo', 'axia'],
  },
  name: {
    // Western European
    en: ['name', 'fullname', 'full_name'],
    es: ['nombre', 'nombre_completo'],
    pt: ['nome', 'nome_completo'],
    de: ['name', 'vollstandiger_name'],
    fr: ['nom', 'nom_complet'],
    it: ['nome', 'nome_completo'],
    nl: ['naam', 'volledige_naam'],
    // Nordic
    sv: ['namn', 'fullstandigt_namn'],
    no: ['navn', 'fullt_navn'],
    da: ['navn', 'fulde_navn'],
    fi: ['nimi', 'koko_nimi'],
    is: ['nafn', 'fullt_nafn'],
    // Eastern European
    pl: ['imie', 'pelne_imie', 'nazwisko'],
    cs: ['jmeno', 'cele_jmeno'],
    sk: ['meno', 'cele_meno'],
    hu: ['nev', 'teljes_nev'],
    ro: ['nume', 'nume_complet'],
    bg: ['ime', 'pylno_ime'],
    hr: ['ime', 'puno_ime'],
    sl: ['ime', 'polno_ime'],
    sr: ['ime', 'puno_ime'],
    uk: ['imya', 'povne_imya'],
    ru: ['imya', 'polnoe_imya'],
    be: ['imya', 'pounae_imya'],
    // Baltic
    lt: ['vardas', 'pilnas_vardas'],
    lv: ['vards', 'pilnais_vards'],
    et: ['nimi', 'taielik_nimi'],
    // Asian
    zh: ['mingzi', 'xingming', 'quanming'],
    ja: ['namae', 'shimei', 'furuneemu'],
    ko: ['ireum', 'seongmyeong', 'fullname'],
    vi: ['ten', 'hovasten', 'tendaydu'],
    th: ['chue', 'namsakun', 'chuetem'],
    id: ['nama', 'nama_lengkap'],
    ms: ['nama', 'nama_penuh'],
    tl: ['pangalan', 'buong_pangalan'],
    // Middle Eastern
    ar: ['ism', 'ism_kamel'],
    he: ['shem', 'shem_male'],
    tr: ['isim', 'tam_isim', 'ad'],
    fa: ['nam', 'namkamel'],
    // South Asian
    hi: ['naam', 'poora_naam'],
    bn: ['naam', 'puro_naam'],
    ta: ['peyar', 'muzhu_peyar'],
    // Greek
    el: ['onoma', 'plires_onoma'],
  },
  author: {
    // Western European
    en: ['author', 'by', 'written_by', 'creator'],
    es: ['autor', 'por', 'escrito_por', 'creador'],
    pt: ['autor', 'por', 'escrito_por', 'criador'],
    de: ['autor', 'von', 'geschrieben_von', 'ersteller'],
    fr: ['auteur', 'par', 'ecrit_par', 'createur'],
    it: ['autore', 'di', 'scritto_da', 'creatore'],
    nl: ['auteur', 'door', 'geschreven_door', 'maker'],
    // Nordic
    sv: ['forfattare', 'av', 'skapad_av'],
    no: ['forfatter', 'av', 'skrevet_av'],
    da: ['forfatter', 'af', 'skrevet_af'],
    fi: ['tekija', 'kirjoittanut', 'luoja'],
    is: ['hofundur', 'eftir', 'skrifad_af'],
    // Eastern European
    pl: ['autor', 'przez', 'napisane_przez'],
    cs: ['autor', 'od', 'napsano'],
    sk: ['autor', 'od', 'napisane'],
    hu: ['szerzo', 'irta', 'keszitette'],
    ro: ['autor', 'de', 'scris_de'],
    bg: ['avtor', 'ot', 'napisano_ot'],
    hr: ['autor', 'od', 'napisao'],
    sl: ['avtor', 'od', 'napisal'],
    sr: ['autor', 'od', 'napisao'],
    uk: ['avtor', 'vid', 'napysano'],
    ru: ['avtor', 'ot', 'napisano'],
    be: ['autar', 'ad', 'napisana'],
    // Baltic
    lt: ['autorius', 'pagal', 'parasyta'],
    lv: ['autors', 'no', 'rakstits'],
    et: ['autor', 'poolt', 'kirjutas'],
    // Asian
    zh: ['zuozhe', 'youzuo', 'chuangzaozhe'],
    ja: ['chosha', 'sakusha', 'kisha'],
    ko: ['jakka', 'jeonja', 'changjakja'],
    vi: ['tacgia', 'nguoiviet', 'tao'],
    th: ['phukhian', 'doi', 'phusrang'],
    id: ['penulis', 'oleh', 'pembuat'],
    ms: ['pengarang', 'oleh', 'pencipta'],
    tl: ['may_akda', 'ni', 'lumikha'],
    // Middle Eastern
    ar: ['katib', 'muallif', 'biqalam'],
    he: ['mehaber', 'meeat', 'kotev'],
    tr: ['yazar', 'tarafindan', 'olusturan'],
    fa: ['nevisande', 'tavasot', 'padidavarnde'],
    // South Asian
    hi: ['lekhak', 'dwara', 'rachayita'],
    bn: ['lekhok', 'dwara', 'srishtikorta'],
    ta: ['asiriyar', 'avaraal', 'padaippalar'],
    // Greek
    el: ['siggrafeas', 'apo', 'dimiourgos'],
  },
  summary: {
    // Western European
    en: ['summary', 'abstract', 'overview', 'brief'],
    es: ['resumen', 'abstracto', 'vista_general', 'breve'],
    pt: ['resumo', 'sumario', 'visao_geral', 'breve'],
    de: ['zusammenfassung', 'abstrakt', 'uberblick', 'kurz'],
    fr: ['resume', 'abstrait', 'apercu', 'bref'],
    it: ['sommario', 'astratto', 'panoramica', 'breve'],
    nl: ['samenvatting', 'abstract', 'overzicht', 'kort'],
    // Nordic
    sv: ['sammanfattning', 'oversikt', 'kort'],
    no: ['sammendrag', 'oversikt', 'kort'],
    da: ['resume', 'oversigt', 'kort'],
    fi: ['yhteenveto', 'tiivistelma', 'yleiskatsaus'],
    is: ['samantekt', 'yfirlit', 'stutt'],
    // Eastern European
    pl: ['streszczenie', 'przeglad', 'krotki'],
    cs: ['souhrn', 'prehled', 'abstrakt'],
    sk: ['zhrnutie', 'prehlad', 'abstrakt'],
    hu: ['osszefoglalas', 'attekintes', 'rovid'],
    ro: ['rezumat', 'prezentare', 'scurt'],
    bg: ['rezume', 'pregled', 'kratko'],
    hr: ['sazetak', 'pregled', 'kratko'],
    sl: ['povzetek', 'pregled', 'kratko'],
    sr: ['sazetak', 'pregled', 'kratko'],
    uk: ['rezyume', 'oglyad', 'korotko'],
    ru: ['rezyume', 'obzor', 'kratko'],
    be: ['rezyume', 'aglyad', 'koratka'],
    // Baltic
    lt: ['santrauka', 'apzvalga', 'trumpai'],
    lv: ['kopsavilkums', 'parskats', 'isums'],
    et: ['kokkuvote', 'ulevaade', 'luhidalt'],
    // Asian
    zh: ['zhaiyao', 'gaiyao', 'jianjie'],
    ja: ['gaiyou', 'youyaku', 'abusutor'],
    ko: ['yoyak', 'gaeyoe', 'chorok'],
    vi: ['tomtat', 'tongquan', 'lucuoc'],
    th: ['sarup', 'phapruam', 'yo'],
    id: ['ringkasan', 'ikhtisar', 'abstrak'],
    ms: ['ringkasan', 'gambaran', 'abstrak'],
    tl: ['buod', 'pagsusuri', 'maikling'],
    // Middle Eastern
    ar: ['mulakhas', 'mujaz', 'nazra_aamma'],
    he: ['sikum', 'tezir', 'skira'],
    tr: ['ozet', 'genel_bakis', 'kisa'],
    fa: ['kholase', 'chekide', 'ejmal'],
    // South Asian
    hi: ['saransh', 'saaransh', 'sankshep'],
    bn: ['sarasangraha', 'sankhepo', 'somikkha'],
    ta: ['churukkam', 'nirappu', 'sulvattam'],
    // Greek
    el: ['perilipsi', 'epitomi', 'sinoptika'],
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
