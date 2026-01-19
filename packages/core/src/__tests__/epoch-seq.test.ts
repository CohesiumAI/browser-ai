/**
 * Epoch/Seq protocol tests.
 * CDC v2026.8 §6.2
 */

import { describe, it, expect } from 'vitest';
import { createEnvelopeFactory, isCurrentEpoch } from '../protocol/envelope.js';

describe('Envelope Factory', () => {
  it('should start with epoch 0', () => {
    const factory = createEnvelopeFactory();
    expect(factory.getEpoch()).toBe(0);
  });

  it('should increment epoch', () => {
    const factory = createEnvelopeFactory();
    factory.incrementEpoch();
    expect(factory.getEpoch()).toBe(1);
  });

  it('should reset seq on epoch increment', () => {
    const factory = createEnvelopeFactory();
    factory.create('TEST', {});
    factory.create('TEST', {});
    expect(factory.getSeq()).toBe(2);

    factory.incrementEpoch();
    expect(factory.getSeq()).toBe(0);
  });

  it('should create envelope with correct structure', () => {
    const factory = createEnvelopeFactory();
    const envelope = factory.create('CMD_GENERATE', { test: true });

    expect(envelope).toEqual({
      epoch: 0,
      seq: 0,
      type: 'CMD_GENERATE',
      payload: { test: true },
    });
  });

  it('should auto-increment seq', () => {
    const factory = createEnvelopeFactory();
    factory.create('A', {});
    const second = factory.create('B', {});

    expect(second.seq).toBe(1);
  });
});

describe('isCurrentEpoch', () => {
  it('should return true for matching epoch', () => {
    const envelope = { epoch: 5, seq: 0, type: 'TEST', payload: {} };
    expect(isCurrentEpoch(envelope, 5)).toBe(true);
  });

  it('should return false for stale epoch', () => {
    const envelope = { epoch: 4, seq: 0, type: 'TEST', payload: {} };
    expect(isCurrentEpoch(envelope, 5)).toBe(false);
  });

  it('should ignore late tokens after abort (epoch mismatch)', () => {
    const factory = createEnvelopeFactory();

    const token1 = factory.create('TOKEN', { text: 'hello' });
    factory.incrementEpoch();

    expect(isCurrentEpoch(token1, factory.getEpoch())).toBe(false);
  });
});
