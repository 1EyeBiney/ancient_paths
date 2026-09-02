// Seeded RNG (§18, §33.1: identical seeds must reproduce identical draws).
// mulberry32 generator seeded by hashing the input string with xfnv1a.
// No dependency on Math.random anywhere in the engine — everything random
// flows through this injected interface.

export interface Rng {
  /** Returns a float in [0, 1). */
  next(): number;
}

function xfnv1a(str: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 7;
    h ^= h << 17;
    return h >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Creates a deterministic Rng from a seed string. Same seed → same sequence. */
export function createRng(seed: string): Rng {
  const seedFn = xfnv1a(seed);
  const gen = mulberry32(seedFn());
  return { next: gen };
}

/** Picks a uniformly random element of a non-empty array. */
export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pickOne: items is empty");
  const idx = Math.floor(rng.next() * items.length);
  return items[Math.min(idx, items.length - 1)] as T;
}
