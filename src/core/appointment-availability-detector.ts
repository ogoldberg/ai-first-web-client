/**
 * Appointment Availability Detector (INT-013)
 *
 * Detects appointment/booking systems on government and service portals,
 * checks for available slots, and monitors for openings.
 *
 * Supports 40+ languages globally with system-specific terminology.
 *
 * Key features:
 * - Detects appointment systems (cita previa, Termin, rendez-vous, etc.)
 * - Identifies booking URLs and calendar widgets
 * - Extracts available time slots from page content
 * - Classifies slot availability (available, limited, unavailable, unknown)
 * - Provides monitoring suggestions for slot openings
 *
 * Extensible to any scheduling/booking systems beyond government portals.
 */

import { htmlToPlainText, isHtmlContent } from './content-extraction-utils.js';
import { detectPageLanguage, type LanguageDetectionResult } from './language-aware-extraction.js';

// ============================================
// TYPES
// ============================================

/**
 * Appointment system type classification
 */
export type AppointmentSystemType =
  | 'government' // Government portal appointments (cita previa, Termin)
  | 'healthcare' // Medical appointments
  | 'consular' // Embassy/consulate appointments
  | 'immigration' // Immigration office appointments
  | 'registration' // Civil registration (padron, etc.)
  | 'tax' // Tax office appointments
  | 'banking' // Bank appointments
  | 'utility' // Utility company appointments
  | 'general' // Generic appointment system
  | 'unknown';

/**
 * Slot availability status
 */
export type SlotAvailability =
  | 'available' // Slots clearly available
  | 'limited' // Few slots remaining
  | 'unavailable' // No slots available
  | 'requires_login' // Must log in to see slots
  | 'external_redirect' // Redirects to external booking system
  | 'unknown'; // Cannot determine availability

/**
 * Detected time slot
 */
export interface TimeSlot {
  /** Date in ISO format (YYYY-MM-DD) */
  date?: string;
  /** Time in HH:MM format */
  time?: string;
  /** Full datetime if available */
  datetime?: string;
  /** Location/office name */
  location?: string;
  /** Service type */
  service?: string;
  /** Raw text describing the slot */
  rawText: string;
  /** Confidence in slot detection (0-1) */
  confidence: number;
}

/**
 * Booking system information
 */
export interface BookingSystem {
  /** System name (e.g., "cita previa", "Termin") */
  name: string;
  /** System type */
  type: AppointmentSystemType;
  /** Booking URL */
  url?: string;
  /** Alternative URLs (backup links) */
  alternativeUrls?: string[];
  /** Whether login is required */
  requiresLogin: boolean;
  /** Supported languages */
  languages?: string[];
  /** Contact for assistance */
  contactInfo?: string;
}

/**
 * Result of appointment availability detection
 */
export interface AppointmentAvailabilityResult {
  /** Whether an appointment system was detected */
  detected: boolean;
  /** Overall availability status */
  availability: SlotAvailability;
  /** Detected booking system(s) */
  systems: BookingSystem[];
  /** Available time slots (if detectable) */
  slots: TimeSlot[];
  /** Earliest available date */
  earliestAvailable?: string;
  /** Latest available date shown */
  latestAvailable?: string;
  /** Number of available slots (if countable) */
  slotCount?: number;
  /** Offices/locations with availability */
  locationsWithSlots?: string[];
  /** Offices/locations without availability */
  locationsWithoutSlots?: string[];
  /** Wait time estimate */
  estimatedWaitTime?: string;
  /** Monitoring suggestions */
  monitoringSuggestions: MonitoringSuggestion[];
  /** Detected page language */
  language: string;
  /** Language detection details */
  languageDetection?: LanguageDetectionResult;
  /** Detection confidence (0-1) */
  confidence: number;
  /** Warnings during detection */
  warnings: string[];
  /** Source URL if provided */
  sourceUrl?: string;
  /** Raw text (optional) */
  rawText?: string;
}

/**
 * Suggestion for monitoring slot availability
 */
export interface MonitoringSuggestion {
  /** Suggested check frequency in minutes */
  checkIntervalMinutes: number;
  /** Best times to check */
  bestCheckTimes?: string[];
  /** Reason for suggestion */
  reason: string;
  /** Priority level */
  priority: 'high' | 'medium' | 'low';
}

/**
 * Options for availability detection
 */
