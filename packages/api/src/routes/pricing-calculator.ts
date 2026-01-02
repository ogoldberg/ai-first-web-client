/**
 * Pricing Calculator (API-016)
 *
 * Interactive tool for estimating costs based on usage patterns.
 * Helps users understand pricing tiers and choose the right plan.
 */

import { Hono } from 'hono';
import { html } from 'hono/html';
import { getEnvironmentUrls, type EnvironmentUrls } from '../utils/url-helpers.js';

export const pricingCalculator = new Hono();

// Pricing constants (kept in sync with PRICING.md)
const PRICING = {
  tiers: {
    FREE: {
      name: 'Free',
      baseFee: 0,
      dailyLimit: 100,
      monthlyLimit: 3000, // ~100/day * 30
      ratePerThousandUnits: 0,
      playwrightEnabled: false,
      patterns: 10,
      sessions: 1,
    },
    STARTER: {
      name: 'Starter',
      baseFee: 29, // Minimum
      dailyLimit: 1000,
      monthlyLimit: 30000,
      ratePerThousandUnits: 0.50,
      playwrightEnabled: true,
      patterns: 100,
      sessions: 5,
    },
    TEAM: {
      name: 'Team',
      baseFee: 250, // Minimum
      dailyLimit: 10000,
      monthlyLimit: 300000,
      ratePerThousandUnits: 0.40,
      playwrightEnabled: true,
      patterns: 1000,
      sessions: 20,
    },
    ENTERPRISE: {
      name: 'Enterprise',
      baseFee: null, // Custom
      dailyLimit: null, // Custom
      monthlyLimit: null, // Custom
      ratePerThousandUnits: null, // Custom
      playwrightEnabled: true,
      patterns: null, // Unlimited
      sessions: null, // Unlimited
    },
  },
  unitCosts: {
    intelligence: 1,
    lightweight: 5,
    playwright: 25,
  },
  overageMultipliers: {
    STARTER: 1.5,
    TEAM: 1.25,
  },
};

/**
 * GET / - Serve the pricing calculator HTML
 */
pricingCalculator.get('/', (c) => {
  const urls = getEnvironmentUrls(c.req);
  return c.html(getPricingCalculatorHTML(urls));
});

/**
 * POST /calculate - API endpoint for programmatic calculations
 */
pricingCalculator.post('/calculate', async (c) => {
  const body = await c.req.json();
  const {
    intelligenceRequests = 0,
    lightweightRequests = 0,
    playwrightRequests = 0,
  } = body;

  const totalRequests = intelligenceRequests + lightweightRequests + playwrightRequests;
  const totalUnits =
    intelligenceRequests * PRICING.unitCosts.intelligence +
    lightweightRequests * PRICING.unitCosts.lightweight +
    playwrightRequests * PRICING.unitCosts.playwright;

  // Calculate cost for each tier
  const calculations = Object.entries(PRICING.tiers).map(([tierId, tier]) => {
    if (tier.baseFee === null) {
      return {
        tier: tierId,
        name: tier.name,
        eligible: true,
        monthlyCost: null,
        breakdown: null,
        recommendation: 'Contact sales for custom pricing',
      };
    }

    // Check if Playwright is needed but not available
    if (playwrightRequests > 0 && !tier.playwrightEnabled) {
      return {
        tier: tierId,
        name: tier.name,
        eligible: false,
        reason: 'Playwright tier not available',
        monthlyCost: null,
      };
    }

    // Calculate units cost
    const unitsCost = (totalUnits / 1000) * tier.ratePerThousandUnits;
    const monthlyCost = tier.baseFee + unitsCost;

    // Check if within limits
    const withinLimits = tier.monthlyLimit === null || totalRequests <= tier.monthlyLimit;

    let recommendation = '';
    if (!withinLimits) {
      const overage = totalRequests - tier.monthlyLimit;
      const overageMultiplier = PRICING.overageMultipliers[tierId as keyof typeof PRICING.overageMultipliers] || 1;
      const overageUnits = (overage / totalRequests) * totalUnits;
      const overageCost = (overageUnits / 1000) * tier.ratePerThousandUnits * overageMultiplier;
      recommendation = `Exceeds limit by ${overage.toLocaleString()} requests. Consider upgrading.`;
      return {
        tier: tierId,
        name: tier.name,
        eligible: true,
        withinLimits: false,
        monthlyCost: monthlyCost + overageCost,
        overageCost,
        recommendation,
        breakdown: {
          baseFee: tier.baseFee,
          unitsCost,
          overageCost,
          totalUnits,
        },
      };
    }

    return {
      tier: tierId,
      name: tier.name,
      eligible: true,
      withinLimits: true,
      monthlyCost,
      breakdown: {
        baseFee: tier.baseFee,
        unitsCost,
        totalUnits,
      },
    };
  });

  // Find recommended tier (cheapest eligible with limits)
  const eligibleWithLimits = calculations.filter(c => c.eligible && c.withinLimits && c.monthlyCost !== null);
  const recommended = eligibleWithLimits.length > 0
    ? eligibleWithLimits.reduce((a, b) => (a.monthlyCost! < b.monthlyCost! ? a : b))
    : calculations.find(c => c.tier === 'ENTERPRISE');

  return c.json({
    success: true,
    data: {
      input: {
        intelligenceRequests,
        lightweightRequests,
        playwrightRequests,
        totalRequests,
        totalUnits,
      },
      calculations,
      recommended: recommended?.tier || 'ENTERPRISE',
    },
  });
});

