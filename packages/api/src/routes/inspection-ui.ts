/**
 * Inspection UI (F-013)
 *
 * Human-in-the-loop inspection UI for viewing:
 * - Tier cascade decisions
 * - Selector attempts
 * - Extracted content with confidence scores
 * - Decision traces from browse operations
 */

import { Hono } from 'hono';
import { html } from 'hono/html';

export const inspectionUI = new Hono();

/**
 * GET / - Serve the inspection UI HTML
 */
inspectionUI.get('/', (c) => {
  return c.html(getInspectionHTML());
});

/**
 * Generate the inspection UI HTML.
 * This UI allows viewing decision traces from browse operations.
 * Uses safe DOM manipulation - no innerHTML with untrusted content.
 */
function getInspectionHTML() {
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unbrowser Inspection UI</title>
  <style>
    :root {
      --bg-primary: #0f172a;
      --bg-secondary: #1e293b;
      --bg-tertiary: #334155;
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --accent-blue: #3b82f6;
      --accent-green: #22c55e;
      --accent-yellow: #eab308;
      --accent-red: #ef4444;
      --accent-purple: #a855f7;
      --accent-cyan: #06b6d4;
      --border-color: #475569;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 24px;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-color);
    }

    h1 { font-size: 28px; font-weight: 600; }
    h2 { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
    h3 { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }

    .input-section {
      background: var(--bg-secondary);
      border-radius: 12px;
      padding: 24px;
      border: 1px solid var(--border-color);
      margin-bottom: 24px;
    }

    .input-group {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }

    .input-group input {
      flex: 1;
      padding: 12px 16px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 14px;
    }

    .input-group input:focus {
      outline: none;
      border-color: var(--accent-blue);
    }

    .input-group input::placeholder { color: var(--text-secondary); }

    .btn {
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s;
    }

    .btn-primary { background: var(--accent-blue); color: white; }
    .btn-primary:hover { background: #2563eb; }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

    .options-row { display: flex; gap: 24px; flex-wrap: wrap; }
    .option-group { display: flex; align-items: center; gap: 8px; }
    .option-group label { font-size: 14px; color: var(--text-secondary); }
    .option-group input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--accent-blue); }

    .results-section { display: none; }
    .results-section.visible { display: block; }

    .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
    @media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr; } }

    .card {
      background: var(--bg-secondary);
      border-radius: 12px;
      padding: 20px;
      border: 1px solid var(--border-color);
    }

    .card-full { margin-bottom: 24px; }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .summary-stat {
      background: var(--bg-tertiary);
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }

    .summary-stat .value { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
    .summary-stat .label { font-size: 12px; color: var(--text-secondary); text-transform: uppercase; }

    .tier-cascade { display: flex; flex-direction: column; gap: 12px; }

    .tier-item {
      display: flex;
      align-items: center;
      padding: 16px;
      background: var(--bg-tertiary);
      border-radius: 8px;
      border-left: 4px solid var(--border-color);
    }

    .tier-item.success { border-left-color: var(--accent-green); }
    .tier-item.failed { border-left-color: var(--accent-red); }

    .tier-item .tier-icon {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 16px;
      font-size: 20px;
    }

    .tier-item.success .tier-icon { background: rgba(34, 197, 94, 0.2); }
    .tier-item.failed .tier-icon { background: rgba(239, 68, 68, 0.2); }

    .tier-info { flex: 1; }
    .tier-name { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
    .tier-details { font-size: 13px; color: var(--text-secondary); }
    .tier-timing { font-size: 14px; font-weight: 500; color: var(--text-secondary); }

    .selector-list { display: flex; flex-direction: column; gap: 8px; }

    .selector-item {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      background: var(--bg-tertiary);
      border-radius: 8px;
      gap: 12px;
    }

    .selector-item.selected { border: 2px solid var(--accent-green); }

    .selector-status {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    }

    .selector-status.matched { background: rgba(34, 197, 94, 0.2); color: var(--accent-green); }
    .selector-status.unmatched { background: rgba(239, 68, 68, 0.2); color: var(--accent-red); }

    .selector-code {
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 13px;
      background: var(--bg-primary);
      padding: 4px 8px;
      border-radius: 4px;
      color: var(--accent-cyan);
    }

    .selector-meta {
      margin-left: auto;
      display: flex;
      gap: 16px;
      font-size: 13px;
      color: var(--text-secondary);
    }

    .confidence-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }

    .confidence-high { background: rgba(34, 197, 94, 0.2); color: var(--accent-green); }
    .confidence-medium { background: rgba(234, 179, 8, 0.2); color: var(--accent-yellow); }
    .confidence-low { background: rgba(239, 68, 68, 0.2); color: var(--accent-red); }

    .content-preview {
      background: var(--bg-tertiary);
      border-radius: 8px;
      padding: 16px;
      max-height: 400px;
      overflow: auto;
    }

    .content-preview pre {
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 13px;
      line-height: 1.5;
    }

    .content-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .content-stats { display: flex; gap: 16px; font-size: 13px; color: var(--text-secondary); }

    .title-attempts { display: flex; flex-direction: column; gap: 8px; }

    .title-item {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      background: var(--bg-tertiary);
      border-radius: 8px;
      gap: 12px;
    }

    .title-item.selected { border: 2px solid var(--accent-green); }
    .title-source { font-size: 12px; font-weight: 500; text-transform: uppercase; color: var(--accent-purple); min-width: 80px; }
    .title-value { flex: 1; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .loading { text-align: center; padding: 48px; color: var(--text-secondary); }

    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--border-color);
      border-top-color: var(--accent-blue);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .error-message {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid var(--accent-red);
      color: var(--accent-red);
      padding: 16px 24px;
      border-radius: 8px;
      margin-bottom: 24px;
    }

    .empty-state { text-align: center; padding: 48px; color: var(--text-secondary); }

    .tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 8px;
    }

    .tab {
      background: transparent;
      color: var(--text-secondary);
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s;
    }

    .tab:hover { background: var(--bg-tertiary); color: var(--text-primary); }
    .tab.active { background: var(--accent-blue); color: white; }

    .tab-content { display: none; }
    .tab-content.active { display: block; }

    .strategy-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 16px;
      font-size: 13px;
      font-weight: 500;
      background: rgba(168, 85, 247, 0.2);
      color: var(--accent-purple);
    }

    .json-view {
      background: var(--bg-tertiary);
      border-radius: 8px;
      padding: 16px;
      max-height: 500px;
      overflow: auto;
    }

    .json-view pre {
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 12px;
      line-height: 1.5;
    }

    .help-text { font-size: 13px; color: var(--text-secondary); margin-top: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Unbrowser Inspection UI</h1>
    </header>

    <div class="input-section">
      <h3>Browse URL</h3>
      <div class="input-group">
        <input type="text" id="urlInput" placeholder="https://example.com" />
        <button class="btn btn-primary" id="browseBtn">Browse</button>
      </div>
      <div class="options-row">
        <div class="option-group">
          <input type="checkbox" id="optIncludeTrace" checked />
          <label for="optIncludeTrace">Include decision trace</label>
        </div>
        <div class="option-group">
          <input type="checkbox" id="optIncludeNetwork" />
          <label for="optIncludeNetwork">Include network requests</label>
        </div>
        <div class="option-group">
          <input type="checkbox" id="optForcePlaywright" />
          <label for="optForcePlaywright">Force Playwright tier</label>
        </div>
      </div>
      <p class="help-text">Enter a URL to inspect the browsing process. The decision trace shows which tiers and selectors were attempted.</p>
    </div>

    <div id="loadingState" class="loading" style="display: none;">
      <div class="loading-spinner"></div>
      <p>Browsing URL...</p>
    </div>

    <div id="errorState" class="error-message" style="display: none;"></div>

    <div id="resultsSection" class="results-section">
      <div class="summary-grid">
        <div class="summary-stat"><div class="value" id="statFinalTier">-</div><div class="label">Final Tier</div></div>
        <div class="summary-stat"><div class="value" id="statTiersAttempted">-</div><div class="label">Tiers Tried</div></div>
        <div class="summary-stat"><div class="value" id="statSelectorsAttempted">-</div><div class="label">Selectors</div></div>
        <div class="summary-stat"><div class="value" id="statContentLength">-</div><div class="label">Content Length</div></div>
        <div class="summary-stat"><div class="value" id="statConfidence">-</div><div class="label">Confidence</div></div>
        <div class="summary-stat"><div class="value" id="statDuration">-</div><div class="label">Duration</div></div>
      </div>

      <div class="tabs">
        <button class="tab active" data-tab="tiers">Tier Cascade</button>
        <button class="tab" data-tab="selectors">Selectors</button>
        <button class="tab" data-tab="content">Content</button>
        <button class="tab" data-tab="json">Raw JSON</button>
      </div>

      <div id="tab-tiers" class="tab-content active">
        <div class="card card-full">
          <h2>Tier Cascade</h2>
          <p class="help-text" style="margin-bottom: 16px;">Shows the rendering tiers attempted in order, with timing and results.</p>
          <div class="tier-cascade" id="tierCascade"></div>
        </div>
      </div>

      <div id="tab-selectors" class="tab-content">
        <div class="grid-2">
          <div class="card">
            <h2>Content Selectors</h2>
            <p class="help-text" style="margin-bottom: 16px;">CSS selectors tried for main content extraction.</p>
            <div class="selector-list" id="selectorList"></div>
          </div>
          <div class="card">
            <h2>Title Extraction</h2>
            <p class="help-text" style="margin-bottom: 16px;">Sources checked for page title.</p>
            <div class="title-attempts" id="titleAttempts"></div>
          </div>
        </div>
      </div>

      <div id="tab-content" class="tab-content">
        <div class="card card-full">
          <div class="content-header">
            <h2>Extracted Content</h2>
            <div class="content-stats">
              <span id="contentTitle">-</span>
              <span id="contentStrategy"></span>
            </div>
          </div>
          <div class="content-preview">
            <pre id="contentPreview">No content available</pre>
          </div>
        </div>
      </div>

      <div id="tab-json" class="tab-content">
        <div class="card card-full">
          <h2>Raw Response</h2>
          <p class="help-text" style="margin-bottom: 16px;">Full JSON response from the browse operation.</p>
          <div class="json-view">
            <pre id="jsonPreview">{}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    (function() {
      'use strict';

      var currentTab = 'tiers';
      var browseResult = null;

      // Safe DOM helpers - no innerHTML with untrusted content
      function createElement(tag, className, textContent) {
        var el = document.createElement(tag);
        if (className) el.className = className;
        if (textContent !== undefined) el.textContent = textContent;
        return el;
      }

      function clearElement(el) {
        while (el.firstChild) {
          el.removeChild(el.firstChild);
        }
      }

      function formatNumber(num) {
        if (num === undefined || num === null) return '-';
        return num.toLocaleString();
      }

      function getConfidenceClass(score) {
        if (score >= 0.7) return 'confidence-high';
        if (score >= 0.4) return 'confidence-medium';
        return 'confidence-low';
      }

      // Tab switching
      function switchTab(tabName) {
        currentTab = tabName;
        document.querySelectorAll('.tab').forEach(function(tab) {
          tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        document.querySelectorAll('.tab-content').forEach(function(content) {
          content.classList.toggle('active', content.id === 'tab-' + tabName);
        });
      }

      // Browse action
      async function doBrowse() {
        var urlInput = document.getElementById('urlInput');
        var url = urlInput.value.trim();

        if (!url) {
          showError('Please enter a URL');
          return;
        }

        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
          urlInput.value = url;
        }

        var includeTrace = document.getElementById('optIncludeTrace').checked;
        var includeNetwork = document.getElementById('optIncludeNetwork').checked;
        var forcePlaywright = document.getElementById('optForcePlaywright').checked;

        document.getElementById('loadingState').style.display = 'block';
        document.getElementById('errorState').style.display = 'none';
        document.getElementById('resultsSection').classList.remove('visible');
        document.getElementById('browseBtn').disabled = true;

        try {
          var response = await fetch('/v1/browse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: url,
              includeDecisionTrace: includeTrace,
              includeNetworkRequests: includeNetwork,
              forceRenderTier: forcePlaywright ? 'playwright' : undefined
            })
          });

          if (!response.ok) {
            var errorData = await response.json().catch(function() { return {}; });
            throw new Error(errorData.error || 'Browse failed: ' + response.status);
          }

          browseResult = await response.json();
          renderResults(browseResult);
        } catch (error) {
          showError(error.message);
        } finally {
          document.getElementById('loadingState').style.display = 'none';
          document.getElementById('browseBtn').disabled = false;
        }
      }

      function showError(message) {
        var errorEl = document.getElementById('errorState');
        errorEl.textContent = message;
        errorEl.style.display = 'block';
      }

      function renderResults(data) {
        document.getElementById('resultsSection').classList.add('visible');

        var trace = data.decisionTrace || {};
        var summary = trace.summary || {};
        var learning = data.learning || {};

        document.getElementById('statFinalTier').textContent = summary.finalTier || learning.renderTier || '-';
        document.getElementById('statTiersAttempted').textContent = summary.tiersAttempted || (trace.tiers ? trace.tiers.length : '-');
        document.getElementById('statSelectorsAttempted').textContent = summary.selectorsAttempted || (trace.selectors ? trace.selectors.length : '-');
        document.getElementById('statContentLength').textContent = data.content && data.content.text ? formatNumber(data.content.text.length) : '-';
        document.getElementById('statConfidence').textContent = learning.confidenceLevel || (data.meta && data.meta.confidence) || '-';
        document.getElementById('statDuration').textContent = data.meta && data.meta.timing ? data.meta.timing + 'ms' : '-';

        renderTierCascade(trace.tiers || []);
        renderSelectors(trace.selectors || []);
        renderTitleAttempts(trace.title || []);
        renderContent(data);
        document.getElementById('jsonPreview').textContent = JSON.stringify(data, null, 2);
      }

      function renderTierCascade(tiers) {
        var container = document.getElementById('tierCascade');
        clearElement(container);

        if (!tiers || tiers.length === 0) {
          container.appendChild(createElement('div', 'empty-state', 'No tier cascade data available'));
          return;
        }

        tiers.forEach(function(tier) {
          var item = createElement('div', 'tier-item ' + (tier.success ? 'success' : 'failed'));

          var icon = createElement('div', 'tier-icon', tier.success ? '\u2713' : '\u2717');
          item.appendChild(icon);

          var info = createElement('div', 'tier-info');
          var name = createElement('div', 'tier-name', tier.tier);
          info.appendChild(name);

          var details = [];
          if (tier.extractionStrategy) details.push('Strategy: ' + tier.extractionStrategy);
          if (tier.failureReason) details.push(tier.failureReason);
          if (tier.validationDetails) {
            if (tier.validationDetails.contentLength) details.push(formatNumber(tier.validationDetails.contentLength) + ' chars');
            if (tier.validationDetails.hasSemanticMarkers) details.push('Semantic markers found');
            if (tier.validationDetails.incompleteMarkers && tier.validationDetails.incompleteMarkers.length > 0) {
              details.push('Incomplete: ' + tier.validationDetails.incompleteMarkers.join(', '));
            }
          }

          if (details.length > 0) {
            var detailsEl = createElement('div', 'tier-details', details.join(' | '));
            info.appendChild(detailsEl);
          }

          item.appendChild(info);

          var timing = createElement('div', 'tier-timing', tier.durationMs + 'ms');
          item.appendChild(timing);

          container.appendChild(item);
        });
      }

      function renderSelectors(selectors) {
        var container = document.getElementById('selectorList');
        clearElement(container);

        if (!selectors || selectors.length === 0) {
          container.appendChild(createElement('div', 'empty-state', 'No selector data available'));
          return;
        }

        selectors.forEach(function(sel) {
          var item = createElement('div', 'selector-item' + (sel.selected ? ' selected' : ''));

          var status = createElement('div', 'selector-status ' + (sel.matched ? 'matched' : 'unmatched'), sel.matched ? '\u2713' : '\u2717');
          item.appendChild(status);

          var code = createElement('code', 'selector-code', sel.selector);
          item.appendChild(code);

          var meta = createElement('div', 'selector-meta');

          var source = createElement('span', null, sel.source);
          meta.appendChild(source);

          var length = createElement('span', null, formatNumber(sel.contentLength) + ' chars');
          meta.appendChild(length);

          var confidence = createElement('span', 'confidence-badge ' + getConfidenceClass(sel.confidenceScore), (sel.confidenceScore * 100).toFixed(0) + '%');
          meta.appendChild(confidence);

          if (sel.skipReason) {
            var skip = createElement('span', null, sel.skipReason);
            meta.appendChild(skip);
          }

          item.appendChild(meta);
          container.appendChild(item);
        });
      }

      function renderTitleAttempts(attempts) {
        var container = document.getElementById('titleAttempts');
        clearElement(container);

        if (!attempts || attempts.length === 0) {
          container.appendChild(createElement('div', 'empty-state', 'No title extraction data available'));
          return;
        }

        attempts.forEach(function(attempt) {
          var item = createElement('div', 'title-item' + (attempt.selected ? ' selected' : ''));

          var status = createElement('div', 'selector-status ' + (attempt.found ? 'matched' : 'unmatched'), attempt.found ? '\u2713' : '\u2717');
          item.appendChild(status);

          var source = createElement('div', 'title-source', attempt.source);
          item.appendChild(source);

          var value = createElement('div', 'title-value', attempt.value || '(not found)');
          item.appendChild(value);

          container.appendChild(item);
        });
      }

      function renderContent(data) {
        var content = data.content || {};
        var meta = data.meta || {};

        document.getElementById('contentTitle').textContent = content.title || 'No title';

        var strategyContainer = document.getElementById('contentStrategy');
        clearElement(strategyContainer);
        if (meta.strategy) {
          var badge = createElement('span', 'strategy-badge', meta.strategy);
          strategyContainer.appendChild(badge);
        }

        var previewContent = content.markdown || content.text || 'No content extracted';
        document.getElementById('contentPreview').textContent = previewContent;
      }

      // Event listeners
      document.getElementById('browseBtn').addEventListener('click', doBrowse);

      document.getElementById('urlInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') doBrowse();
      });

      document.querySelectorAll('.tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
          switchTab(this.dataset.tab);
        });
      });
    })();
  </script>
</body>
</html>`;
}