export interface AvailabilityDetectionOptions {
  /** Page language (auto-detected if not provided) */
  language?: string;
  /** Source URL for context */
  url?: string;
  /** Include raw text in result */
  includeRawText?: boolean;
  /** Specific service type to look for */
  serviceType?: string;
  /** Specific location to filter */
  location?: string;
}

// ============================================
// LANGUAGE PATTERNS
// ============================================

/**
 * Appointment system keywords by language (40+ languages)
 */
const APPOINTMENT_KEYWORDS: Record<string, string[]> = {
  // Western European
  en: ['appointment', 'booking', 'schedule', 'reserve', 'book online', 'book now', 'available slots', 'time slot'],
  es: ['cita', 'cita previa', 'reserva', 'turno', 'pedir cita', 'solicitar cita', 'hora disponible', 'hueco'],
  pt: ['agendamento', 'marcacao', 'reserva', 'marcar atendimento', 'agendar', 'horario disponivel'],
  de: ['termin', 'terminvereinbarung', 'buchung', 'termin buchen', 'termin vereinbaren', 'freie termine'],
  fr: ['rendez-vous', 'rdv', 'reservation', 'prendre rendez-vous', 'creneaux disponibles'],
  it: ['appuntamento', 'prenotazione', 'prenota', 'fissare appuntamento', 'slot disponibili'],
  nl: ['afspraak', 'reservering', 'afspraak maken', 'boeking', 'beschikbare tijden'],

  // Nordic
  sv: ['bokning', 'boka tid', 'tidsbokning', 'besokstid', 'lediga tider'],
  no: ['timebestilling', 'bestill time', 'avtale', 'ledige timer'],
  da: ['tidsbestilling', 'book tid', 'aftale', 'ledige tider'],
  fi: ['ajanvaraus', 'varaa aika', 'tapaaminen', 'vapaat ajat'],
  is: ['tidapontun', 'boka tid', 'laus tid'],

  // Eastern European
  pl: ['wizyta', 'rezerwacja', 'umow wizyte', 'zarezerwuj termin', 'wolne terminy'],
  cs: ['objednat', 'rezervace', 'termin', 'schuze', 'volne terminy'],
  sk: ['objednat sa', 'rezervacia', 'termin', 'stretnutie', 'volne terminy'],
  hu: ['idopont foglalas', 'idopont', 'foglalj idopontot', 'szabad idopontok'],
  ro: ['programare', 'rezervare', 'face programare', 'locuri disponibile'],
  bg: ['zapis', 'rezervatsiya', 'sreshta', 'zapishete se', 'svobodni chasa'],
  hr: ['rezervacija', 'dogovor', 'termin', 'naruci se', 'slobodni termini'],
  sl: ['rezervacija', 'termin', 'narocilo', 'prosti termini'],
  sr: ['zakazivanje', 'termin', 'rezervacija', 'slobodni termini'],
  uk: ['zapys', 'bronuvannya', 'pryznachennya', 'zabroniuvaty', 'vilni chasy'],
  ru: ['zapis', 'bronirovanie', 'nazhnachit vstrechu', 'zapisatsya', 'svobodnye sloty'],
  be: ['zapis', 'braniravanne', 'sustreach', 'volnyya terminy'],

  // Baltic
  lt: ['registracija', 'rezervacija', 'susitarimas', 'uzsiregistruoti', 'laisvi laikai'],
  lv: ['pieraksts', 'rezervacija', 'pierakstities', 'laika rezervesana', 'briva laiki'],
  et: ['broneerimine', 'ajabroneering', 'registreerumine', 'vabad ajad'],

  // Greek
  el: ['rantevou', 'kratisi', 'prografteite', 'eleftheres ores'],

  // Turkish
  tr: ['randevu', 'rezervasyon', 'randevu al', 'online randevu', 'musait saatler'],

  // Middle Eastern
  ar: ['mawid', 'hajz', 'hajz mawid', 'tasjil mawid', 'awqat mutaha'],
  he: ['tor', 'hzmanat tor', 'kviat pgisha', 'zimun', 'torim pnuyim'],
  fa: ['nobat', 'rezerv', 'vaght gereftna', 'zamanhay azad'],

  // South Asian
  hi: ['appointment', 'booking', 'samay nirdharit', 'slot book', 'upalabdh slot'],
  bn: ['appointment', 'somoy dharikaran', 'booking', 'khali slot'],
  ta: ['neramneram', 'booking', 'appointment', 'kaala irukkirathu'],
  ur: ['mulaqat', 'booking', 'waqt miqrar', 'dastiyab waqt'],
  mr: ['bhet', 'booking', 'vel aarakhit', 'upalabdha vel'],

  // Southeast Asian
  vi: ['dat hen', 'dat lich', 'hen', 'cuoc hen', 'lich trong'],
  th: ['nat phop', 'chong', 'booking', 'welaa waang'],
  id: ['janji temu', 'reservasi', 'booking', 'buat janji', 'slot tersedia'],
  ms: ['temujanji', 'tempahan', 'buat temujanji', 'slot kosong'],
  tl: ['appointment', 'booking', 'iskedyul', 'bakanteng slot'],

  // East Asian
  zh: ['yuyue', 'yuding', 'booking', 'kongxian shijian'],
  ja: ['yoyaku', 'booking', 'apoint', 'akijikan'],
  ko: ['yeyak', 'booking', 'appointment', 'bieoneun sigancheung'],

  // African
  sw: ['miadi', 'uhifadhi', 'panga miadi', 'nafasi zilizo wazi'],
  am: ['qetero', 'booking', 'appointment', 'neqa gize'],
  zu: ['ukubhuka', 'isivumelwano', 'isikhala esivulekile'],

  // Other
  ga: ['coinne', 'cuir in airithe', 'amanna saora'],
  cy: ['apwyntiad', 'archebu', 'slotiau ar gael'],
  mt: ['appuntament', 'booking', 'hin disponibbli'],
  sq: ['takim', 'rezervim', 'prenotim', 'ore te lira'],
  mk: ['termin', 'rezervacija', 'zakazuvanje', 'slobodni termini'],
  ka: ['chaweris', 'rezervatsia', 'shekhvedris danisnva', 'tavisufali droebi'],
  hy: ['zhanaamapet', 'amragrum', 'azat zhamanak'],
  az: ['gorusme', 'rezervasiya', 'randevu', 'bos vaxtlar'],
  kk: ['kezdesu', 'brondarj', 'uakyt tagyayndau', 'bos uakyt'],
  uz: ['uchrashuv', 'bronlash', 'uchrashuv belgilash', 'bosh vaqtlar'],
};

