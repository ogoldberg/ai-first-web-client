/**
 * MoveAhead.ai Integration Example (INT-009)
 *
 * This example demonstrates how MoveAhead.ai (or similar relocation research platforms)
 * can integrate with Unbrowser's cloud API for intelligent government portal research.
 *
 * Key features demonstrated:
 * 1. Research Browser setup with verification presets
 * 2. Government portal research with content validation
 * 3. Workflow templates for visa and immigration research
 * 4. API discovery for faster data extraction
 * 5. Session management for authenticated portals
 * 6. Content change prediction for refresh scheduling
 * 7. Skill packs for cross-country pattern transfer
 *
 * Architecture:
 * - This example uses the HTTP API client (@unbrowser/core)
 * - All intelligence runs server-side on api.unbrowser.ai
 * - Client is a thin HTTP wrapper suitable for any platform
 *
 * Prerequisites:
 * - UNBROWSER_API_KEY environment variable set
 * - API server running at api.unbrowser.ai (or local)
 *
 * Usage:
 *   UNBROWSER_API_KEY=ub_live_xxx npx tsx examples/moveahead-integration.ts
 */

import { createUnbrowser, UnbrowserClient, BrowseOptions, BrowseResult } from '../packages/core/src/http-client.js';

// ============================================
// CONFIGURATION
// ============================================

/**
 * MoveAhead-specific configuration for relocation research
 */
interface MoveAheadConfig {
  /** Target countries for research */
  countries: string[];
  /** Topics to research per country */
  researchTopics: ResearchTopic[];
  /** Enable API bypass when available (10-50x faster) */
  preferApiDiscovery: boolean;
  /** Verification mode for government content */
  verificationMode: 'basic' | 'standard' | 'thorough';
  /** Maximum pages to follow for paginated content */
  maxPaginationPages: number;
}

type ResearchTopic =
  | 'visa_requirements'
  | 'work_permits'
  | 'tax_residency'
  | 'social_security'
  | 'healthcare'
  | 'banking'
  | 'housing';

/**
 * Default configuration for MoveAhead integration
 */
const DEFAULT_CONFIG: MoveAheadConfig = {
  countries: ['ES', 'PT', 'DE'],
  researchTopics: ['visa_requirements', 'tax_residency', 'social_security'],
  preferApiDiscovery: true,
  verificationMode: 'thorough',
  maxPaginationPages: 10,
};

// ============================================
// COUNTRY PORTAL MAPPINGS
// ============================================

/**
 * Government portal URLs by country and topic
 */
const COUNTRY_PORTALS: Record<string, Record<ResearchTopic, string>> = {
  ES: {
    visa_requirements: 'https://extranjeros.inclusion.gob.es/es/informaciongeneral/losvisados/',
    work_permits: 'https://extranjeros.inclusion.gob.es/es/informaciongeneral/autorizaciones/',
    tax_residency: 'https://sede.agenciatributaria.gob.es/Sede/procedimientoini/G322.shtml',
    social_security: 'https://www.seg-social.es/wps/portal/wss/internet/Trabajadores/Afiliacion/',
    healthcare: 'https://www.sanidad.gob.es/ciudadanos/proteccionSalud/home.htm',
    banking: 'https://www.bde.es/bde/es/',
    housing: 'https://www.mitma.gob.es/vivienda',
  },
  PT: {
    visa_requirements: 'https://www.sef.pt/en/pages/conteudo-detalhe.aspx?nID=21',
    work_permits: 'https://www.sef.pt/en/pages/conteudo-detalhe.aspx?nID=87',
    tax_residency: 'https://www.portaldasfinancas.gov.pt/at/html/index.html',
    social_security: 'https://www.seg-social.pt/',
    healthcare: 'https://www.sns.gov.pt/',
    banking: 'https://www.bportugal.pt/',
    housing: 'https://www.portaldahabitacao.pt/',
  },
  DE: {
    visa_requirements: 'https://www.auswaertiges-amt.de/en/visa-service',
    work_permits: 'https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwsndererDrittstaaten/',
    tax_residency: 'https://www.bundesfinanzministerium.de/Web/EN/Home/home.html',
    social_security: 'https://www.deutsche-rentenversicherung.de/',
    healthcare: 'https://www.bundesgesundheitsministerium.de/',
    banking: 'https://www.bundesbank.de/',
    housing: 'https://www.bmwsb.bund.de/',
  },
};

