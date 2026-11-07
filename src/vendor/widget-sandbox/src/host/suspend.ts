// tweb (`worker` transport, see UPSTREAM.md): QuickJS instances whose host calls can wait for an answer that comes
// later — a layout query the page answers — while the widget's code stays synchronous. Engines with JavaScript
// Promise Integration suspend the wasm stack (WebAssembly.Suspending / promising); the others run the asyncify build
// of the same QuickJS (`emscripten-module.asyncify.wasm`: wasm-opt --asyncify on the host call import alone), whose
// stack unwinds into a buffer in its own memory and rewinds.
//
// Either way a host call that waits is made twice. The first time the host function hands over a promise (`wait`)
// and returns nothing; once the promise settles the same call is made again, with the same arguments, and the host
// function takes the answer (`takeAnswer`). The glue runs nothing else in the instance meanwhile.

import baseVariant from '@telegram/widget-sandbox-quickjs';
import { newQuickJSWASMModuleFromVariant, newVariant, type QuickJSWASMModule } from 'quickjs-emscripten-core';
import type { SuspendKind } from './suspend-kind';

export { suspendKind, type SuspendKind } from './suspend-kind';

/** The exports through which code runs in the VM, the only calls that may wait. */
export type RunExport = '_QTS_Call' | '_QTS_Eval' | '_QTS_ExecutePendingJob';

const W = WebAssembly as typeof WebAssembly & {
  Suspending?: new (fn: (...args: any[]) => unknown) => unknown;
  promising?: (fn: Function) => (...args: unknown[]) => Promise<number>;
};

/**
 * Room for what an asyncify unwind saves: the wasm locals of every frame from the export down to the host call (the
 * C stack itself stays where it is). A recursion deeper than this cannot wait; its call fails and the widget dies.
 */
const ASYNCIFY_DATA_BYTES = 512 * 1024;
const ASYNCIFY_UNWINDING = 1;
const ASYNCIFY_REWINDING = 2;

interface AsyncifyExports {
  asyncify_start_unwind(data: number): void;
  asyncify_stop_unwind(): void;
  asyncify_start_rewind(data: number): void;
  asyncify_stop_rewind(): void;
  asyncify_get_state(): number;
}

export class Suspender {
  /** Inside `run`: a host function may wait. */
  private running = false;
  private pending: Promise<unknown> | null = null;
  private answer: { value?: unknown; error?: unknown } | null = null;
  /** asyncify: the instance's exports, the buffer the stack unwinds into, the call to make again. */
  private exports: AsyncifyExports | null = null;
  private data = 0;
  private unwound: Promise<number> | null = null;
  private resume = 0;
  private readonly promisingFns = new Map<RunExport, (...args: unknown[]) => Promise<number>>();
  /** Set once the instance exists: frees the value the first call of a waiting host call returned. */
  release: (ctx: number, ptr: number) => void = () => {};
  /** Set by the glue: called right before the VM's code goes on after a wait, in the same job or the one before. */
  onResume: () => void = () => {};
  module: any = null;

  constructor(readonly kind: SuspendKind, private readonly memory: WebAssembly.Memory) {}

  /** Whether a host function called now can wait: inside `run`, with no wait pending (not in `vm.dump()`, say). */
  canWait(): boolean {
    return this.running && !this.pending;
  }

  /** From a host function: answer this call with what `answer` settles to. False where nothing can wait. */
  wait(answer: Promise<unknown>): boolean {
    if (!this.canWait()) return false;
    this.pending = answer;
    return true;
  }

  /** In the call made again after a wait: what the promise settled to (`error` when it was rejected). */
  takeAnswer(): { value?: unknown; error?: unknown } | null {
    const answer = this.answer;
    this.answer = null;
    return answer;
  }

  /** Calls an export that runs code in the VM: its result, or a promise of it when a host call waited. */
  run(name: RunExport, args: number[]): number | Promise<number> {
    const fn = this.module[name] as (...args: number[]) => number;
    if (this.kind === 'jspi') {
      let promising = this.promisingFns.get(name);
      if (!promising) this.promisingFns.set(name, promising = W.promising!(fn));
      this.running = true;
      const result = promising(...args);
      const ran = () => { this.running = false; };
      result.then(ran, ran);
      return result;
    }
    const ex = this.exports!;
    this.running = true;
    let result: number;
    try {
      result = fn(...args);
    } catch (e) {
      this.running = false;
      throw e;
    }
    if (ex.asyncify_get_state() !== ASYNCIFY_UNWINDING) {
      this.running = false;
      return result;
    }
    ex.asyncify_stop_unwind();
    return this.rewind(fn, args);
  }

