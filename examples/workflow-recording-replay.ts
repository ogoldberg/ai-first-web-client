/**
 * Workflow Recording and Replay Example (QA-004)
 *
 * Demonstrates using Unbrowser's workflow recording capabilities:
 * - Record browsing sessions as replayable workflows
 * - Annotate steps with descriptions and importance levels
 * - Replay workflows with variable substitution
 * - Validate replay results against expected outcomes
 * - Track workflow success rates over time
 *
 * Use cases:
 * - Create test workflows that can be replayed with different parameters
 * - Build regression test suites from recorded browsing sessions
 * - Automate repetitive browsing tasks with learned patterns
 * - Share workflows across team members
 */

import { createLLMBrowser, type LLMBrowserClient } from '../src/sdk.js';
import { WorkflowRecorder } from '../src/core/workflow-recorder.js';
import { generateTestReport, type TestCase, type TestSuite } from '../src/testing.js';
import type {
  Workflow,
  WorkflowStep,
  WorkflowReplayResult,
  WorkflowStepResult,
  WorkflowVariables,
} from '../src/types/workflow.js';
import type { VerificationCheck } from '../src/types/verification.js';

// ============================================
// TYPES
// ============================================

/**
 * Configuration for workflow replay validation
 */
interface ReplayValidation {
  checks: VerificationCheck[];
  minSuccessRate?: number;
  maxDuration?: number;
}

/**
 * Result of validating a workflow replay
 */
interface ValidationResult {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
  }>;
  duration: number;
}

/**
 * Workflow test case configuration
 */
interface WorkflowTestCase {
  name: string;
  workflowId: string;
  variables: WorkflowVariables;
  validation?: ReplayValidation;
}

/**
 * Result of running a workflow test
 */
interface WorkflowTestResult {
  testName: string;
  workflowId: string;
  passed: boolean;
  replay?: WorkflowReplayResult;
  validation?: ValidationResult;
  error?: string;
  duration: number;
}

// ============================================
// WORKFLOW RECORDER WRAPPER
// ============================================

/**
 * Wrapper for workflow recording with the local SDK
 */
class WorkflowManager {
  private recorder: WorkflowRecorder;
  private browser: LLMBrowserClient;

  constructor(browser: LLMBrowserClient) {
    this.browser = browser;
    this.recorder = new WorkflowRecorder();
  }

  /**
   * Start a new recording session
   */
  async startRecording(config: {
    name: string;
    description: string;
    domain: string;
    tags?: string[];
  }): Promise<string> {
    return this.recorder.startRecording({
      name: config.name,
      description: config.description,
      domain: config.domain,
      tags: config.tags || [],
      tenantId: 'example-user',
    });
  }

  /**
   * Record a browse operation as a workflow step
   */
  async recordBrowse(recordingId: string, url: string): Promise<void> {
    const result = await this.browser.browse(url);
    await this.recorder.recordStep(recordingId, result);
  }

  /**
   * Annotate a step in the recording
   */
  async annotateStep(
    recordingId: string,
    stepNumber: number,
    annotation: string,
    importance?: 'critical' | 'important' | 'optional'
  ): Promise<void> {
    await this.recorder.annotateStep(recordingId, {
      stepNumber,
      annotation,
      importance,
    });
  }

  /**
   * Stop recording and save as workflow
   */
  async stopRecording(recordingId: string): Promise<Workflow | null> {
    return this.recorder.stopRecording(recordingId, true);
  }

  /**
   * Get a saved workflow
   */
  getWorkflow(workflowId: string): Workflow | undefined {
    return this.recorder.getWorkflow(workflowId);
  }

  /**
   * List all workflows
   */
  listWorkflows(domain?: string): Workflow[] {
    return this.recorder.listWorkflows(domain);
  }

