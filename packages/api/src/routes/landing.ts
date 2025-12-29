/**
 * Landing Page
 *
 * Marketing page showcasing Unbrowser features, use cases,
 * and differentiators.
 */

import { Hono } from 'hono';
import { html } from 'hono/html';

export const landing = new Hono();

const landingStyles = `
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
    --glow-primary: rgba(99, 102, 241, 0.5);
    --glow-secondary: rgba(139, 92, 246, 0.4);
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

  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 24px;
  }

  /* Animated gradient background */
  .gradient-bg {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: -1;
    background:
      radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99, 102, 241, 0.15), transparent),
      radial-gradient(ellipse 60% 40% at 80% 50%, rgba(139, 92, 246, 0.1), transparent),
      radial-gradient(ellipse 50% 30% at 20% 80%, rgba(99, 102, 241, 0.08), transparent);
    pointer-events: none;
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
    color: var(--text-primary);
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
    box-shadow: 0 0 20px rgba(99, 102, 241, 0.2);
  }

  .btn-lg {
    padding: 16px 32px;
    font-size: 16px;
    border-radius: 12px;
  }

  /* Hero Section */
  .hero {
    padding: 180px 24px 140px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }

  .hero::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 800px;
    height: 800px;
    background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
    pointer-events: none;
    animation: pulse 8s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
    50% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.1); }
  }

  .hero h1 {
    font-size: 64px;
    font-weight: 800;
    line-height: 1.1;
    margin-bottom: 28px;
    letter-spacing: -2px;
    background: linear-gradient(135deg, #fff 0%, #a5b4fc 50%, #818cf8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    position: relative;
    z-index: 1;
  }

  .hero .tagline {
    font-size: 20px;
    color: var(--text-secondary);
    max-width: 650px;
    margin: 0 auto 48px;
    position: relative;
    z-index: 1;
    line-height: 1.7;
  }

  .hero-cta {
    display: flex;
    gap: 16px;
    justify-content: center;
    margin-bottom: 80px;
    position: relative;
    z-index: 1;
  }

  .hero-stats {
    display: flex;
    justify-content: center;
    gap: 80px;
    padding: 40px 60px;
    border-radius: 20px;
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(20px);
    border: 1px solid var(--border-color);
    max-width: 700px;
    margin: 0 auto;
    position: relative;
    z-index: 1;
  }

  .hero-stat {
    text-align: center;
  }

  .hero-stat-value {
    font-size: 42px;
    font-weight: 800;
    background: linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -1px;
  }

  .hero-stat-label {
    font-size: 14px;
    color: var(--text-muted);
    margin-top: 6px;
    font-weight: 500;
  }

  /* Section Styles */
  section {
    padding: 120px 24px;
    position: relative;
  }

  section:nth-child(even) {
    background: linear-gradient(180deg, rgba(15, 23, 42, 0.5) 0%, rgba(15, 23, 42, 0.8) 100%);
  }

  .section-header {
    text-align: center;
    max-width: 700px;
    margin: 0 auto 70px;
  }

  .section-header h2 {
    font-size: 44px;
    font-weight: 800;
    margin-bottom: 20px;
    letter-spacing: -1px;
    background: linear-gradient(135deg, #fff 0%, #a5b4fc 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .section-header p {
    font-size: 18px;
    color: var(--text-secondary);
    line-height: 1.7;
  }

  /* Problem/Solution */
  .problem-solution {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    max-width: 1000px;
    margin: 0 auto;
  }

  .problem-box, .solution-box {
    padding: 40px;
    border-radius: 20px;
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(20px);
    border: 1px solid var(--border-color);
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
  }

  .problem-box::before, .solution-box::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
  }

  .problem-box::before {
    background: linear-gradient(90deg, var(--accent-yellow), transparent);
  }

  .solution-box::before {
    background: linear-gradient(90deg, var(--accent-green), transparent);
  }

  .problem-box:hover, .solution-box:hover {
    transform: translateY(-4px);
    border-color: rgba(148, 163, 184, 0.2);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  }

  .problem-box h3, .solution-box h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 20px;
    font-weight: 700;
  }

  .problem-box h3 { color: var(--accent-yellow); }
  .solution-box h3 { color: var(--accent-green); }

  .problem-box p, .solution-box p {
    font-size: 17px;
    color: var(--text-secondary);
    line-height: 1.8;
  }

  /* Features Grid */
  .features-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .feature-card {
    padding: 36px;
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(20px);
    border-radius: 20px;
    border: 1px solid var(--border-color);
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
  }

  .feature-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, transparent 50%);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .feature-card:hover {
    transform: translateY(-8px);
    border-color: var(--border-glow);
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3), 0 0 40px rgba(99, 102, 241, 0.1);
  }

  .feature-card:hover::before {
    opacity: 1;
  }

  .feature-icon {
    width: 56px;
    height: 56px;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.1) 100%);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;
    color: var(--accent-primary);
    border: 1px solid rgba(99, 102, 241, 0.2);
    position: relative;
    z-index: 1;
  }

  .feature-icon svg {
    width: 26px;
    height: 26px;
  }

  .feature-card h3 {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 12px;
    position: relative;
    z-index: 1;
  }

  .feature-card p {
    font-size: 15px;
    color: var(--text-secondary);
    line-height: 1.7;
    position: relative;
    z-index: 1;
  }

  /* Use Cases */
  .use-cases-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
    max-width: 1000px;
    margin: 0 auto;
  }

  .use-case {
    display: flex;
    gap: 20px;
    padding: 28px;
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(20px);
    border-radius: 16px;
    border: 1px solid var(--border-color);
    transition: all 0.3s ease;
  }

  .use-case:hover {
    transform: translateX(8px);
    border-color: var(--border-glow);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  }

  .use-case-icon {
    width: 48px;
    height: 48px;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.1) 100%);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border: 1px solid rgba(99, 102, 241, 0.2);
  }

  .use-case h3 {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 8px;
  }

  .use-case p {
    font-size: 14px;
    color: var(--text-secondary);
    line-height: 1.6;
  }

  /* Comparison Table */
  .comparison-table {
    max-width: 900px;
    margin: 0 auto;
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(20px);
    border-radius: 20px;
    border: 1px solid var(--border-color);
    overflow: hidden;
  }

  .comparison-table table {
    width: 100%;
    border-collapse: collapse;
  }

  .comparison-table th,
  .comparison-table td {
    padding: 18px 28px;
    text-align: left;
    border-bottom: 1px solid var(--border-color);
  }

  .comparison-table th {
    background: rgba(30, 41, 59, 0.8);
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-secondary);
  }

  .comparison-table td {
    font-size: 14px;
    font-weight: 500;
  }

  .comparison-table tr {
    transition: background 0.2s ease;
  }

  .comparison-table tbody tr:hover {
    background: rgba(99, 102, 241, 0.05);
  }

  .comparison-table tr:last-child td {
    border-bottom: none;
  }

  .comparison-table td:first-child {
    color: var(--text-secondary);
  }

  .comparison-table td:last-child {
    color: var(--accent-green);
    font-weight: 600;
  }

  .comparison-table td:nth-child(2) {
    color: var(--text-muted);
  }

  /* Code Example */
  .code-example {
    max-width: 800px;
    margin: 0 auto;
  }

  .code-block {
    background: rgba(3, 7, 18, 0.9);
    border: 1px solid var(--border-color);
    border-radius: 16px;
    padding: 28px 32px;
    font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
    font-size: 14px;
    line-height: 1.8;
    overflow-x: auto;
    position: relative;
  }

  .code-block::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 40px;
    background: rgba(30, 41, 59, 0.5);
    border-radius: 16px 16px 0 0;
    border-bottom: 1px solid var(--border-color);
  }

  .code-block::after {
    content: '';
    position: absolute;
    top: 14px;
    left: 16px;
    width: 12px;
    height: 12px;
    background: #ff5f57;
    border-radius: 50%;
    box-shadow: 20px 0 0 #febc2e, 40px 0 0 #28c840;
  }

  .code-block pre {
    margin-top: 32px;
  }

  .code-block .comment {
    color: var(--text-muted);
    font-style: italic;
  }

  .code-block .keyword {
    color: var(--accent-tertiary);
  }

  .code-block .string {
    color: var(--accent-green);
  }

  .code-block .function {
    color: var(--accent-primary);
  }

  /* Pricing Preview */
  .pricing-preview {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    max-width: 1100px;
    margin: 0 auto;
  }

  .pricing-card {
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(20px);
    border-radius: 20px;
    border: 1px solid var(--border-color);
    padding: 36px 28px;
    text-align: center;
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
  }

  .pricing-card.featured .pricing-content {
    margin-top: 20px;
  }

  .pricing-card h3 {
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

  .pricing-card .requests {
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: 28px;
    font-weight: 500;
  }

  .pricing-card .btn {
    width: 100%;
  }

  /* Footer */
  footer {
    background: linear-gradient(180deg, var(--bg-primary) 0%, rgba(15, 23, 42, 0.8) 100%);
    border-top: 1px solid var(--border-color);
    padding: 80px 24px 50px;
    position: relative;
  }

  footer::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--accent-primary), transparent);
  }

  .footer-content {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr;
    gap: 60px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .footer-brand h3 {
    font-size: 24px;
    font-weight: 800;
    margin-bottom: 16px;
    background: linear-gradient(135deg, #fff 0%, #a5b4fc 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .footer-brand p {
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.7;
    max-width: 300px;
  }

  .footer-links h4 {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: 20px;
    color: var(--text-primary);
  }

  .footer-links a {
    display: block;
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 14px;
    margin-bottom: 12px;
    transition: all 0.2s ease;
  }

  .footer-links a:hover {
    color: var(--accent-primary);
    transform: translateX(4px);
  }

  .footer-bottom {
    text-align: center;
    padding-top: 50px;
    margin-top: 50px;
    border-top: 1px solid var(--border-color);
    color: var(--text-muted);
    font-size: 13px;
    max-width: 1200px;
    margin-left: auto;
    margin-right: auto;
  }

  /* Responsive */
  @media (max-width: 1024px) {
    .features-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .pricing-preview {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 900px) {
    .hero h1 {
      font-size: 44px;
      letter-spacing: -1px;
    }

    .hero .tagline {
      font-size: 18px;
    }

    .features-grid {
      grid-template-columns: 1fr;
    }

    .problem-solution {
      grid-template-columns: 1fr;
    }

    .use-cases-grid {
      grid-template-columns: 1fr;
    }

    .footer-content {
      grid-template-columns: 1fr 1fr;
      gap: 40px;
    }

    .section-header h2 {
      font-size: 36px;
    }
  }

  @media (max-width: 600px) {
    .hero {
      padding: 140px 20px 100px;
    }

    .hero h1 {
      font-size: 34px;
    }

    .hero-cta {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
    }

    .hero-stats {
      flex-direction: column;
      gap: 32px;
      padding: 32px 40px;
    }

    .pricing-preview {
      grid-template-columns: 1fr;
    }

    .nav-links {
      display: none;
    }

    .footer-content {
      grid-template-columns: 1fr;
      gap: 32px;
    }

    section {
      padding: 80px 20px;
    }

    .section-header h2 {
      font-size: 28px;
    }

    .comparison-table th,
    .comparison-table td {
      padding: 14px 16px;
      font-size: 13px;
    }
  }

  /* Animations */
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .hero h1,
  .hero .tagline,
  .hero-cta,
  .hero-stats {
    animation: fadeInUp 0.8s ease forwards;
  }

  .hero .tagline {
    animation-delay: 0.1s;
  }

  .hero-cta {
    animation-delay: 0.2s;
  }

  .hero-stats {
    animation-delay: 0.3s;
  }
`;

