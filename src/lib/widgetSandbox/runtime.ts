import {batch, createRoot, createSignal} from 'solid-js';
import type {EngineOptions, EngineSlot} from 'widget-sandbox/host/engine-client';
import type {InlineVM} from 'widget-sandbox/host/inline-engine';
import type {RendererFactory} from 'widget-sandbox/host/renderer';
import type {WidgetHost, WidgetHostOptions, WidgetSyncTransport, WidgetTheme} from 'widget-sandbox/host/widget-host';
import type {WorkerPool} from 'widget-sandbox/host/worker-pool';
import {suspendKind, type SuspendKind} from 'widget-sandbox/host/suspend-kind';
import I18n from '@lib/langPack';
import IS_WEB_ASSEMBLY_SUPPORTED from '@environment/webAssemblySupport';
import {readStoredChoice, storeChoice} from '@helpers/storedChoice';

/**
 * The widget sandbox (src/vendor/widget-sandbox) as the chat uses it: loaded with the first widget a chat
 * renders, the renderer and the transport picked here, and a cap on how many widgets keep an engine at once.
 */

/**
 * The renderer of the `sab` transport (a debug switch; `worker` and `inline` always draw on a shadow root, `frame` in
 * its frame):
 * `iframe`, a sandboxed srcdoc frame per widget (opaque origin, its own CSP); `shadow`, the same renderer core on a
 * shadow root in the chat page.
 */
export type WidgetRendererKind = 'iframe' | 'shadow';

/**
 * Where the widget's engine runs, and so how its synchronous layout queries (getBoundingClientRect & co) reach the
 * renderer:
 * - `worker` (what users get, `auto`): in the page's engine worker with every other widget's, each in a copy of an
 *   engine warmed once (engine-worker.ts), drawing on a shadow root in the page — nothing of the widget's runs on the
 *   page's thread but applying what it draws; a query waits for the page's answer (suspend.ts). The widget runs its
 *   first task before its bubble is in the chat (staging.ts), so the bubble enters with its content;
 * - `inline`: in the page itself, in such a copy — the widget starts synchronously when its bubble is inserted, and
 *   a query is a call; what a page without workers gets;
 * - `sab`: in a worker of its own, blocking on a SharedArrayBuffer — needs a cross-origin isolated page;
 * - `frame`: inside the renderer's sandboxed frame — any page, always with the iframe renderer.
 */
export type WidgetTransportChoice = WidgetSyncTransport | 'auto';

/**
 * How a `worker` widget's code waits for a query's answer (a debug switch: `auto` is what users get): `jspi`, the
 * engine suspends the wasm stack (Chromium, Safari); `asyncify`, the asyncify build of QuickJS unwinds and rewinds it
 * (what Firefox runs; about twice as slow). `jspi` where the engine lacks it is `asyncify`.
 */
export type WidgetSuspendChoice = SuspendKind | 'auto';

/** How many engine workers the page's `worker` widgets share at most (a debug switch: `auto` is what users get). */
export type WidgetEngineCountChoice = 'auto' | '1' | '2';

/** What a widget's start needs of its engine (`prepare`): `worker`, the engine worker kept for it; `inline`, a copy. */
export type WidgetEngine = EngineSlot | InlineVM;

export type WidgetHostInit = Omit<WidgetHostOptions, 'rendererFactory' | 'workerPool' | 'theme' | 'syncTransport' | 'features' | 'inlineVM' | 'engineSlot'> & {
  theme: WidgetTheme,
  renderer: WidgetRendererKind,
  transport: WidgetTransportChoice,
  /** From `prepare`: the engine worker kept for the widget, or (`inline`) the engine copy for a synchronous start. */
  engine?: WidgetEngine
};

export type WidgetRuntime = {
  createHost: (container: HTMLElement, html: string, init: WidgetHostInit) => WidgetHost,
  /** What a widget on `transport` needs before it starts: `worker`, an engine worker ready for it; `inline`, a copy. */
  prepare: (transport: WidgetSyncTransport) => Promise<WidgetEngine | undefined>
};

