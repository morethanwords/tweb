/**
 * RNNoise (BSD-3-Clause, the build in src/vendor/rnnoise) driven frame by
 * frame. One instance denoises one mono 48 kHz stream in 10 ms frames and
 * hands back RNNoise's voice-activity probability for each.
 *
 * The WebAssembly carries the code; the model comes as a weight blob
 * (rnnoise_model_from_buffer), so a retrained model needs no rebuild.
 *
 * No imports and nothing a worklet scope lacks: the AudioWorklet runs it, and
 * the offline evaluation of the same binary imports this file as is.
 */
export const RNNOISE_SAMPLE_RATE = 48000;
export const RNNOISE_FRAME_SIZE = 480;

// RNNoise expects 16-bit sample values held in floats.
const SAMPLE_SCALE = 32768;

type RnnoiseExports = {
  memory: WebAssembly.Memory,
  _initialize: () => void,
  malloc: (size: number) => number,
  free: (pointer: number) => void,
  rnnoise_get_frame_size: () => number,
  rnnoise_model_from_buffer: (pointer: number, length: number) => number,
  rnnoise_create: (model: number) => number,
  rnnoise_destroy: (state: number) => void,
  rnnoise_process_frame: (state: number, output: number, input: number) => number
};

export default class RnnoiseDenoiser {
  private exports: RnnoiseExports;
  private weightsPointer: number;
  private model: number;
  private state: number;
  private inputPointer: number;
  private outputPointer: number;
  private heap: Float32Array;

  constructor(module: WebAssembly.Module, weights: ArrayBuffer) {
    const exports = new WebAssembly.Instance(module, {}).exports as unknown as RnnoiseExports;
    exports._initialize();
    if(exports.rnnoise_get_frame_size() !== RNNOISE_FRAME_SIZE) {
      throw new Error('unexpected RNNoise frame size');
    }

    this.exports = exports;
    // The model points into the blob for as long as it lives.
    this.weightsPointer = exports.malloc(weights.byteLength);
    if(!this.weightsPointer) {
      throw new Error('RNNoise could not allocate its weights');
    }

    new Uint8Array(exports.memory.buffer, this.weightsPointer, weights.byteLength).set(new Uint8Array(weights));
    this.model = exports.rnnoise_model_from_buffer(this.weightsPointer, weights.byteLength);

    const bytes = RNNOISE_FRAME_SIZE * Float32Array.BYTES_PER_ELEMENT;
    this.state = exports.rnnoise_create(this.model);
    this.inputPointer = exports.malloc(bytes);
    this.outputPointer = exports.malloc(bytes);
    if(!this.state || !this.inputPointer || !this.outputPointer) {
      throw new Error('RNNoise could not load its model');
    }
  }

  /** Denoises one frame of RNNOISE_FRAME_SIZE samples in [-1, 1]. */
  public processFrame(input: Float32Array, output: Float32Array): number {
    const {exports} = this;
    // An allocation that grew the memory detached the previous view.
    if(this.heap?.buffer !== exports.memory.buffer) {
      this.heap = new Float32Array(exports.memory.buffer);
    }

    const {heap} = this;
    const inputOffset = this.inputPointer >> 2;
    const outputOffset = this.outputPointer >> 2;
    for(let i = 0; i < RNNOISE_FRAME_SIZE; ++i) {
      heap[inputOffset + i] = input[i] * SAMPLE_SCALE;
    }

    const voiceProbability = exports.rnnoise_process_frame(this.state, this.outputPointer, this.inputPointer);
    for(let i = 0; i < RNNOISE_FRAME_SIZE; ++i) {
      output[i] = heap[outputOffset + i] / SAMPLE_SCALE;
    }

    return voiceProbability;
  }

  /** Forgets everything heard so far, as a new instance would. */
  public reset() {
    const {exports} = this;
    exports.rnnoise_destroy(this.state);
    this.state = exports.rnnoise_create(this.model);
    if(!this.state) {
      throw new Error('RNNoise could not start over');
    }
  }

  public destroy() {
    const {exports} = this;
    if(!this.state) {
      return;
    }

    exports.rnnoise_destroy(this.state);
    // A model over a buffer is a bare allocation: rnnoise_model_free would
    // drag stdio (it closes model files) into the build for nothing.
    exports.free(this.model);
    exports.free(this.weightsPointer);
    exports.free(this.inputPointer);
    exports.free(this.outputPointer);
    this.state = this.model = this.weightsPointer = this.inputPointer = this.outputPointer = 0;
  }
}
