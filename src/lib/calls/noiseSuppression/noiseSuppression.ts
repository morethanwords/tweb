/**
 * Noise suppression for the microphone of a call: RNNoise
 * (src/vendor/rnnoise) in an AudioWorklet between the capture and what the
 * call sends. tgcalls carries the same library for group calls
 * (GroupInstanceCustomImpl.cpp, AudioCapturePostProcessor), but runs it as a
 * voice-activity detector: its denoising is a switch, on by default only in
 * Telegram for macOS, off in tdesktop and Android, and absent on iOS, where
 * the system's voice processing does the job. Of the browsers only Safari has
 * that path: its microphone with echo cancellation goes through Apple's voice
 * processing. RNNoise on top of it is not measured yet, so Safari (and every
 * browser on iOS, all of them WebKit) keeps it alone for now, and the switch
 * there drives the browser's own constraint, as it did before RNNoise.
 *
 * denoiseMicrophone() swaps the microphone track of a freshly captured
 * stream for the denoised one. That track stands in for the microphone
 * wherever the call keeps it: `enabled` mutes it, stopping it releases the
 * microphone, a microphone that stops delivering reads as `muted` on it and
 * an unplugged device ends it — so no call path needs to know which of the
 * two it holds. getCallStream() decides when to use it, and what
 * to do when it fails.
 */
import {IS_SAFARI} from '@environment/userAgent';
import IS_WEB_ASSEMBLY_BASELINE_SUPPORTED from '@environment/webAssemblyBaselineSupport';
import IS_WEB_ASSEMBLY_SIMD_SUPPORTED from '@environment/webAssemblySimdSupport';
import withTimeout from '@helpers/schedulers/withTimeout';
import stopTrack from '@lib/calls/helpers/stopTrack';
import {RNNOISE_SAMPLE_RATE} from '@lib/calls/noiseSuppression/rnnoiseDenoiser';
import {
  NOISE_SUPPRESSOR_PROCESSOR,
  NoiseSuppressorCommand,
  NoiseSuppressorOptions,
  NoiseSuppressorReport
} from '@lib/calls/noiseSuppression/protocol';
import {logger} from '@lib/logger';
import {appSettings} from '@stores/appSettings';
import rnnoiseWasmUrl from '@vendor/rnnoise/rnnoise.wasm?url';
import rnnoiseNoSimdWasmUrl from '@vendor/rnnoise/rnnoise.nosimd.wasm?url';
import rnnoiseWeightsUrl from '@vendor/rnnoise/weights.bin?url';
import noiseSuppressorWorkletUrl from '@lib/calls/noiseSuppression/noiseSuppressor.worklet.ts?worker&url';

// Past 40% of real time a frame no longer fits a render quantum on a busy
// machine; three seconds of that and the microphone goes out undenoised for
// half a minute, then for twice as long after each next overload, up to 4 min.
const OVERLOAD_SHARE = 0.4;
const OVERLOAD_REPORTS = 3;
const RETRY_SECONDS = 30;
const MAX_RETRY_SECONDS = 240;
// An AudioContext the page may not start yet stays suspended for good.
const RESUME_TIMEOUT_MS = 1000;
// The first call fetches the model (1.4 MB): past this it starts on the
// browser's suppression instead, and the next capture finds the model loaded.
const LOAD_TIMEOUT_MS = 3000;
// The worklet compiles RNNoise as it starts.
const START_TIMEOUT_MS = 2000;

/** Whether calls can denoise with RNNoise here: not in Safari (see above). */
export const IS_RNNOISE_SUPPORTED = !IS_SAFARI &&
  typeof(AudioWorkletNode) !== 'undefined' &&
  typeof(MediaStreamAudioDestinationNode) !== 'undefined' &&
  IS_WEB_ASSEMBLY_BASELINE_SUPPORTED;

export type NoiseSuppressionStatus = {
  engine: 'rnnoise' | 'rnnoise-nosimd',
  /** Mean share of real time spent denoising, over every report so far. */
  meanLoad: number,
  peakLoad: number,
  reports: number,
  /** Passing the microphone through right now, and why. */
  bypassed?: 'overload' | 'error',
  overloads: number
};

const log = logger('NOISE-SUPPRESSION');
const statuses = new WeakMap<MediaStreamTrack, NoiseSuppressionStatus>();
let assetsPromise: Promise<[wasm: ArrayBuffer, weights: ArrayBuffer]>;
let assetsLoaded = false;
// Why RNNoise cannot run in this tab, once a capture found out for good.
let unavailable: string;