  /**
   * Replay a workflow with optional variable substitution
   */
  async replayWorkflow(
    workflowId: string,
    variables?: WorkflowVariables
  ): Promise<WorkflowReplayResult> {
    const workflow = this.recorder.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const startTime = Date.now();
    const results: WorkflowStepResult[] = [];

    for (const step of workflow.steps) {
      const stepStart = Date.now();

      try {
        // Apply variable substitution to URL if needed
        let url = step.url || '';
        if (variables) {
          for (const [key, value] of Object.entries(variables)) {
            url = url.replace(`{{${key}}}`, String(value));
          }
        }

        if (step.action === 'browse' && url) {
          const browseResult = await this.browser.browse(url);

          results.push({
            stepNumber: step.stepNumber,
            success: true,
            data: {
              title: browseResult.title,
              contentLength: browseResult.content?.markdown?.length || 0,
            },
            duration: Date.now() - stepStart,
            tier: browseResult.learning?.renderTier,
          });
        } else {
          // Skip non-browse steps for now
          results.push({
            stepNumber: step.stepNumber,
            success: true,
            duration: Date.now() - stepStart,
          });
        }
      } catch (error) {
        results.push({
          stepNumber: step.stepNumber,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: Date.now() - stepStart,
        });
      }
    }

    const overallSuccess = results.every(r => r.success);

    // Update workflow stats
    await this.recorder.updateWorkflowStats(workflowId, overallSuccess);

    return {
      workflowId,
      executedAt: startTime,
      results,
      overallSuccess,
      totalDuration: Date.now() - startTime,
    };
  }

