/**
 * Field-Level Change Tracker (INT-014)
 *
 * Tracks specific field changes in structured content with:
 * - Before/after diff output for each field
 * - Severity classification (breaking, major, minor, cosmetic)
 * - Field categorization (fee, deadline, requirement, contact, etc.)
 * - Multi-language support for field name matching
 * - Change history tracking with persistence
 *
 * @example
 * ```typescript
 * import { FieldLevelChangeTracker } from 'llm-browser/sdk';
 *
 * const tracker = new FieldLevelChangeTracker();
 *
 * // Track changes between two data snapshots
 * const changes = tracker.trackChanges(oldData, newData, {
 *   url: 'https://gov.example.com/visa',
 *   category: 'visa_requirements',
 * });
 *
 * // Filter for breaking changes only
 * const breakingChanges = changes.changes.filter(c => c.severity === 'breaking');
 * ```
 */

import { PersistentStore, createPersistentStore } from '../utils/persistent-store.js';
import { logger } from '../utils/logger.js';

// ============================================
// TYPES
// ============================================

/**
 * Severity levels for field changes
 * - breaking: Changes that invalidate existing processes (fee increase, new requirement)
 * - major: Significant changes that affect planning (timeline change, document change)
 * - minor: Changes that are informational (contact update, hours change)
 * - cosmetic: Non-functional changes (formatting, typo fixes)
 */
export type ChangeSeverity = 'breaking' | 'major' | 'minor' | 'cosmetic';

/**
 * Categories of fields that can change
 */
export type FieldCategory =
  | 'fee'
  | 'deadline'
  | 'requirement'
  | 'document'
  | 'timeline'
  | 'contact'
  | 'hours'
  | 'location'
  | 'eligibility'
  | 'procedure'
  | 'form'
  | 'appointment'
  | 'status'
  | 'other';

/**
 * Type of change detected
 */
export type ChangeType =
  | 'added'
  | 'removed'
  | 'modified'
  | 'increased'
  | 'decreased';

/**
 * A single field change with before/after values
 */
export interface FieldChange {
  /** Field path (e.g., "fees.application_fee", "requirements[0]") */
  fieldPath: string;

  /** Human-readable field name */
  fieldName: string;

  /** Category of the field */
  category: FieldCategory;

  /** Type of change */
  changeType: ChangeType;

  /** Severity of the change */
  severity: ChangeSeverity;

  /** Previous value (undefined if added) */
  oldValue?: unknown;

  /** New value (undefined if removed) */
  newValue?: unknown;

  /** Formatted old value for display */
  oldValueFormatted?: string;

  /** Formatted new value for display */
  newValueFormatted?: string;

  /** Description of the change */
  description: string;

  /** Impact description for user understanding */
  impact?: string;

  /** Percentage change for numeric values */
  percentageChange?: number;
}

/**
 * Result of tracking changes between two snapshots
 */
export interface ChangeTrackingResult {
  /** Whether any changes were detected */
  hasChanges: boolean;

  /** Total number of changes */
  totalChanges: number;

  /** Changes by severity */
  changesBySeverity: Record<ChangeSeverity, number>;

  /** Changes by category */
  changesByCategory: Record<FieldCategory, number>;

  /** All detected changes */
  changes: FieldChange[];

  /** Breaking changes only (convenience accessor) */
  breakingChanges: FieldChange[];

  /** Summary of all changes */
  summary: string;

  /** Timestamp when changes were detected */
  timestamp: number;

  /** Source URL if provided */
  url?: string;

  /** Content category if provided */
  contentCategory?: string;
}

/**
 * Options for tracking changes
 */
export interface TrackingOptions {
  /** Source URL for the content */
  url?: string;

  /** Content category for better classification */
  category?: string;

  /** Language for field name detection */
  language?: string;

  /** Custom field mappings */
  customFieldMappings?: Record<string, FieldCategory>;

  /** Fields to ignore */
  ignoreFields?: string[];

  /** Only track these fields */
  onlyFields?: string[];

  /** Treat array reordering as a change */
  trackArrayOrder?: boolean;
}

/**
 * A historical change record
 */
export interface ChangeHistoryRecord {
  /** Unique ID for this record */
  id: string;

  /** Source URL */
  url: string;

  /** When the change was detected */
  timestamp: number;

  /** Summary of changes */
  summary: string;

  /** Number of changes by severity */
  severityCounts: Record<ChangeSeverity, number>;

  /** The actual changes */
  changes: FieldChange[];
}

/**
 * Stored data for persistence
 */
interface StoredData {
  /** Change history by URL */
  history: Record<string, ChangeHistoryRecord[]>;

  /** Maximum history entries per URL */
  maxHistoryPerUrl: number;
}

/**
 * Configuration for the tracker
 */
export interface FieldLevelChangeTrackerConfig {
  /** Storage path for persistence */
  storagePath?: string;

  /** Maximum history entries per URL */
  maxHistoryPerUrl?: number;
}

