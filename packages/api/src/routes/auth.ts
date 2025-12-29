/**
 * Authentication Routes
 *
 * Handles user signup, login, logout, email verification, password reset,
 * and OAuth flows (Google, GitHub).
 */

import { Hono } from 'hono';
import { html } from 'hono/html';
import { randomBytes } from 'crypto';
import { HTTPException } from 'hono/http-exception';
import { getTenantStore, type CreateTenantInput } from '../services/tenants.js';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../services/password.js';
import { sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } from '../services/email.js';
import {
  createSession,
  destroySession,
  validateSession,
} from '../services/session.js';
import {
  generateOAuthState,
  validateOAuthState,
  getGoogleAuthUrl,
  getGitHubAuthUrl,
  exchangeGoogleCode,
  exchangeGitHubCode,
  normalizeGoogleUser,
  normalizeGitHubUser,
  isGoogleOAuthConfigured,
  isGitHubOAuthConfigured,
  type OAuthAccountData,
} from '../services/oauth.js';
import {
  loginRateLimit,
  signupRateLimit,
  passwordResetRateLimit,
  verifyEmailRateLimit,
  clearRateLimit,
  getClientIP,
} from '../middleware/auth-rate-limit.js';

export const auth = new Hono();

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a verification token
 */
function generateVerificationToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Get expiry date for verification token (24 hours)
 */
