// tweb (`worker` transport, see UPSTREAM.md): how a widget's code waits for a query's answer (suspend.ts), in a module
// of its own so that the page can tell without loading QuickJS.

export type SuspendKind = 'jspi' | 'asyncify';

// read off the global: the page imports this module where WebAssembly may be off, and asks whether widgets run after
const W = (globalThis as { WebAssembly?: typeof WebAssembly & { Suspending?: unknown; promising?: unknown } }).WebAssembly;

/** JSPI where the engine has it (Chromium, Safari), the asyncify build elsewhere (Firefox) or when `prefer`red. */
export function suspendKind(prefer: SuspendKind | 'auto' = 'auto'): SuspendKind {
  return prefer !== 'asyncify' && typeof W?.Suspending === 'function' && typeof W.promising === 'function' ? 'jspi' : 'asyncify';
}
