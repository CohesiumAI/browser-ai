/**
 * IndexedDB manager for model metadata.
 * CDC v2026.8 §15.3
 */

const DB_NAME = 'browser-ai';
const DB_VERSION = 1;
const STORE_MODELS = 'models';

export interface ModelMetadata {
  id: string;
  sizeBytes: number;
  downloadedAt: number;
  checksumSha256?: string;
  engineVersion?: string;
}

export interface IDBManager {
  getModelMetadata(modelId: string): Promise<ModelMetadata | null>;
  setModelMetadata(metadata: ModelMetadata): Promise<void>;
  deleteModelMetadata(modelId: string): Promise<void>;
  getAllModels(): Promise<ModelMetadata[]>;
  close(): void;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_MODELS)) {
        db.createObjectStore(STORE_MODELS, { keyPath: 'id' });
      }
    };
  });
}

export async function createIDBManager(): Promise<IDBManager> {
  const db = await openDatabase();

  return {
    async getModelMetadata(modelId: string): Promise<ModelMetadata | null> {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MODELS, 'readonly');
        const store = tx.objectStore(STORE_MODELS);
        const request = store.get(modelId);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result ?? null);
      });
    },

    async setModelMetadata(metadata: ModelMetadata): Promise<void> {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MODELS, 'readwrite');
        const store = tx.objectStore(STORE_MODELS);
        const request = store.put(metadata);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    },

    async deleteModelMetadata(modelId: string): Promise<void> {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MODELS, 'readwrite');
        const store = tx.objectStore(STORE_MODELS);
        const request = store.delete(modelId);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    },

    async getAllModels(): Promise<ModelMetadata[]> {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MODELS, 'readonly');
        const store = tx.objectStore(STORE_MODELS);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    },

    close(): void {
      db.close();
    },
  };
}
