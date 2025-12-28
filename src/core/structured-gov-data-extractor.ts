/**
 * Structured Government Data Extractor (INT-012)
 *
 * Extracts structured data from unstructured government portal pages.
 * Uses language-aware extraction combined with field-specific extraction patterns
 * to produce normalized government data: fees, requirements, timelines, documents.
 *
 * @example
 * ```typescript
 * import { StructuredGovDataExtractor } from 'llm-browser/sdk';
 *
 * const extractor = new StructuredGovDataExtractor();
 *
 * // Extract government data from HTML
 * const result = extractor.extract(html, {
 *   contentType: 'requirements',
 *   language: 'es',
 * });
 *
 * // Validate against schema
 * const validation = extractor.validate(result);
 * if (!validation.valid) {
 *   console.log('Validation errors:', validation.errors);
 * }
 * ```
 */

import {
  detectPageLanguage,
  type LanguageDetectionResult,
} from './language-aware-extraction.js';
import {
  htmlToPlainText,
  isHtmlContent,
} from './content-extraction-utils.js';

// ============================================
// TYPES
// ============================================

/**
 * Content types for government data extraction
 */
export type GovContentType =
  | 'requirements'
  | 'documents'
  | 'fees'
  | 'timeline'
  | 'forms'
  | 'contact'
  | 'appointment'
  | 'eligibility'
  | 'general';

/**
 * A monetary value with currency
 */
export interface MonetaryValue {
  /** The numeric amount */
  amount: number;
  /** Currency code (ISO 4217) */
  currency: string;
  /** Original text representation */
  original: string;
}

/**
 * A date/timeline value
 */
export interface TimelineValue {
  /** Duration in days (if applicable) */
  durationDays?: number;
  /** Duration description (e.g., "2-3 weeks") */
  durationText?: string;
  /** Specific date if mentioned */
  specificDate?: string;
  /** Original text */
  original: string;
}

/**
 * A document requirement
 */
export interface DocumentRequirement {
  /** Document name */
  name: string;
  /** Description or details */
  description?: string;
  /** Whether the document is required vs optional */
  required: boolean;
  /** Special notes about the document */
  notes?: string;
  /** Related form number if applicable */
  formNumber?: string;
}

/**
 * An eligibility requirement
 */
export interface EligibilityRequirement {
  /** Requirement description */
  description: string;
  /** Category of requirement */
  category?: 'age' | 'income' | 'residency' | 'employment' | 'other';
  /** Whether this is mandatory */
  mandatory: boolean;
  /** Additional notes */
  notes?: string;
}

/**
 * A fee entry
 */
export interface FeeEntry {
  /** Fee description */
  description: string;
  /** The fee amount and currency */
  amount: MonetaryValue;
  /** Payment methods accepted */
  paymentMethods?: string[];
  /** Related form number (e.g., "modelo 790") */
  formNumber?: string;
  /** Notes about this fee */
  notes?: string;
}

/**
 * A timeline/processing step
 */
export interface ProcessingStep {
  /** Step name or description */
  name: string;
  /** Estimated duration */
  duration?: TimelineValue;
  /** Step order (1-based) */
  order?: number;
  /** Notes about this step */
  notes?: string;
}

/**
 * Contact information
 */
export interface ContactInfo {
  /** Department or office name */
  name?: string;
  /** Phone number(s) */
  phone?: string[];
  /** Email address(es) */
  email?: string[];
  /** Physical address */
  address?: string;
  /** Website URL */
  website?: string;
  /** Office hours */
  hours?: string;
  /** Notes */
  notes?: string;
}

/**
 * Appointment/booking information
 */
export interface AppointmentInfo {
  /** Whether appointment is required */
  required: boolean;
  /** Booking system URL */
  bookingUrl?: string;
  /** Booking system name (e.g., "cita previa") */
  systemName?: string;
  /** Available locations */
  locations?: string[];
  /** Tips for booking */
  tips?: string[];
  /** Notes */
  notes?: string;
}

/**
 * Form information
 */
export interface FormInfo {
  /** Form identifier/number */
  formNumber: string;
  /** Form name */
  name?: string;
  /** Description of what it's for */
  description?: string;
  /** Download URL */
  downloadUrl?: string;
  /** Online submission URL */
  onlineUrl?: string;
  /** Notes */
  notes?: string;
}

/**
 * Complete structured government data
 */
export interface StructuredGovData {
  /** Data type that was extracted */
  contentType: GovContentType;
  /** Detected language */
  language: string;
  /** Language detection details */
  languageDetection?: LanguageDetectionResult;
  /** Extraction confidence (0-1) */
  confidence: number;

  /** Requirements and eligibility criteria */
  requirements?: EligibilityRequirement[];
  /** Required documents */
  documents?: DocumentRequirement[];
  /** Fees and costs */
  fees?: FeeEntry[];
  /** Processing timeline and steps */
  timeline?: ProcessingStep[];
  /** Forms to fill out */
  forms?: FormInfo[];
  /** Contact information */
  contact?: ContactInfo;
  /** Appointment/booking information */
  appointment?: AppointmentInfo;

  /** Raw extracted text (for context) */
  rawText?: string;
  /** Extraction warnings */
  warnings?: string[];
  /** Source URL if known */
  sourceUrl?: string;
}

/**
 * Extraction options
 */
export interface ExtractionOptions {
  /** Type of content to extract */
  contentType?: GovContentType;
  /** Known language (skips detection if provided) */
  language?: string;
  /** Source URL for context */
  url?: string;
  /** Include raw text in output */
  includeRawText?: boolean;
  /** Minimum confidence threshold (0-1) */
  minConfidence?: number;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation errors */
  errors: ValidationError[];
  /** Validation warnings */
  warnings: ValidationWarning[];
}

/**
 * Validation error
 */
export interface ValidationError {
  /** Field path that failed */
  path: string;
  /** Error message */
  message: string;
  /** Expected value/type */
  expected?: string;
  /** Actual value/type */
  actual?: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  /** Field path */
  path: string;
  /** Warning message */
  message: string;
}

// ============================================
// EXTRACTION PATTERNS
// ============================================

/**
 * Fee-related keywords by language (40+ languages globally)
 */
