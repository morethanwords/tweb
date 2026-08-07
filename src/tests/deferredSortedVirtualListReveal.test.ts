import {getNextRevealIdx} from '@components/deferredSortedVirtualList';

describe('deferred sorted virtual list reveal threshold', () => {
  it('reveals nothing while the queue is empty', () => {
    expect(getNextRevealIdx([])).toBe(null);
  });

  it('reveals the whole ready batch in a single hop', () => {
    // A scroll window of rows 290..309 arrives already loaded (warm cache).
    const queued = Array.from({length: 20}, (_, i) => 290 + i);
    expect(getNextRevealIdx(queued)).toBe(310);
  });

  it('does not depend on the order the rows queued themselves', () => {
    expect(getNextRevealIdx([305, 291, 300, 290])).toBe(306);
  });

  it('drains a window in one hop instead of one hop per row', () => {
    // The old behaviour advanced to (min + 1), so draining N rows took N serial
    // timers. Simulate both and compare the hop count.
    const drain = (queued: number[], step: (q: number[]) => number) => {
      let remaining = queued.slice();
      let hops = 0;
      while(remaining.length) {
        const next = step(remaining);
        remaining = remaining.filter((n) => n >= next);
        ++hops;
      }

      return hops;
    };

    const window = Array.from({length: 20}, (_, i) => 290 + i);
    const oldStep = (q: number[]) => Math.min(...q) + 1;

    expect(drain(window, oldStep)).toBe(20);
    expect(drain(window, (q) => getNextRevealIdx(q))).toBe(1);
  });

  it('handles a single queued row', () => {
    expect(getNextRevealIdx([7])).toBe(8);
  });

  it('handles index 0 without treating it as an empty queue', () => {
    expect(getNextRevealIdx([0])).toBe(1);
  });
});