// ============================================
// FIELD CLASSIFICATION
// ============================================

/**
 * Keywords for detecting field categories in multiple languages
 */
const FIELD_CATEGORY_KEYWORDS: Record<FieldCategory, Record<string, string[]>> = {
  fee: {
    en: ['fee', 'cost', 'price', 'payment', 'charge', 'rate', 'amount', 'tariff'],
    es: ['tasa', 'precio', 'coste', 'pago', 'importe', 'tarifa', 'arancel'],
    pt: ['taxa', 'custo', 'pagamento', 'valor', 'tarifa'],
    de: ['gebuhr', 'kosten', 'preis', 'zahlung', 'betrag', 'entgelt'],
    fr: ['frais', 'cout', 'prix', 'paiement', 'montant', 'tarif'],
    it: ['tassa', 'costo', 'prezzo', 'pagamento', 'importo', 'tariffa'],
  },
  deadline: {
    en: ['deadline', 'due date', 'expiry', 'expiration', 'valid until', 'submission date'],
    es: ['fecha limite', 'vencimiento', 'caducidad', 'plazo', 'fecha tope'],
    pt: ['prazo', 'data limite', 'vencimento', 'validade'],
    de: ['frist', 'ablauf', 'termin', 'gultigkeit', 'stichtag'],
    fr: ['date limite', 'echeance', 'expiration', 'delai'],
    it: ['scadenza', 'termine', 'data limite'],
  },
  requirement: {
    en: ['requirement', 'required', 'must', 'mandatory', 'necessary', 'condition'],
    es: ['requisito', 'requerido', 'obligatorio', 'necesario', 'condicion'],
    pt: ['requisito', 'obrigatorio', 'necessario', 'exigencia'],
    de: ['anforderung', 'erforderlich', 'pflicht', 'notwendig', 'bedingung'],
    fr: ['exigence', 'requis', 'obligatoire', 'necessaire', 'condition'],
    it: ['requisito', 'richiesto', 'obbligatorio', 'necessario'],
  },
  document: {
    en: ['document', 'certificate', 'proof', 'passport', 'id', 'license', 'permit'],
    es: ['documento', 'certificado', 'justificante', 'pasaporte', 'dni', 'licencia'],
    pt: ['documento', 'certificado', 'comprovante', 'passaporte', 'licenca'],
    de: ['dokument', 'bescheinigung', 'nachweis', 'reisepass', 'ausweis'],
    fr: ['document', 'certificat', 'justificatif', 'passeport', 'permis'],
    it: ['documento', 'certificato', 'prova', 'passaporto', 'licenza'],
  },
  timeline: {
    en: ['timeline', 'duration', 'processing time', 'waiting period', 'days', 'weeks'],
    es: ['plazo', 'duracion', 'tiempo de tramitacion', 'dias', 'semanas'],
    pt: ['prazo', 'duracao', 'tempo de processamento', 'dias', 'semanas'],
    de: ['dauer', 'bearbeitungszeit', 'wartezeit', 'tage', 'wochen'],
    fr: ['delai', 'duree', 'temps de traitement', 'jours', 'semaines'],
    it: ['durata', 'tempo di elaborazione', 'giorni', 'settimane'],
  },
  contact: {
    en: ['contact', 'phone', 'email', 'address', 'telephone', 'fax'],
    es: ['contacto', 'telefono', 'correo', 'direccion', 'fax'],
    pt: ['contato', 'telefone', 'email', 'endereco', 'fax'],
    de: ['kontakt', 'telefon', 'email', 'adresse', 'fax'],
    fr: ['contact', 'telephone', 'email', 'adresse', 'fax'],
    it: ['contatto', 'telefono', 'email', 'indirizzo', 'fax'],
  },
  hours: {
    en: ['hours', 'opening hours', 'schedule', 'availability', 'open', 'closed'],
    es: ['horario', 'horas', 'disponibilidad', 'abierto', 'cerrado'],
    pt: ['horario', 'horas', 'disponibilidade', 'aberto', 'fechado'],
    de: ['offnungszeiten', 'stunden', 'verfugbarkeit', 'geoffnet', 'geschlossen'],
    fr: ['horaires', 'heures', 'disponibilite', 'ouvert', 'ferme'],
    it: ['orario', 'ore', 'disponibilita', 'aperto', 'chiuso'],
  },
  location: {
    en: ['location', 'office', 'branch', 'center', 'venue', 'site'],
    es: ['ubicacion', 'oficina', 'sucursal', 'centro', 'sede'],
    pt: ['localizacao', 'escritorio', 'filial', 'centro', 'sede'],
    de: ['standort', 'buro', 'filiale', 'zentrum', 'stelle'],
    fr: ['emplacement', 'bureau', 'agence', 'centre', 'site'],
    it: ['posizione', 'ufficio', 'filiale', 'centro', 'sede'],
  },
  eligibility: {
    en: ['eligibility', 'eligible', 'qualify', 'criteria', 'who can'],
    es: ['elegibilidad', 'elegible', 'criterios', 'quien puede'],
    pt: ['elegibilidade', 'elegivel', 'criterios', 'quem pode'],
    de: ['berechtigung', 'berechtigt', 'kriterien', 'wer kann'],
    fr: ['eligibilite', 'eligible', 'criteres', 'qui peut'],
    it: ['ammissibilita', 'idoneo', 'criteri', 'chi puo'],
  },
  procedure: {
    en: ['procedure', 'process', 'step', 'how to', 'instructions'],
    es: ['procedimiento', 'proceso', 'paso', 'como', 'instrucciones'],
    pt: ['procedimento', 'processo', 'passo', 'como', 'instrucoes'],
    de: ['verfahren', 'prozess', 'schritt', 'anleitung'],
    fr: ['procedure', 'processus', 'etape', 'comment', 'instructions'],
    it: ['procedura', 'processo', 'passo', 'come', 'istruzioni'],
  },
  form: {
    en: ['form', 'application', 'template', 'modelo'],
    es: ['formulario', 'solicitud', 'modelo', 'plantilla'],
    pt: ['formulario', 'solicitacao', 'modelo'],
    de: ['formular', 'antrag', 'vorlage'],
    fr: ['formulaire', 'demande', 'modele'],
    it: ['modulo', 'domanda', 'modello'],
  },
  appointment: {
    en: ['appointment', 'booking', 'schedule', 'reservation'],
    es: ['cita', 'reserva', 'turno', 'cita previa'],
    pt: ['agendamento', 'marcacao', 'reserva'],
    de: ['termin', 'buchung', 'reservierung'],
    fr: ['rendez-vous', 'reservation'],
    it: ['appuntamento', 'prenotazione'],
  },
  status: {
    en: ['status', 'state', 'active', 'inactive', 'available', 'unavailable'],
    es: ['estado', 'activo', 'inactivo', 'disponible', 'no disponible'],
    pt: ['status', 'estado', 'ativo', 'inativo', 'disponivel'],
    de: ['status', 'zustand', 'aktiv', 'inaktiv', 'verfugbar'],
    fr: ['statut', 'etat', 'actif', 'inactif', 'disponible'],
    it: ['stato', 'attivo', 'inattivo', 'disponibile'],
  },
  other: {
    en: [],
    es: [],
    pt: [],
    de: [],
    fr: [],
    it: [],
  },
};

