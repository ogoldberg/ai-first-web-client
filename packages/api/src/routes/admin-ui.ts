/**
 * Admin Dashboard UI (API-008)
 *
 * Serves a web-based admin dashboard for monitoring usage,
 * managing tenants, and viewing system metrics.
 */

import { Hono } from 'hono';
import { html } from 'hono/html';
import { authMiddleware, requirePermission } from '../middleware/auth.js';

export const adminUI = new Hono();

// Protect UI routes - require authentication and admin permission
adminUI.use('*', authMiddleware, requirePermission('admin'));

/**
 * GET / - Serve the admin dashboard HTML
 */
adminUI.get('/', (c) => {
  return c.html(getDashboardHTML());
});

/**
 * Generate the dashboard HTML with embedded CSS and JavaScript.
 * Uses safe DOM manipulation - no innerHTML with untrusted content.
 */
function getDashboardHTML() {
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unbrowser Admin Dashboard</title>
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

    h1 {
      font-size: 28px;
      font-weight: 600;
    }

    .header-actions {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .refresh-btn {
      background: var(--accent-blue);
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: background 0.2s;
    }

    .refresh-btn:hover {
      background: #2563eb;
    }

    .refresh-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .last-updated {
      color: var(--text-secondary);
      font-size: 13px;
    }

    .tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 12px;
    }

    .tab {
      background: transparent;
      color: var(--text-secondary);
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s;
    }

    .tab:hover {
      background: var(--bg-secondary);
      color: var(--text-primary);
    }

    .tab.active {
      background: var(--accent-blue);
      color: white;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
      margin-bottom: 32px;
    }

    .card {
      background: var(--bg-secondary);
      border-radius: 12px;
      padding: 24px;
      border: 1px solid var(--border-color);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 16px;
    }

    .card-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .card-value {
      font-size: 36px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .card-subtitle {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 6px;
    }

    .status-dot.green { background: var(--accent-green); }
    .status-dot.yellow { background: var(--accent-yellow); }
    .status-dot.red { background: var(--accent-red); }

    .table-container {
      background: var(--bg-secondary);
      border-radius: 12px;
      border: 1px solid var(--border-color);
      overflow: hidden;
    }

    .table-header {
      padding: 16px 24px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .table-title {
      font-size: 16px;
      font-weight: 600;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      padding: 12px 24px;
      text-align: left;
      border-bottom: 1px solid var(--border-color);
    }

    th {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    td {
      font-size: 14px;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: var(--bg-tertiary);
    }

    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }

    .badge-free { background: #374151; color: #9ca3af; }
    .badge-starter { background: #1e40af; color: #93c5fd; }
    .badge-team { background: #166534; color: #86efac; }
    .badge-enterprise { background: #7c2d12; color: #fed7aa; }

    .badge-error { background: #7f1d1d; color: #fca5a5; }
    .badge-warning { background: #713f12; color: #fde047; }
    .badge-success { background: #14532d; color: #86efac; }

    .progress-bar {
      height: 8px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      overflow: hidden;
      margin-top: 8px;
    }

    .progress-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s;
    }

    .progress-fill.blue { background: var(--accent-blue); }
    .progress-fill.green { background: var(--accent-green); }
    .progress-fill.yellow { background: var(--accent-yellow); }
    .progress-fill.red { background: var(--accent-red); }
    .progress-fill.purple { background: var(--accent-purple); }

    .tier-breakdown {
      display: flex;
      gap: 16px;
      margin-top: 16px;
    }

    .tier-item {
      flex: 1;
      padding: 16px;
      background: var(--bg-tertiary);
      border-radius: 8px;
    }

    .tier-name {
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 4px;
    }

    .tier-value {
      font-size: 20px;
      font-weight: 600;
    }

    .tier-percent {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .error-item {
      padding: 16px 24px;
      border-bottom: 1px solid var(--border-color);
    }

    .error-item:last-child {
      border-bottom: none;
    }

    .error-path {
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 14px;
      color: var(--accent-red);
    }

    .error-count {
      font-size: 13px;
      color: var(--text-secondary);
      margin-top: 4px;
    }

    .hidden {
      display: none !important;
    }

    .loading {
      text-align: center;
      padding: 48px;
      color: var(--text-secondary);
    }

    .error-message {
      background: #7f1d1d;
      color: #fca5a5;
      padding: 16px 24px;
      border-radius: 8px;
      margin-bottom: 24px;
    }

    .system-info {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }

    .system-item {
      padding: 16px;
      background: var(--bg-tertiary);
      border-radius: 8px;
    }

    .system-label {
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 4px;
    }

    .system-value {
      font-size: 16px;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Unbrowser Admin Dashboard</h1>
      <div class="header-actions">
        <span class="last-updated" id="lastUpdated">Loading...</span>
        <button class="refresh-btn" id="refreshBtn" onclick="refreshData()">Refresh</button>
      </div>
    </header>

    <div class="tabs">
      <button class="tab active" data-tab="overview" onclick="switchTab('overview')">Overview</button>
      <button class="tab" data-tab="usage" onclick="switchTab('usage')">Usage</button>
      <button class="tab" data-tab="tenants" onclick="switchTab('tenants')">Tenants</button>
      <button class="tab" data-tab="errors" onclick="switchTab('errors')">Errors</button>
      <button class="tab" data-tab="system" onclick="switchTab('system')">System</button>
    </div>

    <div id="errorContainer" class="error-message hidden"></div>

    <!-- Overview Tab -->
    <div id="tab-overview" class="tab-content">
      <div class="grid" id="overviewCards">
        <div class="loading">Loading overview data...</div>
      </div>
    </div>

    <!-- Usage Tab -->
    <div id="tab-usage" class="tab-content hidden">
      <div id="usageContent">
        <div class="loading">Loading usage data...</div>
      </div>
    </div>

    <!-- Tenants Tab -->
    <div id="tab-tenants" class="tab-content hidden">
      <div class="table-container">
        <div class="table-header">
          <span class="table-title">Tenants</span>
          <span id="tenantCount" class="last-updated"></span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Tenant ID</th>
              <th>Name</th>
              <th>Plan</th>
              <th>Today's Requests</th>
              <th>Today's Units</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="tenantsTableBody">
            <tr><td colspan="6" class="loading">Loading tenants...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Errors Tab -->
    <div id="tab-errors" class="tab-content hidden">
      <div class="grid">
        <div class="card">
          <div class="card-title">Client Errors (4xx)</div>
          <div class="card-value" id="clientErrorCount">-</div>
        </div>
        <div class="card">
          <div class="card-title">Server Errors (5xx)</div>
          <div class="card-value" id="serverErrorCount">-</div>
        </div>
      </div>
      <div class="table-container" style="margin-top: 24px;">
        <div class="table-header">
          <span class="table-title">Top Error Paths</span>
        </div>
        <div id="errorPaths">
          <div class="loading">Loading error data...</div>
        </div>
      </div>
    </div>

    <!-- System Tab -->
    <div id="tab-system" class="tab-content hidden">
      <div class="grid">
        <div class="card">
          <div class="card-title">Uptime</div>
          <div class="card-value" id="systemUptime">-</div>
        </div>
        <div class="card">
          <div class="card-title">Memory (Heap Used)</div>
          <div class="card-value" id="systemMemory">-</div>
          <div class="card-subtitle" id="systemMemoryTotal"></div>
        </div>
        <div class="card">
          <div class="card-title">Node Version</div>
          <div class="card-value" id="nodeVersion">-</div>
        </div>
      </div>
      <div class="card" style="margin-top: 24px;">
        <div class="card-title" style="margin-bottom: 16px;">Process Information</div>
        <div class="system-info" id="systemInfo">
          <div class="loading">Loading system data...</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    // Dashboard state
    let currentTab = 'overview';
    let dashboardData = {};

    // API base URL - relative to current page
    const API_BASE = '/v1/admin/dashboard';

    // Tab switching
    function switchTab(tabName) {
      currentTab = tabName;

      // Update tab buttons
      document.querySelectorAll('.tab').forEach(function(tab) {
        if (tab.dataset.tab === tabName) {
          tab.classList.add('active');
        } else {
          tab.classList.remove('active');
        }
      });

      // Update tab content
      document.querySelectorAll('.tab-content').forEach(function(content) {
        if (content.id === 'tab-' + tabName) {
          content.classList.remove('hidden');
        } else {
          content.classList.add('hidden');
        }
      });

      // Load data for the tab if needed
      loadTabData(tabName);
    }

    // Load data for specific tab
    async function loadTabData(tabName) {
      switch (tabName) {
        case 'overview':
          await loadOverview();
          break;
        case 'usage':
          await loadUsage();
          break;
        case 'tenants':
          await loadTenants();
          break;
        case 'errors':
          await loadErrors();
          break;
        case 'system':
          await loadSystem();
          break;
      }
    }

    // Fetch helper with auth
    async function fetchAPI(endpoint) {
      var response = await fetch(API_BASE + endpoint, {
        headers: {
          'Accept': 'application/json'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('API request failed: ' + response.status);
      }

      return response.json();
    }

    // Show error message
    function showError(message) {
      var container = document.getElementById('errorContainer');
      container.textContent = message;
      container.classList.remove('hidden');
    }

    // Hide error message
    function hideError() {
      document.getElementById('errorContainer').classList.add('hidden');
    }

    // Update last updated time
    function updateTimestamp() {
      var now = new Date();
      document.getElementById('lastUpdated').textContent = 'Updated: ' + now.toLocaleTimeString();
    }

    // Format number with commas
    function formatNumber(num) {
      if (num === undefined || num === null) return '-';
      return num.toLocaleString();
    }

    // Format bytes to MB
    function formatMB(bytes) {
      if (bytes === undefined || bytes === null) return '-';
      return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    // Create a card element safely
    function createCard(title, value, subtitle, color) {
      var card = document.createElement('div');
      card.className = 'card';

      var cardTitle = document.createElement('div');
      cardTitle.className = 'card-title';
      cardTitle.textContent = title;
      card.appendChild(cardTitle);

      var cardValue = document.createElement('div');
      cardValue.className = 'card-value';
      if (color) cardValue.style.color = 'var(--' + color + ')';
      cardValue.textContent = value;
      card.appendChild(cardValue);

      if (subtitle) {
        var cardSubtitle = document.createElement('div');
        cardSubtitle.className = 'card-subtitle';
        cardSubtitle.textContent = subtitle;
        card.appendChild(cardSubtitle);
      }

      return card;
    }

    // Create progress bar element
    function createProgressBar(percent, colorClass) {
      var bar = document.createElement('div');
      bar.className = 'progress-bar';

      var fill = document.createElement('div');
      fill.className = 'progress-fill ' + colorClass;
      fill.style.width = percent + '%';
      bar.appendChild(fill);

      return bar;
    }

    // Load overview data
    async function loadOverview() {
      try {
        var data = await fetchAPI('/overview');
        var container = document.getElementById('overviewCards');

        // Clear container
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }

        if (data.success && data.data) {
          var d = data.data;

          // Total Requests
          container.appendChild(createCard(
            'Total Requests',
            formatNumber(d.requests.total),
            'Error rate: ' + (d.requests.errorRate || 0) + '%',
            d.requests.errorRate > 5 ? 'accent-red' : 'accent-green'
          ));

          // Average Latency
          container.appendChild(createCard(
            'Avg Latency',
            (d.requests.avgLatencyMs || 0).toFixed(0) + 'ms',
            'P95: ' + (d.requests.p95LatencyMs || 0).toFixed(0) + 'ms'
          ));

          // Total Tenants
          container.appendChild(createCard(
            'Total Tenants',
            formatNumber(d.tenants.total)
          ));

          // Error Count
          container.appendChild(createCard(
            'Errors',
            formatNumber(d.requests.errors),
            null,
            d.requests.errors > 0 ? 'accent-red' : 'accent-green'
          ));

          // System Uptime
          container.appendChild(createCard(
            'Uptime',
            formatUptime(d.system.uptime)
          ));

          // Memory Usage
          container.appendChild(createCard(
            'Memory',
            formatMB(d.system.memory.heapUsed),
            'of ' + formatMB(d.system.memory.heapTotal)
          ));
        }

        hideError();
        updateTimestamp();
      } catch (err) {
        showError('Failed to load overview: ' + err.message);
      }
    }

    // Load usage data
    async function loadUsage() {
      try {
        var data = await fetchAPI('/usage/summary');
        var container = document.getElementById('usageContent');

        // Clear container
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }

        if (data.success && data.data) {
          var d = data.data;

          // Totals grid
          var grid = document.createElement('div');
          grid.className = 'grid';

          grid.appendChild(createCard(
            'Total Requests',
            formatNumber(d.totals.requests)
          ));

          grid.appendChild(createCard(
            'Total Units',
            formatNumber(d.totals.units)
          ));

          container.appendChild(grid);

          // Tier breakdown
          var tierCard = document.createElement('div');
          tierCard.className = 'card';
          tierCard.style.marginTop = '24px';

          var tierTitle = document.createElement('div');
          tierTitle.className = 'card-title';
          tierTitle.style.marginBottom = '16px';
          tierTitle.textContent = 'Usage by Tier';
          tierCard.appendChild(tierTitle);

          var tierBreakdown = document.createElement('div');
          tierBreakdown.className = 'tier-breakdown';

          var colors = ['accent-blue', 'accent-green', 'accent-purple'];

          if (d.byTier && d.byTier.length > 0) {
            d.byTier.forEach(function(tier, index) {
              var tierItem = document.createElement('div');
              tierItem.className = 'tier-item';

              var tierName = document.createElement('div');
              tierName.className = 'tier-name';
              tierName.textContent = tier.tier.charAt(0).toUpperCase() + tier.tier.slice(1);
              tierItem.appendChild(tierName);

              var tierValue = document.createElement('div');
              tierValue.className = 'tier-value';
              tierValue.style.color = 'var(--' + colors[index % colors.length] + ')';
              tierValue.textContent = formatNumber(tier.requests);
              tierItem.appendChild(tierValue);

              var tierPercent = document.createElement('div');
              tierPercent.className = 'tier-percent';
              tierPercent.textContent = tier.requestPercent + '% of requests';
              tierItem.appendChild(tierPercent);

              tierBreakdown.appendChild(tierItem);
            });
          }

          tierCard.appendChild(tierBreakdown);
          container.appendChild(tierCard);
        }

        hideError();
      } catch (err) {
        showError('Failed to load usage: ' + err.message);
      }
    }

    // Load tenants data
    async function loadTenants() {
      try {
        var data = await fetchAPI('/tenants');
        var tbody = document.getElementById('tenantsTableBody');

        // Clear table body
        while (tbody.firstChild) {
          tbody.removeChild(tbody.firstChild);
        }

        if (data.success && data.data && data.data.tenants) {
          var tenants = data.data.tenants;

          document.getElementById('tenantCount').textContent =
            'Showing ' + tenants.length + ' of ' + data.data.pagination.total;

          if (tenants.length === 0) {
            var emptyRow = document.createElement('tr');
            var emptyCell = document.createElement('td');
            emptyCell.colSpan = 6;
            emptyCell.textContent = 'No tenants found';
            emptyRow.appendChild(emptyCell);
            tbody.appendChild(emptyRow);
          } else {
            tenants.forEach(function(tenant) {
              var row = document.createElement('tr');

              // ID
              var idCell = document.createElement('td');
              idCell.style.fontFamily = 'Monaco, Menlo, monospace';
              idCell.style.fontSize = '12px';
              idCell.textContent = tenant.id;
              row.appendChild(idCell);

              // Name
              var nameCell = document.createElement('td');
              nameCell.textContent = tenant.name || '-';
              row.appendChild(nameCell);

              // Plan
              var planCell = document.createElement('td');
              var planBadge = document.createElement('span');
              planBadge.className = 'badge badge-' + (tenant.plan || 'free').toLowerCase();
              planBadge.textContent = tenant.plan || 'FREE';
              planCell.appendChild(planBadge);
              row.appendChild(planCell);

              // Requests
              var reqCell = document.createElement('td');
              reqCell.textContent = formatNumber(tenant.usage?.today?.requests || 0);
              row.appendChild(reqCell);

              // Units
              var unitsCell = document.createElement('td');
              unitsCell.textContent = formatNumber(tenant.usage?.today?.units || 0);
              row.appendChild(unitsCell);

              // Status
              var statusCell = document.createElement('td');
              var statusDot = document.createElement('span');
              statusDot.className = 'status-dot ' + (tenant.active !== false ? 'green' : 'red');
              statusCell.appendChild(statusDot);
              var statusText = document.createTextNode(tenant.active !== false ? 'Active' : 'Inactive');
              statusCell.appendChild(statusText);
              row.appendChild(statusCell);

              tbody.appendChild(row);
            });
          }
        }

        hideError();
      } catch (err) {
        showError('Failed to load tenants: ' + err.message);
      }
    }

    // Load errors data
    async function loadErrors() {
      try {
        var data = await fetchAPI('/errors');

        if (data.success && data.data) {
          var d = data.data;

          document.getElementById('clientErrorCount').textContent = formatNumber(d.summary.clientErrors);
          document.getElementById('serverErrorCount').textContent = formatNumber(d.summary.serverErrors);

          var container = document.getElementById('errorPaths');

          // Clear container
          while (container.firstChild) {
            container.removeChild(container.firstChild);
          }

          if (d.topErrorPaths && d.topErrorPaths.length > 0) {
            d.topErrorPaths.forEach(function(error) {
              var item = document.createElement('div');
              item.className = 'error-item';

              var path = document.createElement('div');
              path.className = 'error-path';
              path.textContent = error.path;
              item.appendChild(path);

              var count = document.createElement('div');
              count.className = 'error-count';
              count.textContent = error.count + ' errors';
              item.appendChild(count);

              container.appendChild(item);
            });
          } else {
            var empty = document.createElement('div');
            empty.className = 'loading';
            empty.textContent = 'No errors recorded';
            container.appendChild(empty);
          }
        }

        hideError();
      } catch (err) {
        showError('Failed to load errors: ' + err.message);
      }
    }

    // Load system data
    async function loadSystem() {
      try {
        var data = await fetchAPI('/system');

        if (data.success && data.data) {
          var d = data.data;

          document.getElementById('systemUptime').textContent = d.process.uptimeHuman || formatUptime(d.process.uptime);
          document.getElementById('systemMemory').textContent = formatMB(d.memory.heapUsed);
          document.getElementById('systemMemoryTotal').textContent = 'of ' + formatMB(d.memory.heapTotal);
          document.getElementById('nodeVersion').textContent = d.process.nodeVersion;

          var container = document.getElementById('systemInfo');

          // Clear container
          while (container.firstChild) {
            container.removeChild(container.firstChild);
          }

          // Add system info items
          var items = [
            { label: 'PID', value: d.process.pid },
            { label: 'Platform', value: d.process.platform },
            { label: 'Architecture', value: d.process.arch },
            { label: 'RSS Memory', value: d.memory.rssMB + ' MB' },
            { label: 'External Memory', value: formatMB(d.memory.external) }
          ];

          items.forEach(function(item) {
            var div = document.createElement('div');
            div.className = 'system-item';

            var label = document.createElement('div');
            label.className = 'system-label';
            label.textContent = item.label;
            div.appendChild(label);

            var value = document.createElement('div');
            value.className = 'system-value';
            value.textContent = item.value;
            div.appendChild(value);

            container.appendChild(div);
          });
        }

        hideError();
      } catch (err) {
        showError('Failed to load system info: ' + err.message);
      }
    }

    // Format uptime
    function formatUptime(seconds) {
      if (!seconds) return '-';

      var days = Math.floor(seconds / 86400);
      var hours = Math.floor((seconds % 86400) / 3600);
      var minutes = Math.floor((seconds % 3600) / 60);

      var parts = [];
      if (days > 0) parts.push(days + 'd');
      if (hours > 0) parts.push(hours + 'h');
      if (minutes > 0) parts.push(minutes + 'm');
      if (parts.length === 0) parts.push(Math.floor(seconds) + 's');

      return parts.join(' ');
    }

    // Refresh all data
    async function refreshData() {
      var btn = document.getElementById('refreshBtn');
      btn.disabled = true;
      btn.textContent = 'Refreshing...';

      try {
        await loadTabData(currentTab);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Refresh';
      }
    }

    // Initial load
    document.addEventListener('DOMContentLoaded', function() {
      loadOverview();
    });
  </script>
</body>
</html>`;
}
