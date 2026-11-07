// tweb (`worker` transport, see UPSTREAM.md): the page's engine worker. Every widget of the page runs here, each in a
// copy of a warmed QuickJS VM (inline-snapshot.ts) with a glue and a validator of its own: the widget's code and the
// checks of everything it asks for stay off the page's thread, and a widget costs a wasm instance, not a worker. The
// page applies what comes out to a Shadow DOM renderer and answers the layout queries, which the widget's code waits
// for without knowing (suspend.ts). A widget waiting for an answer holds up no other: each has its own instance.
//
// Trusted code only: the widgets' JS runs inside QuickJS (invariant 1), and every op passes the widget's validator
// before it leaves for the renderer (invariant 2), as with the `frame` transport, where the validator shares the
// frame with the engine.

import wasmUrl from '@telegram/widget-sandbox-quickjs/wasm?url';
import asyncifyWasmUrl from '@telegram/widget-sandbox-quickjs/wasm-asyncify?url';
import { createGlue, type Glue, type QueryAnswer } from './glue';
import { parseHtmlTreeParse5 } from './html-tree-parse5';
import { copyMaximum, restoreVM, takeSnapshot, type Snapshot } from './inline-snapshot';
import { finiteNumber } from './message-guards';
import { instantiateSuspendable, suspendKind, type SuspendKind } from './suspend';
import { Validator } from './validator';
import { resolvePolicy, type EngineToPage, type HostToRenderer, type PageToEngine, type WorkerToHost } from '../shared/protocol';

interface Widget {
  glue: Glue;
  validator: Validator;
  asks: Map<number, (answer: QueryAnswer) => void>;
  qid: number;
}

const widgets = new Map<number, Widget>();
let engine: Promise<{ module: WebAssembly.Module; snapshot: Snapshot; kind: SuspendKind }> | null = null;
/** The page's clock minus this worker's: frame times come in the page's. */
let clockOffset = 0;

