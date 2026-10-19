import type {BroadcastEventsListeners, RootScope} from '@lib/rootScope';

type HotContext = NonNullable<ImportMeta['hot']>;

/*
 * A module's top level runs again on a hot update. What it declares there — state, classes — the dev server keeps by
 * itself (scripts/hot-module-transform.mjs, src/helpers/hotRegistry.ts). What it does there is left to the module:
 * a listener it adds, an interval it starts, a root with effects. Done through these, the next evaluation's setup
 * replaces the previous one instead of running beside it. In production `hot` is undefined: they just set up.
 */

// `token` stands for the evaluation that owns the setups: the listener map Vite's client files under the module's path
// for its latest evaluation (the context itself where there is no client, as in the tests)
// (`hot`: any of the module's contexts, to look the latest one up by)
type Effects = {token: unknown, hot: HotContext, cleanups: (() => void)[]};

// every module's effects, swept after each hot update (sweepHotEffects)
const effectRegistry = new Set<Effects>();

/**
 * The setup a module did on its previous evaluation, undone before this one sets up its own. Vite makes a new hot
 * context for every evaluation of a module and keeps `data` across them — and a module that runs again only because
 * a boundary above it re-imports it gets no dispose call, so the context's identity is what tells.
 */
function effectsOf(hot: HotContext) {
  // a setup made late, through an earlier evaluation's code (a function another module still holds), belongs to the
  // latest one all the same: it is not undone until the module runs again
  const token = latestEvaluation(hot);
  const effects: Effects = hot.data.effects ??= {token, hot, cleanups: []};
  effectRegistry.add(effects);
  effects.hot = hot;
  if(effects.token !== token) {
    effects.cleanups.splice(0).forEach((cleanup) => cleanup());
    effects.token = token;
  }

  // an edit that took away the module's last importer drops it without running it again: undo its setups then too
  hot.prune?.(() => {
    effects.cleanups.splice(0).forEach((cleanup) => cleanup());
    effectRegistry.delete(effects);
  });

  return effects.cleanups;
}

// Each evaluation of a module gets a hot context of its own, whose listener map the client files under the module's
// path: the map filed now stands for the latest evaluation (internals of Vite's client, read with care)
function latestEvaluation(hot: HotContext): unknown {
  const {hmrClient, ownerPath} = hot as unknown as {hmrClient?: {ctxToListenersMap?: Map<string, unknown>}, ownerPath?: string};
  return hmrClient?.ctxToListenersMap?.get(ownerPath) ?? hot;
}

/**
 * After a hot update: a module that ran again without calling hotEffect / hotListen — the edit removed its last one —
 * would keep its previous evaluation's listeners and intervals, which nothing else undoes. Exported for the tests.
 */
export function sweepHotEffects() {
  for(const effects of effectRegistry) {
    if(effects.cleanups.length && effects.token !== latestEvaluation(effects.hot)) {
      effects.cleanups.splice(0).forEach((cleanup) => cleanup());
    }
  }
}

if(import.meta.hot) {
  import.meta.hot.on?.('vite:afterUpdate', sweepHotEffects);
  // how @helpers/hotRegistry, which cannot reach Vite's client, asks the dev server for a page reload
  // (scripts/hot-reload-plugin.mjs)
  const hot = import.meta.hot;
  (globalThis as any)[Symbol.for('tweb.hotReloadSender')] = (path: string, reason: string) => hot.send?.('tweb:reload', {path, reason});
}

/**
 * Something a module sets up at its top level — an interval, a subscription — whose cleanup runs when a hot update
 * runs the module again, so the new evaluation's setup replaces the old one instead of running beside it.
 */
export function hotEffect(hot: HotContext | undefined, setup: () => () => void) {
  // vitest hands modules a hot context without the data Vite keeps across evaluations
  const cleanups = hot?.data ? effectsOf(hot) : undefined;
  const cleanup = setup();
  cleanups?.push(cleanup);
}

type Listenable<N, C> = {
  addEventListener(name: N, callback: C): unknown,
  removeEventListener(name: N, callback: C): unknown
};

/** A listener a module adds at its top level (see hotEffect): `hotListen(import.meta.hot, rootScope, 'x', onX)`. */
export function hotListen<K extends keyof BroadcastEventsListeners>(hot: HotContext | undefined, target: RootScope, name: K, callback: BroadcastEventsListeners[K]): void;
export function hotListen<N, C>(hot: HotContext | undefined, target: Listenable<N, C>, name: N, callback: C): void;
export function hotListen(hot: HotContext | undefined, target: Listenable<any, any>, name: any, callback: any) {
  hotEffect(hot, () => {
    target.addEventListener(name, callback);
    return () => target.removeEventListener(name, callback);
  });
}
