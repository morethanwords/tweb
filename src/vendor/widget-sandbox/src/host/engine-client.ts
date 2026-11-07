// tweb (`worker` transport, see UPSTREAM.md): the page's side of its engine workers (engine-worker.ts). One starts with
// the first widget and serves every widget of the page; each WidgetHost talks to it through a channel of its own. The
// widgets of an engine share its thread, so while one's task runs the others wait. Where QuickJS runs as the asyncify
// build (no JSPI: Firefox), about twice as slow, a page of widgets waited twice as long for them, so there, past
// WIDGETS_PER_ENGINE live widgets on a device with the cores for it, a second engine takes the next ones; it starts from
// the first one's compiled QuickJS and snapshot (no second warm-up). Elsewhere it saved ~60 ms of eight widgets for
// ~20 MB (its snapshot, its isolate). An engine that runs nothing stops after a while (an extra one sooner): it holds
// that memory with no widget to show for it. A worker that fails takes its widgets with it; the next widget starts
// another.

import sandboxBundle from 'virtual:sandbox-bundle';
import { suspendKind, type SuspendKind } from './suspend';
import type { EngineToPage, PageToEngine } from '../shared/protocol';

type ChannelMessage = Extract<EngineToPage, { id: number }>;
type ChannelSend = PageToEngine extends infer M ? M extends { id: number } ? Omit<M, 'id'> : never : never;

export interface EngineChannel {
  send(msg: ChannelSend, transfer?: Transferable[]): void;
  /** No more messages either way; a widget that still runs is stopped. */
  close(): void;
}

/** How engines start (a debug and bench switch: users get `auto`, see `setEngineOptions`). */
export interface EngineOptions {
  /** How a widget's code waits for a query's answer: `auto` is JSPI where the engine has it, else asyncify. */
  suspend: SuspendKind | 'auto';
  /** Engines at most; `auto`: two for the asyncify build on a device with the cores for it, else one. */
  engines: number | 'auto';
}

/** What a running engine reports (`listEngines`). */
export interface EngineInfo {
  kind: string;
  /** From the boot message to ready: compiling QuickJS and warming the snapshot, or taking another engine's. */
  bootMs: number;
  widgets: number;
}

/** An engine kept for a widget being prepared (`reserveEngine`), until its host opens a channel on it. */
export interface EngineSlot {
  readonly engine: unknown;
}

interface Engine {
  worker: Worker;
  ready: Promise<void>;
  /** Rejects when the worker is gone (failed, stopped). */
  gone: Promise<never>;
  /** Terminates the worker (it runs no widget). */
  stop: (reason: string) => void;
  channels: Map<number, (msg: ChannelMessage | { type: 'lost'; reason: string }) => void>;
  /** Widgets being prepared for it. */
  reserved: number;
  idleTimer: ReturnType<typeof setTimeout> | 0;
  /** Takes no new widget and stops once its last one is gone (the options changed). */
  retired: boolean;
  info?: { kind: string; bootMs: number };
}

/** Live widgets an engine takes before a second one starts. */
const WIDGETS_PER_ENGINE = 4;
/** Engines at most: a second one for the asyncify build (no JSPI) where there are cores for it besides the page's. */
const maxEngines = () => options.engines !== 'auto' ? Math.max(1, options.engines) :
  suspendKind(options.suspend) === 'asyncify' && (navigator.hardwareConcurrency || 0) >= 4 ? 2 : 1;
/** An engine that runs no widget stops after this long; the last one after IDLE_LAST_MS. */
const IDLE_EXTRA_MS = 30_000;
const IDLE_LAST_MS = 5 * 60_000;
/** A reservation no host takes up is dropped after this long. */
const RESERVATION_MS = 15_000;
/** A second engine waits this long for the first one's snapshot, then warms its own. */
const SHARE_TIMEOUT_MS = 5_000;

/** The engines that take widgets (a retired one is only in its channels' hands). */
const engines: Engine[] = [];
let nextId = 0;
let options: EngineOptions = { suspend: 'auto', engines: 'auto' };

