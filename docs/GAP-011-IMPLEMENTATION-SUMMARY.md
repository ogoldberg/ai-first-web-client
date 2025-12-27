# GAP-011: Content Change Prediction

## Overview

Content Change Prediction learns when web content updates and predicts future changes to optimize polling intervals. This reduces unnecessary fetches while ensuring content is checked at the right times.

## Features

### Pattern Detection

The system detects several types of content update patterns:

| Pattern Type | Description | Example |
|--------------|-------------|---------|
| `static` | Never or rarely changes | Company "About" pages |
| `hourly` | Changes every N hours consistently | Stock prices, weather |
| `daily` | Changes at specific times each day | News headlines at 9 AM |
| `workday` | Changes on weekdays only | Business reports |
| `weekly` | Changes on specific days of week | Weekly newsletters |
| `monthly` | Changes on specific days of month | Monthly reports |
| `irregular` | Changes unpredictably | User-generated content |

### Prediction Generation

For patterns with sufficient confidence, the system predicts:
- When the next change will occur
- Uncertainty window around the prediction
- Confidence level of the prediction

### Polling Optimization

The system recommends optimal polling intervals:
- Frequent checks for volatile content
- Infrequent checks for static content
- Time-aware polling for periodic content (e.g., "check at 9 AM")

## Architecture

```
+-------------------+       +----------------------+
|   SmartBrowser    | ----> |   LearningEngine     |
+-------------------+       +----------------------+
        |                           |
        |                           v
        |                  +----------------------+
        |                  | ContentChangePredictor|
        |                  +----------------------+
        |                           |
        v                           v
+-------------------+       +----------------------+
| recordContentCheck| ----> | recordObservation    |
+-------------------+       +----------------------+
                                    |
                                    v
                           +----------------------+
                           | Pattern Analysis     |
                           | - Frequency stats    |
                           | - Temporal patterns  |
                           | - Predictions        |
                           +----------------------+
```

## Usage

### Recording Content Checks

Content checks are recorded automatically through `LearningEngine.recordContentCheck()`:

```typescript
import { learningEngine } from './core/learning-engine.js';

// Record a content check
learningEngine.recordContentCheck(
  'news.example.com',     // domain
  '/api/headlines',       // URL pattern
  contentBody,            // current content
  true                    // whether content changed
);
```

### Getting Poll Recommendations

```typescript
// Should we check this content now?
const recommendation = learningEngine.shouldCheckContentNow(
  'news.example.com',
  '/api/headlines'
);

if (recommendation.shouldPoll) {
  // Fetch the content
  const content = await fetch('https://news.example.com/api/headlines');
} else {
  console.log(`Next check at: ${new Date(recommendation.nextCheckAt)}`);
  console.log(`Reason: ${recommendation.reason}`);
}
```

### Analyzing Patterns

```typescript
// Get detailed analysis of content change patterns
const analysis = learningEngine.analyzeContentChangePattern(
  'news.example.com',
  '/api/headlines'
);

console.log(`Pattern: ${analysis.pattern.detectedPattern}`);
console.log(`Confidence: ${analysis.pattern.patternConfidence}`);
console.log(`Summary: ${analysis.summary}`);
console.log(`Recommendations:`);
analysis.recommendations.forEach(r => console.log(`  - ${r}`));
```

### Getting Predictions

```typescript
// When will content next change?
const nextChange = learningEngine.getNextPredictedChange(
  'news.example.com',
  '/api/headlines'
);

if (nextChange) {
  console.log(`Next predicted change: ${new Date(nextChange)}`);
}
```

## API Reference

### ContentChangePredictor

The core predictor class.

#### Methods

| Method | Description |
|--------|-------------|
| `recordObservation(domain, urlPattern, contentHash, changed)` | Record a content check observation |
| `getPattern(domain, urlPattern)` | Get the learned pattern for a URL |
| `analyzePattern(domain, urlPattern)` | Get detailed analysis with recommendations |
| `shouldCheckNow(domain, urlPattern)` | Get polling recommendation |
| `getAllPatterns()` | Get all learned patterns |
| `exportPatterns()` | Export patterns for persistence |
| `importPatterns(data)` | Import persisted patterns |

### LearningEngine Extensions

New methods added to LearningEngine:

