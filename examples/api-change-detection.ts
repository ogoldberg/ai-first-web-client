/**
 * API Change Detection Example (QA-005)
 *
 * Demonstrates using Unbrowser to detect when API responses change from baseline:
 * - Capture API response baselines
 * - Detect structural changes (new/removed fields)
 * - Detect value changes (type changes, significant value shifts)
 * - Detect schema evolution
 * - Generate change reports for monitoring
 *
 * Use cases:
 * - Monitor third-party APIs for breaking changes
 * - Detect unannounced API updates
 * - Track API version drift
 * - Validate API contract compliance
 */

import { createLLMBrowser, type LLMBrowserClient } from '../src/sdk.js';
import { generateTestReport, type TestCase, type TestSuite } from '../src/testing.js';

// ============================================
// TYPES
// ============================================

/**
 * Baseline snapshot of an API response
 */
interface ApiBaseline {
  url: string;
  method: string;
  capturedAt: number;
  statusCode: number;
  responseTime: number;
  schema: SchemaSnapshot;
  sampleData: unknown;
  headers?: Record<string, string>;
}

/**
 * Schema snapshot for structural comparison
 */
interface SchemaSnapshot {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  fields?: Record<string, SchemaSnapshot>;
  items?: SchemaSnapshot;
  optional?: boolean;
}

/**
 * Detected change in API response
 */
interface ApiChange {
  type: 'field_added' | 'field_removed' | 'type_changed' | 'value_changed' | 'status_changed' | 'schema_changed';
  path: string;
  severity: 'breaking' | 'warning' | 'info';
  message: string;
  oldValue?: unknown;
  newValue?: unknown;
}

/**
 * Result of comparing API to baseline
 */
interface ApiComparisonResult {
  url: string;
  method: string;
  baselineCapturedAt: number;
  comparedAt: number;
  hasChanges: boolean;
  changes: ApiChange[];
  breakingChanges: number;
  warnings: number;
  infos: number;
  responseTime: number;
  baselineResponseTime: number;
}

/**
 * Configuration for API monitoring
 */
interface ApiMonitorConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  name?: string;
  expectedSchema?: SchemaSnapshot;
  tolerances?: {
    responseTimeVariance?: number; // Percentage (e.g., 0.5 = 50% variance allowed)
    ignorePaths?: string[]; // Paths to ignore in comparison
  };
}

// ============================================
// SCHEMA EXTRACTION
// ============================================

/**
 * Extract schema from a value
 */
function extractSchema(value: unknown): SchemaSnapshot {
  if (value === null) {
    return { type: 'null' };
  }

  if (Array.isArray(value)) {
    const items = value.length > 0 ? extractSchema(value[0]) : { type: 'null' as const };
    return { type: 'array', items };
  }

  if (typeof value === 'object') {
    const fields: Record<string, SchemaSnapshot> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      fields[key] = extractSchema(val);
    }
    return { type: 'object', fields };
  }

  if (typeof value === 'string') {
    return { type: 'string' };
  }

  if (typeof value === 'number') {
    return { type: 'number' };
  }

  if (typeof value === 'boolean') {
    return { type: 'boolean' };
  }

  return { type: 'null' };
}

// ============================================
// COMPARISON FUNCTIONS
// ============================================

/**
 * Compare two schemas and detect changes
 */
