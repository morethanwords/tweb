// Sandbox glue: trusted code around one QuickJS runtime (invariants 1 and 5).
//
// Everything evaluated inside the QuickJS context — widget scripts, the DOM
// library, our shim — is untrusted. The context gets exactly ONE capability:
// the `__host(kind, payload)` function below, which takes and returns strings.
// No fetch/XHR/WebSocket or any other browser API is exposed to it.
//
// One glue per widget. It runs in a worker (worker.ts, the `sab` transport), in the renderer's frame
// (renderer/frame-runtime.ts, `frame`), in the page next to a Shadow DOM renderer (`inline`, tweb: the VM is a
// copy of a warmed one, inline-engine.ts), or in the page's engine worker with other widgets' glues (`worker`, tweb:
// engine-worker.ts), where a layout query waits for the page's answer without the widget's code knowing (suspend.ts).
//
// tweb: a task is a generator (`Steps`) that yields only where a host call waits, so it runs to its end in the call on
// every transport but `worker`; there it goes on when the answer comes, and what arrives meanwhile waits its turn.
//
// On native clients this file corresponds to the thread that owns the QuickJS
// runtime; `syncQuery` uses a semaphore instead of Atomics.

import { newQuickJSWASMModuleFromVariant, newVariant, type QuickJSContext, type QuickJSHandle, type QuickJSRuntime, type QuickJSWASMModule } from 'quickjs-emscripten-core';
// QuickJS built from the TelegramMessenger/quickjs fork (packages/quickjs-wasm, decisions.md).
import baseVariant from '@telegram/widget-sandbox-quickjs';
import wasmUrl from '@telegram/widget-sandbox-quickjs/wasm?url';
import { CpuBudget, opsCostMs, queryLimitHit as queryLimitOf, queryLimitReason } from './cpu-budget';
import { LIMIT_DEFAULTS, MAX_ANIM_BATCH_BYTES, MAX_TIMER_DELAY_MS, SAB_BIN_LEN, SAB_HEADER, SAB_JSON_LEN, SAB_STATE, WASM_INITIAL_PAGES, WASM_PAGE_BYTES, type HostToWorker, type SandboxConfig, type Stats, type SyncTransport, type WorkerToHost } from '../shared/protocol';

import { STORAGE_QUOTA_BYTES } from '../shared/sdk-policy';
import { formatIntl } from '../shared/intl';
import type { Suspender } from './suspend';

/** A layout query's answer from a renderer in another thread (`worker`); `hostMs`: what answering cost that thread. */
export interface QueryAnswer { json: string; binary?: ArrayBuffer; hostMs: number }

/**
 * Where the glue's messages go, and the renderer that answers its layout queries: in this thread (`frame`, `inline`:
 * `query`) or in the page (`worker`: `ask`, the widget's code waits for the answer).
 */
export interface GlueEnv {
  post(msg: WorkerToHost): void;
  query?(queryJson: string): { json: string; binary?: ArrayBuffer };
  ask?(query: unknown): Promise<QueryAnswer>;
  /** An HTML parser outside QuickJS (html-tree.ts in a window, html-tree-parse5.ts in a worker); without it the shim parses with parse5 itself. */
  parseHTML?(arg: string): string;
}

/** A VM restored from the warmed snapshot (inline-engine.ts): the bundle is evaluated and its host globals hidden. */
export interface AdoptedVM {
  rt: QuickJSRuntime;
  vm: QuickJSContext;
  /** The shim's `__twDispatch`, held privately. */
  dispatch: QuickJSHandle;
  /** The memory limit its wasm Memory was sized for. */
  memoryLimitBytes: number;
  /** Points the snapshot's `__host` / `__hostBinary` at this glue. */
  bindHost(host: (kind: QuickJSHandle, arg?: QuickJSHandle) => QuickJSHandle, binary: () => QuickJSHandle): void;
  /** `worker`: the instance's host calls can wait (suspend.ts). */
  suspender?: Suspender;
}

/** What `warmForSnapshot` leaves behind for inline-engine.ts to copy. */
export interface WarmedVM {
  QuickJS: QuickJSWASMModule;
  rt: QuickJSRuntime;
  vm: QuickJSContext;
  dispatch: QuickJSHandle;
  memory: WebAssembly.Memory;
}

export interface Glue {
  receive(msg: HostToWorker): void;
  /** inline-engine.ts: boots a VM for the snapshot from a compiled module, installing `seedScript` before the host globals go. */
  warmForSnapshot(msg: Extract<HostToWorker, { type: 'warm' }>, wasmModule: WebAssembly.Module, seedScript: string): Promise<WarmedVM>;
  /** `inline`, `worker`: starts the widget in a restored VM (`inline`: synchronously). */
  adopt(restored: AdoptedVM, msg: Extract<HostToWorker, { type: 'start' }>): void;
  /** `inline`, `worker`: the host is gone; timers stop and the VM is dropped. */
  destroy(): void;
  /**
   * The widget stops with `reason`, as for running out of memory or CPU (the host hears `dead`): `worker` and `frame`,
   * whose validator is beside the glue, when a counted cap is passed (the validator's `stopped`, v0.3.0).
   */
  kill(reason: string): void;
}

interface Deferred { kind: string; arg: unknown }

/** A task's work: yields the promise of a host call that waits (`worker` only) and goes on with what it settles to. */
type Steps<T = void> = Generator<Promise<unknown>, T, unknown>;
type QuickJSContextResult = ReturnType<QuickJSContext['evalCode']>;

/** Where code runs in the VM: at once (`sync`), or able to wait for a host call's answer (the `worker` transport). */
interface Entries {
  call(fn: QuickJSHandle, thisVal: QuickJSHandle, args: QuickJSHandle[]): Steps<QuickJSContextResult>;
  eval(code: string, filename: string, type: 'global' | 'module'): Steps<QuickJSContextResult>;
  /** Runs the pending jobs: how many ran, or the error one threw. */
  jobs(): Steps<{ value?: number; error?: QuickJSHandle }>;
}

function syncEntries(rt: QuickJSRuntime, vm: QuickJSContext): Entries {
  return {
    *call(fn, thisVal, args) { return vm.callFunction(fn, thisVal, ...args); },
    *eval(code, filename, type) { return vm.evalCode(code, filename, { type }); },
    *jobs() {
      const r = rt.executePendingJobs();
      return r.error ? { error: r.error } : { value: r.value };
    },
  };
}