const toPage = (msg: EngineToPage, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

async function compile(url: string): Promise<WebAssembly.Module> {
  try {
    return await WebAssembly.compileStreaming(fetch(url));
  } catch {
    // a server that sends the wasm with another MIME type
    return await WebAssembly.compile(await (await fetch(url)).arrayBuffer());
  }
}

async function boot(sandboxBundle: string, kind: SuspendKind, shared?: Extract<EngineToPage, { type: 'shared' }>) {
  const t0 = performance.now();
  // another engine's: its module is the one compiled for this engine's kind, its snapshot taken on it
  if (shared && shared.kind === kind) {
    const { module, snapshot } = shared as unknown as { module: WebAssembly.Module; snapshot: Snapshot };
    toPage({ type: 'ready', kind: shared.kind, bootMs: Math.round(performance.now() - t0) });
    return { module, snapshot, kind: shared.kind as SuspendKind };
  }
  const module = await compile(kind === 'jspi' ? wasmUrl : asyncifyWasmUrl);
  const snapshot = await takeSnapshot(module, sandboxBundle);
  toPage({ type: 'ready', kind, bootMs: Math.round(performance.now() - t0) });
  return { module, snapshot, kind };
}

function start(id: number, html: string, config: Extract<PageToEngine, { type: 'start' }>['config']) {
  const validator = new Validator((kind, detail) => toHost({ type: 'diag', kind, detail }), { colorScheme: config.theme, scope: 'shadow' });
  validator.setPolicy(resolvePolicy(config.policy));
  const render = (msg: HostToRenderer) => toPage({ type: 'render', id, msg });
  const toHost = (msg: WorkerToHost) => toPage({ type: 'host', id, msg, nodes: validator.nodeCount });
  // what WidgetHost.onWorker does with a worker's messages, short of the renderer
  const post = (msg: WorkerToHost) => {
    switch (msg.type) {
      case 'ops': {
        const ops = validator.processOps(msg.ops);
        // a counted cap passed under strict: the widget stops as WidgetHost stops it (the renderer keeps its last render)
        if (validator.stopped) return widget.glue.kill(validator.stopped);
        if (ops.length) render({ type: 'ops', ops });
        return;
      }
      case 'listen': render({ type: 'listen', types: validator.validateListen(msg.types), since: finiteNumber(msg.since) }); return;
      case 'pd': render({ type: 'preventDefault', keys: validator.validatePreventDefault(msg.keys) }); return;
      case 'anim': {
        const anims = validator.validateAnim(msg.anims);
        const now = finiteNumber(msg.now);
        if (anims.length && now !== undefined) render({ type: 'anim', now, anims });
        return;
      }
      case 'raf': render({ type: 'requestFrame' }); return;
      case 'query': return; // `worker` queries go through `ask`
      // after the loading tasks' ops (the glue posts them first): text changes are rate-limited from here on
      case 'loaded': validator.markLoaded(); toHost(msg); return;
      default: toHost(msg);
    }
  };
  const widget: Widget = {
    validator,
    asks: new Map(),
    qid: 0,
    glue: createGlue({
      post,
      ask: (raw) => {
        const query = validator.validateQuery(raw);
        if (!query) return Promise.resolve({ json: '{"error":"invalid query"}', hostMs: 0 });
        if (query.q === 'matchMedia') query.query = validator.rewriteMediaQuery(query.query);
        const qid = ++widget.qid;
        toPage({ type: 'query', id, qid, query });
        return new Promise<QueryAnswer>((resolve) => widget.asks.set(qid, resolve));
      },
      parseHTML: parseHtmlTreeParse5,
    }),
  };
  widgets.set(id, widget);

  (engine ?? Promise.reject(new Error('the engine was not booted'))).then(async ({ module, snapshot, kind }) => {
    const { memory, QuickJS, suspender } = await instantiateSuspendable(module, kind, snapshot.pages, copyMaximum(snapshot, config.memoryLimitBytes));
    // stopped while its copy was made
    if (widgets.get(id) !== widget) return;
    const vm = restoreVM(QuickJS, memory, snapshot, config.memoryLimitBytes, suspender);
    for (const msg of vm.pending) post(msg);
    widget.glue.adopt(vm, { type: 'start', html, config });
  }).catch((e) => {
    if (widgets.get(id) === widget) toHost({ type: 'dead', reason: 'failed to start the engine: ' + (e as Error).message });
  });
}

function stop(id: number) {
  const widget = widgets.get(id);
  if (!widget) return;
  widgets.delete(id);
  widget.glue.destroy();
  // a task waiting for an answer goes on to its end, interrupted: the VM goes with it
  for (const resolve of widget.asks.values()) resolve({ json: '{"error":"dead"}', hostMs: 0 });
  widget.asks.clear();
}

function onMessage(e: MessageEvent<PageToEngine>) {
  const msg = e.data;
  switch (msg.type) {
    case 'boot':
      clockOffset = msg.timeOrigin - performance.timeOrigin;
      engine ??= boot(msg.sandboxBundle, suspendKind(msg.suspend), msg.shared);
      engine.catch((err) => toPage({ type: 'failed', error: (err as Error).message }));
      return;
    case 'share':
      engine?.then(({ module, snapshot, kind }) => toPage({ type: 'shared', kind, module, snapshot }), () => {});
      return;
    case 'start':
      start(msg.id, msg.html, msg.config);
      return;
    case 'answer': {
      const widget = widgets.get(msg.id);
      const resolve = widget?.asks.get(msg.qid);
      if (!resolve) return;
      widget!.asks.delete(msg.qid);
      resolve({ json: msg.json, binary: msg.binary, hostMs: Number(msg.hostMs) || 0 });
      return;
    }
    case 'input': {
      const input = msg.msg;
      if (input.type === 'stop') return stop(msg.id);
      const widget = widgets.get(msg.id);
      if (!widget) return;
      if (input.type === 'theme') {
        // the host owns the theme: stylesheets are sanitized again against the scheme
        const ops = widget.validator.setTheme(input.theme);
        if (ops.length) toPage({ type: 'render', id: msg.id, msg: { type: 'ops', ops } });
      }
      widget.glue.receive(input.type === 'frame' ? { type: 'frame', time: input.time + clockOffset } : input);
    }
  }
}

// Only the first evaluation of this module takes the messages: in a code-split build the chunks quickjs loads with
// `import()` import shared code back from this file, and Chrome evaluates a module worker's main script again then
// (worker.ts); the second copy, with no engine and no widgets, would answer every `start` with an error.
const BOOTED = Symbol.for('widget-sandbox.engine-worker');
if (!(globalThis as any)[BOOTED]) {
  (globalThis as any)[BOOTED] = true;
  self.onmessage = onMessage;
}