function compareSchemas(
  baseline: SchemaSnapshot,
  current: SchemaSnapshot,
  path: string = ''
): ApiChange[] {
  const changes: ApiChange[] = [];

  // Type changed
  if (baseline.type !== current.type) {
    changes.push({
      type: 'type_changed',
      path: path || '(root)',
      severity: 'breaking',
      message: `Type changed from ${baseline.type} to ${current.type}`,
      oldValue: baseline.type,
      newValue: current.type,
    });
    return changes; // Don't compare further if types differ
  }

  // Object comparison
  if (baseline.type === 'object' && baseline.fields && current.fields) {
    const baselineFields = new Set(Object.keys(baseline.fields));
    const currentFields = new Set(Object.keys(current.fields));

    // Check for removed fields
    for (const field of baselineFields) {
      if (!currentFields.has(field)) {
        changes.push({
          type: 'field_removed',
          path: path ? `${path}.${field}` : field,
          severity: 'breaking',
          message: `Field "${field}" was removed`,
          oldValue: baseline.fields[field],
        });
      }
    }

    // Check for added fields
    for (const field of currentFields) {
      if (!baselineFields.has(field)) {
        changes.push({
          type: 'field_added',
          path: path ? `${path}.${field}` : field,
          severity: 'info',
          message: `New field "${field}" was added`,
          newValue: current.fields[field],
        });
      }
    }

    // Recursively compare common fields
    for (const field of baselineFields) {
      if (currentFields.has(field)) {
        const fieldPath = path ? `${path}.${field}` : field;
        changes.push(...compareSchemas(baseline.fields[field], current.fields[field], fieldPath));
      }
    }
  }

  // Array comparison
  if (baseline.type === 'array' && baseline.items && current.items) {
    changes.push(...compareSchemas(baseline.items, current.items, `${path}[]`));
  }

  return changes;
}

/**
 * Compare specific values for significant changes
 */
function compareValues(
  baseline: unknown,
  current: unknown,
  path: string = '',
  ignorePaths: string[] = []
): ApiChange[] {
  const changes: ApiChange[] = [];

  // Skip ignored paths
  if (ignorePaths.some(p => path.startsWith(p) || path.match(new RegExp(p)))) {
    return changes;
  }

  // Null comparison
  if (baseline === null || current === null) {
    if (baseline !== current) {
      changes.push({
        type: 'value_changed',
        path: path || '(root)',
        severity: 'warning',
        message: `Value changed from ${baseline} to ${current}`,
        oldValue: baseline,
        newValue: current,
      });
    }
    return changes;
  }

  // Array comparison
  if (Array.isArray(baseline) && Array.isArray(current)) {
    if (baseline.length !== current.length) {
      changes.push({
        type: 'value_changed',
        path: `${path}.length`,
        severity: 'info',
        message: `Array length changed from ${baseline.length} to ${current.length}`,
        oldValue: baseline.length,
        newValue: current.length,
      });
    }
    return changes;
  }

  // Object comparison
  if (typeof baseline === 'object' && typeof current === 'object') {
    const baselineObj = baseline as Record<string, unknown>;
    const currentObj = current as Record<string, unknown>;

    for (const key of Object.keys(baselineObj)) {
      if (key in currentObj) {
        const fieldPath = path ? `${path}.${key}` : key;
        changes.push(...compareValues(baselineObj[key], currentObj[key], fieldPath, ignorePaths));
      }
    }
    return changes;
  }

  // Primitive comparison - only flag significant changes
  if (baseline !== current) {
    // Skip timestamps, IDs, and other frequently changing fields
    const volatilePatterns = [/id$/i, /timestamp/i, /date/i, /time/i, /created/i, /updated/i];
    const isVolatile = volatilePatterns.some(p => p.test(path));

    if (!isVolatile) {
      changes.push({
        type: 'value_changed',
        path: path || '(root)',
        severity: 'info',
        message: `Value changed from "${baseline}" to "${current}"`,
        oldValue: baseline,
        newValue: current,
      });
    }
  }

  return changes;
}

// ============================================
// API MONITORING
// ============================================

/**
 * Capture a baseline for an API endpoint
 */
async function captureBaseline(
  browser: LLMBrowserClient,
  config: ApiMonitorConfig
): Promise<ApiBaseline> {
  const startTime = Date.now();

  const result = await browser.browse(config.url, {
    forceTier: 'intelligence', // Use fast tier for API calls
  });

  const responseTime = Date.now() - startTime;

  // Parse response data
  let data: unknown = null;
  try {
    // Try to parse as JSON from the content
    const content = result.content?.markdown || '';
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      data = JSON.parse(jsonMatch[1]);
    } else {
      // Try direct parse
      data = JSON.parse(content);
    }
  } catch {
    // If not JSON, use raw content
    data = result.content?.markdown;
  }

  return {
    url: config.url,
    method: config.method || 'GET',
    capturedAt: Date.now(),
    statusCode: 200, // Assume success if we got content
    responseTime,
    schema: extractSchema(data),
    sampleData: data,
  };
}

