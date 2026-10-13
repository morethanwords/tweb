/**
 * What the call noise suppressor (noiseSuppression.ts) and its AudioWorklet
 * (noiseSuppressor.worklet.ts) say to each other. Types and constants only:
 * the worklet bundle must not pull in anything else.
 */
export const NOISE_SUPPRESSOR_PROCESSOR = 'tweb-noise-suppressor';

export type NoiseSuppressorOptions = {
  /** The RNNoise build to run (src/vendor/rnnoise), compiled in the worklet... */
  wasm: ArrayBuffer,
  /** ...and the model it runs, an RNNoise weight blob. */
  weights: ArrayBuffer,
  /** Share of real time the frames may take before it counts as overload... */
  overloadShare: number,
  /** ...and for how many one-second reports in a row before it backs off. */
  overloadReports: number,
  /** How long the first back-off lasts; each next one twice as long... */
  retrySeconds: number,
  /** ...up to this. */
  maxRetrySeconds: number
};

export type NoiseSuppressorReport = {
  /** RNNoise is running; sent once, as the processor starts. */
  type: 'ready'
} | {
  type: 'stats',
  /** Share of real time spent denoising over the last second. */
  load: number,
  /** Mean RNNoise voice probability over the last second. */
  voice: number
} | {
  /**
   * Passes the microphone through: for a while after an overload, for good
   * after an error — in place of 'ready' when RNNoise does not start.
   */
  type: 'bypass',
  reason: 'overload' | 'error',
  load?: number,
  retrySeconds?: number,
  error?: string
} | {
  /** Denoising again after an overload back-off. */
  type: 'resume'
};

export type NoiseSuppressorCommand = {
  type: 'stop'
};