const FEE_KEYWORDS: Record<string, string[]> = {
  // Western European
  en: ['fee', 'cost', 'price', 'payment', 'charge', 'rate', 'amount', 'dues'],
  es: ['tasa', 'precio', 'coste', 'pago', 'importe', 'cantidad', 'tarifa', 'arancel'],
  pt: ['taxa', 'custo', 'pagamento', 'valor', 'quantia', 'tarifa', 'emolumento'],
  de: ['gebuhr', 'kosten', 'preis', 'zahlung', 'betrag', 'gebuehren', 'entgelt'],
  fr: ['frais', 'cout', 'prix', 'paiement', 'montant', 'tarif', 'redevance'],
  it: ['tassa', 'costo', 'prezzo', 'pagamento', 'importo', 'tariffa', 'diritti'],
  nl: ['kosten', 'prijs', 'betaling', 'bedrag', 'tarief', 'heffing', 'leges'],

  // Nordic
  sv: ['avgift', 'kostnad', 'pris', 'betalning', 'taxa', 'summa'],
  no: ['avgift', 'kostnad', 'pris', 'betaling', 'gebyr', 'sum'],
  da: ['gebyr', 'omkostning', 'pris', 'betaling', 'afgift', 'belob'],
  fi: ['maksu', 'hinta', 'kustannus', 'palkkio', 'taksa', 'summa'],
  is: ['gjald', 'kostnadur', 'verd', 'greidsla', 'upphad'],

  // Eastern European
  pl: ['oplata', 'koszt', 'cena', 'platnosc', 'stawka', 'kwota', 'naleznosc'],
  cs: ['poplatek', 'cena', 'naklady', 'platba', 'castka', 'sazba'],
  sk: ['poplatok', 'cena', 'naklady', 'platba', 'suma', 'sadzba'],
  hu: ['dij', 'koltseg', 'ar', 'fizetes', 'osszeg', 'illetek'],
  ro: ['taxa', 'cost', 'pret', 'plata', 'suma', 'tarif', 'timbru'],
  bg: ['taksa', 'tsena', 'razkhod', 'plashtane', 'suma'],
  hr: ['pristojba', 'cijena', 'trosak', 'placanje', 'iznos', 'naknada'],
  sl: ['pristojbina', 'cena', 'strosek', 'placilo', 'znesek', 'taksa'],
  sr: ['taksa', 'cena', 'trosak', 'placanje', 'iznos', 'naknada'],
  uk: ['oplata', 'vartist', 'tsina', 'platizh', 'suma', 'zbir'],
  ru: ['oplata', 'stoimost', 'tsena', 'platezh', 'summa', 'sbor', 'poshlina'],
  be: ['aplata', 'kosht', 'tsana', 'platezh', 'suma'],

  // Baltic
  lt: ['mokestis', 'kaina', 'islaidos', 'mokejimas', 'suma', 'rinkliava'],
  lv: ['maksa', 'cena', 'izmaksas', 'maksajums', 'summa', 'nodeva'],
  et: ['tasu', 'hind', 'kulu', 'makse', 'summa', 'loiv'],

  // Greek & Cypriot
  el: ['telos', 'kostous', 'timi', 'pliroma', 'poso', 'eisfora'],

  // Turkish
  tr: ['ucret', 'maliyet', 'fiyat', 'odeme', 'tutar', 'harci', 'bedel'],

  // Middle Eastern
  ar: ['rusoom', 'taklufa', 'siar', 'dafa', 'mablagh', 'ajr'],
  he: ['agra', 'mehir', 'tashlum', 'schum', 'takanon'],
  fa: ['haq', 'hazine', 'gharamat', 'pardakht', 'mablagh'],

  // South Asian
  hi: ['shulk', 'keemat', 'bhugtan', 'rashi', 'daam', 'fees'],
  bn: ['fees', 'dam', 'khorca', 'porisodhon', 'taka'],
  ta: ['kathanam', 'vilai', 'seluttu', 'thogai'],
  ur: ['fees', 'qeemat', 'ada', 'raqam'],
  mr: ['shulk', 'kimmat', 'bharna', 'rakam'],

  // Southeast Asian
  vi: ['phi', 'gia', 'thanh toan', 'le phi', 'tien'],
  th: ['kha', 'raka', 'kha thamiam', 'ngoen'],
  id: ['biaya', 'tarif', 'harga', 'pembayaran', 'ongkos', 'retribusi'],
  ms: ['bayaran', 'kos', 'harga', 'fi', 'caj', 'kadar'],
  tl: ['bayad', 'halaga', 'singil', 'gastos', 'presyo'],

  // East Asian
  zh: ['feiyong', 'jiage', 'fukuan', 'shoufei', 'jine'],
  ja: ['ryokin', 'hiyo', 'kakaku', 'shiharai', 'tesuryo'],
  ko: ['yogeum', 'biyong', 'gagyeok', 'napbu', 'suryo'],

  // African
  sw: ['ada', 'gharama', 'bei', 'malipo', 'kiasi'],
  am: ['kifya', 'waga', 'kfiya', 'mesrat'],
  zu: ['imali', 'intengo', 'ukukhokha', 'inani'],

  // Other
  ga: ['tailli', 'costas', 'praghas', 'iocaiocht', 'suim'],
  cy: ['ffi', 'cost', 'pris', 'taliad', 'swm'],
  mt: ['hlas', 'spieza', 'prezz', 'hlas', 'ammont'],
  sq: ['tarife', 'kosto', 'cmim', 'pagese', 'shume'],
  mk: ['taksa', 'cena', 'trosok', 'plakjanje', 'iznos'],
  ka: ['sapasuri', 'pasi', 'gadakhda', 'tanxa'],
  hy: ['vacharq', 'arzhek', 'vcharm', 'gumar'],
  az: ['odenis', 'qiymet', 'haqi', 'mebleg'],
  kk: ['tolem', 'baqa', 'tolem', 'soma'],
  uz: ['tolov', 'narx', 'tolov', 'summa'],
};

/**
 * Document-related keywords by language (40+ languages globally)
 */
const DOCUMENT_KEYWORDS: Record<string, string[]> = {
  // Western European
  en: ['document', 'certificate', 'proof', 'form', 'passport', 'id', 'license', 'permit', 'card'],
  es: ['documento', 'certificado', 'justificante', 'formulario', 'pasaporte', 'dni', 'licencia', 'permiso', 'tarjeta'],
  pt: ['documento', 'certificado', 'comprovante', 'formulario', 'passaporte', 'licenca', 'cartao', 'atestado'],
  de: ['dokument', 'bescheinigung', 'nachweis', 'formular', 'reisepass', 'ausweis', 'erlaubnis', 'urkunde'],
  fr: ['document', 'certificat', 'justificatif', 'formulaire', 'passeport', 'permis', 'carte', 'attestation'],
  it: ['documento', 'certificato', 'prova', 'modulo', 'passaporto', 'licenza', 'permesso', 'tessera'],
  nl: ['document', 'certificaat', 'bewijs', 'formulier', 'paspoort', 'vergunning', 'kaart', 'rijbewijs'],

  // Nordic
  sv: ['dokument', 'intyg', 'bevis', 'blankett', 'pass', 'kort', 'tillstand', 'legitimation'],
  no: ['dokument', 'attest', 'bevis', 'skjema', 'pass', 'kort', 'tillatelse', 'legitimasjon'],
  da: ['dokument', 'attest', 'bevis', 'formular', 'pas', 'kort', 'tilladelse', 'legitimation'],
  fi: ['asiakirja', 'todistus', 'lomake', 'passi', 'kortti', 'lupa', 'henkilokortti'],
  is: ['skjal', 'vottord', 'eydublad', 'vegabref', 'kort', 'leyfi'],

  // Eastern European
  pl: ['dokument', 'zaswiadczenie', 'dowod', 'formularz', 'paszport', 'pozwolenie', 'karta', 'akt'],
  cs: ['dokument', 'osvedceni', 'potvrzeni', 'formular', 'pas', 'prukaz', 'povoleni', 'karta'],
  sk: ['dokument', 'osvedcenie', 'potvrdenie', 'formular', 'pas', 'preukaz', 'povolenie', 'karta'],
  hu: ['dokumentum', 'igazolas', 'bizonyitvany', 'urlap', 'utlevel', 'engedely', 'kartya', 'szemelyi'],
  ro: ['document', 'certificat', 'dovada', 'formular', 'pasaport', 'permis', 'carte', 'buletin'],
  bg: ['dokument', 'udostoverenie', 'formulyar', 'pasport', 'razreshenie', 'karta', 'lichna karta'],
  hr: ['dokument', 'potvrda', 'obrazac', 'putovnica', 'dozvola', 'kartica', 'osobna iskaznica'],
  sl: ['dokument', 'potrdilo', 'obrazec', 'potni list', 'dovoljenje', 'kartica', 'osebna izkaznica'],
  sr: ['dokument', 'uverenje', 'obrazac', 'pasos', 'dozvola', 'kartica', 'licna karta'],
  uk: ['dokument', 'dovidka', 'forma', 'pasport', 'dozvil', 'kartka', 'posvidchennya'],
  ru: ['dokument', 'spravka', 'svidetelstvo', 'forma', 'blanк', 'pasport', 'razresheniye', 'udostovereniye'],
  be: ['dakument', 'davedka', 'forma', 'paspart', 'dazvol', 'kartka'],

  // Baltic
  lt: ['dokumentas', 'pazymejimas', 'liudijimas', 'forma', 'pasas', 'leidimas', 'kortele'],
  lv: ['dokuments', 'aplieciba', 'izziņa', 'veidlapa', 'pase', 'atlauja', 'karte'],
  et: ['dokument', 'toend', 'tunnistus', 'vorm', 'pass', 'luba', 'kaart', 'isikutunnistus'],

  // Greek & Cypriot
  el: ['engrafo', 'pistopoiitiko', 'vivliario', 'diabatirio', 'adeia', 'karta', 'taytotita'],

  // Turkish
  tr: ['belge', 'sertifika', 'form', 'pasaport', 'kimlik', 'izin', 'kart', 'ehliyet'],

  // Middle Eastern
  ar: ['wathiqa', 'shahada', 'istimara', 'jawaz', 'tasrih', 'bitaqa', 'rukhsa'],
  he: ['mishmach', 'teuda', 'tofes', 'darkon', 'ishur', 'kartis', 'rishion'],
  fa: ['sanad', 'gavahiname', 'form', 'gozarname', 'mojavez', 'kart', 'shenasname'],

  // South Asian
  hi: ['dastavez', 'praman patra', 'form', 'passport', 'anumati', 'card', 'pehchan patra'],
  bn: ['document', 'proman potro', 'form', 'passport', 'onumoti', 'card'],
  ta: ['aathaaram', 'saandru', 'padivarum', 'passport', 'anumathi', 'card'],
  ur: ['dastavez', 'certificate', 'form', 'passport', 'ijazat', 'card', 'shanakht'],
  mr: ['kagadpatra', 'praman patra', 'form', 'passport', 'parvana', 'card'],

  // Southeast Asian
  vi: ['giay to', 'chung chi', 'mau don', 'ho chieu', 'giay phep', 'the', 'cmnd'],
  th: ['ekkasan', 'bai rap rong', 'baeb form', 'nangsue doen thang', 'bai anuyat', 'bat'],
  id: ['dokumen', 'sertifikat', 'formulir', 'paspor', 'izin', 'kartu', 'ktp', 'surat'],
  ms: ['dokumen', 'sijil', 'borang', 'pasport', 'permit', 'kad', 'lesen'],
  tl: ['dokumento', 'sertipiko', 'porma', 'pasaporte', 'pahintulot', 'kard', 'lisensya'],

  // East Asian
  zh: ['wenjian', 'zhengming', 'biaoge', 'huzhao', 'xukezheng', 'ka', 'shenfenzheng'],
  ja: ['shorui', 'shomeisho', 'yoshiki', 'pasupoto', 'kyoka', 'kaado', 'menkyo'],
  ko: ['seoryu', 'jeungmyeong', 'yangshik', 'yeokwon', 'heoga', 'kadeu', 'myeonheo'],

  // African
  sw: ['hati', 'cheti', 'fomu', 'pasipoti', 'kibali', 'kadi', 'kitambulisho'],
  am: ['senedi', 'mistir', 'form', 'passport', 'fitad', 'kardi'],
  zu: ['uxhwebo', 'isitifiketi', 'ifomu', 'iphasipoti', 'imvume', 'ikhadi'],

  // Other
  ga: ['doicimead', 'deimhniu', 'foirm', 'pas', 'cead', 'carta'],
  cy: ['dogfen', 'tystysgrif', 'ffurflen', 'pasbort', 'trwydded', 'cerdyn'],
  mt: ['dokument', 'certifikat', 'formola', 'passaport', 'permess', 'karta'],
  sq: ['dokument', 'certifikate', 'formular', 'pasaporte', 'leje', 'karte'],
  mk: ['dokument', 'uverenie', 'obrazec', 'pasos', 'dozvola', 'karticka', 'licna karta'],
  ka: ['dokumenti', 'mowmoba', 'forma', 'pasporti', 'nebartkva', 'barati'],
  hy: ['pastat', 'vkayakan', 'dzev', 'andznagir', 'toghardagir', 'qart'],
  az: ['senend', 'seriyifikat', 'forma', 'pasport', 'icaze', 'vesiqe', 'kart'],
  kk: ['kuzhat', 'kualik', 'nysan', 'kusik', 'ruksat', 'karta'],
  uz: ['hujjat', 'guvohnoma', 'shakl', 'pasport', 'ruxsatnoma', 'karta'],
};