/** RNNoise's model is still on its way: `loaded` settles once it is in. */
export class RnnoiseLoadingError extends Error {
  constructor(public loaded: Promise<unknown>) {
    super('RNNoise took too long to load');
  }
}

/** The "Noise suppression" switch of the call settings. */
export function isCallNoiseSuppressionEnabled() {
  return appSettings.callDevices?.noiseSuppression ?? true;
}

/** Whether calls denoise the microphone with RNNoise rather than the browser. */
export function shouldUseRnnoise() {
  return IS_RNNOISE_SUPPORTED && !unavailable && isCallNoiseSuppressionEnabled();
}

/**
 * The browser's own `noiseSuppression` constraint: off under RNNoise, which
 * does better on its own than after it (scripts/noise-suppression-eval) —
 * the browser's suppression leaves its artifacts for RNNoise to work on.
 */
export function shouldUseBrowserNoiseSuppression() {
  return isCallNoiseSuppressionEnabled() && !shouldUseRnnoise();
}

/** How the track denoises, if it is one of ours; live, for call logs. */
export function getNoiseSuppressionStatus(track: MediaStreamTrack) {
  return statuses.get(track);
}

/** One call-log line: "noise suppression: rnnoise, load 1.2% (peak 3.0%), overloads 1". */
export function describeNoiseSuppressionStatus(status: NoiseSuppressionStatus) {
  const percent = (share: number) => (share * 100).toFixed(1) + '%';
  return `noise suppression: ${status.engine}, load ${percent(status.meanLoad)} (peak ${percent(status.peakLoad)})` +
    (status.overloads ? `, overloads ${status.overloads}` : '') +
    (status.bypassed ? `, bypassed: ${status.bypassed}` : '');
}

async function fetchAsset(url: string) {
  const response = await fetch(url);
  if(!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }

  return response.arrayBuffer();
}

function loadAssets() {
  return assetsPromise ??= Promise.all([
    fetchAsset(IS_WEB_ASSEMBLY_SIMD_SUPPORTED ? rnnoiseWasmUrl : rnnoiseNoSimdWasmUrl),
    fetchAsset(rnnoiseWeightsUrl)
  ]).then((assets) => {
    assetsLoaded = true;
    return assets;
  }, (err) => {
    assetsPromise = undefined;
    throw err;
  });
}

/**
 * Starts loading RNNoise for a microphone a call is about to take — as an
 * incoming call or invitation rings, as the user starts or joins one — so the
 * first capture of the tab need not wait for the model. Nothing for a tab that
 * will not run it.
 */
export function preloadNoiseSuppression() {
  if(shouldUseRnnoise()) {
    loadAssets().catch((err) => log.warn('preloading RNNoise failed', err));
  }
}

function giveUp(reason: string) {
  log.warn('RNNoise is unavailable in this tab', reason);
  unavailable = reason;
}

async function startContext(context: AudioContext) {
  if(context.state !== 'running') {
    await withTimeout(context.resume(), RESUME_TIMEOUT_MS);
  }

  if(context.state !== 'running') {
    throw new Error(`AudioContext is ${context.state}`);
  }
}