/**
 * Severity rules based on category and change type
 */
const SEVERITY_RULES: Record<FieldCategory, Record<ChangeType, ChangeSeverity>> = {
  fee: {
    added: 'breaking',
    removed: 'major',
    modified: 'major',
    increased: 'breaking',
    decreased: 'minor',
  },
  deadline: {
    added: 'major',
    removed: 'major',
    modified: 'major',
    increased: 'minor',  // More time
    decreased: 'breaking',  // Less time
  },
  requirement: {
    added: 'breaking',
    removed: 'minor',
    modified: 'major',
    increased: 'breaking',
    decreased: 'minor',
  },
  document: {
    added: 'breaking',
    removed: 'minor',
    modified: 'major',
    increased: 'breaking',
    decreased: 'minor',
  },
  timeline: {
    added: 'minor',
    removed: 'minor',
    modified: 'minor',
    increased: 'major',  // Longer wait
    decreased: 'minor',  // Shorter wait
  },
  contact: {
    added: 'minor',
    removed: 'minor',
    modified: 'minor',
    increased: 'minor',
    decreased: 'minor',
  },
  hours: {
    added: 'minor',
    removed: 'major',
    modified: 'minor',
    increased: 'minor',
    decreased: 'minor',
  },
  location: {
    added: 'minor',
    removed: 'major',
    modified: 'major',
    increased: 'minor',
    decreased: 'minor',
  },
  eligibility: {
    added: 'breaking',
    removed: 'minor',
    modified: 'major',
    increased: 'breaking',
    decreased: 'minor',
  },
  procedure: {
    added: 'major',
    removed: 'minor',
    modified: 'minor',
    increased: 'minor',
    decreased: 'minor',
  },
  form: {
    added: 'major',
    removed: 'minor',
    modified: 'major',
    increased: 'minor',
    decreased: 'minor',
  },
  appointment: {
    added: 'major',
    removed: 'major',
    modified: 'minor',
    increased: 'minor',
    decreased: 'minor',
  },
  status: {
    added: 'minor',
    removed: 'minor',
    modified: 'major',
    increased: 'minor',
    decreased: 'minor',
  },
  other: {
    added: 'minor',
    removed: 'minor',
    modified: 'minor',
    increased: 'minor',
    decreased: 'minor',
  },
};

// ============================================
// TRACKER CLASS
// ============================================

/**
 * Field-Level Change Tracker
 *
 * Tracks changes in structured data with field-level granularity,
 * severity classification, and change history.
 */
export class FieldLevelChangeTracker {
  private store: PersistentStore<StoredData> | null = null;
  private data: StoredData;
  private config: Required<FieldLevelChangeTrackerConfig>;
  private initialized: boolean = false;

