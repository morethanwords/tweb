/*
 * The call noise suppressor's AudioWorklet, driven quantum by quantum with
 * the vendored RNNoise builds: what it does to noise and to voice, the delay
 * it adds, its load reports, and the CPU watchdog that turns it into a plain
 * delay line on a machine too slow for it.
 */
import {createHash} from 'crypto';
import {readFileSync} from 'fs';
import {resolve} from 'path';
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import RnnoiseDenoiser from '@lib/calls/noiseSuppression/rnnoiseDenoiser';
import {NoiseSuppressorOptions, NoiseSuppressorReport} from '@lib/calls/noiseSuppression/protocol';
import {levelDb, mixSignals, syntheticSpeech, whiteNoise} from '@/tests/helpers/syntheticVoice';

const VENDOR_PATH = resolve(process.cwd(), 'src/vendor/rnnoise');
const VENDORED = [{
  name: 'rnnoise.wasm',
  sha256: 'c9907ec1372e0a0399778dd3da10d13b00a591d4a7a977e1c32c46a248c69e00'
}, {
  name: 'rnnoise.nosimd.wasm',
  sha256: 'aa22de08296574434e351482fe9d7ccbac01be569be3baf88c4591b42a7ac4c9'
}, {
  name: 'weights.bin',
  sha256: '47edcad7baeffb6442d9bfe8ea3b3ae728b50055c3abca1d69b4e31a806da27d'
}];

const RATE = 48000;
const QUANTUM = 128;
// The worklet's own buffering (480 - gcd(480, 128)) and RNNoise's.
const WORKLET_DELAY = 448;
const RNNOISE_DELAY = 960;

type Processor = {
  port: {postMessage: (report: NoiseSuppressorReport) => void, onmessage?: (event: {data: unknown}) => void},
  process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean
};
let Processor: new (options: AudioWorkletNodeOptions) => Processor;
// What a processor posts while it is being constructed.
let constructionReports: NoiseSuppressorReport[];

beforeAll(async() => {
  vi.stubGlobal('AudioWorkletProcessor', class {
    public port = {postMessage: (report: NoiseSuppressorReport) => constructionReports.push(report)};
  });
  vi.stubGlobal('registerProcessor', (_name: string, processor: typeof Processor) => {
    Processor = processor;
  });
  await import('@lib/calls/noiseSuppression/noiseSuppressor.worklet');
});

afterEach(() => {
  vi.restoreAllMocks();
});

