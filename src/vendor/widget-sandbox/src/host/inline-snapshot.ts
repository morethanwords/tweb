// `inline` transport (tweb, see UPSTREAM.md): the snapshot of a warmed QuickJS VM that every widget's engine is copied
// from (inline-engine.ts). It is made in a worker (snapshot-worker.ts), so the ~100–800 ms of the sandbox bundle's
// evaluation never hold the page's thread; the page makes it itself only when no worker can.
//
// What a copy shares with the snapshot is only what the bundle built while it loaded. QuickJS seeds Math.random once
// per context, so every copy would draw the same numbers: the snapshot replaces it with a generator that seeds itself
// from the host's crypto on its first call, in each copy.

import baseVariant from '@telegram/widget-sandbox-quickjs';
import { Lifetime, newQuickJSWASMModuleFromVariant, newVariant, QuickJSRuntime, type QuickJSWASMModule } from 'quickjs-emscripten-core';
import { createGlue, type AdoptedVM } from './glue';
import type { Suspender } from './suspend';
import { LIMIT_DEFAULTS, WASM_INITIAL_PAGES, WASM_PAGE_BYTES, type SandboxConfig, type WorkerToHost } from '../shared/protocol';

/** The copy works in 4 KiB chunks: a chunk the snapshot left zero is never written, so a copy commits none of it. */
export const CHUNK = 4096;
/** The largest free block the snapshot zeroes at once (a larger one is zeroed piece by piece). */
const MAX_ZEROED_BLOCK = 256 * 1024;

/** xoshiro128**, seeded from `__host('random')` on the first call in each copy; captured before the host globals go. */
const SEED_SCRIPT = `(function (host, parse, imul, define) {
  let a = 0, b = 0, c = 0, d = 0, seeded = false;
  const word = (x, i) => (x[i] | x[i + 1] << 8 | x[i + 2] << 16 | x[i + 3] << 24) >>> 0;
  const rotl = (x, k) => (x << k) | (x >>> (32 - k));
  function next() {
    const r = imul(rotl(imul(b, 5), 7), 9) >>> 0, t = b << 9;
    c ^= a; d ^= b; b ^= c; a ^= d; c ^= t; d = rotl(d, 11);
    return r;
  }
  const random = { random() {
    if (!seeded) {
      const x = parse(host('random', '16'));
      a = word(x, 0); b = word(x, 4); c = word(x, 8); d = word(x, 12);
      if (!(a | b | c | d)) a = 1;
      seeded = true;
    }
    return ((next() >>> 5) * 67108864 + (next() >>> 6)) / 9007199254740992;
  } }.random;
  define(Math, 'random', { value: random, writable: true, enumerable: false, configurable: true });
})(globalThis.__host, JSON.parse, Math.imul, Object.defineProperty);`;

export interface Snapshot {
  /** Pages of the Memory the snapshot was taken from. */
  pages: number;
  /** The runs of chunks that are not all zero, as [offset, length] pairs, and their bytes back to back. */
  runs: Int32Array;
  data: Uint8Array;
  /**
   * Chunks a fresh instance writes while it initialises (its data, its constructors) that the snapshot holds as
   * zeros. Only these are cleared: writing zeros over the whole memory would make the system commit every page of it
   * (a copy would cost 11 MB instead of 4).
   */
  clear: Int32Array;
  rt: number;
  ctx: number;
  dispatch: number;
  /** The host reference counter after the host functions were registered: a copy must reach the same. */
  hostRefsNext: number;
  /** What the glue said while the bundle loaded (the shim's first ops, if any): each widget's host gets it first. */
  pending: WorkerToHost[];
}

/** Gives dlmalloc's free blocks back as zeros (the bundle's parse leaves megabytes of garbage in them), so that the snapshot holds only what lives. */
function zeroFreeBlocks(module: any, memory: WebAssembly.Memory) {
  const top = highestNonZero(new Uint8Array(memory.buffer));
  const taken: number[] = [];
  for (let size = MAX_ZEROED_BLOCK; size >= 16; size >>= 1) {
    for (;;) {
      const p: number = module._malloc(size);
      if (!p) break;
      // carved from the top chunk: no free block of this size is left
      if (p + size >= top - 64) { module._free(p); break; }
      new Uint8Array(memory.buffer).fill(0, p, p + size);
      taken.push(p);
    }
  }
  for (const p of taken) module._free(p);
}

function highestNonZero(bytes: Uint8Array): number {
  let top = bytes.length;
  while (top > 0 && bytes[top - 1] === 0) top--;
  return top;
}

/** Offsets of the chunks below `top` that hold anything. */
function dirtyChunks(bytes: Uint8Array, top = highestNonZero(bytes)): number[] {
  const offsets: number[] = [];
  const words = new Uint32Array(bytes.buffer, 0, bytes.byteLength >> 2);
  for (let off = 0; off < top; off += CHUNK) {
    for (let i = off >> 2, end = Math.min(off + CHUNK, top + 3) >> 2; i < end; i++) if (words[i]) { offsets.push(off); break; }
  }
  return offsets;
}

/** A copy restored from the snapshot (`restoreVM`): what the glue adopts, and what the shim said while the bundle loaded. */
export interface RestoredVM extends AdoptedVM {
  pending: WorkerToHost[];
  /** The copy's linear memory (diagnostics: what a widget's engine holds). */
  memory: WebAssembly.Memory;
}

