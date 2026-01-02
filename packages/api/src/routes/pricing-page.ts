/**
 * Pricing Page
 *
 * Comprehensive pricing information with plan comparison,
 * features breakdown, and FAQ.
 */

import { Hono } from 'hono';
import { html } from 'hono/html';
import { getEnvironmentUrls } from '../utils/url-helpers.js';

export const pricingPage = new Hono();

const pricingStyles = `
  :root {
    --bg-primary: #030712;
    --bg-secondary: #0f172a;
    --bg-tertiary: #1e293b;
    --text-primary: #f8fafc;
    --text-secondary: #94a3b8;
    --text-muted: #64748b;
    --accent-primary: #6366f1;
    --accent-secondary: #8b5cf6;
    --accent-tertiary: #a855f7;
    --accent-green: #10b981;
    --accent-yellow: #f59e0b;
    --border-color: rgba(148, 163, 184, 0.1);
    --border-glow: rgba(99, 102, 241, 0.3);
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html {
    scroll-behavior: smooth;
  }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    line-height: 1.6;
    overflow-x: hidden;
  }

  /* Gradient background */
  .gradient-bg {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: -1;
    background:
      radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99, 102, 241, 0.15), transparent),
      radial-gradient(ellipse 60% 40% at 80% 50%, rgba(139, 92, 246, 0.1), transparent);
    pointer-events: none;
  }

  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 24px;
  }

  /* Navigation */
  nav {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    background: rgba(3, 7, 18, 0.8);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border-color);
  }

  .nav-inner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 24px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .nav-logo {
    font-size: 22px;
    font-weight: 700;
    text-decoration: none;
    letter-spacing: -0.5px;
    background: linear-gradient(135deg, #fff 0%, #a5b4fc 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .nav-links {
    display: flex;
    gap: 32px;
    align-items: center;
  }

  .nav-links a {
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    transition: color 0.3s ease;
    position: relative;
  }

  .nav-links a:not(.btn):hover {
    color: var(--text-primary);
  }

  .nav-links a:not(.btn)::after {
    content: '';
    position: absolute;
    bottom: -4px;
    left: 0;
    width: 0;
    height: 2px;
    background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
    transition: width 0.3s ease;
  }

  .nav-links a:not(.btn):hover::after {
    width: 100%;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 24px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    border: none;
    text-decoration: none;
    position: relative;
    overflow: hidden;
  }

  .btn-primary {
    background: linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%);
    color: white;
    box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
  }

  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(99, 102, 241, 0.4);
  }

  .btn-primary::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
    transition: left 0.5s ease;
  }

  .btn-primary:hover::before {
    left: 100%;
  }

  .btn-outline {
    background: transparent;
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    backdrop-filter: blur(10px);
  }

  .btn-outline:hover {
    background: rgba(99, 102, 241, 0.1);
    border-color: var(--accent-primary);
  }

  .btn-lg {
    padding: 16px 32px;
    font-size: 16px;
    border-radius: 12px;
  }

  /* Hero */
  .hero {
    padding: 160px 24px 100px;
    text-align: center;
    position: relative;
  }

  .hero::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, transparent 70%);
    pointer-events: none;
  }

  .hero h1 {
    font-size: 56px;
    font-weight: 800;
    margin-bottom: 20px;
    letter-spacing: -1.5px;
    background: linear-gradient(135deg, #fff 0%, #a5b4fc 50%, #818cf8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    position: relative;
    z-index: 1;
  }

  .hero p {
    font-size: 18px;
    color: var(--text-secondary);
    max-width: 550px;
    margin: 0 auto;
    line-height: 1.7;
    position: relative;
    z-index: 1;
  }

  /* Pricing Cards */
  .pricing-section {
    padding: 40px 24px 120px;
  }

  .pricing-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .pricing-card {
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(20px);
    border-radius: 20px;
    border: 1px solid var(--border-color);
    padding: 36px 28px;
    display: flex;
    flex-direction: column;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
  }

  .pricing-card:hover {
    transform: translateY(-8px);
    border-color: var(--border-glow);
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
  }

  .pricing-card.featured {
    border-color: var(--accent-primary);
    background: linear-gradient(180deg, rgba(99, 102, 241, 0.1) 0%, rgba(15, 23, 42, 0.6) 100%);
  }

  .pricing-card.featured::before {
    content: 'Most Popular';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
    color: white;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    padding: 8px 12px;
    text-align: center;
  }

  .pricing-card.featured > * {
    margin-top: 20px;
  }

  .pricing-card h2 {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-secondary);
  }

  .pricing-card .price {
    font-size: 48px;
    font-weight: 800;
    margin-bottom: 8px;
    background: linear-gradient(135deg, #fff 0%, #a5b4fc 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -2px;
  }

  .pricing-card .price span {
    font-size: 16px;
    font-weight: 500;
    color: var(--text-muted);
    -webkit-text-fill-color: var(--text-muted);
  }

  .pricing-card .description {
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: 28px;
    min-height: 40px;
    font-weight: 500;
  }

  .pricing-card .features {
    flex: 1;
    margin-bottom: 28px;
  }

  .pricing-card .feature {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 14px;
    font-size: 14px;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .pricing-card .feature svg {
    width: 18px;
    height: 18px;
    color: var(--accent-green);
    flex-shrink: 0;
    margin-top: 2px;
  }

  .pricing-card .btn {
    width: 100%;
  }

  /* Feature Comparison */
  .comparison-section {
    padding: 100px 24px;
    background: var(--bg-secondary);
  }

  .section-header {
    text-align: center;
    max-width: 700px;
    margin: 0 auto 60px;
  }

  .section-header h2 {
    font-size: 36px;
    font-weight: 700;
    margin-bottom: 16px;
  }

  .section-header p {
    font-size: 18px;
    color: var(--text-secondary);
  }

  .comparison-table {
    max-width: 1100px;
    margin: 0 auto;
    background: var(--bg-primary);
    border-radius: 16px;
    border: 1px solid var(--border-color);
    overflow: hidden;
  }

  .comparison-table table {
    width: 100%;
    border-collapse: collapse;
  }

  .comparison-table th,
  .comparison-table td {
    padding: 16px 24px;
    text-align: left;
    border-bottom: 1px solid var(--border-color);
  }

  .comparison-table th {
    background: var(--bg-tertiary);
    font-size: 14px;
    font-weight: 600;
  }

  .comparison-table td {
    font-size: 14px;
  }

  .comparison-table tr:last-child td {
    border-bottom: none;
  }

  .comparison-table td:first-child {
    color: var(--text-secondary);
  }

  .check {
    color: var(--accent-green);
    font-weight: 600;
  }

  .dash {
    color: var(--text-muted);
  }

  /* Unit Pricing */
  .units-section {
    padding: 100px 24px;
  }

  .units-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    max-width: 900px;
    margin: 0 auto;
  }

  .unit-card {
    background: var(--bg-secondary);
    border-radius: 16px;
    border: 1px solid var(--border-color);
    padding: 32px;
    text-align: center;
  }

  .unit-card .tier-name {
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 8px;
  }

  .unit-card .tier-name.blue { color: var(--accent-blue); }
  .unit-card .tier-name.green { color: var(--accent-green); }
  .unit-card .tier-name.yellow { color: var(--accent-yellow); }

  .unit-card .unit-value {
    font-size: 48px;
    font-weight: 700;
    margin-bottom: 8px;
  }

  .unit-card .unit-label {
    font-size: 14px;
    color: var(--text-muted);
    margin-bottom: 16px;
  }

  .unit-card p {
    font-size: 14px;
    color: var(--text-secondary);
    line-height: 1.6;
  }

  /* FAQ */
  .faq-section {
    padding: 100px 24px;
    background: var(--bg-secondary);
  }

  .faq-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 32px;
    max-width: 1000px;
    margin: 0 auto;
  }

  .faq-item {
    background: var(--bg-primary);
    border-radius: 12px;
    padding: 24px;
    border: 1px solid var(--border-color);
  }

  .faq-item h3 {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 12px;
  }

  .faq-item p {
    font-size: 14px;
    color: var(--text-secondary);
    line-height: 1.7;
  }

  /* Enterprise CTA */
  .enterprise-cta {
    padding: 100px 24px;
    text-align: center;
    background: linear-gradient(180deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
  }

  .enterprise-cta h2 {
    font-size: 36px;
    font-weight: 700;
    margin-bottom: 16px;
  }

  .enterprise-cta p {
    font-size: 18px;
    color: var(--text-secondary);
    max-width: 600px;
    margin: 0 auto 32px;
  }

  /* Footer */
  footer {
    background: var(--bg-secondary);
    border-top: 1px solid var(--border-color);
    padding: 40px 24px;
    text-align: center;
  }

  footer a {
    color: var(--text-secondary);
    text-decoration: none;
    margin: 0 16px;
    font-size: 14px;
  }

  footer a:hover {
    color: var(--text-primary);
  }

  /* Responsive */
  @media (max-width: 1000px) {
    .pricing-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .units-grid {
      grid-template-columns: 1fr;
    }

    .faq-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 600px) {
    .pricing-grid {
      grid-template-columns: 1fr;
    }

    .hero h1 {
      font-size: 32px;
    }

    .nav-links {
      display: none;
    }
  }
`;