/**
 * Compare current API response to baseline
 */
async function compareToBaseline(
  browser: LLMBrowserClient,
  baseline: ApiBaseline,
  config?: ApiMonitorConfig
): Promise<ApiComparisonResult> {
  const startTime = Date.now();

  const result = await browser.browse(baseline.url, {
    forceTier: 'intelligence',
  });

  const responseTime = Date.now() - startTime;
  const changes: ApiChange[] = [];

  // Parse current response
  let currentData: unknown = null;
  try {
    const content = result.content?.markdown || '';
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      currentData = JSON.parse(jsonMatch[1]);
    } else {
      currentData = JSON.parse(content);
    }
  } catch {
    currentData = result.content?.markdown;
  }

  // Extract current schema
  const currentSchema = extractSchema(currentData);

  // Compare schemas
  changes.push(...compareSchemas(baseline.schema, currentSchema));

  // Compare values (with optional ignore paths)
  const ignorePaths = config?.tolerances?.ignorePaths || [];
  changes.push(...compareValues(baseline.sampleData, currentData, '', ignorePaths));

  // Check response time variance
  if (config?.tolerances?.responseTimeVariance !== undefined) {
    const variance = Math.abs(responseTime - baseline.responseTime) / baseline.responseTime;
    if (variance > config.tolerances.responseTimeVariance) {
      changes.push({
        type: 'value_changed',
        path: '(responseTime)',
        severity: 'warning',
        message: `Response time changed significantly: ${baseline.responseTime}ms -> ${responseTime}ms (${(variance * 100).toFixed(1)}% variance)`,
        oldValue: baseline.responseTime,
        newValue: responseTime,
      });
    }
  }

  return {
    url: baseline.url,
    method: baseline.method,
    baselineCapturedAt: baseline.capturedAt,
    comparedAt: Date.now(),
    hasChanges: changes.length > 0,
    changes,
    breakingChanges: changes.filter(c => c.severity === 'breaking').length,
    warnings: changes.filter(c => c.severity === 'warning').length,
    infos: changes.filter(c => c.severity === 'info').length,
    responseTime,
    baselineResponseTime: baseline.responseTime,
  };
}

/**
 * Monitor multiple APIs for changes
 */
async function monitorApis(
  browser: LLMBrowserClient,
  baselines: Map<string, ApiBaseline>,
  configs: ApiMonitorConfig[]
): Promise<ApiComparisonResult[]> {
  const results: ApiComparisonResult[] = [];

  for (const config of configs) {
    const baseline = baselines.get(config.url);
    if (!baseline) {
      console.log(`  Skipping ${config.name || config.url}: No baseline`);
      continue;
    }

    console.log(`  Checking: ${config.name || config.url}`);
    const result = await compareToBaseline(browser, baseline, config);
    results.push(result);

    if (result.hasChanges) {
      const icon = result.breakingChanges > 0 ? 'BREAKING' : result.warnings > 0 ? 'WARN' : 'INFO';
      console.log(`    [${icon}] ${result.changes.length} changes detected`);
    } else {
      console.log(`    [OK] No changes`);
    }
  }

  return results;
}

// ============================================
// REPORT GENERATION
// ============================================

/**
 * Generate a change report
 */