/**
 * tweb: `worker` puts every widget's VM and glue on the engine's one thread, where a task goes on in promise reactions
 * — after a call into the VM (JSPI gives a promise even for one that never suspended), as its code resumes after a
 * layout query, once that code has ended — queued behind what other widgets' tasks queued, which run first. Each glue
 * takes the thread where its code goes on; the one it was taken from notes the moment (its own code ended there), and
 * on taking it back counts the time since as the others' (`othersTurn`).
 */
interface ThreadTurn {
  lostAt: number;
}
let threadHolder: ThreadTurn | null = null;
/** The thread is `turn`'s now: how long others had it since it last did (0 when nobody took it meanwhile). */
function takeThread(turn: ThreadTurn): number {
  if (threadHolder === turn) return 0;
  const now = performance.now();
  if (threadHolder) threadHolder.lostAt = now;
  threadHolder = turn;
  return turn.lostAt ? now - turn.lostAt : 0;
}

/** What quickjs-emscripten-core's callFunction / evalCode / executePendingJobs do, through exports that can wait. */
function waitingEntries(rt: QuickJSRuntime, vm: QuickJSContext, suspender: Suspender): Entries {
  const c = vm as any;
  const result = (ptr: number): QuickJSContextResult => {
    const ctx = c.ctx.value;
    const errorPtr = c.ffi.QTS_ResolveException(ctx, ptr);
    if (errorPtr) {
      c.ffi.QTS_FreeValuePointer(ctx, ptr);
      return c.fail(c.memory.heapValueHandle(errorPtr));
    }
    return c.success(c.memory.heapValueHandle(ptr));
  };
  function* run(name: Parameters<Suspender['run']>[0], args: number[]): Steps<number> {
    const r = suspender.run(name, args);
    if (typeof r === 'number') return r;
    return (yield r) as number;
  }
  return {
    *call(fn, thisVal, args) {
      const argv = c.memory.toPointerArray(args);
      try {
        return result(yield* run('_QTS_Call', [c.ctx.value, fn.value, thisVal.value, args.length, argv.value]));
      } finally {
        argv.dispose();
      }
    },
    *eval(code, filename, type) {
      const codeH = c.memory.newHeapCharPointer(code);
      const nameH = c.memory.newHeapCharPointer(filename);
      try {
        // flags: JS_EVAL_TYPE_GLOBAL 0, JS_EVAL_TYPE_MODULE 1; no module detection
        return result(yield* run('_QTS_Eval', [c.ctx.value, codeH.value.ptr, codeH.value.strlen, nameH.value.ptr, 0, type === 'module' ? 1 : 0]));
      } finally {
        codeH.dispose();
        nameH.dispose();
      }
    },
    *jobs() {
      const r = rt as any;
      const out = r.memory.newMutablePointerArray(1);
      let ptr: number, ctxPtr: number;
      try {
        ptr = yield* run('_QTS_ExecutePendingJob', [r.rt.value, -1, out.value.ptr]);
        ctxPtr = out.value.typedArray[0];
      } finally {
        out.dispose();
      }
      if (ctxPtr === 0) {
        r.ffi.QTS_FreeValuePointerRuntime(r.rt.value, ptr);
        return { value: 0 };
      }
      const handle = c.memory.heapValueHandle(ptr);
      if (vm.typeof(handle) === 'number') {
        const n = vm.getNumber(handle);
        handle.dispose();
        return { value: n };
      }
      return { error: handle };
    },
  };
}

const QUERY_TIMEOUT_MS = 3000;
/**
 * Evaluating the sandbox bundle (our code, before any widget code exists) takes ~0.4 s in a worker and ~1 s on a page's
 * main thread (the `frame` transport in Firefox and WebKit) on a slow machine, and several times that under load.
 */
const BUNDLE_BOOT_BUDGET_MS = 15_000;
const MAX_LOG = 4000;
/**
 * `inline`, `worker`: a widget's first tasks (its parse, its scripts, `load`) may run this many times the slice: one
 * slice covers a whole task there (`resetDeadline`), where a worker of its own gives each script a fresh one. The
 * limit is the native engines'; QuickJS as wasm on a page's thread runs 2–3 times slower than in a worker in WebKit,
 * and a dozen widgets starting at once once took a showcase widget's first task past 500 ms there. Later tasks keep it.
 */
const SHARED_BOOT_SLICE_FACTOR = 2;
/** The main-thread window (`mainThreadQuotaMs`): layout queries and the cost of the ops, apart from the JS quota. */
const newMainBudget = (c: SandboxConfig) => new CpuBudget({ cpuLimitMs: c.cpuLimitMs, cpuQuotaMs: c.mainThreadQuotaMs ?? LIMIT_DEFAULTS.mainThreadQuotaMs, cpuQuotaWindowMs: c.cpuQuotaWindowMs, cpuKillAfterMs: 0 });
/**
 * `worker` on the asyncify build (engines without JSPI: Firefox): the same work takes ~1.8 times as long (measured on
 * the sandbox bundle and the showcase), so a task gets twice the slice and half its time counts toward the quota: a
 * widget may do as much there as elsewhere. It runs in the engine worker, never on the page's thread.
 */
const ASYNCIFY_SLOWDOWN = 2;
/** Two full areas of the quota at 12 JSON characters per byte (`\uXXXX` escapes plus the quotes, colon and comma of tiny pairs): a longer commit cannot be within the quota. */
const MAX_STORAGE_COMMIT_CHARS = 2 * 12 * STORAGE_QUOTA_BYTES + 64;

/** The features this runtime implements; the rest of what a host asks for is dropped (Swift: `runtimeFeatures`). */
const WEB_FEATURES = new Set(['webAnimations', 'noInPlaceText', 'noAttrFast', 'noCanvasRect']);
const withWebFeatures = (c: SandboxConfig): SandboxConfig => ({ ...c, features: (c.features ?? []).filter((f) => WEB_FEATURES.has(f)) });

const decoder = new TextDecoder();

const HIDE_HOST_GLOBALS = "(function(g){for(const n of ['__host','__hostBinary','__hostCanvas','__hostOps','__twDispatch'])if(!delete g[n])throw new Error(n);})(globalThis);";
/** Widget clocks tick in 100 µs steps (a worker's own performance.now() can be finer in a cross-origin-isolated page), so they cannot time cache or pool effects of other widgets. */
const coarseNowMs = (ms: number) => Math.floor(ms / 0.1) * 0.1;