  constructor(config: FieldLevelChangeTrackerConfig = {}) {
    this.config = {
      storagePath: config.storagePath || './field-changes.json',
      maxHistoryPerUrl: config.maxHistoryPerUrl || 100,
    };
    this.data = {
      history: {},
      maxHistoryPerUrl: this.config.maxHistoryPerUrl,
    };
  }

  /**
   * Initialize the tracker with optional persistence
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.store = createPersistentStore<StoredData>(
        this.config.storagePath,
        'FieldLevelChangeTracker'
      );
      const stored = await this.store.load();
      if (stored) {
        this.data = {
          ...this.data,
          ...stored,
          maxHistoryPerUrl: this.config.maxHistoryPerUrl,
        };
      }
      this.initialized = true;
    } catch (error) {
      // Continue without persistence, but log the error for debugging
      logger.server.warn('Failed to initialize persistent store for FieldLevelChangeTracker. Continuing without persistence.', { error });
      this.initialized = true;
    }
  }

  /**
   * Track changes between two data snapshots
   *
   * @param oldData - Previous data snapshot
   * @param newData - Current data snapshot
   * @param options - Tracking options
   * @returns Change tracking result with all detected changes
   */
  trackChanges(
    oldData: Record<string, unknown>,
    newData: Record<string, unknown>,
    options: TrackingOptions = {}
  ): ChangeTrackingResult {
    const changes: FieldChange[] = [];
    const language = options.language || 'en';

    // Compare all fields recursively
    this.compareObjects(
      oldData,
      newData,
      '',
      changes,
      language,
      options.customFieldMappings || {},
      options.ignoreFields || [],
      options.onlyFields,
      options.trackArrayOrder ?? false
    );

    // Calculate statistics
    const changesBySeverity: Record<ChangeSeverity, number> = {
      breaking: 0,
      major: 0,
      minor: 0,
      cosmetic: 0,
    };

    const changesByCategory: Record<FieldCategory, number> = {
      fee: 0,
      deadline: 0,
      requirement: 0,
      document: 0,
      timeline: 0,
      contact: 0,
      hours: 0,
      location: 0,
      eligibility: 0,
      procedure: 0,
      form: 0,
      appointment: 0,
      status: 0,
      other: 0,
    };

    for (const change of changes) {
      changesBySeverity[change.severity]++;
      changesByCategory[change.category]++;
    }

    const breakingChanges = changes.filter(c => c.severity === 'breaking');

    const result: ChangeTrackingResult = {
      hasChanges: changes.length > 0,
      totalChanges: changes.length,
      changesBySeverity,
      changesByCategory,
      changes,
      breakingChanges,
      summary: this.generateSummary(changes, changesBySeverity),
      timestamp: Date.now(),
      url: options.url,
      contentCategory: options.category,
    };

    // Store in history if URL provided
    if (options.url && changes.length > 0) {
      this.addToHistory(options.url, result).catch(err => {
        logger.server.error('Failed to add change to history', { error: err, url: options.url });
      });
    }

    return result;
  }

  /**
   * Compare two values and detect changes
   */
  private compareObjects(
    oldObj: Record<string, unknown>,
    newObj: Record<string, unknown>,
    path: string,
    changes: FieldChange[],
    language: string,
    customMappings: Record<string, FieldCategory>,
    ignoreFields: string[],
    onlyFields: string[] | undefined,
    trackArrayOrder: boolean
  ): void {
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

    for (const key of allKeys) {
      const fieldPath = path ? `${path}.${key}` : key;

      // Check if field should be ignored
      if (ignoreFields.some(f => fieldPath.includes(f) || key === f)) {
        continue;
      }

      // Check if we should only track specific fields
      if (onlyFields && !onlyFields.some(f => fieldPath.includes(f) || key === f)) {
        continue;
      }

      const oldValue = oldObj[key];
      const newValue = newObj[key];

      // Field added
      if (!(key in oldObj)) {
        const category = this.detectCategory(key, newValue, language, customMappings);
        const change = this.createChange(
          fieldPath,
          key,
          category,
          'added',
          undefined,
          newValue,
          language
        );
        changes.push(change);
        continue;
      }

      // Field removed
      if (!(key in newObj)) {
        const category = this.detectCategory(key, oldValue, language, customMappings);
        const change = this.createChange(
          fieldPath,
          key,
          category,
          'removed',
          oldValue,
          undefined,
          language
        );
        changes.push(change);
        continue;
      }

      // Both exist - check for modifications
      if (this.isObject(oldValue) && this.isObject(newValue)) {
        // Recurse into nested objects
        this.compareObjects(
          oldValue as Record<string, unknown>,
          newValue as Record<string, unknown>,
          fieldPath,
          changes,
          language,
          customMappings,
          ignoreFields,
          onlyFields,
          trackArrayOrder
        );
      } else if (Array.isArray(oldValue) && Array.isArray(newValue)) {
        // Handle array comparison
        this.compareArrays(
          oldValue,
          newValue,
          fieldPath,
          key,
          changes,
          language,
          customMappings,
          ignoreFields,
          onlyFields,
          trackArrayOrder
        );
      } else if (!this.valuesEqual(oldValue, newValue)) {
        // Simple value change
        const category = this.detectCategory(key, newValue, language, customMappings);
        const changeType = this.detectChangeType(oldValue, newValue);
        const change = this.createChange(
          fieldPath,
          key,
          category,
          changeType,
          oldValue,
          newValue,
          language
        );
        changes.push(change);
      }
    }
  }

