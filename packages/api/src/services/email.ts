/**
 * Email Service
 *
 * Handles transactional emails using Resend.
 * Provides templates for verification, password reset, and welcome emails.
 */

import { Resend } from 'resend';

let resendClient: Resend | null = null;

/**
 * Get the Resend client (lazy initialization)
 */
function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

/**
 * Check if email service is configured
 */
export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/**
 * Get the app URL for links
 */
function getAppUrl(): string {
  return process.env.APP_URL || 'http://localhost:3001';
}

/**
 * Get the from address
 */
function getFromAddress(): string {
  return process.env.EMAIL_FROM || 'Unbrowser <noreply@unbrowser.ai>';
}

/**
 * Send email verification email
 */
export async function sendVerificationEmail(
  email: string,
  verificationToken: string,
  name: string
): Promise<{ success: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    console.warn('[Email] Resend not configured, skipping verification email');
    return { success: false, error: 'Email service not configured' };
  }

  const client = getResendClient();
  const appUrl = getAppUrl();
  const verifyUrl = `${appUrl}/auth/verify-email?token=${verificationToken}`;

  try {
    await client.emails.send({
      from: getFromAddress(),
      to: email,
      subject: 'Verify your Unbrowser account',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Unbrowser!</h1>
  </div>

  <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px;">Hi ${escapeHtml(name)},</p>

    <p style="font-size: 16px;">Thanks for signing up! Please verify your email address to get started with Unbrowser.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${verifyUrl}" style="background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Verify Email Address</a>
    </div>

    <p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
    <p style="font-size: 12px; color: #888; word-break: break-all; background: #e9ecef; padding: 10px; border-radius: 4px;">${verifyUrl}</p>

    <p style="font-size: 14px; color: #666; margin-top: 30px;">This link expires in 24 hours.</p>

    <p style="font-size: 14px; color: #666;">If you didn't create an account with Unbrowser, you can safely ignore this email.</p>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="font-size: 12px; color: #888; text-align: center;">
      Unbrowser - Intelligent Web Browsing for AI Agents<br>
      <a href="${appUrl}" style="color: #667eea;">unbrowser.ai</a>
    </p>
  </div>
</body>
</html>
      `,
    });

    return { success: true };
  } catch (error) {
    console.error('[Email] Failed to send verification email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    };
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  resetToken: string
): Promise<{ success: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    console.warn('[Email] Resend not configured, skipping password reset email');
    return { success: false, error: 'Email service not configured' };
  }

  const client = getResendClient();
  const appUrl = getAppUrl();
  const resetUrl = `${appUrl}/auth/reset-password?token=${resetToken}`;

  try {
    await client.emails.send({
      from: getFromAddress(),
      to: email,
      subject: 'Reset your Unbrowser password',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Password Reset</h1>
  </div>

  <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px;">We received a request to reset your password for your Unbrowser account.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" style="background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Reset Password</a>
    </div>

    <p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
    <p style="font-size: 12px; color: #888; word-break: break-all; background: #e9ecef; padding: 10px; border-radius: 4px;">${resetUrl}</p>

    <p style="font-size: 14px; color: #666; margin-top: 30px;"><strong>This link expires in 1 hour.</strong></p>

    <p style="font-size: 14px; color: #666;">If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="font-size: 12px; color: #888; text-align: center;">
      Unbrowser - Intelligent Web Browsing for AI Agents<br>
      <a href="${appUrl}" style="color: #667eea;">unbrowser.ai</a>
    </p>
  </div>
</body>
</html>
      `,
    });

    return { success: true };
  } catch (error) {
    console.error('[Email] Failed to send password reset email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    };
  }
}

/**
 * Send welcome email after verification
 */
export async function sendWelcomeEmail(
  email: string,
  name: string,
  apiKeyPrefix?: string
): Promise<{ success: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { success: false, error: 'Email service not configured' };
  }

  const client = getResendClient();
  const appUrl = getAppUrl();

  try {
    await client.emails.send({
      from: getFromAddress(),
      to: email,
      subject: 'Welcome to Unbrowser - Your account is ready!',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Unbrowser</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">You're all set!</h1>
  </div>

  <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px;">Hi ${escapeHtml(name)},</p>

    <p style="font-size: 16px;">Your Unbrowser account is now active. Here's how to get started:</p>

    <div style="background: #e9ecef; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin: 0 0 10px 0; color: #495057;">Quick Start</h3>
      <pre style="background: #212529; color: #f8f9fa; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 13px;">curl -X POST ${appUrl}/v1/browse \\
  -H "Authorization: Bearer ${apiKeyPrefix ? `${apiKeyPrefix}...` : 'YOUR_API_KEY'}" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com"}'</pre>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${appUrl}/dashboard" style="background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Go to Dashboard</a>
    </div>

    <h3 style="color: #495057;">Next Steps:</h3>
    <ul style="color: #666;">
      <li>View your <a href="${appUrl}/dashboard" style="color: #667eea;">API keys</a> in the dashboard</li>
      <li>Check out the <a href="${appUrl}/docs" style="color: #667eea;">API documentation</a></li>
      <li>Explore <a href="${appUrl}/llm.md" style="color: #667eea;">LLM-optimized docs</a> for AI agents</li>
    </ul>

    <p style="font-size: 14px; color: #666;">Your FREE plan includes 100 requests per day - plenty to get started!</p>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="font-size: 12px; color: #888; text-align: center;">
      Questions? Reply to this email or visit <a href="${appUrl}/docs" style="color: #667eea;">our documentation</a><br><br>
      Unbrowser - Intelligent Web Browsing for AI Agents<br>
      <a href="${appUrl}" style="color: #667eea;">unbrowser.ai</a>
    </p>
  </div>
</body>
</html>
      `,
    });

    return { success: true };
  } catch (error) {
    console.error('[Email] Failed to send welcome email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    };
  }
}

/**
 * Escape HTML to prevent XSS in email templates
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
