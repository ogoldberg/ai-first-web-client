/**
 * Trace Visualizer (F-009)
 *
 * Provides visual representations of debug traces for easier debugging:
 * - ASCII timeline showing tier cascade and durations
 * - Flowchart-style visualization of decision paths
 * - Summary cards for quick issue identification
 * - HTML output for rich visualization
 *
 * Integrates with DebugTrace from debug-trace-recorder.ts
 */

import type { DebugTrace, TraceError } from './debug-trace-recorder.js';
import type { TierAttempt, SelectorAttempt, TitleAttempt } from '../types/decision-trace.js';
import type { RenderTier } from '../types/index.js';

/**
 * Visualization format options
 */
export type VisualizationFormat = 'ascii' | 'compact' | 'detailed' | 'html' | 'json';

/**
 * Visualization options
 */
export interface VisualizationOptions {
  /** Output format */
  format?: VisualizationFormat;

  /** Include network activity */
  includeNetwork?: boolean;

  /** Include selector attempts */
  includeSelectors?: boolean;

  /** Include title extraction attempts */
  includeTitle?: boolean;

  /** Include errors */
  includeErrors?: boolean;

  /** Include skills info */
  includeSkills?: boolean;

  /** Maximum width for ASCII output */
  maxWidth?: number;

  /** Use color codes (ANSI) */
  useColor?: boolean;
}

const DEFAULT_OPTIONS: Required<VisualizationOptions> = {
  format: 'ascii',
  includeNetwork: true,
  includeSelectors: true,
  includeTitle: false,
  includeErrors: true,
  includeSkills: true,
  maxWidth: 80,
  useColor: true,
};

/**
 * ANSI color codes
 */
const Colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

/**
 * Tier display configuration
 */
const TierConfig: Record<RenderTier, { icon: string; color: string; name: string }> = {
  intelligence: { icon: '[I]', color: Colors.cyan, name: 'Intelligence' },
  lightweight: { icon: '[L]', color: Colors.blue, name: 'Lightweight' },
  playwright: { icon: '[P]', color: Colors.magenta, name: 'Playwright' },
};

/**
 * Visualize a debug trace
 */
export function visualizeTrace(
  trace: DebugTrace,
  options: VisualizationOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  switch (opts.format) {
    case 'compact':
      return renderCompact(trace, opts);
    case 'detailed':
      return renderDetailed(trace, opts);
    case 'html':
      return renderHtml(trace, opts);
    case 'json':
      return JSON.stringify(trace, null, 2);
    case 'ascii':
    default:
      return renderAscii(trace, opts);
  }
}

/**
 * Render compact one-line summary
 */
function renderCompact(trace: DebugTrace, opts: Required<VisualizationOptions>): string {
  const status = trace.success
    ? (opts.useColor ? `${Colors.green}OK${Colors.reset}` : 'OK')
    : (opts.useColor ? `${Colors.red}FAIL${Colors.reset}` : 'FAIL');

  const tier = trace.tiers.finalTier;
  const tierIcon = opts.useColor
    ? `${TierConfig[tier].color}${TierConfig[tier].icon}${Colors.reset}`
    : TierConfig[tier].icon;

  const duration = formatDuration(trace.durationMs);
  const domain = trace.domain;
  const errors = trace.errors.length > 0 ? ` (${trace.errors.length} errors)` : '';

  return `${status} ${tierIcon} ${domain} ${duration}${errors}`;
}

/**
 * Render ASCII timeline visualization
 */
function renderAscii(trace: DebugTrace, opts: Required<VisualizationOptions>): string {
  const lines: string[] = [];
  const c = opts.useColor ? Colors : createNoOpColors();

  // Header
  lines.push(renderHeader(trace, c, opts.useColor));
  lines.push('');

  // Timeline
  lines.push(renderTimeline(trace, c, opts));
  lines.push('');

  // Tier cascade
  lines.push(renderTierCascade(trace, c, opts.useColor));
  lines.push('');

  // Selectors (if enabled)
  if (opts.includeSelectors && trace.selectors.attempts.length > 0) {
    lines.push(renderSelectors(trace, c));
    lines.push('');
  }

  // Network (if enabled)
  if (opts.includeNetwork && trace.network) {
    lines.push(renderNetwork(trace, c));
    lines.push('');
  }

  // Errors (if enabled)
  if (opts.includeErrors && trace.errors.length > 0) {
    lines.push(renderErrors(trace, c));
    lines.push('');
  }

  // Skills (if enabled)
  if (opts.includeSkills && trace.skills) {
    lines.push(renderSkills(trace, c));
    lines.push('');
  }

  // Summary
  lines.push(renderSummary(trace, c));

  return lines.join('\n');
}

