/*
 * Browser fixture for e2e/callNoiseSuppression.spec.ts. The microphone is a
 * WebAudio track looping generated syllables over white noise, so the call
 * noise suppressor runs on a known signal in a real browser; the levels of
 * the microphone and of what the call would send are sampled side by side.
 */
import denoiseMicrophone, {getNoiseSuppressionStatus} from '@lib/calls/noiseSuppression/noiseSuppression';
import {mixSignals, syntheticSpeech, SYNTHETIC_VOICE_RATE, whiteNoise} from '@/tests/helpers/syntheticVoice';

const VOICE_LEVEL_DB = -20;
const NOISE_LEVEL_DB = -40;
const WINDOW_MS = 50;

type Meter = () => number;

function createMeter(context: AudioContext, track: MediaStreamTrack): Meter {
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  context.createMediaStreamSource(new MediaStream([track])).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  return () => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    samples.forEach((sample) => sum += sample * sample);
    return 10 * Math.log10(sum / samples.length + 1e-20);
  };
}

let microphone: MediaStreamTrack;
let sent: MediaStreamTrack;
let meters: {microphone: Meter, sent: Meter};
let sentEnded = false;
let microphoneMuted = false;
const sentEvents: string[] = [];

const fixture = {
  async start() {
    const playback = new AudioContext({sampleRate: SYNTHETIC_VOICE_RATE});
    const voice = syntheticSpeech(VOICE_LEVEL_DB);
    const signal = mixSignals(voice, whiteNoise(voice.length, NOISE_LEVEL_DB));
    const buffer = playback.createBuffer(1, signal.length, SYNTHETIC_VOICE_RATE);
    buffer.copyToChannel(signal, 0);
    const source = playback.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const destination = playback.createMediaStreamDestination();
    source.connect(destination);
    source.start();
    await playback.resume();

    microphone = destination.stream.getAudioTracks()[0];
    // A generated track is never muted: this one is when the test says so.
    Object.defineProperty(microphone, 'muted', {configurable: true, get: () => microphoneMuted});
    const stream = await denoiseMicrophone(new MediaStream([microphone]));
    sent = stream.getAudioTracks()[0];
    sent.addEventListener('ended', () => sentEnded = true);
    ['mute', 'unmute'].forEach((type) => sent.addEventListener(type, () => sentEvents.push(type)));

    const listener = new AudioContext();
    await listener.resume();
    meters = {microphone: createMeter(listener, microphone), sent: createMeter(listener, sent)};
    return {denoised: sent !== microphone};
  },

  /** Levels (dBFS) of both tracks every 50 ms over the given time. */
  async sample(ms: number) {
    const levels = {microphone: [] as number[], sent: [] as number[]};
    for(let elapsed = 0; elapsed < ms; elapsed += WINDOW_MS) {
      await new Promise((resolve) => setTimeout(resolve, WINDOW_MS));
      levels.microphone.push(meters.microphone());
      levels.sent.push(meters.sent());
    }

    return levels;
  },

  setEnabled(enabled: boolean) {
    sent.enabled = enabled;
  },

  stopSent() {
    sent.stop();
  },

  /** What the system does to a capture it stops feeding (an audio interruption) and resumes. */
  muteMicrophone(muted: boolean) {
    microphoneMuted = muted;
    microphone.dispatchEvent(new Event(muted ? 'mute' : 'unmute'));
  },

  /** What an unplugged device does to its track. */
  endMicrophone() {
    microphone.dispatchEvent(new Event('ended'));
  },

  state() {
    return {
      microphone: microphone.readyState,
      sent: sent.readyState,
      sentEnded,
      sentMuted: sent.muted,
      sentEvents,
      status: getNoiseSuppressionStatus(sent)
    };
  }
};

declare global {
  interface Window {
    callNoiseSuppression: typeof fixture
  }
}

window.callNoiseSuppression = fixture;
