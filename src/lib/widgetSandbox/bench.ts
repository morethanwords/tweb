import type {WidgetHost, WidgetStats, WidgetSyncTransport} from 'widget-sandbox/host/widget-host';
import {suspendKind, type SuspendKind} from 'widget-sandbox/host/suspend-kind';
import {loadWidgetFixture} from '@lib/widgetSandbox/fixtures';
import {applyWidgetEngineOptions, loadWidgetRuntime, resolveWidgetTransport, startWidgetEnginesCold, WidgetRendererKind, WidgetRuntime} from '@lib/widgetSandbox/runtime';
import pause from '@helpers/schedulers/pause';
import withTimeout from '@helpers/schedulers/withTimeout';

/**
 * The widget engines measured against each other in this browser, on the same widgets: every transport the page can
 * run (`worker` with JSPI and with the asyncify build, one engine worker and two; `inline`; `sab` with either renderer
 * on a cross-origin isolated page; `frame`), straight through the widget runtime — no bubble, no visibility gating, no
 * cap on live widgets. The widget sandbox's Bench view runs it (`?widgets=1`), and so does
 * `(await widgetSandbox()).bench()`; a script can drive it in every engine and add what a page cannot see (memory of
 * other processes, the browser's own task times).
 *
 * What a page can measure itself, and so what every browser gets:
 * - when a widget has drawn (its first content height) and loaded, from the moment it is asked for (every widget's
 *   source is loaded before anything is timed);
 * - how long the page's thread is held: by a start (the engine's preparation, as a 5 ms heartbeat finds it, and the
 *   synchronous part of `createHost`), by the longest gap of that heartbeat, and as busy time — the gaps of a
 *   MessageChannel loop, less what the same loop finds with no widget;
 * - long tasks where the browser reports them (Chromium);
 * - what the bench widgets (fixtures `bench/`) time in their own clock: script work, layout queries, a large DOM;
 * - memory, where `performance.measureUserAgentSpecificMemory` exists (Chromium, cross-origin isolated pages).
 *
 * A mode's first widget starts cold: the engine workers kept and `sab`'s booted ones go before it. `inline` keeps its
 * compiled engine for the page, so its first start is warm after the page's first inline widget, and is marked so.
 */

export type BenchMode = {
  id: string,
  label: string,
  transport: WidgetSyncTransport,
  renderer: WidgetRendererKind,
  /** `worker`: how its code waits for a query's answer, and how many engine workers there may be. */
  suspend?: SuspendKind,
  engines?: number
};

export type BenchScenario = 'first' | 'single' | 'batch' | 'anim' | 'compute' | 'queries' | 'dom' | 'memory';

export type BenchRow = {
  scenario: BenchScenario,
  metric: string,
  unit: string,
  /** Which way is better, for marking the best mode. */
  better: 'lower' | 'higher',
  values: Record<string, number | null>,
  /** Per mode: what is to be known of its value (a mark on it, and the text under the table). */
  notes?: Record<string, string>
};

export type BenchResult = {
  env: {userAgent: string, cores: number, isolated: boolean, jspi: boolean, date: string, longTasks: boolean, memory: boolean},
  modes: BenchMode[],
  rows: BenchRow[],
  /** Widgets that died, per mode. */
  deaths: Record<string, string[]>
};

export type BenchOptions = {
  /** Mode ids (listBenchModes); all of them by default. */
  modes?: string[],
  scenarios?: BenchScenario[],
  /**
   * Where the widgets are drawn while they run: a box of a size of its own, in sight and clear of anything over it (the
   * lower half of the window), which the bench fills with a grid of them.
   */
  container: HTMLElement,
  onProgress?: (text: string) => void,
  /** Stops after the step in progress. */
  signal?: AbortSignal
};

export const BENCH_SCENARIOS: {id: BenchScenario, label: string}[] = [
  {id: 'first', label: 'First widget'},
  {id: 'single', label: 'One at a time'},
  {id: 'batch', label: 'Eight at once'},
  {id: 'anim', label: 'Eight animated'},
  {id: 'compute', label: 'Script work'},
  {id: 'queries', label: 'Layout queries'},
  {id: 'dom', label: 'Large DOM'},
  {id: 'memory', label: 'Memory'}
];

