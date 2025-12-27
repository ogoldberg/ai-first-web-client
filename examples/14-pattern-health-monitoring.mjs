/**
 * Example 14: Pattern Health Monitoring (FEAT-002)
 *
 * Demonstrates change monitoring for learned patterns. This feature tracks
 * pattern health over time and detects degradation, providing notifications
 * when patterns start failing so users can re-learn or investigate issues.
 *
 * Use cases:
 * - Monitor API pattern reliability
 * - Detect site changes breaking learned patterns
 * - Proactive pattern maintenance
 * - Automated fallback tier selection
 *
 * Run: node examples/14-pattern-health-monitoring.mjs
 */

import { createLLMBrowser } from 'llm-browser/sdk';

async function main() {
  const browser = await createLLMBrowser();

  console.log('=== Pattern Health Monitoring Examples ===\n');

  // Example 1: Basic Health Tracking
  console.log('1. Basic Pattern Health Tracking\n');

  try {
    // First successful use
    await browser.browse('https://api.example.com/users', {
      verify: { enabled: true, mode: 'standard' },
    });

    // Check pattern health through learning engine
    const learningEngine = browser.getLearningEngine();
    const health = learningEngine?.getPatternHealth('api.example.com', '/users');

    if (health) {
      console.log('Pattern Health:');
      console.log(`  Status: ${health.status}`);
      console.log(`  Success Rate: ${(health.currentSuccessRate * 100).toFixed(1)}%`);
      console.log(`  Consecutive Failures: ${health.consecutiveFailures}`);
      console.log('  ✓ Pattern is healthy');
    }
  } catch (error) {
    console.log('Example API not available:', error.message);
  }

  console.log('\n---\n');

  // Example 2: Detecting Pattern Degradation
  console.log('2. Detecting Pattern Degradation\n');

  try {
    // Simulate pattern degradation over time
    console.log('Simulating pattern usage over time...\n');

    const domain = 'shop.example.com';
    const endpoint = '/api/products';
    const learningEngine = browser.getLearningEngine();

    // Initial healthy usage
    console.log('Week 1: Pattern working well');
    for (let i = 0; i < 5; i++) {
      await browser.browse(`https://${domain}${endpoint}`, {
        verify: { enabled: true },
      });
    }

    let health = learningEngine?.getPatternHealth(domain, endpoint);
    console.log(`  Status: ${health?.status}, Success Rate: ${(health?.currentSuccessRate || 0 * 100).toFixed(1)}%\n`);

    // Pattern starts degrading
    console.log('Week 2: Site updated, pattern starts failing');
    // Simulate some failures (in reality, these would be actual browse failures)
    console.log('  (Pattern reliability declining...)\n');

    // Check for degraded patterns
    const unhealthyPatterns = learningEngine?.getUnhealthyPatterns() || [];

    if (unhealthyPatterns.length > 0) {
      console.log('⚠ Unhealthy Patterns Detected:');
      for (const { domain, endpoint, health } of unhealthyPatterns) {
        console.log(`\n  ${domain}${endpoint}`);
        console.log(`    Status: ${health.status}`);
        console.log(`    Success Rate: ${(health.currentSuccessRate * 100).toFixed(1)}%`);
        console.log(`    Consecutive Failures: ${health.consecutiveFailures}`);

        if (health.recommendedActions && health.recommendedActions.length > 0) {
          console.log('    Recommended Actions:');
          health.recommendedActions.forEach(action => {
            console.log(`      - ${action}`);
          });
        }
      }
    } else {
      console.log('✓ All patterns healthy');
    }
  } catch (error) {
    console.log('Simulation error:', error.message);
  }

  console.log('\n---\n');

  // Example 3: Health Notifications
  console.log('3. Pattern Health Notifications\n');

  try {
    const learningEngine = browser.getLearningEngine();

    // Get all health notifications
    const notifications = learningEngine?.getHealthNotifications() || [];

    if (notifications.length > 0) {
      console.log(`Received ${notifications.length} health notifications:\n`);

      for (const notification of notifications) {
        const timestamp = new Date(notification.timestamp).toLocaleString();
        console.log(`[${timestamp}] Pattern Status Changed`);
        console.log(`  Domain: ${notification.domain}`);
        console.log(`  Endpoint: ${notification.endpoint}`);
        console.log(`  Status: ${notification.previousStatus} → ${notification.newStatus}`);
        console.log(`  Success Rate: ${(notification.successRate * 100).toFixed(1)}%`);

        if (notification.suggestedActions.length > 0) {
          console.log('  Actions:');
          notification.suggestedActions.forEach(action => {
            console.log(`    - ${action}`);
          });
        }

        if (notification.context) {
          console.log('  Context:');
          if (notification.context.consecutiveFailures) {
            console.log(`    Consecutive Failures: ${notification.context.consecutiveFailures}`);
          }
          if (notification.context.lastFailureType) {
            console.log(`    Last Failure: ${notification.context.lastFailureType}`);
          }
        }

        console.log();
      }

      // Clear notifications after reviewing
      learningEngine?.clearHealthNotifications();
      console.log('✓ Notifications cleared');
    } else {
      console.log('No health notifications (all patterns stable)');
    }
  } catch (error) {
    console.log('Notification error:', error.message);
  }

  console.log('\n---\n');

  // Example 4: Manual Health Check
  console.log('4. Manual Health Check\n');

  try {
    const learningEngine = browser.getLearningEngine();

    // Perform manual health check for a specific pattern
    const domain = 'api.example.com';
    const endpoint = '/v1/data';

    console.log(`Checking health for ${domain}${endpoint}...\n`);

    const healthCheck = learningEngine?.checkPatternHealth(domain, endpoint, {
      force: true, // Force check even if recently checked
      recordSnapshot: true, // Record historical snapshot
    });

    if (healthCheck) {
      console.log('Health Check Result:');
      console.log(`  Status: ${healthCheck.currentHealth.status}`);
      console.log(`  Success Rate: ${(healthCheck.currentHealth.currentSuccessRate * 100).toFixed(1)}%`);
      console.log(`  Status Changed: ${healthCheck.statusChanged ? 'Yes' : 'No'}`);

      if (healthCheck.statusChanged && healthCheck.notification) {
        console.log(`  Previous Status: ${healthCheck.notification.previousStatus}`);
        console.log(`  New Status: ${healthCheck.notification.newStatus}`);
      }

      console.log(`  Historical Snapshots: ${healthCheck.currentHealth.history.length}`);
    } else {
      console.log('Pattern not found or no data available');
    }
  } catch (error) {
    console.log('Health check error:', error.message);
  }

  console.log('\n---\n');

  // Example 5: Health Statistics Dashboard
  console.log('5. Health Statistics Dashboard\n');

  try {
    const learningEngine = browser.getLearningEngine();
    const stats = learningEngine?.getHealthStats();

    if (stats) {
      console.log('Overall Pattern Health:');
      console.log(`  Total Patterns: ${stats.total}`);
      console.log(`  ✓ Healthy: ${stats.healthy} (${((stats.healthy / stats.total) * 100).toFixed(1)}%)`);

      if (stats.degraded > 0) {
        console.log(`  ⚠ Degraded: ${stats.degraded} (${((stats.degraded / stats.total) * 100).toFixed(1)}%)`);
      }

      if (stats.failing > 0) {
        console.log(`  ⚠ Failing: ${stats.failing} (${((stats.failing / stats.total) * 100).toFixed(1)}%)`);
      }

      if (stats.broken > 0) {
        console.log(`  ✗ Broken: ${stats.broken} (${((stats.broken / stats.total) * 100).toFixed(1)}%)`);
      }

      // Health score
      const healthScore = (stats.healthy / stats.total) * 100;
      console.log(`\nOverall Health Score: ${healthScore.toFixed(1)}%`);

      if (healthScore >= 90) {
        console.log('Status: Excellent ✓');
      } else if (healthScore >= 75) {
        console.log('Status: Good (monitor degraded patterns)');
      } else if (healthScore >= 50) {
        console.log('Status: Fair (review and re-learn failing patterns)');
      } else {
        console.log('Status: Poor (urgent attention needed)');
      }
    }
  } catch (error) {
    console.log('Stats error:', error.message);
  }

  console.log('\n---\n');

  // Example 6: Automated Tier Fallback Based on Health
  console.log('6. Automated Tier Fallback Based on Health\n');

  try {
    const domain = 'example.com';
    const endpoint = '/api/data';
    const learningEngine = browser.getLearningEngine();

    console.log('Intelligent tier selection based on pattern health:\n');

    const health = learningEngine?.getPatternHealth(domain, endpoint);

    if (health) {
      let selectedTier: string;
      let reason: string;

      switch (health.status) {
        case 'healthy':
          selectedTier = 'intelligence';
          reason = 'Pattern is reliable, use fastest tier';
          break;

        case 'degraded':
          selectedTier = 'lightweight';
          reason = 'Pattern showing issues, use safer tier';
          break;

        case 'failing':
          selectedTier = 'playwright';
          reason = 'Pattern unreliable, use full browser';
          break;

        case 'broken':
          selectedTier = 'playwright';
          reason = 'Pattern broken, must use full browser';
          break;
      }

      console.log(`Pattern Health: ${health.status}`);
      console.log(`Selected Tier: ${selectedTier}`);
      console.log(`Reason: ${reason}`);
      console.log(`Success Rate: ${(health.currentSuccessRate * 100).toFixed(1)}%`);

      // Use the selected tier
      const result = await browser.browse(`https://${domain}${endpoint}`, {
        preferredTier: selectedTier as any,
      });

      console.log(`\nBrowse completed using ${result.tier} tier`);
    } else {
      console.log('No health data available, using default tier selection');
    }
  } catch (error) {
    console.log('Tier selection error:', error.message);
  }

  console.log('\n---\n');

  // Example 7: Pattern Recovery Monitoring
  console.log('7. Pattern Recovery Monitoring\n');

  try {
    const domain = 'api.example.com';
    const endpoint = '/users';
    const learningEngine = browser.getLearningEngine();

    console.log('Monitoring pattern recovery after re-learning:\n');

    const health = learningEngine?.getPatternHealth(domain, endpoint);

    if (health) {
      if (health.degradationDetectedAt) {
        const degradedFor = Date.now() - health.degradationDetectedAt;
        const days = Math.floor(degradedFor / (1000 * 60 * 60 * 24));
        const hours = Math.floor((degradedFor % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        console.log(`Pattern has been degraded for: ${days}d ${hours}h`);
        console.log('Recommendation: Consider re-learning pattern or investigating site changes');
      } else {
        console.log('✓ Pattern is healthy (no degradation detected)');
      }

      // Check historical trend
      if (health.history.length > 0) {
        console.log(`\nHistorical Data (${health.history.length} snapshots):`);

        const recent = health.history.slice(-5);
        recent.forEach((snapshot, i) => {
          const date = new Date(snapshot.timestamp).toLocaleDateString();
          const rate = (snapshot.successRate * 100).toFixed(1);
          console.log(`  ${date}: ${rate}% success rate (${snapshot.sampleSize} samples)`);
        });

        // Trend analysis
        if (recent.length >= 2) {
          const oldRate = recent[0].successRate;
          const newRate = recent[recent.length - 1].successRate;
          const trend = newRate > oldRate ? '↗ improving' : newRate < oldRate ? '↘ declining' : '→ stable';

          console.log(`\nTrend: ${trend}`);
        }
      }
    } else {
      console.log('No health data available for this pattern');
    }
  } catch (error) {
    console.log('Recovery monitoring error:', error.message);
  }

  console.log('\n=== Pattern Health Monitoring Complete ===\n');

  console.log('Key Takeaways:');
  console.log('  ✓ Automatic health tracking for all learned patterns');
  console.log('  ✓ Notifications when patterns degrade or fail');
  console.log('  ✓ Recommended actions for pattern maintenance');
  console.log('  ✓ Historical trend analysis');
  console.log('  ✓ Automated tier selection based on health');
  console.log('  ✓ Proactive pattern re-learning');
}

main().catch(console.error);