  private async rewind(fn: (...args: number[]) => number, args: number[]): Promise<number> {
    const ex = this.exports!;
    try {
      for (;;) {
        const unwound = this.unwound!;
        this.unwound = null;
        this.resume = await unwound;
        this.onResume();
        ex.asyncify_start_rewind(this.data);
        const result = fn(...args);
        if (ex.asyncify_get_state() !== ASYNCIFY_UNWINDING) return result;
        ex.asyncify_stop_unwind();
      }
    } finally {
      this.running = false;
    }
  }

  /** Wraps the import QuickJS calls host functions through. */
  wrapHostCall(call: (...args: number[]) => number): unknown {
    // the second call, with the answer; what the first one returned was never used
    const again = (self: unknown, args: number[], settled: { value?: unknown; error?: unknown }) => {
      this.answer = settled;
      return call.apply(self, args);
    };
    const settle = (self: unknown, args: number[], pending: Promise<unknown>) => pending.then(
      (value) => again(self, args, { value }),
      (error) => again(self, args, { error: error ?? new Error('rejected') }),
    );
    const suspender = this;
    if (this.kind === 'jspi') {
      return new W.Suspending!(function (this: unknown, ...args: number[]) {
        const result = call.apply(this, args);
        const pending = suspender.pending;
        if (!pending) return result;
        suspender.pending = null;
        suspender.release(args[0], result);
        const resumed = settle(this, args, pending);
        // a reaction ahead of the one JSPI adds to this very promise: the two jobs are queued next to each other
        const onResume = () => suspender.onResume();
        resumed.then(onResume, onResume);
        return resumed;
      });
    }
    return function (this: unknown, ...args: number[]) {
      const ex = suspender.exports!;
      if (ex.asyncify_get_state() === ASYNCIFY_REWINDING) {
        ex.asyncify_stop_rewind();
        const result = suspender.resume;
        suspender.resume = 0;
        return result;
      }
      const result = call.apply(this, args);
      const pending = suspender.pending;
      if (!pending) return result;
      suspender.pending = null;
      suspender.release(args[0], result);
      suspender.unwound = settle(this, args, pending);
      if (!suspender.data) suspender.data = suspender.module._malloc(ASYNCIFY_DATA_BYTES);
      if (!suspender.data) throw new Error('out of memory');
      const view = new Int32Array(suspender.memory.buffer);
      view[suspender.data >> 2] = suspender.data + 8;
      view[(suspender.data + 4) >> 2] = suspender.data + ASYNCIFY_DATA_BYTES;
      ex.asyncify_start_unwind(suspender.data);
      return 0;
    };
  }

  attach(exports: WebAssembly.Exports) {
    if (this.kind === 'asyncify') {
      if (typeof exports.asyncify_get_state !== 'function') throw new Error('the QuickJS build is not asyncified');
      this.exports = exports as unknown as AsyncifyExports;
    }
  }
}

/** The emscripten import QuickJS calls host functions through (its name is minified: found by what it does). */
export function findHostCallImport(imports: WebAssembly.Imports): [string, string] {
  for (const [moduleName, entries] of Object.entries(imports)) {
    for (const [name, value] of Object.entries(entries)) {
      if (typeof value === 'function' && String(value).includes('callbacks.callFunction')) return [moduleName, name];
    }
  }
  throw new Error('the QuickJS host call import was not found');
}

/** A fresh instance of `module` in a Memory of `pages` (growing to `maximum`), its host calls able to wait. */
export async function instantiateSuspendable(module: WebAssembly.Module, kind: SuspendKind, pages: number, maximum: number): Promise<{ memory: WebAssembly.Memory; QuickJS: QuickJSWASMModule; suspender: Suspender }> {
  const memory = new WebAssembly.Memory({ initial: pages, maximum });
  const suspender = new Suspender(kind, memory);
  const variant = newVariant(baseVariant, {
    wasmMemory: memory,
    emscriptenModule: {
      instantiateWasm: async (imports: WebAssembly.Imports, onSuccess: (instance: WebAssembly.Instance) => void) => {
        const [moduleName, name] = findHostCallImport(imports);
        const entries = imports[moduleName] as Record<string, unknown>;
        entries[name] = suspender.wrapHostCall(entries[name] as (...args: number[]) => number);
        const instance = await WebAssembly.instantiate(module, imports);
        suspender.attach(instance.exports);
        onSuccess(instance);
        return instance.exports;
      },
    } as any,
  });
  const QuickJS = await newQuickJSWASMModuleFromVariant(variant);
  const q = QuickJS as any;
  suspender.module = q.module;
  suspender.release = (ctx, ptr) => { if (ptr) q.ffi.QTS_FreeValuePointer(ctx, ptr); };
  return { memory, QuickJS, suspender };
}
