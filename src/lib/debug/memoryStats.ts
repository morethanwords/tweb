/*
 * Cross-isolate memory probe.
 *
 * A tab does NOT get a process of its own: Chrome places a same-origin SharedWorker into an
 * existing renderer process for that site - the tab's own. So the 2.6 GB Chrome's task manager
 * charges to "Telegram Web" is the page PLUS the MTProto worker, the crypto pool, the lottie pool
 * and the per-tab compositor. `performance.memory`, meanwhile, only ever reports the isolate that
 * asks - which is why a tab can show 125 MB of JS heap while its process holds gigabytes.
 *
 * Every thread answers `memoryStats` with its own heap reading plus the registries that dominate
 * it; memoryReport() fans the call out and prints one table. Kept dependency-free so any worker
 * can import it without dragging the app graph in.
 */

export type ThreadMemoryStats = {
  thread: string,
  // * bytes. Usually undefined off the main thread: performance.memory is a window-only Chrome
  // * extension, so a worker cannot read its own heap. That is precisely why every thread reports
  // * the SIZES of what it holds below - those are the only per-isolate numbers obtainable at all.
  jsHeap?: number,
  jsHeapTotal?: number,
  // * whatever that thread knows about its own big holders - entry counts and byte estimates.
  // * Keys ending in `Bytes` are rendered as MB by the report.
  details?: Record<string, number>,
  // * the records it broke since it started (see createPeakRecorder)
  events?: MemoryEvent[]
};

// * A holder that grew past its own record, with what the thread knew at that very moment - which is
// * what a periodic sample, minutes later, can no longer tell
export type MemoryEvent = {
  t: number,
  thread?: string, // filled in by the report
  name: string,
  value: number,
  details?: Record<string, number>
};

export function readThreadMemory(
  thread: string,
  details?: Record<string, number>,
  events?: MemoryEvent[]
): ThreadMemoryStats {
  const memory = (performance as any).memory;
  return {
    thread,
    jsHeap: memory?.usedJSHeapSize,
    jsHeapTotal: memory?.totalJSHeapSize,
    details,
    events
  };
}

// * Remembers the moments a value set a new record. Records are counted in geometric steps from
// * `min`, so a heap climbing from 16 MB to 1 GB leaves about twenty of them, not one per growth;
// * the last `keep` stay. They are never taken away by a reader: a SharedWorker answers every tab,
// * and each must see them all. `reset` starts over - after the holder was emptied, climbing back is
// * news again.
export function createPeakRecorder(name: string, {min, step = 1.25, keep = 16}: {min: number, step?: number, keep?: number}) {
  const events: MemoryEvent[] = [];
  let next = min;
  return {
    events,
    observe(value: number, details?: () => Record<string, number>) {
      if(value < next) {
        return;
      }

      events.push({t: Date.now(), name, value, details: details?.()});
      if(events.length > keep) {
        events.shift();
      }

      next = value * step;
    },
    reset() {
      next = min;
    }
  };
}

export function canvasBytes(canvas: {width?: number, height?: number}) {
  return (canvas?.width || 0) * (canvas?.height || 0) * 4;
}

export function formatBytes(bytes: number) {
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// * A worker that never answers must not hang the report - a wedged pool is exactly the state worth
// * reporting. Resolves to a placeholder row instead of rejecting. The caller's label always wins
// * over the thread's self-reported name: a pool's members all call themselves 'lottie', and rows
// * keyed by that name would overwrite each other down to one.
export function withMemoryStatsTimeout(
  promise: Promise<ThreadMemoryStats>,
  thread: string,
  timeout = 3000
): Promise<ThreadMemoryStats> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.then(
      (stats) => ({...stats, thread}),
      () => ({thread, details: {error: 1}} as ThreadMemoryStats)
    ),
    new Promise<ThreadMemoryStats>((resolve) => {
      timer = setTimeout(() => resolve({thread: thread + ' (no answer)'}), timeout);
    })
  ]).finally(() => clearTimeout(timer)); // one report fans out to ~10 threads - do not leave 10 timers
}
