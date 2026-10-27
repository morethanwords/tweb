# RNNoise WebAssembly

[RNNoise](https://gitlab.xiph.org/xiph/rnnoise) 0.2 — the
[release tarball](https://github.com/xiph/rnnoise/releases/tag/v0.2) with its
model — made by `scripts/vendor-rnnoise/build.sh` into:

- `rnnoise.wasm`, `rnnoise.nosimd.wasm` — RNNoise's code, compiled to
  WebAssembly without a model;
- `weights.bin` — the release's model as an RNNoise weight blob, which the code
  loads at run time (`rnnoise_model_from_buffer`). Another model of the same
  architecture is a new blob, not a new build.

The license notice is in [`LICENSE`](./LICENSE) (BSD-3-Clause). The calls run it
in an AudioWorklet to denoise the microphone (`src/lib/calls/noiseSuppression`),
everywhere but Safari, which keeps Apple's voice processing alone for now.
tgcalls carries RNNoise as well (`GroupInstanceCustomImpl.cpp`), but in the
native apps it mostly just detects voice in group calls: denoising with it is a
switch, on by default only in Telegram for macOS, off in tdesktop and Android,
and not offered on iOS.

Why 0.2 and not a later model (`scripts/noise-suppression-eval` measures them):

- the models trained after it (2025, `rnnoise_data` and `rnnoise_data_little`
  at upstream master) remove a little more of sudden noises like typing, but
  cut the quiet edges of words even with no noise at all: PESQ 2.8 against 3.9
  for 0.2 on clean speech. Their training clears the target wherever an energy
  VAD hears no speech;
- the 2025 "little" model fine-tuned with that target kept around detected
  speech and with cutting speech costing more than leaving noise (3000 steps on
  CPU) got clean speech back to PESQ 3.5 and kept the gain on typing: a little
  ahead of 0.2 on speech mixed with MS-SNSD noises (PESQ 1.83 against 1.77),
  behind it on clean speech and on VoiceBank+DEMAND (2.14 against 2.43) —
  whose DEMAND noise 0.2 was trained on, so that set favours 0.2;
- trained from scratch on a GPU with all of xiph's speech data: the 2025
  recipe with that target stays behind 0.2 on the mixes whatever the loss
  (0.2's or 2025's, with or without the extra cost of cutting speech) or the
  SNR range of its training mixes; 0.2's own recipe with the 2025 foreground
  noise added keeps clean speech as well as 0.2 (PESQ 3.93) and removes more
  typing, but stays a little behind on the mixes (1.72 against 1.77).

RNNoise's portable C path multiplies its int8 weights one float at a time, which
in WebAssembly costs about 0.65 ms per 10 ms frame. The SIMD build swaps those two
kernels (`cgemv8x4`, `sparse_cgemv8x4`) for `i32x4.dot_i16x8_s` ones that sum
the same products exactly in integers
(`scripts/vendor-rnnoise/vec_wasm_simd.h`): about 0.16 ms per frame, with output
bit-identical to the portable build, which `src/tests/noiseSuppressorWorklet.test.ts`
asserts. Browsers without WebAssembly SIMD (Chrome < 91, Firefox < 89,
Safari < 16.4) get the portable build.

Both builds export `rnnoise_model_from_buffer`, `rnnoise_create`,
`rnnoise_destroy`, `rnnoise_process_frame`, `rnnoise_get_frame_size`, `malloc`
and `free`, import nothing, and need only bulk-memory, sign-extension and
non-trapping float-to-int beyond the MVP — what
`IS_WEB_ASSEMBLY_BASELINE_SUPPORTED` probes.

Checksums:

| artifact | sha256 |
|---|---|
| `rnnoise.wasm` | `c9907ec1372e0a0399778dd3da10d13b00a591d4a7a977e1c32c46a248c69e00` |
| `rnnoise.nosimd.wasm` | `aa22de08296574434e351482fe9d7ccbac01be569be3baf88c4591b42a7ac4c9` |
| `weights.bin` | `47edcad7baeffb6442d9bfe8ea3b3ae728b50055c3abca1d69b4e31a806da27d` |

To reproduce them (Linux x86_64 with gcc; downloads the pinned RNNoise release
and wasi-sdk 34 and checks both against their sha256):

```bash
sh scripts/vendor-rnnoise/build.sh
```