/**
 * Availability status keywords by language
 */
const AVAILABILITY_KEYWORDS: Record<string, { available: string[]; unavailable: string[]; limited: string[] }> = {
  en: {
    available: ['available', 'open', 'free', 'slots available', 'book now'],
    unavailable: ['unavailable', 'no slots', 'fully booked', 'sold out', 'no availability', 'waitlist'],
    limited: ['limited', 'few remaining', 'almost full', 'hurry', 'last spots'],
  },
  es: {
    available: ['disponible', 'libre', 'hueco', 'citas disponibles', 'reservar ahora'],
    unavailable: ['no disponible', 'sin citas', 'completo', 'agotado', 'sin disponibilidad', 'lista de espera'],
    limited: ['limitado', 'pocas citas', 'casi lleno', 'ultimas plazas', 'quedan pocos'],
  },
  pt: {
    available: ['disponivel', 'livre', 'vagas disponiveis', 'agendar agora'],
    unavailable: ['indisponivel', 'sem vagas', 'lotado', 'esgotado', 'lista de espera'],
    limited: ['limitado', 'poucas vagas', 'quase cheio', 'ultimas vagas'],
  },
  de: {
    available: ['verfugbar', 'frei', 'offene termine', 'jetzt buchen'],
    unavailable: ['nicht verfugbar', 'keine termine', 'ausgebucht', 'warteliste'],
    limited: ['begrenzt', 'wenige platze', 'fast voll', 'letzte platze'],
  },
  fr: {
    available: ['disponible', 'libre', 'creneaux libres', 'reserver maintenant'],
    unavailable: ['indisponible', 'aucun creneau', 'complet', 'liste d attente'],
    limited: ['limite', 'peu de places', 'presque complet', 'dernieres places'],
  },
  it: {
    available: ['disponibile', 'libero', 'posti disponibili', 'prenota ora'],
    unavailable: ['non disponibile', 'nessun posto', 'completo', 'esaurito', 'lista d attesa'],
    limited: ['limitato', 'pochi posti', 'quasi pieno', 'ultimi posti'],
  },
  nl: {
    available: ['beschikbaar', 'vrij', 'open plekken', 'nu boeken'],
    unavailable: ['niet beschikbaar', 'geen plekken', 'volgeboekt', 'wachtlijst'],
    limited: ['beperkt', 'weinig plekken', 'bijna vol', 'laatste plekken'],
  },
};

