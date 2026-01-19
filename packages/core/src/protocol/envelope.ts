/**
 * Worker protocol envelope.
 * CDC v2026.8 §6
 */

export interface Envelope<T = unknown> {
  epoch: number;
  seq: number;
  type: string;
  payload: T;
}

/**
 * Create an envelope with auto-incrementing seq.
 */
export function createEnvelopeFactory(initialEpoch: number = 0) {
  let epoch = initialEpoch;
  let seq = 0;

  return {
    getEpoch: () => epoch,
    getSeq: () => seq,
    incrementEpoch: () => {
      epoch++;
      seq = 0;
      return epoch;
    },
    create: <T>(type: string, payload: T): Envelope<T> => {
      return {
        epoch,
        seq: seq++,
        type,
        payload,
      };
    },
  };
}

/**
 * Check if an envelope matches the current epoch.
 * Used to ignore stale events after abort.
 */
export function isCurrentEpoch(envelope: Envelope, currentEpoch: number): boolean {
  return envelope.epoch === currentEpoch;
}