/** `sab`: sandbox workers kept booted (QuickJS + the shim) so the next widget skips a cold start. */
const POOL_SIZE = 2;
/** Widgets that keep an engine at once; past it the one hidden the longest keeps only its picture. */
const MAX_LIVE_WIDGETS = 8;
/** The wire forms widget profile 1 sets for every client (docs/integration.md, "Policy and features"). */
const FEATURES = ['webAnimations'];
const RENDERER_STORAGE_KEY = 'tweb-widget-renderer';
const TRANSPORT_STORAGE_KEY = 'tweb-widget-transport';
const SUSPEND_STORAGE_KEY = 'tweb-widget-suspend';
const ENGINES_STORAGE_KEY = 'tweb-widget-engines';

const [widgetRendererKind, setRendererKind] = createRoot(() => createSignal(readStoredChoice<WidgetRendererKind>(RENDERER_STORAGE_KEY, ['iframe', 'shadow'], 'iframe')));
const [widgetTransport, setTransport] = createRoot(() => createSignal(readStoredChoice<WidgetTransportChoice>(TRANSPORT_STORAGE_KEY, ['auto', 'worker', 'inline', 'sab', 'frame'], 'auto')));
const [widgetSuspend, setSuspend] = createRoot(() => createSignal(readStoredChoice<WidgetSuspendChoice>(SUSPEND_STORAGE_KEY, ['auto', 'jspi', 'asyncify'], 'auto')));
const [widgetEngineCount, setEngineCount] = createRoot(() => createSignal(readStoredChoice<WidgetEngineCountChoice>(ENGINES_STORAGE_KEY, ['auto', '1', '2'], 'auto')));
export {widgetRendererKind, widgetTransport, widgetSuspend, widgetEngineCount};

/** Switches every live widget to the other renderer (each restarts from its HTML) and remembers the choice. */
export function setWidgetRendererKind(kind: WidgetRendererKind) {
  storeChoice(RENDERER_STORAGE_KEY, kind);
  setRendererKind(kind);
}

/** The same for the transport (a debug switch: `auto` is what users get). */
export function setWidgetTransport(transport: WidgetTransportChoice) {
  storeChoice(TRANSPORT_STORAGE_KEY, transport);
  setTransport(transport);
}

/** The suspension a `worker` widget started now gets. */
export function resolveWidgetSuspend(choice: WidgetSuspendChoice = widgetSuspend()): SuspendKind {
  return suspendKind(choice);
}

function engineOptions(): EngineOptions {
  const count = widgetEngineCount();
  return {suspend: widgetSuspend(), engines: count === 'auto' ? 'auto' : +count};
}

/** Set once the engine client is loaded: hands it the switches' values. */
let applyEngineOptions: (options: EngineOptions) => void;

/** The same for the suspension of the `worker` transport: engines started from now on use it. */
export function setWidgetSuspend(choice: WidgetSuspendChoice) {
  setEngineOption(SUSPEND_STORAGE_KEY, setSuspend, choice);
}

/** The same for the number of engine workers. */
export function setWidgetEngineCount(choice: WidgetEngineCountChoice) {
  setEngineOption(ENGINES_STORAGE_KEY, setEngineCount, choice);
}

/** Remembers the engines' switch `key` and hands the engines its value. */
function setEngineOption<T extends string>(key: string, set: (value: T) => void, value: T) {
  storeChoice(key, value);
  // the engines change before the widgets restart on them (the effects run after the batch)
  batch(() => {
    set(value);
    applyEngineOptions?.(engineOptions());
  });
}

/** Engines started from now on: as `options` say (the bench), or (none) as the switches do. */
export async function applyWidgetEngineOptions(options?: EngineOptions) {
  await loadWidgetRuntime();
  applyEngineOptions(options ?? engineOptions());
}

/** Set once the runtime is loaded: lets go of `sab`'s workers kept booted for the next widget. */
let dropBootedWorkers: () => void;

/**
 * The bench: the next widget starts cold, on engines as `options` say. Every engine worker kept goes — a change of the
 * options retires them, and the same options again would keep one the sandbox has warmed — and so do `sab`'s booted
 * workers.
 */
export async function startWidgetEnginesCold(options: EngineOptions) {
  await loadWidgetRuntime();
  applyEngineOptions({...options, engines: options.engines === 1 ? 2 : 1});
  applyEngineOptions(options);
  dropBootedWorkers();
}

function canShareMemory() {
  return typeof(SharedArrayBuffer) !== 'undefined' && !!self.crossOriginIsolated;
}

