/**
 * E2E tests for browser-ai.
 * CDC v2026.8 §21.2
 */

import { test, expect } from '@playwright/test';

test.describe('browser-ai basic functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the app title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'browser-ai Demo' })).toBeVisible();
  });

  test('should show chat container', async ({ page }) => {
    const container = page.locator('[data-testid="chat-container"]');
    await expect(container).toBeVisible({ timeout: 10000 });
  });

  test('should show status badge', async ({ page }) => {
    const badge = page.locator('[data-testid="status-badge"]');
    await expect(badge).toBeVisible({ timeout: 10000 });
  });

  test('should have textarea for input', async ({ page }) => {
    const textarea = page.getByRole('textbox', { name: 'Message input' });
    await expect(textarea).toBeVisible({ timeout: 10000 });
  });
});

test.describe('FSM transitions with MockProvider', () => {
  test('should reach ready or show status', async ({ page }) => {
    await page.goto('/');
    
    // Wait for status badge to be visible (any state)
    const badge = page.locator('[data-testid="status-badge"]');
    await expect(badge).toBeVisible({ timeout: 30000 });
    
    // Status should contain some text
    await expect(badge).not.toBeEmpty();
  });

  test('should allow text input', async ({ page }) => {
    await page.goto('/');
    
    // Wait for textarea
    const textarea = page.getByRole('textbox', { name: 'Message input' });
    await expect(textarea).toBeVisible({ timeout: 10000 });
    
    // Type a message
    await textarea.fill('Hello AI');
    await expect(textarea).toHaveValue('Hello AI');
  });

  test('should have generate button', async ({ page }) => {
    await page.goto('/');
    
    // Find generate button
    const generateButton = page.getByRole('button', { name: 'Generate response' });
    await expect(generateButton).toBeVisible({ timeout: 10000 });
  });
});