/**
 * Timeline-related keywords by language (40+ languages globally)
 */
const TIMELINE_KEYWORDS: Record<string, string[]> = {
  // Western European
  en: ['day', 'week', 'month', 'working day', 'business day', 'processing time', 'duration', 'deadline'],
  es: ['dia', 'semana', 'mes', 'dia habil', 'plazo', 'tiempo de tramitacion', 'duracion', 'fecha limite'],
  pt: ['dia', 'semana', 'mes', 'dia util', 'prazo', 'tempo de processamento', 'duracao', 'data limite'],
  de: ['tag', 'woche', 'monat', 'werktag', 'arbeitstag', 'bearbeitungszeit', 'frist', 'dauer'],
  fr: ['jour', 'semaine', 'mois', 'jour ouvrable', 'delai', 'temps de traitement', 'duree', 'echeance'],
  it: ['giorno', 'settimana', 'mese', 'giorno lavorativo', 'termine', 'tempo di elaborazione', 'durata', 'scadenza'],
  nl: ['dag', 'week', 'maand', 'werkdag', 'termijn', 'verwerkingstijd', 'duur', 'deadline'],

  // Nordic
  sv: ['dag', 'vecka', 'manad', 'arbetsdag', 'handlaggningstid', 'tidsfrist', 'varaktighet'],
  no: ['dag', 'uke', 'maned', 'virkedag', 'behandlingstid', 'frist', 'varighet'],
  da: ['dag', 'uge', 'maned', 'arbejdsdag', 'behandlingstid', 'frist', 'varighed'],
  fi: ['paiva', 'viikko', 'kuukausi', 'arkipaiva', 'kasittelyaika', 'maara aika', 'kesto'],
  is: ['dagur', 'vika', 'manudur', 'virkidagur', 'afgreidslu tid', 'frestur'],

  // Eastern European
  pl: ['dzien', 'tydzien', 'miesiac', 'dzien roboczy', 'czas przetwarzania', 'termin', 'okres'],
  cs: ['den', 'tyden', 'mesic', 'pracovni den', 'doba zpracovani', 'lhuta', 'termin'],
  sk: ['den', 'tyzden', 'mesiac', 'pracovny den', 'cas spracovania', 'lehota', 'termin'],
  hu: ['nap', 'het', 'honap', 'munkanap', 'feldolgozasi ido', 'hatarido', 'idotartam'],
  ro: ['zi', 'saptamana', 'luna', 'zi lucratoare', 'timp de procesare', 'termen', 'durata'],
  bg: ['den', 'sedmitsa', 'mesets', 'raboten den', 'vreme za obrabotka', 'srok'],
  hr: ['dan', 'tjedan', 'mjesec', 'radni dan', 'vrijeme obrade', 'rok', 'trajanje'],
  sl: ['dan', 'teden', 'mesec', 'delovni dan', 'cas obdelave', 'rok', 'trajanje'],
  sr: ['dan', 'nedelja', 'mesec', 'radni dan', 'vreme obrade', 'rok', 'trajanje'],
  uk: ['den', 'tyzhden', 'misyats', 'robochiy den', 'chas obrobky', 'termin', 'strok'],
  ru: ['den', 'nedelya', 'mesyats', 'rabochiy den', 'vremya obrabotki', 'srok', 'period'],
  be: ['dzen', 'tydzen', 'mesyats', 'pracouny dzen', 'termin', 'strok'],

  // Baltic
  lt: ['diena', 'savaite', 'menuo', 'darbo diena', 'apdorojimo laikas', 'terminas', 'trukme'],
  lv: ['diena', 'nedela', 'menesis', 'darba diena', 'apstrades laiks', 'termins', 'ilgums'],
  et: ['paev', 'nadal', 'kuu', 'toopaev', 'menetlusaeg', 'tahtaeg', 'kestus'],

  // Greek & Cypriot
  el: ['mera', 'evdomada', 'minas', 'ergasimi mera', 'chronos epexergasias', 'prothesmia'],

  // Turkish
  tr: ['gun', 'hafta', 'ay', 'is gunu', 'islem suresi', 'sure', 'vade'],

  // Middle Eastern
  ar: ['yawm', 'usbu', 'shahr', 'yawm amal', 'waqt almualaja', 'muda', 'ajal'],
  he: ['yom', 'shavua', 'chodesh', 'yom avoda', 'zman tipul', 'moed acharon'],
  fa: ['ruz', 'hafte', 'mah', 'ruz kari', 'zaman pardazesh', 'mohlet'],

  // South Asian
  hi: ['din', 'hafta', 'mahina', 'karyavasar', 'sansadhan samay', 'avadhis', 'samay seema'],
  bn: ['din', 'soptaho', 'mas', 'kormo dibos', 'prkriya somoy', 'somoy seema'],
  ta: ['naal', 'varam', 'matham', 'velai naal', 'seyal paduthum neram', 'kaalakettu'],
  ur: ['din', 'hafta', 'mahina', 'kaam ka din', 'karwai ka waqt', 'mayyad'],
  mr: ['divas', 'aathavada', 'mahina', 'karyakari divas', 'prakriya vel', 'muddat'],

  // Southeast Asian
  vi: ['ngay', 'tuan', 'thang', 'ngay lam viec', 'thoi gian xu ly', 'thoi han', 'ky han'],
  th: ['wan', 'sapda', 'duean', 'wan thamngaan', 'rawang welaa', 'kaamnot'],
  id: ['hari', 'minggu', 'bulan', 'hari kerja', 'waktu pemrosesan', 'batas waktu', 'durasi'],
  ms: ['hari', 'minggu', 'bulan', 'hari bekerja', 'masa pemprosesan', 'tarikh akhir', 'tempoh'],
  tl: ['araw', 'linggo', 'buwan', 'araw ng trabaho', 'oras ng pagproseso', 'huling araw'],

  // East Asian
  zh: ['tian', 'zhou', 'yue', 'gongzuori', 'chuli shijian', 'qixian', 'shiqi'],
  ja: ['nichi', 'shuu', 'getsu', 'eigyobi', 'shori jikan', 'kigen', 'kikan'],
  ko: ['il', 'ju', 'wol', 'yeongeobil', 'cheori sigan', 'gihan', 'gigan'],

  // African
  sw: ['siku', 'wiki', 'mwezi', 'siku ya kazi', 'muda wa usindikaji', 'ukomo wa muda'],
  am: ['ken', 'samont', 'wer', 'yesra ken', 'yemiserat gize', 'yegize geben'],
  zu: ['usuku', 'iviki', 'inyanga', 'usuku lomsebenzi', 'isikhathi sokusebenza'],

  // Other
  ga: ['la', 'seachtain', 'mi', 'la oibre', 'am proiseala', 'spriocdhat'],
  cy: ['diwrnod', 'wythnos', 'mis', 'diwrnod gwaith', 'amser prosesu', 'dyddiad cau'],
  mt: ['jum', 'gimgha', 'xahar', 'jum tax-xoghol', 'hin tal-ipprocessar', 'skadenza'],
  sq: ['dite', 'jave', 'muaj', 'dite pune', 'kohe perpunimi', 'afat', 'kohezgjatje'],
  mk: ['den', 'nedela', 'mesec', 'raboten den', 'vreme za obrabotka', 'rok'],
  ka: ['dghe', 'kvira', 'tve', 'samusao dghe', 'damusha vebis dro', 'vada'],
  hy: ['or', 'shabat', 'amis', 'ashxatanqayin or', 'mshakman jamanak', 'zhamket'],
  az: ['gun', 'hefte', 'ay', 'is gunu', 'emali muddet', 'son muddet'],
  kk: ['kun', 'apta', 'ay', 'zhuma kuny', 'ondeu uaqyt', 'merzim'],
  uz: ['kun', 'hafta', 'oy', 'ish kuni', 'qayta ishlash vaqti', 'muddat'],
};