/** The transport a widget started now gets. */
export function resolveWidgetTransport(choice: WidgetTransportChoice = widgetTransport()): WidgetSyncTransport {
  if(choice === 'sab') return canShareMemory() ? 'sab' : 'frame';
  if(choice === 'frame' || choice === 'inline') return choice;
  return typeof(Worker) !== 'undefined' ? 'worker' : 'inline';
}

/** The UI language as a BCP 47 tag (`navigator.language` and the Intl default inside the widget). */
export function getWidgetLocale() {
  const code = I18n.getLastRequestedLangCode() || 'en';
  try {
    return Intl.getCanonicalLocales(code.replace(/_/g, '-'))[0];
  } catch{
    return code.split(/[-_]/)[0];
  }
}

/** QuickJS is WebAssembly; that is all the sandbox needs from the browser now. */
export function isWidgetSandboxSupported() {
  return IS_WEB_ASSEMBLY_SUPPORTED;
}

let runtimePromise: Promise<WidgetRuntime>;

export function loadWidgetRuntime(): Promise<WidgetRuntime> {
  return runtimePromise ??= Promise.all([
    import('widget-sandbox/host/widget-host'),
    import('widget-sandbox/host/engine-client'),
    import('widget-sandbox/host/inline-engine'),
    import('widget-sandbox/host/worker-pool'),
    import('widget-sandbox/host/iframe-renderer'),
    import('widget-sandbox/host/shadow-renderer'),
    import('@lib/widgetSandbox/emoji')
  ]).then(([{WidgetHost}, {reserveEngine, setEngineOptions}, {prepareInlineVM}, {WorkerPool}, {IframeRenderer}, {ShadowDomRenderer, setClientEmoji}, {splitWidgetEmoji}]): WidgetRuntime => {
    // the client's emoji, as in its messages
    setClientEmoji(splitWidgetEmoji);
    // users never change them: the defaults stay put and no engine is retired for nothing
    const options = engineOptions();
    if(options.suspend !== 'auto' || options.engines !== 'auto') setEngineOptions(options);
    applyEngineOptions = setEngineOptions;

    const factories: Record<WidgetRendererKind, RendererFactory> = {
      iframe: IframeRenderer.factory,
      shadow: ShadowDomRenderer.factory
    };

    let pool: WorkerPool;
    dropBootedWorkers = () => {
      pool?.destroy();
      pool = undefined;
    };
    return {
      createHost: (container, html, {renderer, transport, engine, ...options}) => {
        const syncTransport = resolveWidgetTransport(transport);
        return new WidgetHost(container, html, {
          ...options,
          features: FEATURES,
          syncTransport,
          ...(syncTransport === 'inline' && {inlineVM: engine as InlineVM}),
          ...(syncTransport === 'worker' && {engineSlot: engine as EngineSlot}),
          // `frame` brings its own renderer and has no worker to pool
          ...(syncTransport === 'sab' && {rendererFactory: factories[renderer], workerPool: pool ??= new WorkerPool(POOL_SIZE)})
        });
      },
      prepare: (transport) => {
        if(transport === 'worker') return reserveEngine();
        return transport === 'inline' ? prepareInlineVM() : Promise.resolve(undefined);
      }
    };
  }).catch((err) => {
    runtimePromise = undefined;
    throw err;
  });
}

export type LiveWidget = {
  /** Shown on screen right now (not paused); undefined until the chat has said either. */
  visible: boolean | undefined,
  lastVisibleAt: number,
  /** Drop the engine and keep the last picture; the widget starts again when it is shown. */
  park: () => void
};

const liveWidgets = new Set<LiveWidget>();

/**
 * Parks the widgets hidden the longest while more than MAX_LIVE_WIDGETS keep an engine. One the chat has not yet
 * reported on (just inserted) is never parked: it may be the one on screen.
 */
export function checkLiveWidgets() {
  if(liveWidgets.size <= MAX_LIVE_WIDGETS) return;
  const parkable = [...liveWidgets]
  .filter((widget) => widget.visible === false)
  .sort((a, b) => a.lastVisibleAt - b.lastVisibleAt);
  while(liveWidgets.size > MAX_LIVE_WIDGETS && parkable.length) {
    const widget = parkable.shift();
    liveWidgets.delete(widget);
    widget.park();
  }
}

/** Counts a running widget against MAX_LIVE_WIDGETS; returns the unregister. */
export function registerLiveWidget(widget: LiveWidget) {
  liveWidgets.add(widget);
  checkLiveWidgets();
  return () => {
    liveWidgets.delete(widget);
  };
}
