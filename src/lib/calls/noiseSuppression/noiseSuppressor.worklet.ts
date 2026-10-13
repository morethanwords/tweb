/**
 * The AudioWorklet half of the call noise suppressor (noiseSuppression.ts):
 * mono 48 kHz in, RNNoise in 10 ms frames, mono out.
 *
 * The render quantum (128 samples) does not divide the frame (480), so the
 * output runs FRAME - gcd(FRAME, quantum) samples behind the input — the
 * least delay at which it never runs dry (448 samples, 9.3 ms, on top of
 * RNNoise's own 20 ms).
 *
 * It watches its own cost: each second it reports the share of real time the
 * frames took. Once that stays above the overload share for the given number
 * of reports, it passes the microphone through at the same delay for a while
 * and then tries again, waiting twice as long after each overload — a load
 * spike costs a few seconds of denoising, a machine too slow for it keeps a
 * clean, if noisy, voice. The worklet scope has no `performance`, so the
 * clock is Date.now(): its milliseconds average out over a second of frames.
 */
import RnnoiseDenoiser, {RNNOISE_FRAME_SIZE as FRAME} from '@lib/calls/noiseSuppression/rnnoiseDenoiser';
import {
  NOISE_SUPPRESSOR_PROCESSOR,
  NoiseSuppressorCommand,
  NoiseSuppressorOptions,
  NoiseSuppressorReport
} from '@lib/calls/noiseSuppression/protocol';

// AudioWorkletGlobalScope, which TypeScript's DOM library does not describe.
declare class AudioWorkletProcessor {
  public readonly port: MessagePort;
}
declare function registerProcessor(
  name: string,
  processor: new (options: AudioWorkletNodeOptions) => AudioWorkletProcessor
): void;

const FRAME_MS = 10;
const FRAMES_PER_SECOND = 1000 / FRAME_MS;
// Holds the delay, a frame and a quantum.
const RING_SIZE = 2048;
const RING_MASK = RING_SIZE - 1;

const now = typeof(performance) === 'object' ? () => performance.now() : () => Date.now();

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

class NoiseSuppressorProcessor extends AudioWorkletProcessor {
  private denoiser: RnnoiseDenoiser;
  private options: NoiseSuppressorOptions;
  private frameInput = new Float32Array(FRAME);
  private frameOutput = new Float32Array(FRAME);
  private frameFill = 0;
  private ring = new Float32Array(RING_SIZE);
  private readIndex = 0;
  private writeIndex = -1;
  private busy = 0;
  private voice = 0;
  private frames = 0;
  private overloadedReports = 0;
  /** Frames left to pass through before denoising again; 0 while denoising. */
  private bypassFrames = 0;
  private retrySeconds: number;
  private stopped = false;

  constructor(options: AudioWorkletNodeOptions) {
    super();
    this.options = options.processorOptions;
    this.retrySeconds = this.options.retrySeconds;
    try {
      this.denoiser = new RnnoiseDenoiser(new WebAssembly.Module(this.options.wasm), this.options.weights);
      this.post({type: 'ready'});
    } catch(err) {
      this.post({type: 'bypass', reason: 'error', error: String(err)});
    }

    this.port.onmessage = (event: MessageEvent<NoiseSuppressorCommand>) => {
      if(event.data.type === 'stop') {
        this.stopped = true;
        this.denoiser?.destroy();
        this.denoiser = undefined;
      }
    };
  }

  public process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    if(this.stopped) {
      return false;
    }

    // Silent when nothing feeds the node: a stopped or not yet started source.
    const input = inputs[0][0];
    const output = outputs[0][0];
    const quantum = output.length;
    if(this.writeIndex === -1) {
      this.writeIndex = FRAME - gcd(FRAME, quantum);
    }

    for(let i = 0; i < quantum; ++i) {
      this.frameInput[this.frameFill++] = input ? input[i] : 0;
      if(this.frameFill === FRAME) {
        this.flushFrame();
        this.frameFill = 0;
      }
    }

    const {ring} = this;
    for(let i = 0; i < quantum; ++i) {
      output[i] = ring[this.readIndex];
      this.readIndex = (this.readIndex + 1) & RING_MASK;
    }

    return true;
  }

  private flushFrame() {
    const frame = this.denoise(this.frameInput);
    const {ring} = this;
    for(let i = 0; i < FRAME; ++i) {
      ring[this.writeIndex] = frame[i];
      this.writeIndex = (this.writeIndex + 1) & RING_MASK;
    }
  }

  /** The frame denoised, or the input itself while RNNoise is off. */
  private denoise(input: Float32Array) {
    if(!this.denoiser) {
      return input;
    }

    try {
      if(this.bypassFrames && !--this.bypassFrames) {
        this.denoiser.reset();
        this.post({type: 'resume'});
      }

      if(this.bypassFrames) {
        return input;
      }

      const startedAt = now();
      this.voice += this.denoiser.processFrame(input, this.frameOutput);
      this.busy += now() - startedAt;
    } catch(err) {
      // A trap leaves RNNoise in no state to go on, and an exception out of
      // process() would silence the node: the microphone passes through for good.
      this.denoiser = undefined;
      this.post({type: 'bypass', reason: 'error', error: String(err)});
      return input;
    }

    if(++this.frames === FRAMES_PER_SECOND) {
      this.report();
    }

    return this.frameOutput;
  }

  private report() {
    const load = this.busy / (this.frames * FRAME_MS);
    this.post({type: 'stats', load, voice: this.voice / this.frames});
    this.busy = this.voice = this.frames = 0;

    this.overloadedReports = load > this.options.overloadShare ? this.overloadedReports + 1 : 0;
    if(this.overloadedReports >= this.options.overloadReports) {
      this.overloadedReports = 0;
      this.bypassFrames = this.retrySeconds * FRAMES_PER_SECOND;
      this.post({type: 'bypass', reason: 'overload', load, retrySeconds: this.retrySeconds});
      this.retrySeconds = Math.min(this.retrySeconds * 2, this.options.maxRetrySeconds);
    }
  }

  private post(report: NoiseSuppressorReport) {
    this.port.postMessage(report);
  }
}

registerProcessor(NOISE_SUPPRESSOR_PROCESSOR, NoiseSuppressorProcessor);