/** Started one after another; a mix of the corpus's widgets. */
const SINGLE = [
  'showcase/commerce/01-order-status', 'showcase/work/02-kanban', 'showcase/life/05-recipe', 'showcase/travel/04-weather',
  'compat/tabs', 'compat/canvas-bar-chart', 'compat/svg-line-chart', 'compat/table-sort', 'compat/calculator',
  'compat/quiz-buttons', 'compat/notes-storage', 'compat/stepper'
];
const BATCH = SINGLE.slice(0, 8);
const FIRST = 'compat/tabs';
/** The bench widgets, which time themselves (bench/ fixtures). */
const MICRO = {compute: 'bench/compute', queries: 'bench/queries', dom: 'bench/dom'};
const ANIMATED = [
  'compat/clock', 'compat/raf-animation', 'compat/css-animation', 'showcase/life/01-fitness-rings',
  'showcase/life/06-music-player', 'showcase/work/04-live-poll', 'showcase/work/05-stock-card', 'showcase/commerce/04-flash-sale'
];
const BATCH_ROUNDS = 3;
const MICRO_RUNS = 3;
const MOUNT_TIMEOUT_MS = 30000;
/** The least height a host reports (its floor, widget-host.ts MIN_HEIGHT): what it says before the widget's content. */
const FLOOR_HEIGHT = 50;
/** `inline`'s first start (see above). */
const INLINE_WARM_NOTE = 'warm after the page\'s first inline widget (its compiled engine stays for the page)';
/**
 * Where the widgets run: every one in sight however many there are, in a grid over the box the bench is given (in sight
 * itself, BenchOptions.container), each clipped to its cell. Chromium throttles the frames of an opaque iframe out of
 * sight (`frame`, `sab · iframe`), while a shadow root draws on the page's own: a widget out of sight would cost less in
 * one engine than in another for less work.
 */
const GRID_STYLE = 'position:absolute;inset:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));' +
  'grid-auto-rows:minmax(0,1fr);pointer-events:none;background-color:var(--background-color)';
const CELL_STYLE = 'min-width:0;min-height:0;overflow:hidden';


function median(values: number[]) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if(!sorted.length) return null;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values: number[], p: number) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null;
}

/** The modes this page can run. */
export function listBenchModes(): BenchMode[] {
  const modes: BenchMode[] = [];
  if(typeof(Worker) !== 'undefined') {
    if(suspendKind('jspi') === 'jspi') {
      modes.push({id: 'worker-jspi', label: 'worker · JSPI', transport: 'worker', renderer: 'shadow', suspend: 'jspi', engines: 1});
    }
    modes.push(
      {id: 'worker-asyncify', label: 'worker · asyncify', transport: 'worker', renderer: 'shadow', suspend: 'asyncify', engines: 1},
      {id: 'worker-asyncify-2', label: 'worker · asyncify · 2 engines', transport: 'worker', renderer: 'shadow', suspend: 'asyncify', engines: 2}
    );
  }
  modes.push({id: 'inline', label: 'inline', transport: 'inline', renderer: 'shadow'});
  if(resolveWidgetTransport('sab') === 'sab') {
    modes.push(
      {id: 'sab-iframe', label: 'sab · iframe', transport: 'sab', renderer: 'iframe'},
      {id: 'sab-shadow', label: 'sab · shadow', transport: 'sab', renderer: 'shadow'}
    );
  }
  modes.push({id: 'frame', label: 'frame', transport: 'frame', renderer: 'iframe'});
  return modes;
}

type Mounted = {
  name: string,
  host?: WidgetHost,
  container: HTMLElement,
  drawnMs?: number,
  loadedMs?: number,
  /**
   * How long its start held the page: what of the preparation did (`inline` makes the VM on the page's thread), as the
   * heartbeat finds it, and `createHost`'s synchronous part. With others starting at once it counts theirs too (a batch
   * measures itself).
   */
  syncMs?: number,
  dead?: string,
  stats?: WidgetStats,
  /** What the widget wrote to localStorage `bench` (the bench widgets' report). */
  report?: Record<string, number>
};

/**
 * The page's thread: the longest gap of a 5 ms timer, and the time of gaps over two intervals; stopped by what it returns.
 * The timer is `view`'s, the window the widgets are shown in: a tab out of sight (behind its Document PiP window) has its
 * timers held to a wake-up a second.
 */