function getVerificationTokenExpiry(): Date {
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

/**
 * Get expiry date for password reset token (1 hour)
 */
function getPasswordResetTokenExpiry(): Date {
  return new Date(Date.now() + 60 * 60 * 1000);
}

/**
 * Get app URL
 */
function getAppUrl(): string {
  return process.env.APP_URL || 'http://localhost:3001';
}

/**
 * Check if email looks valid
 */
function isValidEmail(email: string): boolean {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

// =============================================================================
// Shared Styles
// =============================================================================

const authStyles = `
  :root {
    --bg-primary: #030712;
    --bg-secondary: #0f172a;
    --bg-tertiary: #1e293b;
    --text-primary: #f8fafc;
    --text-secondary: #94a3b8;
    --text-muted: #64748b;
    --accent-primary: #6366f1;
    --accent-secondary: #8b5cf6;
    --accent-green: #10b981;
    --accent-red: #ef4444;
    --border-color: rgba(148, 163, 184, 0.1);
    --border-glow: rgba(99, 102, 241, 0.3);
    --input-bg: rgba(15, 23, 42, 0.8);
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow-x: hidden;
  }

  body::before {
    content: '';
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
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .auth-card {
    background: rgba(15, 23, 42, 0.8);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 24px;
    padding: 48px 44px;
    width: 100%;
    max-width: 440px;
    border: 1px solid var(--border-color);
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
    position: relative;
    overflow: hidden;
  }

  .auth-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), transparent);
  }

  .logo {
    text-align: center;
    margin-bottom: 36px;
  }

  .logo h1 {
    font-size: 32px;
    font-weight: 800;
    margin-bottom: 8px;
    background: linear-gradient(135deg, #fff 0%, #a5b4fc 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.5px;
  }

  .logo p {
    color: var(--text-secondary);
    font-size: 14px;
    font-weight: 500;
  }

  h2 {
    font-size: 26px;
    font-weight: 700;
    margin-bottom: 8px;
    text-align: center;
    background: linear-gradient(135deg, #fff 0%, #a5b4fc 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .subtitle {
    color: var(--text-secondary);
    text-align: center;
    margin-bottom: 28px;
    font-size: 14px;
    font-weight: 500;
  }

  .form-group {
    margin-bottom: 24px;
  }

  label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 10px;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  input[type="text"],
  input[type="email"],
  input[type="password"] {
    width: 100%;
    padding: 14px 18px;
    background: var(--input-bg);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 500;
    transition: all 0.3s ease;
  }

  input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15), 0 0 20px rgba(99, 102, 241, 0.1);
  }

  input::placeholder {
    color: var(--text-muted);
    font-weight: 400;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 14px 24px;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    border: none;
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

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .btn-outline {
    background: transparent;
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  .btn-outline:hover {
    background: rgba(99, 102, 241, 0.1);
    border-color: var(--accent-primary);
  }

  .divider {
    display: flex;
    align-items: center;
    margin: 28px 0;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--border-color), transparent);
  }

  .divider span {
    padding: 0 20px;
  }

  .oauth-buttons {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .oauth-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
    padding: 14px 24px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    border: 1px solid var(--border-color);
    background: rgba(30, 41, 59, 0.6);
    color: var(--text-primary);
    text-decoration: none;
  }

  .oauth-btn:hover {
    background: rgba(99, 102, 241, 0.1);
    border-color: var(--border-glow);
    transform: translateY(-2px);
  }

  .oauth-btn svg {
    width: 20px;
    height: 20px;
  }

  .links {
    margin-top: 28px;
    text-align: center;
    font-size: 14px;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .links a {
    color: var(--accent-primary);
    text-decoration: none;
    transition: color 0.2s ease;
  }

  .links a:hover {
    color: var(--accent-secondary);
  }

  .alert {
    padding: 14px 18px;
    border-radius: 12px;
    margin-bottom: 24px;
    font-size: 14px;
    font-weight: 500;
    backdrop-filter: blur(10px);
  }

  .alert-error {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
  }

  .alert-success {
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #6ee7b7;
  }

  .alert-info {
    background: rgba(99, 102, 241, 0.15);
    border: 1px solid rgba(99, 102, 241, 0.3);
    color: #a5b4fc;
  }

  .password-requirements {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 10px;
    line-height: 1.5;
  }

  .footer {
    text-align: center;
    padding: 28px;
    color: var(--text-muted);
    font-size: 13px;
  }

  .footer a {
    color: var(--text-secondary);
    text-decoration: none;
    transition: color 0.2s ease;
  }

  .footer a:hover {
    color: var(--accent-primary);
  }

  /* Animation */
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .auth-card {
    animation: fadeIn 0.4s ease forwards;
  }
`;

// =============================================================================
// Signup Routes
// =============================================================================

/**
 * GET /signup - Signup page
 */
auth.get('/signup', (c) => {
  const error = c.req.query('error');
  const email = c.req.query('email') || '';

  return c.html(html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign Up - Unbrowser</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>${authStyles}</style>
</head>
<body>
  <div class="container">
    <div class="auth-card">
      <div class="logo">
        <h1>Unbrowser</h1>
        <p>Intelligent Web Browsing for AI Agents</p>
      </div>

      <h2>Create your account</h2>
      <p class="subtitle">Start browsing the web intelligently</p>

      ${error ? html`<div class="alert alert-error">${decodeURIComponent(error)}</div>` : ''}

      <div class="oauth-buttons">
        ${isGoogleOAuthConfigured() ? html`
          <a href="/auth/google" class="oauth-btn">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </a>
        ` : ''}
        ${isGitHubOAuthConfigured() ? html`
          <a href="/auth/github" class="oauth-btn">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            Continue with GitHub
          </a>
        ` : ''}
      </div>

      ${(isGoogleOAuthConfigured() || isGitHubOAuthConfigured()) ? html`
        <div class="divider"><span>or</span></div>
      ` : ''}

      <form method="POST" action="/auth/signup">
        <div class="form-group">
          <label for="name">Full Name</label>
          <input type="text" id="name" name="name" placeholder="John Doe" required>
        </div>

        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" placeholder="you@example.com" value="${email}" required>
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" placeholder="Create a password" required minlength="8">
          <p class="password-requirements">At least 8 characters with uppercase, lowercase, and number</p>
        </div>

        <button type="submit" class="btn btn-primary">Create Account</button>
      </form>

      <div class="links">
        Already have an account? <a href="/auth/login">Sign in</a>
      </div>
    </div>
  </div>

  <footer class="footer">
    <a href="/">Home</a> | <a href="/pricing">Pricing</a> | <a href="/docs">API Docs</a>
  </footer>
</body>
</html>`);
});

/**
 * POST /signup - Handle signup form submission
 */
auth.post('/signup', signupRateLimit, async (c) => {
  const tenantStore = getTenantStore();
  if (!tenantStore) {
    throw new HTTPException(500, { message: 'Tenant store not configured' });
  }

  const body = await c.req.parseBody();
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  // Validation
  if (!name || !email || !password) {
    return c.redirect(`/auth/signup?error=${encodeURIComponent('All fields are required')}&email=${encodeURIComponent(email)}`);
  }

  if (!isValidEmail(email)) {
    return c.redirect(`/auth/signup?error=${encodeURIComponent('Invalid email address')}&email=${encodeURIComponent(email)}`);
  }

  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    return c.redirect(`/auth/signup?error=${encodeURIComponent(passwordValidation.errors.join('. '))}&email=${encodeURIComponent(email)}`);
  }

  // Check if email already exists
  const existingTenant = await tenantStore.findByEmail(email);
  if (existingTenant) {
    // Don't reveal that the email exists - use generic message
    return c.redirect(`/auth/signup?error=${encodeURIComponent('Unable to create account. Please try a different email.')}&email=${encodeURIComponent(email)}`);
  }

  // Create tenant
  const passwordHash = await hashPassword(password);
  const verificationToken = generateVerificationToken();
  const verificationTokenExpiresAt = getVerificationTokenExpiry();

  const tenantData: CreateTenantInput = {
    name,
    email,
    passwordHash,
    verificationToken,
    verificationTokenExpiresAt,
  };

  try {
    const tenant = await tenantStore.create(tenantData);

    // Send verification email
    await sendVerificationEmail(email, verificationToken, name);

    // Create session
    await createSession(c, tenant.id);

    // Redirect to verification required page
    return c.redirect('/auth/verify-email-required');
  } catch (error) {
    console.error('[Auth] Signup error:', error);
    return c.redirect(`/auth/signup?error=${encodeURIComponent('An error occurred. Please try again.')}&email=${encodeURIComponent(email)}`);
  }
});

// =============================================================================
// Login Routes
// =============================================================================

/**
 * GET /login - Login page
 */
auth.get('/login', (c) => {
  const error = c.req.query('error');
  const success = c.req.query('success');
  const redirect = c.req.query('redirect') || '/dashboard';
  const email = c.req.query('email') || '';

  return c.html(html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In - Unbrowser</title>
  <style>${authStyles}</style>
</head>
<body>
  <div class="container">
    <div class="auth-card">
      <div class="logo">
        <h1>Unbrowser</h1>
        <p>Intelligent Web Browsing for AI Agents</p>
      </div>

      <h2>Welcome back</h2>
      <p class="subtitle">Sign in to your account</p>

      ${error ? html`<div class="alert alert-error">${decodeURIComponent(error)}</div>` : ''}
      ${success ? html`<div class="alert alert-success">${decodeURIComponent(success)}</div>` : ''}

      <div class="oauth-buttons">
        ${isGoogleOAuthConfigured() ? html`
          <a href="/auth/google?redirect=${encodeURIComponent(redirect)}" class="oauth-btn">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </a>
        ` : ''}
        ${isGitHubOAuthConfigured() ? html`
          <a href="/auth/github?redirect=${encodeURIComponent(redirect)}" class="oauth-btn">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            Continue with GitHub
          </a>
        ` : ''}
      </div>

      ${(isGoogleOAuthConfigured() || isGitHubOAuthConfigured()) ? html`
        <div class="divider"><span>or</span></div>
      ` : ''}

      <form method="POST" action="/auth/login">
        <input type="hidden" name="redirect" value="${redirect}">

        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" placeholder="you@example.com" value="${email}" required>
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" placeholder="Your password" required>
        </div>

        <button type="submit" class="btn btn-primary">Sign In</button>
      </form>

      <div class="links">
        <a href="/auth/forgot-password">Forgot your password?</a>
        <br><br>
        Don't have an account? <a href="/auth/signup">Sign up</a>
      </div>
    </div>
  </div>

  <footer class="footer">
    <a href="/">Home</a> | <a href="/pricing">Pricing</a> | <a href="/docs">API Docs</a>
  </footer>
</body>
</html>`);
});

/**
 * POST /login - Handle login form submission
 */
auth.post('/login', loginRateLimit, async (c) => {
  const tenantStore = getTenantStore();
  if (!tenantStore) {
    throw new HTTPException(500, { message: 'Tenant store not configured' });
  }

  const body = await c.req.parseBody();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const redirect = String(body.redirect || '/dashboard');

  // Generic error message to prevent user enumeration
  const loginFailedMessage = 'Invalid email or password';

  if (!email || !password) {
    return c.redirect(`/auth/login?error=${encodeURIComponent(loginFailedMessage)}&redirect=${encodeURIComponent(redirect)}`);
  }

  const tenant = await tenantStore.findByEmail(email);

  if (!tenant || !tenant.passwordHash) {
    // No account or no password (OAuth only account)
    return c.redirect(`/auth/login?error=${encodeURIComponent(loginFailedMessage)}&redirect=${encodeURIComponent(redirect)}`);
  }

  const isValid = await verifyPassword(tenant.passwordHash, password);
  if (!isValid) {
    return c.redirect(`/auth/login?error=${encodeURIComponent(loginFailedMessage)}&redirect=${encodeURIComponent(redirect)}`);
  }

  // Clear rate limit on successful login
  clearRateLimit('login', getClientIP(c));

  // Create session
  await createSession(c, tenant.id);

  // Check if email is verified
  if (!tenant.emailVerifiedAt) {
    return c.redirect('/auth/verify-email-required');
  }

  return c.redirect(redirect);
});

/**
 * POST /logout - Handle logout
 */
auth.post('/logout', async (c) => {
  await destroySession(c);
  return c.redirect('/auth/login?success=' + encodeURIComponent('You have been logged out'));
});

/**
 * GET /logout - Handle logout (for links)
 */
auth.get('/logout', async (c) => {
  await destroySession(c);
  return c.redirect('/auth/login?success=' + encodeURIComponent('You have been logged out'));
});

// =============================================================================
// Email Verification Routes
// =============================================================================

/**
 * GET /verify-email-required - Page shown when email not verified
 */
auth.get('/verify-email-required', async (c) => {
  const session = await validateSession(c);

  return c.html(html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email - Unbrowser</title>
  <style>${authStyles}</style>
</head>
<body>
  <div class="container">
    <div class="auth-card">
      <div class="logo">
        <h1>Unbrowser</h1>
      </div>

      <h2>Check your email</h2>

      <div class="alert alert-info" style="margin-top: 24px;">
        We've sent you a verification email. Please click the link in the email to verify your account.
      </div>

      <p class="subtitle" style="margin-top: 24px;">
        The link will expire in 24 hours. If you don't see the email, check your spam folder.
      </p>

      ${session ? html`
        <form method="POST" action="/auth/resend-verification" style="margin-top: 24px;">
          <button type="submit" class="btn btn-outline">Resend Verification Email</button>
        </form>
      ` : ''}

      <div class="links" style="margin-top: 24px;">
        <a href="/auth/login">Back to login</a>
      </div>
    </div>
  </div>
</body>
</html>`);
});

/**
 * GET /verify-email - Verify email with token
 */
auth.get('/verify-email', verifyEmailRateLimit, async (c) => {
  const token = c.req.query('token');

  if (!token) {
    return c.redirect('/auth/login?error=' + encodeURIComponent('Invalid verification link'));
  }

  const tenantStore = getTenantStore();
  if (!tenantStore) {
    throw new HTTPException(500, { message: 'Tenant store not configured' });
  }

  const tenant = await tenantStore.findByVerificationToken(token);
  if (!tenant) {
    return c.redirect('/auth/login?error=' + encodeURIComponent('Invalid or expired verification link'));
  }

  // Mark email as verified
  await tenantStore.setEmailVerified(tenant.id);

  // Send welcome email
  await sendWelcomeEmail(tenant.email, tenant.name);

  // Create or update session
  await createSession(c, tenant.id);

  return c.redirect('/dashboard?welcome=1');
});

/**
 * POST /resend-verification - Resend verification email
 */
auth.post('/resend-verification', async (c) => {
  const session = await validateSession(c);
  if (!session) {
    return c.redirect('/auth/login');
  }

  const tenantStore = getTenantStore();
  if (!tenantStore) {
    throw new HTTPException(500, { message: 'Tenant store not configured' });
  }

  const tenant = await tenantStore.findById(session.tenantId);
  if (!tenant) {
    return c.redirect('/auth/login');
  }

  if (tenant.emailVerifiedAt) {
    return c.redirect('/dashboard');
  }

  // Generate new verification token
  const verificationToken = generateVerificationToken();
  const verificationTokenExpiresAt = getVerificationTokenExpiry();

  await tenantStore.setVerificationToken(tenant.id, verificationToken, verificationTokenExpiresAt);
  await sendVerificationEmail(tenant.email, verificationToken, tenant.name);

  return c.redirect('/auth/verify-email-required');
});

// =============================================================================
// Password Reset Routes
// =============================================================================

/**
 * GET /forgot-password - Forgot password page
 */
auth.get('/forgot-password', (c) => {
  const success = c.req.query('success');
  const error = c.req.query('error');

  return c.html(html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Password - Unbrowser</title>
  <style>${authStyles}</style>
</head>
<body>
  <div class="container">
    <div class="auth-card">
      <div class="logo">
        <h1>Unbrowser</h1>
      </div>

      <h2>Reset your password</h2>
      <p class="subtitle">Enter your email and we'll send you a reset link</p>

      ${error ? html`<div class="alert alert-error">${decodeURIComponent(error)}</div>` : ''}
      ${success ? html`<div class="alert alert-success">${decodeURIComponent(success)}</div>` : ''}

      <form method="POST" action="/auth/forgot-password">
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" placeholder="you@example.com" required>
        </div>

        <button type="submit" class="btn btn-primary">Send Reset Link</button>
      </form>

      <div class="links">
        <a href="/auth/login">Back to login</a>
      </div>
    </div>
  </div>
</body>
</html>`);
});

/**
 * POST /forgot-password - Handle forgot password form
 */
auth.post('/forgot-password', passwordResetRateLimit, async (c) => {
  const tenantStore = getTenantStore();
  if (!tenantStore) {
    throw new HTTPException(500, { message: 'Tenant store not configured' });
  }

  const body = await c.req.parseBody();
  const email = String(body.email || '').trim().toLowerCase();

  // Always show success to prevent email enumeration
  const successMessage = 'If an account with that email exists, we\'ve sent a password reset link.';

  if (!email || !isValidEmail(email)) {
    return c.redirect('/auth/forgot-password?success=' + encodeURIComponent(successMessage));
  }

  const tenant = await tenantStore.findByEmail(email);

  if (tenant && tenant.passwordHash) {
    // Only send reset if account has a password (not OAuth-only)
    const resetToken = generateVerificationToken();
    const resetTokenExpiresAt = getPasswordResetTokenExpiry();

    await tenantStore.setPasswordResetToken(tenant.id, resetToken, resetTokenExpiresAt);
    await sendPasswordResetEmail(tenant.email, resetToken);
  }

  return c.redirect('/auth/forgot-password?success=' + encodeURIComponent(successMessage));
});

/**
 * GET /reset-password - Reset password page
 */
auth.get('/reset-password', async (c) => {
  const token = c.req.query('token');
  const error = c.req.query('error');

  if (!token) {
    return c.redirect('/auth/login?error=' + encodeURIComponent('Invalid reset link'));
  }

  const tenantStore = getTenantStore();
  if (!tenantStore) {
    throw new HTTPException(500, { message: 'Tenant store not configured' });
  }

  const tenant = await tenantStore.findByPasswordResetToken(token);
  if (!tenant) {
    return c.redirect('/auth/login?error=' + encodeURIComponent('Invalid or expired reset link'));
  }

  return c.html(html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Set New Password - Unbrowser</title>
  <style>${authStyles}</style>
</head>
<body>
  <div class="container">
    <div class="auth-card">
      <div class="logo">
        <h1>Unbrowser</h1>
      </div>

      <h2>Set new password</h2>
      <p class="subtitle">Enter your new password below</p>

      ${error ? html`<div class="alert alert-error">${decodeURIComponent(error)}</div>` : ''}

      <form method="POST" action="/auth/reset-password">
        <input type="hidden" name="token" value="${token}">

        <div class="form-group">
          <label for="password">New Password</label>
          <input type="password" id="password" name="password" placeholder="Enter new password" required minlength="8">
          <p class="password-requirements">At least 8 characters with uppercase, lowercase, and number</p>
        </div>

        <div class="form-group">
          <label for="confirmPassword">Confirm Password</label>
          <input type="password" id="confirmPassword" name="confirmPassword" placeholder="Confirm new password" required>
        </div>

        <button type="submit" class="btn btn-primary">Reset Password</button>
      </form>
    </div>
  </div>
</body>
</html>`);
});

/**
 * POST /reset-password - Handle password reset form
 */
auth.post('/reset-password', async (c) => {
  const tenantStore = getTenantStore();
  if (!tenantStore) {
    throw new HTTPException(500, { message: 'Tenant store not configured' });
  }

  const body = await c.req.parseBody();
  const token = String(body.token || '');
  const password = String(body.password || '');
  const confirmPassword = String(body.confirmPassword || '');

  if (!token) {
    return c.redirect('/auth/login?error=' + encodeURIComponent('Invalid reset link'));
  }

  if (password !== confirmPassword) {
    return c.redirect(`/auth/reset-password?token=${token}&error=` + encodeURIComponent('Passwords do not match'));
  }

  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    return c.redirect(`/auth/reset-password?token=${token}&error=` + encodeURIComponent(passwordValidation.errors.join('. ')));
  }

  const tenant = await tenantStore.findByPasswordResetToken(token);
  if (!tenant) {
    return c.redirect('/auth/login?error=' + encodeURIComponent('Invalid or expired reset link'));
  }

  // Update password
  const passwordHash = await hashPassword(password);
  await tenantStore.setPasswordHash(tenant.id, passwordHash);
  await tenantStore.setPasswordResetToken(tenant.id, null, null);

  // If email wasn't verified, verify it now
  if (!tenant.emailVerifiedAt) {
    await tenantStore.setEmailVerified(tenant.id);
  }

  return c.redirect('/auth/login?success=' + encodeURIComponent('Your password has been reset. Please log in.'));
});

// =============================================================================
// OAuth Routes
// =============================================================================

/**
 * GET /google - Initiate Google OAuth
 */
auth.get('/google', (c) => {
  if (!isGoogleOAuthConfigured()) {
    return c.redirect('/auth/login?error=' + encodeURIComponent('Google login is not configured'));
  }

  const redirect = c.req.query('redirect');
  const state = generateOAuthState('google', redirect);
  const authUrl = getGoogleAuthUrl(state);

  return c.redirect(authUrl);
});

/**
 * GET /google/callback - Google OAuth callback
 */
auth.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const errorParam = c.req.query('error');

  if (errorParam) {
    return c.redirect('/auth/login?error=' + encodeURIComponent('Google login was cancelled'));
  }

  if (!code || !state) {
    return c.redirect('/auth/login?error=' + encodeURIComponent('Invalid OAuth response'));
  }

  // Validate state
  const stateResult = validateOAuthState(state, 'google');
  if (!stateResult.valid) {
    return c.redirect('/auth/login?error=' + encodeURIComponent('Invalid OAuth state'));
  }

  try {
    const googleUser = await exchangeGoogleCode(code);
    const oauthData = normalizeGoogleUser(googleUser);

    const redirectTo = stateResult.redirectTo || '/dashboard';
    return handleOAuthCallback(c, oauthData, redirectTo);
  } catch (error) {
    console.error('[OAuth] Google callback error:', error);
    return c.redirect('/auth/login?error=' + encodeURIComponent('Failed to authenticate with Google'));
  }
});

/**
 * GET /github - Initiate GitHub OAuth
 */
auth.get('/github', (c) => {
  if (!isGitHubOAuthConfigured()) {
    return c.redirect('/auth/login?error=' + encodeURIComponent('GitHub login is not configured'));
  }

  const redirect = c.req.query('redirect');
  const state = generateOAuthState('github', redirect);
  const authUrl = getGitHubAuthUrl(state);

  return c.redirect(authUrl);
});

/**
 * GET /github/callback - GitHub OAuth callback
 */
auth.get('/github/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const errorParam = c.req.query('error');

  if (errorParam) {
    return c.redirect('/auth/login?error=' + encodeURIComponent('GitHub login was cancelled'));
  }

  if (!code || !state) {
    return c.redirect('/auth/login?error=' + encodeURIComponent('Invalid OAuth response'));
  }

  // Validate state
  const stateResult = validateOAuthState(state, 'github');
  if (!stateResult.valid) {
    return c.redirect('/auth/login?error=' + encodeURIComponent('Invalid OAuth state'));
  }

  try {
    const githubUser = await exchangeGitHubCode(code);
    const oauthData = normalizeGitHubUser(githubUser);

    if (!oauthData) {
      return c.redirect('/auth/login?error=' + encodeURIComponent('Could not retrieve email from GitHub. Please ensure your email is public or try another login method.'));
    }

    const redirectTo = stateResult.redirectTo || '/dashboard';
    return handleOAuthCallback(c, oauthData, redirectTo);
  } catch (error) {
    console.error('[OAuth] GitHub callback error:', error);
    return c.redirect('/auth/login?error=' + encodeURIComponent('Failed to authenticate with GitHub'));
  }
});

/**
 * Handle OAuth callback - find or create user
 */
async function handleOAuthCallback(c: any, oauthData: OAuthAccountData, redirectTo: string) {
  const tenantStore = getTenantStore();
  if (!tenantStore) {
    throw new HTTPException(500, { message: 'Tenant store not configured' });
  }

  // Check if OAuth account already linked
  let tenant = await tenantStore.findByOAuthAccount(oauthData.provider, oauthData.providerAccountId);

  if (tenant) {
    // Existing OAuth user - log them in
    await createSession(c, tenant.id);
    return c.redirect(redirectTo);
  }

  // Check if email already exists
  tenant = await tenantStore.findByEmail(oauthData.email);

  if (tenant) {
    // Link OAuth account to existing tenant
    await tenantStore.createOAuthAccount(tenant.id, oauthData.provider, oauthData.providerAccountId);

    // Mark email as verified if not already
    if (!tenant.emailVerifiedAt) {
      await tenantStore.setEmailVerified(tenant.id);
    }

    await createSession(c, tenant.id);
    return c.redirect(redirectTo);
  }

  // Create new tenant
  const tenantData: CreateTenantInput = {
    name: oauthData.name,
    email: oauthData.email,
  };

  tenant = await tenantStore.create(tenantData);

  // Link OAuth account
  await tenantStore.createOAuthAccount(tenant.id, oauthData.provider, oauthData.providerAccountId);

  // Mark email as verified (OAuth providers verify emails)
  await tenantStore.setEmailVerified(tenant.id);

  // Send welcome email
  await sendWelcomeEmail(tenant.email, tenant.name);

  await createSession(c, tenant.id);
  return c.redirect('/dashboard?welcome=1');
}