  /**
   * Compare arrays and detect changes
   */
  private compareArrays(
    oldArray: unknown[],
    newArray: unknown[],
    path: string,
    key: string,
    changes: FieldChange[],
    language: string,
    customMappings: Record<string, FieldCategory>,
    ignoreFields: string[],
    onlyFields: string[] | undefined,
    trackArrayOrder: boolean
  ): void {
    // For simple values, compare based on trackArrayOrder flag
    if (oldArray.every(v => !this.isObject(v)) && newArray.every(v => !this.isObject(v))) {
      if (trackArrayOrder) {
        // Order-sensitive: compare index by index
        const maxLen = Math.max(oldArray.length, newArray.length);
        for (let i = 0; i < maxLen; i++) {
          const itemPath = `${path}[${i}]`;
          if (i >= oldArray.length) {
            // Added
            const category = this.detectCategory(key, newArray[i], language, customMappings);
            changes.push(this.createChange(
              itemPath,
              `${key}[${i}]`,
              category,
              'added',
              undefined,
              newArray[i],
              language
            ));
          } else if (i >= newArray.length) {
            // Removed
            const category = this.detectCategory(key, oldArray[i], language, customMappings);
            changes.push(this.createChange(
              itemPath,
              `${key}[${i}]`,
              category,
              'removed',
              oldArray[i],
              undefined,
              language
            ));
          } else if (!this.valuesEqual(oldArray[i], newArray[i])) {
            // Modified
            const category = this.detectCategory(key, newArray[i], language, customMappings);
            const changeType = this.detectChangeType(oldArray[i], newArray[i]);
            changes.push(this.createChange(
              itemPath,
              `${key}[${i}]`,
              category,
              changeType,
              oldArray[i],
              newArray[i],
              language
            ));
          }
        }
      } else {
        // Order-insensitive: compare sets
        const oldSet = new Set(oldArray.map(v => JSON.stringify(v)));
        const newSet = new Set(newArray.map(v => JSON.stringify(v)));

        // Items removed
        for (const item of oldArray) {
          const key_ = JSON.stringify(item);
          if (!newSet.has(key_)) {
            const category = this.detectCategory(key, item, language, customMappings);
            changes.push(this.createChange(
              `${path}[${oldArray.indexOf(item)}]`,
              `${key} item`,
              category,
              'removed',
              item,
              undefined,
              language
            ));
          }
        }

        // Items added
        for (const item of newArray) {
          const key_ = JSON.stringify(item);
          if (!oldSet.has(key_)) {
            const category = this.detectCategory(key, item, language, customMappings);
            changes.push(this.createChange(
              `${path}[${newArray.indexOf(item)}]`,
              `${key} item`,
              category,
              'added',
              undefined,
              item,
              language
            ));
          }
        }
      }
    } else {
      // For object arrays, do index-based comparison
      const maxLen = Math.max(oldArray.length, newArray.length);
      for (let i = 0; i < maxLen; i++) {
        const itemPath = `${path}[${i}]`;
        if (i >= oldArray.length) {
          // Added
          const category = this.detectCategory(key, newArray[i], language, customMappings);
          changes.push(this.createChange(
            itemPath,
            `${key}[${i}]`,
            category,
            'added',
            undefined,
            newArray[i],
            language
          ));
        } else if (i >= newArray.length) {
          // Removed
          const category = this.detectCategory(key, oldArray[i], language, customMappings);
          changes.push(this.createChange(
            itemPath,
            `${key}[${i}]`,
            category,
            'removed',
            oldArray[i],
            undefined,
            language
          ));
        } else if (this.isObject(oldArray[i]) && this.isObject(newArray[i])) {
          // Recurse with ignoreFields and onlyFields propagated
          this.compareObjects(
            oldArray[i] as Record<string, unknown>,
            newArray[i] as Record<string, unknown>,
            itemPath,
            changes,
            language,
            customMappings,
            ignoreFields,
            onlyFields,
            trackArrayOrder
          );
        } else if (!this.valuesEqual(oldArray[i], newArray[i])) {
          const category = this.detectCategory(key, newArray[i], language, customMappings);
          const changeType = this.detectChangeType(oldArray[i], newArray[i]);
          changes.push(this.createChange(
            itemPath,
            `${key}[${i}]`,
            category,
            changeType,
            oldArray[i],
            newArray[i],
            language
          ));
        }
      }
    }
  }