/**
 * Requirement indicators by language (40+ languages globally)
 */
const REQUIREMENT_INDICATORS: Record<string, { required: string[]; optional: string[] }> = {
  // Western European
  en: {
    required: ['must', 'required', 'mandatory', 'necessary', 'need', 'shall', 'essential', 'compulsory'],
    optional: ['may', 'optional', 'if applicable', 'recommended', 'can', 'preferred', 'suggested'],
  },
  es: {
    required: ['debe', 'requerido', 'obligatorio', 'necesario', 'exigido', 'imprescindible'],
    optional: ['puede', 'opcional', 'si aplica', 'recomendado', 'voluntario', 'sugerido'],
  },
  pt: {
    required: ['deve', 'obrigatorio', 'necessario', 'exigido', 'requerido', 'indispensavel'],
    optional: ['pode', 'opcional', 'se aplicavel', 'recomendado', 'facultativo', 'sugerido'],
  },
  de: {
    required: ['muss', 'erforderlich', 'pflicht', 'notwendig', 'obligatorisch', 'zwingend'],
    optional: ['kann', 'optional', 'freiwillig', 'empfohlen', 'wahlweise', 'falls zutreffend'],
  },
  fr: {
    required: ['doit', 'requis', 'obligatoire', 'necessaire', 'exige', 'indispensable'],
    optional: ['peut', 'optionnel', 'facultatif', 'recommande', 'volontaire', 'si applicable'],
  },
  it: {
    required: ['deve', 'richiesto', 'obbligatorio', 'necessario', 'indispensabile'],
    optional: ['puo', 'facoltativo', 'opzionale', 'raccomandato', 'volontario', 'consigliato'],
  },
  nl: {
    required: ['moet', 'vereist', 'verplicht', 'noodzakelijk', 'nodig', 'essentieel'],
    optional: ['kan', 'optioneel', 'vrijwillig', 'aanbevolen', 'indien van toepassing'],
  },

  // Nordic
  sv: {
    required: ['maste', 'kravs', 'obligatorisk', 'nodvandig', 'pabjuden'],
    optional: ['kan', 'valfri', 'frivillig', 'rekommenderad', 'om tillampligt'],
  },
  no: {
    required: ['ma', 'kreves', 'obligatorisk', 'nodvendig', 'pakrevd'],
    optional: ['kan', 'valgfri', 'frivillig', 'anbefalt', 'hvis aktuelt'],
  },
  da: {
    required: ['skal', 'kraeves', 'obligatorisk', 'nodvendig', 'pakraevet'],
    optional: ['kan', 'valgfri', 'frivillig', 'anbefalet', 'hvis relevant'],
  },
  fi: {
    required: ['pitaa', 'vaaditaan', 'pakollinen', 'valttamaton', 'tarvitaan'],
    optional: ['voi', 'valinnainen', 'vapaaehtoinen', 'suositeltava', 'jos sovellettavissa'],
  },
  is: {
    required: ['verdur', 'krafa', 'skyldubundinn', 'naudsynlegur'],
    optional: ['ma', 'valfrjalst', 'ralagt', 'ef vid a'],
  },

  // Eastern European
  pl: {
    required: ['musi', 'wymagane', 'obowiazkowy', 'konieczny', 'niezbedny'],
    optional: ['moze', 'opcjonalny', 'dobrowolny', 'zalecany', 'jesli dotyczy'],
  },
  cs: {
    required: ['musi', 'pozadovano', 'povinny', 'nutny', 'nezbytny'],
    optional: ['muze', 'volitelny', 'dobrovolny', 'doporuceny', 'pokud se vztahuje'],
  },
  sk: {
    required: ['musi', 'pozadovane', 'povinny', 'nutny', 'nevyhnutny'],
    optional: ['moze', 'volitelny', 'dobrovolny', 'odporucany', 'ak sa vztahuje'],
  },
  hu: {
    required: ['kell', 'szukseges', 'kotelezo', 'elengedhetetlen', 'megkovetelt'],
    optional: ['lehet', 'valaszthato', 'onkentes', 'ajanlott', 'ha alkalmazhato'],
  },
  ro: {
    required: ['trebuie', 'obligatoriu', 'necesar', 'cerut', 'indispensabil'],
    optional: ['poate', 'optional', 'voluntar', 'recomandat', 'daca este cazul'],
  },
  bg: {
    required: ['tryabva', 'zadulzhitelno', 'neobhodimo', 'iziskvano'],
    optional: ['mozhe', 'po izbor', 'dobrovolno', 'preporuchano'],
  },
  hr: {
    required: ['mora', 'obavezno', 'potrebno', 'neophodno', 'zahtijevano'],
    optional: ['moze', 'neobavezno', 'dobrovoljno', 'preporuceno', 'ako je primjenjivo'],
  },
  sl: {
    required: ['mora', 'obvezno', 'potrebno', 'nujno', 'zahtevano'],
    optional: ['lahko', 'neobvezno', 'prostovoljno', 'priporoceno', 'ce je ustrezno'],
  },
  sr: {
    required: ['mora', 'obavezno', 'neophodno', 'potrebno', 'zahtevano'],
    optional: ['moze', 'opciono', 'dobrovoljno', 'preporuceno', 'ako je primenljivo'],
  },
  uk: {
    required: ['povynen', 'obovyazkovo', 'neobkhidno', 'vymagayetsya'],
    optional: ['mozhe', 'neobyazkovo', 'dobrovil\'no', 'rekomendovano'],
  },
  ru: {
    required: ['dolzhen', 'obyazatelno', 'neobhodimo', 'trebuetsya'],
    optional: ['mozhet', 'neobyzatelno', 'dobrovolno', 'rekomendovano'],
  },
  be: {
    required: ['pavinen', 'abyazkovа', 'neabkhodna', 'patrabuyetsа'],
    optional: ['mozhа', 'neabavyazkova', 'dabravol\'na', 'rekamendavana'],
  },

  // Baltic
  lt: {
    required: ['turi', 'privaloma', 'butina', 'reikalinga'],
    optional: ['gali', 'neprivaloma', 'savanoriska', 'rekomenduojama'],
  },
  lv: {
    required: ['jabut', 'obligats', 'nepieciesams', 'prasits'],
    optional: ['var', 'neobligats', 'brivpratigs', 'ieteicams'],
  },
  et: {
    required: ['peab', 'noutak', 'kohustuslik', 'vajalik'],
    optional: ['voib', 'valikuline', 'vabatahtlik', 'soovitatav'],
  },

  // Greek
  el: {
    required: ['prepei', 'apaiteitai', 'ypochreotikos', 'anagkaios'],
    optional: ['mporei', 'proairetikos', 'ethelontikos', 'synistomenos'],
  },

  // Turkish
  tr: {
    required: ['gerekli', 'zorunlu', 'sart', 'mecburi', 'lazim'],
    optional: ['olabilir', 'istege bagli', 'gonullu', 'tavsiye edilen'],
  },

  // Middle Eastern
  ar: {
    required: ['yajib', 'matlub', 'ilzami', 'daruri', 'lazim'],
    optional: ['yumkin', 'ikhtiyari', 'tatawui', 'muqtarah'],
  },
  he: {
    required: ['hayav', 'darush', 'hova', 'mehuyav', 'nahuts'],
    optional: ['yakhol', 'rishut', 'hitnadvut', 'mumlats'],
  },
  fa: {
    required: ['bayad', 'lazem', 'elzami', 'zaroori'],
    optional: ['mitavanad', 'ekhtiyari', 'pishnahadi', 'tavsieh shode'],
  },

  // South Asian
  hi: {
    required: ['chahiye', 'avashyak', 'anivarya', 'jaruri', 'zaruri'],
    optional: ['sakta', 'vaikalpik', 'svaichchik', 'anushansit'],
  },
  bn: {
    required: ['chai', 'proyojon', 'baddhotamulok', 'dorkar'],
    optional: ['pare', 'boikalpik', 'swecchay', 'poramorsho'],
  },
  ta: {
    required: ['vendum', 'thevaiyaana', 'kattaayam'],
    optional: ['seyyalam', 'virumbiyin', 'parihandhanappadum'],
  },
  ur: {
    required: ['chahiye', 'lazmi', 'zaruri', 'wajib'],
    optional: ['sakta', 'ikhtiari', 'marzi', 'tajweez'],
  },
  mr: {
    required: ['pahije', 'avashyak', 'bandhankarak', 'garajecha'],
    optional: ['shakto', 'vaikalpik', 'svaichchik', 'shipharis'],
  },

  // Southeast Asian
  vi: {
    required: ['phai', 'bat buoc', 'can thiet', 'yeu cau'],
    optional: ['co the', 'khong bat buoc', 'tu nguyen', 'khuyen nghi'],
  },
  th: {
    required: ['tong', 'champen', 'bangkhap', 'chamloen'],
    optional: ['samaat', 'mai bangkhap', 'samak chai', 'naenam'],
  },
  id: {
    required: ['harus', 'wajib', 'diperlukan', 'dibutuhkan'],
    optional: ['dapat', 'opsional', 'sukarela', 'disarankan', 'jika berlaku'],
  },
  ms: {
    required: ['mesti', 'wajib', 'diperlukan', 'perlu'],
    optional: ['boleh', 'pilihan', 'sukarela', 'disyorkan', 'jika berkenaan'],
  },
  tl: {
    required: ['dapat', 'kailangan', 'kinakailangan', 'obligado'],
    optional: ['maaari', 'opsyonal', 'boluntaryo', 'inirerekomenda'],
  },

  // East Asian
  zh: {
    required: ['bixu', 'yaoqiu', 'qiangzhi', 'biyao'],
    optional: ['keyi', 'kexuan', 'ziyuan', 'jianyi'],
  },
  ja: {
    required: ['hitsuyou', 'gimu', 'hissu', 'youkyuu'],
    optional: ['kanousei', 'ninni', 'suisen', 'osusume'],
  },
  ko: {
    required: ['pilyoham', 'pilsu', 'uimu', 'yogu'],
    optional: ['hal su', 'seontaek', 'jayul', 'gwongo'],
  },

  // African
  sw: {
    required: ['lazima', 'inahitajika', 'ya lazima', 'sharti'],
    optional: ['inaweza', 'si lazima', 'hiari', 'inapendekezwa'],
  },
  am: {
    required: ['alegbet', 'yastselegal', 'gebari', 'asfelagi'],
    optional: ['yichalal', 'mircha', 'befelagot', 'yemitaseb'],
  },
  zu: {
    required: ['kufanele', 'kudingeka', 'kuphoqelekile'],
    optional: ['kungenzeka', 'okukhethwa', 'ngokuzithandela', 'okunconyiwe'],
  },

  // Other
  ga: {
    required: ['caithfidh', 'riachtanach', 'eigeantach', 'gearrtha'],
    optional: ['is feidir', 'roghnach', 'deonach', 'molta'],
  },
  cy: {
    required: ['rhaid', 'gofynnol', 'angenrheidiol', 'gorfodol'],
    optional: ['gall', 'dewisol', 'gwirfoddol', 'argymhellir'],
  },
  mt: {
    required: ['ghandu', 'mehtieg', 'obbligatorju', 'necessarju'],
    optional: ['jista', 'mhux obbligatorju', 'volontarju', 'rrakkomandat'],
  },
  sq: {
    required: ['duhet', 'e detyrushme', 'e nevojshme', 'e kerkuar'],
    optional: ['mund', 'opsionale', 'vullnetare', 'e rekomanduar'],
  },
  mk: {
    required: ['mora', 'zadolzhitelno', 'potrebno', 'neophodno'],
    optional: ['moze', 'opcionalno', 'dobrovolno', 'preporachano'],
  },
  ka: {
    required: ['unda', 'savaldebulo', 'auzlebeli', 'motkhovnili'],
    optional: ['sheudzlia', 'nebayoflobitiа', 'nebayrnebit', 'rekomendebuli'],
  },
  hy: {
    required: ['piti', 'pahanjvum', 'partadir', 'anhrzhesht'],
    optional: ['karogh', 'yntranveli', 'kamavorakan', 'khorhrdatrvac'],
  },
  az: {
    required: ['lazimdir', 'teleb olunur', 'mecburidir', 'zeruridir'],
    optional: ['ola biler', 'isteye bagli', 'konullu', 'tovsiye olunur'],
  },
  kk: {
    required: ['kerek', 'miндеттi', 'қажеттi', 'talap etiledi'],
    optional: ['mumkin', 'таңдау boiynsha', 'erikti', 'usuniladi'],
  },
  uz: {
    required: ['kerak', 'majburiy', 'zarur', 'talab qilinadi'],
    optional: ['mumkin', 'ixtiyoriy', 'ko\'ngilli', 'tavsiya etiladi'],
  },
};

