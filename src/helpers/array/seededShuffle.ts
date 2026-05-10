/**
 * Merge an array of numbers into a single 32-bit seed using XOR + mixing.
 */
export function mergeSeed(nums: number[]): number {
  let seed = 0x811c9dc5; // FNV offset basis, arbitrary non-zero start
  for(const n of nums) {
    // Mix the number into the seed
    let x = n | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    seed = (seed ^ x) >>> 0;
    // Scramble seed (xorshift32)
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
  }
  return seed >>> 0;
}

/**
 * Mulberry32 PRNG — fast, deterministic, good distribution for shuffling.
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic Fisher–Yates shuffle. Returns a new array; does not mutate input.
 */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const out = items.slice();
  for(let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