/**
 * Generate the pricing calculator HTML.
 * Uses safe DOM manipulation in JavaScript - no innerHTML with dynamic content.
 */
function getPricingCalculatorHTML(urls: EnvironmentUrls) {
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unbrowser Pricing Calculator</title>
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
      line-height: 1.6;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 24px;
    }

    header {
      text-align: center;
      margin-bottom: 48px;
    }

    h1 {
      font-size: 36px;
      font-weight: 700;
      margin-bottom: 16px;
      background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .subtitle {
      color: var(--text-secondary);
      font-size: 18px;
      max-width: 600px;
      margin: 0 auto;
    }

    .calculator-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      margin-bottom: 48px;
    }

    @media (max-width: 900px) {
      .calculator-grid {
        grid-template-columns: 1fr;
      }
    }

    .card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 24px;
    }

    .card-title {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .card-title-icon {
      width: 32px;
      height: 32px;
      background: var(--accent-blue);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    }

    .input-group {
      margin-bottom: 24px;
    }

    .input-label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .input-label-text {
      font-weight: 500;
    }

    .input-label-hint {
      color: var(--text-secondary);
      font-size: 13px;
    }

    .tier-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
    }

    .tier-badge.intelligence {
      background: rgba(34, 197, 94, 0.2);
      color: var(--accent-green);
    }

    .tier-badge.lightweight {
      background: rgba(234, 179, 8, 0.2);
      color: var(--accent-yellow);
    }

    .tier-badge.playwright {
      background: rgba(168, 85, 247, 0.2);
      color: var(--accent-purple);
    }

    .input-wrapper {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .range-input {
      flex: 1;
      -webkit-appearance: none;
      height: 8px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      outline: none;
    }

    .range-input::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 20px;
      height: 20px;
      background: var(--accent-blue);
      border-radius: 50%;
      cursor: pointer;
      transition: transform 0.2s;
    }

    .range-input::-webkit-slider-thumb:hover {
      transform: scale(1.1);
    }

    .number-input {
      width: 120px;
      padding: 10px 12px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: var(--text-primary);
      font-size: 14px;
      text-align: right;
    }

    .number-input:focus {
      outline: none;
      border-color: var(--accent-blue);
    }

    .tier-distribution {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid var(--border-color);
    }

    .distribution-bar {
      height: 24px;
      border-radius: 6px;
      display: flex;
      overflow: hidden;
      margin-bottom: 16px;
    }

    .distribution-segment {
      transition: width 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
      min-width: 0;
    }

    .distribution-segment.intelligence {
      background: var(--accent-green);
    }

    .distribution-segment.lightweight {
      background: var(--accent-yellow);
      color: #000;
    }

    .distribution-segment.playwright {
      background: var(--accent-purple);
    }

    .distribution-legend {
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }

    .legend-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }

    .legend-dot.intelligence {
      background: var(--accent-green);
    }

    .legend-dot.lightweight {
      background: var(--accent-yellow);
    }

    .legend-dot.playwright {
      background: var(--accent-purple);
    }

    .results-card {
      background: linear-gradient(135deg, var(--bg-secondary), var(--bg-tertiary));
    }

    .summary-stats {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat-box {
      background: var(--bg-primary);
      padding: 16px;
      border-radius: 8px;
      text-align: center;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: var(--accent-blue);
    }

    .stat-label {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 4px;
    }

    .tier-results {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .tier-result {
      background: var(--bg-primary);
      padding: 16px;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border: 2px solid transparent;
      transition: border-color 0.2s;
    }

    .tier-result.recommended {
      border-color: var(--accent-green);
    }

    .tier-result.ineligible {
      opacity: 0.5;
    }

    .tier-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .tier-name {
      font-weight: 600;
    }

    .tier-tag {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .tier-tag.recommended {
      background: var(--accent-green);
      color: #000;
    }

    .tier-tag.exceeds {
      background: var(--accent-yellow);
      color: #000;
    }

    .tier-tag.ineligible {
      background: var(--accent-red);
      color: #fff;
    }

    .tier-price {
      text-align: right;
    }

    .tier-price-value {
      font-size: 20px;
      font-weight: 700;
    }

    .tier-price-period {
      font-size: 12px;
      color: var(--text-secondary);
    }

    .tier-details {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 4px;
    }

    .presets {
      margin-bottom: 32px;
    }

    .presets-title {
      font-size: 14px;
      color: var(--text-secondary);
      margin-bottom: 12px;
    }

    .preset-buttons {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .preset-btn {
      padding: 8px 16px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: var(--text-primary);
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .preset-btn:hover {
      background: var(--accent-blue);
      border-color: var(--accent-blue);
    }

    .info-section {
      margin-top: 48px;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
    }

    @media (max-width: 900px) {
      .info-grid {
        grid-template-columns: 1fr;
      }
    }

    .info-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 24px;
    }

    .info-card h3 {
      font-size: 16px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .info-card p {
      color: var(--text-secondary);
      font-size: 14px;
    }

    .info-card ul {
      color: var(--text-secondary);
      font-size: 14px;
      margin-top: 12px;
      padding-left: 20px;
    }

    .info-card li {
      margin-bottom: 6px;
    }

    .cta-section {
      text-align: center;
      margin-top: 48px;
      padding: 48px;
      background: var(--bg-secondary);
      border-radius: 16px;
    }

    .cta-section h2 {
      font-size: 28px;
      margin-bottom: 16px;
    }

    .cta-section p {
      color: var(--text-secondary);
      margin-bottom: 24px;
    }

    .cta-buttons {
      display: flex;
      gap: 16px;
      justify-content: center;
    }

    .cta-btn {
      padding: 14px 32px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s;
    }

    .cta-btn.primary {
      background: var(--accent-blue);
      color: white;
      border: none;
    }

    .cta-btn.primary:hover {
      background: #2563eb;
    }

    .cta-btn.secondary {
      background: transparent;
      color: var(--text-primary);
      border: 1px solid var(--border-color);
    }

    .cta-btn.secondary:hover {
      border-color: var(--accent-blue);
      color: var(--accent-blue);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Pricing Calculator</h1>
      <p class="subtitle">Estimate your monthly costs based on expected usage. Adjust the sliders or enter values directly.</p>
    </header>

    <div class="calculator-grid">
      <div class="card">
        <h2 class="card-title">
          <span class="card-title-icon">1</span>
          Configure Your Usage
        </h2>

        <div class="presets">
          <div class="presets-title">Quick presets:</div>
          <div class="preset-buttons" id="preset-buttons"></div>
        </div>

        <div class="input-group">
          <div class="input-label">
            <span class="input-label-text">Intelligence Tier Requests</span>
            <span class="tier-badge intelligence">1 unit each</span>
          </div>
          <div class="input-label">
            <span class="input-label-hint">Fast static content, API responses, cached patterns</span>
          </div>
          <div class="input-wrapper">
            <input type="range" class="range-input" id="intelligence-range" min="0" max="100000" value="5000">
            <input type="number" class="number-input" id="intelligence-input" value="5000" min="0" max="1000000">
          </div>
        </div>

        <div class="input-group">
          <div class="input-label">
            <span class="input-label-text">Lightweight Tier Requests</span>
            <span class="tier-badge lightweight">5 units each</span>
          </div>
          <div class="input-label">
            <span class="input-label-hint">Basic JavaScript rendering, linkedom parsing</span>
          </div>
          <div class="input-wrapper">
            <input type="range" class="range-input" id="lightweight-range" min="0" max="50000" value="2000">
            <input type="number" class="number-input" id="lightweight-input" value="2000" min="0" max="500000">
          </div>
        </div>

        <div class="input-group">
          <div class="input-label">
            <span class="input-label-text">Playwright Tier Requests</span>
            <span class="tier-badge playwright">25 units each</span>
          </div>
          <div class="input-label">
            <span class="input-label-hint">Full browser rendering, complex SPAs, interactions</span>
          </div>
          <div class="input-wrapper">
            <input type="range" class="range-input" id="playwright-range" min="0" max="10000" value="500">
            <input type="number" class="number-input" id="playwright-input" value="500" min="0" max="100000">
          </div>
        </div>

        <div class="tier-distribution">
          <div class="distribution-bar" id="distribution-bar">
            <div class="distribution-segment intelligence" id="dist-intelligence"></div>
            <div class="distribution-segment lightweight" id="dist-lightweight"></div>
            <div class="distribution-segment playwright" id="dist-playwright"></div>
          </div>
          <div class="distribution-legend">
            <div class="legend-item">
              <span class="legend-dot intelligence"></span>
              <span id="legend-intelligence">Intelligence: 66%</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot lightweight"></span>
              <span id="legend-lightweight">Lightweight: 27%</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot playwright"></span>
              <span id="legend-playwright">Playwright: 7%</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card results-card">
        <h2 class="card-title">
          <span class="card-title-icon">2</span>
          Estimated Costs
        </h2>

        <div class="summary-stats">
          <div class="stat-box">
            <div class="stat-value" id="total-requests">7,500</div>
            <div class="stat-label">Total Requests/Month</div>
          </div>
          <div class="stat-box">
            <div class="stat-value" id="total-units">27,500</div>
            <div class="stat-label">Total Units</div>
          </div>
        </div>

        <div class="tier-results" id="tier-results"></div>
      </div>
    </div>

    <div class="info-section">
      <div class="info-grid">
        <div class="info-card">
          <h3>How Units Work</h3>
          <p>Requests are billed based on the rendering tier used. The system automatically chooses the fastest tier that works for each URL.</p>
          <ul>
            <li><strong>Intelligence (1 unit):</strong> Direct API calls, cached patterns</li>
            <li><strong>Lightweight (5 units):</strong> Simple JavaScript sites</li>
            <li><strong>Playwright (25 units):</strong> Complex SPAs, logins</li>
          </ul>
        </div>

        <div class="info-card">
          <h3>Typical Distribution</h3>
          <p>For most use cases, Unbrowser's learning system optimizes your tier usage over time:</p>
          <ul>
            <li><strong>Week 1:</strong> ~50% Playwright while learning</li>
            <li><strong>Month 1:</strong> ~20% Playwright</li>
            <li><strong>Steady state:</strong> ~5-10% Playwright</li>
          </ul>
        </div>

        <div class="info-card">
          <h3>Cost Optimization Tips</h3>
          <p>Maximize value with these strategies:</p>
          <ul>
            <li>Use batch requests for better pattern learning</li>
            <li>Enable pattern sharing (Team/Enterprise)</li>
            <li>Let the system learn before scaling up</li>
            <li>Use content intelligence hints when available</li>
          </ul>
        </div>
      </div>
    </div>

    <div class="cta-section">
      <h2>Ready to get started?</h2>
      <p>Start with our free tier to see how Unbrowser works with your use case.</p>
      <div class="cta-buttons">
        <a href="${urls.docs}" class="cta-btn primary">View Documentation</a>
        <a href="mailto:sales@unbrowser.ai" class="cta-btn secondary">Contact Sales</a>
      </div>
    </div>
  </div>

  <script>
    // Pricing constants
    var PRICING = {
      tiers: {
        FREE: { name: 'Free', baseFee: 0, monthlyLimit: 3000, rate: 0, playwrightEnabled: false },
        STARTER: { name: 'Starter', baseFee: 29, monthlyLimit: 30000, rate: 0.50, playwrightEnabled: true },
        TEAM: { name: 'Team', baseFee: 250, monthlyLimit: 300000, rate: 0.40, playwrightEnabled: true },
        ENTERPRISE: { name: 'Enterprise', baseFee: null, monthlyLimit: null, rate: null, playwrightEnabled: true }
      },
      unitCosts: { intelligence: 1, lightweight: 5, playwright: 25 },
      overageMultipliers: { STARTER: 1.5, TEAM: 1.25 }
    };

    // Presets
    var PRESETS = {
      hobby: { intelligence: 500, lightweight: 200, playwright: 50, label: 'Hobby Project' },
      startup: { intelligence: 5000, lightweight: 2000, playwright: 500, label: 'Startup' },
      growth: { intelligence: 25000, lightweight: 10000, playwright: 2000, label: 'Growth' },
      enterprise: { intelligence: 100000, lightweight: 50000, playwright: 10000, label: 'Enterprise' }
    };

    // Initialize preset buttons using safe DOM methods
    function initPresetButtons() {
      var container = document.getElementById('preset-buttons');
      var presetKeys = Object.keys(PRESETS);
      for (var i = 0; i < presetKeys.length; i++) {
        var key = presetKeys[i];
        var preset = PRESETS[key];
        var btn = document.createElement('button');
        btn.className = 'preset-btn';
        btn.textContent = preset.label;
        btn.setAttribute('data-preset', key);
        btn.addEventListener('click', function(e) {
          var presetKey = e.target.getAttribute('data-preset');
          applyPreset(presetKey);
        });
        container.appendChild(btn);
      }
    }

    function applyPreset(name) {
      var preset = PRESETS[name];
      if (!preset) return;

      document.getElementById('intelligence-input').value = preset.intelligence;
      document.getElementById('intelligence-range').value = Math.min(preset.intelligence, 100000);
      document.getElementById('lightweight-input').value = preset.lightweight;
      document.getElementById('lightweight-range').value = Math.min(preset.lightweight, 50000);
      document.getElementById('playwright-input').value = preset.playwright;
      document.getElementById('playwright-range').value = Math.min(preset.playwright, 10000);

      calculate();
    }

    function syncInput(tier) {
      var range = document.getElementById(tier + '-range');
      var input = document.getElementById(tier + '-input');
      input.value = range.value;
      calculate();
    }

    function syncRange(tier) {
      var range = document.getElementById(tier + '-range');
      var input = document.getElementById(tier + '-input');
      range.value = Math.min(parseInt(input.value) || 0, parseInt(range.max));
      calculate();
    }

    function calculate() {
      var intelligence = parseInt(document.getElementById('intelligence-input').value) || 0;
      var lightweight = parseInt(document.getElementById('lightweight-input').value) || 0;
      var playwright = parseInt(document.getElementById('playwright-input').value) || 0;

      var totalRequests = intelligence + lightweight + playwright;
      var totalUnits =
        intelligence * PRICING.unitCosts.intelligence +
        lightweight * PRICING.unitCosts.lightweight +
        playwright * PRICING.unitCosts.playwright;

      // Update summary stats
      document.getElementById('total-requests').textContent = totalRequests.toLocaleString();
      document.getElementById('total-units').textContent = totalUnits.toLocaleString();

      // Update distribution bar
      if (totalRequests > 0) {
        var intPct = Math.round(intelligence / totalRequests * 100);
        var lightPct = Math.round(lightweight / totalRequests * 100);
        var playPct = Math.round(playwright / totalRequests * 100);

        document.getElementById('dist-intelligence').style.width = intPct + '%';
        document.getElementById('dist-lightweight').style.width = lightPct + '%';
        document.getElementById('dist-playwright').style.width = playPct + '%';

        document.getElementById('legend-intelligence').textContent = 'Intelligence: ' + intPct + '%';
        document.getElementById('legend-lightweight').textContent = 'Lightweight: ' + lightPct + '%';
        document.getElementById('legend-playwright').textContent = 'Playwright: ' + playPct + '%';
      }

      // Calculate tier costs
      var results = [];
      var recommendedTier = null;
      var lowestCost = Infinity;

      var tierKeys = Object.keys(PRICING.tiers);
      for (var i = 0; i < tierKeys.length; i++) {
        var tierId = tierKeys[i];
        var tier = PRICING.tiers[tierId];
        var result = { tierId: tierId, name: tier.name };

        // Check Playwright requirement
        if (playwright > 0 && !tier.playwrightEnabled) {
          result.ineligible = true;
          result.reason = 'Playwright not available';
          results.push(result);
          continue;
        }

        // Enterprise - custom pricing
        if (tier.baseFee === null) {
          result.custom = true;
          results.push(result);
          continue;
        }

        // Calculate cost
        var unitsCost = (totalUnits / 1000) * tier.rate;
        var monthlyCost = tier.baseFee + unitsCost;

        result.baseFee = tier.baseFee;
        result.unitsCost = unitsCost;
        result.withinLimits = totalRequests <= tier.monthlyLimit;

        if (!result.withinLimits) {
          var overage = totalRequests - tier.monthlyLimit;
          var multiplier = PRICING.overageMultipliers[tierId] || 1;
          var overageUnits = (overage / totalRequests) * totalUnits;
          result.overageCost = (overageUnits / 1000) * tier.rate * multiplier;
          monthlyCost += result.overageCost;
          result.exceedsBy = overage;
        }

        result.monthlyCost = monthlyCost;
        results.push(result);

        // Track recommended (cheapest within limits)
        if (result.withinLimits && monthlyCost < lowestCost) {
          lowestCost = monthlyCost;
          recommendedTier = tierId;
        }
      }

      // If nothing within limits, recommend upgrade or enterprise
      if (!recommendedTier) {
        var inLimitsResults = results.filter(function(r) { return r.withinLimits; });
        if (inLimitsResults.length === 0) {
          recommendedTier = 'ENTERPRISE';
        }
      }

      // Render results using safe DOM methods
      var container = document.getElementById('tier-results');
      // Clear existing children safely
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }

      for (var j = 0; j < results.length; j++) {
        var res = results[j];
        var div = document.createElement('div');
        div.className = 'tier-result';

        if (res.ineligible) {
          div.className += ' ineligible';
        } else if (res.tierId === recommendedTier) {
          div.className += ' recommended';
        }

        var leftDiv = document.createElement('div');
        leftDiv.className = 'tier-info';

        var nameSpan = document.createElement('span');
        nameSpan.className = 'tier-name';
        nameSpan.textContent = res.name;
        leftDiv.appendChild(nameSpan);

        if (res.tierId === recommendedTier) {
          var tag = document.createElement('span');
          tag.className = 'tier-tag recommended';
          tag.textContent = 'Best Value';
          leftDiv.appendChild(tag);
        } else if (res.exceedsBy) {
          var tagExceeds = document.createElement('span');
          tagExceeds.className = 'tier-tag exceeds';
          tagExceeds.textContent = 'Exceeds Limit';
          leftDiv.appendChild(tagExceeds);
        } else if (res.ineligible) {
          var tagIneligible = document.createElement('span');
          tagIneligible.className = 'tier-tag ineligible';
          tagIneligible.textContent = res.reason;
          leftDiv.appendChild(tagIneligible);
        }

        div.appendChild(leftDiv);

        var rightDiv = document.createElement('div');
        rightDiv.className = 'tier-price';

        if (res.custom) {
          var valueSpanCustom = document.createElement('div');
          valueSpanCustom.className = 'tier-price-value';
          valueSpanCustom.textContent = 'Custom';
          rightDiv.appendChild(valueSpanCustom);

          var periodSpanCustom = document.createElement('div');
          periodSpanCustom.className = 'tier-price-period';
          periodSpanCustom.textContent = 'Contact sales';
          rightDiv.appendChild(periodSpanCustom);
        } else if (!res.ineligible) {
          var valueSpan = document.createElement('div');
          valueSpan.className = 'tier-price-value';
          valueSpan.textContent = '$' + res.monthlyCost.toFixed(2);
          rightDiv.appendChild(valueSpan);

          var periodSpan = document.createElement('div');
          periodSpan.className = 'tier-price-period';
          periodSpan.textContent = '/month';
          rightDiv.appendChild(periodSpan);

          if (res.baseFee > 0) {
            var detailsSpan = document.createElement('div');
            detailsSpan.className = 'tier-details';
            var details = '$' + res.baseFee + ' base + $' + res.unitsCost.toFixed(2) + ' usage';
            if (res.overageCost) {
              details += ' + $' + res.overageCost.toFixed(2) + ' overage';
            }
            detailsSpan.textContent = details;
            rightDiv.appendChild(detailsSpan);
          }
        }

        div.appendChild(rightDiv);
        container.appendChild(div);
      }
    }

    // Set up event listeners
    function initEventListeners() {
      var tiers = ['intelligence', 'lightweight', 'playwright'];
      for (var i = 0; i < tiers.length; i++) {
        var tier = tiers[i];
        (function(t) {
          document.getElementById(t + '-range').addEventListener('input', function() {
            syncInput(t);
          });
          document.getElementById(t + '-input').addEventListener('input', function() {
            syncRange(t);
          });
        })(tier);
      }
    }

    // Initialize
    document.addEventListener('DOMContentLoaded', function() {
      initPresetButtons();
      initEventListeners();
      calculate();
    });
  </script>
</body>
</html>`;
}
