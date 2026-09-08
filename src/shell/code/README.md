# Isolated TypeScript action

The parent owns the dialog, saved document, outcome transitions and result variable.
`CodeEditor` edits source and explicitly requests semantic validation.
`executeCode` creates one dedicated module Worker for each activation and terminates
it on success, error, cancellation or the 2,000 ms host deadline. The deadline
includes Worker startup and TypeScript compilation; slower devices can receive an
explicit timeout. No result from an aborted activation is accepted.

`compiler.ts` runs TypeScript **6.0.3** `createProgram` with semantic diagnostics,
strict mode and no implicit returns. This is separate from the application's
TypeScript **7.0.2** toolchain. Scoped variable descriptors, rather than sample
values, generate readonly `RoboContext`. The default `run` function receives an
expected return annotation when the author omits one, so unsupported outcome
literals are diagnosed before execution. Sync functions and async functions using
internal promises are supported. Imports and host APIs are not part of this API.

`data` is arbitrary JSON, bounded to 64 KiB. The caller assigns the whole value to
its configured result variable; the code cannot mutate the host context or issue
implicit patches. Returned accessors, functions, cycles, prototype-bearing data,
non-finite numbers, unknown outcomes and excessive nesting fail explicitly.

## Memory and execution proof

Pinned engine: `@jitl/quickjs-wasmfile-release-sync@0.32.0` with
`quickjs-emscripten-core@0.32.0`, upstream
<https://github.com/justjake/quickjs-emscripten>, MIT.
The exact npm WASM SHA256 is
`105c3bed22d457e43e3d1c3c1c6959fda62a8fe06f0fc8a985303c3a2be72232`.
It imports memory as `a.a`; the supplied Memory has **initial = maximum = 512
pages**, exactly 32 MiB. `getWasmMemory()` verifies identity after instantiation.
`memory.grow(1)` throws. No binary patch is used. The hash-verified browser loader is generated with its
external WASM fallback replaced by an error, so bundlers cannot emit a second
unused WASM file. Its original SHA256 is
`3b8e916b3248062be4bbd3281c8d2832f074e6850596fc9951e93b846139ddea`;
the deterministic replacement is checked for exactly one match in the generator.

The QuickJS runtime separately limits its heap to 16 MiB and stack to 256 KiB.
Its interrupt callback enforces a 500 ms deadline over evaluation and pending
promise jobs. A fresh VM and frozen JSON context are used for every call.
The host executes the generated JavaScript only inside QuickJS, never host eval.
Date, random, browser objects, I/O and scheduling APIs are unavailable in that VM.
The surrounding Worker needs its own compiler and monotonic clock to enforce
limits; these are never passed into the VM. The WASM limit does not claim to limit
the TypeScript compiler's host JavaScript heap.

Reproduce the embedded asset after the frozen dependency install:

```sh
node scripts/quickjs-assets.mjs
```

The generator verifies the exact engine hash and memory import before writing its
base64 module. It also embeds the actual TypeScript 6.0.3 ES2020 standard library
declarations without DOM libraries. The Worker embeds these bytes and supplies the compiled WASM module
directly; it does not fetch a WASM URL. The worker installs capability guards before dynamically importing compiler or
engine modules, so chunk initialization is covered by the guard. Violations are
reported to the parent before the worker terminates. Production worker chunks are same-origin
static artifacts under the parent's CSP and resource manifest.

`code.test.ts` exercises the real compiler and exact WASM: new variables and bad
types, readonly context, outcome checking, sync/promise completion, unknown runtime
outcomes, infinite loops, allocation failure, unresolved promises, and unavailable
host capabilities. Browser Worker termination and CSP are verified by the parent's
production-artifact browser gate.

Retained engine/compiler license notices are in `licenses/`.