  /**
   * Create a FieldChange object
   */
  private createChange(
    fieldPath: string,
    fieldName: string,
    category: FieldCategory,
    changeType: ChangeType,
    oldValue: unknown,
    newValue: unknown,
    language: string
  ): FieldChange {
    const severity = SEVERITY_RULES[category][changeType];
    const percentageChange = this.calculatePercentageChange(oldValue, newValue);

    return {
      fieldPath,
      fieldName: this.formatFieldName(fieldName),
      category,
      changeType,
      severity,
      oldValue,
      newValue,
      oldValueFormatted: this.formatValue(oldValue),
      newValueFormatted: this.formatValue(newValue),
      description: this.generateDescription(fieldName, category, changeType, oldValue, newValue),
      impact: this.generateImpact(category, changeType, severity),
      percentageChange,
    };
  }

  /**
   * Detect the category of a field based on its name and value
   */
  private detectCategory(
    fieldName: string,
    value: unknown,
    language: string,
    customMappings: Record<string, FieldCategory>
  ): FieldCategory {
    // Check custom mappings first
    if (customMappings[fieldName]) {
      return customMappings[fieldName];
    }

    const lowerName = fieldName.toLowerCase();

    // Check each category's keywords
    for (const [category, keywords] of Object.entries(FIELD_CATEGORY_KEYWORDS)) {
      if (category === 'other') continue;

      // Check language-specific keywords
      const langKeywords = keywords[language] || keywords.en || [];
      for (const keyword of langKeywords) {
        if (lowerName.includes(keyword)) {
          return category as FieldCategory;
        }
      }

      // Also check English keywords as fallback
      if (language !== 'en') {
        const enKeywords = keywords.en || [];
        for (const keyword of enKeywords) {
          if (lowerName.includes(keyword)) {
            return category as FieldCategory;
          }
        }
      }
    }

    // Check value for hints
    if (typeof value === 'object' && value !== null) {
      const valueStr = JSON.stringify(value).toLowerCase();
      if (valueStr.includes('amount') || valueStr.includes('currency')) {
        return 'fee';
      }
      if (valueStr.includes('date') || valueStr.includes('deadline')) {
        return 'deadline';
      }
    }

    return 'other';
  }

  /**
   * Detect the type of change (modified, increased, decreased)
   */
  private detectChangeType(oldValue: unknown, newValue: unknown): ChangeType {
    // Numeric comparison
    if (typeof oldValue === 'number' && typeof newValue === 'number') {
      if (newValue > oldValue) return 'increased';
      if (newValue < oldValue) return 'decreased';
    }

    // Object with amount field (fees)
    if (this.isObject(oldValue) && this.isObject(newValue)) {
      const oldAmount = (oldValue as Record<string, unknown>).amount;
      const newAmount = (newValue as Record<string, unknown>).amount;
      if (typeof oldAmount === 'number' && typeof newAmount === 'number') {
        if (newAmount > oldAmount) return 'increased';
        if (newAmount < oldAmount) return 'decreased';
      }
    }

    // String length comparison for duration-like fields
    if (typeof oldValue === 'string' && typeof newValue === 'string') {
      const oldDays = this.extractDays(oldValue);
      const newDays = this.extractDays(newValue);
      if (oldDays !== null && newDays !== null) {
        if (newDays > oldDays) return 'increased';
        if (newDays < oldDays) return 'decreased';
      }
    }

    return 'modified';
  }

  /**
   * Extract days from a duration string
   */
  private extractDays(text: string): number | null {
    // Day patterns - match() returns null if no match, so we can use it directly
    const dayPattern = /(\d+)\s*(?:days?|dias?|tage?|jours?|giorni?)/i;
    const dayMatch = text.match(dayPattern);
    if (dayMatch) {
      return parseInt(dayMatch[1], 10);
    }

    // Week patterns
    const weekPattern = /(\d+)\s*(?:weeks?|semanas?|wochen?|semaines?)/i;
    const weekMatch = text.match(weekPattern);
    if (weekMatch) {
      return parseInt(weekMatch[1], 10) * 7;
    }

    // Month patterns
    const monthPattern = /(\d+)\s*(?:months?|meses?|monate?|mois)/i;
    const monthMatch = text.match(monthPattern);
    if (monthMatch) {
      return parseInt(monthMatch[1], 10) * 30;
    }

    return null;
  }

  /**
   * Calculate percentage change for numeric values
   */
  private calculatePercentageChange(oldValue: unknown, newValue: unknown): number | undefined {
    let oldNum: number | undefined;
    let newNum: number | undefined;

    if (typeof oldValue === 'number') oldNum = oldValue;
    if (typeof newValue === 'number') newNum = newValue;

    // Check for amount in objects
    if (this.isObject(oldValue)) {
      const amt = (oldValue as Record<string, unknown>).amount;
      if (typeof amt === 'number') oldNum = amt;
    }
    if (this.isObject(newValue)) {
      const amt = (newValue as Record<string, unknown>).amount;
      if (typeof amt === 'number') newNum = amt;
    }

    if (oldNum !== undefined && newNum !== undefined && oldNum !== 0) {
      return Math.round(((newNum - oldNum) / oldNum) * 100);
    }

    return undefined;
  }