/**
 * Common booking URL patterns
 */
const BOOKING_URL_PATTERNS = [
  // Generic patterns
  /https?:\/\/[^\s<>"{}|\\^`[\]]*(?:book|appointment|reserv|schedul|cita|termin|rdv|prenota|agend)[^\s<>"{}|\\^`[\]]*/gi,
  // Calendar/scheduling tools
  /https?:\/\/[^\s<>"{}|\\^`[\]]*(?:calendly|acuity|simplybook|setmore|booking|appointy|youcanbook)[^\s<>"{}|\\^`[\]]*/gi,
  // Government-specific patterns
  /https?:\/\/[^\s<>"{}|\\^`[\]]*(?:citaprevia|sede\.|administracion|gov\.|gob\.|gouv\.)[^\s<>"{}|\\^`[\]]*(?:cita|appointment|termin)[^\s<>"{}|\\^`[\]]*/gi,
];

/**
 * Date/time patterns for slot extraction
 */
const DATE_PATTERNS = [
  // ISO format: 2024-01-15
  /\b(\d{4}-\d{2}-\d{2})\b/g,
  // European format: 15/01/2024 or 15.01.2024
  /\b(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})\b/g,
  // Written dates: January 15, 2024 or 15 January 2024
  /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b/gi,
  /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{2,4})\b/gi,
  // Spanish dates: 15 de enero de 2024
  /\b(\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?\d{2,4})\b/gi,
  // German dates: 15. Januar 2024
  /\b(\d{1,2}\.\s*(?:Januar|Februar|Marz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+\d{2,4})\b/gi,
];

const TIME_PATTERNS = [
  // 24h format: 14:30, 14.30
  /\b(\d{1,2}[:\.]?\d{2})\s*(?:h|hrs?|uhr)?\b/gi,
  // 12h format: 2:30 PM
  /\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))\b/gi,
  // Time ranges: 9:00 - 10:00
  /\b(\d{1,2}[:\.]?\d{2}\s*[-]\s*\d{1,2}[:\.]?\d{2})\b/g,
];

// ============================================
// MAIN CLASS
// ============================================

/**
 * Detects appointment systems and availability on web pages
 */
export class AppointmentAvailabilityDetector {
  /**
   * Detect appointment availability from HTML content
   */
  detect(html: string, options: AvailabilityDetectionOptions = {}): AppointmentAvailabilityResult {
    const warnings: string[] = [];

    // Detect or use provided language
    let language = options.language || 'en';
    let languageDetection: LanguageDetectionResult | undefined;
    if (!options.language) {
      languageDetection = detectPageLanguage(html, options.url);
      language = languageDetection.language;
    }

    // Convert HTML to plain text for analysis
    const text = isHtmlContent(html) ? htmlToPlainText(html) : html;
    const lowerText = text.toLowerCase();

    // Initialize result
    const result: AppointmentAvailabilityResult = {
      detected: false,
      availability: 'unknown',
      systems: [],
      slots: [],
      monitoringSuggestions: [],
      language,
      languageDetection,
      confidence: 0,
      warnings,
    };

    if (options.includeRawText) {
      result.rawText = text;
    }
    if (options.url) {
      result.sourceUrl = options.url;
    }

    // Detect appointment systems
    const systems = this.detectSystems(text, lowerText, html, language, options.url);
    result.systems = systems;
    result.detected = systems.length > 0;

    if (!result.detected) {
      // Check if there are any appointment-related keywords at all
      const keywords = APPOINTMENT_KEYWORDS[language] || APPOINTMENT_KEYWORDS.en;
      const hasKeywords = keywords.some(kw => lowerText.includes(kw));
      if (hasKeywords) {
        result.detected = true;
        result.confidence = 0.3;
        warnings.push('Appointment keywords found but no clear booking system detected');
      }
    }

    if (result.detected) {
      // Detect availability status
      result.availability = this.detectAvailability(lowerText, language);

      // Extract time slots
      result.slots = this.extractTimeSlots(text, language);
      if (result.slots.length > 0) {
        result.slotCount = result.slots.length;
        result.earliestAvailable = result.slots[0].date;
        result.latestAvailable = result.slots[result.slots.length - 1].date;
      }

      // Extract locations
      const locations = this.extractLocations(text, lowerText, language);
      if (locations.available.length > 0) {
        result.locationsWithSlots = locations.available;
      }
      if (locations.unavailable.length > 0) {
        result.locationsWithoutSlots = locations.unavailable;
      }

      // Generate monitoring suggestions
      result.monitoringSuggestions = this.generateMonitoringSuggestions(result, language);

      // Calculate overall confidence
      result.confidence = this.calculateConfidence(result);
    }

    return result;
  }

