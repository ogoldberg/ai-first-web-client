/**
 * Dashboard UI Routes
 *
 * User-facing dashboard for managing API keys, viewing usage,
 * and updating account settings.
 */

import { Hono } from 'hono';
import { html } from 'hono/html';
import type { Tenant } from '../middleware/types.js';
import { sessionAuthMiddleware, requireVerifiedEmail } from '../middleware/session-auth.js';
import { getTenantStore } from '../services/tenants.js';
import { generateApiKey, getApiKeyStore } from '../middleware/auth.js';
import { getEnvironmentUrls, type EnvironmentUrls } from '../utils/url-helpers.js';

export const dashboardUI = new Hono();

// All dashboard routes require session auth
dashboardUI.use('*', sessionAuthMiddleware);

// =============================================================================
// Shared Styles
// =============================================================================

const dashboardStyles = `
  :root {
    --bg-primary: #0f172a;
    --bg-secondary: #1e293b;
    --bg-tertiary: #334155;
    --text-primary: #f8fafc;
    --text-secondary: #94a3b8;
    --text-muted: #64748b;
    --accent-blue: #3b82f6;
    --accent-blue-hover: #2563eb;
    --accent-green: #22c55e;
    --accent-yellow: #eab308;
    --accent-red: #ef4444;
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

  .layout {
    display: flex;
    min-height: 100vh;
  }

  .sidebar {
    width: 260px;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-color);
    padding: 24px 0;
    position: fixed;
    height: 100vh;
    overflow-y: auto;
  }

  .sidebar-logo {
    padding: 0 24px;
    margin-bottom: 32px;
  }

  .sidebar-logo h1 {
    font-size: 20px;
    font-weight: 700;
  }

  .sidebar-logo span {
    font-size: 12px;
    color: var(--text-muted);
    display: block;
    margin-top: 4px;
  }

  .nav-section {
    margin-bottom: 24px;
  }

  .nav-section-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 0 24px;
    margin-bottom: 8px;
  }

  .nav-link {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 24px;
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 14px;
    transition: all 0.2s;
  }

  .nav-link:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .nav-link.active {
    background: var(--bg-tertiary);
    color: var(--accent-blue);
    border-right: 2px solid var(--accent-blue);
  }

  .nav-link svg {
    width: 18px;
    height: 18px;
  }

  .main {
    flex: 1;
    margin-left: 260px;
    padding: 32px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 32px;
  }

  .header h2 {
    font-size: 24px;
    font-weight: 600;
  }

  .header-actions {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .user-menu {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: var(--bg-secondary);
    border-radius: 8px;
    color: var(--text-secondary);
    font-size: 14px;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    text-decoration: none;
  }

  .btn-primary {
    background: var(--accent-blue);
    color: white;
  }

  .btn-primary:hover {
    background: var(--accent-blue-hover);
  }

  .btn-outline {
    background: transparent;
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  .btn-outline:hover {
    background: var(--bg-tertiary);
  }

  .btn-danger {
    background: var(--accent-red);
    color: white;
  }

  .btn-danger:hover {
    background: #dc2626;
  }

  .btn-sm {
    padding: 6px 12px;
    font-size: 13px;
  }

  .card {
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 24px;
    border: 1px solid var(--border-color);
    margin-bottom: 24px;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .card-title {
    font-size: 16px;
    font-weight: 600;
  }

  .card-subtitle {
    font-size: 13px;
    color: var(--text-secondary);
    margin-top: 4px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 24px;
  }

  .stat-card {
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 20px;
    border: 1px solid var(--border-color);
  }

  .stat-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }

  .stat-value {
    font-size: 28px;
    font-weight: 700;
  }

  .stat-meta {
    font-size: 13px;
    color: var(--text-secondary);
    margin-top: 4px;
  }

  .table {
    width: 100%;
    border-collapse: collapse;
  }

  .table th,
  .table td {
    padding: 12px 16px;
    text-align: left;
    border-bottom: 1px solid var(--border-color);
  }

  .table th {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .table td {
    font-size: 14px;
  }

  .table tr:last-child td {
    border-bottom: none;
  }

  .table tr:hover td {
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
  .badge-active { background: #14532d; color: #86efac; }
  .badge-revoked { background: #7f1d1d; color: #fca5a5; }

  .code-block {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 16px;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 13px;
    overflow-x: auto;
    position: relative;
  }

  .code-block .copy-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 4px 8px;
    font-size: 11px;
  }

  .alert {
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 24px;
    font-size: 14px;
  }

  .alert-success {
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid var(--accent-green);
    color: #86efac;
  }

  .alert-warning {
    background: rgba(234, 179, 8, 0.1);
    border: 1px solid var(--accent-yellow);
    color: #fde047;
  }

  .alert-error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid var(--accent-red);
    color: #fca5a5;
  }

  .form-group {
    margin-bottom: 20px;
  }

  label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 8px;
    color: var(--text-secondary);
  }

  input[type="text"],
  input[type="email"],
  input[type="password"] {
    width: 100%;
    padding: 12px 16px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--text-primary);
    font-size: 15px;
  }

  input:focus {
    outline: none;
    border-color: var(--accent-blue);
  }

  .new-key-display {
    background: var(--bg-primary);
    border: 2px solid var(--accent-green);
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 20px;
  }

  .new-key-display p {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 12px;
  }

  .new-key-value {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 14px;
    word-break: break-all;
    background: var(--bg-secondary);
    padding: 12px;
    border-radius: 6px;
    border: 1px solid var(--border-color);
  }

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

  .progress-fill.green { background: var(--accent-green); }
  .progress-fill.yellow { background: var(--accent-yellow); }
  .progress-fill.red { background: var(--accent-red); }

  .loading-placeholder {
    text-align: center;
    padding: 32px;
    color: var(--text-secondary);
  }

  .empty-state {
    text-align: center;
    padding: 32px;
    color: var(--text-secondary);
  }

  .error-state {
    text-align: center;
    padding: 32px;
    color: var(--accent-red);
  }
`;