export function heartbeat(view: Window = window) {
  const INTERVAL = 5;
  let last = performance.now(), maxGap = 0, blocked = 0;
  const beat = () => {
    const now = performance.now();
    const gap = now - last;
    maxGap = Math.max(maxGap, gap);
    if(gap > INTERVAL * 2) blocked += gap - INTERVAL;
    last = now;
  };
  const timer = view.setInterval(beat, INTERVAL);
  return () => {
    view.clearInterval(timer);
    // the gap up to now: stopped right after what held the page (a promise's continuation), no beat has seen it yet
    beat();
    return {maxGap, blocked};
  };
}

/**
 * The page's thread busy, in ms per second: a loop of MessageChannel tasks, each noting the time since the one
 * before; what is over a millisecond went to other tasks (and rendering). It takes every idle moment while it runs.
 */
function probeBusy(ms: number) {
  return new Promise<number>((resolve) => {
    const channel = new MessageChannel();
    const start = performance.now();
    let last = start, busy = 0;
    channel.port1.onmessage = () => {
      const now = performance.now();
      if(now - last > 1) busy += now - last;
      last = now;
      if(now - start < ms) return channel.port2.postMessage(0);
      channel.port1.close();
      resolve(busy * 1000 / (now - start));
    };
    channel.port2.postMessage(0);
  });
}

/**
 * Long tasks (50 ms and over) where the browser reports them: their count and time. A window is told of the tasks of its
 * own document, so with the widgets in another one (Document PiP) both are watched, a task told to both counted once.
 */
function longTasks(views: Window[]) {
  const starts: number[] = [];
  let count = 0, ms = 0;
  const watched = [...new Set(views)].filter((view) => (view as typeof window).PerformanceObserver?.supportedEntryTypes?.includes('longtask')).map((view) => {
    const add = (entries: PerformanceEntryList) => {
      for(const entry of entries) {
        // the windows' clocks are one, each from its own origin and coarsened apart
        const start = view.performance.timeOrigin + entry.startTime;
        if(starts.some((other) => Math.abs(other - start) < 1)) continue;
        starts.push(start);
        ++count;
        ms += entry.duration;
      }
    };
    const observer = new (view as typeof window).PerformanceObserver((list) => add(list.getEntries()));
    observer.observe({type: 'longtask'});
    return {observer, add};
  });
  if(!watched.length) return () => null as {count: number, ms: number};
  return () => {
    for(const {observer, add} of watched) {
      add(observer.takeRecords());
      observer.disconnect();
    }
    return {count, ms};
  };
}

/** A display's refresh interval where none could be measured (a hidden page): 60 Hz. */
const REFRESH_MS = 1000 / 60;

/**
 * The page's frames while it runs: how many came, their typical interval, and the share that took over 1.5 of
 * `refresh` — the display's interval as the idle page gets frames, the same for every mode: against a mode's own typical
 * interval, one that misses every other frame would have none slow.
 */
function framePacing(view: Window, refresh?: number) {
  const times: number[] = [];
  let stopped = false;
  const tick = (time: number) => {
    times.push(time);
    if(!stopped) view.requestAnimationFrame(tick);
  };
  view.requestAnimationFrame(tick);
  return () => {
    stopped = true;
    const intervals = times.slice(1).map((time, i) => time - times[i]);
    const interval = median(intervals) || REFRESH_MS;
    return {
      fps: intervals.length ? intervals.length * 1000 / (times[times.length - 1] - times[0]) : 0,
      interval,
      slow: intervals.length ? intervals.filter((value) => value > (refresh ?? interval) * 1.5).length / intervals.length : 0
    };
  };
}

async function measureMemory() {
  const measure = (performance as any).measureUserAgentSpecificMemory as () => Promise<{bytes: number}>;
  if(!measure || !self.crossOriginIsolated) return null;
  try {
    const result = await withTimeout(measure.call(performance), 60000, null);
    return result ? result.bytes : null;
  } catch{
    return null;
  }
}

/**
 * The sources of every widget the bench starts, loaded before anything is timed: the first mode would otherwise pay for
 * fetching the fixtures' modules, and the modes after it would find them cached.
 */
async function loadBenchFixtures() {
  const names = [...new Set([FIRST, ...SINGLE, ...BATCH, ...ANIMATED, ...Object.values(MICRO)])];
  return new Map(await Promise.all(names.map(async(name) => [name, await loadWidgetFixture(name)] as const)));
}

class Bench {
  private runtime: WidgetRuntime;
  private live: Mounted[] = [];
  /** The grid the live widgets are in (GRID_STYLE), in the box while there are any. */
  private grid: HTMLElement;