// ============================================
// EXTRACTOR CLASS
// ============================================

/**
 * Extracts structured data from government portal HTML
 */
export class StructuredGovDataExtractor {
  private defaultCurrency: string = 'EUR';

  /**
   * Set the default currency for fee extraction
   */
  setDefaultCurrency(currency: string): void {
    this.defaultCurrency = currency;
  }

  /**
   * Extract structured government data from HTML content
   */
  extract(html: string, options: ExtractionOptions = {}): StructuredGovData {
    const contentType = options.contentType || 'general';
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
    const result: StructuredGovData = {
      contentType,
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

    // Extract based on content type
    let extractedCount = 0;
    switch (contentType) {
      case 'requirements':
      case 'eligibility':
        result.requirements = this.extractRequirements(text, lowerText, language);
        extractedCount = result.requirements.length;
        break;

      case 'documents':
        result.documents = this.extractDocuments(text, lowerText, language);
        extractedCount = result.documents.length;
        break;

      case 'fees':
        result.fees = this.extractFees(text, lowerText, language);
        extractedCount = result.fees.length;
        break;

      case 'timeline':
        result.timeline = this.extractTimeline(text, lowerText, language);
        extractedCount = result.timeline.length;
        break;

      case 'forms':
        result.forms = this.extractForms(text, language);
        extractedCount = result.forms.length;
        break;

      case 'contact':
        result.contact = this.extractContact(text, language);
        extractedCount = result.contact ? 1 : 0;
        break;

      case 'appointment':
        result.appointment = this.extractAppointment(text, lowerText, language);
        extractedCount = result.appointment ? 1 : 0;
        break;

      case 'general':
      default:
        // Extract all types for general content
        result.requirements = this.extractRequirements(text, lowerText, language);
        result.documents = this.extractDocuments(text, lowerText, language);
        result.fees = this.extractFees(text, lowerText, language);
        result.timeline = this.extractTimeline(text, lowerText, language);
        result.forms = this.extractForms(text, language);
        result.contact = this.extractContact(text, language);
        result.appointment = this.extractAppointment(text, lowerText, language);

        extractedCount =
          (result.requirements?.length || 0) +
          (result.documents?.length || 0) +
          (result.fees?.length || 0) +
          (result.timeline?.length || 0) +
          (result.forms?.length || 0) +
          (result.contact ? 1 : 0) +
          (result.appointment ? 1 : 0);
        break;
    }

    // Calculate confidence based on extraction success
    if (text.length < 100) {
      result.confidence = 0.2;
      warnings.push('Very short content - extraction may be incomplete');
    } else if (extractedCount === 0) {
      result.confidence = 0.3;
      warnings.push('No ' + contentType + ' data found in content');
    } else if (extractedCount < 3) {
      result.confidence = 0.6;
    } else {
      result.confidence = 0.85;
    }

    // Boost confidence if language matched reliably
    if (languageDetection && languageDetection.confidence > 0.8) {
      result.confidence = Math.min(result.confidence + 0.1, 1.0);
    }

    return result;
  }

  /**
   * Validate extracted data against expected schema
   */
  validate(data: StructuredGovData): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Basic validation
    if (!data.contentType) {
      errors.push({
        path: 'contentType',
        message: 'Missing content type',
        expected: 'string',
        actual: 'undefined',
      });
    }

    if (!data.language) {
      errors.push({
        path: 'language',
        message: 'Missing language',
        expected: 'string',
        actual: 'undefined',
      });
    }

    if (typeof data.confidence !== 'number' || data.confidence < 0 || data.confidence > 1) {
      errors.push({
        path: 'confidence',
        message: 'Invalid confidence value',
        expected: 'number between 0 and 1',
        actual: String(data.confidence),
      });
    }

    // Content-specific validation
    if (data.fees) {
      for (let i = 0; i < data.fees.length; i++) {
        const fee = data.fees[i];
        if (!fee.description) {
          warnings.push({
            path: 'fees[' + i + '].description',
            message: 'Fee missing description',
          });
        }
        if (!fee.amount || typeof fee.amount.amount !== 'number' || isNaN(fee.amount.amount)) {
          errors.push({
            path: 'fees[' + i + '].amount',
            message: 'Invalid fee amount',
            expected: 'MonetaryValue with numeric amount',
            actual: JSON.stringify(fee.amount),
          });
        }
      }
    }

    if (data.documents) {
      for (let i = 0; i < data.documents.length; i++) {
        const doc = data.documents[i];
        if (!doc.name) {
          errors.push({
            path: 'documents[' + i + '].name',
            message: 'Document missing name',
            expected: 'string',
            actual: 'undefined',
          });
        }
      }
    }

    if (data.requirements) {
      for (let i = 0; i < data.requirements.length; i++) {
        const req = data.requirements[i];
        if (!req.description) {
          errors.push({
            path: 'requirements[' + i + '].description',
            message: 'Requirement missing description',
            expected: 'string',
            actual: 'undefined',
          });
        }
      }
    }

    if (data.timeline) {
      for (let i = 0; i < data.timeline.length; i++) {
        const step = data.timeline[i];
        if (!step.name) {
          errors.push({
            path: 'timeline[' + i + '].name',
            message: 'Timeline step missing name',
            expected: 'string',
            actual: 'undefined',
          });
        }
      }
    }

    // Contact validation
    if (data.contact) {
      const hasContact =
        data.contact.phone ||
        data.contact.email ||
        data.contact.address ||
        data.contact.website;
      if (!hasContact) {
        warnings.push({
          path: 'contact',
          message: 'Contact info has no useful fields',
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ============================================
  // PRIVATE EXTRACTION METHODS
  // ============================================

  /**
   * Extract requirements/eligibility from text
   */
  private extractRequirements(
    text: string,
    lowerText: string,
    language: string
  ): EligibilityRequirement[] {
    const requirements: EligibilityRequirement[] = [];
    const indicators = REQUIREMENT_INDICATORS[language] || REQUIREMENT_INDICATORS.en;

    // Look for bullet points and numbered lists
    const listPatterns = [
      /^[\s]*[-*\u2022]\s+(.+)$/gm,  // Bullet points
      /^[\s]*\d+[.)]\s+(.+)$/gm,     // Numbered lists
      /^[\s]*[a-z][.)]\s+(.+)$/gim,  // Lettered lists
    ];

    for (const pattern of listPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const item = match[1].trim();
        if (item.length < 10) continue;
        this.addRequirement(requirements, item, indicators);
      }
    }

    // Also extract lines that contain requirement keywords
    // This catches requirements from HTML lists that were converted to plain text
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.length < 15 || trimmedLine.length > 300) continue;

      const lowerLine = trimmedLine.toLowerCase();

      // Check if line contains requirement indicators
      const hasRequirementKeyword = indicators.required.some(kw => lowerLine.includes(kw)) ||
        indicators.optional.some(kw => lowerLine.includes(kw));

      // Check for age/income/residency/employment patterns
      const hasRequirementPattern = /\d+\s*(years|anos|ans|jahre|age|edad|idade)/i.test(lowerLine) ||
        /income|salary|ingresos|rendimentos|einkommen|revenu/i.test(lowerLine) ||
        /resident|residencia|wohnsitz|residence/i.test(lowerLine) ||
        /passport|pasaporte|passaporte|reisepass/i.test(lowerLine);

      if (hasRequirementKeyword || hasRequirementPattern) {
        this.addRequirement(requirements, trimmedLine, indicators);
      }
    }

    // Dedupe by description
    const seen = new Set<string>();
    return requirements.filter(req => {
      const key = req.description.toLowerCase().slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Add a requirement to the list with proper categorization
   */
  private addRequirement(
    requirements: EligibilityRequirement[],
    item: string,
    indicators: { required: string[]; optional: string[] }
  ): void {
    const lowerItem = item.toLowerCase();

    // Determine if required or optional
    const isRequired = indicators.required.some(kw => lowerItem.includes(kw));
    const isOptional = indicators.optional.some(kw => lowerItem.includes(kw));

    // Categorize requirement
    let category: EligibilityRequirement['category'] = 'other';
    if (/age|edad|idade|alter|\d+\s*(years|anos|ans|jahre)/i.test(lowerItem)) {
      category = 'age';
    } else if (/income|salary|ingresos|rendimentos|einkommen|revenu/i.test(lowerItem)) {
      category = 'income';
    } else if (/resident|residencia|wohnsitz|residence/i.test(lowerItem)) {
      category = 'residency';
    } else if (/employ|trabajo|trabalho|arbeit|emploi/i.test(lowerItem)) {
      category = 'employment';
    }

    requirements.push({
      description: item,
      category,
      mandatory: isRequired || !isOptional,
      notes: isOptional ? 'Optional' : undefined,
    });
  }

  /**
   * Extract document requirements from text
   */
  private extractDocuments(
    text: string,
    lowerText: string,
    language: string
  ): DocumentRequirement[] {
    const documents: DocumentRequirement[] = [];
    const keywords = DOCUMENT_KEYWORDS[language] || DOCUMENT_KEYWORDS.en;
    const indicators = REQUIREMENT_INDICATORS[language] || REQUIREMENT_INDICATORS.en;
    const lines = text.split('\n');

    // Common document patterns
    const docPatterns = [
      /passport|pasaporte|passaporte|reisepass/gi,
      /id\s*card|dni|documento.*identidad|ausweis|carte.*identit/gi,
      /photo|foto|fotografia|bild/gi,
      /certificate|certificado|bescheinigung|certificat|attestation/gi,
      /proof\s+of|justificante|comprovante|nachweis|justificatif/gi,
      /form|formulario|formular|modulo/gi,
      /contract|contrato|vertrag/gi,
      /insurance|seguro|versicherung|assurance/gi,
      /criminal.*record|antecedentes|casier.*judiciaire/gi,
    ];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.length < 5) continue;

      const lowerLine = trimmedLine.toLowerCase();

      // Check if line mentions a document
      const hasDocKeyword = keywords.some(kw => lowerLine.includes(kw));
      const matchesDocPattern = docPatterns.some(p => p.test(trimmedLine));

      if (hasDocKeyword || matchesDocPattern) {
        const isOptional = indicators.optional.some(kw => lowerLine.includes(kw));

        // Extract form number if present
        const formMatch = trimmedLine.match(/(?:model[oa]?|form|formulario?)\s*(\d+)/i);

        documents.push({
          name: trimmedLine.replace(/^[-*\u2022\d.)\s]+/, '').trim(),
          required: !isOptional,
          formNumber: formMatch ? formMatch[1] : undefined,
        });
      }
    }

    // Dedupe by name
    const seen = new Set<string>();
    return documents.filter(doc => {
      const key = doc.name.toLowerCase().slice(0, 30);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Extract fees from text
   */
  private extractFees(text: string, lowerText: string, language: string): FeeEntry[] {
    const fees: FeeEntry[] = [];
    const keywords = FEE_KEYWORDS[language] || FEE_KEYWORDS.en;

    const lines = text.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.length < 5) continue;

      const lowerLine = trimmedLine.toLowerCase();

      // Check if line mentions fees
      const hasFeeKeyword = keywords.some(kw => lowerLine.includes(kw));
      if (!hasFeeKeyword) continue;

      // Extract monetary values
      const monetary = this.extractMonetaryValue(trimmedLine);
      if (monetary) {
        // Extract form number if present
        const formMatch = trimmedLine.match(/(?:model[oa]?|form)\s*(\d+)/i);

        fees.push({
          description: trimmedLine.replace(/^[-*\u2022\d.)\s]+/, '').trim(),
          amount: monetary,
          formNumber: formMatch ? formMatch[1] : undefined,
        });
      }
    }

    return fees;
  }

