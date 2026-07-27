import type { WorldSeed } from './types';

export function hashSeedLabel(label: string): number {
  let hash = 2166136261;

  for (let index = 0; index < label.length; index += 1) {
    hash ^= label.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function createWorldSeed(label: string): WorldSeed {
  return {
    label,
    value: hashSeedLabel(label),
  };
}

export class SeededRandom {
  readonly seed: WorldSeed;
  private state: number;

  constructor(seed: WorldSeed) {
    this.seed = seed;
    this.state = seed.value || 0x6d2b79f5;
  }

  reset(): void {
    this.state = this.seed.value || 0x6d2b79f5;
  }

  next(): number {
    this.state += 0x6d2b79f5;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  range(minimum: number, maximum: number): number {
    return minimum + (maximum - minimum) * this.next();
  }

  integer(minimum: number, maximumExclusive: number): number {
    return Math.floor(this.range(minimum, maximumExclusive));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Cannot select from an empty collection.');
    }

    return items[this.integer(0, items.length)] as T;
  }
}