| Method | Description |
|--------|-------------|
| `getContentChangePattern(domain, urlPattern)` | Get pattern for a URL |
| `analyzeContentChangePattern(domain, urlPattern)` | Get detailed analysis |
| `shouldCheckContentNow(domain, urlPattern)` | Get poll recommendation |
| `getNextPredictedChange(domain, urlPattern)` | Get next predicted change time |
| `getAllContentChangePatterns()` | Get all patterns |
| `exportContentChangePatterns()` | Export for persistence |
| `importContentChangePatterns(data)` | Import from persistence |

## Types

### ContentChangePattern

```typescript
interface ContentChangePattern {
  id: string;
  urlPattern: string;
  domain: string;

  // Pattern detection
  detectedPattern: ChangePatternType;
  patternConfidence: number; // 0-1
  temporalPattern?: TemporalPattern;

  // Frequency statistics
  frequencyStats: ChangeFrequencyStats;

  // Predictions
  nextPrediction?: ChangePrediction;
  recommendedPollIntervalMs: number;

  // Historical data
  recentObservations: ChangeObservation[];
  changeTimestamps: number[];

  // Metadata
  createdAt: number;
  lastAnalyzedAt: number;
}
```

### PollRecommendation

```typescript
interface PollRecommendation {
  shouldPoll: boolean;
  reason: string;
  nextCheckAt: number;
  confidence: number;
}
```

### ContentChangeAnalysis

```typescript
interface ContentChangeAnalysis {
  pattern: ContentChangePattern;
  hasEnoughData: boolean;
  summary: string;
  recommendations: string[];
}
```

## Configuration

The predictor can be configured with:

```typescript
interface ContentChangePredictionConfig {
  minObservationsForPattern: number;     // Default: 5
  minChangesForPattern: number;          // Default: 3
  maxObservationsToKeep: number;         // Default: 100
  maxChangeTimestamps: number;           // Default: 50
  confidenceThresholdForPrediction: number; // Default: 0.5
  earlyCheckWindowHours: number;         // Default: 1
  maxPollIntervalMs: number;             // Default: 24 hours
  minPollIntervalMs: number;             // Default: 5 minutes
  staticContentDaysThreshold: number;    // Default: 30
  timeOfDayToleranceHours: number;       // Default: 2
}
```

## Pattern Detection Algorithm

1. **Collect observations** - Record when content is checked and whether it changed
2. **Calculate intervals** - Measure time between changes
3. **Analyze temporality** - Look for patterns in time-of-day and day-of-week
4. **Classify pattern** - Match to hourly, daily, weekly, etc.
5. **Score confidence** - Based on regularity and sample size
6. **Generate prediction** - Predict next change based on pattern

## Confidence Scoring

Confidence is based on:
- **Sample size** - More observations = higher confidence
- **Regularity** - Consistent intervals = higher confidence
- **Recency** - Recent observations = higher confidence

| Confidence | Interpretation |
|------------|----------------|
| 0.8 - 1.0 | High - predictions reliable |
| 0.5 - 0.8 | Medium - monitor for changes |
| 0.0 - 0.5 | Low - continue gathering data |

## Testing

38 tests covering:
- Observation recording
- Frequency statistics
- Pattern detection (all types)
- Poll recommendations
- Prediction generation
- Persistence (export/import)
- Edge cases
- LearningEngine integration

Run tests:
```bash
npm test -- --run tests/core/content-change-predictor.test.ts
```

## Files

| File | Description |
|------|-------------|
| `src/types/content-change.ts` | Type definitions |
| `src/core/content-change-predictor.ts` | Core predictor class |
| `src/core/learning-engine.ts` | Integration with learning system |
| `tests/core/content-change-predictor.test.ts` | Test suite |
| `docs/GAP-011-IMPLEMENTATION-SUMMARY.md` | This document |

## Benefits

1. **Reduced unnecessary fetches** - Don't check content that hasn't changed
2. **Optimized polling intervals** - Check frequently for volatile content, infrequently for static
3. **Predictive checking** - Check right before predicted changes
4. **Intelligent recommendations** - Clear guidance on when to poll
5. **Confidence-aware** - Know how reliable predictions are

## Future Enhancements

Potential future improvements:
- Webhook integration for push notifications instead of polling
- Machine learning for complex patterns
- Cross-domain pattern transfer
- Time zone awareness
- Anomaly detection for unexpected changes
