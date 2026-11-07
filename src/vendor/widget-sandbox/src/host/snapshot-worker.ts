// `inline` transport (tweb): makes the snapshot (inline-snapshot.ts) off the page's thread. The page sends the sandbox
// bundle and gets the snapshot back, with the QuickJS module the worker compiled and warmed.

import wasmUrl from '@telegram/widget-sandbox-quickjs/wasm?url';
import { takeSnapshot } from './inline-snapshot';

self.onmessage = async (e: MessageEvent<{ sandboxBundle: string }>) => {
  try {
    const module = await WebAssembly.compileStreaming(fetch(wasmUrl)).catch(async () => WebAssembly.compile(await (await fetch(wasmUrl)).arrayBuffer()));
    const snapshot = await takeSnapshot(module, e.data.sandboxBundle);
    const transfer = [snapshot.data.buffer, snapshot.runs.buffer, snapshot.clear.buffer];
    // the module goes back too: its code is warm from evaluating the bundle (inline-engine.ts)
    try {
      (self as unknown as Worker).postMessage({ snapshot, module }, transfer);
    } catch {
      (self as unknown as Worker).postMessage({ snapshot }, transfer);
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({ error: (err as Error).message });
  }
};
