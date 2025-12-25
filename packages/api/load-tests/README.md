# Unbrowser API Load Tests

This directory contains load testing infrastructure for the Unbrowser API using [autocannon](https://github.com/mcollina/autocannon).

## Quick Start

```bash
# Start the API server
npm run dev

# In another terminal, run baseline tests
npm run loadtest:baseline

# Run stress tests
npm run loadtest:stress

# Run full test suite
npm run loadtest:full
```

## Test Suites

| Suite | Description | Duration |
|-------|-------------|----------|
| `baseline` | Quick sanity check tests | ~2 min |
| `stress` | Comprehensive stress tests | ~5 min |
| `full` | All scenarios including edge cases | ~10 min |
| `health` | Health endpoint only | ~2 min |
| `browse` | Browse endpoint only | ~3 min |
| `batch` | Batch endpoint only | ~2 min |
| `fetch` | Fetch endpoint only | ~2 min |
| `auth` | Authentication tests | ~1 min |
| `ratelimit` | Rate limiting tests | ~30 sec |
| `usage` | Usage endpoint only | ~2 min |
| `mixed` | Mixed workload simulation | ~4 min |

## Command Options

```bash
npm run loadtest -- [suite] [options]

Options:
  --url URL         Target server URL (default: http://localhost:3001)
  --duration N      Override test duration in seconds
  --connections N   Override connection count
  --json            Output results as JSON
```

## Example Usage

```bash
# Test against staging
npm run loadtest -- baseline --url https://api-staging.unbrowser.ai

# Quick 5-second tests
npm run loadtest -- stress --duration 5

# Get JSON output for CI/CD
npm run loadtest -- baseline --json
```

## Performance Thresholds

Tests will fail if these thresholds are exceeded:

| Metric | Threshold |
|--------|-----------|
| p95 Latency | 200ms |
| p99 Latency | 500ms |
| Error Rate | 1% |
| Min Requests/sec | 100 |

## Benchmark Results (Local Development)

These results were collected on a development machine running the API locally.

### Health Endpoint

| Load Level | Connections | Req/sec | p95 Latency | p99 Latency |
|------------|-------------|---------|-------------|-------------|
| Low | 10 | 17,000+ | 1ms | 1ms |
| High | 100 | 14,000+ | 15ms | 23ms |
| Extreme | 500 | 20,000+ | 163ms | 185ms |

### Browse Endpoint

| Load Level | Connections | Req/sec | p95 Latency | p99 Latency |
|------------|-------------|---------|-------------|-------------|
| Low | 10 | 8,800+ | 1ms | 2ms |
| Medium | 50 | 5,000+ | 30ms | 53ms |
| High | 100 | 3,800+ | 66ms | 114ms |

### Fetch Endpoint

| Load Level | Connections | Req/sec | p95 Latency | p99 Latency |
|------------|-------------|---------|-------------|-------------|
| Low | 10 | 8,700+ | 1ms | 2ms |
| High | 100 | 8,200+ | 113ms | 171ms |

### Usage Endpoint

| Load Level | Connections | Req/sec | p95 Latency | p99 Latency |
|------------|-------------|---------|-------------|-------------|
| Low | 10 | 8,100+ | 2ms | 3ms |
| High | 50 | 8,900+ | 9ms | 12ms |

## Adding New Scenarios

Edit `scenarios.ts` to add new test scenarios:

```typescript
export const myScenarios: LoadTestScenario[] = [
  {
    name: 'My New Scenario',
    description: 'Description of what this tests',
    path: '/v1/endpoint',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': defaultConfig.apiKeys.team,
    },
    body: { key: 'value' },
    duration: 30,
    connections: 50,
  },
];
```

## CI/CD Integration

For continuous integration, use the JSON output and parse results:

```bash
npm run loadtest -- baseline --json > results.json

# Check if all tests passed
if jq -e 'all(.passed)' results.json > /dev/null; then
  echo "All load tests passed"
else
  echo "Load tests failed"
  exit 1
fi
```
