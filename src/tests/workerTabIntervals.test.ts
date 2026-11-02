import TabIntervals from '@lib/mainWorker/tabIntervals';

// Tabs keep intervals in the shared worker, whose timers are not throttled the
// way a background page's are (singleInstance checks every 5 s, the idle title
// blinks every second). The worker outlives a tab that is closed or reloaded:
// what that tab set has to stop with it, and every tick goes to the tab that
// set it - not to every tab there is.

const tabA = {name: 'A'} as any as MessageEventSource;
const tabB = {name: 'B'} as any as MessageEventSource;

function makeIntervals() {
  const ticks: string[] = [];
  const intervals = new TabIntervals((intervalId, source) => {
    ticks.push(`${(source as any).name}:${intervalId === idOf.get(source) ? 'own' : 'other'}`);
  });
  const idOf = new Map<MessageEventSource, number>();
  const set = (timeout: number, source: MessageEventSource) => {
    const id = intervals.set(timeout, source);
    idOf.set(source, id);
    return id;
  };

  return {intervals, ticks, set};
}

describe('intervals the tabs keep in the worker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('tick for the tab that set them only', () => {
    const {ticks, set} = makeIntervals();
    set(5000, tabA);
    set(1000, tabB);

    vi.advanceTimersByTime(5000);
    expect(ticks.filter((tick) => tick.startsWith('A'))).toEqual(['A:own']);
    expect(ticks.filter((tick) => tick.startsWith('B'))).toEqual(Array(5).fill('B:own'));
  });

  test('stop with the tab that set them, and leave the others ticking', () => {
    const {intervals, ticks, set} = makeIntervals();
    set(5000, tabA);
    set(5000, tabB);
    intervals.set(1000, tabA);

    // * the tab is closed or reloaded: the worker is told by its lock (detachPort)
    intervals.releaseSource(tabA);
    vi.advanceTimersByTime(10000);
    expect(ticks).toEqual(['B:own', 'B:own']);
    expect(vi.getTimerCount()).toBe(1);
  });

  test('stop when the tab clears them', () => {
    const {intervals, ticks, set} = makeIntervals();
    const id = set(1000, tabA);

    vi.advanceTimersByTime(1000);
    intervals.clear(id, tabA);
    vi.advanceTimersByTime(5000);
    expect(ticks).toEqual(['A:own']);
    expect(vi.getTimerCount()).toBe(0);

    // * nothing is left behind for the tab to release
    intervals.releaseSource(tabA);
    expect(vi.getTimerCount()).toBe(0);
  });
});
