/**
 * NativeShim — Chain of Responsibility for native drivers.
 * CDC v2026.8 §8.1–8.2
 */

import type { NativeDriver } from './types.js';
import { ChromeWindowAiDriver } from './drivers/chrome-window-ai.js';
import { UnknownDriver } from './drivers/unknown-driver.js';

export class NativeShim {
  private drivers: NativeDriver[];

  constructor(drivers?: NativeDriver[]) {
    this.drivers = drivers ?? [
      new ChromeWindowAiDriver(),
      new UnknownDriver(),
    ];
  }

  async detectDriver(): Promise<NativeDriver | null> {
    for (const driver of this.drivers) {
      try {
        const available = await driver.detect();
        if (available) {
          return driver;
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  getDrivers(): NativeDriver[] {
    return this.drivers;
  }
}

export function createNativeShim(drivers?: NativeDriver[]): NativeShim {
  return new NativeShim(drivers);
}