/** Changes how engines start; the running ones take no new widget and stop when their last one is gone. */
export function setEngineOptions(next: Partial<EngineOptions>) {
  const changed = { ...options, ...next };
  if (changed.suspend === options.suspend && changed.engines === options.engines) return;
  options = changed;
  for (const engine of engines.splice(0)) {
    engine.retired = true;
    checkIdle(engine);
  }
}

export function listEngines(): EngineInfo[] {
  return engines.filter((engine) => engine.info).map((engine) => ({ ...engine.info!, widgets: engine.channels.size }));
}

function load(engine: Engine) {
  return engine.channels.size + engine.reserved;
}

function startEngine(from?: Engine): Engine {
  const worker = new Worker(new URL('./engine-worker.ts', import.meta.url), { type: 'module' });
  const channels: Engine['channels'] = new Map();
  let settle: { resolve: () => void; reject: (e: Error) => void };
  const ready = new Promise<void>((resolve, reject) => { settle = { resolve, reject }; });
  ready.catch(() => {});
  let markGone: (e: Error) => void;
  const gone = new Promise<never>((_, reject) => { markGone = reject; });
  gone.catch(() => {});
  const engine: Engine = { worker, ready, gone, channels, reserved: 0, idleTimer: 0, retired: false, stop: (reason) => stop(reason) };
  const stop = (reason: string) => {
    const index = engines.indexOf(engine);
    if (index !== -1) engines.splice(index, 1);
    if (engine.idleTimer) clearTimeout(engine.idleTimer);
    worker.terminate();
    markGone(new Error(reason));
  };
  const lose = (reason: string) => {
    stop(reason);
    settle.reject(new Error(reason));
    for (const deliver of channels.values()) deliver({ type: 'lost', reason });
    channels.clear();
  };
  worker.onmessage = (e: MessageEvent<EngineToPage>) => {
    const msg = e.data;
    if (msg.type === 'ready') {
      engine.info = { kind: msg.kind, bootMs: msg.bootMs };
      settle.resolve();
    }
    else if (msg.type === 'failed') lose('the engine failed to start: ' + msg.error);
    else if (msg.type !== 'shared') channels.get(msg.id)?.(msg);
  };
  worker.onerror = (e) => lose('the engine worker failed: ' + (e.message || 'error'));
  const suspend = options.suspend;
  const boot = (shared?: Extract<EngineToPage, { type: 'shared' }>) => worker.postMessage({ type: 'boot', sandboxBundle, timeOrigin: performance.timeOrigin, shared, suspend } satisfies PageToEngine);
  if (from) {
    // the first engine's QuickJS and snapshot: it shares them once it has them; gone or slow, this one warms its own
    let onShared: (e: MessageEvent<EngineToPage>) => void;
    let timer: ReturnType<typeof setTimeout>;
    let settled = false;
    // tweb: handed over beside the race, not as what it resolves to: `from.gone` holds the race for the first engine's
    // life, and with it what it resolved to (the snapshot and the module, ~4 MB more with every second engine started)
    let shared: Extract<EngineToPage, { type: 'shared' }> | undefined;
    Promise.race([
      from.ready.then(() => new Promise<void>((resolve) => {
        // tweb: ready after the race was over (it timed out): a listener added now is never taken away, and what it got,
        // the snapshot and the module, would stay with the first engine for its life
        if (settled) return resolve();
        onShared = (e) => {
          if (e.data.type !== 'shared') return;
          shared = e.data;
          resolve();
        };
        from.worker.addEventListener('message', onShared);
        from.worker.postMessage({ type: 'share' } satisfies PageToEngine);
      })),
      from.gone,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), SHARE_TIMEOUT_MS); }),
    ]).finally(() => {
      settled = true;
      clearTimeout(timer);
      if (onShared) from.worker.removeEventListener('message', onShared);
    }).then(() => {
      const handed = shared;
      shared = undefined;
      boot(handed);
    }, () => {
      shared = undefined;
      boot();
    });
  } else {
    boot();
  }
  engines.push(engine);
  return engine;
}