// =============================================================================
// Helper function to get sidebar HTML
// =============================================================================

function getSidebar(activePage: string, tenant: Tenant, urls: EnvironmentUrls) {
  return html`
    <aside class="sidebar">
      <div class="sidebar-logo">
        <h1>Unbrowser</h1>
        <span>Dashboard</span>
      </div>

      <nav>
        <div class="nav-section">
          <div class="nav-section-title">Overview</div>
          <a href="${urls.dashboard}" class="nav-link ${activePage === 'overview' ? 'active' : ''}">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
            </svg>
            Dashboard
          </a>
        </div>

        <div class="nav-section">
          <div class="nav-section-title">API</div>
          <a href="${urls.dashboardApiKeys}" class="nav-link ${activePage === 'api-keys' ? 'active' : ''}">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
            </svg>
            API Keys
          </a>
          <a href="${urls.dashboardUsage}" class="nav-link ${activePage === 'usage' ? 'active' : ''}">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
            Usage
          </a>
        </div>

        <div class="nav-section">
          <div class="nav-section-title">Account</div>
          <a href="${urls.dashboardSettings}" class="nav-link ${activePage === 'settings' ? 'active' : ''}">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            Settings
          </a>
          <a href="${urls.authLogout}" class="nav-link">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
            </svg>
            Logout
          </a>
        </div>

        <div class="nav-section">
          <div class="nav-section-title">Resources</div>
          <a href="${urls.docs}" class="nav-link" target="_blank">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
            Documentation
          </a>
          <a href="${urls.pricing}" class="nav-link" target="_blank">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Pricing
          </a>
        </div>
      </nav>

      <div style="padding: 24px; position: absolute; bottom: 0; left: 0; right: 0; border-top: 1px solid var(--border-color);">
        <div style="font-size: 12px; color: var(--text-muted);">Current Plan</div>
        <div style="font-size: 14px; font-weight: 600; margin-top: 4px;">${tenant.plan}</div>
        ${tenant.plan === 'FREE' ? html`
          <a href="${urls.pricing}" class="btn btn-primary btn-sm" style="margin-top: 12px; width: 100%;">Upgrade</a>
        ` : ''}
      </div>
    </aside>
  `;
}

