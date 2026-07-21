import {createHash} from 'crypto';
import {readdirSync, readFileSync} from 'fs';
import {resolve} from 'path';
import IS_WEB_ASSEMBLY_SIMD_SUPPORTED from '@environment/webAssemblySimdSupport';
import {TLottieFitzModifier, TLottieWasm} from '@lib/lottie/tlottieWasm';

type TLottieTestExports = WebAssembly.Exports & {
  memory: WebAssembly.Memory,
  tlottie_alloc: (length: number) => number,
  tlottie_free: (pointer: number, length: number) => void,
  tlottie_new_with_options: (
    pointer: number,
    length: number,
    fitzModifier: TLottieFitzModifier,
    replacementsPointer: number,
    replacementsLength: number
  ) => number,
  tlottie_drop: (handle: number) => void,
  tlottie_width: (handle: number) => number,
  tlottie_height: (handle: number) => number,
  tlottie_frame_rate: (handle: number) => number,
  tlottie_frame_count: (handle: number) => number,
  tlottie_render: (handle: number, frame: number, width: number, height: number, antialias: number) => number
};

const WASM_PATH = resolve(process.cwd(), 'src/vendor/tlottie/tlottie.wasm');
const ASSETS_PATH = resolve(process.cwd(), 'public/assets/tgs');
const EXPECTED_SHA256 = '1d959e0e5efccd470c1a1ce79bcacc066cfa38499237955b0ec382d00245f8ec';
const wasmBytes = new Uint8Array(readFileSync(WASM_PATH));
const assetNames = readdirSync(ASSETS_PATH).filter((name) => name.endsWith('.json')).sort();
const FITZ_ANIMATION = readFileSync(resolve(ASSETS_PATH, 'hand_stop.json'), 'utf8');
const FITZ_MODIFIERS = [0, 1, 2, 3, 4, 5] as const;
const FITZ_FRAME_HASHES = [
  '8d3e7170552da236483c29e81c101b8567b25abb73fb719aa31ae1493292f3c2',
  '811c9e01e99e4132393691d8c680e838761b9f413ac82706026629affd461d57',
  'a9ba71ce79a4cf3e3c068376deddb88c4f7670b84ff4efbac90843b07b50faca',
  '4de9cffac619436575ba114456ba9b8bde7c88ace6351ee3eb0c9dd054107946',
  '71a21f7a4e867d4701981def97ff1efe1989ba6e966a42633798b65ba2d7f477',
  '7a20581d0a58ca4115c68a1cd1f5c79debdc4c77c67a023725a32fc8970d3420'
];
const GOLDEN_ANIMATION = JSON.stringify({
  v: '5.7.4',
  fr: 30,
  ip: 0,
  op: 2,
  w: 32,
  h: 32,
  layers: [{
    ddd: 0,
    ind: 1,
    ty: 4,
    ks: {
      o: {a: 0, k: 100},
      r: {a: 0, k: 0},
      p: {a: 0, k: [16, 16, 0]},
      a: {a: 0, k: [0, 0, 0]},
      s: {a: 0, k: [100, 100, 100]}
    },
    shapes: [{
      ty: 'gr',
      it: [{
        ty: 'rc',
        d: 1,
        s: {a: 0, k: [16, 16]},
        p: {a: 0, k: [0, 0]},
        r: {a: 0, k: 0}
      }, {
        ty: 'fl',
        c: {a: 0, k: [1, 0, 0, 1]},
        o: {a: 0, k: 100},
        r: 1
      }, {
        ty: 'tr',
        p: {a: 0, k: [0, 0]},
        a: {a: 0, k: [0, 0]},
        s: {a: 0, k: [100, 100]},
        r: {a: 0, k: 0},
        o: {a: 0, k: 100},
        sk: {a: 0, k: 0},
        sa: {a: 0, k: 0}
      }]
    }],
    ip: 0,
    op: 2,
    st: 0,
    bm: 0
  }]
});

const createWasmResponse = () => ({
  ok: true,
  status: 200,
  clone() {
    return this;
  },
  async arrayBuffer() {
    return wasmBytes.slice().buffer;
  }
}) as Response;