  /** `htmls`: the widgets' sources, loaded beforehand (loadBenchFixtures), else as they are started. */
  constructor(private box: HTMLElement, private mode: BenchMode, private htmls = new Map<string, string>()) {}

  async init() {
    this.runtime = await loadWidgetRuntime();
    // a mode's first widget starts cold, whatever the sandbox ran before (an engine worker, `sab`'s booted ones)
    await startWidgetEnginesCold(this.mode.transport === 'worker' ? {suspend: this.mode.suspend, engines: this.mode.engines} : {suspend: 'auto', engines: 'auto'});
  }

  private async html(name: string) {
    let html = this.htmls.get(name);
    if(!html) this.htmls.set(name, html = await loadWidgetFixture(name));
    return html;
  }

  /**
   * Starts `name`; resolves once it has drawn and loaded (and, `report`, written its bench result), died or timed out
   * — never rejects: what fails before the start counts as the widget's death.
   */
  async mount(name: string, report = false): Promise<Mounted> {
    // the box's own window: the Document PiP one when the app is shown there
    const doc = this.box.ownerDocument;
    if(!this.grid) {
      this.grid = doc.createElement('div');
      this.grid.style.cssText = GRID_STYLE;
      this.box.append(this.grid);
    }

    const container = doc.createElement('div');
    container.style.cssText = CELL_STYLE;
    this.grid.append(container);
    const mounted: Mounted = {name, container};
    this.live.push(mounted);
    let html: string, engine: Awaited<ReturnType<WidgetRuntime['prepare']>>, deadline: number, t0: number, preparedHeld = 0;
    try {
      // the widget's source is no part of the time (loaded beforehand, but by keepBenchWidgets)
      html = await this.html(name);
      t0 = performance.now();
      const stopBeat = heartbeat(doc.defaultView);
      try {
        // the mount's whole time, its preparation included
        engine = await Promise.race([
          this.runtime.prepare(this.mode.transport),
          new Promise<never>((_, reject) => deadline = window.setTimeout(() => reject(new Error('timed out')), MOUNT_TIMEOUT_MS))
        ]);
      } finally {
        preparedHeld = stopBeat().blocked;
      }
    } catch(err) {
      mounted.dead = 'failed to start: ' + (err as Error)?.message;
      return mounted;
    } finally {
      clearTimeout(deadline);
    }
    // stopped while it was being prepared
    if(!this.live.includes(mounted)) return mounted;
    return new Promise<Mounted>((resolve) => {
      let done = false;
      const check = () => {
        if(done || (!mounted.dead && (mounted.drawnMs === undefined || mounted.loadedMs === undefined || (report && !mounted.report)))) return;
        done = true;
        clearTimeout(timer);
        resolve(mounted);
      };
      const timer = setTimeout(() => {
        mounted.dead ??= 'timed out';
        check();
      }, Math.max(0, MOUNT_TIMEOUT_MS - (performance.now() - t0)));
      const tc = performance.now();
      try {
        mounted.host = this.runtime.createHost(container, html, {
          theme: {colorScheme: 'light'},
          renderer: this.mode.renderer,
          transport: this.mode.transport,
          engine,
          visible: true,
          stoppedLabel: 'stopped',
          onResize: (height) => {
            if(mounted.drawnMs === undefined && height > FLOOR_HEIGHT) mounted.drawnMs = performance.now() - t0;
            check();
          },
          onLoaded: () => {
            mounted.loadedMs = performance.now() - t0;
            // a widget that stays at the floor has drawn by now (all the bench's are taller)
            setTimeout(() => {
              mounted.drawnMs ??= mounted.loadedMs;
              check();
            }, 500);
            check();
          },
          onStorageCommit: (area, values) => {
            if(area === 'local' && values.bench) {
              try {
                mounted.report = JSON.parse(values.bench);
              } catch{}
              check();
            }
          },
          onDead: (reason) => {
            mounted.dead = reason;
            check();
          },
          onStats: (stats) => mounted.stats = stats
        });
      } catch(err) {
        // a host that cannot be made (no worker for `sab`, …) is a widget that died at once
        mounted.dead = 'failed to start: ' + (err as Error)?.message;
        check();
        return;
      }
      mounted.syncMs = preparedHeld + performance.now() - tc;
    });
  }

