import {createPeakRecorder, MemoryEvent} from '@lib/debug/memoryStats';

// * memoryWatch is off unless asked for; once asked, it keeps a memory history across reloads
const report = vi.hoisted(() => ({events: [] as MemoryEvent[], calls: 0}));
vi.mock('@lib/debug/memoryReport', () => ({
  default: async() => {
    ++report.calls;
    return {metrics: {jsHeapBytes: 1000 * report.calls}, events: report.events};
  }
}));

const MINUTE = 60 * 1000;

describe('memoryWatch', () => {
  let ctx: any;
  // * a page load: whatever the previous page had scheduled dies with it
  const load = async() => {
    vi.clearAllTimers();
    vi.resetModules();
    await import('@lib/debug/memoryWatch');
    ctx = window as any;
  };
  const flush = () => vi.advanceTimersByTimeAsync(0);

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    report.events = [];
    report.calls = 0;
  });

  afterEach(() => {
    ctx?.memoryWatchStop?.();
    localStorage.clear();
    vi.useRealTimers();
  });

  test('stays off unless asked for', async() => {
    await load();
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(report.calls).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  test('once asked, samples with what the tab was doing, and keeps going after a reload until stopped', async() => {
    await load();
    ctx.memoryWatch(15);
    await flush();
    expect(report.calls).toBe(1);
    const [sample] = ctx.memoryWatchLog();
    expect(sample.m).toMatchObject({jsHeapBytes: 1000, 'ctx.chat': 0, 'ctx.popups': 0, 'ctx.emojiPanel': 0});
    expect(sample.m['ctx.document']).toBeGreaterThan(0);

    await load();
    await flush();
    expect(report.calls).toBe(2);

    ctx.memoryWatchStop();
    await load();
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(report.calls).toBe(2);
  });

  test('?memoryWatch=1 keeps it on for as long as the URL carries it, persisting nothing', async() => {
    history.replaceState(null, '', '/?memoryWatch=1');
    try {
      await load();
      await vi.advanceTimersByTimeAsync(59 * 1000);
      expect(report.calls).toBe(0);
      await vi.advanceTimersByTimeAsync(1000);
      expect(report.calls).toBe(1);
      await vi.advanceTimersByTimeAsync(15 * MINUTE);
      expect(report.calls).toBe(2);
      expect(localStorage.getItem('memory_watch')).toBeNull();
    } finally {
      history.replaceState(null, '', '/');
    }

    await load();
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(report.calls).toBe(2);
  });

  test('keeps each record once, however many samples report it, and hands everything to the log export', async() => {
    report.events = [
      {t: 100, thread: 'lottie #0', name: 'wasmHeap', value: 32 * 1024 * 1024, details: {awake: 40}},
      {t: 200, thread: 'lottie #1', name: 'wasmHeap', value: 40 * 1024 * 1024}
    ];
    await load();
    ctx.memoryWatch(15);
    await vi.advanceTimersByTimeAsync(15 * MINUTE);
    expect(report.calls).toBe(2);

    const {getMemoryLogEntries} = await import('@lib/debug/memoryWatch');
    const entries = getMemoryLogEntries();
    expect(entries.filter((entry) => entry.prefix === '[memory]')).toHaveLength(2);
    expect(entries.filter((entry) => entry.prefix === '[memory record]').map((entry) => entry.args[0])).toEqual(report.events);
    expect(entries.every((entry) => entry.src === 'memory')).toBe(true);
  });
});

describe('createPeakRecorder', () => {
  test('records in geometric steps from the floor, keeps the last ones, and starts over on reset', () => {
    vi.useFakeTimers();
    const recorder = createPeakRecorder('heap', {min: 100, step: 2, keep: 3});
    const details = vi.fn(() => ({awake: 1}));
    for(const value of [50, 100, 150, 199, 200, 390, 400, 800, 1600]) {
      recorder.observe(value, details);
    }

    // * 100 -> next 200 -> 400 -> 800 -> 1600; only the last three are kept
    expect(recorder.events.map((event) => event.value)).toEqual([400, 800, 1600]);
    expect(details).toHaveBeenCalledTimes(5);

    recorder.reset();
    recorder.observe(120);
    expect(recorder.events.map((event) => event.value)).toEqual([800, 1600, 120]);
    vi.useRealTimers();
  });
});