describe('tlottie WebAssembly', () => {
  let api: TLottieTestExports;

  beforeAll(async() => {
    const result = await WebAssembly.instantiate(wasmBytes, {});
    api = result.instance.exports as TLottieTestExports;
  });

  test('is the pinned SIMD web build without debug sections', () => {
    expect(IS_WEB_ASSEMBLY_SIMD_SUPPORTED).toBe(true);
    expect(createHash('sha256').update(wasmBytes).digest('hex')).toBe(EXPECTED_SHA256);
    expect(Buffer.from(wasmBytes).includes(Buffer.from('simd128'))).toBe(true);

    const module = new WebAssembly.Module(wasmBytes);
    expect(WebAssembly.Module.imports(module)).toEqual([]);
    expect(WebAssembly.Module.customSections(module, 'name')).toHaveLength(0);
    expect(WebAssembly.Module.customSections(module, '.debug_info')).toHaveLength(0);
    expect(WebAssembly.Module.customSections(module, 'target_features')).toHaveLength(1);
  });

  test('rejects invalid JSON', () => {
    const bytes = new TextEncoder().encode('{not-json');
    const pointer = api.tlottie_alloc(bytes.length);
    expect(pointer).not.toBe(0);
    new Uint8Array(api.memory.buffer, pointer, bytes.length).set(bytes);
    expect(api.tlottie_new_with_options(pointer, bytes.length, 0, 0, 0)).toBe(0);
    api.tlottie_free(pointer, bytes.length);
  });

  test('renders stable RGBA geometry and colors', () => {
    const bytes = new TextEncoder().encode(GOLDEN_ANIMATION);
    const pointer = api.tlottie_alloc(bytes.length);
    expect(pointer).not.toBe(0);
    new Uint8Array(api.memory.buffer, pointer, bytes.length).set(bytes);
    const handle = api.tlottie_new_with_options(pointer, bytes.length, 0, 0, 0);
    api.tlottie_free(pointer, bytes.length);
    expect(handle).not.toBe(0);

    try {
      expect(api.tlottie_frame_count(handle)).toBe(1);
      const pixelsPointer = api.tlottie_render(handle, 0, 32, 32, 1);
      expect(pixelsPointer).not.toBe(0);
      const pixels = new Uint8Array(api.memory.buffer, pixelsPointer, 32 * 32 * 4).slice();
      const pixelAt = (x: number, y: number) => Array.from(pixels.slice((y * 32 + x) * 4, (y * 32 + x) * 4 + 4));

      expect(pixelAt(16, 16)).toEqual([255, 0, 0, 255]);
      expect(pixelAt(0, 0)).toEqual([0, 0, 0, 0]);
      expect(createHash('sha256').update(pixels).digest('hex')).toBe('cefc5c9d0f0bbefec60b856458dd3fdab66c5e03ebceb2057c9d77c2a57e0dec');
    } finally {
      api.tlottie_drop(handle);
    }
  });

  test('preserves the authored duration of static animations', async() => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(createWasmResponse());

    try {
      const tlottie = await TLottieWasm.create('/tlottie.wasm');
      const animation = tlottie.createAnimation(GOLDEN_ANIMATION);
      try {
        expect(animation.frameCount).toBe(2);
        const pixels = tlottie.render(animation.handle, animation.frameCount - 1, 32, 32);
        expect(createHash('sha256').update(pixels).digest('hex')).toBe('cefc5c9d0f0bbefec60b856458dd3fdab66c5e03ebceb2057c9d77c2a57e0dec');
      } finally {
        tlottie.destroyAnimation(animation.handle);
      }
    } finally {
      fetchMock.mockRestore();
    }
  });

  test('applies authored Fitz skin-tone replacements', async() => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(createWasmResponse());

    try {
      const tlottie = await TLottieWasm.create('/tlottie.wasm');
      expect(() => tlottie.createAnimation(FITZ_ANIMATION, 6 as TLottieFitzModifier))
      .toThrow('Invalid tlottie Fitz modifier: 6');

      const hashes = FITZ_MODIFIERS.map((fitzModifier) => {
        const animation = tlottie.createAnimation(FITZ_ANIMATION, fitzModifier);
        try {
          const pixels = tlottie.render(animation.handle, 0, 64, 64);
          return createHash('sha256').update(pixels).digest('hex');
        } finally {
          tlottie.destroyAnimation(animation.handle);
        }
      });

      expect(hashes).toEqual(FITZ_FRAME_HASHES);
      expect(new Set(hashes).size).toBe(FITZ_MODIFIERS.length);
    } finally {
      fetchMock.mockRestore();
    }
  });

  for(const assetName of assetNames) {
    test(`parses metadata and renders ${assetName}`, () => {
      const bytes = new Uint8Array(readFileSync(resolve(ASSETS_PATH, assetName)));
      const data = JSON.parse(new TextDecoder().decode(bytes));
      const pointer = api.tlottie_alloc(bytes.length);
      expect(pointer).not.toBe(0);

      new Uint8Array(api.memory.buffer, pointer, bytes.length).set(bytes);
      const handle = api.tlottie_new_with_options(pointer, bytes.length, 0, 0, 0);
      api.tlottie_free(pointer, bytes.length);
      expect(handle).not.toBe(0);

      try {
        expect(api.tlottie_width(handle)).toBe(data.w);
        expect(api.tlottie_height(handle)).toBe(data.h);
        expect(api.tlottie_frame_rate(handle)).toBeCloseTo(data.fr);

        const frameCount = api.tlottie_frame_count(handle);
        expect(frameCount).toBe(Math.max(1, Math.floor(data.op - data.ip)));

        const frames = new Set([0, Math.floor(frameCount / 2), frameCount - 1]);
        for(const frame of frames) {
          const pixels = api.tlottie_render(handle, frame, 64, 64, 1);
          expect(pixels, `${assetName} frame ${frame}`).not.toBe(0);
          expect(new Uint8Array(api.memory.buffer, pixels, 64 * 64 * 4)).toHaveLength(64 * 64 * 4);
        }
      } finally {
        api.tlottie_drop(handle);
      }
    });
  }
});
