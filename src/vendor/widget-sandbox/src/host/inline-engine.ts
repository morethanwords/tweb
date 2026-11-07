// `inline` transport (tweb, see UPSTREAM.md): QuickJS runs in the page, next to the Shadow DOM renderer, so a widget
// starts synchronously and a layout query is a call. Evaluating the sandbox bundle takes 100–800 ms, so it happens
// once per page, in a worker, in a VM whose linear memory is then kept ("the snapshot", inline-snapshot.ts); every
// widget gets a fresh wasm instance of the same compiled module with that memory written into it: a few milliseconds,
// no worker and no frame per widget. Each copy is a runtime of its own in a Memory of its own, so the memory cap, the
// CPU limits and the isolation between widgets are the same as with a worker each.

import sandboxBundle from 'virtual:sandbox-bundle';
import wasmUrl from '@telegram/widget-sandbox-quickjs/wasm?url';
import { copyMaximum, instantiate, restoreVM, takeSnapshot, type RestoredVM, type Snapshot } from './inline-snapshot';
import { LIMIT_DEFAULTS } from '../shared/protocol';

export type InlineVM = RestoredVM;

let engine: Promise<{ module: WebAssembly.Module; snapshot: Snapshot }> | null = null;

async function compile(): Promise<WebAssembly.Module> {
  const response = fetch(wasmUrl);
  try {
    return await WebAssembly.compileStreaming(response);
  } catch {
    // a server that sends the wasm with another MIME type
    return await WebAssembly.compile(await (await fetch(wasmUrl)).arrayBuffer());
  }
}

/**
 * The compiled QuickJS and the snapshot, made in a worker. The module comes back with them: the engines share a
 * module's compiled code between threads, and this one's has just run the whole bundle there, so the page's first
 * widgets do not start on code that has not tiered up yet (a cold WebKit took a widget's first task past its 500 ms).
 * Made in this page when no worker can be started (a script policy, an old engine).
 */
function loadAside(): Promise<{ module: WebAssembly.Module; snapshot: Snapshot }> {
  return new Promise<{ module?: WebAssembly.Module; snapshot: Snapshot }>((resolve, reject) => {
    const worker = new Worker(new URL('./snapshot-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ snapshot?: Snapshot; module?: WebAssembly.Module; error?: string }>) => {
      worker.terminate();
      e.data.snapshot ? resolve({ module: e.data.module, snapshot: e.data.snapshot }) : reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message));
    };
    worker.postMessage({ sandboxBundle });
  }).then(
    // an engine that cannot clone a module sends the snapshot alone
    async ({ module, snapshot }) => ({ module: module ?? await compile(), snapshot }),
    async () => {
      const module = await compile();
      return { module, snapshot: await takeSnapshot(module, sandboxBundle) };
    },
  );
}

/** Compiles QuickJS and warms the snapshot (once per page); resolves when copies can be made. */
export function warmInlineEngine(): Promise<void> {
  engine ??= loadAside();
  engine.catch(() => { engine = null; });
  return engine.then(() => {});
}

/** A copy of the warmed VM for one widget, in a Memory capped at `memoryLimitBytes` above the initial pages. */
export async function prepareInlineVM(memoryLimitBytes: number = LIMIT_DEFAULTS.memoryLimitBytes): Promise<InlineVM> {
  await warmInlineEngine();
  const { module, snapshot } = await engine!;
  const { memory, QuickJS } = await instantiate(module, snapshot.pages, copyMaximum(snapshot, memoryLimitBytes));
  return restoreVM(QuickJS, memory, snapshot, memoryLimitBytes);
}