  /**
   * Extract timeline/processing steps from text
   */
  private extractTimeline(
    text: string,
    lowerText: string,
    language: string
  ): ProcessingStep[] {
    const steps: ProcessingStep[] = [];
    const keywords = TIMELINE_KEYWORDS[language] || TIMELINE_KEYWORDS.en;

    const lines = text.split('\n');
    let stepOrder = 1;

    // Duration patterns
    const durationPatterns = [
      /(\d+)\s*(?:-\s*\d+)?\s*(days?|dias?|tage?|jours?|giorni?|dagen?)/gi,
      /(\d+)\s*(?:-\s*\d+)?\s*(weeks?|semanas?|wochen?|semaines?|settimane?|weken?)/gi,
      /(\d+)\s*(?:-\s*\d+)?\s*(months?|meses?|monate?|mois|mesi|maanden?)/gi,
      /(\d+)\s*(?:-\s*\d+)?\s*(working\s*days?|dias?\s*habiles?|werktage?|jours?\s*ouvrables?)/gi,
    ];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.length < 10) continue;

      const lowerLine = trimmedLine.toLowerCase();

      // Check if line mentions time
      const hasTimeKeyword = keywords.some(kw => lowerLine.includes(kw));

      // Look for duration patterns
      let duration: TimelineValue | undefined;
      for (const pattern of durationPatterns) {
        const match = pattern.exec(trimmedLine);
        if (match) {
          const days = this.parseDuration(match[0], language);
          duration = {
            durationDays: days,
            durationText: match[0],
            original: match[0],
          };
          break;
        }
      }