  /**
   * Format a field name for display
   */
  private formatFieldName(name: string): string {
    // Convert camelCase/snake_case to Title Case
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Format a value for display
   */
  private formatValue(value: unknown): string | undefined {
    if (value === undefined) return undefined;
    if (value === null) return 'null';

    if (typeof value === 'object') {
      // Check for MonetaryValue-like objects
      const obj = value as Record<string, unknown>;
      if ('amount' in obj && 'currency' in obj) {
        return `${obj.currency} ${obj.amount}`;
      }

      // Check for TimelineValue-like objects
      if ('durationText' in obj) {
        return String(obj.durationText);
      }

      // Array
      if (Array.isArray(value)) {
        if (value.length <= 3) {
          return value.map(v => this.formatValue(v)).join(', ');
        }
        return `[${value.length} items]`;
      }

      // Generic object
      return JSON.stringify(value);
    }

    return String(value);
  }

  /**
   * Generate a description for the change
   */
  private generateDescription(
    fieldName: string,
    category: FieldCategory,
    changeType: ChangeType,
    oldValue: unknown,
    newValue: unknown
  ): string {
    const formattedName = this.formatFieldName(fieldName);
    const oldFormatted = this.formatValue(oldValue) || 'nothing';
    const newFormatted = this.formatValue(newValue) || 'nothing';

    switch (changeType) {
      case 'added':
        return `${formattedName} added: ${newFormatted}`;
      case 'removed':
        return `${formattedName} removed (was: ${oldFormatted})`;
      case 'increased':
        return `${formattedName} increased from ${oldFormatted} to ${newFormatted}`;
      case 'decreased':
        return `${formattedName} decreased from ${oldFormatted} to ${newFormatted}`;
      case 'modified':
        return `${formattedName} changed from ${oldFormatted} to ${newFormatted}`;
    }
  }

  /**
   * Generate impact description based on severity
   */
  private generateImpact(
    category: FieldCategory,
    changeType: ChangeType,
    severity: ChangeSeverity
  ): string {
    const impactMessages: Record<ChangeSeverity, string> = {
      breaking: 'This change may invalidate existing applications or require immediate action',
      major: 'This change significantly affects the process or requirements',
      minor: 'This change is informational and may affect planning',
      cosmetic: 'This is a minor update with no functional impact',
    };

    let specific = '';
    if (category === 'fee' && changeType === 'increased') {
      specific = ' Budget adjustments may be needed.';
    } else if (category === 'deadline' && changeType === 'decreased') {
      specific = ' Action may be required sooner than expected.';
    } else if (category === 'requirement' && changeType === 'added') {
      specific = ' Additional documentation or preparation may be needed.';
    }

    return impactMessages[severity] + specific;
  }

  /**
   * Generate a summary of all changes
   */
  private generateSummary(
    changes: FieldChange[],
    bySeverity: Record<ChangeSeverity, number>
  ): string {
    if (changes.length === 0) {
      return 'No changes detected';
    }

    const parts: string[] = [];

    if (bySeverity.breaking > 0) {
      parts.push(`${bySeverity.breaking} breaking change${bySeverity.breaking === 1 ? '' : 's'}`);
    }
    if (bySeverity.major > 0) {
      parts.push(`${bySeverity.major} major change${bySeverity.major === 1 ? '' : 's'}`);
    }
    if (bySeverity.minor > 0) {
      parts.push(`${bySeverity.minor} minor change${bySeverity.minor === 1 ? '' : 's'}`);
    }
    if (bySeverity.cosmetic > 0) {
      parts.push(`${bySeverity.cosmetic} cosmetic change${bySeverity.cosmetic === 1 ? '' : 's'}`);
    }

    return `${changes.length} change${changes.length === 1 ? '' : 's'} detected: ${parts.join(', ')}`;
  }

  /**
   * Check if a value is a plain object
   */
  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  /**
   * Check if two values are equal using deep comparison
   * (key order insensitive for objects)
   */
  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return a === b;

    if (typeof a === 'object' && typeof b === 'object') {
      // Handle arrays
      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((val, idx) => this.valuesEqual(val, b[idx]));
      }

      // One is array, one is not
      if (Array.isArray(a) !== Array.isArray(b)) return false;

      // Handle objects (key order insensitive)
      const objA = a as Record<string, unknown>;
      const objB = b as Record<string, unknown>;
      const keysA = Object.keys(objA);
      const keysB = Object.keys(objB);

      if (keysA.length !== keysB.length) return false;

      return keysA.every(key => key in objB && this.valuesEqual(objA[key], objB[key]));
    }

