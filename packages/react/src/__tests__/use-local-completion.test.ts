/**
 * Tests for useLocalCompletion hook
 */

import { describe, it, expect } from 'vitest';

describe('useLocalCompletion', () => {
  it('exports useLocalCompletion function', async () => {
    const module = await import('../use-local-completion.js');
    expect(typeof module.useLocalCompletion).toBe('function');
  });
});