/** The pages a copy's Memory may grow to: the memory limit above the initial pages, never below the snapshot's own. */
export function copyMaximum(snapshot: Snapshot, memoryLimitBytes: number): number {
  return Math.max(snapshot.pages, WASM_INITIAL_PAGES + Math.ceil(memoryLimitBytes / WASM_PAGE_BYTES));
}

export async function instantiate(module: WebAssembly.Module, pages: number, maximum: number) {
  const memory = new WebAssembly.Memory({ initial: pages, maximum });
  const QuickJS = await newQuickJSWASMModuleFromVariant(newVariant(baseVariant, { wasmModule: () => module, wasmMemory: memory }));
  return { memory, QuickJS };
}

/** Warms a VM on the compiled QuickJS and takes its snapshot (the page or a worker: the memory comes out the same). */
export async function takeSnapshot(module: WebAssembly.Module, sandboxBundle: string): Promise<Snapshot> {
  const pending: WorkerToHost[] = [];
  let failure = '';
  const glue = createGlue({
    post: (msg) => {
      // the warm-up's own reports stay here
      if (msg.type === 'warmed' || msg.type === 'stats' || (msg.type === 'diag' && msg.kind === 'boot')) return;
      if (msg.type === 'dead') failure = msg.reason;
      else pending.push(msg);
    },
  });
  const config: SandboxConfig = { ...LIMIT_DEFAULTS, visible: true, viewport: { innerWidth: 400, innerHeight: 300, dpr: 1 }, theme: 'light' };
  const warmed = await glue.warmForSnapshot({ type: 'warm', config, sandboxBundle }, module, SEED_SCRIPT).catch((e: Error) => {
    throw new Error(failure || e.message);
  });
  zeroFreeBlocks((warmed.QuickJS as any).module, warmed.memory);
  const bytes = new Uint8Array(warmed.memory.buffer);
  const offsets = dirtyChunks(bytes);
  // neighbouring chunks go as one run: a copy then makes a few hundred writes instead of a thousand
  const runs: number[] = [];
  for (const off of offsets) {
    if (runs.length && runs[runs.length - 2] + runs[runs.length - 1] === off) runs[runs.length - 1] += CHUNK;
    else runs.push(off, CHUNK);
  }
  const data = new Uint8Array(offsets.length * CHUNK);
  for (let i = 0, at = 0; i < runs.length; at += runs[i + 1], i += 2) data.set(bytes.subarray(runs[i], runs[i] + runs[i + 1]), at);
  const pages = warmed.memory.buffer.byteLength / WASM_PAGE_BYTES;
  // what a fresh instance leaves in memory is the same every time (its data segments, its constructors): two must agree
  const fresh = await Promise.all([0, 1].map(() => instantiate(module, pages, pages).then(({ memory }) => dirtyChunks(new Uint8Array(memory.buffer)))));
  if (fresh[0].join() !== fresh[1].join()) throw new Error('fresh QuickJS instances differ');
  const kept = new Set(offsets);
  const snapshot: Snapshot = {
    pages,
    runs: Int32Array.from(runs),
    data,
    clear: Int32Array.from(fresh[0].filter((off) => !kept.has(off))),
    // the pointers the wrappers keep to themselves
    rt: (warmed.rt as any).rt.value,
    ctx: (warmed.vm as any).ctx.value,
    dispatch: warmed.dispatch.value,
    hostRefsNext: (warmed.rt as any).hostRefs.nextId,
    pending,
  };
  glue.destroy();
  return snapshot;
}

/**
 * Writes the snapshot into a fresh instance's Memory and wraps the runtime and the context it holds (a copy makes no
 * new ones). `suspender`: the instance's host calls can wait (suspend.ts, the `worker` transport).
 */
export function restoreVM(QuickJS: QuickJSWASMModule, memory: WebAssembly.Memory, snapshot: Snapshot, memoryLimitBytes: number, suspender?: Suspender): RestoredVM {
  // The instance initialised its data and ran its constructors in this Memory; the snapshot is that state, moved on.
  const view = new Uint8Array(memory.buffer);
  const { runs, data, clear } = snapshot;
  for (let i = 0; i < clear.length; i++) view.fill(0, clear[i], clear[i] + CHUNK);
  for (let i = 0, at = 0; i < runs.length; at += runs[i + 1], i += 2) view.set(data.subarray(at, at + runs[i + 1]), runs[i]);

  // The runtime and the context exist in the copied memory already: wrap them instead of creating new ones.
  const q = QuickJS as any;
  const rt = new QuickJSRuntime({
    module: q.module,
    callbacks: q.callbacks,
    ffi: q.ffi,
    rt: new Lifetime(snapshot.rt, undefined, (ptr: number) => {
      q.ffi.QTS_FreeRuntime(ptr);
      q.callbacks.deleteRuntime(ptr);
    }),
  } as any);
  const vm = rt.newContext({ contextPointer: snapshot.ctx as any });
  const dispatch = (vm as any).memory.heapValueHandle(snapshot.dispatch);
  return {
    rt,
    vm,
    dispatch,
    memoryLimitBytes,
    pending: snapshot.pending,
    memory,
    suspender,
    bindHost(host, binary) {
      // the snapshot's host functions carry the reference ids its runtime gave them, in this order
      const refs = (rt as any).hostRefs;
      refs.put(host);
      refs.put(binary);
      if (refs.nextId !== snapshot.hostRefsNext) throw new Error('the copy registered its host functions under other ids than the snapshot');
    },
  };
}
