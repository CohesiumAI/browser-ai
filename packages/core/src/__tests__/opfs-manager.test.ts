/**
 * Tests for OPFSManager (V1.0)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOPFSManager, type OPFSManager } from '../storage/opfs-manager.js';

describe('OPFSManager', () => {
  let manager: OPFSManager;

  beforeEach(() => {
    manager = createOPFSManager();
  });

  describe('isAvailable', () => {
    it('returns false when navigator.storage.getDirectory is not available', () => {
      // In Node.js test environment, OPFS is not available
      expect(manager.isAvailable()).toBe(false);
    });
  });

  describe('getStorageInfo', () => {
    it('returns unavailable info when OPFS not available', async () => {
      const info = await manager.getStorageInfo();
      expect(info.available).toBe(false);
      expect(info.usedBytes).toBe(0);
      expect(info.models).toEqual([]);
    });
  });

  describe('hasModel', () => {
    it('returns false when OPFS not available', async () => {
      const result = await manager.hasModel('test-model');
      expect(result).toBe(false);
    });
  });

  describe('getModelMetadata', () => {
    it('returns null when OPFS not available', async () => {
      const result = await manager.getModelMetadata('test-model');
      expect(result).toBeNull();
    });
  });

  describe('storeShard', () => {
    it('throws when OPFS not available', async () => {
      const data = new ArrayBuffer(100);
      await expect(manager.storeShard('test-model', 0, data)).rejects.toThrow();
    });
  });

  describe('readShard', () => {
    it('returns null when OPFS not available', async () => {
      const result = await manager.readShard('test-model', 0);
      expect(result).toBeNull();
    });
  });

  describe('touchModel', () => {
    it('does not throw when OPFS not available', async () => {
      await expect(manager.touchModel('test-model')).resolves.toBeUndefined();
    });
  });

  describe('deleteModel', () => {
    it('does not throw when OPFS not available', async () => {
      await expect(manager.deleteModel('test-model')).resolves.toBeUndefined();
    });
  });

  describe('purgeAll', () => {
    it('does not throw when OPFS not available', async () => {
      await expect(manager.purgeAll()).resolves.toBeUndefined();
    });
  });

  describe('getModelsByLRU', () => {
    it('returns empty array when OPFS not available', async () => {
      const result = await manager.getModelsByLRU();
      expect(result).toEqual([]);
    });
  });
});

describe('OPFSManager availability check', () => {
  it('isAvailable checks for navigator.storage.getDirectory', () => {
    // In Node.js test environment, OPFS is not available
    // This test documents expected behavior
    const manager = createOPFSManager();
    const available = manager.isAvailable();
    
    // Should be false in Node.js, true in browser with OPFS support
    expect(typeof available).toBe('boolean');
  });
});