// =============================================================================
// Dashboard Overview
// =============================================================================

/**
 * GET / - Dashboard overview
 */
dashboardUI.get('/', requireVerifiedEmail, async (c) => {
  const urls = getEnvironmentUrls(c.req);
  const tenant = c.get('sessionTenant');
  const welcome = c.req.query('welcome');

  return c.html(html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard - Unbrowser</title>
  <style>${dashboardStyles}</style>
</head>
<body>
  <div class="layout">
    ${getSidebar('overview', tenant, urls)}

    <main class="main">
      <div class="header">
        <h2>Dashboard</h2>
        <div class="header-actions">
          <div class="user-menu">
            ${tenant.name}
          </div>
        </div>
      </div>

      ${welcome ? html`
        <div class="alert alert-success">
          Welcome to Unbrowser! Get started by creating your first API key below.
        </div>
      ` : ''}

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Today's Requests</div>
          <div class="stat-value" id="todayRequests">-</div>
          <div class="stat-meta">of ${tenant.dailyLimit.toLocaleString()} limit</div>
        </div>

        <div class="stat-card">
          <div class="stat-label">This Month</div>
          <div class="stat-value" id="monthRequests">-</div>
          <div class="stat-meta">${tenant.monthlyLimit ? `of ${tenant.monthlyLimit.toLocaleString()} limit` : 'No monthly limit'}</div>
        </div>

        <div class="stat-card">
          <div class="stat-label">Current Plan</div>
          <div class="stat-value">${tenant.plan}</div>
          ${tenant.plan === 'FREE' ? html`
            <div class="stat-meta"><a href="${urls.pricing}" style="color: var(--accent-blue);">Upgrade</a></div>
          ` : ''}
        </div>

        <div class="stat-card">
          <div class="stat-label">API Keys</div>
          <div class="stat-value" id="apiKeyCount">-</div>
          <div class="stat-meta"><a href="${urls.dashboardApiKeys}" style="color: var(--accent-blue);">Manage</a></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Quick Start</h3>
            <p class="card-subtitle">Get started with Unbrowser in seconds</p>
          </div>
        </div>

        <div style="margin-top: 16px;">
          <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 16px;">
            First, create an API key from the <a href="${urls.dashboardApiKeys}" style="color: var(--accent-blue);">API Keys</a> page.
            Then use it in your requests:
          </p>

          <h4 style="font-size: 14px; margin-bottom: 8px;">cURL</h4>
          <div class="code-block">
<pre>curl -X POST https://api.unbrowser.ai/v1/browse \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'</pre>
          </div>

          <h4 style="font-size: 14px; margin: 24px 0 8px;">Node.js</h4>
          <div class="code-block">
<pre>import { createUnbrowser } from '@unbrowser/core';

const client = createUnbrowser({
  apiKey: 'YOUR_API_KEY',
});

const result = await client.browse('https://example.com');
console.log(result.content.markdown);</pre>
          </div>
        </div>
      </div>
    </main>
  </div>

  <script>
    // Fetch dashboard stats using safe DOM manipulation
    async function loadStats() {
      try {
        var response = await fetch('/v1/usage', {
          headers: { 'Accept': 'application/json' },
          credentials: 'include'
        });

        if (response.ok) {
          var data = await response.json();
          if (data.data) {
            document.getElementById('todayRequests').textContent =
              (data.data.today?.requests || 0).toLocaleString();
            document.getElementById('monthRequests').textContent =
              (data.data.month?.requests || 0).toLocaleString();
          }
        }
      } catch (e) {
        console.error('Failed to load stats:', e);
      }
    }

    document.getElementById('apiKeyCount').textContent = '-';
    loadStats();
  </script>
</body>
</html>`);
});

// =============================================================================
// API Keys Management
// =============================================================================

/**
 * GET /api-keys - API keys management page
 */
dashboardUI.get('/api-keys', requireVerifiedEmail, async (c) => {
  const urls = getEnvironmentUrls(c.req);
  const tenant = c.get('sessionTenant');
  const newKey = c.req.query('newKey');
  const error = c.req.query('error');
  const success = c.req.query('success');

  return c.html(html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API Keys - Unbrowser</title>
  <style>${dashboardStyles}</style>
</head>
<body>
  <div class="layout">
    ${getSidebar('api-keys', tenant, urls)}

    <main class="main">
      <div class="header">
        <h2>API Keys</h2>
        <div class="header-actions">
          <form method="POST" action="/dashboard/api-keys/create" style="display: inline;">
            <button type="submit" class="btn btn-primary">Create New Key</button>
          </form>
        </div>
      </div>

      ${error ? html`<div class="alert alert-error">${decodeURIComponent(error)}</div>` : ''}
      ${success ? html`<div class="alert alert-success">${decodeURIComponent(success)}</div>` : ''}

      ${newKey ? html`
        <div class="new-key-display">
          <p><strong>Important:</strong> Copy your API key now. You won't be able to see it again!</p>
          <div class="new-key-value" id="newKeyValue">${decodeURIComponent(newKey)}</div>
          <button onclick="copyKey()" class="btn btn-outline btn-sm" style="margin-top: 12px;">Copy to Clipboard</button>
        </div>
      ` : ''}

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Your API Keys</h3>
            <p class="card-subtitle">Manage your API keys for accessing the Unbrowser API</p>
          </div>
        </div>

        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Key Prefix</th>
              <th>Created</th>
              <th>Last Used</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="keysTableBody">
            <tr><td colspan="6" class="loading-placeholder">Loading...</td></tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <h3 class="card-title">Security Best Practices</h3>
        <ul style="margin-top: 16px; color: var(--text-secondary); font-size: 14px; line-height: 1.8;">
          <li>Never share your API keys publicly or commit them to version control</li>
          <li>Use environment variables to store your API keys</li>
          <li>Rotate keys regularly and revoke unused keys</li>
          <li>Use separate keys for development and production</li>
        </ul>
      </div>
    </main>
  </div>

  <script>
    ${newKey ? `
    function copyKey() {
      var keyValue = document.getElementById('newKeyValue').textContent;
      navigator.clipboard.writeText(keyValue).then(function() {
        alert('API key copied to clipboard!');
      });
    }
    ` : ''}

    // Helper to create table row with safe DOM methods
    function createTableRow(key) {
      var row = document.createElement('tr');

      // Name cell
      var nameCell = document.createElement('td');
      nameCell.textContent = key.name;
      row.appendChild(nameCell);

      // Prefix cell
      var prefixCell = document.createElement('td');
      prefixCell.style.fontFamily = 'Monaco, Menlo, monospace';
      prefixCell.style.fontSize = '13px';
      prefixCell.textContent = key.keyPrefix + '...';
      row.appendChild(prefixCell);

      // Created cell
      var createdCell = document.createElement('td');
      createdCell.textContent = new Date(key.createdAt).toLocaleDateString();
      row.appendChild(createdCell);

      // Last Used cell
      var lastUsedCell = document.createElement('td');
      lastUsedCell.textContent = key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never';
      row.appendChild(lastUsedCell);

      // Status cell
      var statusCell = document.createElement('td');
      var badge = document.createElement('span');
      badge.className = 'badge ' + (key.revokedAt ? 'badge-revoked' : 'badge-active');
      badge.textContent = key.revokedAt ? 'Revoked' : 'Active';
      statusCell.appendChild(badge);
      row.appendChild(statusCell);

      // Actions cell
      var actionsCell = document.createElement('td');
      if (!key.revokedAt) {
        var form = document.createElement('form');
        form.method = 'POST';
        form.action = '/dashboard/api-keys/' + key.id + '/revoke';
        form.style.display = 'inline';

        var btn = document.createElement('button');
        btn.type = 'submit';
        btn.className = 'btn btn-outline btn-sm';
        btn.textContent = 'Revoke';
        btn.onclick = function(e) {
          if (!confirm('Are you sure you want to revoke this API key? This cannot be undone.')) {
            e.preventDefault();
          }
        };

        form.appendChild(btn);
        actionsCell.appendChild(form);
      } else {
        actionsCell.textContent = '-';
        actionsCell.style.color = 'var(--text-muted)';
      }
      row.appendChild(actionsCell);

      return row;
    }

    // Helper to show empty state
    function showEmptyState(tbody) {
      var row = document.createElement('tr');
      var cell = document.createElement('td');
      cell.colSpan = 6;
      cell.className = 'empty-state';
      cell.textContent = 'No API keys yet. Create one to get started!';
      row.appendChild(cell);
      tbody.appendChild(row);
    }

    // Helper to show error state
    function showErrorState(tbody) {
      var row = document.createElement('tr');
      var cell = document.createElement('td');
      cell.colSpan = 6;
      cell.className = 'error-state';
      cell.textContent = 'Failed to load API keys';
      row.appendChild(cell);
      tbody.appendChild(row);
    }

    async function loadKeys() {
      var tbody = document.getElementById('keysTableBody');

      try {
        var response = await fetch('/dashboard/api-keys/list', {
          headers: { 'Accept': 'application/json' },
          credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to load keys');

        var data = await response.json();

        // Clear loading state
        while (tbody.firstChild) {
          tbody.removeChild(tbody.firstChild);
        }

        if (!data.keys || data.keys.length === 0) {
          showEmptyState(tbody);
          return;
        }

        data.keys.forEach(function(key) {
          tbody.appendChild(createTableRow(key));
        });
      } catch (e) {
        console.error('Failed to load keys:', e);
        while (tbody.firstChild) {
          tbody.removeChild(tbody.firstChild);
        }
        showErrorState(tbody);
      }
    }

    loadKeys();
  </script>
</body>
</html>`);
});