  /**
   * Detect booking systems from content
   */
  private detectSystems(
    text: string,
    lowerText: string,
    html: string,
    language: string,
    url?: string
  ): BookingSystem[] {
    const systems: BookingSystem[] = [];
    const seenUrls = new Set<string>();

    // Extract booking URLs from HTML
    for (const pattern of BOOKING_URL_PATTERNS) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const bookingUrl = match[0];
        if (seenUrls.has(bookingUrl)) continue;
        seenUrls.add(bookingUrl);

        const system = this.classifySystem(bookingUrl, lowerText, language);
        if (system) {
          systems.push(system);
        }
      }
    }

    // Look for system names in text
    const keywords = APPOINTMENT_KEYWORDS[language] || APPOINTMENT_KEYWORDS.en;
    for (const keyword of keywords) {
      if (lowerText.includes(keyword) && !systems.some(s => s.name === keyword)) {
        // Check if this is a named system (not just generic)
        if (this.isNamedSystem(keyword, language)) {
          systems.push({
            name: keyword,
            type: this.classifyType(keyword, lowerText),
            requiresLogin: this.detectLoginRequired(lowerText, language),
            languages: [language],
          });
        }
      }
    }

    // If no systems found but URL provided, check if URL itself is a booking page
    if (systems.length === 0 && url) {
      const urlLower = url.toLowerCase();
      if (this.isBookingUrl(urlLower)) {
        systems.push({
          name: 'Booking System',
          type: this.classifyType(url, lowerText),
          url,
          requiresLogin: this.detectLoginRequired(lowerText, language),
          languages: [language],
        });
      }
    }

    return systems;
  }

  /**
   * Check if a keyword represents a named system
   */
  private isNamedSystem(keyword: string, language: string): boolean {
    // These are specific system names, not generic terms
    const namedSystems: Record<string, string[]> = {
      es: ['cita previa'],
      de: ['terminvereinbarung', 'termin buchen'],
      fr: ['rendez-vous', 'prendre rendez-vous'],
      it: ['prenotazione'],
      pt: ['agendamento'],
    };

    const names = namedSystems[language] || [];
    return names.some(name => keyword.includes(name));
  }

  /**
   * Classify a booking URL into a system
   */
  private classifySystem(url: string, lowerText: string, language: string): BookingSystem | null {
    const urlLower = url.toLowerCase();

    return {
      name: this.extractSystemName(urlLower, lowerText, language),
      type: this.classifyType(urlLower, lowerText),
      url,
      requiresLogin: this.detectLoginRequired(lowerText, language),
      languages: [language],
    };
  }

  /**
   * Extract system name from URL or content
   */
  private extractSystemName(url: string, lowerText: string, language: string): string {
    // Check for known platforms
    if (url.includes('calendly')) return 'Calendly';
    if (url.includes('acuity')) return 'Acuity Scheduling';
    if (url.includes('simplybook')) return 'SimplyBook.me';
    if (url.includes('setmore')) return 'Setmore';
    if (url.includes('appointy')) return 'Appointy';
    if (url.includes('youcanbook')) return 'YouCanBook.me';

    // Check for government systems
    if (url.includes('citaprevia') || url.includes('cita-previa')) return 'Cita Previa';
    if (url.includes('sede.')) return 'Sede Electronica';
    if (url.includes('termin')) return 'Termin System';

    // Try to extract from content
    const keywords = APPOINTMENT_KEYWORDS[language] || APPOINTMENT_KEYWORDS.en;
    for (const kw of keywords) {
      if (lowerText.includes(kw) && kw.length > 5) {
        return kw.charAt(0).toUpperCase() + kw.slice(1);
      }
    }

    return 'Online Booking';
  }

  /**
   * Classify system type from URL and content
   */
  private classifyType(url: string, lowerText: string): AppointmentSystemType {
    const combinedText = (url + ' ' + lowerText).toLowerCase();

    if (/immigra|visa|foreigner|extranjero|ausland|etranger/.test(combinedText)) {
      return 'immigration';
    }
    if (/consul|embassy|embajada|botschaft|ambassade/.test(combinedText)) {
      return 'consular';
    }
    if (/health|medic|doctor|hospital|salud|gesund|sante/.test(combinedText)) {
      return 'healthcare';
    }
    if (/tax|hacienda|steuer|impot|tribut/.test(combinedText)) {
      return 'tax';
    }
    if (/registr|padron|anmeld|inscripcion|empadron/.test(combinedText)) {
      return 'registration';
    }
    if (/bank|banco|banque/.test(combinedText)) {
      return 'banking';
    }
    if (/gov\.|gob\.|gouv\.|gobierno|government|regierung/.test(combinedText)) {
      return 'government';
    }

    return 'general';
  }

  /**
   * Check if URL appears to be a booking page
   */
  private isBookingUrl(url: string): boolean {
    return /book|appointment|reserv|schedul|cita|termin|rdv|prenota|agend/i.test(url);
  }

  /**
   * Detect if login is required
   */
  private detectLoginRequired(lowerText: string, language: string): boolean {
    const loginPatterns: Record<string, string[]> = {
      en: ['login required', 'sign in', 'log in to book', 'register to', 'create account'],
      es: ['iniciar sesion', 'acceder', 'registrarse para', 'crear cuenta'],
      de: ['anmelden', 'einloggen', 'registrieren'],
      fr: ['connexion', 'se connecter', 'creer un compte'],
      it: ['accedi', 'registrati', 'crea account'],
      pt: ['fazer login', 'entrar', 'criar conta'],
    };

    const patterns = loginPatterns[language] || loginPatterns.en;
    return patterns.some(p => lowerText.includes(p));
  }

  /**
   * Detect overall availability status
   */
  private detectAvailability(lowerText: string, language: string): SlotAvailability {
    const keywords = AVAILABILITY_KEYWORDS[language] || AVAILABILITY_KEYWORDS.en;

    // Check for unavailable first (stronger signal)
    if (keywords.unavailable.some(kw => lowerText.includes(kw))) {
      return 'unavailable';
    }

    // Check for limited availability
    if (keywords.limited.some(kw => lowerText.includes(kw))) {
      return 'limited';
    }

    // Check for available
    if (keywords.available.some(kw => lowerText.includes(kw))) {
      return 'available';
    }

    // Check for login requirement
    if (this.detectLoginRequired(lowerText, language)) {
      return 'requires_login';
    }

    return 'unknown';
  }

  /**
   * Extract time slots from text
   */
  private extractTimeSlots(text: string, language: string): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const lines = text.split('\n');
    const seenSlots = new Set<string>();

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.length < 5 || trimmedLine.length > 200) continue;

      // Look for date patterns
      let dateMatch: string | undefined;
      for (const pattern of DATE_PATTERNS) {
        const match = pattern.exec(trimmedLine);
        if (match) {
          dateMatch = match[1];
          break;
        }
      }

      // Look for time patterns
      let timeMatch: string | undefined;
      for (const pattern of TIME_PATTERNS) {
        const match = pattern.exec(trimmedLine);
        if (match) {
          timeMatch = match[1];
          break;
        }
      }

      // If we found date or time, create a slot
      if (dateMatch || timeMatch) {
        const slotKey = `${dateMatch || ''}-${timeMatch || ''}`;
        if (seenSlots.has(slotKey)) continue;
        seenSlots.add(slotKey);

        const slot: TimeSlot = {
          rawText: trimmedLine.slice(0, 100),
          confidence: dateMatch && timeMatch ? 0.9 : dateMatch ? 0.7 : 0.5,
        };

        if (dateMatch) slot.date = dateMatch;
        if (timeMatch) slot.time = timeMatch;
        if (dateMatch && timeMatch) slot.datetime = `${dateMatch} ${timeMatch}`;

        slots.push(slot);
      }
    }

    // Sort by date/time if possible
    slots.sort((a, b) => {
      if (a.date && b.date) return a.date.localeCompare(b.date);
      return 0;
    });

    return slots;
  }

  /**
   * Extract location information
   */
  private extractLocations(
    text: string,
    lowerText: string,
    language: string
  ): { available: string[]; unavailable: string[] } {
    const available: string[] = [];
    const unavailable: string[] = [];
    const lines = text.split('\n');

    const availableKeywords = AVAILABILITY_KEYWORDS[language]?.available || AVAILABILITY_KEYWORDS.en.available;
    const unavailableKeywords = AVAILABILITY_KEYWORDS[language]?.unavailable || AVAILABILITY_KEYWORDS.en.unavailable;

    // Location patterns
    const locationPatterns = [
      /oficina\s+(?:de\s+)?(.+)/i,
      /office\s+(?:at\s+)?(.+)/i,
      /location[:\s]+(.+)/i,
      /centro\s+(.+)/i,
      /sede\s+(.+)/i,
    ];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.length < 5 || trimmedLine.length > 100) continue;

      const lineLower = trimmedLine.toLowerCase();

      // Check if line mentions a location
      let locationName: string | undefined;
      for (const pattern of locationPatterns) {
        const match = pattern.exec(trimmedLine);
        if (match) {
          locationName = match[1].trim();
          break;
        }
      }

      if (locationName) {
        // Check availability in this line or nearby
        const isAvailable = availableKeywords.some(kw => lineLower.includes(kw));
        const isUnavailable = unavailableKeywords.some(kw => lineLower.includes(kw));

        if (isUnavailable) {
          unavailable.push(locationName);
        } else if (isAvailable) {
          available.push(locationName);
        }
      }
    }

    return { available: [...new Set(available)], unavailable: [...new Set(unavailable)] };
  }

  /**
   * Generate monitoring suggestions
   */
  private generateMonitoringSuggestions(
    result: AppointmentAvailabilityResult,
    language: string
  ): MonitoringSuggestion[] {
    const suggestions: MonitoringSuggestion[] = [];

    if (result.availability === 'unavailable') {
      suggestions.push({
        checkIntervalMinutes: 30,
        bestCheckTimes: ['08:00', '12:00', '18:00'],
        reason: 'No slots currently available - frequent checking recommended',
        priority: 'high',
      });
    } else if (result.availability === 'limited') {
      suggestions.push({
        checkIntervalMinutes: 60,
        bestCheckTimes: ['09:00', '14:00'],
        reason: 'Limited slots available - regular checking recommended',
        priority: 'medium',
      });
    } else if (result.availability === 'available') {
      suggestions.push({
        checkIntervalMinutes: 1440, // Daily
        reason: 'Slots currently available - daily monitoring sufficient',
        priority: 'low',
      });
    } else {
      suggestions.push({
        checkIntervalMinutes: 120,
        reason: 'Availability unknown - periodic checking recommended',
        priority: 'medium',
      });
    }

    // Add system-specific suggestions
    for (const system of result.systems) {
      if (system.type === 'immigration' || system.type === 'consular') {
        suggestions.push({
          checkIntervalMinutes: 15,
          bestCheckTimes: ['00:00', '06:00', '12:00', '18:00'],
          reason: `${system.type} appointments often release at specific times`,
          priority: 'high',
        });
      }
    }

    return suggestions;
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(result: AppointmentAvailabilityResult): number {
    let confidence = 0;

    // Base confidence from system detection
    if (result.systems.length > 0) {
      confidence += 0.4;
      if (result.systems.some(s => s.url)) {
        confidence += 0.2;
      }
    }

    // Confidence from availability detection
    if (result.availability !== 'unknown') {
      confidence += 0.2;
    }

    // Confidence from slot extraction
    if (result.slots.length > 0) {
      confidence += 0.2;
    }

    return Math.min(confidence, 1);
  }
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Create a new detector instance
 */
export function createAvailabilityDetector(): AppointmentAvailabilityDetector {
  return new AppointmentAvailabilityDetector();
}

/**
 * Detect appointment availability from HTML
 */
export function detectAppointmentAvailability(
  html: string,
  options?: AvailabilityDetectionOptions
): AppointmentAvailabilityResult {
  const detector = new AppointmentAvailabilityDetector();
  return detector.detect(html, options);
}

/**
 * Check if a page has an appointment system
 */
export function hasAppointmentSystem(html: string, language?: string): boolean {
  const result = detectAppointmentAvailability(html, { language });
  return result.detected;
}

/**
 * Get availability status from a page
 */
export function getAvailabilityStatus(html: string, language?: string): SlotAvailability {
  const result = detectAppointmentAvailability(html, { language });
  return result.availability;
}