      if (hasTimeKeyword || duration) {
        steps.push({
          name: trimmedLine.replace(/^[-*\u2022\d.)\s]+/, '').trim(),
          duration,
          order: stepOrder++,
        });
      }
    }

    return steps;
  }

  /**
   * Extract form information from text
   */
  private extractForms(text: string, language: string): FormInfo[] {
    const forms: FormInfo[] = [];

    // Form patterns for different countries (global coverage)
    const formPatterns = [
      // Western Europe
      // Spain: Modelo 790, formulario 030
      /(?:model[oa]?|formulario?)\s*(\d+[A-Z]?)/gi,
      // Germany: Formular, Antrag, Vordruck
      /(?:formular|antrag|vordruck)\s*[:\s]*([A-Z0-9-]+)/gi,
      // France: Cerfa, Formulaire
      /(?:cerfa|formulaire)\s*[:\s]*n?[o°]?\s*(\d+[\*]?\d*)/gi,
      // Italy: Modulo, Modello
      /(?:modul[oi]|modello)\s*[:\s]*([A-Z0-9-]+)/gi,
      // Netherlands: Formulier
      /(?:formulier)\s*[:\s]*([A-Z0-9-]+)/gi,

      // Nordic
      // Sweden: Blankett
      /(?:blankett)\s*[:\s]*([A-Z0-9-]+)/gi,
      // Norway/Denmark: Skjema
      /(?:skjema|skema)\s*[:\s]*([A-Z0-9-]+)/gi,
      // Finland: Lomake
      /(?:lomake)\s*[:\s]*([A-Z0-9-]+)/gi,

      // Eastern Europe
      // Poland: Formularz, Wniosek
      /(?:formularz|wniosek)\s*[:\s]*([A-Z0-9-]+)/gi,
      // Czech/Slovak: Formulár, Žádost
      /(?:formular|zadost|ziadost)\s*[:\s]*([A-Z0-9-]+)/gi,
      // Hungary: Űrlap, Nyomtatvány
      /(?:urlap|nyomtatvany)\s*[:\s]*([A-Z0-9-]+)/gi,
      // Romania: Formular, Cerere
      /(?:cerere)\s*[:\s]*([A-Z0-9-]+)/gi,
      // Russia/Ukraine: Форма, Заявка (transliterated)
      /(?:forma|zayavka|zayava|blanк)\s*[:\s]*([A-Z0-9-]+)/gi,

      // Baltic
      // Lithuania: Forma, Prašymas
      /(?:prasymas)\s*[:\s]*([A-Z0-9-]+)/gi,
      // Latvia: Veidlapa, Iesniegums
      /(?:veidlapa|iesniegums)\s*[:\s]*([A-Z0-9-]+)/gi,
      // Estonia: Vorm, Avaldus
      /(?:vorm|avaldus)\s*[:\s]*([A-Z0-9-]+)/gi,

      // Greek
      /(?:entypo|aitisi)\s*[:\s]*([A-Z0-9-]+)/gi,

      // Turkish
      /(?:form|basvuru|dilekce)\s*[:\s]*([A-Z0-9-]+)/gi,

      // Middle East
      // Arabic (transliterated): Istimara, Namodhaj
      /(?:istimara|namodhaj|form)\s*[:\s]*([A-Z0-9-]+)/gi,
      // Hebrew (transliterated): Tofes
      /(?:tofes|tavnit)\s*[:\s]*([A-Z0-9-]+)/gi,

      // South Asia
      // India: Form (English commonly used)
      /(?:form|aavedan|prarthana)\s*[:\s]*([A-Z0-9-]+)/gi,

      // Southeast Asia
      // Indonesia: Formulir
      /(?:formulir|surat)\s*[:\s]*([A-Z0-9-]+)/gi,
      // Malaysia: Borang
      /(?:borang)\s*[:\s]*([A-Z0-9-]+)/gi,
      // Vietnam: Mẫu đơn (transliterated)
      /(?:mau don|mau)\s*[:\s]*([A-Z0-9-]+)/gi,
      // Philippines: Porma
      /(?:porma)\s*[:\s]*([A-Z0-9-]+)/gi,

      // East Asia
      // China (transliterated): Biaoge
      /(?:biaoge)\s*[:\s]*([A-Z0-9-]+)/gi,
      // Japan (transliterated): Yoshiki
      /(?:yoshiki)\s*[:\s]*([A-Z0-9-]+)/gi,
      // Korea (transliterated): Yangshik
      /(?:yangshik)\s*[:\s]*([A-Z0-9-]+)/gi,

      // Africa
      // Swahili: Fomu
      /(?:fomu)\s*[:\s]*([A-Z0-9-]+)/gi,

      // Other
      // Irish: Foirm
      /(?:foirm)\s*[:\s]*([A-Z0-9-]+)/gi,
      // Welsh: Ffurflen
      /(?:ffurflen)\s*[:\s]*([A-Z0-9-]+)/gi,
      // Maltese: Formola
      /(?:formola)\s*[:\s]*([A-Z0-9-]+)/gi,
      // Albanian: Formular
      /(?:kerkese)\s*[:\s]*([A-Z0-9-]+)/gi,

      // USA/UK/Canada/Australia: Common patterns
      /(?:form)\s+([A-Z]{1,2}[\s-]?\d+[A-Z]?)/gi, // Form I-94, Form W-2
      /(?:schedule)\s+([A-Z0-9]+)/gi, // Schedule K-1
      /(?:application)\s+(?:form\s+)?([A-Z0-9-]+)/gi,

      // Generic fallback: Form followed by number/code
      /form\s+([A-Z0-9-]+)/gi,
    ];

    const lines = text.split('\n');
    const seen = new Set<string>();

    for (const line of lines) {
      for (const pattern of formPatterns) {
        let match;
        while ((match = pattern.exec(line)) !== null) {
          const formNumber = match[1].toUpperCase();
          if (seen.has(formNumber)) continue;
          seen.add(formNumber);

          // Look for URL in same line or nearby
          const urlMatch = line.match(/https?:\/\/[^\s]+/);

          forms.push({
            formNumber,
            name: line.trim().slice(0, 100),
            downloadUrl: urlMatch ? urlMatch[0] : undefined,
          });
        }
      }
    }

    return forms;
  }

  /**
   * Extract contact information from text
   */
  private extractContact(text: string, language: string): ContactInfo | undefined {
    const contact: ContactInfo = {};

    // Phone patterns (international format)
    const phonePatterns = [
      /(?:tel|phone|telefono?|telefone?|telefon)[:.\s]*([+]?[\d\s()-]{8,20})/gi,
      /([+]\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4})/g,
    ];

    // Email pattern
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

    // Website pattern
    const websitePattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;

    // Extract phones
    const phones: string[] = [];
    for (const pattern of phonePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const phone = match[1] || match[0];
        if (phone.replace(/\D/g, '').length >= 8) {
          phones.push(phone.trim());
        }
      }
    }
    if (phones.length > 0) {
      contact.phone = [...new Set(phones)];
    }

    // Extract emails
    const emails: string[] = [];
    let match;
    while ((match = emailPattern.exec(text)) !== null) {
      emails.push(match[0].toLowerCase());
    }
    if (emails.length > 0) {
      contact.email = [...new Set(emails)];
    }

    // Extract website
    const websites: string[] = [];
    while ((match = websitePattern.exec(text)) !== null) {
      // Filter out common non-contact URLs
      const url = match[0];
      if (!url.includes('facebook.com') && !url.includes('twitter.com') && !url.includes('instagram.com')) {
        websites.push(url);
      }
    }
    if (websites.length > 0) {
      contact.website = websites[0];
    }

    // Extract address (look for patterns with street, city, postal code)
    const addressPatterns = [
      // Street with number
      /(?:calle|rua|rue|strasse|street|via|av\.|avenida)\s+[^,\n]{5,50}/gi,
      // Postal code patterns
      /\d{4,5}[-\s]?\d{0,4}\s+[A-Za-z]+/g,
    ];

    for (const pattern of addressPatterns) {
      const addrMatch = pattern.exec(text);
      if (addrMatch && !contact.address) {
        contact.address = addrMatch[0].trim();
        break;
      }
    }

    // Return undefined if no contact info found
    if (!contact.phone && !contact.email && !contact.website && !contact.address) {
      return undefined;
    }

    return contact;
  }

  /**
   * Extract appointment/booking information from text
   */
  private extractAppointment(
    text: string,
    lowerText: string,
    language: string
  ): AppointmentInfo | undefined {
    // Appointment keywords by language (40+ languages globally)
    const appointmentKeywords: Record<string, string[]> = {
      // Western European
      en: ['appointment', 'booking', 'schedule', 'reserve', 'book online'],
      es: ['cita', 'cita previa', 'reserva', 'turno', 'pedir cita'],
      pt: ['agendamento', 'marcacao', 'reserva', 'marcar atendimento'],
      de: ['termin', 'terminvereinbarung', 'buchung', 'termin buchen', 'termin vereinbaren'],
      fr: ['rendez-vous', 'rdv', 'reservation', 'prendre rendez-vous'],
      it: ['appuntamento', 'prenotazione', 'prenota', 'fissare appuntamento'],
      nl: ['afspraak', 'reservering', 'afspraak maken', 'boeking'],

      // Nordic
      sv: ['bokning', 'boka tid', 'tidsbokning', 'besokstid'],
      no: ['timebestilling', 'bestill time', 'avtale'],
      da: ['tidsbestilling', 'book tid', 'aftale'],
      fi: ['ajanvaraus', 'varaa aika', 'tapaaminen'],
      is: ['tidapontun', 'boka tid'],

      // Eastern European
      pl: ['wizyta', 'rezerwacja', 'umow wizyte', 'zarezerwuj termin'],
      cs: ['objednat', 'rezervace', 'termin', 'schuze'],
      sk: ['objednat sa', 'rezervacia', 'termin', 'stretnutie'],
      hu: ['idopont foglalas', 'idopont', 'foglalj idopontot'],
      ro: ['programare', 'rezervare', 'face programare'],
      bg: ['zapis', 'rezervatsiya', 'sreshta', 'zapishete se'],
      hr: ['rezervacija', 'dogovor', 'termin', 'naruci se'],
      sl: ['rezervacija', 'termin', 'narocilo'],
      sr: ['zakazivanje', 'termin', 'rezervacija'],
      uk: ['zapys', 'bronuvannya', 'pryznachennya', 'zabroniuvaty'],
      ru: ['zapis', 'bronirovanie', 'nazhnachit vstrechu', 'zapisatsya'],
      be: ['zapіs', 'branіravanne', 'sustreach'],

      // Baltic
      lt: ['registracija', 'rezervacija', 'susitarimas', 'uzsiregistruoti'],
      lv: ['pieraksts', 'rezervacija', 'pierakstities', 'laika rezervesana'],
      et: ['broneerimine', 'ajabroneering', 'registreerumine'],

      // Greek
      el: ['rantevou', 'kratisi', 'prografteite'],

      // Turkish
      tr: ['randevu', 'rezervasyon', 'randevu al', 'online randevu'],

      // Middle Eastern
      ar: ['mawid', 'hajz', 'hajz mawid', 'tasjil mawid'],
      he: ['tor', 'hzmanat tor', 'kviat pgisha', 'zimun'],
      fa: ['nobat', 'rezerv', 'vaght gereftna'],

      // South Asian
      hi: ['appointment', 'booking', 'samay nirdharit', 'slot book'],
      bn: ['appointment', 'somoy dharikaran', 'booking'],
      ta: ['neramneram', 'booking', 'appointment'],
      ur: ['mulaqat', 'booking', 'waqt miqrar'],
      mr: ['bhet', 'booking', 'vel aarakhit'],

      // Southeast Asian
      vi: ['dat hen', 'dat lich', 'hen', 'cuoc hen'],
      th: ['nat phop', 'chong', 'booking'],
      id: ['janji temu', 'reservasi', 'booking', 'buat janji'],
      ms: ['temujanji', 'tempahan', 'buat temujanji'],
      tl: ['appointment', 'booking', 'iskedyul'],

      // East Asian
      zh: ['yuyue', 'yuding', 'booking'],
      ja: ['yoyaku', 'booking', 'apoint'],
      ko: ['yeyak', 'booking', 'appointment'],

      // African
      sw: ['miadi', 'uhifadhi', 'panga miadi'],
      am: ['qetero', 'booking', 'appointment'],
      zu: ['ukubhuka', 'isivumelwano'],

      // Other
      ga: ['coinne', 'cuir in airithe'],
      cy: ['apwyntiad', 'archebu'],
      mt: ['appuntament', 'booking'],
      sq: ['takim', 'rezervim', 'prenotim'],
      mk: ['termin', 'rezervacija', 'zakazuvanje'],
      ka: ['chaweris', 'rezervatsia', 'shekhvedris danisnva'],
      hy: ['zhanaamapet', 'amragrum'],
      az: ['gorusme', 'rezervasiya', 'randevu'],
      kk: ['kezdesu', 'brondarj', 'uakyt tagyayndau'],
      uz: ['uchrashuv', 'bronlash', 'uchrashuv belgilash'],
    };

    const keywords = appointmentKeywords[language] || appointmentKeywords.en;
    const hasAppointmentMention = keywords.some(kw => lowerText.includes(kw));

    if (!hasAppointmentMention) {
      return undefined;
    }

    const appointment: AppointmentInfo = {
      required: false,
    };

    // Determine if appointment is required
    const indicators = REQUIREMENT_INDICATORS[language] || REQUIREMENT_INDICATORS.en;
    const appointmentContext = text.toLowerCase();
    appointment.required = indicators.required.some(kw =>
      appointmentContext.includes(kw) &&
      keywords.some(ak => appointmentContext.includes(ak))
    );

    // Look for booking URL (global patterns)
    const urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]*(?:cita|termin|appointment|booking|agenda|rendez-vous|rdv|prenotazione|afspraak|yuyue|yoyaku|randevu|mawid|rezerv|ajanvaraus|tidsbokning)[^\s<>"{}|\\^`[\]]*/gi;
    const urlMatch = urlPattern.exec(text);
    if (urlMatch) {
      appointment.bookingUrl = urlMatch[0];
    }

    // Extract system name
    for (const kw of keywords) {
      if (lowerText.includes(kw)) {
        appointment.systemName = kw;
        break;
      }
    }

    return appointment;
  }

  /**
   * Extract a monetary value from text
   */
  private extractMonetaryValue(text: string): MonetaryValue | undefined {
    // Patterns for different currency formats
    const patterns = [
      // Euro: 100 EUR, 100,50 EUR, 100.50 EUR, EUR 100
      { regex: /(\d+[.,]?\d*)\s*(EUR|euros?)/gi, currency: 'EUR' },
      { regex: /(EUR)\s*(\d+[.,]?\d*)/gi, currency: 'EUR', amountGroup: 2 },
      // Dollar: $100, 100 USD
      { regex: /\$\s*(\d+[.,]?\d*)/gi, currency: 'USD' },
      { regex: /(\d+[.,]?\d*)\s*(USD|dollars?)/gi, currency: 'USD' },
      // Pound: 100 GBP
      { regex: /(\d+[.,]?\d*)\s*(GBP|pounds?)/gi, currency: 'GBP' },
      // Generic with currency code
      { regex: /(\d+[.,]?\d*)\s*([A-Z]{3})/g, currency: null },
    ];

    for (const { regex, currency, amountGroup } of patterns) {
      const match = regex.exec(text);
      if (match) {
        // Parse the amount
        let amountStr = match[amountGroup || 1];
        // Handle European decimal format (1.000,50 -> 1000.50)
        if (amountStr.includes(',') && amountStr.includes('.')) {
          amountStr = amountStr.replace(/\./g, '').replace(',', '.');
        } else if (amountStr.includes(',')) {
          amountStr = amountStr.replace(',', '.');
        }

        const amount = parseFloat(amountStr);
        if (!isNaN(amount) && amount > 0) {
          return {
            amount,
            currency: currency || match[2] || this.defaultCurrency,
            original: match[0],
          };
        }
      }
    }

    return undefined;
  }

  /**
   * Parse a duration string to days
   */
  private parseDuration(text: string, language: string): number | undefined {
    const lowerText = text.toLowerCase();

    // Extract number
    const numMatch = lowerText.match(/(\d+)/);
    if (!numMatch) return undefined;

    const num = parseInt(numMatch[1], 10);

    // Determine unit
    if (/weeks?|semanas?|wochen?|semaines?|settimane?|weken?/i.test(lowerText)) {
      return num * 7;
    } else if (/months?|meses?|monate?|mois|mesi|maanden?/i.test(lowerText)) {
      return num * 30;
    } else if (/working\s*days?|dias?\s*habiles?|werktage?|jours?\s*ouvrables?/i.test(lowerText)) {
      return Math.ceil(num * 1.4); // Approximate working days to calendar days
    } else if (/days?|dias?|tage?|jours?|giorni?|dagen?/i.test(lowerText)) {
      return num;
    }

    return undefined;
  }
}

// ============================================
// FACTORY FUNCTION
// ============================================

/**
 * Create a new StructuredGovDataExtractor
 */
export function createGovDataExtractor(): StructuredGovDataExtractor {
  return new StructuredGovDataExtractor();
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Extract structured government data from HTML
 */
export function extractGovData(html: string, options?: ExtractionOptions): StructuredGovData {
  const extractor = new StructuredGovDataExtractor();
  return extractor.extract(html, options);
}

/**
 * Validate structured government data
 */
export function validateGovData(data: StructuredGovData): ValidationResult {
  const extractor = new StructuredGovDataExtractor();
  return extractor.validate(data);
}