/** Stops `engine` once it has run nothing for a while (sooner if another engine is left). */
function checkIdle(engine: Engine) {
  if (engine.idleTimer) clearTimeout(engine.idleTimer);
  engine.idleTimer = 0;
  if (load(engine)) return;
  if (engine.retired) return engine.stop('retired');
  const stopIfIdle = (waited: number) => {
    engine.idleTimer = 0;
    if (load(engine) || !engines.includes(engine)) return;
    // tweb: the last engine left waits the longer time, also when the others stopped after it went idle (both idle,
    // both waited the shorter one, and both stopped: the next widget compiled QuickJS and warmed a snapshot again)
    if (engines.length === 1 && waited < IDLE_LAST_MS) {
      engine.idleTimer = setTimeout(() => stopIfIdle(IDLE_LAST_MS), IDLE_LAST_MS - waited);
      return;
    }
    engine.stop('idle');
  };
  const wait = engines.length > 1 ? IDLE_EXTRA_MS : IDLE_LAST_MS;
  engine.idleTimer = setTimeout(() => stopIfIdle(wait), wait);
}

/** The engine for the next widget: the least busy one, a new one past WIDGETS_PER_ENGINE each (up to maxEngines). */
function pickEngine(): Engine {
  let best = engines[0];
  for (const engine of engines) if (load(engine) < load(best)) best = engine;
  if (!best) return startEngine();
  if (load(best) >= WIDGETS_PER_ENGINE && engines.length < maxEngines()) return startEngine(engines[0]);
  return best;
}

/** Starts the engine worker a widget will run in and resolves when it can (`openEngineChannel` with the slot). */
export function reserveEngine(): Promise<EngineSlot> {
  const engine = pickEngine();
  ++engine.reserved;
  checkIdle(engine);
  let taken = false;
  const release = () => {
    if (taken) return;
    taken = true;
    --engine.reserved;
    checkIdle(engine);
  };
  const timer = setTimeout(release, RESERVATION_MS);
  const slot = { engine, take: () => { clearTimeout(timer); release(); } };
  return engine.ready.then(() => slot, (e) => {
    slot.take();
    throw e;
  });
}

/** A channel to an engine for one widget (the reserved one, if any); `onMessage` also gets `lost` when the worker is gone. */
export function openEngineChannel(onMessage: (msg: ChannelMessage | { type: 'lost'; reason: string }) => void, slot?: EngineSlot): EngineChannel {
  const reserved = slot as (EngineSlot & { engine: Engine; take: () => void }) | undefined;
  const engine = reserved && engines.includes(reserved.engine) ? reserved.engine : pickEngine();
  // a reservation on an engine retired since: that engine stops once its widgets are gone, this one goes elsewhere
  reserved?.take();
  const id = ++nextId;
  engine.channels.set(id, onMessage);
  checkIdle(engine);
  let open = true;
  // tweb: an engine still booting (a second one waits for the first one's snapshot before its boot) gets the widget's
  // messages once it has booted, in order
  let booting = engine.info ? undefined : engine.ready.catch(() => {});
  let dropped = false;
  const post = (msg: PageToEngine, transfer?: Transferable[]) => {
    if (booting) booting = booting.then(() => { if (!dropped) engine.worker.postMessage(msg, transfer ?? []); });
    else engine.worker.postMessage(msg, transfer ?? []);
  };
  return {
    send(msg, transfer) {
      if (open) post({ ...msg, id } as PageToEngine, transfer);
    },
    close() {
      if (!open) return;
      open = false;
      if (!engine.channels.delete(id)) return;
      // tweb: closed while the engine still boots, nothing of the widget's was posted yet: the engine never hears of it
      // (it made the widget's copy of the VM only to drop it)
      if (!engine.info) dropped = true;
      else post({ type: 'input', id, msg: { type: 'stop' } } satisfies PageToEngine);
      checkIdle(engine);
    },
  };
}