/**
 * GET /api-keys/list - List API keys (JSON)
 */
dashboardUI.get('/api-keys/list', requireVerifiedEmail, async (c) => {
  const tenant = c.get('sessionTenant');
  const apiKeyStore = getApiKeyStore();

  if (!apiKeyStore) {
    return c.json({ keys: [] });
  }

  // We need a method to list keys by tenant - for now return empty
  // This would be implemented in the ApiKeyStore interface
  return c.json({ keys: [] });
});

/**
 * POST /api-keys/create - Create new API key
 */
dashboardUI.post('/api-keys/create', requireVerifiedEmail, async (c) => {
  const tenant = c.get('sessionTenant');
  const apiKeyStore = getApiKeyStore();

  if (!apiKeyStore?.create) {
    return c.redirect('/dashboard/api-keys?error=' + encodeURIComponent('API key creation not available'));
  }

  try {
    const { key, keyHash, keyPrefix } = generateApiKey('live');

    await apiKeyStore.create({
      tenantId: tenant.id,
      keyHash,
      keyPrefix,
      name: `API Key ${new Date().toLocaleDateString()}`,
      permissions: ['browse', 'batch'],
    });

    return c.redirect('/dashboard/api-keys?newKey=' + encodeURIComponent(key));
  } catch (error) {
    console.error('[Dashboard] Failed to create API key:', error);
    return c.redirect('/dashboard/api-keys?error=' + encodeURIComponent('Failed to create API key'));
  }
});