function readVendored(name: string) {
  const bytes = readFileSync(resolve(VENDOR_PATH, name));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function createProcessor(wasm: ArrayBuffer | string = 'rnnoise.wasm') {
  const processorOptions: NoiseSuppressorOptions = {
    wasm: typeof(wasm) === 'string' ? readVendored(wasm) : wasm,
    weights: readVendored('weights.bin'),
    overloadShare: 0.4,
    overloadReports: 3,
    retrySeconds: 30,
    maxRetrySeconds: 60
  };
  const reports: NoiseSuppressorReport[] = constructionReports = [];
  const processor = new Processor({processorOptions});
  processor.port.postMessage = (report) => reports.push(report);
  return {processor, reports};
}

function run(processor: Processor, input: Float32Array) {
  const output = new Float32Array(input.length);
  for(let offset = 0; offset + QUANTUM <= input.length; offset += QUANTUM) {
    const out = new Float32Array(QUANTUM);
    processor.process([[input.subarray(offset, offset + QUANTUM)]], [[out]]);
    output.set(out, offset);
  }
  return output;
}

describe('vendored RNNoise', () => {
  for(const {name, sha256} of VENDORED) {
    it(`${name} is the file README.md describes`, () => {
      expect(createHash('sha256').update(readFileSync(resolve(VENDOR_PATH, name))).digest('hex')).toBe(sha256);
    });
  }

  it('the SIMD kernels denoise exactly as the generic C ones', () => {
    const input = mixSignals(syntheticSpeech(-20), whiteNoise(syntheticSpeech(-20).length, -35));
    const simd = run(createProcessor('rnnoise.wasm').processor, input);
    const generic = run(createProcessor('rnnoise.nosimd.wasm').processor, input);
    expect(simd).toEqual(generic);
  });
});

describe('noise suppressor worklet', () => {
  it('says it is ready once RNNoise runs', () => {
    expect(createProcessor().reports).toEqual([{type: 'ready'}]);
  });

  it('silences noise and keeps the voice', () => {
    const voice = syntheticSpeech(-20);
    const noise = whiteNoise(voice.length, -40);
    const output = run(createProcessor().processor, mixSignals(voice, noise));
    const delay = WORKLET_DELAY + RNNOISE_DELAY;

    // The lead-in second is noise alone: after RNNoise settles it is gone.
    expect(levelDb(output, RATE / 4 + delay, RATE - RATE / 10 + delay)).toBeLessThan(-40 - 25);
    // The syllables come through at their level.
    const from = RATE + RATE / 2;
    const to = voice.length - RATE;
    expect(Math.abs(levelDb(output, from + delay, to + delay) - levelDb(voice, from, to))).toBeLessThan(1.5);
  });

  it('treats a quantum without input as silence', () => {
    const {processor} = createProcessor();
    const output = new Float32Array(QUANTUM).fill(1);
    expect(processor.process([[]], [[output]])).toBe(true);
    expect(output.every((sample) => sample === 0)).toBe(true);
  });

  it('reports its load once a second', () => {
    const {processor, reports} = createProcessor();
    run(processor, whiteNoise(2 * RATE + 4 * QUANTUM, -40));

    const stats = reports.filter((report) => report.type === 'stats');
    expect(stats).toHaveLength(2);
    stats.forEach((report) => {
      expect(report.type === 'stats' && report.load).toBeGreaterThan(0);
      expect(report.type === 'stats' && report.load).toBeLessThan(0.4);
    });
  });

  it('backs off to a plain delay line while frames keep eating 40% of real time', () => {
    const {processor, reports} = createProcessor();
    // Every frame takes 5 ms of its 10.
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (clock += 5));

    run(processor, whiteNoise(3 * RATE + 4 * QUANTUM, -40));
    expect(reports.filter((report) => report.type === 'stats')).toHaveLength(3);
    expect(reports[reports.length - 1]).toEqual({type: 'bypass', reason: 'overload', load: 0.5, retrySeconds: 30});

    // For the next half a minute the microphone comes out as it went in, only later.
    const input = whiteNoise(RATE, -20, 7);
    const output = run(processor, input);
    const start = 2 * RATE / 3;
    for(let i = start; i < start + 1000; ++i) {
      expect(output[i]).toBe(input[i - WORKLET_DELAY]);
    }

    // Then it tries again, and overloaded again backs off for twice as long.
    reports.length = 0;
    run(processor, whiteNoise(29 * RATE, -40));
    expect(reports).toEqual([{type: 'resume'}]);
    run(processor, whiteNoise(3 * RATE, -40));
    expect(reports[reports.length - 1]).toEqual({type: 'bypass', reason: 'overload', load: 0.5, retrySeconds: 60});
  });

  it('keeps denoising through an overload shorter than three seconds', () => {
    const {processor, reports} = createProcessor();
    let clock = 0;
    const slow = vi.spyOn(performance, 'now').mockImplementation(() => (clock += 5));
    run(processor, whiteNoise(2 * RATE + 4 * QUANTUM, -40));
    slow.mockRestore();
    run(processor, whiteNoise(2 * RATE, -40));
    expect(reports.map((report) => report.type)).toEqual(['ready', 'stats', 'stats', 'stats', 'stats']);
  });

  it('stops processing on a stop command', () => {
    const {processor} = createProcessor();
    processor.port.onmessage({data: {type: 'stop'}});
    expect(processor.process([[new Float32Array(QUANTUM)]], [[new Float32Array(QUANTUM)]])).toBe(false);
  });

  it('passes the microphone through when RNNoise cannot start', () => {
    const {processor, reports} = createProcessor(new ArrayBuffer(8));
    expect(reports).toEqual([{type: 'bypass', reason: 'error', error: expect.stringContaining('CompileError')}]);

    const input = whiteNoise(RATE / 2, -20, 3);
    const output = run(processor, input);
    const end = input.length - QUANTUM;
    expect(output.subarray(WORKLET_DELAY, end)).toEqual(input.subarray(0, end - WORKLET_DELAY));
    // No load reports: there is nothing to measure.
    expect(reports).toHaveLength(1);
  });

  it('passes the microphone through for good when RNNoise fails mid-call', () => {
    const {processor, reports} = createProcessor();
    run(processor, whiteNoise(RATE / 2, -40));
    vi.spyOn(RnnoiseDenoiser.prototype, 'processFrame').mockImplementation(() => {
      throw new WebAssembly.RuntimeError('memory access out of bounds');
    });

    // The quantum that hits the trap still comes back, and so does every next one.
    const input = whiteNoise(RATE / 2, -20, 5);
    const output = run(processor, input);
    expect(reports[reports.length - 1]).toEqual({type: 'bypass', reason: 'error', error: expect.stringContaining('out of bounds')});
    const start = RATE / 4;
    for(let i = start; i < start + 1000; ++i) {
      expect(output[i]).toBe(input[i - WORKLET_DELAY]);
    }
    expect(RnnoiseDenoiser.prototype.processFrame).toHaveBeenCalledTimes(1);
  });
});
