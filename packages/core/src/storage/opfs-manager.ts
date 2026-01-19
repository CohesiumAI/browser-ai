/**
 * OPFS (Origin Private File System) storage manager.
 * V1.0 — Better persistence than CacheStorage for large model files.
 * 
 * OPFS provides:
 * - Persistent storage not affected by browser cache clearing
 * - Better performance for large files
 * - Synchronous access via FileSystemSyncAccessHandle (in workers)
 */

import { createError } from '../types/errors.js';

const OPFS_ROOT_DIR = 'browser-ai';
const MODELS_DIR = 'models';
const METADATA_FILE = 'metadata.json';

export interface OPFSModelMetadata {
  modelId: string;
  sizeBytes: number;
  createdAtMs: number;
  lastAccessedAtMs: number;
  shardCount: number;
  integrity?: string;
}

export interface OPFSStorageInfo {
  available: boolean;
  usedBytes: number;
  models: OPFSModelMetadata[];
}

export interface OPFSManager {
  /**
   * Check if OPFS is available.
   */
  isAvailable(): boolean;

  /**
   * Get storage info including all cached models.
   */
  getStorageInfo(): Promise<OPFSStorageInfo>;

  /**
   * Check if model exists in OPFS.
   */
  hasModel(modelId: string): Promise<boolean>;

  /**
   * Get model metadata.
   */
  getModelMetadata(modelId: string): Promise<OPFSModelMetadata | null>;

  /**
   * Store a model shard.
   */
  storeShard(modelId: string, shardIndex: number, data: ArrayBuffer): Promise<void>;

  /**
   * Read a model shard.
   */
  readShard(modelId: string, shardIndex: number): Promise<ArrayBuffer | null>;

  /**
   * Update last accessed time for LRU tracking.
   */
  touchModel(modelId: string): Promise<void>;

  /**
   * Delete a specific model.
   */
  deleteModel(modelId: string): Promise<void>;

  /**
   * Delete all models.
   */
  purgeAll(): Promise<void>;

  /**
   * Get models sorted by last access time (oldest first).
   */
  getModelsByLRU(): Promise<OPFSModelMetadata[]>;
}

async function getOPFSRoot(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return await root.getDirectoryHandle(OPFS_ROOT_DIR, { create: true });
}

async function getModelsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await getOPFSRoot();
  return await root.getDirectoryHandle(MODELS_DIR, { create: true });
}

async function getModelDir(modelId: string): Promise<FileSystemDirectoryHandle> {
  const models = await getModelsDir();
  return await models.getDirectoryHandle(sanitizeModelId(modelId), { create: true });
}

