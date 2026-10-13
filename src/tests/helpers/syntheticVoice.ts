/*
 * Deterministic test audio for noise suppression: voiced syllables a speech
 * denoiser keeps, and white noise it removes. Used by the worklet unit test
 * and by the browser fixture of e2e/callNoiseSuppression.spec.ts.
 */
export const SYNTHETIC_VOICE_RATE = 48000;
const RATE = SYNTHETIC_VOICE_RATE;

function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

export function whiteNoise(length: number, levelDb: number, seed = 1) {
  const next = random(seed);
  const amplitude = 10 ** (levelDb / 20) * Math.sqrt(3);
  return Float32Array.from({length}, () => (next() * 2 - 1) * amplitude);
}

// A voiced syllable: a jittered glottal pulse train through three formant
// resonators, the way a vowel is made, under a smooth envelope.
function vowel(seconds: number, pitch: number, formants: [number, number][], seed: number) {
  const next = random(seed);
  const length = Math.round(seconds * RATE);
  let signal = new Float64Array(length);
  let phase = 0;
  for(let i = 0; i < length; ++i) {
    const f0 = pitch * (1 + 0.03 * Math.sin(2 * Math.PI * 5 * i / RATE)) + (next() - 0.5);
    const nextPhase = phase + f0 / RATE;
    signal[i] = Math.floor(nextPhase) > Math.floor(phase) ? 1 : 0;
    phase = nextPhase;
  }

  let previous = 0;
  for(let i = 0; i < length; ++i) {
    previous = signal[i] += 0.97 * previous;
  }

  for(const [frequency, bandwidth] of formants) {
    const r = Math.exp(-Math.PI * bandwidth / RATE);
    const a1 = 2 * r * Math.cos(2 * Math.PI * frequency / RATE);
    const filtered = new Float64Array(length);
    for(let i = 0; i < length; ++i) {
      filtered[i] = (1 - r) * signal[i] + a1 * (filtered[i - 1] || 0) - r * r * (filtered[i - 2] || 0);
    }

    signal = filtered;
  }

  return signal.map((sample, i) => sample * Math.sqrt(Math.sin(Math.PI * i / length)));
}

/**
 * A second of silence, twelve syllables (about 3.8 s) and half a second of
 * silence, at the given RMS level over the voiced part; the length is a
 * multiple of `multipleOf`.
 */
export function syntheticSpeech(levelDb: number, multipleOf = 128) {
  const syllables = [
    vowel(0.25, 120, [[700, 80], [1220, 90], [2600, 120]], 1),
    vowel(0.3, 130, [[300, 60], [2300, 100], [3000, 120]], 2),
    vowel(0.28, 115, [[500, 70], [900, 80], [2400, 120]], 3)
  ];
  const gap = new Float64Array(Math.round(0.08 * RATE));
  const parts: Float64Array[] = [new Float64Array(RATE)];
  for(let i = 0; i < 4; ++i) {
    syllables.forEach((syllable) => parts.push(syllable, gap));
  }
  parts.push(new Float64Array(RATE / 2));

  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Float32Array(Math.ceil(length / multipleOf) * multipleOf);
  let offset = 0;
  parts.forEach((part) => {
    out.set(part, offset);
    offset += part.length;
  });

  const voiced = out.filter((sample) => Math.abs(sample) > 1e-4);
  const rms = Math.sqrt(voiced.reduce((sum, sample) => sum + sample * sample, 0) / voiced.length);
  return out.map((sample) => sample * 10 ** (levelDb / 20) / rms);
}

export function levelDb(signal: Float32Array, from = 0, to = signal.length) {
  let sum = 0;
  for(let i = from; i < to; ++i) {
    sum += signal[i] * signal[i];
  }

  return 10 * Math.log10(sum / (to - from) + 1e-20);
}

export function mixSignals(a: Float32Array, b: Float32Array) {
  return a.map((sample, i) => sample + b[i]);
}
