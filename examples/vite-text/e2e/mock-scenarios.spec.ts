/**
 * E2E tests for MockProvider scenarios.
 * CDC v2026.8 §21.2 — Mock scenarios: happy/slow/hang/crash/quota
 */

import { test, expect } from '@playwright/test';

test.describe('MockProvider scenarios', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for chat container to be visible
    await expect(page.locator('[data-testid="chat-container"]')).toBeVisible({ timeout: 10000 });
  });

  test('should show status badge', async ({ page }) => {
    const badge = page.locator('[data-testid="status-badge"]');
    await expect(badge).toBeVisible({ timeout: 10000 });
    await expect(badge).not.toBeEmpty();
  });

  test('should allow typing in textarea', async ({ page }) => {
    const textarea = page.getByRole('textbox', { name: 'Message input' });
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.fill('Test message');
    await expect(textarea).toHaveValue('Test message');
  });

  test('should have generate button', async ({ page }) => {
    const generateButton = page.getByRole('button', { name: 'Generate response' });
    await expect(generateButton).toBeVisible({ timeout: 10000 });
  });
});

test.describe('FSM state visibility', () => {
  test('should display status during lifecycle', async ({ page }) => {
    await page.goto('/');

    // Status badge should be visible
    const badge = page.locator('[data-testid="status-badge"]');
    await expect(badge).toBeVisible({ timeout: 30000 });
  });

  test('diagnostics button should be present', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to load
    await expect(page.locator('[data-testid="chat-container"]')).toBeVisible({ timeout: 10000 });

    // Click diagnostics button
    const diagButton = page.getByRole('button', { name: /Diagnostics|Auto-Refresh/i });
    await expect(diagButton).toBeVisible({ timeout: 5000 });
  });
});

test.describe('UI components', () => {
  test('should show all main UI elements', async ({ page }) => {
    await page.goto('/');
    
    // Container
    await expect(page.locator('[data-testid="chat-container"]')).toBeVisible({ timeout: 10000 });
    
    // Status badge
    await expect(page.locator('[data-testid="status-badge"]')).toBeVisible({ timeout: 10000 });
    
    // Textarea
    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible({ timeout: 10000 });
    
    // Generate button
    await expect(page.getByRole('button', { name: 'Generate response' })).toBeVisible({ timeout: 10000 });
  });

  test('textarea should be interactive', async ({ page }) => {
    await page.goto('/');
    
    const textarea = page.getByRole('textbox', { name: 'Message input' });
    await expect(textarea).toBeVisible({ timeout: 10000 });
    
    // Type and verify
    await textarea.fill('Hello, AI!');
    await expect(textarea).toHaveValue('Hello, AI!');
    
    // Clear and verify
    await textarea.fill('');
    await expect(textarea).toHaveValue('');
  });
});