export function createGlue(env: GlueEnv): Glue {
  /**
   * `frame`, `inline`, `worker`: the host handles a message in the call (validates ops; `frame`, `inline`: applies
   * them, lays the page out). That is not the widget's code running: like a layout query, it moves the task's
   * deadline and counts toward the quota only. (On a page's thread it once took a WebKit widget past its 500 ms while
   * twenty others were being laid out.)
   */
  const post = (msg: WorkerToHost) => {
    if (transport === 'sab') return env.post(msg);
    const t0 = performance.now();
    env.post(msg);
    const dt = performance.now() - t0;
    deadline += dt;
    taskHostMs += dt;
  };
  let transport: SyncTransport = 'sab';

  let rt: QuickJSRuntime;
  let vm: QuickJSContext;
  let qjs: Entries;
  /** `worker`: the instance's host calls can wait. */
  let suspender: Suspender | null = null;
  /** How much slower than the plain build this instance runs (ASYNCIFY_SLOWDOWN for the asyncify one). */
  let slowdown = 1;
  let config: SandboxConfig;

  /** The memory limit the wasm Memory was sized for in `warm`; `start` cannot exceed it. */
  let warmedMemoryLimitBytes = 0;
  let header: Int32Array;
  let payload: Uint8Array;
  let dead = false;
  let interrupted = false;
  let deadline = 0;
  /** Host time this task's layout queries took, and how many it asked (docs/decisions.md, Runtime limits). */
  let taskQueryMs = 0;
  let taskQueries = 0;
  /** Modelled main-thread cost of the ops this task sent (cpu-budget.ts `opsCostMs`). */
  let taskOpsCostMs = 0;
  /** Wall time this task waited for its layout queries (`worker`: the page's answer, other widgets' tasks meanwhile). */
  let taskWaitMs = 0;
  /** `frame`, `inline`, `worker`: time this task spent in the host handling what it posted. */
  let taskHostMs = 0;
  /** tweb: `worker`: wall time other widgets had the engine's thread while this task waited to go on (`takeThread`). */
  let taskOthersMs = 0;
  const turn: ThreadTurn = { lostAt: 0 };
  const othersTurn = (ms: number) => {
    taskOthersMs += ms;
    deadline += ms;
  };
  let taskStartedAt = 0;
  let queryLimitHit: 'count' | 'time' | null = null;
  /** `worker`: when the waiting query was asked. */
  let askedAt = 0;
  /** Slice given to the running task (for the kill message); the boot task gets cpuLimitMs. */
  let currentSliceMs = 0;
  let currentKind = 'boot';
  let budget: CpuBudget;
  /** The main-thread window: what the widget's tasks cost the host's main thread (`newMainBudget`). */
  let mainBudget: CpuBudget;
  /** JS time of the current task that is ours, not the widget's (evaluating the sandbox bundle). */
  let excludeMs = 0;
  let lastThrottleDiag = -Infinity;
  const throttledSinceDiag: Record<string, number> = {};
  let lastBinary: Uint8Array | null = null;
  let twDispatch: QuickJSHandle;
  /** A task is running (`worker`: or waiting for a host call's answer); what comes meanwhile waits in `afterTask`. */
  let busy = false;
  const queue: HostToWorker[] = [];
  /** What came during a task (inputs the renderer in this thread reported, timers, `worker`: messages), in order. */
  const afterTask: (() => void)[] = [];

  /** Runs `fn` now, or after the running task. */
  function exclusive(fn: () => void) {
    if (busy) afterTask.push(fn);
    else fn();
  }

  /** Runs a task's steps: at once while no host call waits (every transport but `worker`), else across the waits. */
  function drive(steps: Steps, done: () => void) {
    const next = (value?: unknown, error?: unknown) => {
      // tweb: `worker`: the task goes on after a call into the VM; other widgets' tasks may have run before it
      othersTurn(takeThread(turn));
      let r: IteratorResult<Promise<unknown>, void>;
      try {
        r = error !== undefined ? steps.throw(error) : steps.next(value);
      } catch (e) {
        kill('sandbox glue error: ' + (e as Error).message);
        return done();
      }
      if (r.done) return done();
      r.value.then((v) => next(v), (e) => next(undefined, e ?? new Error('rejected')));
    };
    // what had the thread before the task is not the task's (tweb)
    takeThread(turn);
    next();
  }

  // ───────────────────────── visibility and the deferred-task queue ─────────────────────────
  //
  // Hidden widget (host said `visibility {visible: false}`): no frames are
  // requested from the renderer (one is requested on return if the shim asked),
  // timers fire at most once per second, batched into one wake-up, and the shim
  // gets `visibilitychange`. Deferred tasks keep their order; one `fire` per
  // timer id, one frame at most.

  let visible = true;
  let frameWanted = false;
  const deferred: Deferred[] = [];
  let wakeTimer: ReturnType<typeof setTimeout> | null = null;
  let wakeAt = Infinity;
  /** Next 1 Hz boundary at which hidden timers fire (0 = none scheduled). */
  let hiddenTickAt = 0;

  function defer(kind: string, arg: unknown) {
    if (kind === 'frame') {
      const f = deferred.find((d) => d.kind === 'frame');
      if (f) { f.arg = arg; return; }
    } else if (kind === 'timer' && deferred.some((d) => d.kind === 'timer' && d.arg === arg)) {
      return; // intervals do not accumulate missed ticks
    }
    deferred.push({ kind, arg });
  }

  function scheduleWake(at: number) {
    if (wakeTimer && at >= wakeAt) return;
    if (wakeTimer) clearTimeout(wakeTimer);
    wakeAt = at;
    wakeTimer = setTimeout(wake, Math.max(0, at - performance.now()));
  }

  function wake() {
    wakeTimer = null;
    wakeAt = Infinity;
    hiddenTickAt = 0;
    runDeferred(deferred.splice(0));
  }

  /** Runs deferred tasks in order; stops (and re-queues the rest) if one is deferred again. */
  function runDeferred(items: Deferred[]) {
    for (let i = 0; i < items.length; i++) {
      if (dead) return;
      // `worker`: the one before is waiting for an answer
      if (busy) { afterTask.push(() => runDeferred(items.slice(i))); return; }
      if (!dispatch(items[i].kind, items[i].arg)) {
        deferred.unshift(...items.slice(i));
        return;
      }
    }
  }

  function onTimerFired(id: number) {
    timers.delete(id);
    exclusive(() => {
      if (!visible) {
        defer('timer', id);
        if (!hiddenTickAt) hiddenTickAt = performance.now() + 1000;
        scheduleWake(hiddenTickAt);
        return;
      }
      dispatch('timer', id);
    });
  }

  function setVisible(v: boolean) {
    if (visible === v) return;
    visible = v;
    dispatch('visibility', { visible: v });
    if (visible) {
      if (frameWanted) { frameWanted = false; post({ type: 'raf' }); }
      if (deferred.length) wake();
    }
  }

  const stats: Stats = { jsMs: 0, tasks: 0, memoryBytes: 0, ops: 0, queries: 0, queryMs: 0, queryCacheHits: 0, missedMutations: 0, throttledTasks: 0, cpuWindowMs: 0 };
  let lastStatsPost = 0;
  let lastMemCheck = 0;

  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  let timerLimitReported = false;

  // ───────────────────────── sync query bridge ─────────────────────────

  /**
   * The time a query blocked is not widget CPU time; what it cost the host counts toward the task's query budget
   * (`hostMs`: the renderer's own time when the answer comes from another thread, else all of it).
   */
  function queryDone(t0: number, hostMs?: number) {
    const dt = performance.now() - t0;
    deadline += dt; // time spent blocked is not widget CPU time
    stats.queries++;
    stats.queryMs += dt;
    taskWaitMs += dt;
    taskQueryMs += hostMs ?? dt;
    taskQueries++;
    queryLimitHit = queryLimitOf(taskQueries, taskQueryMs);
    if (queryLimitHit) {
      // The host answered every query, but this task has asked too many or held the renderer too long: interrupt it at the next poll.
      deadline = -Infinity;
    }
  }

  /** `frame`, `inline`: the renderer is in this thread; it validates the query and answers it right away. */
  function frameQuery(queryJson: string): string {
    if (queryLimitHit) return '{"error":"query budget exceeded"}';
    const t0 = performance.now();
    const r = env.query!(queryJson);
    queryDone(t0);
    lastBinary = r.binary ? new Uint8Array(r.binary) : null;
    return r.json;
  }

  /** `sab`: blocks this thread until the host has written the renderer's answer into the SAB. */
  function syncQuery(queryJson: string): string {
    let query: unknown;
    try { query = JSON.parse(queryJson); } catch { return '{"error":"bad query"}'; }
    if (queryLimitHit) return '{"error":"query budget exceeded"}';
    const t0 = performance.now();
    Atomics.store(header, SAB_STATE, 1);
    post({ type: 'query', query });
    const res = Atomics.wait(header, SAB_STATE, 1, QUERY_TIMEOUT_MS);
    queryDone(t0);
    if (res === 'timed-out') {
      Atomics.store(header, SAB_STATE, 0);
      return '{"error":"timeout"}';
    }
    const jsonLen = Atomics.load(header, SAB_JSON_LEN);
    const binLen = Atomics.load(header, SAB_BIN_LEN);
    // TextDecoder refuses shared memory: copy out first.
    const json = decoder.decode(payload.slice(0, jsonLen));
    lastBinary = binLen > 0 ? payload.slice(jsonLen, jsonLen + binLen) : null;
    Atomics.store(header, SAB_STATE, 0);
    return json;
  }

  /**
   * `worker`: the page's renderer answers. The widget's code waits for it without knowing: this host call returns
   * nothing now and is made again with the answer (suspend.ts). A page that does not answer in QUERY_TIMEOUT_MS gets
   * the widget the same error as a SAB that times out.
   */
  function waitQuery(queryJson: string): string | undefined {
    const s = suspender;
    if (!s) return '{"error":"dead"}';
    const settled = s.takeAnswer();
    if (settled) {
      const answer = settled.value as QueryAnswer | undefined;
      queryDone(askedAt, answer?.hostMs ?? 0);
      // tweb: the wait ends here; what other widgets run before the code goes on is counted then (`onResume`)
      takeThread(turn);
      lastBinary = answer?.binary ? new Uint8Array(answer.binary) : null;
      return answer ? answer.json : '{"error":"timeout"}';
    }
    let query: unknown;
    try { query = JSON.parse(queryJson); } catch { return '{"error":"bad query"}'; }
    if (queryLimitHit) return '{"error":"query budget exceeded"}';
    // tweb: outside a call that can wait (widget code run by `vm.dump()`, a `toJSON` of what it threw): no layout, and
    // nothing asked of the page — asked, the page answered queries the task never counted
    if (!s.canWait()) return '{"error":"no layout here"}';
    askedAt = performance.now();
    let clear = () => {};
    const answer = Promise.race([
      env.ask!(query),
      new Promise<undefined>((resolve) => {
        const timer = setTimeout(() => resolve(undefined), QUERY_TIMEOUT_MS);
        clear = () => clearTimeout(timer);
      }),
    ]).finally(() => clear());
    s.wait(answer);
    return undefined;
  }

  // ───────────────────────── the single host capability ─────────────────────────


  function hostCall(kind: string, arg: string): string | number | undefined {
    switch (kind) {
      case 'ops': {
        let ops: unknown;
        try { ops = JSON.parse(arg); } catch { return; }
        if (Array.isArray(ops)) {
          stats.ops += ops.length;
          let commands = 0;
          for (const op of ops) if (op && op.op === 'canvas' && Array.isArray(op.cmds)) commands += op.cmds.length;
          taskOpsCostMs += opsCostMs(ops.length, commands);
        }
        post({ type: 'ops', ops });
        return;
      }
      case 'query':
        return transport === 'sab' ? syncQuery(arg) : transport === 'worker' ? waitQuery(arg) : frameQuery(arg);
      case 'now':
        return coarseNowMs(performance.now());
      case 'timer': {
        const [id, delay] = JSON.parse(arg) as [number, number];
        if (typeof id !== 'number') return;
        // tweb: an id that has a timer already replaces it — the old one, kept running, was past maxTimers and outlived destroy()
        const replaced = timers.get(id);
        if (replaced !== undefined) clearTimeout(replaced);
        else if (timers.size >= config.maxTimers) {
          // Backstop: the shim should have thrown RangeError before asking. Reaching this means a shim bug (or a tampered shim).
          if (!timerLimitReported) { timerLimitReported = true; post({ type: 'diag', kind: 'timer-limit-enforced', detail: `glue refused a timer beyond maxTimers=${config.maxTimers}; the shim did not stop it` }); }
          return;
        }
        let ms = Math.min(Math.max(Number(delay) || 0, 0), MAX_TIMER_DELAY_MS);
        // Hidden: 1 Hz, like a background tab. The timers keep the order of their own delays: all at 1 s, the
        // event loop's order by deadline would run the ones set first first (setTimeout 20, 10, 0 → 20, 10, 0).
        if (!visible) ms = Math.max(ms, 1000 + ms / 10);
        timers.set(id, setTimeout(() => onTimerFired(id), ms));
        return;
      }
      case 'clearTimer': {
        const id = Number(arg);
        const t = timers.get(id);
        if (t !== undefined) { clearTimeout(t); timers.delete(id); }
        return;
      }
      case 'raf':
        if (!visible) { frameWanted = true; return; } // one frame is requested when the widget becomes visible again
        post({ type: 'raf' });
        return;
      case 'log': {
        const i = arg.indexOf(':');
        post({ type: 'log', level: arg.slice(0, i), text: arg.slice(i + 1, i + 1 + MAX_LOG) });
        return;
      }
      case 'diag': {
        const i = arg.indexOf(':');
        post({ type: 'diag', kind: arg.slice(0, i).slice(0, 64), detail: arg.slice(i + 1, i + 1 + MAX_LOG) });
        return;
      }
      case 'listen':
        // tweb: with when the task began, which the renderer scopes the events it kept by
        try { post({ type: 'listen', types: JSON.parse(arg), since: performance.timeOrigin + taskStartedAt }); } catch {}
        return;
      case 'pd':
        try { post({ type: 'pd', keys: JSON.parse(arg) }); } catch {}
        return;
      case 'anim':
        if (arg.length > MAX_ANIM_BATCH_BYTES || !config.features?.includes('webAnimations')) return;
        try { post({ type: 'anim', anims: JSON.parse(arg), now: performance.now() }); } catch {}
        return;
      case 'bridge':
        try {
          const [method, args] = JSON.parse(arg);
          post(activeGesture ? { type: 'bridge', method: String(method).slice(0, 64), args, gesture: activeGesture } : { type: 'bridge', method: String(method).slice(0, 64), args });
        } catch {}
        return;
      case 'storage':
        // The full areas a task changed; WidgetHost checks them against the quota (sdk-policy.ts). Anything longer cannot be within it.
        if (arg.length > MAX_STORAGE_COMMIT_CHARS) { post({ type: 'diag', kind: 'storage-rejected', detail: `commit of ${arg.length} characters` }); return; }
        try { post({ type: 'storage', commit: JSON.parse(arg) }); } catch {}
        return;
      case 'intl':
        try { return formatIntl(JSON.parse(arg)); } catch { return ''; }
      case 'parse':
        return env.parseHTML?.(arg) ?? '';
      case 'random': {
        const n = Math.min(Math.max(Number(arg) | 0, 0), 65536);
        return JSON.stringify(Array.from(crypto.getRandomValues(new Uint8Array(n))));
      }
      case 'stat': {
        // Counters maintained by the shim (advisory, shown in diagnostics only).
        try {
          const s = JSON.parse(arg);
          stats.queryCacheHits = Number(s.cacheHits) || 0;
          stats.missedMutations = Number(s.missed) || 0;
        } catch {}
        return;
      }
    }
  }

  // ───────────────────────── running code in the VM ─────────────────────────

  /** No more tasks: timers and deferred work go. */
  function stop() {
    dead = true;
    // `worker`: a task waiting for an answer stops at its next interrupt poll once it has it
    deadline = -Infinity;
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    deferred.length = 0;
    afterTask.length = 0;
    if (wakeTimer) { clearTimeout(wakeTimer); wakeTimer = null; }
  }

  function kill(reason: string) {
    if (dead) return;
    stop();
    post({ type: 'dead', reason });
  }

  function destroy() {
    if (!dead) stop();
    // `inline`, `worker`: the VM is a wasm instance of its own; nothing else holds it, so dropping it frees the memory
    rt = vm = twDispatch = qjs = suspender = null!;
    if (threadHolder === turn) threadHolder = null;
    // tweb: `frame`, `sab`: the warm-up's promise holds the VM it made (WarmedVM) as long as the glue lives
    warming = null;
    queue.length = afterTask.length = 0;
  }

  function describeError(err: QuickJSHandle): string {
    let text: string;
    try {
      const e = vm.dump(err);
      text = e && typeof e === 'object' ? `${e.name ?? 'Error'}: ${e.message ?? ''}${e.stack ? '\n' + e.stack : ''}` : String(e);
    } catch {
      text = 'unknown error';
    }
    err.dispose();
    return text;
  }

  function handleError(err: QuickJSHandle, where: string) {
    const text = describeError(err);
    if (interrupted && queryLimitHit) {
      return kill(`${queryLimitReason(queryLimitHit, currentKind)} (${where})`);
    }
    if (interrupted) {
      return kill(`CPU limit exceeded: more than ${currentSliceMs.toFixed(0)} ms of continuous execution (${where})`);
    }
    if (/out of memory/i.test(text)) return kill(`Memory limit exceeded (${config.memoryLimitBytes >> 20} MB)`);
    post({ type: 'log', level: 'error', text: `Uncaught ${text}`.slice(0, MAX_LOG) });
  }

  function* drainJobs(): Steps {
    for (let i = 0; i < 100 && !dead; i++) {
      const r = yield* qjs.jobs();
      if (dead) return;
      if (r.error) {
        handleError(r.error, 'promise job');
        continue;
      }
      if (r.value === 0) break;
    }
  }

  function* callTw(kind: string, arg: string): Steps<string | null> {
    const k = vm.newString(kind);
    const a = vm.newString(arg);
    let r: QuickJSContextResult;
    try {
      r = yield* qjs.call(twDispatch, vm.undefined, [k, a]);
    } finally {
      // `worker`: a widget destroyed while its task waited has no VM left
      if (vm) { k.dispose(); a.dispose(); }
    }
    if (!vm) return null;
    if (r.error) {
      handleError(r.error, kind);
      return null;
    }
    const out = vm.typeof(r.value) === 'string' ? vm.getString(r.value) : null;
    r.value.dispose();
    return out;
  }

  /** End of a task: microtasks, flush mutations, observers; repeat until quiescent. */
  function* settle(): Steps {
    for (let i = 0; i < 20 && !dead; i++) {
      yield* drainJobs();
      if (dead) return;
      const more = yield* callTw('endTick', '');
      if (dead) return;
      if (more !== '1' && !rt.hasPendingJob()) break;
    }
  }

  function* evalScript(code: string, filename: string, type: 'global' | 'module'): Steps<boolean> {
    const r = yield* qjs.eval(code, filename, type);
    if (!vm) return false;
    if (r.error) {
      handleError(r.error, filename);
      return false;
    }
    r.value.dispose();
    return true;
  }

  /** Run scripts queued by the shim (initial inline scripts, later dynamically inserted ones). */
  function* pumpScripts(): Steps {
    for (let i = 0; i < 1000 && !dead; i++) {
      const next = yield* callTw('nextScript', '');
      if (!next || dead) break;
      const s = JSON.parse(next) as { id: number; type: 'global' | 'module'; code?: string; src?: string };
      let ok = true;
      resetDeadline();
      if (s.src !== undefined) {
        // Nothing is fetched and nothing is bundled (profile 1: no libraries): an external script never runs.
        ok = false;
        post({ type: 'diag', kind: 'script-skipped', detail: `external script not available: ${String(s.src).slice(0, 200)}` });
      } else if (s.code !== undefined) {
        yield* evalScript(s.code, `inline-script-${s.id}.js`, s.type);
      }
      if (dead) return;
      yield* settle();
      if (dead) return;
      yield* callTw('scriptDone', JSON.stringify([s.id, ok]));
      yield* settle();
    }
  }

  function resetDeadline() {
    interrupted = false;
    const now = performance.now();
    if (transport !== 'inline' && transport !== 'worker') {
      deadline = now + currentSliceMs;
      return;
    }
    // `inline`, `worker`: one slice for the whole task, however many scripts it runs (each used to get a fresh one):
    // it is a thread shared with the page or with every other widget they hold. What the host took and the waits for
    // layout queries are not the widget's.
    const spent = now - taskStartedAt - taskWaitMs - taskHostMs - taskOthersMs - excludeMs;
    deadline = now + Math.max(0, currentSliceMs - spent);
  }

  /**
   * One task of `kind` with `sliceMs` of continuous execution; its JS time is recorded against the quota. `gesture`:
   * the host's number for the trusted press an event task runs for (bridge calls carry it). `then` runs once it is
   * done (`worker`: maybe later), before what came meanwhile.
   */
  function task(kind: string, sliceMs: number, body: () => Steps<unknown>, then?: () => void, gesture = 0) {
    if (dead) return then?.();
    busy = true;
    activeGesture = gesture;
    currentKind = kind;
    currentSliceMs = sliceMs * slowdown;
    excludeMs = 0;
    taskQueryMs = 0;
    taskQueries = 0;
    taskOpsCostMs = 0;
    taskWaitMs = 0;
    taskHostMs = 0;
    taskOthersMs = 0;
    queryLimitHit = null;
    const t0 = taskStartedAt = performance.now();
    const q0 = stats.queryMs;
    resetDeadline();
    drive((function* () {
      try {
        yield* body();
        if (!dead) yield* settle();
        if (!dead) yield* pumpScripts();
        // Past the limit but done before the interrupt landed (a loop that ended on the error answers): stopped all the same.
        if (!dead && queryLimitHit) kill(queryLimitReason(queryLimitHit, kind));
      } catch (e) {
        kill('sandbox glue error: ' + (e as Error).message);
      }
    })(), () => {
      busy = false;
      activeGesture = 0;
      if (vm) finishTask(kind, t0, q0);
      then?.();
      // inputs that arrived during the task run now, in order, before anything that comes later
      while (afterTask.length && !busy && !dead) afterTask.shift()!();
    });
  }

  function finishTask(kind: string, t0: number, q0: number) {
    stats.tasks++;
    const now = performance.now();
    const cpuMs = now - t0 - (stats.queryMs - q0) - excludeMs - taskHostMs - taskOthersMs;
    stats.jsMs += cpuMs;
    // `inline`, `worker`: the first tasks run once, when the client puts the widget on screen; the quota is for what it
    // does after (charged with them, a heavy start's debt held the widget's first frames and timers)
    if (!((transport === 'inline' || transport === 'worker') && kind === 'boot')) {
      // the engine's thread: the widget's JS and the host's handling of what it posted (validating; `frame`, `inline`:
      // applying too, on the same thread)
      budget.record(kind, cpuMs / slowdown + taskHostMs, now);
      // the page's main thread: its answers to the layout queries and the modelled cost of applying the ops
      mainBudget.record(kind, taskQueryMs + taskOpsCostMs, now);
    }
    stats.cpuWindowMs = budget.used(now);
    if (now - lastMemCheck > 1000 && !dead) {
      lastMemCheck = now;
      try {
        const h = rt.computeMemoryUsage();
        stats.memoryBytes = (vm.dump(h) as any).memory_used_size ?? 0;
        h.dispose();
      } catch {}
    }
    if (now - lastStatsPost > 200) {
      lastStatsPost = now;
      post({ type: 'stats', stats: { ...stats } });
    }
  }

  /**
   * Runs one task for an input (event, timer, frame, …) if the CPU quota allows,
   * otherwise defers it (returns false). Events and visibility always run.
   * Called only between tasks (`exclusive`).
   */
  function dispatch(kind: string, arg: unknown, gesture = 0): boolean {
    if (dead) return true;
    const now = performance.now();
    // A deferrable task waits for both windows (the JS quota and the main thread's); the slice is the JS quota's.
    const js = budget.decide(kind, now);
    const main = mainBudget.decide(kind, now);
    if (!js.run || !main.run) {
      if (budget.shouldKill(now)) {
        kill(`CPU quota: throttled for ${(budget.throttledFor(now) / 1000).toFixed(1)} s (${config.cpuQuotaMs} ms per ${config.cpuQuotaWindowMs} ms, cpuKillAfterMs=${config.cpuKillAfterMs})`);
        return true;
      }
      defer(kind, arg);
      stats.throttledTasks++;
      throttledSinceDiag[kind] = (throttledSinceDiag[kind] ?? 0) + 1;
      if (now - lastThrottleDiag >= 1000) {
        lastThrottleDiag = now;
        const parts = Object.entries(throttledSinceDiag).map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`);
        for (const k of Object.keys(throttledSinceDiag)) delete throttledSinceDiag[k];
        const window = js.run
          ? `${mainBudget.used(now).toFixed(0)} ms of the ${config.mainThreadQuotaMs ?? LIMIT_DEFAULTS.mainThreadQuotaMs} ms per ${config.cpuQuotaWindowMs} ms main-thread budget used by layout queries and ops`
          : `${budget.used(now).toFixed(0)} ms of the ${config.cpuQuotaMs} ms per ${config.cpuQuotaWindowMs} ms budget used`;
        post({ type: 'diag', kind: 'cpu-throttled', detail: `deferred ${parts.join(', ')}: ${window}` });
      }
      scheduleWake(Math.max(js.run ? 0 : js.retryAt, main.run ? 0 : main.retryAt));
      return false;
    }
    task(kind, js.sliceMs, () => callTw(kind, JSON.stringify(arg)), undefined, gesture);
    return true;
  }

  // ───────────────────────── boot ─────────────────────────

  /**
   * Phase 1 (pool `warm`, or the first half of `init`): the QuickJS runtime, the
   * host functions and the sandbox bundle. `config` is provisional here (the
   * pool's limits); the widget and its real config come with `start`.
   */
  const interruptHandler = () => {
    if (performance.now() > deadline) {
      interrupted = true;
      return true;
    }
    return false;
  };
  const hostFunction = (kindH: QuickJSHandle, argH?: QuickJSHandle) => {
    const r = hostCall(vm.getString(kindH), argH ? vm.getString(argH) : '');
    if (typeof r === 'string') return vm.newString(r);
    if (typeof r === 'number') return vm.newNumber(r);
    return vm.undefined;
  };
  const hostBinaryFunction = () => {
    if (!lastBinary) return vm.null;
    const copy = lastBinary.buffer.slice(lastBinary.byteOffset, lastBinary.byteOffset + lastBinary.byteLength) as ArrayBuffer;
    lastBinary = null;
    return vm.newArrayBuffer(copy);
  };

  async function warm(msg: Extract<HostToWorker, { type: 'warm' | 'init' }>, snapshot?: { wasmModule: WebAssembly.Module; seedScript: string }): Promise<WarmedVM> {
    config = withWebFeatures(msg.config);
    visible = config.visible !== false;
    budget = new CpuBudget(config);
    mainBudget = newMainBudget(config);
    transport = snapshot ? 'inline' : (msg.type === 'init' && msg.transport) || 'sab';
    if (transport === 'sab') {
      header = new Int32Array(msg.sab!, 0, SAB_HEADER / 4);
      payload = new Uint8Array(msg.sab!, SAB_HEADER);
    }

    // The memory limit is enforced by the wasm linear memory's hard maximum, not
    // by `rt.setMemoryLimit` alone. quickjs-ng tracks its heap as the sum of
    // malloc_usable_size() over live blocks, and the emscripten build has no
    // usable-size implementation (cutils.h knows Apple, Windows, glibc, wasi: not
    // EMSCRIPTEN), so every allocation counts as 0 bytes. `setMemoryLimit` then
    // only refuses a single allocation larger than the limit; a widget keeping
    // 1 MB typed arrays grew the runtime to >1 GB (corpus/attacks/mem-*.html).
    // One runtime owns this Memory; when dlmalloc cannot grow it any further,
    // quickjs throws the same catchable `InternalError: out of memory` the native
    // builds throw at JS_SetMemoryLimit, and the footprint of this worker is
    // bounded by INITIAL + limit. Native glue (Swift, Kotlin, C++) needs nothing
    // extra: Apple malloc_size and bionic malloc_usable_size count correctly.
    // A pooled worker is warmed with the pool's limits: the Memory's maximum is fixed
    // here, so `start` can only lower the limit, never raise it past the warmed cap.
    warmedMemoryLimitBytes = config.memoryLimitBytes;
    const wasmMemory = new WebAssembly.Memory({ initial: WASM_INITIAL_PAGES, maximum: WASM_INITIAL_PAGES + Math.ceil(config.memoryLimitBytes / WASM_PAGE_BYTES) });
    // `frame`: the wasm comes as bytes with init (the frame can fetch nothing, and a compiled module cannot cross into
    // it); this emscripten build ignores `wasmBinary`, so it is compiled here and instantiated from the module.
    // `inline`: the page compiled the module once for every copy of the snapshot.
    const wasmBinary = msg.type === 'init' ? msg.wasmBinary : undefined;
    const source = snapshot ? { wasmModule: () => snapshot.wasmModule } : wasmBinary ? { wasmModule: () => WebAssembly.compile(wasmBinary) } : { wasmLocation: wasmUrl };
    const QuickJS = await newQuickJSWASMModuleFromVariant(newVariant(baseVariant, { ...source, wasmMemory }));
    // tweb: stopped while the module compiled: no runtime goes back into a glue that dropped its VM
    if (dead) throw new Error('stopped');
    rt = QuickJS.newRuntime();
    rt.setMemoryLimit(config.memoryLimitBytes); // still refuses one oversized allocation before dlmalloc even tries
    rt.setMaxStackSize(1024 * 1024);
    // No module loader is installed: static and dynamic import() of anything fails.
    rt.setInterruptHandler(interruptHandler);
    vm = rt.newContext();
    qjs = syncEntries(rt, vm);

    // inline-engine.ts relies on this order: a copy of the snapshot registers its host functions in it again
    const hostFn = vm.newFunction('__host', hostFunction);
    vm.setProp(vm.global, '__host', hostFn);
    hostFn.dispose();
    const binFn = vm.newFunction('__hostBinary', hostBinaryFunction);
    vm.setProp(vm.global, '__hostBinary', binFn);
    binFn.dispose();

    let bootMs = 0;
    // nothing here waits (the entries are synchronous): the task is over when `task` returns
    task('boot', config.cpuLimitMs, function* () {
      const t0 = performance.now();
      // Generous one-off budget for evaluating our own bundle; its time is ours, not the widget's.
      currentSliceMs = Math.max(config.cpuLimitMs, BUNDLE_BOOT_BUDGET_MS);
      deadline = performance.now() + currentSliceMs;
      const loaded = yield* evalScript(msg.sandboxBundle, 'sandbox-bundle.js', 'global');
      excludeMs = performance.now() - t0;
      if (dead) return;
      // Fail closed: a runtime whose shim did not load completely (its network
      // stubs and DOM capture may be missing) never runs widget code.
      if (!loaded) return kill('sandbox bundle failed to load');
      const fn = vm.getProp(vm.global, '__twDispatch');
      if (vm.typeof(fn) !== 'function') {
        fn.dispose();
        return kill('sandbox bundle failed to initialise');
      }
      twDispatch = fn;
      // A snapshot's copies would all share the context's random state: its seed script takes `__host` before it goes.
      if (snapshot && !(yield* evalScript(snapshot.seedScript, 'seed.js', 'global'))) return kill('sandbox bundle failed to load');
      // The bundle holds private references to the host functions; widget code
      // must not reach them, nor the shim's dispatcher, through the global object.
      if (!(yield* evalScript(HIDE_HOST_GLOBALS, 'hide-host.js', 'global'))) return kill('sandbox bundle failed to load');
      bootMs = performance.now() - t0;
      post({ type: 'diag', kind: 'boot', detail: `sandbox bundle eval ${bootMs.toFixed(0)} ms; wasm memory ${(wasmMemory.buffer.byteLength / 1048576).toFixed(1)} MB, cap ${((WASM_INITIAL_PAGES * WASM_PAGE_BYTES + config.memoryLimitBytes) / 1048576).toFixed(0)} MB${QuickJS.getWasmMemory() === wasmMemory ? '' : ' (module ignored the provided Memory)'}` });
    });
    if (!dead) post({ type: 'warmed', bootMs });
    return { QuickJS, rt, vm, dispatch: twDispatch, memory: wasmMemory };
  }

  async function warmForSnapshot(msg: Extract<HostToWorker, { type: 'warm' }>, wasmModule: WebAssembly.Module, seedScript: string) {
    const warmed = await warm(msg, { wasmModule, seedScript });
    if (dead) throw new Error('the sandbox bundle did not load');
    return warmed;
  }

  function adopt(restored: AdoptedVM, msg: Extract<HostToWorker, { type: 'start' }>) {
    // tweb: a glue stopped or destroyed takes no VM: it would hold it as long as the glue lives
    if (dead) return;
    ({ rt, vm, dispatch: twDispatch } = restored);
    suspender = restored.suspender ?? null;
    slowdown = suspender?.kind === 'asyncify' ? ASYNCIFY_SLOWDOWN : 1;
    transport = suspender ? 'worker' : 'inline';
    qjs = suspender ? waitingEntries(rt, vm, suspender) : syncEntries(rt, vm);
    // tweb: the VM's code goes on after a wait, in a job of its own (`takeThread`)
    if (suspender) suspender.onResume = () => othersTurn(takeThread(turn));
    warmedMemoryLimitBytes = restored.memoryLimitBytes;
    restored.bindHost(hostFunction, hostBinaryFunction);
    rt.setInterruptHandler(interruptHandler);
    start(msg);
  }

  /** Phase 2 (pool `start`, or the second half of `init`): the widget's HTML and its real config into the warmed VM. */
  function start(msg: Extract<HostToWorker, { type: 'start' | 'init' }>) {
    if (dead) return;
    config = withWebFeatures({ ...msg.config, memoryLimitBytes: Math.min(msg.config.memoryLimitBytes, warmedMemoryLimitBytes) });
    visible = config.visible !== false;
    budget = new CpuBudget(config);
    mainBudget = newMainBudget(config);
    rt.setMemoryLimit(config.memoryLimitBytes);
    const bootSliceMs = transport === 'inline' || transport === 'worker' ? config.cpuLimitMs * SHARED_BOOT_SLICE_FACTOR : config.cpuLimitMs;
    task('boot', bootSliceMs, () => callTw('boot', JSON.stringify({ html: msg.html, config })), () => {
      // the boot task has run all scripts by now
      task('boot', bootSliceMs, () => callTw('loaded', ''), () => {
        if (!dead) post({ type: 'loaded' });
        post({ type: 'stats', stats: { ...stats } });
        ready = true;
        for (const m of queue.splice(0)) exclusive(() => handle(m));
      });
    });
  }

  let ready = false;
  let activeGesture = 0;

  function handle(msg: HostToWorker) {
    if (dead) return;
    switch (msg.type) {
      case 'event':
        // The host's gesture number (trusted input only) rides along with bridge
        // calls made in this event's task; the host decides whether to honour them.
        dispatch('event', msg.ev, typeof msg.gesture === 'number' ? msg.gesture : 0);
        return;
      case 'frame':
        // A frame that arrives after the widget was hidden is dropped; the shim's callbacks wait for the next visible frame.
        if (!visible) { frameWanted = true; return; }
        dispatch('frame', coarseNowMs(msg.time));
        return;
      case 'viewport': dispatch('viewport', msg.viewport); return;
      case 'resize': dispatch('resize', msg.entries); return;
      case 'theme': dispatch('theme', { theme: msg.theme, themeParams: msg.themeParams }); return;
      case 'safeArea': dispatch('safeArea', msg.inset); return;
      case 'visibility': setVisible(!!msg.visible); return;
      // The bot's data or a request's answer, checked by WidgetHost; deferred under the CPU quota like a theme change, in order.
      case 'bridge': dispatch('bridge', msg.event); return;
    }
  }

  let warming: Promise<unknown> | null = null;
  const fail = (err: unknown) => kill('failed to start sandbox: ' + (err as Error).message);

  function onMessage(msg: HostToWorker) {
    if (msg.type === 'stop') {
      destroy();
      return;
    }
    // tweb: nothing starts in a glue stopped already (`frame`: an `init` that came after its `stop`)
    if (dead && (msg.type === 'init' || msg.type === 'warm' || msg.type === 'start')) return;
    if (msg.type === 'init') {
      warming = warm(msg);
      warming.then(() => start(msg)).catch(fail);
    } else if (msg.type === 'warm') {
      warming = warm(msg);
      warming.catch(fail);
    } else if (msg.type === 'start') {
      // A `start` may arrive while the pool's worker is still warming: it waits for the bundle.
      (warming ?? Promise.reject(new Error('start before warm'))).then(() => start(msg)).catch(fail);
    } else if (!ready) {
      queue.push(msg);
    } else {
      // `frame`, `inline`: the renderer in this thread reported an input while a task was applying ops; `worker`: a
      // task is waiting for an answer. A `sab` worker never gets a message in the middle of a task.
      exclusive(() => handle(msg));
    }
  }

  return { receive: onMessage, warmForSnapshot, adopt, destroy, kill };
}