/**
 * POST /api-keys/:id/revoke - Revoke an API key
 */
dashboardUI.post('/api-keys/:id/revoke', requireVerifiedEmail, async (c) => {
  const tenant = c.get('sessionTenant');
  const keyId = c.req.param('id');

  // Revoke implementation would go here
  // For now, just redirect back

  return c.redirect('/dashboard/api-keys?success=' + encodeURIComponent('API key revoked'));
});

// =============================================================================
// Usage Statistics
// =============================================================================

/**
 * GET /usage - Usage statistics page
 */
dashboardUI.get('/usage', requireVerifiedEmail, async (c) => {
  const urls = getEnvironmentUrls(c.req);
  const tenant = c.get('sessionTenant');

  return c.html(html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Usage - Unbrowser</title>
  <style>${dashboardStyles}</style>
</head>
<body>
  <div class="layout">
    ${getSidebar('usage', tenant, urls)}

    <main class="main">
      <div class="header">
        <h2>Usage Statistics</h2>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Today's Requests</div>
          <div class="stat-value" id="todayRequests">-</div>
          <div class="progress-bar">
            <div class="progress-fill green" id="todayProgress" style="width: 0%"></div>
          </div>
          <div class="stat-meta" id="todayMeta">of ${tenant.dailyLimit.toLocaleString()} daily limit</div>
        </div>

        <div class="stat-card">
          <div class="stat-label">Today's Units</div>
          <div class="stat-value" id="todayUnits">-</div>
          <div class="stat-meta">Weighted by tier</div>
        </div>

        <div class="stat-card">
          <div class="stat-label">This Month</div>
          <div class="stat-value" id="monthRequests">-</div>
          ${tenant.monthlyLimit ? html`
            <div class="progress-bar">
              <div class="progress-fill green" id="monthProgress" style="width: 0%"></div>
            </div>
            <div class="stat-meta" id="monthMeta">of ${tenant.monthlyLimit.toLocaleString()} monthly limit</div>
          ` : html`
            <div class="stat-meta">No monthly limit</div>
          `}
        </div>

        <div class="stat-card">
          <div class="stat-label">Monthly Units</div>
          <div class="stat-value" id="monthUnits">-</div>
          <div class="stat-meta">Weighted by tier</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Usage by Tier</h3>
            <p class="card-subtitle">How your requests are distributed across rendering tiers</p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 16px;">
          <div style="padding: 16px; background: var(--bg-tertiary); border-radius: 8px;">
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Intelligence</div>
            <div style="font-size: 24px; font-weight: 600; color: var(--accent-blue);" id="intelligenceTier">-</div>
            <div style="font-size: 13px; color: var(--text-secondary);">1 unit each</div>
          </div>
          <div style="padding: 16px; background: var(--bg-tertiary); border-radius: 8px;">
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Lightweight</div>
            <div style="font-size: 24px; font-weight: 600; color: var(--accent-green);" id="lightweightTier">-</div>
            <div style="font-size: 13px; color: var(--text-secondary);">5 units each</div>
          </div>
          <div style="padding: 16px; background: var(--bg-tertiary); border-radius: 8px;">
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Playwright</div>
            <div style="font-size: 24px; font-weight: 600; color: var(--accent-yellow);" id="playwrightTier">-</div>
            <div style="font-size: 13px; color: var(--text-secondary);">25 units each</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Understanding Units</h3>
          </div>
        </div>
        <div style="margin-top: 16px; color: var(--text-secondary); font-size: 14px; line-height: 1.8;">
          <p>Unbrowser uses a tiered pricing model based on the complexity of each request:</p>
          <ul style="margin-top: 12px;">
            <li><strong>Intelligence Tier (1 unit):</strong> Fastest option. Uses learned patterns and cached APIs.</li>
            <li><strong>Lightweight Tier (5 units):</strong> Server-side rendering for simple pages.</li>
            <li><strong>Playwright Tier (25 units):</strong> Full browser automation for complex sites.</li>
          </ul>
          <p style="margin-top: 12px;">As Unbrowser learns your browsing patterns, more requests will use the faster Intelligence tier, reducing your unit consumption over time.</p>
        </div>
      </div>
    </main>
  </div>

  <script>
    async function loadUsage() {
      try {
        var response = await fetch('/v1/usage', {
          headers: { 'Accept': 'application/json' },
          credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to load usage');

        var data = await response.json();

        if (data.data) {
          var d = data.data;

          // Today stats
          var todayReqs = d.today?.requests || 0;
          var todayUnits = d.today?.units || 0;
          var dailyLimit = ${tenant.dailyLimit};

          document.getElementById('todayRequests').textContent = todayReqs.toLocaleString();
          document.getElementById('todayUnits').textContent = todayUnits.toLocaleString();

          var todayPercent = Math.min(100, (todayReqs / dailyLimit) * 100);
          var progressEl = document.getElementById('todayProgress');
          progressEl.style.width = todayPercent + '%';
          if (todayPercent > 80) {
            progressEl.className = 'progress-fill red';
          } else if (todayPercent > 50) {
            progressEl.className = 'progress-fill yellow';
          }

          // Month stats
          var monthReqs = d.month?.requests || 0;
          var monthUnits = d.month?.units || 0;

          document.getElementById('monthRequests').textContent = monthReqs.toLocaleString();
          document.getElementById('monthUnits').textContent = monthUnits.toLocaleString();

          ${tenant.monthlyLimit ? `
          var monthlyLimit = ${tenant.monthlyLimit};
          var monthPercent = Math.min(100, (monthReqs / monthlyLimit) * 100);
          var monthProgressEl = document.getElementById('monthProgress');
          if (monthProgressEl) {
            monthProgressEl.style.width = monthPercent + '%';
            if (monthPercent > 80) {
              monthProgressEl.className = 'progress-fill red';
            } else if (monthPercent > 50) {
              monthProgressEl.className = 'progress-fill yellow';
            }
          }
          ` : ''}

          // Tier breakdown
          if (d.today?.byTier) {
            document.getElementById('intelligenceTier').textContent =
              (d.today.byTier.intelligence || 0).toLocaleString();
            document.getElementById('lightweightTier').textContent =
              (d.today.byTier.lightweight || 0).toLocaleString();
            document.getElementById('playwrightTier').textContent =
              (d.today.byTier.playwright || 0).toLocaleString();
          }
        }
      } catch (e) {
        console.error('Failed to load usage:', e);
      }
    }

    loadUsage();
  </script>
</body>
</html>`);
});

// =============================================================================
// Account Settings
// =============================================================================

/**
 * GET /settings - Account settings page
 */
dashboardUI.get('/settings', async (c) => {
  const urls = getEnvironmentUrls(c.req);
  const tenant = c.get('sessionTenant');
  const success = c.req.query('success');
  const error = c.req.query('error');

  return c.html(html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Settings - Unbrowser</title>
  <style>${dashboardStyles}</style>
</head>
<body>
  <div class="layout">
    ${getSidebar('settings', tenant, urls)}

    <main class="main">
      <div class="header">
        <h2>Account Settings</h2>
      </div>

      ${error ? html`<div class="alert alert-error">${decodeURIComponent(error)}</div>` : ''}
      ${success ? html`<div class="alert alert-success">${decodeURIComponent(success)}</div>` : ''}

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Profile</h3>
            <p class="card-subtitle">Update your account information</p>
          </div>
        </div>

        <form method="POST" action="/dashboard/settings/profile">
          <div class="form-group">
            <label for="name">Full Name</label>
            <input type="text" id="name" name="name" value="${tenant.name}" required>
          </div>

          <div class="form-group">
            <label for="email">Email</label>
            <input type="email" id="email" name="email" value="${tenant.email}" disabled>
            <p style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
              Contact support to change your email address
            </p>
          </div>

          <button type="submit" class="btn btn-primary">Save Changes</button>
        </form>
      </div>

      ${tenant.passwordHash ? html`
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Change Password</h3>
              <p class="card-subtitle">Update your password</p>
            </div>
          </div>

          <form method="POST" action="/dashboard/settings/password">
            <div class="form-group">
              <label for="currentPassword">Current Password</label>
              <input type="password" id="currentPassword" name="currentPassword" required>
            </div>

            <div class="form-group">
              <label for="newPassword">New Password</label>
              <input type="password" id="newPassword" name="newPassword" required minlength="8">
              <p style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
                At least 8 characters with uppercase, lowercase, and number
              </p>
            </div>

            <div class="form-group">
              <label for="confirmPassword">Confirm New Password</label>
              <input type="password" id="confirmPassword" name="confirmPassword" required>
            </div>

            <button type="submit" class="btn btn-primary">Update Password</button>
          </form>
        </div>
      ` : ''}

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Plan Details</h3>
            <p class="card-subtitle">Your current subscription</p>
          </div>
        </div>

        <div style="margin-top: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px; background: var(--bg-tertiary); border-radius: 8px;">
            <div>
              <div style="font-size: 12px; color: var(--text-muted);">Current Plan</div>
              <div style="font-size: 20px; font-weight: 600; margin-top: 4px;">${tenant.plan}</div>
            </div>
            <div>
              <div style="font-size: 12px; color: var(--text-muted);">Daily Limit</div>
              <div style="font-size: 20px; font-weight: 600; margin-top: 4px;">${tenant.dailyLimit.toLocaleString()}</div>
            </div>
            <div>
              <div style="font-size: 12px; color: var(--text-muted);">Monthly Limit</div>
              <div style="font-size: 20px; font-weight: 600; margin-top: 4px;">${tenant.monthlyLimit ? tenant.monthlyLimit.toLocaleString() : 'Unlimited'}</div>
            </div>
          </div>

          ${tenant.plan === 'FREE' ? html`
            <div style="margin-top: 16px;">
              <a href="${urls.pricing}" class="btn btn-primary">Upgrade Your Plan</a>
            </div>
          ` : ''}
        </div>
      </div>

      <div class="card" style="border-color: var(--accent-red);">
        <div class="card-header">
          <div>
            <h3 class="card-title" style="color: var(--accent-red);">Danger Zone</h3>
            <p class="card-subtitle">Irreversible actions</p>
          </div>
        </div>

        <div style="margin-top: 16px;">
          <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 16px;">
            Once you delete your account, there is no going back. All your data, API keys, and usage history will be permanently deleted.
          </p>
          <button onclick="confirmDelete()" class="btn btn-danger">Delete Account</button>
        </div>
      </div>
    </main>
  </div>

  <script>
    function confirmDelete() {
      if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
        if (confirm('This will permanently delete all your data. Type DELETE to confirm.')) {
          // Would submit form to delete endpoint
          alert('Account deletion would be processed here');
        }
      }
    }
  </script>
</body>
</html>`);
});

/**
 * POST /settings/profile - Update profile
 */
dashboardUI.post('/settings/profile', async (c) => {
  const tenant = c.get('sessionTenant');
  const tenantStore = getTenantStore();

  if (!tenantStore) {
    return c.redirect('/dashboard/settings?error=' + encodeURIComponent('Failed to update profile'));
  }

  const body = await c.req.parseBody();
  const name = String(body.name || '').trim();

  if (!name) {
    return c.redirect('/dashboard/settings?error=' + encodeURIComponent('Name is required'));
  }

  try {
    await tenantStore.update(tenant.id, { name });
    return c.redirect('/dashboard/settings?success=' + encodeURIComponent('Profile updated successfully'));
  } catch (error) {
    console.error('[Dashboard] Failed to update profile:', error);
    return c.redirect('/dashboard/settings?error=' + encodeURIComponent('Failed to update profile'));
  }
});

/**
 * POST /settings/password - Change password
 */
dashboardUI.post('/settings/password', async (c) => {
  const tenant = c.get('sessionTenant');
  const tenantStore = getTenantStore();

  if (!tenantStore || !tenant.passwordHash) {
    return c.redirect('/dashboard/settings?error=' + encodeURIComponent('Password change not available'));
  }

  const body = await c.req.parseBody();
  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');
  const confirmPassword = String(body.confirmPassword || '');

  // Import password functions
  const { verifyPassword, hashPassword, validatePasswordStrength } = await import('../services/password.js');

  // Verify current password
  const isValid = await verifyPassword(tenant.passwordHash, currentPassword);
  if (!isValid) {
    return c.redirect('/dashboard/settings?error=' + encodeURIComponent('Current password is incorrect'));
  }

  // Validate new password
  if (newPassword !== confirmPassword) {
    return c.redirect('/dashboard/settings?error=' + encodeURIComponent('New passwords do not match'));
  }

  const validation = validatePasswordStrength(newPassword);
  if (!validation.valid) {
    return c.redirect('/dashboard/settings?error=' + encodeURIComponent(validation.errors.join('. ')));
  }

  try {
    const newHash = await hashPassword(newPassword);
    await tenantStore.setPasswordHash(tenant.id, newHash);
    return c.redirect('/dashboard/settings?success=' + encodeURIComponent('Password updated successfully'));
  } catch (error) {
    console.error('[Dashboard] Failed to change password:', error);
    return c.redirect('/dashboard/settings?error=' + encodeURIComponent('Failed to update password'));
  }
});