async function createDenoisedTrack(microphone: MediaStreamTrack) {
  const context = new AudioContext({sampleRate: RNNOISE_SAMPLE_RATE, latencyHint: 'interactive'});
  try {
    let source: MediaStreamAudioSourceNode;
    try {
      source = context.createMediaStreamSource(new MediaStream([microphone]));
    } catch(err) {
      // Firefox refuses a microphone whose rate differs from the context's.
      giveUp(String(err));
      throw err;
    }

    const assets = await withTimeout(Promise.all([
      loadAssets(),
      context.audioWorklet.addModule(noiseSuppressorWorkletUrl)
    ]), LOAD_TIMEOUT_MS);
    if(!assets) {
      // Only the model is worth waiting for: a worklet slow to start with it
      // in place would just fall back again.
      throw assetsLoaded ? new Error('the noise suppressor took too long to start') : new RnnoiseLoadingError(loadAssets());
    }

    const [[wasm, weights]] = assets;
    const options: NoiseSuppressorOptions = {
      wasm,
      weights,
      overloadShare: OVERLOAD_SHARE,
      overloadReports: OVERLOAD_REPORTS,
      retrySeconds: RETRY_SECONDS,
      maxRetrySeconds: MAX_RETRY_SECONDS
    };
    const node = new AudioWorkletNode(context, NOISE_SUPPRESSOR_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
      outputChannelCount: [1],
      processorOptions: options
    });
    const destination = context.createMediaStreamDestination();
    destination.channelCount = 1;
    const track = destination.stream.getAudioTracks()[0];
    const status: NoiseSuppressionStatus = {
      engine: IS_WEB_ASSEMBLY_SIMD_SUPPORTED ? 'rnnoise' : 'rnnoise-nosimd',
      meanLoad: 0,
      peakLoad: 0,
      reports: 0,
      overloads: 0
    };

    // Settles once the worklet has RNNoise running, or could not get it to.
    let started = false;
    let onStart: (error?: string) => void;
    const start = new Promise<void>((resolve, reject) => {
      onStart = (error) => error ? reject(new Error(error)) : resolve();
    });
    // Awaited only once the context runs: no unhandled rejection before that.
    start.catch(() => {});
    node.port.onmessage = (event: MessageEvent<NoiseSuppressorReport>) => {
      const report = event.data;
      if(report.type === 'ready') {
        started = true;
        onStart();
      } else if(report.type === 'stats') {
        status.meanLoad += (report.load - status.meanLoad) / ++status.reports;
        status.peakLoad = Math.max(status.peakLoad, report.load);
      } else if(report.type === 'bypass') {
        status.bypassed = report.reason;
        status.overloads += +(report.reason === 'overload');
        log.warn('passing the microphone through', report);
        if(report.reason === 'error' && !started) {
          // RNNoise does not compile or load here, and will not next time.
          const error = report.error || 'RNNoise did not start';
          giveUp(error);
          onStart(error);
        }
      } else {
        status.bypassed = undefined;
        log('denoising again');
      }
    };
    // What the processor throws outside its own guard leaves the node silent.
    node.onprocessorerror = (event) => {
      status.bypassed = 'error';
      log.error('the noise suppressor failed', event);
      onStart('the noise suppressor failed');
    };

    source.connect(node).connect(destination);
    await startContext(context);
    if(!await withTimeout(start.then(() => true), START_TIMEOUT_MS)) {
      throw new Error('RNNoise took too long to start');
    }

    statuses.set(track, status);
    let released = false;
    // A context the system suspends (an audio interruption, a lost output
    // device) silences what the call sends: it is restarted at once.
    context.onstatechange = () => {
      if(!released && context.state !== 'running' && context.state !== 'closed') {
        log.warn('restarting the audio context', context.state);
        context.resume().catch(() => {});
      }
    };

    // A capture that stops delivering (an audio interruption, the system
    // muting the microphone) is read off the track the call holds.
    Object.defineProperty(track, 'muted', {configurable: true, get: () => microphone.muted});
    const onMicrophoneMute = (event: Event) => track.dispatchEvent(new Event(event.type));
    const onMicrophoneEnded = () => stopTrack(track);
    microphone.addEventListener('mute', onMicrophoneMute);
    microphone.addEventListener('unmute', onMicrophoneMute);
    microphone.addEventListener('ended', onMicrophoneEnded);

    const release = () => {
      if(released) return;
      released = true;
      microphone.removeEventListener('mute', onMicrophoneMute);
      microphone.removeEventListener('unmute', onMicrophoneMute);
      microphone.removeEventListener('ended', onMicrophoneEnded);
      node.port.postMessage({type: 'stop'} satisfies NoiseSuppressorCommand);
      source.disconnect();
      node.disconnect();
      microphone.stop();
      context.close().catch(() => {});
    };

    const stop = track.stop.bind(track);
    track.stop = () => {
      stop();
      release();
    };

    // Muting is the denoised track's business from now on.
    track.enabled = microphone.enabled;
    microphone.enabled = true;
    if(microphone.readyState === 'ended') {
      onMicrophoneEnded();
    }

    return track;
  } catch(err) {
    context.close().catch(() => {});
    throw err;
  }
}

/**
 * The stream with its microphone swapped for a denoised track, which owns the
 * microphone from now on: stopping it releases the microphone. Rejects, the
 * stream untouched, when RNNoise cannot run.
 */
export default async function denoiseMicrophone(stream: MediaStream): Promise<MediaStream> {
  const track = await createDenoisedTrack(stream.getAudioTracks()[0]);
  return new MediaStream([track, ...stream.getVideoTracks()]);
}