function generateChangeReport(results: ApiComparisonResult[]): string {
  const lines: string[] = [];

  lines.push('# API Change Detection Report');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Summary
  const totalApis = results.length;
  const apisWithChanges = results.filter(r => r.hasChanges).length;
  const totalBreaking = results.reduce((sum, r) => sum + r.breakingChanges, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings, 0);

  lines.push('## Summary');
  lines.push(`- APIs Checked: ${totalApis}`);
  lines.push(`- APIs with Changes: ${apisWithChanges}`);
  lines.push(`- Breaking Changes: ${totalBreaking}`);
  lines.push(`- Warnings: ${totalWarnings}`);
  lines.push('');

  // Breaking changes section
  if (totalBreaking > 0) {
    lines.push('## Breaking Changes');
    for (const result of results) {
      const breaking = result.changes.filter(c => c.severity === 'breaking');
      if (breaking.length > 0) {
        lines.push(`### ${result.url}`);
        for (const change of breaking) {
          lines.push(`- **${change.path}**: ${change.message}`);
        }
        lines.push('');
      }
    }
  }

  // Warnings section
  const warnings = results.flatMap(r => r.changes.filter(c => c.severity === 'warning'));
  if (warnings.length > 0) {
    lines.push('## Warnings');
    for (const result of results) {
      const warns = result.changes.filter(c => c.severity === 'warning');
      if (warns.length > 0) {
        lines.push(`### ${result.url}`);
        for (const change of warns) {
          lines.push(`- ${change.path}: ${change.message}`);
        }
        lines.push('');
      }
    }
  }

  // Details for all APIs
  lines.push('## API Details');
  for (const result of results) {
    lines.push(`### ${result.url}`);
    lines.push(`- Baseline: ${new Date(result.baselineCapturedAt).toISOString()}`);
    lines.push(`- Response Time: ${result.responseTime}ms (baseline: ${result.baselineResponseTime}ms)`);
    lines.push(`- Changes: ${result.changes.length}`);
    if (result.changes.length > 0) {
      lines.push('- Change Details:');
      for (const change of result.changes) {
        lines.push(`  - [${change.severity.toUpperCase()}] ${change.path}: ${change.message}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate JUnit XML report
 */
function generateJUnitReport(results: ApiComparisonResult[]): string {
  const testCases: TestCase[] = results.map(result => {
    const testCase: TestCase = {
      name: `API: ${new URL(result.url).pathname}`,
      className: 'ApiChangeDetection',
      time: result.responseTime / 1000,
    };

    if (result.breakingChanges > 0) {
      const breakingChanges = result.changes.filter(c => c.severity === 'breaking');
      testCase.failure = {
        message: `${result.breakingChanges} breaking change(s) detected`,
        type: 'BreakingChange',
      };
    }

    return testCase;
  });

  const suite: TestSuite = {
    name: 'API Change Detection',
    tests: results.length,
    failures: results.filter(r => r.breakingChanges > 0).length,
    errors: 0,
    skipped: 0,
    time: results.reduce((sum, r) => sum + r.responseTime, 0) / 1000,
    timestamp: new Date().toISOString(),
    testCases,
  };

  return generateTestReport(suite, 'junit');
}

// ============================================
// MAIN EXAMPLE
// ============================================

async function main() {
  console.log('API Change Detection Example (QA-005)');
  console.log('Demonstrates detecting when API responses change from baseline\n');

  const browser = await createLLMBrowser();

  try {
    // Example 1: Capture baselines
    console.log('\n[Example 1] Capturing API Baselines\n');

    const apis: ApiMonitorConfig[] = [
      {
        url: 'https://jsonplaceholder.typicode.com/users/1',
        name: 'User Profile',
        tolerances: {
          ignorePaths: ['id', 'website'],
        },
      },
      {
        url: 'https://jsonplaceholder.typicode.com/posts/1',
        name: 'Blog Post',
        tolerances: {
          ignorePaths: ['id', 'userId'],
        },
      },
      {
        url: 'https://jsonplaceholder.typicode.com/todos/1',
        name: 'Todo Item',
      },
    ];

    const baselines = new Map<string, ApiBaseline>();

    console.log('Capturing baselines...');
    for (const api of apis) {
      console.log(`  ${api.name}: ${api.url}`);
      const baseline = await captureBaseline(browser, api);
      baselines.set(api.url, baseline);
      console.log(`    Captured: ${Object.keys(baseline.schema.fields || {}).length} fields, ${baseline.responseTime}ms`);
    }

    // Example 2: Compare to baseline (same data, no changes expected)
    console.log('\n\n[Example 2] Comparing to Baseline\n');

    console.log('Checking for changes...');
    const results = await monitorApis(browser, baselines, apis);

    // Example 3: Schema analysis
    console.log('\n\n[Example 3] Schema Analysis\n');

    for (const [url, baseline] of baselines.entries()) {
      const apiConfig = apis.find(a => a.url === url);
      console.log(`${apiConfig?.name || url}:`);
      console.log(`  Type: ${baseline.schema.type}`);
      if (baseline.schema.fields) {
        console.log(`  Fields: ${Object.keys(baseline.schema.fields).join(', ')}`);
      }
    }

    // Example 4: Generate change report
    console.log('\n\n[Example 4] Change Report\n');

    const report = generateChangeReport(results);
    console.log('Markdown Report Generated:');
    console.log('-'.repeat(60));
    console.log(report.substring(0, 800) + '...\n');

    // Example 5: JUnit report for CI/CD
    console.log('\n[Example 5] JUnit Report\n');

    const junitXml = generateJUnitReport(results);
    console.log('JUnit XML report generated:');
    console.log('-'.repeat(60));
    console.log(junitXml.substring(0, 400) + '...\n');

    // Example 6: Simulated breaking change detection
    console.log('\n[Example 6] Breaking Change Detection Demo\n');

    // Create a modified baseline to simulate change
    const originalBaseline = baselines.get(apis[0].url)!;
    const modifiedBaseline: ApiBaseline = {
      ...originalBaseline,
      schema: {
        ...originalBaseline.schema,
        fields: {
          ...originalBaseline.schema.fields,
          legacyField: { type: 'string' }, // Add a "removed" field
        },
      },
    };

    // Simulate field removal by using modified baseline
    const changes = compareSchemas(modifiedBaseline.schema, originalBaseline.schema);
    console.log('Simulated breaking changes (if legacyField was removed):');
    for (const change of changes) {
      console.log(`  [${change.severity.toUpperCase()}] ${change.path}: ${change.message}`);
    }

    // Summary
    console.log('\n\n' + '='.repeat(60));
    console.log('Key Takeaways:');
    console.log('='.repeat(60));
    console.log('1. Baseline Capture: Snapshot API response structure');
    console.log('2. Schema Extraction: Automatically infer response schema');
    console.log('3. Change Detection: Find added/removed fields, type changes');
    console.log('4. Severity Levels: Breaking, warning, and info changes');
    console.log('5. Tolerance Config: Ignore volatile fields like timestamps');
    console.log('6. Reports: Markdown and JUnit formats for CI/CD');

    console.log('\nUsage Tips:');
    console.log('-'.repeat(60));
    console.log('1. Store baselines in version control');
    console.log('2. Run change detection in CI pipelines');
    console.log('3. Configure ignore paths for dynamic fields');
    console.log('4. Set up alerts for breaking changes');
    console.log('5. Review info-level changes for API evolution');

    console.log('\nChange Severity Guide:');
    console.log('-'.repeat(60));
    console.log('  BREAKING: Field removed, type changed - requires code updates');
    console.log('  WARNING:  Significant value changes, performance issues');
    console.log('  INFO:     New fields, minor value changes - usually safe');
  } finally {
    await browser.cleanup();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  // Schema extraction
  extractSchema,
  // Comparison functions
  compareSchemas,
  compareValues,
  // API monitoring
  captureBaseline,
  compareToBaseline,
  monitorApis,
  // Report generation
  generateChangeReport,
  generateJUnitReport,
  // Types
  type ApiBaseline,
  type SchemaSnapshot,
  type ApiChange,
  type ApiComparisonResult,
  type ApiMonitorConfig,
};