  destroyAll() {
    for(const {host, container} of this.live.splice(0)) {
      host?.destroy();
      container.remove();
    }

    this.grid?.remove();
    this.grid = undefined;
  }
}

/**
 * Widgets of the bench kept running on `modeId`, for a script that measures the memory they take from outside the
 * page: `add` starts more and resolves once they have loaded (with the ones that died), `stop` stops them all.
 */
export async function keepBenchWidgets(modeId: string, container: HTMLElement) {
  const mode = listBenchModes().find(({id}) => id === modeId);
  if(!mode) throw new Error(`no bench mode "${modeId}"`);
  const bench = new Bench(container, mode);
  await bench.init();
  let started = 0;
  return {
    add: async(count: number) => {
      const mounted = await Promise.all(Array.from({length: count}, () => bench.mount(SINGLE[started++ % SINGLE.length])));
      return mounted.filter((m) => m.dead).map((m) => `${m.name}: ${m.dead}`);
    },
    stop: async() => {
      bench.destroyAll();
      await applyWidgetEngineOptions();
    }
  };
}

/** Runs the bench; the table it returns has a row per metric and a column per mode. */
export async function runWidgetBench(options: BenchOptions): Promise<BenchResult> {
  const all = listBenchModes();
  const modes = options.modes ? all.filter((mode) => options.modes.includes(mode.id)) : all;
  const scenarios = new Set<BenchScenario>(options.scenarios ?? BENCH_SCENARIOS.map(({id}) => id));
  const progress = options.onProgress ?? (() => {});
  const rows = new Map<string, BenchRow>();
  const deaths: Record<string, string[]> = {};
  const put = (scenario: BenchScenario, metric: string, unit: string, better: BenchRow['better'], mode: BenchMode, value: number | null, note?: string) => {
    const key = scenario + '\n' + metric;
    let row = rows.get(key);
    // a metric no mode could measure (long tasks outside Chromium, a widget that died everywhere) gets no row
    if(!row && (value === null || value === undefined || !Number.isFinite(value))) return;
    if(!row) rows.set(key, row = {scenario, metric, unit, better, values: {}});
    row.values[mode.id] = value === null || value === undefined || !Number.isFinite(value) ? null : Math.round(value * 10) / 10;
    if(note) (row.notes ??= {})[mode.id] = note;
  };
  const died = (mode: BenchMode, mounted: Mounted[]) => {
    for(const m of mounted) if(m.dead) (deaths[mode.id] ??= []).push(`${m.name}: ${m.dead}`.slice(0, 200));
  };
  const ok = (mounted: Mounted[]) => mounted.filter((m) => !m.dead);

  // the window the widgets are shown in, whose frames and timers are measured: the Document PiP one with the app there,
  // while the tab behind it may be out of sight, with no frames and its timers held
  const view = options.container.ownerDocument.defaultView;

  progress('Loading the widgets…');
  const htmls = await loadBenchFixtures();
  // the idle page, for the animated scenario: the display's refresh interval, which every mode's frames are judged
  // against, and what the busy probe finds with no widget, subtracted from what it finds with them
  progress('Measuring the idle page…');
  let refresh = REFRESH_MS, idleBusy = 0;
  if(scenarios.has('anim')) {
    const stopIdleFrames = framePacing(view);
    await pause(1000);
    refresh = stopIdleFrames().interval;
    idleBusy = await probeBusy(1500);
  }

  try {
    for(const mode of modes) {
      if(options.signal?.aborted) break;
      const bench = new Bench(options.container, mode, htmls);
      try {
        await runMode(bench, mode);
      } finally {
        bench.destroyAll();
      }
    }
  } finally {
    await applyWidgetEngineOptions();
  }

  async function runMode(bench: Bench, mode: BenchMode) {
    const step = (text: string) => progress(`${mode.label}: ${text}`);
    await bench.init();

    if(scenarios.has('first')) {
      step('first widget');
      const first = await bench.mount(FIRST);
      bench.destroyAll();
      died(mode, [first]);
      const note = mode.transport === 'inline' ? INLINE_WARM_NOTE : undefined;
      put('first', 'drawn', 'ms', 'lower', mode, first.dead ? null : first.drawnMs, note);
      put('first', 'page held by the start', 'ms', 'lower', mode, first.syncMs, note);
    }

    if(scenarios.has('single') && !options.signal?.aborted) {
      const results: Mounted[] = [];
      for(const name of SINGLE) {
        if(options.signal?.aborted) break;
        step(`one at a time, ${name}`);
        results.push(await bench.mount(name));
        await pause(200);
        bench.destroyAll();
      }
      died(mode, results);
      const good = ok(results);
      put('single', 'drawn, median', 'ms', 'lower', mode, median(good.map((m) => m.drawnMs)));
      put('single', 'drawn, 90th percentile', 'ms', 'lower', mode, percentile(good.map((m) => m.drawnMs), .9));
      put('single', 'loaded, median', 'ms', 'lower', mode, median(good.map((m) => m.loadedMs)));
      put('single', 'page held by a start, median', 'ms', 'lower', mode, median(good.map((m) => m.syncMs)));
      put('single', 'page held by a start, max', 'ms', 'lower', mode, Math.max(...good.map((m) => m.syncMs)));
    }

    if(scenarios.has('batch') && !options.signal?.aborted) {
      const rounds: {all: number, maxGap: number, blocked: number, long: {count: number, ms: number}}[] = [];
      for(let round = 0; round < BATCH_ROUNDS && !options.signal?.aborted; ++round) {
        step(`eight at once, round ${round + 1}`);
        await pause(800);
        const stopBeat = heartbeat(view);
        const stopLong = longTasks([view, window]);
        const t0 = performance.now();
        const results = await Promise.all(BATCH.map((name) => bench.mount(name)));
        const all = performance.now() - t0;
        await pause(300);
        const beat = stopBeat(), long = stopLong();
        died(mode, results);
        bench.destroyAll();
        // a round in which a widget did not draw measures less than eight widgets
        if(!results.some((m) => m.dead)) rounds.push({all, ...beat, long});
      }
      put('batch', 'all drawn', 'ms', 'lower', mode, median(rounds.map((r) => r.all)));
      put('batch', 'longest the page was held', 'ms', 'lower', mode, median(rounds.map((r) => r.maxGap)));
      put('batch', 'page held, in all', 'ms', 'lower', mode, median(rounds.map((r) => r.blocked)));
      put('batch', 'long tasks (Chromium)', 'ms', 'lower', mode, rounds[0]?.long ? median(rounds.map((r) => r.long.ms)) : null);
    }

    if(scenarios.has('anim') && !options.signal?.aborted) {
      step('eight animated');
      const results = await Promise.all(ANIMATED.map((name) => bench.mount(name)));
      await pause(1000);
      const stopBeat = heartbeat(view);
      const stopFrames = framePacing(view, refresh);
      await pause(2000);
      const beat = stopBeat();
      const frames = stopFrames();
      const busy = await probeBusy(2000);
      // a widget may die while it is measured
      died(mode, results);
      bench.destroyAll();
      // fewer than eight running would cost the page less
      const all = !results.some((m) => m.dead);
      put('anim', 'page busy', 'ms/s', 'lower', mode, all ? Math.max(0, busy - idleBusy) : null);
      put('anim', 'longest the page was held', 'ms', 'lower', mode, all ? beat.maxGap : null);
      put('anim', 'page frames', 'fps', 'higher', mode, all ? frames.fps : null);
      put('anim', 'slow page frames', '%', 'lower', mode, all ? frames.slow * 100 : null);
    }

    // the bench widgets: what they time themselves, the median of a few runs
    const micro = async(name: string) => {
      const reports: Record<string, number>[] = [];
      const loaded: number[] = [];
      const gaps: number[] = [];
      for(let run = 0; run < MICRO_RUNS && !options.signal?.aborted; ++run) {
        step(`${name}, run ${run + 1}`);
        const stopBeat = heartbeat(view);
        const mounted = await bench.mount(name, true);
        const gap = stopBeat().maxGap;
        died(mode, [mounted]);
        if(mounted.report) reports.push(mounted.report);
        if(!mounted.dead) {
          loaded.push(mounted.loadedMs);
          gaps.push(gap);
        }
        bench.destroyAll();
        await pause(300);
      }
      return {
        value: (key: string) => median(reports.map((report) => report[key])),
        loaded: median(loaded),
        maxGap: median(gaps)
      };
    };

    if(scenarios.has('compute') && !options.signal?.aborted) {
      const {value} = await micro(MICRO.compute);
      put('compute', 'script work (10 tasks)', 'ms', 'lower', mode, value('computeMs'));
    }

    if(scenarios.has('queries') && !options.signal?.aborted) {
      const {value, maxGap} = await micro(MICRO.queries);
      put('queries', 'query after a style change', 'µs', 'lower', mode, value('queryUs'));
      put('queries', 'query from the cache', 'µs', 'lower', mode, value('cachedQueryUs'));
      put('queries', 'longest the page was held', 'ms', 'lower', mode, maxGap);
    }

    if(scenarios.has('dom') && !options.signal?.aborted) {
      const {value, loaded, maxGap} = await micro(MICRO.dom);
      put('dom', '400 elements: script', 'ms', 'lower', mode, value('buildMs'));
      put('dom', '400 elements: loaded', 'ms', 'lower', mode, loaded);
      put('dom', '40 changes a frame: script', 'ms', 'lower', mode, value('frameMs'));
      put('dom', 'frames the widget got', 'fps', 'higher', mode, value('fps'));
      put('dom', 'longest the page was held', 'ms', 'lower', mode, maxGap);
    }

    if(scenarios.has('memory') && !options.signal?.aborted && self.crossOriginIsolated && (performance as any).measureUserAgentSpecificMemory) {
      step('memory');
      const before = await measureMemory();
      const results = await Promise.all(BATCH.map((name) => bench.mount(name)));
      await pause(1000);
      const after = await measureMemory();
      died(mode, results);
      bench.destroyAll();
      const measured = before !== null && after !== null && !results.some((m) => m.dead);
      put('memory', 'per live widget', 'MB', 'lower', mode, measured ? (after - before) / BATCH.length / 1048576 : null);
    }
  }

  return {
    env: {
      userAgent: navigator.userAgent,
      cores: navigator.hardwareConcurrency || 0,
      isolated: !!self.crossOriginIsolated,
      jspi: suspendKind('jspi') === 'jspi',
      date: new Date().toISOString(),
      longTasks: !!PerformanceObserver.supportedEntryTypes?.includes('longtask'),
      memory: !!self.crossOriginIsolated && !!(performance as any).measureUserAgentSpecificMemory
    },
    modes,
    rows: [...rows.values()],
    deaths
  };
}