/**
 * Render detailed multi-section visualization
 */
function renderDetailed(trace: DebugTrace, opts: Required<VisualizationOptions>): string {
  const lines: string[] = [];
  const c = opts.useColor ? Colors : createNoOpColors();

  // Full header with metadata
  lines.push(renderDetailedHeader(trace, c, opts.useColor));
  lines.push('');

  // Detailed tier information
  lines.push(renderDetailedTiers(trace, c, opts.useColor));
  lines.push('');

  // Detailed selector information
  if (trace.selectors.attempts.length > 0) {
    lines.push(renderDetailedSelectors(trace, c));
    lines.push('');
  }

  // Title extraction
  if (trace.title.attempts.length > 0) {
    lines.push(renderDetailedTitle(trace, c));
    lines.push('');
  }

  // Validation
  if (trace.validation) {
    lines.push(renderValidation(trace, c));
    lines.push('');
  }

  // Content stats
  lines.push(renderContentStats(trace, c));
  lines.push('');

  // Network details
  if (trace.network) {
    lines.push(renderDetailedNetwork(trace, c));
    lines.push('');
  }

  // Errors
  if (trace.errors.length > 0) {
    lines.push(renderDetailedErrors(trace, c));
    lines.push('');
  }

  // Anomalies
  if (trace.anomaly) {
    lines.push(renderAnomaly(trace, c));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Render HTML visualization
 */
function renderHtml(trace: DebugTrace, opts: Required<VisualizationOptions>): string {
  const statusClass = trace.success ? 'success' : 'failure';
  const statusText = trace.success ? 'Success' : 'Failure';

  const tierRows = trace.tiers.attempts.map(t => {
    const statusIcon = t.success ? 'check' : 'x';
    const rowClass = t.success ? 'tier-success' : 'tier-failure';
    return `
      <tr class="${rowClass}">
        <td><span class="tier-icon tier-${t.tier}">${TierConfig[t.tier].name}</span></td>
        <td>${t.success ? 'Success' : 'Failed'}</td>
        <td>${t.durationMs}ms</td>
        <td>${t.failureReason || '-'}</td>
      </tr>
    `;
  }).join('');

  const selectorRows = trace.selectors.attempts.map(s => {
    const rowClass = s.selected ? 'selector-selected' : (s.matched ? 'selector-matched' : 'selector-unmatched');
    return `
      <tr class="${rowClass}">
        <td><code>${escapeHtml(s.selector)}</code></td>
        <td>${s.source}</td>
        <td>${s.matched ? 'Yes' : 'No'}</td>
        <td>${s.contentLength}</td>
        <td>${(s.confidenceScore * 100).toFixed(0)}%</td>
        <td>${s.selected ? 'Selected' : (s.skipReason || '-')}</td>
      </tr>
    `;
  }).join('');

  const errorRows = trace.errors.map(e => `
    <tr class="error-row">
      <td><span class="error-type">${e.type}</span></td>
      <td>${escapeHtml(e.message)}</td>
      <td>${e.recoveryAttempted ? (e.recoverySucceeded ? 'Recovered' : 'Failed') : 'No'}</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <title>Trace: ${escapeHtml(trace.domain)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; background: #f5f5f5; }
    .trace-container { max-width: 1200px; margin: 0 auto; }
    .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: bold; }
    .status.success { background: #d4edda; color: #155724; }
    .status.failure { background: #f8d7da; color: #721c24; }
    .section { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .section h2 { margin-top: 0; border-bottom: 1px solid #eee; padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f8f9fa; }
    .tier-icon { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: bold; }
    .tier-intelligence { background: #e0f7fa; color: #00838f; }
    .tier-lightweight { background: #e3f2fd; color: #1565c0; }
    .tier-playwright { background: #f3e5f5; color: #7b1fa2; }
    .tier-success { background: #f1f8e9; }
    .tier-failure { background: #ffebee; }
    .selector-selected { background: #e8f5e9; }
    .selector-matched { background: #fff3e0; }
    .error-type { background: #ffcdd2; padding: 2px 6px; border-radius: 3px; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
    .timeline { display: flex; align-items: center; gap: 4px; margin: 20px 0; }
    .timeline-segment { height: 8px; border-radius: 4px; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; }
    .stat { background: #f8f9fa; padding: 16px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 24px; font-weight: bold; color: #333; }
    .stat-label { font-size: 12px; color: #666; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="trace-container">
    <div class="header">
      <span class="status ${statusClass}">${statusText}</span>
      <h1>${escapeHtml(trace.domain)}</h1>
      <p><a href="${escapeHtml(trace.url)}">${escapeHtml(trace.url)}</a></p>
      <p>Duration: <strong>${trace.durationMs}ms</strong> | Tier: <span class="tier-icon tier-${trace.tiers.finalTier}">${TierConfig[trace.tiers.finalTier].name}</span></p>
    </div>

    <div class="section">
      <h2>Timeline</h2>
      <div class="timeline">
        ${renderHtmlTimeline(trace)}
      </div>
    </div>

    <div class="section">
      <h2>Tier Cascade</h2>
      <table>
        <thead>
          <tr><th>Tier</th><th>Status</th><th>Duration</th><th>Failure Reason</th></tr>
        </thead>
        <tbody>${tierRows}</tbody>
      </table>
    </div>

    ${trace.selectors.attempts.length > 0 ? `
    <div class="section">
      <h2>Selector Attempts</h2>
      <table>
        <thead>
          <tr><th>Selector</th><th>Source</th><th>Matched</th><th>Content Length</th><th>Confidence</th><th>Result</th></tr>
        </thead>
        <tbody>${selectorRows}</tbody>
      </table>
    </div>
    ` : ''}

    <div class="section">
      <h2>Content Statistics</h2>
      <div class="stat-grid">
        <div class="stat">
          <div class="stat-value">${trace.content.textLength.toLocaleString()}</div>
          <div class="stat-label">Text Characters</div>
        </div>
        <div class="stat">
          <div class="stat-value">${trace.content.markdownLength.toLocaleString()}</div>
          <div class="stat-label">Markdown Characters</div>
        </div>
        <div class="stat">
          <div class="stat-value">${trace.content.tableCount}</div>
          <div class="stat-label">Tables</div>
        </div>
        <div class="stat">
          <div class="stat-value">${trace.content.apiCount}</div>
          <div class="stat-label">APIs Discovered</div>
        </div>
      </div>
    </div>

    ${trace.errors.length > 0 ? `
    <div class="section">
      <h2>Errors</h2>
      <table>
        <thead>
          <tr><th>Type</th><th>Message</th><th>Recovery</th></tr>
        </thead>
        <tbody>${errorRows}</tbody>
      </table>
    </div>
    ` : ''}
  </div>
</body>
</html>
  `.trim();
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function renderHeader(trace: DebugTrace, c: typeof Colors, useColor = true): string {
  const status = trace.success
    ? `${c.bgGreen}${c.white} SUCCESS ${c.reset}`
    : `${c.bgRed}${c.white} FAILURE ${c.reset}`;

  const tier = TierConfig[trace.tiers.finalTier];
  const tierColor = useColor ? tier.color : '';
  const tierDisplay = `${tierColor}${tier.name}${c.reset}`;

  return [
    `${c.bold}Browse Trace${c.reset}`,
    `${'='.repeat(60)}`,
    `${status} ${tierDisplay} in ${c.bold}${trace.durationMs}ms${c.reset}`,
    `${c.dim}URL:${c.reset} ${trace.url}`,
    trace.finalUrl !== trace.url ? `${c.dim}Final:${c.reset} ${trace.finalUrl}` : '',
    `${c.dim}Domain:${c.reset} ${trace.domain}`,
    `${c.dim}Time:${c.reset} ${new Date(trace.timestamp).toISOString()}`,
  ].filter(Boolean).join('\n');
}

function renderDetailedHeader(trace: DebugTrace, c: typeof Colors, useColor = true): string {
  return [
    renderHeader(trace, c, useColor),
    '',
    `${c.dim}Trace ID:${c.reset} ${trace.id}`,
    `${c.dim}Session:${c.reset} ${trace.metadata.sessionLoaded ? 'Loaded' : 'Fresh'} ${trace.metadata.sessionProfile ? `(${trace.metadata.sessionProfile})` : ''}`,
  ].join('\n');
}

function renderTimeline(trace: DebugTrace, c: typeof Colors, opts: Required<VisualizationOptions>): string {
  const totalMs = trace.durationMs;
  const barWidth = Math.min(opts.maxWidth - 20, 60);

  // Build timeline segments
  const segments: Array<{ tier: RenderTier; duration: number; success: boolean }> = [];

  for (const attempt of trace.tiers.attempts) {
    segments.push({
      tier: attempt.tier,
      duration: attempt.durationMs,
      success: attempt.success,
    });
  }

  // Helper to get tier color, respecting useColor setting
  const getTierColor = (tier: RenderTier): string => {
    return opts.useColor ? TierConfig[tier].color : '';
  };

  // Create visual bar
  let bar = '';
  for (const seg of segments) {
    const width = Math.max(1, Math.round((seg.duration / totalMs) * barWidth));
    const char = seg.success ? '=' : '-';
    const color = getTierColor(seg.tier);
    bar += `${color}${char.repeat(width)}${c.reset}`;
  }

  // Pad to full width
  const currentWidth = segments.reduce((sum, s) => sum + Math.max(1, Math.round((s.duration / totalMs) * barWidth)), 0);
  if (currentWidth < barWidth) {
    bar += ' '.repeat(barWidth - currentWidth);
  }

  return [
    `${c.bold}Timeline${c.reset}`,
    `[${bar}] ${totalMs}ms`,
    `${c.dim}Legend: ${getTierColor('intelligence')}I=Intelligence${c.reset} ${getTierColor('lightweight')}L=Lightweight${c.reset} ${getTierColor('playwright')}P=Playwright${c.reset}`,
  ].join('\n');
}

function renderTierCascade(trace: DebugTrace, c: typeof Colors, useColor = true): string {
  const lines: string[] = [`${c.bold}Tier Cascade${c.reset}`];

  // Helper to get tier color
  const getTierColor = (tier: RenderTier): string => {
    return useColor ? TierConfig[tier].color : '';
  };

  for (let i = 0; i < trace.tiers.attempts.length; i++) {
    const attempt = trace.tiers.attempts[i];
    const isLast = i === trace.tiers.attempts.length - 1;
    const prefix = isLast ? '\\->' : '|->';
    const tier = TierConfig[attempt.tier];

    const status = attempt.success
      ? `${c.green}OK${c.reset}`
      : `${c.red}FAIL${c.reset}`;

    const reason = attempt.failureReason
      ? `${c.dim}(${attempt.failureReason})${c.reset}`
      : '';

    lines.push(`  ${prefix} ${getTierColor(attempt.tier)}${tier.icon}${c.reset} ${tier.name}: ${status} ${attempt.durationMs}ms ${reason}`);

    // Show validation details if available
    if (attempt.validationDetails) {
      const v = attempt.validationDetails;
      lines.push(`      ${c.dim}Content: ${v.contentLength} chars, Semantic: ${v.hasSemanticMarkers ? 'yes' : 'no'}${c.reset}`);
      if (v.incompleteMarkers && v.incompleteMarkers.length > 0) {
        lines.push(`      ${c.yellow}Incomplete markers: ${v.incompleteMarkers.join(', ')}${c.reset}`);
      }
    }
  }

  if (trace.tiers.fellBack) {
    lines.push(`  ${c.yellow}(Fallback occurred)${c.reset}`);
  }

  return lines.join('\n');
}

function renderSelectors(trace: DebugTrace, c: typeof Colors): string {
  const lines: string[] = [`${c.bold}Selector Attempts${c.reset}`];

  for (const s of trace.selectors.attempts) {
    const status = s.selected
      ? `${c.green}SELECTED${c.reset}`
      : s.matched
        ? `${c.yellow}matched${c.reset}`
        : `${c.dim}no match${c.reset}`;

    const confidence = `${(s.confidenceScore * 100).toFixed(0)}%`;

    lines.push(`  ${status} [${s.source}] ${c.cyan}${s.selector}${c.reset}`);
    lines.push(`      ${c.dim}Confidence: ${confidence}, Length: ${s.contentLength}${s.skipReason ? `, Skip: ${s.skipReason}` : ''}${c.reset}`);
  }

  lines.push(`  ${c.dim}Final: ${trace.selectors.finalSelector}${trace.selectors.fallbackUsed ? ' (fallback)' : ''}${c.reset}`);

  return lines.join('\n');
}

function renderDetailedSelectors(trace: DebugTrace, c: typeof Colors): string {
  return renderSelectors(trace, c);
}

function renderDetailedTitle(trace: DebugTrace, c: typeof Colors): string {
  const lines: string[] = [`${c.bold}Title Extraction${c.reset}`];

  for (const t of trace.title.attempts) {
    const status = t.selected
      ? `${c.green}SELECTED${c.reset}`
      : t.found
        ? `${c.yellow}found${c.reset}`
        : `${c.dim}not found${c.reset}`;

    lines.push(`  ${status} [${t.source}] ${t.selector}`);
    if (t.value) {
      lines.push(`      ${c.dim}Value: "${t.value.substring(0, 50)}${t.value.length > 50 ? '...' : ''}"${c.reset}`);
    }
  }

  if (trace.title.value) {
    lines.push(`  ${c.dim}Final: "${trace.title.value}"${c.reset}`);
  }

  return lines.join('\n');
}

function renderNetwork(trace: DebugTrace, c: typeof Colors): string {
  if (!trace.network) return '';

  const lines: string[] = [`${c.bold}Network Activity${c.reset}`];
  lines.push(`  Requests: ${trace.network.requestCount}`);

  if (trace.network.apiRequests.length > 0) {
    lines.push(`  ${c.green}APIs discovered: ${trace.network.apiRequests.length}${c.reset}`);
    for (const api of trace.network.apiRequests.slice(0, 3)) {
      lines.push(`    ${c.dim}${api.method} ${api.url.substring(0, 50)}${api.url.length > 50 ? '...' : ''}${c.reset}`);
    }
    if (trace.network.apiRequests.length > 3) {
      lines.push(`    ${c.dim}... and ${trace.network.apiRequests.length - 3} more${c.reset}`);
    }
  }

  if (trace.network.failedRequests.length > 0) {
    lines.push(`  ${c.red}Failed: ${trace.network.failedRequests.length}${c.reset}`);
  }

  return lines.join('\n');
}

function renderDetailedNetwork(trace: DebugTrace, c: typeof Colors): string {
  if (!trace.network) return '';

  const lines: string[] = [`${c.bold}Network Activity${c.reset}`];
  lines.push(`  Total requests: ${trace.network.requestCount}`);

  if (trace.network.bytesTransferred) {
    lines.push(`  Bytes transferred: ${formatBytes(trace.network.bytesTransferred)}`);
  }

  if (trace.network.apiRequests.length > 0) {
    lines.push(`  ${c.green}API Requests (${trace.network.apiRequests.length}):${c.reset}`);
    for (const api of trace.network.apiRequests) {
      const status = api.status
        ? (api.status < 400 ? `${c.green}${api.status}${c.reset}` : `${c.red}${api.status}${c.reset}`)
        : `${c.dim}pending${c.reset}`;
      lines.push(`    ${api.method} ${status} ${api.url}`);
    }
  }

  if (trace.network.failedRequests.length > 0) {
    lines.push(`  ${c.red}Failed Requests (${trace.network.failedRequests.length}):${c.reset}`);
    for (const req of trace.network.failedRequests) {
      lines.push(`    ${c.red}${req.status || 'ERR'}${c.reset} ${req.url}`);
      if (req.error) {
        lines.push(`      ${c.dim}${req.error}${c.reset}`);
      }
    }
  }

  return lines.join('\n');
}

function renderErrors(trace: DebugTrace, c: typeof Colors): string {
  const lines: string[] = [`${c.bold}${c.red}Errors (${trace.errors.length})${c.reset}`];

  for (const err of trace.errors) {
    const recovery = err.recoveryAttempted
      ? (err.recoverySucceeded ? `${c.green}recovered${c.reset}` : `${c.red}recovery failed${c.reset}`)
      : '';

    lines.push(`  ${c.red}[${err.type}]${c.reset} ${err.message} ${recovery}`);
  }

  return lines.join('\n');
}

function renderDetailedErrors(trace: DebugTrace, c: typeof Colors): string {
  const lines: string[] = [`${c.bold}${c.red}Errors (${trace.errors.length})${c.reset}`];

  for (const err of trace.errors) {
    lines.push(`  ${c.red}[${err.type}]${c.reset} ${err.message}`);
    lines.push(`    ${c.dim}Time: ${new Date(err.timestamp).toISOString()}${c.reset}`);
    lines.push(`    ${c.dim}Recovery: ${err.recoveryAttempted ? (err.recoverySucceeded ? 'Succeeded' : 'Failed') : 'Not attempted'}${c.reset}`);
    if (err.stack) {
      lines.push(`    ${c.dim}Stack:${c.reset}`);
      for (const line of err.stack.split('\n').slice(0, 3)) {
        lines.push(`      ${c.dim}${line}${c.reset}`);
      }
    }
  }

  return lines.join('\n');
}

function renderSkills(trace: DebugTrace, c: typeof Colors): string {
  if (!trace.skills) return '';

  const lines: string[] = [`${c.bold}Skills${c.reset}`];

  if (trace.skills.matched.length > 0) {
    lines.push(`  Matched: ${trace.skills.matched.join(', ')}`);
  }
  if (trace.skills.applied) {
    lines.push(`  ${c.green}Applied: ${trace.skills.applied}${c.reset}`);
  }
  if (trace.skills.trajectoryRecorded) {
    lines.push(`  ${c.cyan}Trajectory recorded${c.reset}`);
  }

  return lines.join('\n');
}

function renderValidation(trace: DebugTrace, c: typeof Colors): string {
  if (!trace.validation) return '';

  const status = trace.validation.valid
    ? `${c.green}VALID${c.reset}`
    : `${c.red}INVALID${c.reset}`;

  const lines: string[] = [
    `${c.bold}Validation${c.reset}`,
    `  Status: ${status}`,
    `  Content length: ${trace.validation.contentLength}`,
  ];

  if (trace.validation.reasons.length > 0) {
    lines.push(`  Reasons:`);
    for (const reason of trace.validation.reasons) {
      lines.push(`    - ${reason}`);
    }
  }

  if (trace.validation.validatorsApplied.length > 0) {
    lines.push(`  ${c.dim}Validators: ${trace.validation.validatorsApplied.join(', ')}${c.reset}`);
  }

  return lines.join('\n');
}

function renderContentStats(trace: DebugTrace, c: typeof Colors): string {
  return [
    `${c.bold}Content Statistics${c.reset}`,
    `  Text: ${trace.content.textLength.toLocaleString()} chars`,
    `  Markdown: ${trace.content.markdownLength.toLocaleString()} chars`,
    `  Tables: ${trace.content.tableCount}`,
    `  APIs: ${trace.content.apiCount}`,
  ].join('\n');
}

function renderAnomaly(trace: DebugTrace, c: typeof Colors): string {
  if (!trace.anomaly) return '';

  return [
    `${c.bold}${c.yellow}Anomaly Detected${c.reset}`,
    `  Type: ${trace.anomaly.type}`,
    `  Confidence: ${(trace.anomaly.confidence * 100).toFixed(0)}%`,
    `  Suggested action: ${trace.anomaly.action}`,
  ].join('\n');
}

function renderSummary(trace: DebugTrace, c: typeof Colors): string {
  const lines: string[] = [`${c.bold}Summary${c.reset}`];

  const tierCount = trace.tiers.attempts.length;
  const failedTiers = trace.tiers.attempts.filter(t => !t.success).length;

  lines.push(`  Tiers: ${tierCount} attempted, ${failedTiers} failed`);
  lines.push(`  Selectors: ${trace.selectors.attempts.length} tried`);
  lines.push(`  Final tier: ${TierConfig[trace.tiers.finalTier].name}`);
  lines.push(`  Final selector: ${trace.selectors.finalSelector}`);

  if (trace.errors.length > 0) {
    lines.push(`  ${c.red}Errors: ${trace.errors.length}${c.reset}`);
  }

  return lines.join('\n');
}

function renderDetailedTiers(trace: DebugTrace, c: typeof Colors, useColor = true): string {
  return renderTierCascade(trace, c, useColor);
}

function renderHtmlTimeline(trace: DebugTrace): string {
  const totalMs = trace.durationMs || 1;
  const segments: string[] = [];

  for (const attempt of trace.tiers.attempts) {
    const width = Math.max(5, (attempt.durationMs / totalMs) * 100);
    const color = attempt.tier === 'intelligence' ? '#00838f'
      : attempt.tier === 'lightweight' ? '#1565c0'
        : '#7b1fa2';

    segments.push(`
      <div class="timeline-segment"
           style="width: ${width}%; background: ${color}; opacity: ${attempt.success ? 1 : 0.5};"
           title="${TierConfig[attempt.tier].name}: ${attempt.durationMs}ms ${attempt.success ? '(success)' : '(failed)'}">
      </div>
    `);
  }

  return segments.join('');
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function createNoOpColors(): typeof Colors {
  const noOp = '';
  return {
    reset: noOp,
    bold: noOp,
    dim: noOp,
    red: noOp,
    green: noOp,
    yellow: noOp,
    blue: noOp,
    magenta: noOp,
    cyan: noOp,
    white: noOp,
    bgRed: noOp,
    bgGreen: noOp,
    bgYellow: noOp,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Create a summary card for a trace (quick overview)
 */
export function createTraceSummaryCard(trace: DebugTrace): string {
  const status = trace.success ? 'OK' : 'FAIL';
  const tier = TierConfig[trace.tiers.finalTier].name;
  const duration = formatDuration(trace.durationMs);
  const errors = trace.errors.length;

  return [
    `+${'='.repeat(50)}+`,
    `| ${status.padEnd(6)} | ${tier.padEnd(12)} | ${duration.padStart(8)} | Errors: ${errors} |`,
    `| ${trace.domain.substring(0, 48).padEnd(48)} |`,
    `+${'='.repeat(50)}+`,
  ].join('\n');
}

/**
 * Compare two traces side by side
 */
export function compareTraces(
  trace1: DebugTrace,
  trace2: DebugTrace,
  useColor = true
): string {
  const c = useColor ? Colors : createNoOpColors();

  const lines: string[] = [
    `${c.bold}Trace Comparison${c.reset}`,
    '='.repeat(80),
    '',
  ];

  // Basic info
  const row = (label: string, v1: string, v2: string) => {
    const same = v1 === v2;
    const marker = same ? ' ' : `${c.yellow}*${c.reset}`;
    return `${marker} ${label.padEnd(15)} | ${v1.padEnd(25)} | ${v2.padEnd(25)}`;
  };

  lines.push(row('', 'Trace 1', 'Trace 2'));
  lines.push('-'.repeat(70));
  lines.push(row('Status', trace1.success ? 'Success' : 'Failure', trace2.success ? 'Success' : 'Failure'));
  lines.push(row('Duration', `${trace1.durationMs}ms`, `${trace2.durationMs}ms`));
  lines.push(row('Final Tier', trace1.tiers.finalTier, trace2.tiers.finalTier));
  lines.push(row('Selector', trace1.selectors.finalSelector, trace2.selectors.finalSelector));
  lines.push(row('Tiers Tried', trace1.tiers.attempts.length.toString(), trace2.tiers.attempts.length.toString()));
  lines.push(row('Errors', trace1.errors.length.toString(), trace2.errors.length.toString()));
  lines.push(row('Content Len', trace1.content.textLength.toString(), trace2.content.textLength.toString()));

  return lines.join('\n');
}