function sanitizeModelId(modelId: string): string {
  return modelId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function readMetadata(modelDir: FileSystemDirectoryHandle): Promise<OPFSModelMetadata | null> {
  try {
    const file = await modelDir.getFileHandle(METADATA_FILE);
    const fileData = await file.getFile();
    const text = await fileData.text();
    return JSON.parse(text) as OPFSModelMetadata;
  } catch {
    return null;
  }
}

async function writeMetadata(modelDir: FileSystemDirectoryHandle, metadata: OPFSModelMetadata): Promise<void> {
  const file = await modelDir.getFileHandle(METADATA_FILE, { create: true });
  const writable = await file.createWritable();
  await writable.write(JSON.stringify(metadata, null, 2));
  await writable.close();
}

export function createOPFSManager(): OPFSManager {
  const isOPFSAvailable = typeof navigator !== 'undefined' && 
    'storage' in navigator && 
    'getDirectory' in navigator.storage;

  return {
    isAvailable(): boolean {
      return isOPFSAvailable;
    },

    async getStorageInfo(): Promise<OPFSStorageInfo> {
      if (!isOPFSAvailable) {
        return { available: false, usedBytes: 0, models: [] };
      }

      try {
        const modelsDir = await getModelsDir();
        const models: OPFSModelMetadata[] = [];
        let usedBytes = 0;

        // Use values() and cast to work around TS type issues
        const entries = (modelsDir as any).entries?.() ?? (modelsDir as any).values?.();
        if (entries) {
          for await (const entry of entries) {
            const [name, handle] = Array.isArray(entry) ? entry : [entry.name, entry];
            if (handle.kind === 'directory') {
              const metadata = await readMetadata(handle as FileSystemDirectoryHandle);
              if (metadata) {
                models.push(metadata);
                usedBytes += metadata.sizeBytes;
              }
            }
          }
        }

        return { available: true, usedBytes, models };
      } catch {
        return { available: false, usedBytes: 0, models: [] };
      }
    },

    async hasModel(modelId: string): Promise<boolean> {
      if (!isOPFSAvailable) return false;

      try {
        const modelsDir = await getModelsDir();
        await modelsDir.getDirectoryHandle(sanitizeModelId(modelId));
        return true;
      } catch {
        return false;
      }
    },

    async getModelMetadata(modelId: string): Promise<OPFSModelMetadata | null> {
      if (!isOPFSAvailable) return null;

      try {
        const modelDir = await getModelDir(modelId);
        return await readMetadata(modelDir);
      } catch {
        return null;
      }
    },

    async storeShard(modelId: string, shardIndex: number, data: ArrayBuffer): Promise<void> {
      if (!isOPFSAvailable) {
        throw createError('ERROR_CACHE_CORRUPT', 'OPFS not available');
      }

      const modelDir = await getModelDir(modelId);
      const shardFile = await modelDir.getFileHandle(`shard_${shardIndex}.bin`, { create: true });
      const writable = await shardFile.createWritable();
      await writable.write(data);
      await writable.close();

      // Update metadata
      let metadata = await readMetadata(modelDir);
      if (!metadata) {
        metadata = {
          modelId,
          sizeBytes: data.byteLength,
          createdAtMs: Date.now(),
          lastAccessedAtMs: Date.now(),
          shardCount: 1,
        };
      } else {
        metadata.sizeBytes += data.byteLength;
        metadata.shardCount = Math.max(metadata.shardCount, shardIndex + 1);
        metadata.lastAccessedAtMs = Date.now();
      }
      await writeMetadata(modelDir, metadata);
    },

    async readShard(modelId: string, shardIndex: number): Promise<ArrayBuffer | null> {
      if (!isOPFSAvailable) return null;

      try {
        const modelDir = await getModelDir(modelId);
        const shardFile = await modelDir.getFileHandle(`shard_${shardIndex}.bin`);
        const file = await shardFile.getFile();
        return await file.arrayBuffer();
      } catch {
        return null;
      }
    },

    async touchModel(modelId: string): Promise<void> {
      if (!isOPFSAvailable) return;

      try {
        const modelDir = await getModelDir(modelId);
        const metadata = await readMetadata(modelDir);
        if (metadata) {
          metadata.lastAccessedAtMs = Date.now();
          await writeMetadata(modelDir, metadata);
        }
      } catch {
        // Ignore errors
      }
    },

    async deleteModel(modelId: string): Promise<void> {
      if (!isOPFSAvailable) return;

      try {
        const modelsDir = await getModelsDir();
        await modelsDir.removeEntry(sanitizeModelId(modelId), { recursive: true });
      } catch {
        // Model doesn't exist, ignore
      }
    },

    async purgeAll(): Promise<void> {
      if (!isOPFSAvailable) return;

      try {
        const root = await getOPFSRoot();
        await root.removeEntry(MODELS_DIR, { recursive: true });
      } catch {
        // Directory doesn't exist, ignore
      }
    },

    async getModelsByLRU(): Promise<OPFSModelMetadata[]> {
      const info = await this.getStorageInfo();
      return info.models.sort((a, b) => a.lastAccessedAtMs - b.lastAccessedAtMs);
    },
  };
}
