import fs from 'node:fs';
import path from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createGlue} from 'widget-sandbox/host/glue';
import {copyMaximum, instantiate, restoreVM, takeSnapshot} from 'widget-sandbox/host/inline-snapshot';
import {instantiateSuspendable} from 'widget-sandbox/host/suspend';
import {LIMIT_DEFAULTS} from 'widget-sandbox/shared/protocol';
import isCollected from '@/tests/helpers/collectGarbage';

// The `worker` transport runs every widget's VM on the engine worker's one thread (UPSTREAM.md, items 8 and 12): a
// widget's code waits for a layout query's answer, and what other widgets run meanwhile, or before its code goes on, is
// not its time. Here the glue of each widget runs as the engine worker runs it, with a sandbox of its own that, for an
// event, asks one layout question (or none), works for as long as the event says, and then a while more in a promise
// job, which the task runs once the call has ended.
const BUNDLE = `(function(host) {
  globalThis.__twDispatch = function(kind, arg) {
    if(kind === 'event') {
      const {workMs, jobMs, ask} = JSON.parse(arg);
      if(ask) host('query', JSON.stringify({q: 'box', id: 2}));
      const t = Date.now();
      while(Date.now() - t < workMs) {}
      Promise.resolve().then(() => {
        const t = Date.now();
        while(Date.now() - t < jobMs) {}
        host('log', 'log:done');
      });
    }
    return '';
  };
})(__host);`;
const WASM = path.join('src', 'vendor', 'widget-sandbox-quickjs', 'dist');
/** A task's slice on the engine thread: the CPU limit, twice it on the asyncify build (glue.ts ASYNCIFY_SLOWDOWN). */
const sliceOf = (kind: 'jspi' | 'asyncify') => LIMIT_DEFAULTS.cpuLimitMs * (kind === 'asyncify' ? 2 : 1);

/**
 * Widgets on one thread whose event tasks ask at once, answered at once, then work for `[workMs, jobMs]` each (one
 * number: that much and 20 ms in the job): how each ended, 'done' or why it died.
 */
async function runTogether(kind: 'jspi' | 'asyncify', work: (number | [number, number])[], ask = true) {
  const count = work.length;
  const module = await WebAssembly.compile(fs.readFileSync(path.join(WASM, kind === 'jspi' ? 'emscripten-module.wasm' : 'emscripten-module.asyncify.wasm')));
  const snapshot = await takeSnapshot(module, BUNDLE);
  const config = {...LIMIT_DEFAULTS, visible: true, viewport: {innerWidth: 300, innerHeight: 300, dpr: 1}, theme: 'light'};
  const answers: (() => void)[] = [];
  const widgets = await Promise.all(Array.from({length: count}, async() => {
    const {memory, QuickJS, suspender} = await instantiateSuspendable(module, kind, snapshot.pages, copyMaximum(snapshot, config.memoryLimitBytes));
    const posted: {type: string, [key: string]: unknown}[] = [];
    const glue = createGlue({
      post: (msg) => posted.push(msg),
      ask: () => new Promise((resolve) => answers.push(() => resolve({json: '{"x":0,"y":0,"width":0,"height":0}', hostMs: 0})))
    });
    glue.adopt(restoreVM(QuickJS, memory, snapshot, config.memoryLimitBytes, suspender), {type: 'start', html: '', config});
    return {glue, posted};
  }));
  const ended = ({posted}: typeof widgets[number]) => posted.some((msg) => msg.type === 'log' || msg.type === 'dead');
  for(let i = 0; i < 100 && !widgets.every(({posted}) => posted.some((msg) => msg.type === 'loaded')); i++) await new Promise((resolve) => setTimeout(resolve, 20));
  widgets.forEach(({glue}, i) => {
    const [workMs, jobMs] = typeof work[i] === 'number' ? [work[i], 20] : work[i];
    glue.receive({type: 'event', ev: {type: 'click', targetId: 2, workMs, jobMs, ask}});
  });
  expect(answers).toHaveLength(ask ? count : 0);
  for(const answer of answers) answer();
  for(let i = 0; i < 300 && !widgets.every(ended); i++) await new Promise((resolve) => setTimeout(resolve, 20));
  for(const {glue} of widgets) glue.destroy();
  return widgets.map(({posted}) => posted.filter((msg) => msg.type === 'log' || msg.type === 'dead').map((msg) => String(msg.type === 'dead' ? msg.reason : msg.text)));
}