/** The result as a Markdown table, a column per mode, the best value of a row in bold. */
export function benchToMarkdown(result: BenchResult) {
  const {env, modes, rows} = result;
  const head = `| Scenario | Metric | ${modes.map((mode) => mode.label).join(' | ')} |`;
  const line = `|---|---|${modes.map(() => '---:').join('|')}|`;
  const body = rows.map((row) => {
    const best = bestOf(row);
    const cells = modes.map((mode) => {
      const value = row.values[mode.id];
      if(value === null || value === undefined) return '–';
      const text = `${value} ${row.unit}${row.notes?.[mode.id] ? '\\*' : ''}`;
      return value === best ? `**${text}**` : text;
    });
    const scenario = BENCH_SCENARIOS.find(({id}) => id === row.scenario)?.label;
    return `| ${scenario} | ${row.metric} | ${cells.join(' | ')} |`;
  });
  const deaths = Object.entries(result.deaths).map(([id, list]) => `- ${id}: ${list.length} died (${list.slice(0, 3).join('; ')})`);
  const notes = benchNotes(result);
  return [
    `${env.userAgent}; ${env.cores} cores; JSPI ${env.jspi ? 'yes' : 'no'}; cross-origin isolated ${env.isolated ? 'yes' : 'no'}; ${env.date}`,
    '',
    head,
    line,
    ...body,
    ...(notes.length ? ['', ...notes.map((note) => `\\* ${note}`)] : []),
    ...(deaths.length ? ['', 'Deaths:', ...deaths] : [])
  ].join('\n');
}

/** What the marked values (`*`) are, once each: a mode, a scenario and the note. */
export function benchNotes(result: BenchResult) {
  const lines = result.rows.flatMap((row) => Object.entries(row.notes ?? {}).map(([id, note]) => {
    const mode = result.modes.find((mode) => mode.id === id)?.label ?? id;
    return `${mode}, ${BENCH_SCENARIOS.find(({id}) => id === row.scenario)?.label}: ${note}`;
  }));
  return [...new Set(lines)];
}

/** The best value of a row, if more than one mode has one. */
export function bestOf(row: BenchRow) {
  const values = Object.values(row.values).filter((v) => v !== null && v !== undefined);
  if(values.length < 2) return undefined;
  return row.better === 'lower' ? Math.min(...values) : Math.max(...values);
}