/**
 * Verification checks for different research topics
 */
const TOPIC_VERIFICATION: Record<ResearchTopic, {
  expectedFields: string[];
  excludePatterns: string[];
  minContentLength: number;
}> = {
  visa_requirements: {
    expectedFields: ['requirements', 'documents', 'fees', 'timeline', 'application'],
    excludePatterns: ['404', 'Page not found', 'Error', 'Access denied'],
    minContentLength: 500,
  },
  work_permits: {
    expectedFields: ['permit', 'employer', 'contract', 'registration'],
    excludePatterns: ['404', 'Page not found', 'Error'],
    minContentLength: 400,
  },
  tax_residency: {
    expectedFields: ['residency', 'tax', 'declaration', 'forms'],
    excludePatterns: ['404', 'Page not found', 'Error', 'Session expired'],
    minContentLength: 400,
  },
  social_security: {
    expectedFields: ['registration', 'contributions', 'benefits'],
    excludePatterns: ['404', 'Page not found', 'Error'],
    minContentLength: 300,
  },
  healthcare: {
    expectedFields: ['healthcare', 'insurance', 'coverage'],
    excludePatterns: ['404', 'Page not found', 'Error'],
    minContentLength: 300,
  },
  banking: {
    expectedFields: ['account', 'requirements', 'documents'],
    excludePatterns: ['404', 'Page not found', 'Error'],
    minContentLength: 300,
  },
  housing: {
    expectedFields: ['rental', 'registration', 'contract'],
    excludePatterns: ['404', 'Page not found', 'Error'],
    minContentLength: 300,
  },
};

// ============================================
// RESEARCH RESULT TYPES
// ============================================

interface TopicResearchResult {
  topic: ResearchTopic;
  country: string;
  url: string;
  success: boolean;
  title: string;
  content: string;
  contentLength: number;
  loadTime: number;
  tier: string;
  apiUsed: boolean;
  verificationPassed: boolean;
  missingFields: string[];
  error?: string;
}

interface CountryResearchSummary {
  country: string;
  totalTopics: number;
  successfulTopics: number;
  failedTopics: number;
  avgLoadTime: number;
  apiBypassRate: number;
  results: TopicResearchResult[];
}

interface ResearchReport {
  config: MoveAheadConfig;
  startedAt: number;
  completedAt: number;
  totalDuration: number;
  summaries: CountryResearchSummary[];
  overallStats: {
    totalResearched: number;
    successRate: number;
    avgLoadTime: number;
    apiBypassRate: number;
  };
}

// ============================================
// MOVEAHEAD RESEARCH CLIENT
// ============================================

/**
 * MoveAhead Research Client
 *
 * Wraps the Unbrowser HTTP client with MoveAhead-specific functionality
 * for relocation research.
 */
class MoveAheadResearchClient {
  private client: UnbrowserClient;
  private config: MoveAheadConfig;

