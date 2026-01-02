#!/usr/bin/env node
/**
 * Test script for LLM-Assisted Problem Response
 *
 * Demonstrates the feedback loop:
 * 1. Browser encounters a problem
 * 2. Returns ProblemResponse with research suggestion
 * 3. LLM researches solutions
 * 4. LLM retries with new parameters
 * 5. Success is learned
 */

import {
  generateResearchSuggestion,
  detectBotProtection,
  classifyProblem,
  createProblemResponse,
  suggestRetryConfig,
} from '../dist/core/research-suggestion.js';

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

function log(label, message, color = 'blue') {
  console.log(`${COLORS[color]}[${label}]${COLORS.reset} ${message}`);
}

function prettyPrint(obj, indent = 2) {
  console.log(JSON.stringify(obj, null, indent));
}

async function main() {
  console.log('='.repeat(60));
  console.log(`${COLORS.bold}LLM-ASSISTED PROBLEM RESPONSE DEMO${COLORS.reset}`);
  console.log('='.repeat(60));
  console.log();

  // Scenario 1: Bot detection (Cloudflare)
  console.log(`${COLORS.cyan}--- Scenario 1: Cloudflare Bot Detection ---${COLORS.reset}`);
  console.log();

  const cloudflareHtml = `
    <!DOCTYPE html>
    <html>
    <head><title>Just a moment...</title></head>
    <body>
      <div id="cf-wrapper">
        <h2>Checking your browser before accessing example.com</h2>
        <p>This process is automatic. Your browser will redirect shortly.</p>
      </div>
    </body>
    </html>
  `;

  const detectionType = detectBotProtection(cloudflareHtml, 403, { 'cf-ray': '123abc' });
  log('Detection', `Identified: ${detectionType}`, 'yellow');

  const problemResponse = createProblemResponse('https://example.com/products', 'bot_detection', {
    statusCode: 403,
    detectionType,
    attemptedStrategies: ['intelligence', 'lightweight'],
    partialContent: cloudflareHtml.substring(0, 200),
  });

  log('Problem Response', 'Generated for LLM:', 'blue');
  prettyPrint({
    needsAssistance: problemResponse.needsAssistance,
    problemType: problemResponse.problemType,
    detectionType: problemResponse.detectionType,
    reason: problemResponse.reason,
    attemptedStrategies: problemResponse.attemptedStrategies,
  });

  console.log();
  log('Research Suggestion', 'For LLM to investigate:', 'cyan');
  prettyPrint({
    searchQuery: problemResponse.researchSuggestion.searchQuery,
    retryParameters: problemResponse.researchSuggestion.retryParameters,
    hints: problemResponse.researchSuggestion.hints.slice(0, 3),
  });

  const retryConfig = suggestRetryConfig('bot_detection', detectionType);
  console.log();
  log('Suggested Retry Config', 'LLM can use these settings:', 'green');
  prettyPrint(retryConfig);

  // Scenario 2: Extraction failure
  console.log();
  console.log(`${COLORS.cyan}--- Scenario 2: Content Extraction Failure ---${COLORS.reset}`);
  console.log();

  const extractionProblem = createProblemResponse('https://spa-app.com/dashboard', 'extraction_failure', {
    error: 'No content found in main selectors',
    attemptedStrategies: ['intelligence', 'lightweight'],
    partialContent: '<html><body><div id="app"></div><script src="bundle.js"></script></body></html>',
  });

  log('Problem Response', 'Generated for extraction failure:', 'blue');
  prettyPrint({
    problemType: extractionProblem.problemType,
    reason: extractionProblem.reason,
  });

  console.log();
  log('Research Suggestion', 'For LLM to investigate:', 'cyan');
  prettyPrint({
    searchQuery: extractionProblem.researchSuggestion.searchQuery,
    hints: extractionProblem.researchSuggestion.hints.slice(0, 3),
    retryParameters: extractionProblem.researchSuggestion.retryParameters,
  });

  const extractionRetry = suggestRetryConfig('extraction_failure');
  console.log();
  log('Suggested Retry Config', 'LLM can use these settings:', 'green');
  prettyPrint(extractionRetry);

  // Scenario 3: Rate limiting
  console.log();
  console.log(`${COLORS.cyan}--- Scenario 3: Rate Limiting ---${COLORS.reset}`);
  console.log();

  const rateLimitProblem = classifyProblem('Too many requests', 429);
  const rateLimitResponse = createProblemResponse('https://api.example.com/data', rateLimitProblem, {
    statusCode: 429,
    attemptedStrategies: ['api_call'],
  });

  log('Problem Type', `Classified as: ${rateLimitProblem}`, 'yellow');
  log('Research Suggestion', 'For rate limiting:', 'cyan');
  prettyPrint({
    searchQuery: rateLimitResponse.researchSuggestion.searchQuery,
    hints: rateLimitResponse.researchSuggestion.hints,
  });

  const rateLimitRetry = suggestRetryConfig('rate_limiting');
  console.log();
  log('Suggested Retry Config', 'LLM can use these settings:', 'green');
  prettyPrint(rateLimitRetry);

  // Scenario 4: JavaScript required
  console.log();
  console.log(`${COLORS.cyan}--- Scenario 4: JavaScript Required ---${COLORS.reset}`);
  console.log();

  const jsRequiredProblem = classifyProblem(
    'Content not found',
    200,
    '<noscript>Please enable JavaScript</noscript>',
    ['intelligence']
  );

  log('Problem Type', `Classified as: ${jsRequiredProblem}`, 'yellow');

  const jsResponse = createProblemResponse('https://react-app.com/page', jsRequiredProblem, {
    attemptedStrategies: ['intelligence'],
    partialContent: '<noscript>Please enable JavaScript</noscript>',
  });

  log('Research Suggestion', 'For JavaScript-required sites:', 'cyan');
  prettyPrint({
    searchQuery: jsResponse.researchSuggestion.searchQuery,
    hints: jsResponse.researchSuggestion.hints.slice(0, 3),
  });

  const jsRetry = suggestRetryConfig('javascript_required');
  console.log();
  log('Suggested Retry Config', 'LLM can use these settings:', 'green');
  prettyPrint(jsRetry);

  // Summary
  console.log();
  console.log('='.repeat(60));
  console.log(`${COLORS.bold}FEEDBACK LOOP SUMMARY${COLORS.reset}`);
  console.log('='.repeat(60));
  console.log(`
${COLORS.green}How the LLM-Assisted Feedback Loop Works:${COLORS.reset}

1. ${COLORS.yellow}Browser encounters problem${COLORS.reset}
   - Bot detection, extraction failure, rate limiting, etc.

2. ${COLORS.yellow}Returns ProblemResponse${COLORS.reset}
   - problemType: Categorizes the issue
   - reason: Human-readable explanation
   - researchSuggestion: Search query, hints, retry parameters

3. ${COLORS.yellow}LLM researches solutions${COLORS.reset}
   - Uses searchQuery to find solutions
   - Reviews hints for specific guidance
   - Checks documentation URLs if available

4. ${COLORS.yellow}LLM retries with new config${COLORS.reset}
   - Uses retryWith parameter with RetryConfig
   - Applies learned settings (headers, delays, etc.)

5. ${COLORS.yellow}Success is learned${COLORS.reset}
   - Working configurations are remembered
   - Future requests use optimized settings
`);
}

main().catch(console.error);