describe('widgets resuming together on one engine thread (host/glue.ts)', () => {
  for(const kind of ['jspi', 'asyncify'] as const) {
    it(`charges each its own time, not the others' (${kind})`, async() => {
      // six at half a slice each: three slices one after another
      expect(await runTogether(kind, new Array(6).fill(sliceOf(kind) / 2))).toEqual(new Array(6).fill(['done']));
    }, 30_000);

    it(`charges each its own time when none of them waits, started in one go (${kind})`, async() => {
      // a call that never suspended gives a promise all the same on JSPI: the task goes on after the others' calls
      expect(await runTogether(kind, new Array(6).fill(sliceOf(kind) / 2), false)).toEqual(new Array(6).fill(['done']));
    }, 30_000);

    it(`still stops one that works past its slice after its answer, alone or among others (${kind})`, async() => {
      // past it only with the job: the time it took before the job is its own, whoever ran after it
      const past: [number, number] = [sliceOf(kind) * .6, sliceOf(kind) * .6], short = sliceOf(kind) / 4;
      expect(await runTogether(kind, [past])).toEqual([[expect.stringMatching(/^CPU limit exceeded/)]]);
      const together = await runTogether(kind, [short, past, short, past]);
      expect(together.map(([ended]) => ended.startsWith('CPU limit exceeded') ? 'stopped' : ended)).toEqual(['done', 'stopped', 'done', 'stopped']);
    }, 30_000);
  }
});

describe('a browser with WebAssembly off', () => {
  it('loads the client\'s widget runtime, which says widgets cannot run there', async() => {
    const g = globalThis as {WebAssembly?: typeof WebAssembly};
    const wasm = g.WebAssembly;
    delete g.WebAssembly;
    try {
      vi.resetModules();
      const {suspendKind} = await import('widget-sandbox/host/suspend-kind');
      expect(suspendKind()).toBe('asyncify');
      // what a widget's block reads before anything of the sandbox loads
      const {isWidgetSandboxSupported} = await import('@lib/widgetSandbox/runtime');
      expect(isWidgetSandboxSupported()).toBe(false);
    } finally {
      g.WebAssembly = wasm;
      vi.resetModules();
    }
  });
});

describe('the page\'s engine workers (host/engine-client.ts)', () => {
  /** A worker that boots when told to: what it was sent, and who listens to it. */
  class StandInWorker {
    static made: StandInWorker[] = [];
    sent: {type: string, shared?: unknown}[] = [];
    terminated = false;
    listeners = new Set<(e: {data: unknown}) => void>();
    onmessage: (e: {data: unknown}) => void = null;
    onerror: () => void = null;
    constructor() {
      StandInWorker.made.push(this);
    }
    postMessage(msg: {type: string}) {
      this.sent.push(msg);
    }
    addEventListener(type: string, listener: (e: {data: unknown}) => void) {
      if(type === 'message') this.listeners.add(listener);
    }
    removeEventListener(type: string, listener: (e: {data: unknown}) => void) {
      if(type === 'message') this.listeners.delete(listener);
    }
    terminate() {
      this.terminated = true;
    }
  }

  /** The module, fresh, with workers that boot when told to. */
  async function engineClient() {
    StandInWorker.made = [];
    vi.resetModules();
    vi.doMock('virtual:sandbox-bundle', () => ({default: ''}));
    vi.stubGlobal('Worker', StandInWorker);
    vi.useFakeTimers();
    return import('widget-sandbox/host/engine-client');
  }

  /** The first engine's four widgets, then a fifth, for which a second engine starts from the first one's snapshot. */
  async function startTwo() {
    const {reserveEngine, setEngineOptions} = await engineClient();
    setEngineOptions({engines: 2});
    for(let i = 0; i < 5; i++) void reserveEngine().catch(() => {});
    expect(StandInWorker.made).toHaveLength(2);
    return StandInWorker.made;
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.doUnmock('virtual:sandbox-bundle');
    vi.resetModules();
  });

  it('posts a widget\'s messages once its engine has booted, and none of a widget closed before that', async() => {
    const {openEngineChannel} = await engineClient();
    const ready = {data: {type: 'ready', kind: 'jspi', bootMs: 1}};
    // a host suspended (parked) while its engine still booted: the engine never hears of its widget
    const parked = openEngineChannel(() => {});
    parked.send({type: 'start', html: '', config: {}});
    parked.close();
    const [engine] = StandInWorker.made;
    engine.onmessage(ready);
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.sent.map(({type}) => type)).toEqual(['boot']);
    // one that stays gets its start, and its stop when it goes
    const shown = openEngineChannel(() => {});
    shown.send({type: 'start', html: '', config: {}});
    shown.close();
    expect(engine.sent.map(({type}) => type)).toEqual(['boot', 'start', 'input']);
  });

  it('keeps the last engine left for the longer wait once its widgets are gone, also when the other went idle with it', async() => {
    const {openEngineChannel, setEngineOptions} = await engineClient();
    setEngineOptions({engines: 2});
    // four widgets on the first engine, a fifth on a second one, which takes the first one's snapshot
    const channels = Array.from({length: 5}, () => openEngineChannel(() => {}));
    const [first, second] = StandInWorker.made;
    first.onmessage({data: {type: 'ready', kind: 'jspi', bootMs: 1}});
    await vi.advanceTimersByTimeAsync(0);
    for(const listener of first.listeners) listener({data: {type: 'shared', kind: 'jspi', module: 'm', snapshot: 's'}});
    await vi.advanceTimersByTimeAsync(0);
    second.onmessage({data: {type: 'ready', kind: 'jspi', bootMs: 1}});
    // every widget goes at once: both engines run nothing
    for(const channel of channels) channel.close();
    await vi.advanceTimersByTimeAsync(30_000);
    expect([first.terminated, second.terminated]).toEqual([true, false]);
    await vi.advanceTimersByTimeAsync(5 * 60_000 - 30_000 - 1);
    expect(second.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(second.terminated).toBe(true);
  });

  it('boots from the snapshot the first one shares once it is ready', async() => {
    const [first, second] = await startTwo();
    first.onmessage({data: {type: 'ready', kind: 'jspi', bootMs: 1}});
    await vi.advanceTimersByTimeAsync(0);
    expect(first.sent.map(({type}) => type)).toEqual(['boot', 'share']);
    for(const listener of first.listeners) listener({data: {type: 'shared', kind: 'jspi', module: 'm', snapshot: 's'}});
    await vi.advanceTimersByTimeAsync(0);
    expect(second.sent).toMatchObject([{type: 'boot', shared: {type: 'shared', module: 'm', snapshot: 's'}}]);
    expect(first.listeners.size).toBe(0);
  });

  it('lets go of the snapshot it handed over, while the first engine runs on', async() => {
    const [first, second] = await startTwo();
    first.onmessage({data: {type: 'ready', kind: 'jspi', bootMs: 1}});
    await vi.advanceTimersByTimeAsync(0);
    const snapshot = (() => {
      const shared = {bytes: new Uint8Array(1 << 20)};
      for(const listener of first.listeners) listener({data: {type: 'shared', kind: 'jspi', module: 'm', snapshot: shared}});
      return new WeakRef(shared);
    })();
    await vi.advanceTimersByTimeAsync(0);
    expect(second.sent.map(({type}) => type)).toEqual(['boot']);
    expect(second.sent[0].shared).toBeTruthy();
    // the worker has its copy: the page keeps none (the stand-in's record of what it was sent aside)
    second.sent.length = 0;
    vi.useRealTimers();
    expect(await isCollected(snapshot)).toBe(true);
    expect(first.terminated).toBe(false);
  });

  it('asks the first one for nothing once it is ready after the second gave up waiting, and leaves no listener on it', async() => {
    const [first, second] = await startTwo();
    // the first one is slower to boot than the second one waits: that one warms its own
    await vi.advanceTimersByTimeAsync(5_000);
    expect(second.sent).toMatchObject([{type: 'boot', shared: undefined}]);
    first.onmessage({data: {type: 'ready', kind: 'jspi', bootMs: 1}});
    await vi.advanceTimersByTimeAsync(0);
    expect(first.sent.map(({type}) => type)).toEqual(['boot']);
    expect(first.listeners.size).toBe(0);
  });
});