    return false;
  }

  /**
   * Add a change record to history
   */
  private async addToHistory(url: string, result: ChangeTrackingResult): Promise<void> {
    if (!this.data.history[url]) {
      this.data.history[url] = [];
    }

    const record: ChangeHistoryRecord = {
      id: crypto.randomUUID(),
      url,
      timestamp: result.timestamp,
      summary: result.summary,
      severityCounts: result.changesBySeverity,
      changes: result.changes,
    };

    this.data.history[url].unshift(record);

    // Trim history
    if (this.data.history[url].length > this.config.maxHistoryPerUrl) {
      this.data.history[url] = this.data.history[url].slice(0, this.config.maxHistoryPerUrl);
    }

    await this.save();
  }

  /**
   * Get change history for a URL
   *
   * @param url - URL to get history for
   * @param limit - Maximum records to return
   * @returns Array of change history records
   */
  async getHistory(url: string, limit?: number): Promise<ChangeHistoryRecord[]> {
    await this.initialize();
    const history = this.data.history[url] || [];
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Get all URLs with change history
   */
  async getTrackedUrls(): Promise<string[]> {
    await this.initialize();
    return Object.keys(this.data.history);
  }

  /**
   * Clear history for a URL
   */
  async clearHistory(url: string): Promise<void> {
    await this.initialize();
    delete this.data.history[url];
    await this.save();
  }

  /**
   * Clear all history
   */
  async clearAllHistory(): Promise<void> {
    await this.initialize();
    this.data.history = {};
    await this.save();
  }

  /**
   * Get statistics across all tracked URLs
   */
  async getStatistics(): Promise<{
    totalUrls: number;
    totalRecords: number;
    changesBySeverity: Record<ChangeSeverity, number>;
    changesByCategory: Record<FieldCategory, number>;
    recentChanges: ChangeHistoryRecord[];
  }> {
    await this.initialize();

    const stats = {
      totalUrls: Object.keys(this.data.history).length,
      totalRecords: 0,
      changesBySeverity: {
        breaking: 0,
        major: 0,
        minor: 0,
        cosmetic: 0,
      } as Record<ChangeSeverity, number>,
      changesByCategory: {
        fee: 0,
        deadline: 0,
        requirement: 0,
        document: 0,
        timeline: 0,
        contact: 0,
        hours: 0,
        location: 0,
        eligibility: 0,
        procedure: 0,
        form: 0,
        appointment: 0,
        status: 0,
        other: 0,
      } as Record<FieldCategory, number>,
      recentChanges: [] as ChangeHistoryRecord[],
    };

    const allRecords: ChangeHistoryRecord[] = [];

    for (const records of Object.values(this.data.history)) {
      stats.totalRecords += records.length;
      for (const record of records) {
        allRecords.push(record);
        for (const [sev, count] of Object.entries(record.severityCounts)) {
          stats.changesBySeverity[sev as ChangeSeverity] += count;
        }
        for (const change of record.changes) {
          stats.changesByCategory[change.category]++;
        }
      }
    }

    // Sort by timestamp and get most recent
    allRecords.sort((a, b) => b.timestamp - a.timestamp);
    stats.recentChanges = allRecords.slice(0, 10);

    return stats;
  }

  /**
   * Save data to persistent storage
   */
  private async save(): Promise<void> {
    if (this.store) {
      try {
        await this.store.save(this.data);
      } catch (error) {
        logger.server.error('Failed to save field change history', { error });
      }
    }
  }

  /**
   * Flush pending writes
   */
  async flush(): Promise<void> {
    if (this.store) {
      await this.store.flush();
    }
  }
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

/**
 * Create a new FieldLevelChangeTracker
 */
export function createFieldLevelChangeTracker(
  config?: FieldLevelChangeTrackerConfig
): FieldLevelChangeTracker {
  return new FieldLevelChangeTracker(config);
}

// Singleton instance
let globalTracker: FieldLevelChangeTracker | null = null;

/**
 * Get the global FieldLevelChangeTracker instance
 */
export function getFieldLevelChangeTracker(
  config?: FieldLevelChangeTrackerConfig
): FieldLevelChangeTracker {
  if (!globalTracker) {
    globalTracker = new FieldLevelChangeTracker(config);
  }
  return globalTracker;
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Track changes between two data snapshots (convenience function)
 * Uses the global singleton instance for persistence and history.
 */
export function trackFieldChanges(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  options?: TrackingOptions
): ChangeTrackingResult {
  const tracker = getFieldLevelChangeTracker();
  return tracker.trackChanges(oldData, newData, options);
}

/**
 * Get breaking changes only (convenience function)
 */
export function getBreakingChanges(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  options?: TrackingOptions
): FieldChange[] {
  const result = trackFieldChanges(oldData, newData, options);
  return result.breakingChanges;
}

/**
 * Check if there are any breaking changes (convenience function)
 */
export function hasBreakingChanges(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  options?: TrackingOptions
): boolean {
  const result = trackFieldChanges(oldData, newData, options);
  return result.breakingChanges.length > 0;
}
