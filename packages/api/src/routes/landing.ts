/**
 * Landing Page
 *
 * Marketing page showcasing Unbrowser features, use cases,
 * and differentiators.
 */

import { Hono } from 'hono';
import { html } from 'hono/html';

export const landing = new Hono();

/**
 * Get environment-aware URLs for cross-domain links
 * In production, API routes go to api.unbrowser.ai, marketing routes to unbrowser.ai
 * In development, use relative paths
 */
function getUrls(req: any) {
  const isDev = process.env.NODE_ENV !== 'production';
  const host = req.header('host') || 'localhost:3001';
  const isApiDomain = host.includes('api.unbrowser.ai');
  const isMarketingDomain = host.includes('unbrowser.ai') && !isApiDomain;

  // API routes (docs, llm.txt, etc.)
  const apiBase = isDev ? '' : isMarketingDomain ? 'https://api.unbrowser.ai' : '';

  // Marketing routes (auth, pricing, dashboard, etc.)
  const marketingBase = isDev ? '' : isApiDomain ? 'https://unbrowser.ai' : '';

  return {
    // API routes
    docs: `${apiBase}/docs`,
    llmTxt: `${apiBase}/llm.txt`,
    llmMd: `${apiBase}/llm.md`,

    // Marketing routes
    pricing: `${marketingBase}/pricing`,
    authLogin: `${marketingBase}/auth/login`,
    authSignup: `${marketingBase}/auth/signup`,
    dashboard: `${marketingBase}/dashboard`,

    // External links
    status: 'https://status.unbrowser.ai',
    github: 'https://github.com/unbrowser/unbrowser',

    // Root
    home: marketingBase || '/',
  };
}

