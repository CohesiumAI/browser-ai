/**
 * Tier detection and override tests.
 * CDC v2026.8 §20.2, §20.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectTier, getEffectiveTier, pickDefaultModelId, getTierModelCategory } from '../utils/tier.js';
import { DEFAULT_MODELS } from '../types/models.js';

describe('Tier Detection', () => {
  const originalNavigator = global.navigator;

  beforeEach(() => {
    // Reset navigator mock
    vi.stubGlobal('navigator', {
      hardwareConcurrency: 4,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('detectTier', () => {
    it('should return tier 1 for mobile devices', () => {
      vi.stubGlobal('navigator', {
        hardwareConcurrency: 8,
        userAgent: 'Mozilla/5.0 (Linux; Android 10) Mobile',
      });
      expect(detectTier()).toBe(1);
    });

    it('should return tier 2 for standard desktop (< 8 cores)', () => {
      vi.stubGlobal('navigator', {
        hardwareConcurrency: 4,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      });
      expect(detectTier()).toBe(2);
    });

    it('should return tier 3 for high-end desktop (>= 8 cores)', () => {
      vi.stubGlobal('navigator', {
        hardwareConcurrency: 16,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      });
      expect(detectTier()).toBe(3);
    });

    it('should default to 4 cores when hardwareConcurrency unavailable', () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      });
      expect(detectTier()).toBe(2);
    });
  });

  describe('getEffectiveTier (V0.2 CDC §20.3)', () => {
    it('should return detected tier when no override', () => {
      vi.stubGlobal('navigator', {
        hardwareConcurrency: 4,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      });
      expect(getEffectiveTier()).toBe(2);
    });

    it('should return override when provided', () => {
      vi.stubGlobal('navigator', {
        hardwareConcurrency: 16,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      });
      // Even with 16 cores (tier 3), override to tier 1
      expect(getEffectiveTier(1)).toBe(1);
    });

    it('should allow forcing tier 3 on low-end device', () => {
      vi.stubGlobal('navigator', {
        hardwareConcurrency: 2,
        userAgent: 'Mozilla/5.0 (Linux; Android 10) Mobile',
      });
      // Mobile would be tier 1, but force tier 3
      expect(getEffectiveTier(3)).toBe(3);
    });
  });

  describe('pickDefaultModelId', () => {
    it('should return nano model for tier 1', () => {
      vi.stubGlobal('navigator', {
        hardwareConcurrency: 2,
        userAgent: 'Mozilla/5.0 (Linux; Android 10) Mobile',
      });
      expect(pickDefaultModelId()).toBe(DEFAULT_MODELS.nano.id);
    });

    it('should return standard model for tier 2', () => {
      vi.stubGlobal('navigator', {
        hardwareConcurrency: 4,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      });
      expect(pickDefaultModelId()).toBe(DEFAULT_MODELS.standard.id);
    });

    it('should return standard model for tier 3', () => {
      vi.stubGlobal('navigator', {
        hardwareConcurrency: 16,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      });
      expect(pickDefaultModelId()).toBe(DEFAULT_MODELS.standard.id);
    });

    it('should respect tierOverride parameter (V0.2)', () => {
      vi.stubGlobal('navigator', {
        hardwareConcurrency: 16,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      });
      // High-end desktop forced to use nano model
      expect(pickDefaultModelId(1)).toBe(DEFAULT_MODELS.nano.id);
    });
  });

  describe('getTierModelCategory', () => {
    it('should return nano for tier 1', () => {
      expect(getTierModelCategory(1)).toBe('nano');
    });

    it('should return standard for tier 2', () => {
      expect(getTierModelCategory(2)).toBe('standard');
    });

    it('should return large for tier 3', () => {
      expect(getTierModelCategory(3)).toBe('large');
    });
  });
});