  constructor(apiKey: string, config: Partial<MoveAheadConfig> = {}) {
    this.client = createUnbrowser({
      apiKey,
      baseUrl: process.env.UNBROWSER_API_URL || 'https://api.unbrowser.ai',
      timeout: 60000,
      retry: true,
      maxRetries: 3,
    });

    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check API health before starting research
   */
  async checkHealth(): Promise<boolean> {
    try {
      const health = await this.client.health();
      console.log(`API Status: ${health.status} (v${health.version})`);
      return health.status === 'ok' || health.status === 'healthy';
    } catch (error) {
      console.error('API health check failed:', error);
      return false;
    }
  }

  /**
   * Research a single topic for a country
   */
  async researchTopic(
    country: string,
    topic: ResearchTopic
  ): Promise<TopicResearchResult> {
    const url = COUNTRY_PORTALS[country]?.[topic];

    if (!url) {
      return {
        topic,
        country,
        url: '',
        success: false,
        title: '',
        content: '',
        contentLength: 0,
        loadTime: 0,
        tier: 'unknown',
        apiUsed: false,
        verificationPassed: false,
        missingFields: [],
        error: `No portal URL configured for ${country}/${topic}`,
      };
    }

    const verification = TOPIC_VERIFICATION[topic];
    const startTime = Date.now();

    try {
      // Build browse options with verification
      const browseOptions: BrowseOptions = {
        contentType: 'markdown',
        scrollToLoad: true,
        maxLatencyMs: 30000,
        verify: {
          enabled: true,
          mode: this.config.verificationMode,
        },
      };

      // Browse with intelligent tiering
      const result = await this.client.browse(url, browseOptions);
      const loadTime = Date.now() - startTime;

      // Analyze verification results
      const content = result.content.markdown || result.content.text || '';
      const contentLower = content.toLowerCase();

      // Check for expected fields
      const foundFields: string[] = [];
      const missingFields: string[] = [];
      for (const field of verification.expectedFields) {
        if (contentLower.includes(field.toLowerCase())) {
          foundFields.push(field);
        } else {
          missingFields.push(field);
        }
      }

      // Check for error patterns
      let hasErrorPattern = false;
      for (const pattern of verification.excludePatterns) {
        if (contentLower.includes(pattern.toLowerCase())) {
          hasErrorPattern = true;
          break;
        }
      }

      // Determine verification success
      const verificationPassed =
        !hasErrorPattern &&
        content.length >= verification.minContentLength &&
        foundFields.length >= verification.expectedFields.length * 0.5;

      return {
        topic,
        country,
        url,
        success: true,
        title: result.title || 'Untitled',
        content: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
        contentLength: content.length,
        loadTime,
        tier: result.metadata?.tier || 'unknown',
        apiUsed: (result.discoveredApis?.length || 0) > 0,
        verificationPassed,
        missingFields,
      };
    } catch (error) {
      return {
        topic,
        country,
        url,
        success: false,
        title: '',
        content: '',
        contentLength: 0,
        loadTime: Date.now() - startTime,
        tier: 'error',
        apiUsed: false,
        verificationPassed: false,
        missingFields: verification.expectedFields,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Research all configured topics for a country
   */
  async researchCountry(country: string): Promise<CountryResearchSummary> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Researching ${country}...`);
    console.log('='.repeat(60));

    const results: TopicResearchResult[] = [];

    for (const topic of this.config.researchTopics) {
      console.log(`  [${topic}] Starting...`);
      const result = await this.researchTopic(country, topic);
      results.push(result);

      const status = result.success ? (result.verificationPassed ? 'PASS' : 'WARN') : 'FAIL';
      const tierInfo = result.apiUsed ? '(API)' : `(${result.tier})`;
      console.log(`  [${topic}] ${status} - ${result.loadTime}ms ${tierInfo}`);

      if (!result.success && result.error) {
        console.log(`    Error: ${result.error}`);
      } else if (!result.verificationPassed && result.missingFields.length > 0) {
        console.log(`    Missing fields: ${result.missingFields.join(', ')}`);
      }

      // Respectful delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const successfulTopics = results.filter(r => r.success).length;
    const totalLoadTime = results.reduce((sum, r) => sum + r.loadTime, 0);
    const apiBypassCount = results.filter(r => r.apiUsed).length;

    return {
      country,
      totalTopics: results.length,
      successfulTopics,
      failedTopics: results.length - successfulTopics,
      avgLoadTime: results.length > 0 ? totalLoadTime / results.length : 0,
      apiBypassRate: results.length > 0 ? apiBypassCount / results.length : 0,
      results,
    };
  }

  /**
   * Run full research across all configured countries
   */
  async runFullResearch(): Promise<ResearchReport> {
    const startedAt = Date.now();
    const summaries: CountryResearchSummary[] = [];

    console.log('\n' + '='.repeat(70));
    console.log('MoveAhead.ai Relocation Research Pipeline');
    console.log('='.repeat(70));
    console.log(`Countries: ${this.config.countries.join(', ')}`);
    console.log(`Topics: ${this.config.researchTopics.join(', ')}`);
    console.log(`Verification: ${this.config.verificationMode}`);
    console.log('='.repeat(70));

    for (const country of this.config.countries) {
      const summary = await this.researchCountry(country);
      summaries.push(summary);
    }

    const completedAt = Date.now();

    // Calculate overall stats
    const totalResearched = summaries.reduce((sum, s) => sum + s.totalTopics, 0);
    const totalSuccess = summaries.reduce((sum, s) => sum + s.successfulTopics, 0);
    const totalLoadTime = summaries.reduce((sum, s) => sum + s.avgLoadTime * s.totalTopics, 0);
    const totalApiBypass = summaries.reduce((sum, s) => sum + s.apiBypassRate * s.totalTopics, 0);

    return {
      config: this.config,
      startedAt,
      completedAt,
      totalDuration: completedAt - startedAt,
      summaries,
      overallStats: {
        totalResearched,
        successRate: totalResearched > 0 ? totalSuccess / totalResearched : 0,
        avgLoadTime: totalResearched > 0 ? totalLoadTime / totalResearched : 0,
        apiBypassRate: totalResearched > 0 ? totalApiBypass / totalResearched : 0,
      },
    };
  }

  /**
   * Get domain intelligence for a country's portals
   */
  async getDomainIntelligence(country: string): Promise<void> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Domain Intelligence for ${country}`);
    console.log('='.repeat(60));

    for (const topic of this.config.researchTopics) {
      const url = COUNTRY_PORTALS[country]?.[topic];
      if (!url) continue;

      try {
        const domain = new URL(url).hostname;
        const intel = await this.client.getDomainIntelligence(domain);

        console.log(`\n  ${domain}:`);
        console.log(`    Patterns: ${intel.knownPatterns}`);
        console.log(`    Selectors: ${intel.selectorChains}`);
        console.log(`    Validators: ${intel.validators}`);
        console.log(`    Success Rate: ${(intel.successRate * 100).toFixed(1)}%`);
        console.log(`    Use Session: ${intel.shouldUseSession}`);
      } catch (error) {
        console.log(`  ${topic}: Error fetching intelligence`);
      }
    }
  }

  /**
   * Preview what would happen for a browse operation (without executing)
   */
  async previewResearch(country: string, topic: ResearchTopic): Promise<void> {
    const url = COUNTRY_PORTALS[country]?.[topic];
    if (!url) {
      console.log(`No URL configured for ${country}/${topic}`);
      return;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Preview: ${country} / ${topic}`);
    console.log('='.repeat(60));

    try {
      const preview = await this.client.previewBrowse(url, {
        verify: { enabled: true, mode: this.config.verificationMode },
      });

      console.log(`\n  Execution Plan:`);
      console.log(`    Primary Tier: ${preview.plan.tier}`);
      console.log(`    Steps: ${preview.plan.steps.length}`);
      console.log(`    Reasoning: ${preview.plan.reasoning}`);

      console.log(`\n  Time Estimates:`);
      console.log(`    Min: ${preview.estimatedTime.min}ms`);
      console.log(`    Expected: ${preview.estimatedTime.expected}ms`);
      console.log(`    Max: ${preview.estimatedTime.max}ms`);

      console.log(`\n  Confidence:`);
      console.log(`    Overall: ${preview.confidence.overall}`);
      console.log(`    Domain Familiarity: ${preview.confidence.factors.domainFamiliarity}`);
      console.log(`    Has Patterns: ${preview.confidence.factors.hasLearnedPatterns}`);
      console.log(`    API Discovered: ${preview.confidence.factors.apiDiscovered}`);
      console.log(`    Bot Detection Likely: ${preview.confidence.factors.botDetectionLikely}`);
    } catch (error) {
      console.log(`  Preview failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Demonstrate workflow recording and replay
   */
  async demonstrateWorkflows(): Promise<void> {
    console.log(`\n${'='.repeat(60)}`);
    console.log('Workflow Recording & Replay Demo');
    console.log('='.repeat(60));

    console.log('\n1. Start Recording');
    console.log('   await client.startRecording({');
    console.log("     name: 'Spain Visa Research',");
    console.log("     description: 'Research digital nomad visa requirements',");
    console.log("     domain: 'extranjeros.inclusion.gob.es',");
    console.log("     tags: ['visa', 'spain', 'digital_nomad']");
    console.log('   });');

    console.log('\n2. Record Browse Operations');
    console.log("   await client.browse('https://extranjeros.inclusion.gob.es/visados');");
    console.log("   await client.annotateRecording(recordingId, {");
    console.log('     stepNumber: 1,');
    console.log("     annotation: 'Main visa information page',");
    console.log("     importance: 'critical'");
    console.log('   });');

    console.log('\n3. Stop & Save Workflow');
    console.log('   const workflow = await client.stopRecording(recordingId);');
    console.log('   // workflow.workflowId can be used for replay');

    console.log('\n4. Replay with Variables');
    console.log('   const results = await client.replayWorkflow(workflowId, {');
    console.log("     visaType: 'golden_visa'  // Variable substitution");
    console.log('   });');

    console.log('\n5. List & Manage Workflows');
    try {
      const workflows = await this.client.listWorkflows();
      console.log(`   Found ${workflows.total} saved workflows`);
    } catch (error) {
      console.log('   (Workflow API requires authenticated API access)');
    }
  }

  /**
   * Demonstrate skill pack features
   */
  async demonstrateSkillPacks(): Promise<void> {
    console.log(`\n${'='.repeat(60)}`);
    console.log('Skill Pack Demo');
    console.log('='.repeat(60));

    console.log('\n1. Export Government Portal Skills');
    console.log('   const pack = await client.exportSkillPack({');
    console.log("     domainPatterns: ['*.gob.es', '*.gov.pt'],");
    console.log("     verticals: ['government'],");
    console.log('     minSuccessRate: 0.8,');
    console.log("     packName: 'EU Government Portals'");
    console.log('   });');

    console.log('\n2. Import Skills from Pack');
    console.log('   await client.importSkillPack(pack, {');
    console.log("     conflictResolution: 'merge',");
    console.log('     importAntiPatterns: true');
    console.log('   });');

    console.log('\n3. Browse Skill Library');
    try {
      const library = await this.client.listSkillPackLibrary({
        vertical: 'research',
      });
      console.log(`   Found ${library.total} skill packs in library`);
    } catch (error) {
      console.log('   (Skill pack library requires API subscription)');
    }

    console.log('\n4. Get Skill Statistics');
    try {
      const stats = await this.client.getSkillPackStats();
      console.log(`   Total Skills: ${stats.totalSkills}`);
      console.log(`   By Tier: Essential=${stats.byTier.essential}, Domain=${stats.byTier['domain-specific']}`);
    } catch (error) {
      console.log('   (Skill stats require API access)');
    }
  }

  /**
   * Demonstrate API discovery
   */
  async demonstrateApiDiscovery(country: string): Promise<void> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`API Discovery Demo for ${country}`);
    console.log('='.repeat(60));

    const url = COUNTRY_PORTALS[country]?.visa_requirements;
    if (!url) return;

    const domain = new URL(url).hostname;

    console.log(`\n  Target: ${domain}`);
    console.log('  Discovering APIs...');

    try {
      const discovery = await this.client.discoverApis(domain, {
        methods: ['GET'],
        learnPatterns: true,
        maxDuration: 30000,
      });

      console.log(`\n  Results:`);
      console.log(`    Total Probes: ${discovery.stats.totalProbes}`);
      console.log(`    Successful: ${discovery.stats.successfulEndpoints}`);
      console.log(`    Patterns Learned: ${discovery.stats.patternsLearned}`);
      console.log(`    Duration: ${discovery.stats.duration}ms`);

      if (discovery.discovered.length > 0) {
        console.log(`\n  Discovered Endpoints:`);
        for (const ep of discovery.discovered.slice(0, 5)) {
          console.log(`    ${ep.method} ${ep.path} - ${ep.statusCode} (${ep.responseTime}ms)`);
        }
      }
    } catch (error) {
      console.log(`  Discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// ============================================
// REPORT GENERATOR
// ============================================

function generateReport(report: ResearchReport): void {
  console.log('\n\n' + '='.repeat(70));
  console.log('RESEARCH REPORT');
  console.log('='.repeat(70));

  console.log('\nConfiguration:');
  console.log(`  Countries: ${report.config.countries.join(', ')}`);
  console.log(`  Topics: ${report.config.researchTopics.join(', ')}`);
  console.log(`  Verification: ${report.config.verificationMode}`);

  console.log('\nExecution:');
  console.log(`  Started: ${new Date(report.startedAt).toISOString()}`);
  console.log(`  Completed: ${new Date(report.completedAt).toISOString()}`);
  console.log(`  Duration: ${(report.totalDuration / 1000).toFixed(1)}s`);

  console.log('\nOverall Statistics:');
  console.log(`  Total Researched: ${report.overallStats.totalResearched}`);
  console.log(`  Success Rate: ${(report.overallStats.successRate * 100).toFixed(1)}%`);
  console.log(`  Avg Load Time: ${report.overallStats.avgLoadTime.toFixed(0)}ms`);
  console.log(`  API Bypass Rate: ${(report.overallStats.apiBypassRate * 100).toFixed(1)}%`);

  console.log('\nPer-Country Results:');
  for (const summary of report.summaries) {
    console.log(`\n  ${summary.country}:`);
    console.log(`    Success: ${summary.successfulTopics}/${summary.totalTopics}`);
    console.log(`    Avg Load Time: ${summary.avgLoadTime.toFixed(0)}ms`);
    console.log(`    API Bypass: ${(summary.apiBypassRate * 100).toFixed(0)}%`);

    for (const result of summary.results) {
      const status = result.success
        ? (result.verificationPassed ? 'PASS' : 'WARN')
        : 'FAIL';
      console.log(`      [${status}] ${result.topic} - ${result.loadTime}ms`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('Key Takeaways:');
  console.log('='.repeat(70));
  console.log('1. Use verification presets for government content validation');
  console.log('2. API discovery can bypass browser rendering for 10-50x speedup');
  console.log('3. Workflow recording enables replayable research patterns');
  console.log('4. Skill packs allow cross-country pattern transfer');
  console.log('5. Session management enables multi-portal authentication');

  console.log('\nCloud API Usage:');
  console.log('-'.repeat(70));
  console.log("import { createUnbrowser } from '@unbrowser/core';");
  console.log('');
  console.log('const client = createUnbrowser({');
  console.log('  apiKey: process.env.UNBROWSER_API_KEY,');
  console.log('});');
  console.log('');
  console.log('// Research government portals');
  console.log("const result = await client.browse('https://extranjeros.inclusion.gob.es/visados', {");
  console.log('  verify: { enabled: true, mode: "thorough" },');
  console.log('});');
  console.log('');
  console.log('// Check if API was discovered and used');
  console.log('if (result.discoveredApis?.length > 0) {');
  console.log('  console.log("Used API bypass for faster extraction");');
  console.log('}');
}

// ============================================
// MAIN
// ============================================

async function main(): Promise<void> {
  const apiKey = process.env.UNBROWSER_API_KEY;

  if (!apiKey) {
    console.log('MoveAhead.ai Integration Example (INT-009)');
    console.log('==========================================\n');
    console.log('This example demonstrates integration with the Unbrowser cloud API.');
    console.log('');
    console.log('To run with live API calls:');
    console.log('  UNBROWSER_API_KEY=ub_live_xxx npx tsx examples/moveahead-integration.ts');
    console.log('');
    console.log('Without an API key, this example will show the integration patterns');
    console.log('and code samples without making actual API calls.\n');

    // Show demonstration without actual API calls
    console.log('='.repeat(70));
    console.log('INTEGRATION PATTERNS (Demo Mode)');
    console.log('='.repeat(70));

    console.log('\n1. CREATE CLIENT');
    console.log('-'.repeat(70));
    console.log("import { createUnbrowser } from '@unbrowser/core';");
    console.log('');
    console.log('const client = createUnbrowser({');
    console.log('  apiKey: process.env.UNBROWSER_API_KEY,');
    console.log('  baseUrl: "https://api.unbrowser.ai",');
    console.log('  timeout: 60000,');
    console.log('  retry: true,');
    console.log('});');

    console.log('\n2. BROWSE WITH VERIFICATION');
    console.log('-'.repeat(70));
    console.log("const result = await client.browse('https://extranjeros.inclusion.gob.es/visados', {");
    console.log('  verify: {');
    console.log('    enabled: true,');
    console.log('    mode: "thorough",  // basic | standard | thorough');
    console.log('  },');
    console.log('});');
    console.log('');
    console.log('if (result.verification?.passed) {');
    console.log('  console.log("Content verified:", result.content.markdown);');
    console.log('} else {');
    console.log('  console.log("Verification issues:", result.verification?.errors);');
    console.log('}');

    console.log('\n3. PREVIEW BEFORE BROWSING');
    console.log('-'.repeat(70));
    console.log('// See what will happen without executing (< 50ms)');
    console.log("const preview = await client.previewBrowse('https://example.gov');");
    console.log('console.log("Expected time:", preview.estimatedTime.expected, "ms");');
    console.log('console.log("Tier:", preview.plan.tier);');
    console.log('console.log("Confidence:", preview.confidence.overall);');

    console.log('\n4. DOMAIN INTELLIGENCE');
    console.log('-'.repeat(70));
    console.log("const intel = await client.getDomainIntelligence('extranjeros.inclusion.gob.es');");
    console.log('console.log("Learned patterns:", intel.knownPatterns);');
    console.log('console.log("Success rate:", intel.successRate);');
    console.log('console.log("Can bypass browser:", intel.knownPatterns > 0);');

    console.log('\n5. WORKFLOW RECORDING');
    console.log('-'.repeat(70));
    console.log('// Record browsing session as replayable workflow');
    console.log('const session = await client.startRecording({');
    console.log("  name: 'Visa Research',");
    console.log("  domain: 'extranjeros.inclusion.gob.es',");
    console.log('});');
    console.log('');
    console.log("await client.browse('https://extranjeros.inclusion.gob.es/visados');");
    console.log('const workflow = await client.stopRecording(session.recordingId);');
    console.log('');
    console.log('// Replay with different parameters');
    console.log('const results = await client.replayWorkflow(workflow.workflowId, {');
    console.log("  visaType: 'golden_visa'");
    console.log('});');

    console.log('\n6. SKILL PACKS');
    console.log('-'.repeat(70));
    console.log('// Export learned skills for sharing');
    console.log('const pack = await client.exportSkillPack({');
    console.log("  domainPatterns: ['*.gob.es', '*.gov.pt'],");
    console.log("  verticals: ['research'],");
    console.log('  minSuccessRate: 0.8,');
    console.log('});');
    console.log('');
    console.log('// Import skills from another instance');
    console.log('await client.importSkillPack(pack, {');
    console.log("  conflictResolution: 'merge',");
    console.log('});');

    console.log('\n7. API DISCOVERY');
    console.log('-'.repeat(70));
    console.log('// Proactively discover APIs for faster future access');
    console.log("const discovery = await client.discoverApis('api.example.gov', {");
    console.log("  methods: ['GET'],");
    console.log('  learnPatterns: true,');
    console.log('});');
    console.log('console.log("Found endpoints:", discovery.discovered.length);');
    console.log('console.log("Patterns learned:", discovery.stats.patternsLearned);');

    console.log('\n' + '='.repeat(70));
    console.log('For live execution, set UNBROWSER_API_KEY environment variable');
    console.log('='.repeat(70));

    return;
  }

  // Live execution with API key
  const client = new MoveAheadResearchClient(apiKey, {
    countries: ['ES', 'PT'],
    researchTopics: ['visa_requirements', 'tax_residency'],
    verificationMode: 'thorough',
  });

  // Check API health
  console.log('Checking API health...');
  const healthy = await client.checkHealth();
  if (!healthy) {
    console.error('API is not healthy. Please check your API key and connection.');
    return;
  }

  // Run demonstrations
  await client.previewResearch('ES', 'visa_requirements');
  await client.getDomainIntelligence('ES');
  await client.demonstrateWorkflows();
  await client.demonstrateSkillPacks();
  await client.demonstrateApiDiscovery('ES');

  // Run full research pipeline
  const report = await client.runFullResearch();
  generateReport(report);
}

// Run if called directly
main().catch(console.error);

export {
  MoveAheadResearchClient,
  MoveAheadConfig,
  ResearchTopic,
  TopicResearchResult,
  CountryResearchSummary,
  ResearchReport,
  COUNTRY_PORTALS,
  TOPIC_VERIFICATION,
  DEFAULT_CONFIG,
  generateReport,
};