  /**
   * Delete a workflow
   */
  async deleteWorkflow(workflowId: string): Promise<boolean> {
    return this.recorder.deleteWorkflow(workflowId);
  }
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validate a workflow replay result
 */
function validateReplay(
  replay: WorkflowReplayResult,
  validation: ReplayValidation
): ValidationResult {
  const checks: ValidationResult['checks'] = [];
  let allPassed = true;

  // Check overall success
  if (!replay.overallSuccess) {
    checks.push({
      name: 'Overall Success',
      passed: false,
      message: 'One or more steps failed',
    });
    allPassed = false;
  } else {
    checks.push({
      name: 'Overall Success',
      passed: true,
      message: 'All steps completed successfully',
    });
  }

  // Check duration
  if (validation.maxDuration && replay.totalDuration > validation.maxDuration) {
    checks.push({
      name: 'Max Duration',
      passed: false,
      message: `Duration ${replay.totalDuration}ms exceeds max ${validation.maxDuration}ms`,
    });
    allPassed = false;
  } else if (validation.maxDuration) {
    checks.push({
      name: 'Max Duration',
      passed: true,
      message: `Duration ${replay.totalDuration}ms within limit`,
    });
  }

  // Check step count
  const expectedSteps = replay.results.length;
  const successfulSteps = replay.results.filter(r => r.success).length;
  const successRate = expectedSteps > 0 ? successfulSteps / expectedSteps : 0;

  if (validation.minSuccessRate && successRate < validation.minSuccessRate) {
    checks.push({
      name: 'Success Rate',
      passed: false,
      message: `Success rate ${(successRate * 100).toFixed(1)}% below min ${(validation.minSuccessRate * 100).toFixed(1)}%`,
    });
    allPassed = false;
  } else if (validation.minSuccessRate) {
    checks.push({
      name: 'Success Rate',
      passed: true,
      message: `Success rate ${(successRate * 100).toFixed(1)}% meets minimum`,
    });
  }

  return {
    passed: allPassed,
    checks,
    duration: replay.totalDuration,
  };
}

// ============================================
// TEST RUNNER
// ============================================

/**
 * Run a single workflow test case
 */
async function runWorkflowTest(
  manager: WorkflowManager,
  testCase: WorkflowTestCase
): Promise<WorkflowTestResult> {
  const startTime = Date.now();

  try {
    const replay = await manager.replayWorkflow(testCase.workflowId, testCase.variables);

    let validation: ValidationResult | undefined;
    if (testCase.validation) {
      validation = validateReplay(replay, testCase.validation);
    }

    const passed = replay.overallSuccess && (!validation || validation.passed);

    return {
      testName: testCase.name,
      workflowId: testCase.workflowId,
      passed,
      replay,
      validation,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      testName: testCase.name,
      workflowId: testCase.workflowId,
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Run a workflow test suite
 */
async function runWorkflowTestSuite(
  manager: WorkflowManager,
  suiteName: string,
  testCases: WorkflowTestCase[]
): Promise<{
  suiteName: string;
  total: number;
  passed: number;
  failed: number;
  duration: number;
  results: WorkflowTestResult[];
}> {
  const startTime = Date.now();
  const results: WorkflowTestResult[] = [];

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Workflow Test Suite: ${suiteName}`);
  console.log('='.repeat(60));

  for (const testCase of testCases) {
    console.log(`\nRunning: ${testCase.name}`);
    console.log(`  Workflow: ${testCase.workflowId}`);
    if (Object.keys(testCase.variables).length > 0) {
      console.log(`  Variables: ${JSON.stringify(testCase.variables)}`);
    }

    const result = await runWorkflowTest(manager, testCase);
    results.push(result);

    const icon = result.passed ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${result.duration}ms`);

    if (!result.passed) {
      if (result.error) {
        console.log(`    Error: ${result.error}`);
      }
      if (result.validation) {
        for (const check of result.validation.checks.filter(c => !c.passed)) {
          console.log(`    - ${check.name}: ${check.message}`);
        }
      }
      if (result.replay) {
        for (const step of result.replay.results.filter(r => !r.success)) {
          console.log(`    - Step ${step.stepNumber}: ${step.error}`);
        }
      }
    }
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const duration = Date.now() - startTime;

  console.log('\n' + '='.repeat(60));
  console.log('Suite Summary:');
  console.log('='.repeat(60));
  console.log(`Total:    ${results.length}`);
  console.log(`Passed:   ${passed}`);
  console.log(`Failed:   ${failed}`);
  console.log(`Duration: ${duration}ms`);

  return {
    suiteName,
    total: results.length,
    passed,
    failed,
    duration,
    results,
  };
}

// ============================================
// REPORT GENERATION
// ============================================

/**
 * Generate JUnit XML report for workflow tests
 */
function generateWorkflowJUnitReport(suiteResult: {
  suiteName: string;
  total: number;
  passed: number;
  failed: number;
  duration: number;
  results: WorkflowTestResult[];
}): string {
  const testCases: TestCase[] = suiteResult.results.map(r => {
    const testCase: TestCase = {
      name: r.testName,
      className: 'WorkflowTests',
      time: r.duration / 1000,
    };

    if (!r.passed) {
      testCase.failure = {
        message: r.error || 'Workflow validation failed',
        type: r.error ? 'Error' : 'AssertionError',
      };
    }

    return testCase;
  });

  const suite: TestSuite = {
    name: suiteResult.suiteName,
    tests: suiteResult.total,
    failures: suiteResult.failed,
    errors: 0,
    skipped: 0,
    time: suiteResult.duration / 1000,
    timestamp: new Date().toISOString(),
    testCases,
  };

  return generateTestReport(suite, 'junit');
}

// ============================================
// MAIN EXAMPLE
// ============================================

async function main() {
  console.log('Workflow Recording and Replay Example (QA-004)');
  console.log('Demonstrates recording browsing sessions and replaying them\n');

  const browser = await createLLMBrowser();
  const manager = new WorkflowManager(browser);

  try {
    // Example 1: Record a simple workflow
    console.log('\n[Example 1] Recording a Workflow\n');

    // Start recording
    const recordingId = await manager.startRecording({
      name: 'API Data Fetch',
      description: 'Fetch user and post data from JSONPlaceholder API',
      domain: 'jsonplaceholder.typicode.com',
      tags: ['api', 'testing', 'example'],
    });
    console.log(`Started recording: ${recordingId}`);

    // Record some browse operations
    console.log('\nRecording steps...');

    await manager.recordBrowse(recordingId, 'https://jsonplaceholder.typicode.com/users/1');
    console.log('  Recorded: Fetch user 1');
    await manager.annotateStep(recordingId, 1, 'Fetch user profile data', 'critical');

    await manager.recordBrowse(recordingId, 'https://jsonplaceholder.typicode.com/posts/1');
    console.log('  Recorded: Fetch post 1');
    await manager.annotateStep(recordingId, 2, 'Fetch first post', 'important');

    // Stop recording and save
    const workflow = await manager.stopRecording(recordingId);
    console.log(`\nWorkflow saved: ${workflow?.id}`);
    console.log(`  Name: ${workflow?.name}`);
    console.log(`  Steps: ${workflow?.steps.length}`);

    // Example 2: Replay the workflow
    console.log('\n\n[Example 2] Replaying the Workflow\n');

    if (workflow) {
      console.log(`Replaying workflow: ${workflow.name}`);
      const replay = await manager.replayWorkflow(workflow.id);

      console.log(`\nReplay Results:`);
      console.log(`  Success: ${replay.overallSuccess ? 'Yes' : 'No'}`);
      console.log(`  Duration: ${replay.totalDuration}ms`);
      console.log(`  Steps:`);
      for (const step of replay.results) {
        const icon = step.success ? 'OK' : 'FAIL';
        console.log(`    ${step.stepNumber}. [${icon}] ${step.duration}ms - ${step.tier || 'N/A'}`);
      }
    }

    // Example 3: Workflow with variable substitution
    console.log('\n\n[Example 3] Variable Substitution\n');

    // Create a workflow with variables
    const varRecordingId = await manager.startRecording({
      name: 'Parameterized User Fetch',
      description: 'Fetch user data with variable user ID',
      domain: 'jsonplaceholder.typicode.com',
      tags: ['api', 'parameterized'],
    });

    // Record with a template URL
    await manager.recordBrowse(varRecordingId, 'https://jsonplaceholder.typicode.com/users/{{userId}}');
    await manager.annotateStep(varRecordingId, 1, 'Fetch user by ID', 'critical');

    const varWorkflow = await manager.stopRecording(varRecordingId);

    if (varWorkflow) {
      console.log('Running parameterized workflow with different user IDs:');

      for (const userId of [1, 2, 3]) {
        const replay = await manager.replayWorkflow(varWorkflow.id, { userId });
        const icon = replay.overallSuccess ? 'OK' : 'FAIL';
        console.log(`  User ${userId}: [${icon}] ${replay.totalDuration}ms`);
      }
    }

    // Example 4: Workflow test suite
    console.log('\n\n[Example 4] Workflow Test Suite\n');

    if (workflow && varWorkflow) {
      const testCases: WorkflowTestCase[] = [
        {
          name: 'API Data Fetch - Standard Run',
          workflowId: workflow.id,
          variables: {},
          validation: {
            checks: [],
            minSuccessRate: 1.0,
            maxDuration: 30000,
          },
        },
        {
          name: 'User Fetch - User 1',
          workflowId: varWorkflow.id,
          variables: { userId: 1 },
          validation: {
            checks: [],
            minSuccessRate: 1.0,
          },
        },
        {
          name: 'User Fetch - User 5',
          workflowId: varWorkflow.id,
          variables: { userId: 5 },
          validation: {
            checks: [],
            minSuccessRate: 1.0,
          },
        },
      ];

      const suiteResult = await runWorkflowTestSuite(
        manager,
        'API Workflow Tests',
        testCases
      );

      // Generate JUnit report
      console.log('\n\n[Example 5] JUnit Report Generation\n');
      const junitXml = generateWorkflowJUnitReport(suiteResult);
      console.log('JUnit XML report generated:');
      console.log('-'.repeat(60));
      console.log(junitXml.substring(0, 500) + '...\n');
    }

    // Example 6: List workflows
    console.log('\n[Example 6] Workflow Management\n');
    const workflows = manager.listWorkflows();
    console.log(`Saved workflows: ${workflows.length}`);
    for (const w of workflows) {
      console.log(`  ${w.id}: ${w.name}`);
      console.log(`    Steps: ${w.steps.length}, Usage: ${w.usageCount}, Success: ${(w.successRate * 100).toFixed(1)}%`);
    }

    // Summary
    console.log('\n\n' + '='.repeat(60));
    console.log('Key Takeaways:');
    console.log('='.repeat(60));
    console.log('1. Recording: Capture browse operations as replayable workflows');
    console.log('2. Annotations: Add descriptions and importance to steps');
    console.log('3. Variables: Use {{variable}} syntax for parameterized workflows');
    console.log('4. Replay: Execute workflows with different parameters');
    console.log('5. Validation: Verify replay results meet quality requirements');
    console.log('6. Reporting: Generate JUnit reports for CI/CD integration');

    console.log('\nUsage Tips:');
    console.log('-'.repeat(60));
    console.log('1. Record representative workflows for common test scenarios');
    console.log('2. Use variables for data-driven testing');
    console.log('3. Set appropriate validation thresholds');
    console.log('4. Track success rates to identify flaky workflows');
    console.log('5. Share workflows across team for consistent testing');

    console.log('\nCloud API Usage:');
    console.log('-'.repeat(60));
    console.log('// Start recording');
    console.log("const session = await client.startRecording({ name: 'My Workflow', ... });");
    console.log('');
    console.log('// Browse with recording');
    console.log("await client.browse('https://example.com', {");
    console.log("  headers: { 'X-Recording-Session': session.recordingId }");
    console.log('});');
    console.log('');
    console.log('// Stop and save');
    console.log('const workflow = await client.stopRecording(session.recordingId);');
    console.log('');
    console.log('// Replay later');
    console.log('const results = await client.replayWorkflow(workflow.workflowId, { userId: 42 });');
  } finally {
    await browser.cleanup();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  // Workflow management
  WorkflowManager,
  // Validation
  validateReplay,
  // Test runner
  runWorkflowTest,
  runWorkflowTestSuite,
  // Reporting
  generateWorkflowJUnitReport,
  // Types
  type ReplayValidation,
  type ValidationResult,
  type WorkflowTestCase,
  type WorkflowTestResult,
};