const landingStyles = `
  :root {
    --bg-primary: #030712;
    --bg-secondary: #0f172a;
    --bg-tertiary: #1e293b;
    --bg-card: rgba(15, 23, 42, 0.8);
    --text-primary: #f8fafc;
    --text-secondary: #94a3b8;
    --text-muted: #64748b;
    --accent-primary: #8b5cf6;
    --accent-secondary: #a78bfa;
    --accent-tertiary: #c4b5fd;
    --accent-cyan: #22d3ee;
    --accent-pink: #f472b6;
    --accent-green: #34d399;
    --accent-yellow: #fbbf24;
    --accent-orange: #fb923c;
    --border-color: rgba(148, 163, 184, 0.1);
    --border-glow: rgba(139, 92, 246, 0.5);
    --glow-primary: rgba(139, 92, 246, 0.4);
    --glow-secondary: rgba(167, 139, 250, 0.3);
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
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    line-height: 1.6;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: 'Cal Sans', 'Inter', system-ui, sans-serif;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 24px;
  }

  /* Animated mesh gradient background */
  .gradient-bg {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: -2;
    background: var(--bg-primary);
  }

  .gradient-bg::before {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background:
      radial-gradient(ellipse 40% 60% at 15% 20%, rgba(139, 92, 246, 0.15), transparent 50%),
      radial-gradient(ellipse 35% 50% at 85% 30%, rgba(236, 72, 153, 0.12), transparent 50%),
      radial-gradient(ellipse 50% 40% at 50% 80%, rgba(34, 211, 238, 0.1), transparent 50%),
      radial-gradient(ellipse 30% 35% at 70% 60%, rgba(139, 92, 246, 0.08), transparent 50%);
    animation: meshMove 20s ease-in-out infinite;
    pointer-events: none;
  }

  @keyframes meshMove {
    0%, 100% { transform: translate(0, 0) rotate(0deg); }
    25% { transform: translate(2%, 3%) rotate(1deg); }
    50% { transform: translate(-1%, 2%) rotate(-1deg); }
    75% { transform: translate(1%, -2%) rotate(0.5deg); }
  }

  /* Floating orbs */
  .orbs {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: -1;
    pointer-events: none;
    overflow: hidden;
  }

  .orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.6;
    animation: float 15s ease-in-out infinite;
  }

  .orb-1 {
    width: 400px;
    height: 400px;
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(236, 72, 153, 0.2));
    top: 10%;
    left: 10%;
    animation-delay: 0s;
  }

  .orb-2 {
    width: 300px;
    height: 300px;
    background: linear-gradient(135deg, rgba(34, 211, 238, 0.25), rgba(139, 92, 246, 0.15));
    top: 60%;
    right: 10%;
    animation-delay: -5s;
  }

  .orb-3 {
    width: 250px;
    height: 250px;
    background: linear-gradient(135deg, rgba(251, 146, 60, 0.2), rgba(244, 114, 182, 0.15));
    bottom: 20%;
    left: 30%;
    animation-delay: -10s;
  }

  @keyframes float {
    0%, 100% { transform: translate(0, 0) scale(1); }
    25% { transform: translate(30px, -30px) scale(1.05); }
    50% { transform: translate(-20px, 20px) scale(0.95); }
    75% { transform: translate(20px, 10px) scale(1.02); }
  }

  /* Grid pattern overlay */
  .grid-pattern {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: -1;
    background-image:
      linear-gradient(rgba(148, 163, 184, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(148, 163, 184, 0.03) 1px, transparent 1px);
    background-size: 60px 60px;
    pointer-events: none;
  }

  /* Navigation */
  nav {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    padding: 12px 24px;
  }

  .nav-inner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 24px;
    max-width: 1200px;
    margin: 0 auto;
    background: rgba(3, 7, 18, 0.7);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 16px;
    border: 1px solid var(--border-color);
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3);
  }

  .nav-logo {
    font-size: 24px;
    font-weight: 800;
    color: var(--text-primary);
    text-decoration: none;
    letter-spacing: -0.5px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .nav-logo-icon {
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, var(--accent-primary), var(--accent-pink));
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .nav-logo-text {
    background: linear-gradient(135deg, #fff 0%, var(--accent-tertiary) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .nav-links {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .nav-links a {
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    padding: 10px 16px;
    border-radius: 10px;
    transition: all 0.2s ease;
    position: relative;
  }

  .nav-links a:not(.btn):hover {
    color: var(--text-primary);
    background: rgba(148, 163, 184, 0.08);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 24px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border: none;
    text-decoration: none;
    position: relative;
    overflow: hidden;
  }

  .btn-primary {
    background: linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-pink) 100%);
    color: white;
    box-shadow:
      0 4px 15px rgba(139, 92, 246, 0.4),
      0 0 0 1px rgba(255, 255, 255, 0.1) inset;
  }

  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow:
      0 8px 30px rgba(139, 92, 246, 0.5),
      0 0 0 1px rgba(255, 255, 255, 0.2) inset;
  }

  .btn-primary::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent);
    transition: left 0.6s ease;
  }

  .btn-primary:hover::before {
    left: 100%;
  }

  .btn-outline {
    background: rgba(148, 163, 184, 0.05);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    backdrop-filter: blur(10px);
  }

  .btn-outline:hover {
    background: rgba(139, 92, 246, 0.1);
    border-color: var(--accent-primary);
    box-shadow: 0 0 30px rgba(139, 92, 246, 0.2);
  }

  .btn-lg {
    padding: 18px 36px;
    font-size: 16px;
    border-radius: 14px;
  }

  /* Hero Section */
  .hero {
    padding: 200px 24px 160px;
    text-align: center;
    position: relative;
    overflow: visible;
  }

  .hero-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px 8px 8px;
    background: rgba(139, 92, 246, 0.1);
    border: 1px solid rgba(139, 92, 246, 0.2);
    border-radius: 100px;
    font-size: 13px;
    color: var(--accent-secondary);
    margin-bottom: 32px;
    animation: fadeInUp 0.8s ease forwards;
  }

  .hero-badge-dot {
    width: 8px;
    height: 8px;
    background: var(--accent-green);
    border-radius: 50%;
    animation: pulse-dot 2s ease-in-out infinite;
  }

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.2); }
  }

  .hero h1 {
    font-size: 72px;
    font-weight: 800;
    line-height: 1.05;
    margin-bottom: 28px;
    letter-spacing: -0.04em;
    position: relative;
    z-index: 1;
  }

  .hero h1 .gradient-text {
    background: linear-gradient(135deg, #fff 0%, var(--accent-tertiary) 50%, var(--accent-cyan) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .hero h1 .highlight {
    position: relative;
    display: inline-block;
  }

  .hero h1 .highlight::after {
    content: '';
    position: absolute;
    bottom: 8px;
    left: 0;
    right: 0;
    height: 12px;
    background: linear-gradient(90deg, var(--accent-primary), var(--accent-pink));
    opacity: 0.3;
    border-radius: 4px;
    z-index: -1;
  }

  .hero .tagline {
    font-size: 20px;
    color: var(--text-secondary);
    max-width: 600px;
    margin: 0 auto 48px;
    position: relative;
    z-index: 1;
    line-height: 1.8;
    animation: fadeInUp 0.8s ease forwards;
    animation-delay: 0.1s;
    opacity: 0;
  }

  .hero-cta {
    display: flex;
    gap: 16px;
    justify-content: center;
    margin-bottom: 80px;
    position: relative;
    z-index: 1;
    animation: fadeInUp 0.8s ease forwards;
    animation-delay: 0.2s;
    opacity: 0;
  }

  .hero-stats {
    display: flex;
    justify-content: center;
    gap: 1px;
    background: var(--border-color);
    border-radius: 20px;
    overflow: hidden;
    max-width: 720px;
    margin: 0 auto;
    position: relative;
    z-index: 1;
    animation: fadeInUp 0.8s ease forwards;
    animation-delay: 0.3s;
    opacity: 0;
    box-shadow:
      0 25px 50px rgba(0, 0, 0, 0.4),
      0 0 0 1px var(--border-color);
  }

  .hero-stat {
    flex: 1;
    text-align: center;
    padding: 36px 32px;
    background: rgba(15, 23, 42, 0.8);
    backdrop-filter: blur(20px);
  }

  .hero-stat:first-child {
    border-radius: 20px 0 0 20px;
  }

  .hero-stat:last-child {
    border-radius: 0 20px 20px 0;
  }

  .hero-stat-value {
    font-size: 44px;
    font-weight: 800;
    letter-spacing: -2px;
    margin-bottom: 4px;
  }

  .hero-stat:nth-child(1) .hero-stat-value {
    background: linear-gradient(135deg, var(--accent-cyan), var(--accent-primary));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .hero-stat:nth-child(2) .hero-stat-value {
    background: linear-gradient(135deg, var(--accent-primary), var(--accent-pink));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .hero-stat:nth-child(3) .hero-stat-value {
    background: linear-gradient(135deg, var(--accent-green), var(--accent-cyan));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .hero-stat-label {
    font-size: 13px;
    color: var(--text-muted);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  /* Section Styles */
  section {
    padding: 140px 24px;
    position: relative;
  }

  .section-header {
    text-align: center;
    max-width: 700px;
    margin: 0 auto 80px;
  }

  .section-label {
    display: inline-block;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--accent-primary);
    margin-bottom: 16px;
    padding: 6px 14px;
    background: rgba(139, 92, 246, 0.1);
    border-radius: 6px;
  }

  .section-header h2 {
    font-size: 48px;
    font-weight: 800;
    margin-bottom: 20px;
    letter-spacing: -0.03em;
    background: linear-gradient(135deg, #fff 0%, var(--text-secondary) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .section-header p {
    font-size: 18px;
    color: var(--text-secondary);
    line-height: 1.8;
  }

  /* Problem/Solution */
  .problem-solution {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    max-width: 1000px;
    margin: 0 auto;
  }

  .problem-box, .solution-box {
    padding: 40px;
    border-radius: 24px;
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(20px);
    border: 1px solid var(--border-color);
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
  }

  .problem-box::before, .solution-box::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    border-radius: 24px 24px 0 0;
  }

  .problem-box::before {
    background: linear-gradient(90deg, var(--accent-orange), var(--accent-yellow));
  }

  .solution-box::before {
    background: linear-gradient(90deg, var(--accent-green), var(--accent-cyan));
  }

  .problem-box::after, .solution-box::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    opacity: 0;
    transition: opacity 0.4s ease;
    pointer-events: none;
  }

  .problem-box::after {
    background: radial-gradient(ellipse at top, rgba(251, 146, 60, 0.1), transparent 70%);
  }

  .solution-box::after {
    background: radial-gradient(ellipse at top, rgba(52, 211, 153, 0.1), transparent 70%);
  }

  .problem-box:hover, .solution-box:hover {
    transform: translateY(-6px);
    border-color: rgba(148, 163, 184, 0.2);
    box-shadow: 0 30px 60px rgba(0, 0, 0, 0.4);
  }

  .problem-box:hover::after, .solution-box:hover::after {
    opacity: 1;
  }

  .problem-box h3, .solution-box h3 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 3px;
    margin-bottom: 20px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .problem-box h3 { color: var(--accent-orange); }
  .solution-box h3 { color: var(--accent-green); }

  .problem-box p, .solution-box p {
    font-size: 16px;
    color: var(--text-secondary);
    line-height: 1.9;
  }

  /* Features Grid */
  .features-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .feature-card {
    padding: 36px;
    background: rgba(15, 23, 42, 0.5);
    backdrop-filter: blur(20px);
    border-radius: 24px;
    border: 1px solid var(--border-color);
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
  }

  .feature-card::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 24px;
    padding: 1px;
    background: linear-gradient(135deg, transparent, rgba(139, 92, 246, 0.3), transparent);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0;
    transition: opacity 0.4s ease;
  }

  .feature-card:hover {
    transform: translateY(-8px);
    box-shadow:
      0 30px 60px rgba(0, 0, 0, 0.4),
      0 0 60px rgba(139, 92, 246, 0.1);
  }

  .feature-card:hover::before {
    opacity: 1;
  }

  .feature-icon {
    width: 60px;
    height: 60px;
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(236, 72, 153, 0.1) 100%);
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;
    color: var(--accent-secondary);
    position: relative;
  }

  .feature-icon::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 16px;
    padding: 1px;
    background: linear-gradient(135deg, var(--accent-primary), var(--accent-pink));
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
  }

  .feature-icon svg {
    width: 28px;
    height: 28px;
  }

  .feature-card h3 {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 12px;
    color: var(--text-primary);
  }

  .feature-card p {
    font-size: 15px;
    color: var(--text-secondary);
    line-height: 1.75;
  }

  /* Use Cases */
  .use-cases-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    max-width: 1000px;
    margin: 0 auto;
  }

  .use-case {
    display: flex;
    gap: 20px;
    padding: 28px;
    background: rgba(15, 23, 42, 0.5);
    backdrop-filter: blur(20px);
    border-radius: 20px;
    border: 1px solid var(--border-color);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .use-case:hover {
    transform: translateX(6px);
    border-color: rgba(139, 92, 246, 0.3);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    background: rgba(15, 23, 42, 0.7);
  }

  .use-case-icon {
    width: 52px;
    height: 52px;
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(34, 211, 238, 0.1) 100%);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--accent-cyan);
  }

  .use-case h3 {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 8px;
    color: var(--text-primary);
  }

  .use-case p {
    font-size: 14px;
    color: var(--text-secondary);
    line-height: 1.7;
  }

  /* Comparison Table */
  .comparison-table {
    max-width: 900px;
    margin: 0 auto;
    background: rgba(15, 23, 42, 0.5);
    backdrop-filter: blur(20px);
    border-radius: 24px;
    border: 1px solid var(--border-color);
    overflow: hidden;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
  }

  .comparison-table table {
    width: 100%;
    border-collapse: collapse;
  }

  .comparison-table th,
  .comparison-table td {
    padding: 20px 32px;
    text-align: left;
    border-bottom: 1px solid var(--border-color);
  }

  .comparison-table th {
    background: rgba(30, 41, 59, 0.6);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--text-muted);
  }

  .comparison-table td {
    font-size: 14px;
    font-weight: 500;
  }

  .comparison-table tr {
    transition: background 0.2s ease;
  }

  .comparison-table tbody tr:hover {
    background: rgba(139, 92, 246, 0.05);
  }

  .comparison-table tr:last-child td {
    border-bottom: none;
  }

  .comparison-table td:first-child {
    color: var(--text-primary);
    font-weight: 600;
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
    background: rgba(3, 7, 18, 0.95);
    border: 1px solid var(--border-color);
    border-radius: 20px;
    padding: 28px 32px;
    font-family: 'JetBrains Mono', 'SF Mono', 'Monaco', monospace;
    font-size: 14px;
    line-height: 1.9;
    overflow-x: auto;
    position: relative;
    box-shadow:
      0 25px 50px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .code-block::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 48px;
    background: rgba(30, 41, 59, 0.5);
    border-radius: 20px 20px 0 0;
    border-bottom: 1px solid var(--border-color);
  }

  .code-block::after {
    content: '';
    position: absolute;
    top: 18px;
    left: 20px;
    width: 12px;
    height: 12px;
    background: #ff5f57;
    border-radius: 50%;
    box-shadow: 20px 0 0 #febc2e, 40px 0 0 #28c840;
  }

  .code-block pre {
    margin-top: 40px;
  }

  .code-block .comment {
    color: var(--text-muted);
    font-style: italic;
  }

  .code-block .keyword {
    color: var(--accent-pink);
  }

  .code-block .string {
    color: var(--accent-green);
  }

  .code-block .function {
    color: var(--accent-cyan);
  }

  /* Pricing Preview */
  .pricing-preview {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    max-width: 1100px;
    margin: 0 auto;
  }

  .pricing-card {
    background: rgba(15, 23, 42, 0.5);
    backdrop-filter: blur(20px);
    border-radius: 24px;
    border: 1px solid var(--border-color);
    padding: 36px 24px;
    text-align: center;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
  }

  .pricing-card:hover {
    transform: translateY(-8px);
    box-shadow: 0 30px 60px rgba(0, 0, 0, 0.4);
  }

  .pricing-card.featured {
    border-color: var(--accent-primary);
    background: linear-gradient(180deg, rgba(139, 92, 246, 0.15) 0%, rgba(15, 23, 42, 0.6) 50%);
    box-shadow: 0 0 60px rgba(139, 92, 246, 0.15);
  }

  .pricing-card.featured::before {
    content: 'Most Popular';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    background: linear-gradient(90deg, var(--accent-primary), var(--accent-pink));
    color: white;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    padding: 10px 12px;
  }

  .pricing-card.featured .pricing-content {
    margin-top: 24px;
  }

  .pricing-card h3 {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 16px;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--text-muted);
  }

  .pricing-card .price {
    font-size: 52px;
    font-weight: 800;
    margin-bottom: 8px;
    background: linear-gradient(135deg, #fff 0%, var(--text-secondary) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.03em;
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

  /* CTA Section */
  .cta-section {
    background: linear-gradient(135deg, var(--accent-primary) 0%, #6d28d9 50%, var(--accent-pink) 100%);
    position: relative;
    overflow: hidden;
    border-radius: 32px;
    margin: 0 24px;
    max-width: 1152px;
    margin-left: auto;
    margin-right: auto;
  }

  .cta-section::before {
    content: '';
    position: absolute;
    inset: 0;
    background: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
    opacity: 0.03;
    pointer-events: none;
  }

  .cta-content {
    position: relative;
    z-index: 1;
    padding: 80px 40px;
    text-align: center;
  }

  .cta-content h2 {
    font-size: 44px;
    font-weight: 800;
    margin-bottom: 16px;
    color: white;
  }

  .cta-content p {
    font-size: 18px;
    opacity: 0.9;
    margin-bottom: 32px;
    color: white;
  }

  /* Footer */
  footer {
    background: var(--bg-primary);
    border-top: 1px solid var(--border-color);
    padding: 80px 24px 40px;
    position: relative;
    margin-top: 80px;
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
    background: linear-gradient(135deg, #fff 0%, var(--accent-tertiary) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .footer-brand p {
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.8;
    max-width: 300px;
  }

  .footer-links h4 {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 20px;
    color: var(--text-muted);
  }

  .footer-links a {
    display: block;
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 14px;
    margin-bottom: 14px;
    transition: all 0.2s ease;
  }

  .footer-links a:hover {
    color: var(--accent-primary);
    transform: translateX(4px);
  }

  .footer-bottom {
    text-align: center;
    padding-top: 40px;
    margin-top: 60px;
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

    .hero h1 {
      font-size: 56px;
    }
  }

  @media (max-width: 900px) {
    .hero h1 {
      font-size: 44px;
      letter-spacing: -0.02em;
    }

    .hero .tagline {
      font-size: 17px;
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

    .cta-section {
      margin: 0 16px;
      border-radius: 24px;
    }

    .cta-content h2 {
      font-size: 32px;
    }
  }

  @media (max-width: 600px) {
    .hero {
      padding: 160px 20px 100px;
    }

    .hero h1 {
      font-size: 36px;
    }

    .hero-cta {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
    }

    .hero-stats {
      flex-direction: column;
      gap: 0;
    }

    .hero-stat {
      border-radius: 0 !important;
    }

    .hero-stat:first-child {
      border-radius: 20px 20px 0 0 !important;
    }

    .hero-stat:last-child {
      border-radius: 0 0 20px 20px !important;
    }

    .pricing-preview {
      grid-template-columns: 1fr;
    }

    .nav-links a:not(.btn) {
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
      padding: 16px 20px;
      font-size: 13px;
    }

    .cta-content {
      padding: 60px 24px;
    }

    .cta-content h2 {
      font-size: 28px;
    }
  }

  /* Animations */
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .hero h1 {
    animation: fadeInUp 0.8s ease forwards;
  }
`;

