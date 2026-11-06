/** Whole numbers below `max` from a fixed seed, so a test that draws random cases fails the same way twice. */
export default function createSeededRandom(seed: number) {
  return (max: number) => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return (seed >>> 8) % max;
  };
}
