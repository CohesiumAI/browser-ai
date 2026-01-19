/**
 * Transferables utilities for worker communication.
 * CDC v2026.8 §6.3
 * 
 * When transferring large buffers (shards/ArrayBuffer), the protocol MUST use
 * Transferables (2nd argument of postMessage) to avoid memory copies.
 */

/**
 * Extract transferable objects from a payload.
 * Recursively searches for ArrayBuffer instances.
 */
export function extractTransferables(payload: unknown): Transferable[] {
  const transferables: Transferable[] = [];
  
  function walk(obj: unknown): void {
    if (obj === null || obj === undefined) return;
    
    if (obj instanceof ArrayBuffer) {
      transferables.push(obj);
      return;
    }
    
    if (ArrayBuffer.isView(obj)) {
      transferables.push(obj.buffer);
      return;
    }
    
    if (obj instanceof MessagePort) {
      transferables.push(obj);
      return;
    }
    
    if (obj instanceof ImageBitmap) {
      transferables.push(obj);
      return;
    }
    
    if (Array.isArray(obj)) {
      for (const item of obj) {
        walk(item);
      }
      return;
    }
    
    if (typeof obj === 'object') {
      for (const value of Object.values(obj as Record<string, unknown>)) {
        walk(value);
      }
    }
  }
  
  walk(payload);
  return transferables;
}

/**
 * Post a message to a worker with automatic Transferable detection.
 * CDC v2026.8 §6.3 compliant.
 */
export function postMessageWithTransfer(
  target: Worker | MessagePort | Window,
  message: unknown,
  explicitTransferables?: Transferable[]
): void {
  const transferables = explicitTransferables ?? extractTransferables(message);
  
  if ('postMessage' in target) {
    (target as Worker).postMessage(message, transferables);
  }
}

/**
 * Create a worker message sender with automatic Transferable handling.
 */
export function createWorkerSender(worker: Worker) {
  return {
    /**
     * Send message with automatic Transferable detection.
     */
    send: (message: unknown) => {
      postMessageWithTransfer(worker, message);
    },
    
    /**
     * Send message with explicit Transferables.
     */
    sendWithTransfer: (message: unknown, transferables: Transferable[]) => {
      worker.postMessage(message, transferables);
    },
    
    /**
     * Send ArrayBuffer data (zero-copy transfer).
     */
    sendBuffer: (type: string, buffer: ArrayBuffer, metadata?: Record<string, unknown>) => {
      const message = { type, buffer, ...metadata };
      worker.postMessage(message, [buffer]);
    },
  };
}

/**
 * Check if a value contains transferable objects.
 */
export function hasTransferables(payload: unknown): boolean {
  return extractTransferables(payload).length > 0;
}

/**
 * Estimate the byte size of transferable content.
 * Useful for progress tracking.
 */
export function estimateTransferSize(payload: unknown): number {
  const transferables = extractTransferables(payload);
  let size = 0;
  
  for (const t of transferables) {
    if (t instanceof ArrayBuffer) {
      size += t.byteLength;
    }
  }
  
  return size;
}