/**
 * GET / - Landing page
 */
landing.get('/', (c) => {
  return c.html(html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unbrowser - Intelligent Web Browsing for AI Agents</title>
  <meta name="description" content="The browser that learns. Extract web content 10x faster as patterns are discovered. Built for AI agents, researchers, and developers.">
  <style>${landingStyles}</style>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body>
  <!-- Animated gradient background -->
  <div class="gradient-bg"></div>

  <!-- Navigation -->
  <nav>
    <div class="nav-inner">
      <a href="/" class="nav-logo">Unbrowser</a>
      <div class="nav-links">
        <a href="#features">Features</a>
        <a href="#use-cases">Use Cases</a>
        <a href="/pricing">Pricing</a>
        <a href="/docs">Docs</a>
        <a href="/auth/login">Sign In</a>
        <a href="/auth/signup" class="btn btn-primary">Get Started</a>
      </div>
    </div>
  </nav>

  <!-- Hero Section -->
  <section class="hero">
    <div class="container">
      <h1>Intelligent Web Browsing<br>for AI Agents</h1>
      <p class="tagline">
        The browser that learns. Extract web content 10x faster as patterns are discovered.
        Built for AI agents, researchers, and developers.
      </p>
      <div class="hero-cta">
        <a href="/auth/signup" class="btn btn-primary btn-lg">Get Started Free</a>
        <a href="/docs" class="btn btn-outline btn-lg">View Documentation</a>
      </div>
      <div class="hero-stats">
        <div class="hero-stat">
          <div class="hero-stat-value">50ms</div>
          <div class="hero-stat-label">Learned Requests</div>
        </div>
        <div class="hero-stat">
          <div class="hero-stat-value">10x</div>
          <div class="hero-stat-label">Faster Over Time</div>
        </div>
        <div class="hero-stat">
          <div class="hero-stat-value">100+</div>
          <div class="hero-stat-label">API Keys Active</div>
        </div>
      </div>
    </div>
  </section>

  <!-- Problem/Solution -->
  <section>
    <div class="container">
      <div class="problem-solution">
        <div class="problem-box">
          <h3>The Problem</h3>
          <p>
            Traditional web scraping is slow, brittle, and expensive. Every request takes 2-5 seconds.
            Selectors break constantly. Bot detection blocks your requests.
            You end up maintaining complex infrastructure instead of building your product.
          </p>
        </div>
        <div class="solution-box">
          <h3>The Solution</h3>
          <p>
            Unbrowser learns from every request. It discovers APIs, memorizes patterns, and builds
            procedural skills. After the first request, subsequent visits return in 50-200ms.
            Patterns learned by all users benefit everyone through collective intelligence.
          </p>
        </div>
      </div>
    </div>
  </section>

  <!-- Key Features -->
  <section id="features">
    <div class="container">
      <div class="section-header">
        <h2>Key Features</h2>
        <p>Everything you need to browse the web intelligently</p>
      </div>

      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          </div>
          <h3>Tiered Intelligence</h3>
          <p>
            Automatically selects the fastest method. Content Intelligence (50ms) for learned patterns,
            Lightweight rendering (200ms) for simple pages, Full browser (2s) only when needed.
          </p>
        </div>

        <div class="feature-card">
          <div class="feature-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
            </svg>
          </div>
          <h3>Auto-Learning</h3>
          <p>
            Discovers APIs behind web pages automatically. Learns CSS selectors that work.
            Builds procedural skills for complex multi-step workflows. Gets smarter with every request.
          </p>
        </div>

        <div class="feature-card">
          <div class="feature-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
            </svg>
          </div>
          <h3>Collective Intelligence</h3>
          <p>
            Patterns learned by one user benefit everyone. When any user discovers an API endpoint
            or learns a working selector, it's shared (anonymously) with all tenants.
          </p>
        </div>

        <div class="feature-card">
          <div class="feature-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
          </div>
          <h3>Built-in Verification</h3>
          <p>
            Content validation with confidence scoring. Assert that fields exist, match patterns,
            and meet length requirements. Detect content changes and stale data automatically.
          </p>
        </div>

        <div class="feature-card">
          <div class="feature-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
            </svg>
          </div>
          <h3>Session Persistence</h3>
          <p>
            Maintain authenticated sessions across requests. Log in once, browse as that user
            for hours or days. Cookies, local storage, and session state preserved.
          </p>
        </div>

        <div class="feature-card">
          <div class="feature-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/>
            </svg>
          </div>
          <h3>Stealth Mode</h3>
          <p>
            Advanced fingerprint evasion. Behavioral delays that mimic real users. Intelligent
            proxy rotation. Pass bot detection on sites that block traditional scrapers.
          </p>
        </div>
      </div>
    </div>
  </section>

  <!-- Use Cases -->
  <section id="use-cases">
    <div class="container">
      <div class="section-header">
        <h2>Use Cases</h2>
        <p>Built for AI agents and modern automation</p>
      </div>

      <div class="use-cases-grid">
        <div class="use-case">
          <div class="use-case-icon">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
          </div>
          <div>
            <h3>AI Agents and Assistants</h3>
            <p>Give Claude, GPT, or custom agents reliable web access. MCP integration for Claude Desktop. Built for LLM workflows.</p>
          </div>
        </div>

        <div class="use-case">
          <div class="use-case-icon">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
            </svg>
          </div>
          <div>
            <h3>Research Automation</h3>
            <p>Access government portals, legal documents, and public records. Multi-language support for global research. Structured data extraction.</p>
          </div>
        </div>

        <div class="use-case">
          <div class="use-case-icon">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"/>
            </svg>
          </div>
          <div>
            <h3>Price Monitoring</h3>
            <p>E-commerce tracking with change detection. Monitor competitors, track inventory, alert on price drops. Built-in diff capabilities.</p>
          </div>
        </div>

        <div class="use-case">
          <div class="use-case-icon">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/>
            </svg>
          </div>
          <div>
            <h3>Content Aggregation</h3>
            <p>News, blogs, documentation with smart extraction. Tables, structured data, markdown output. Perfect for knowledge bases.</p>
          </div>
        </div>

        <div class="use-case">
          <div class="use-case-icon">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
            </svg>
          </div>
          <div>
            <h3>QA and Testing</h3>
            <p>E2E API testing with auto-discovered endpoints. Content validation and regression detection. Perfect for CI/CD pipelines.</p>
          </div>
        </div>

        <div class="use-case">
          <div class="use-case-icon">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
          </div>
          <div>
            <h3>Workflow Automation</h3>
            <p>Record, replay, and schedule complex workflows. Handle multi-step processes with session persistence. Ideal for repetitive tasks.</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Comparison -->
  <section>
    <div class="container">
      <div class="section-header">
        <h2>What Sets Us Apart</h2>
        <p>Unbrowser vs traditional scraping solutions</p>
      </div>

      <div class="comparison-table">
        <table>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Traditional Scrapers</th>
              <th>Unbrowser</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>First request latency</td>
              <td>2-5 seconds</td>
              <td>2-5 seconds</td>
            </tr>
            <tr>
              <td>Repeat request latency</td>
              <td>2-5 seconds</td>
              <td>50-200ms (learned)</td>
            </tr>
            <tr>
              <td>API discovery</td>
              <td>Manual reverse engineering</td>
              <td>Automatic detection</td>
            </tr>
            <tr>
              <td>Selector maintenance</td>
              <td>Constant manual updates</td>
              <td>Self-healing patterns</td>
            </tr>
            <tr>
              <td>Anti-bot handling</td>
              <td>Frequent failures</td>
              <td>Built-in stealth mode</td>
            </tr>
            <tr>
              <td>Session management</td>
              <td>DIY implementation</td>
              <td>Automatic persistence</td>
            </tr>
            <tr>
              <td>Learning over time</td>
              <td>None</td>
              <td>Collective intelligence</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <!-- Code Example -->
  <section>
    <div class="container">
      <div class="section-header">
        <h2>Simple to Use</h2>
        <p>Get started with just a few lines of code</p>
      </div>

      <div class="code-example">
        <div class="code-block">
<pre><span class="keyword">import</span> { createUnbrowser } <span class="keyword">from</span> <span class="string">'@unbrowser/core'</span>;

<span class="comment">// Initialize with your API key</span>
<span class="keyword">const</span> browser = <span class="function">createUnbrowser</span>({
  apiKey: process.env.UNBROWSER_API_KEY
});

<span class="comment">// Browse any URL with intelligent extraction</span>
<span class="keyword">const</span> result = <span class="keyword">await</span> browser.<span class="function">browse</span>(<span class="string">'https://example.com'</span>, {
  verify: { enabled: <span class="keyword">true</span>, mode: <span class="string">'thorough'</span> }
});

<span class="comment">// Get clean markdown content</span>
console.<span class="function">log</span>(result.content.markdown);
console.<span class="function">log</span>(<span class="string">\`Confidence: \${result.verification.confidence}\`</span>);</pre>
        </div>
      </div>
    </div>
  </section>

  <!-- Pricing Preview -->
  <section id="pricing">
    <div class="container">
      <div class="section-header">
        <h2>Simple Pricing</h2>
        <p>Start free, scale as you grow</p>
      </div>

      <div class="pricing-preview">
        <div class="pricing-card">
          <h3>Free</h3>
          <div class="price">$0</div>
          <div class="requests">100 requests/day</div>
          <a href="/auth/signup" class="btn btn-outline">Get Started</a>
        </div>

        <div class="pricing-card">
          <h3>Starter</h3>
          <div class="price">$29<span>/mo</span></div>
          <div class="requests">1,000 requests/day</div>
          <a href="/auth/signup" class="btn btn-outline">Get Started</a>
        </div>

        <div class="pricing-card featured">
          <h3>Team</h3>
          <div class="price">$99<span>/mo</span></div>
          <div class="requests">10,000 requests/day</div>
          <a href="/auth/signup" class="btn btn-primary">Get Started</a>
        </div>

        <div class="pricing-card">
          <h3>Enterprise</h3>
          <div class="price">Custom</div>
          <div class="requests">Unlimited requests</div>
          <a href="mailto:hello@unbrowser.ai" class="btn btn-outline">Contact Us</a>
        </div>
      </div>

      <p style="text-align: center; margin-top: 32px; color: var(--text-muted);">
        <a href="/pricing" style="color: var(--accent-blue);">View full pricing details and calculator</a>
      </p>
    </div>
  </section>

  <!-- CTA -->
  <section style="background: linear-gradient(135deg, var(--accent-blue) 0%, #1d4ed8 100%); text-align: center;">
    <div class="container">
      <h2 style="font-size: 36px; margin-bottom: 16px;">Ready to browse smarter?</h2>
      <p style="font-size: 18px; opacity: 0.9; margin-bottom: 32px;">
        Get started for free. No credit card required.
      </p>
      <a href="/auth/signup" class="btn btn-lg" style="background: white; color: var(--accent-blue);">
        Start Free Trial
      </a>
    </div>
  </section>

  <!-- Footer -->
  <footer>
    <div class="footer-content">
      <div class="footer-brand">
        <h3>Unbrowser</h3>
        <p>
          Intelligent web browsing for AI agents. Extract content faster with
          learning that improves over time.
        </p>
      </div>

      <div class="footer-links">
        <h4>Product</h4>
        <a href="/docs">Documentation</a>
        <a href="/pricing">Pricing</a>
        <a href="/llm.txt">LLM Reference</a>
        <a href="https://status.unbrowser.ai">Status</a>
      </div>

      <div class="footer-links">
        <h4>Resources</h4>
        <a href="/docs">API Reference</a>
        <a href="/docs/quickstart">Quick Start</a>
        <a href="/docs/examples">Examples</a>
        <a href="https://github.com/anthropics/unbrowser">GitHub</a>
      </div>

      <div class="footer-links">
        <h4>Company</h4>
        <a href="mailto:hello@unbrowser.ai">Contact</a>
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms of Service</a>
      </div>
    </div>

    <div class="footer-bottom">
      Unbrowser - Intelligent Web Browsing for AI Agents
    </div>
  </footer>
</body>
</html>`);
});
