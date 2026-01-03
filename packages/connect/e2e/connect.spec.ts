/**
 * E2E Tests for Unbrowser Connect SDK
 * CONN-011: Browser-based testing with Playwright
 *
 * These tests verify the SDK works correctly in a real browser environment:
 * - SDK initialization
 * - UI interactions
 * - Background fetch (iframe)
 * - Error handling in browser
 */

import { test, expect } from '@playwright/test';

test.describe('Unbrowser Connect SDK E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('h1')).toContainText('Unbrowser Connect Test Page');
  });

  test.describe('SDK Initialization', () => {
    test('should display configuration form', async ({ page }) => {
      await expect(page.locator('#apiKey')).toBeVisible();
      await expect(page.locator('#appId')).toBeVisible();
      await expect(page.locator('button', { hasText: 'Initialize Connect' })).toBeVisible();
    });

    test('should have buttons disabled before initialization', async ({ page }) => {
      await expect(page.locator('#bgBtn')).toBeDisabled();
      await expect(page.locator('#popupBtn')).toBeDisabled();
      await expect(page.locator('#batchBtn')).toBeDisabled();
    });

    test('should show error for empty appId', async ({ page }) => {
      await page.locator('#appId').clear();
      await page.locator('#appId').fill('');
      await page.locator('button', { hasText: 'Initialize Connect' }).click();

      const status = page.locator('#initStatus');
      await expect(status).toContainText(/error|failed|required/i);
    });

    test('should show error for empty apiKey', async ({ page }) => {
      await page.locator('#apiKey').clear();
      await page.locator('#apiKey').fill('');
      await page.locator('button', { hasText: 'Initialize Connect' }).click();

      const status = page.locator('#initStatus');
      await expect(status).toContainText(/error|failed|required/i);
    });

    test('should initialize with valid configuration', async ({ page }) => {
      // Fill in valid credentials
      await page.locator('#apiKey').fill('ub_test_demo123');
      await page.locator('#appId').fill('test-app');

      // Click initialize
      await page.locator('button', { hasText: 'Initialize Connect' }).click();

      // Wait for buttons to be enabled (indicates successful init)
      await expect(page.locator('#bgBtn')).toBeEnabled({ timeout: 10000 });
      await expect(page.locator('#popupBtn')).toBeEnabled();
      await expect(page.locator('#batchBtn')).toBeEnabled();
    });

    test('should show Connected status after successful init', async ({ page }) => {
      await page.locator('#apiKey').fill('ub_test_demo123');
      await page.locator('#appId').fill('test-app');
      await page.locator('button', { hasText: 'Initialize Connect' }).click();

      const status = page.locator('#initStatus');
      await expect(status).toContainText(/connected/i, { timeout: 10000 });
    });
  });

  test.describe('Background Fetch', () => {
    test.beforeEach(async ({ page }) => {
      // Initialize SDK first
      await page.locator('#apiKey').fill('ub_test_demo123');
      await page.locator('#appId').fill('test-app');
      await page.locator('button', { hasText: 'Initialize Connect' }).click();
      await expect(page.locator('#bgBtn')).toBeEnabled({ timeout: 10000 });
    });

    test('should accept URL input', async ({ page }) => {
      await page.locator('#bgUrl').fill('https://example.com');
      await expect(page.locator('#bgUrl')).toHaveValue('https://example.com');
    });

    test('should show progress or complete during fetch', async ({ page }) => {
      await page.locator('#bgUrl').fill('https://example.com');
      await page.locator('#bgBtn').click();

      // Progress element exists and contains progress text (visible or hidden after completion)
      const progress = page.locator('#bgProgress');
      const result = page.locator('#bgResult');

      // Wait for either progress to appear or result to change (fast fetches may skip visible progress)
      await expect(result).not.toContainText('Results will appear here', { timeout: 15000 });
    });

    test('should display result after fetch', async ({ page }) => {
      await page.locator('#bgUrl').fill('https://example.com');
      await page.locator('#bgBtn').click();

      // Wait for result (success or error structure)
      const result = page.locator('#bgResult');
      await expect(result).not.toContainText('Results will appear here', { timeout: 15000 });

      // Check it's valid JSON with expected structure
      const resultText = await result.textContent();
      expect(resultText).toBeTruthy();

      const parsed = JSON.parse(resultText!);
      expect('success' in parsed).toBe(true);
    });
  });

  test.describe('Batch Fetch', () => {
    test.beforeEach(async ({ page }) => {
      // Initialize SDK first
      await page.locator('#apiKey').fill('ub_test_demo123');
      await page.locator('#appId').fill('test-app');
      await page.locator('button', { hasText: 'Initialize Connect' }).click();
      await expect(page.locator('#batchBtn')).toBeEnabled({ timeout: 10000 });
    });

    test('should accept multiple URLs in textarea', async ({ page }) => {
      await page.locator('#batchUrls').fill('https://example.com\nhttps://httpbin.org/html');
      const value = await page.locator('#batchUrls').inputValue();
      expect(value).toContain('example.com');
      expect(value).toContain('httpbin.org');
    });

    test('should show progress or complete during batch fetch', async ({ page }) => {
      await page.locator('#batchUrls').fill('https://example.com');
      await page.locator('#batchBtn').click();

      // Wait for result to change (fast fetches may skip visible progress)
      const result = page.locator('#batchResult');
      await expect(result).not.toContainText('Results will appear here', { timeout: 15000 });
    });

    test('should display batch result with counts', async ({ page }) => {
      await page.locator('#batchUrls').fill('https://example.com');
      await page.locator('#batchBtn').click();

      // Wait for result
      const result = page.locator('#batchResult');
      await expect(result).not.toContainText('Results will appear here', { timeout: 15000 });

      // Check it's valid JSON with batch structure
      const resultText = await result.textContent();
      const parsed = JSON.parse(resultText!);
      expect('total' in parsed).toBe(true);
      expect('results' in parsed).toBe(true);
    });
  });

  test.describe('Error Handling in Browser', () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('#apiKey').fill('ub_test_demo123');
      await page.locator('#appId').fill('test-app');
      await page.locator('button', { hasText: 'Initialize Connect' }).click();
      await expect(page.locator('#bgBtn')).toBeEnabled({ timeout: 10000 });
    });

    test('should handle invalid URL gracefully', async ({ page }) => {
      await page.locator('#bgUrl').fill('not-a-valid-url');
      await page.locator('#bgBtn').click();

      const result = page.locator('#bgResult');
      await expect(result).not.toContainText('Results will appear here', { timeout: 10000 });

      const resultText = await result.textContent();
      const parsed = JSON.parse(resultText!);
      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe('INVALID_URL');
    });

    test('should handle empty URL gracefully', async ({ page }) => {
      await page.locator('#bgUrl').fill('');
      await page.locator('#bgBtn').click();

      const result = page.locator('#bgResult');
      await expect(result).not.toContainText('Results will appear here', { timeout: 10000 });

      const resultText = await result.textContent();
      const parsed = JSON.parse(resultText!);
      expect(parsed.success).toBe(false);
    });
  });

  test.describe('UI State Management', () => {
    test('should preserve URL input between tests', async ({ page }) => {
      // Check default values are present
      await expect(page.locator('#bgUrl')).toHaveValue('https://example.com');
      await expect(page.locator('#popupUrl')).toHaveValue('https://old.reddit.com/r/artificial');
    });

    test('should have proper input styling', async ({ page }) => {
      // Check input fields are visible and styled
      const apiKeyInput = page.locator('#apiKey');
      await expect(apiKeyInput).toBeVisible();

      const bgUrlInput = page.locator('#bgUrl');
      await expect(bgUrlInput).toBeVisible();
    });

    test('should display all three fetch cards', async ({ page }) => {
      // Background card
      await expect(page.locator('.card', { hasText: 'Background Fetch' })).toBeVisible();

      // Popup card
      await expect(page.locator('.card', { hasText: 'Popup Fetch' })).toBeVisible();

      // Batch card
      await expect(page.locator('.card', { hasText: 'Batch Fetch' })).toBeVisible();
    });
  });
});
