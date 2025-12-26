/**
 * API Fuzzing Discovery Example (FUZZ-001)
 *
 * Demonstrates proactive API discovery via fuzzing:
 * - Probes common API path patterns
 * - Tests multiple HTTP methods
 * - Learns successful patterns
 * - Builds API pattern database
 *
 * This complements organic API discovery by proactively
 * finding endpoints before they're accessed naturally.
 *
 * Once discovered, APIs are used directly, bypassing rendering.
 */

import { ApiDiscoveryOrchestrator } from '../src/core/api-discovery-orchestrator.js';
import { LearningEngine } from '../src/core/learning-engine.js';

async function discoverApis(domain: string, options: {
  methods?: readonly string[];
  learnPatterns?: boolean;
} = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`API Fuzzing Discovery: ${domain}`);
  console.log('='.repeat(60));

  // Initialize learning engine to save discovered patterns
  const learningEngine = new LearningEngine();
  await learningEngine.initialize();

  // Create orchestrator
  const orchestrator = new ApiDiscoveryOrchestrator(learningEngine);

  // Run fuzzing discovery
  const result = await orchestrator.discoverViaFuzzing(`https://${domain}`, {
    methods: options.methods ?? ['GET'], // Safe default
    learnPatterns: options.learnPatterns ?? true,
    probeTimeout: 3000,
    maxDuration: 30000,
    successCodes: [200, 201, 301, 302, 307, 308],
  });

  // Display results
  console.log('\n' + '-'.repeat(60));
  console.log('Discovery Results:');
  console.log('-'.repeat(60));

  console.log(`\nTotal Probes:       ${result.totalProbes}`);
  console.log(`Successful:         ${result.successfulEndpoints.length}`);
  console.log(`Failed:             ${result.failedProbes}`);
  console.log(`Patterns Learned:   ${result.patternsLearned}`);
  console.log(`Duration:           ${result.duration}ms`);

  if (result.successfulEndpoints.length > 0) {
    console.log('\n' + '-'.repeat(60));
    console.log('Discovered Endpoints:');
    console.log('-'.repeat(60));

    result.successfulEndpoints.forEach((endpoint, i) => {
      console.log(`\n${i + 1}. ${endpoint.method} ${endpoint.path}`);
      console.log(`   Status:        ${endpoint.statusCode}`);
      console.log(`   Response Time: ${endpoint.responseTime}ms`);
      if (endpoint.contentType) {
        console.log(`   Content-Type:  ${endpoint.contentType}`);
      }
    });

    console.log('\n' + '-'.repeat(60));
    console.log('Next Steps:');
    console.log('-'.repeat(60));
    console.log('1. These endpoints are now cached for future use');
    console.log('2. browse() will use APIs directly instead of rendering');
    console.log('3. ~10x speedup on subsequent accesses');
    console.log('4. Patterns shared across similar domains');
  } else {
    console.log('\n⚠️  No API endpoints discovered');
    console.log('\nPossible reasons:');
    console.log('- Domain does not expose public APIs');
    console.log('- APIs require authentication');
    console.log('- API paths use non-standard patterns');
    console.log('- Rate limiting or blocking occurred');
  }

  return result;
}

async function compareFuzzingStrategies(domain: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Comparing Fuzzing Strategies: ${domain}`);
  console.log('='.repeat(60));

  // Strategy 1: Conservative (GET only)
  console.log('\n[Strategy 1] Conservative - GET requests only');
  const conservative = await discoverApis(domain, {
    methods: ['GET'],
    learnPatterns: false, // Don't pollute learned patterns
  });

  // Strategy 2: Moderate (GET + POST)
  console.log('\n\n[Strategy 2] Moderate - GET and POST');
  const moderate = await discoverApis(domain, {
    methods: ['GET', 'POST'],
    learnPatterns: false,
  });

  // Strategy 3: Aggressive (All methods)
  console.log('\n\n[Strategy 3] Aggressive - All HTTP methods');
  const aggressive = await discoverApis(domain, {
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    learnPatterns: false,
  });

  // Compare results
  console.log('\n\n' + '='.repeat(60));
  console.log('Strategy Comparison:');
  console.log('='.repeat(60));

  console.log('\n| Strategy    | Probes | Discovered | Success Rate | Duration |');
  console.log('|-------------|--------|------------|--------------|----------|');

  const strategies = [
    { name: 'Conservative', result: conservative },
    { name: 'Moderate', result: moderate },
    { name: 'Aggressive', result: aggressive },
  ];

  strategies.forEach(({ name, result }) => {
    const successRate = ((result.successfulEndpoints.length / result.totalProbes) * 100).toFixed(1);
    console.log(
      `| ${name.padEnd(11)} | ${String(result.totalProbes).padStart(6)} | ` +
      `${String(result.successfulEndpoints.length).padStart(10)} | ` +
      `${String(successRate).padStart(11)}% | ${String(result.duration).padStart(7)}ms |`
    );
  });

  console.log('\n\nRecommendation:');
  console.log('-'.repeat(60));
  console.log('• Conservative: Safe for production, minimal side effects');
  console.log('• Moderate: Good balance, finds most REST APIs');
  console.log('• Aggressive: Maximum discovery, use with caution');
}

// Example usage
async function main() {
  console.log('API Fuzzing Discovery Example (FUZZ-001)');
  console.log('Demonstrates proactive API endpoint discovery\n');

  const exampleDomains = [
    'api.github.com',      // Known to have APIs
    'jsonplaceholder.typicode.com', // Test API service
    // Add more domains to test
  ];

  // Single domain discovery
  if (exampleDomains.length > 0) {
    console.log('\n[Part 1] Single Domain Discovery\n');
    await discoverApis(exampleDomains[0], {
      methods: ['GET'],
      learnPatterns: true,
    });
  }

  // Strategy comparison
  if (exampleDomains.length > 1) {
    console.log('\n\n[Part 2] Strategy Comparison\n');
    await compareFuzzingStrategies(exampleDomains[1]);
  }

  console.log('\n\nKey Learning Points:');
  console.log('='.repeat(60));
  console.log('1. Proactive Discovery: Find APIs before organic access');
  console.log('2. Common Paths: Tests /api, /v1, /graphql, etc.');
  console.log('3. Pattern Learning: Successful discoveries cached');
  console.log('4. Speed Improvement: Future browse() calls use APIs directly');
  console.log('5. Strategy Comparison: Choose based on risk tolerance');
  console.log('\nRun fuzzing on new domains to build API pattern database!');

  console.log('\n\nUsage Tips:');
  console.log('-'.repeat(60));
  console.log('• Run during off-hours to avoid rate limiting');
  console.log('• Start with GET-only for safety');
  console.log('• Use with authenticated sessions for private APIs');
  console.log('• Combine with OpenAPI discovery for best results');
  console.log('• Patterns learned benefit all future users');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { discoverApis, compareFuzzingStrategies };