/**
 * GET / - Pricing page
 */
pricingPage.get('/', (c) => {
  const urls = getEnvironmentUrls(c.req);
  return c.html(html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pricing - Unbrowser</title>
  <meta name="description" content="Simple, transparent pricing for Unbrowser. Start free, scale as you grow.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>${pricingStyles}</style>
</head>
<body>
  <!-- Gradient background -->
  <div class="gradient-bg"></div>

  <!-- Navigation -->
  <nav>
    <div class="nav-inner">
      <a href="${urls.home}" class="nav-logo">Unbrowser</a>
      <div class="nav-links">
        <a href="${urls.home}#features">Features</a>
        <a href="${urls.home}#use-cases">Use Cases</a>
        <a href="${urls.pricing}">Pricing</a>
        <a href="${urls.docs}">Docs</a>
        <a href="${urls.authLogin}">Sign In</a>
        <a href="${urls.authSignup}" class="btn btn-primary">Get Started</a>
      </div>
    </div>
  </nav>

  <!-- Hero -->
  <section class="hero">
    <div class="container">
      <h1>Simple, Transparent Pricing</h1>
      <p>Start free, scale as you grow. No hidden fees, no surprises.</p>
    </div>
  </section>

  <!-- Pricing Cards -->
  <section class="pricing-section">
    <div class="pricing-grid">
      <!-- Free -->
      <div class="pricing-card">
        <h2>Free</h2>
        <div class="price">$0</div>
        <div class="description">Perfect for trying out Unbrowser</div>
        <div class="features">
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>100 requests per day</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>3,000 requests per month</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>Intelligence + Lightweight tiers</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>Datacenter proxies</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>Community support</span>
          </div>
        </div>
        <a href="${urls.authSignup}" class="btn btn-outline">Get Started Free</a>
      </div>

      <!-- Starter -->
      <div class="pricing-card">
        <h2>Starter</h2>
        <div class="price">$29<span>/mo</span></div>
        <div class="description">For individual developers and small projects</div>
        <div class="features">
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>1,000 requests per day</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>30,000 requests per month</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>All 3 rendering tiers</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>Datacenter + ISP proxies</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>24-hour sessions</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>Email support</span>
          </div>
        </div>
        <a href="${urls.authSignup}" class="btn btn-outline">Get Started</a>
      </div>

      <!-- Team (Featured) -->
      <div class="pricing-card featured">
        <h2>Team</h2>
        <div class="price">$99<span>/mo</span></div>
        <div class="description">For growing teams and production workloads</div>
        <div class="features">
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>10,000 requests per day</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>300,000 requests per month</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>All 3 rendering tiers</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>Including Residential proxies</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>7-day sessions</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>Full collective learning</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>Priority support</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>99.9% SLA</span>
          </div>
        </div>
        <a href="${urls.authSignup}" class="btn btn-primary">Get Started</a>
      </div>

      <!-- Enterprise -->
      <div class="pricing-card">
        <h2>Enterprise</h2>
        <div class="price">Custom</div>
        <div class="description">For large-scale deployments</div>
        <div class="features">
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>Unlimited requests</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>Priority rendering queue</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>Premium proxy access</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>Unlimited sessions</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>Private pattern pool option</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>Dedicated support</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>99.99% SLA</span>
          </div>
          <div class="feature">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span>Custom integrations</span>
          </div>
        </div>
        <a href="mailto:hello@unbrowser.ai" class="btn btn-outline">Contact Sales</a>
      </div>
    </div>
  </section>

  <!-- Unit Pricing Explanation -->
  <section class="units-section">
    <div class="container">
      <div class="section-header">
        <h2>Understanding Units</h2>
        <p>Requests are weighted by complexity. As Unbrowser learns, more requests use faster (cheaper) tiers.</p>
      </div>

      <div class="units-grid">
        <div class="unit-card">
          <div class="tier-name blue">Intelligence Tier</div>
          <div class="unit-value">1</div>
          <div class="unit-label">unit per request</div>
          <p>Fastest option. Uses learned patterns, cached APIs, and structured data extraction. Most requests graduate to this tier over time.</p>
        </div>

        <div class="unit-card">
          <div class="tier-name green">Lightweight Tier</div>
          <div class="unit-value">5</div>
          <div class="unit-label">units per request</div>
          <p>Server-side DOM rendering for pages that need JavaScript. Fast linkedom-based parsing without a full browser.</p>
        </div>

        <div class="unit-card">
          <div class="tier-name yellow">Playwright Tier</div>
          <div class="unit-value">25</div>
          <div class="unit-label">units per request</div>
          <p>Full browser automation for complex sites. Used for dynamic content, interactions, and sites with heavy bot protection.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Feature Comparison -->
  <section class="comparison-section">
    <div class="container">
      <div class="section-header">
        <h2>Compare Plans</h2>
        <p>All features at a glance</p>
      </div>

      <div class="comparison-table">
        <table>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Free</th>
              <th>Starter</th>
              <th>Team</th>
              <th>Enterprise</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Daily Requests</td>
              <td>100</td>
              <td>1,000</td>
              <td>10,000</td>
              <td>Unlimited</td>
            </tr>
            <tr>
              <td>Monthly Requests</td>
              <td>3,000</td>
              <td>30,000</td>
              <td>300,000</td>
              <td>Unlimited</td>
            </tr>
            <tr>
              <td>Intelligence Tier</td>
              <td class="check">Yes</td>
              <td class="check">Yes</td>
              <td class="check">Yes</td>
              <td class="check">Yes</td>
            </tr>
            <tr>
              <td>Lightweight Tier</td>
              <td class="check">Yes</td>
              <td class="check">Yes</td>
              <td class="check">Yes</td>
              <td class="check">Yes</td>
            </tr>
            <tr>
              <td>Playwright Tier</td>
              <td class="dash">-</td>
              <td class="check">Yes</td>
              <td class="check">Yes</td>
              <td class="check">Priority</td>
            </tr>
            <tr>
              <td>Datacenter Proxies</td>
              <td class="check">Yes</td>
              <td class="check">Yes</td>
              <td class="check">Yes</td>
              <td class="check">Yes</td>
            </tr>
            <tr>
              <td>ISP Proxies</td>
              <td class="dash">-</td>
              <td class="check">Yes</td>
              <td class="check">Yes</td>
              <td class="check">Yes</td>
            </tr>
            <tr>
              <td>Residential Proxies</td>
              <td class="dash">-</td>
              <td class="dash">-</td>
              <td class="check">Yes</td>
              <td class="check">Yes</td>
            </tr>
            <tr>
              <td>Premium Proxies</td>
              <td class="dash">-</td>
              <td class="dash">-</td>
              <td class="dash">-</td>
              <td class="check">Yes</td>
            </tr>
            <tr>
              <td>Session Persistence</td>
              <td>1 hour</td>
              <td>24 hours</td>
              <td>7 days</td>
              <td>Unlimited</td>
            </tr>
            <tr>
              <td>Collective Learning</td>
              <td>Consume only</td>
              <td>Consume + Contribute</td>
              <td>Full access</td>
              <td>Private pool option</td>
            </tr>
            <tr>
              <td>API Key Limit</td>
              <td>1</td>
              <td>5</td>
              <td>20</td>
              <td>Unlimited</td>
            </tr>
            <tr>
              <td>Support</td>
              <td>Community</td>
              <td>Email</td>
              <td>Priority</td>
              <td>Dedicated</td>
            </tr>
            <tr>
              <td>SLA</td>
              <td class="dash">-</td>
              <td>99%</td>
              <td>99.9%</td>
              <td>99.99%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <!-- FAQ -->
  <section class="faq-section">
    <div class="container">
      <div class="section-header">
        <h2>Frequently Asked Questions</h2>
      </div>

      <div class="faq-grid">
        <div class="faq-item">
          <h3>What counts as a request?</h3>
          <p>Each call to the /v1/browse or /v1/fetch endpoint counts as one request. Batch requests count as multiple requests (one per URL). Cached responses from the Intelligence tier still count as requests but use fewer units.</p>
        </div>

        <div class="faq-item">
          <h3>Do unused requests roll over?</h3>
          <p>No, daily and monthly limits reset at the end of each period. We recommend choosing a plan that fits your typical usage rather than peak usage.</p>
        </div>

        <div class="faq-item">
          <h3>Can I upgrade or downgrade anytime?</h3>
          <p>Yes! You can change your plan at any time. Upgrades take effect immediately. Downgrades take effect at the start of your next billing cycle.</p>
        </div>

        <div class="faq-item">
          <h3>What payment methods do you accept?</h3>
          <p>We accept all major credit cards (Visa, Mastercard, American Express) through Stripe. Enterprise customers can also pay by invoice.</p>
        </div>

        <div class="faq-item">
          <h3>What happens if I exceed my limits?</h3>
          <p>Requests beyond your daily limit will receive a 429 error. For Starter and Team plans, you can enable overage billing to continue at a higher per-unit rate.</p>
        </div>

        <div class="faq-item">
          <h3>How does collective learning work?</h3>
          <p>When you browse a site, Unbrowser learns patterns that help future requests. On Free, you benefit from others' learning. On paid plans, your learning also contributes back.</p>
        </div>

        <div class="faq-item">
          <h3>Is there a free trial for paid plans?</h3>
          <p>The Free plan lets you try all core features. For Team and Enterprise, contact us for a trial with expanded limits to test at scale.</p>
        </div>

        <div class="faq-item">
          <h3>Do you offer discounts?</h3>
          <p>Yes! We offer annual billing discounts (2 months free) and special pricing for startups and non-profits. Contact us for details.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Enterprise CTA -->
  <section class="enterprise-cta">
    <div class="container">
      <h2>Need a Custom Solution?</h2>
      <p>Enterprise plans include custom limits, dedicated support, SLAs, and special integrations. Let's talk about your needs.</p>
      <a href="mailto:hello@unbrowser.ai" class="btn btn-primary btn-lg">Contact Sales</a>
    </div>
  </section>

  <!-- Footer -->
  <footer>
    <a href="${urls.home}">Home</a>
    <a href="${urls.docs}">Documentation</a>
    <a href="${urls.llmTxt}">LLM Reference</a>
    <a href="${urls.privacy}">Privacy</a>
    <a href="${urls.terms}">Terms</a>
  </footer>
</body>
</html>`);
});
