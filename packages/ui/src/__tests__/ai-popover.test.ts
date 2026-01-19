/**
 * Tests for AIPopover component
 */

import { describe, it, expect } from 'vitest';

describe('AIPopover', () => {
  it('exports AIPopover component', async () => {
    const module = await import('../ai-popover.js');
    expect(typeof module.AIPopover).toBe('function');
  });
});