/**
 * GET / - Landing page
 */
landing.get('/', (c) => {
  const urls = getUrls(c.req);
  return c.html(html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unbrowser - Intelligent Web Browsing for AI Agents</title>
  <meta name="description" content="The browser that learns. Extract web content 10x faster as patterns are discovered. Built for AI agents, researchers, and developers.">

  <!-- SEO Meta Tags -->
  <meta name="keywords" content="web scraping, AI browser, intelligent browsing, web automation, API discovery, LLM browser, Claude MCP, web extraction">
  <meta name="author" content="Unbrowser">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://unbrowser.ai/">

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://unbrowser.ai/">
  <meta property="og:title" content="Unbrowser - Intelligent Web Browsing for AI Agents">
  <meta property="og:description" content="The browser that learns. Extract web content 10x faster as patterns are discovered. Built for AI agents, researchers, and developers.">
  <meta property="og:image" content="https://unbrowser.ai/og-image.png">
  <meta property="og:site_name" content="Unbrowser">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="https://unbrowser.ai/">
  <meta name="twitter:title" content="Unbrowser - Intelligent Web Browsing for AI Agents">
  <meta name="twitter:description" content="The browser that learns. Extract web content 10x faster as patterns are discovered. Built for AI agents, researchers, and developers.">
  <meta name="twitter:image" content="https://unbrowser.ai/og-image.png">

  <!-- Favicon -->
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%238b5cf6'/%3E%3Cstop offset='100%25' stop-color='%23f472b6'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='32' height='32' rx='8' fill='url(%23g)'/%3E%3Ccircle cx='16' cy='16' r='8' fill='none' stroke='white' stroke-width='2'/%3E%3Cpath d='M16 8a8 8 0 0 1 0 16' fill='none' stroke='white' stroke-width='2'/%3E%3Cpath d='M16 16l5-5' stroke='white' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E">
  <link rel="apple-touch-icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 180 180'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%238b5cf6'/%3E%3Cstop offset='100%25' stop-color='%23f472b6'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='180' height='180' rx='40' fill='url(%23g)'/%3E%3Ccircle cx='90' cy='90' r='45' fill='none' stroke='white' stroke-width='10'/%3E%3Cpath d='M90 45a45 45 0 0 1 0 90' fill='none' stroke='white' stroke-width='10'/%3E%3Cpath d='M90 90l28-28' stroke='white' stroke-width='10' stroke-linecap='round'/%3E%3C/svg%3E">

  <!-- Theme Color -->
  <meta name="theme-color" content="#030712">
  <meta name="msapplication-TileColor" content="#8b5cf6">

  <!-- Structured Data -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Unbrowser",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "Cross-platform",
    "description": "Intelligent web browsing API for AI agents. Learn patterns, discover APIs, and extract content 10x faster.",
    "url": "https://unbrowser.ai",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
      "description": "Free tier with 100 requests/day"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "ratingCount": "100"
    },
    "featureList": [
      "Tiered intelligent rendering",
      "Automatic API discovery",
      "Collective learning",
      "Built-in content verification",
      "Session persistence",
      "Stealth mode",
      "Content change predictions"
    ]
  }
  </script>

  <style>${landingStyles}</style>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body>
  <!-- Animated gradient background -->
  <div class="gradient-bg"></div>

  <!-- Floating orbs -->
  <div class="orbs">
    <div class="orb orb-1"></div>
    <div class="orb orb-2"></div>
    <div class="orb orb-3"></div>
  </div>

  <!-- Grid pattern -->
  <div class="grid-pattern"></div>

  <!-- Navigation -->
  <header>
    <nav aria-label="Main navigation">
      <div class="nav-inner">
        <a href="${urls.home}" class="nav-logo" aria-label="Unbrowser - Home">
          <div class="nav-logo-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 2a10 10 0 0 1 0 20"/>
              <path d="M12 12l6-6"/>
            </svg>
          </div>
          <span class="nav-logo-text">Unbrowser</span>
        </a>
      <div class="nav-links">
        <a href="#features">Features</a>
        <a href="#use-cases">Use Cases</a>
        <a href="${urls.pricing}">Pricing</a>
        <a href="${urls.docs}">Docs</a>
        <a href="${urls.authLogin}">Sign In</a>
        <a href="${urls.authSignup}" class="btn btn-primary">Get Started</a>
      </div>
    </div>
    </nav>
  </header>

  <main>
  <!-- Hero Section -->
  <section class="hero">
    <div class="container">
      <div class="hero-badge">
        <span class="hero-badge-dot"></span>
        Now in public beta
      </div>
      <h1><span class="gradient-text">Intelligent Web Browsing</span><br><span class="highlight">for AI Agents</span></h1>
      <p class="tagline">
        The browser that learns. Extract web content 10x faster as patterns are discovered.
        Built for AI agents, researchers, and developers.
      </p>
      <div class="hero-cta">
        <a href="${urls.authSignup}" class="btn btn-primary btn-lg">Get Started Free</a>
        <a href="${urls.docs}" class="btn btn-outline btn-lg">View Documentation</a>
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
        <span class="section-label">Features</span>
        <h2>Everything you need to browse intelligently</h2>
        <p>From tiered rendering to collective learning, Unbrowser handles the complexity so you can focus on building</p>
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

        <div class="feature-card">
          <div class="feature-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 11v4m0 0l-2-2m2 2l2-2"/>
            </svg>
          </div>
          <h3>Content Change Predictions</h3>
          <p>
            Predict when content will change based on calendar triggers and seasonal patterns.
            Get urgency-ranked alerts for government portals, annual updates, and time-sensitive content.
          </p>
        </div>
      </div>
    </div>
  </section>

  <!-- Use Cases -->
  <section id="use-cases">
    <div class="container">
      <div class="section-header">
        <span class="section-label">Use Cases</span>
        <h2>Built for AI agents and modern automation</h2>
        <p>From research automation to QA testing, see how teams are using Unbrowser</p>
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

        <div class="use-case">
          <div class="use-case-icon">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
            </svg>
          </div>
          <div>
            <h3>Government Portal Monitoring</h3>
            <p>Predict when government sites update with calendar-aware triggers. Get urgency alerts for annual deadlines, seasonal changes, and critical updates.</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Comparison -->
  <section>
    <div class="container">
      <div class="section-header">
        <span class="section-label">Comparison</span>
        <h2>What Sets Us Apart</h2>
        <p>See how Unbrowser compares to traditional scraping solutions</p>
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
            <tr>
              <td>Content change prediction</td>
              <td>Manual polling</td>
              <td>Calendar-aware urgency alerts</td>
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
        <span class="section-label">Developer Experience</span>
        <h2>Simple to Use</h2>
        <p>Get started with just a few lines of code</p>
      </div>

      <div class="code-example">
        <div class="code-block">
<pre><span class="keyword">import</span> { createUnbrowser } <span class="keyword">from</span> <span class="string">'unbrowser-core'</span>;

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
        <span class="section-label">Pricing</span>
        <h2>Simple, transparent pricing</h2>
        <p>Start free, scale as you grow. No hidden fees.</p>
      </div>

      <div class="pricing-preview">
        <div class="pricing-card">
          <h3>Free</h3>
          <div class="price">$0</div>
          <div class="requests">100 requests/day</div>
          <a href="${urls.authSignup}" class="btn btn-outline">Get Started</a>
        </div>

        <div class="pricing-card">
          <h3>Starter</h3>
          <div class="price">$29<span>/mo</span></div>
          <div class="requests">1,000 requests/day</div>
          <a href="${urls.authSignup}" class="btn btn-outline">Get Started</a>
        </div>

        <div class="pricing-card featured">
          <h3>Team</h3>
          <div class="price">$99<span>/mo</span></div>
          <div class="requests">10,000 requests/day</div>
          <a href="${urls.authSignup}" class="btn btn-primary">Get Started</a>
        </div>

        <div class="pricing-card">
          <h3>Enterprise</h3>
          <div class="price">Custom</div>
          <div class="requests">Unlimited requests</div>
          <a href="mailto:hello@unbrowser.ai" class="btn btn-outline">Contact Us</a>
        </div>
      </div>

      <p style="text-align: center; margin-top: 32px; color: var(--text-muted);">
        <a href="${urls.pricing}" style="color: var(--accent-secondary);">View full pricing details and calculator</a>
      </p>
    </div>
  </section>

  <!-- CTA -->
  <section class="cta-section">
    <div class="cta-content">
      <h2>Ready to browse smarter?</h2>
      <p>Get started for free. No credit card required.</p>
      <a href="${urls.authSignup}" class="btn btn-lg" style="background: white; color: var(--accent-primary);">
        Start Free Trial
      </a>
    </div>
  </section>
  </main>

  <!-- Footer -->
  <footer role="contentinfo">
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
        <a href="${urls.docs}">Documentation</a>
        <a href="${urls.pricing}">Pricing</a>
        <a href="${urls.llmTxt}">LLM Reference</a>
        <a href="${urls.status}">Status</a>
      </div>

      <div class="footer-links">
        <h4>Resources</h4>
        <a href="${urls.docs}">API Reference</a>
        <a href="${urls.docs}/quickstart">Quick Start</a>
        <a href="${urls.docs}/examples">Examples</a>
        <a href="${urls.github}">GitHub</a>
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
