// Denoise every .wav of <in_dir> into <out_dir> with the shipped RnnoiseDenoiser,
// a given RNNoise wasm build and model weights. Input must be 48 kHz mono.
// usage: node --no-warnings run_rnnoise.mjs <wasm> <weights> <in_dir> <out_dir>
import {readFileSync, readdirSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {readWav, writeWav} from './wav.mjs';

const SRC = new URL('../../src/lib/calls/noiseSuppression/rnnoiseDenoiser.ts', import.meta.url);
const {default: RnnoiseDenoiser, RNNOISE_FRAME_SIZE: FRAME} = await import(SRC.href);

const [wasmPath, weightsPath, inDir, outDir] = process.argv.slice(2);
const module = new WebAssembly.Module(readFileSync(wasmPath));
const weightsFile = readFileSync(weightsPath);
const weights = weightsFile.buffer.slice(weightsFile.byteOffset, weightsFile.byteOffset + weightsFile.byteLength);
mkdirSync(outDir, {recursive: true});
let busy = 0, frames = 0;
for(const name of readdirSync(inDir).filter((n) => n.endsWith('.wav')).sort()) {
  const {samples, rate} = readWav(join(inDir, name));
  if(rate !== 48000) throw new Error(`${name}: ${rate} Hz`);
  const denoiser = new RnnoiseDenoiser(module, weights);
  const count = Math.ceil(samples.length / FRAME);
  const padded = new Float32Array(count * FRAME); padded.set(samples);
  const out = new Float32Array(count * FRAME);
  const t = performance.now();
  for(let i = 0; i < count; ++i) {
    denoiser.processFrame(padded.subarray(i * FRAME, (i + 1) * FRAME), out.subarray(i * FRAME, (i + 1) * FRAME));
  }
  busy += performance.now() - t; frames += count;
  denoiser.destroy();
  writeWav(join(outDir, name), out.subarray(0, samples.length), rate);
}
console.log(`${wasmPath.split('/').pop()}: ${frames} frames, ${(busy / frames * 1000).toFixed(1)} us/frame, realtime x${(frames * 10 / busy).toFixed(0)}`);