// A glue the host stopped (a suspended host's) takes up nothing that comes for it later: neither the VM `inline`
// copied for it meanwhile nor the `init` that `frame` sends once the engine's binary has loaded.
describe('a glue that was stopped (host/glue.ts)', () => {
  const config = {...LIMIT_DEFAULTS, visible: true, viewport: {innerWidth: 300, innerHeight: 300, dpr: 1}, theme: 'light'};

  it('does not keep a VM handed to it after', async() => {
    const module = await WebAssembly.compile(fs.readFileSync(path.join(WASM, 'emscripten-module.wasm')));
    const snapshot = await takeSnapshot(module, BUNDLE);
    const posted: string[] = [];
    const glue = createGlue({post: (msg) => posted.push(msg.type), query: () => ({json: '{}'})});
    glue.destroy();
    const memory = await (async() => {
      const made = await instantiate(module, snapshot.pages, copyMaximum(snapshot, config.memoryLimitBytes));
      glue.adopt(restoreVM(made.QuickJS, made.memory, snapshot, config.memoryLimitBytes), {type: 'start', html: '', config});
      return new WeakRef(made.memory);
    })();
    expect(await isCollected(memory)).toBe(true);
    // the glue itself lives on (a parked host keeps it)
    expect(posted).toEqual([]);
  });

  it('warms up no engine for an `init` that came after its `stop`', async() => {
    const wasm = fs.readFileSync(path.join(WASM, 'emscripten-module.wasm'));
    const Memory = WebAssembly.Memory;
    let made = 0;
    WebAssembly.Memory = Object.assign(function(descriptor: WebAssembly.MemoryDescriptor) {
      ++made;
      return new Memory(descriptor);
    }, {prototype: Memory.prototype}) as unknown as typeof WebAssembly.Memory;
    const posted: string[] = [];
    try {
      const glue = createGlue({post: (msg) => posted.push(msg.type), query: () => ({json: '{}'})});
      glue.receive({type: 'stop'});
      glue.receive({
        type: 'init', html: '', transport: 'frame', wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength),
        sandboxBundle: 'globalThis.__twDispatch = function() { return ""; };', config
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } finally {
      WebAssembly.Memory = Memory;
    }
    expect({made, posted}).toEqual({made: 0, posted: []});
  });
});
