import {createHash} from 'crypto';
import {readdirSync, readFileSync} from 'fs';
import {resolve} from 'path';
import IS_WEB_ASSEMBLY_SIMD_SUPPORTED from '@environment/webAssemblySimdSupport';

type TLottieTestExports = WebAssembly.Exports & {
  memory: WebAssembly.Memory,
  tl_alloc: (length: number) => number,
  tl_free: (pointer: number, length: number) => void,
  tl_new: (pointer: number, length: number) => number,
  tl_drop: (handle: number) => void,
  tl_width: (handle: number) => number,
  tl_height: (handle: number) => number,
  tl_frame_rate: (handle: number) => number,
  tl_frame_count: (handle: number) => number,
  tl_render: (handle: number, frame: number, width: number, height: number, antialias: number) => number
};

const WASM_PATH = resolve(process.cwd(), 'src/vendor/tlottie/tlottie.wasm');
const ASSETS_PATH = resolve(process.cwd(), 'public/assets/tgs');
const EXPECTED_SHA256 = '877b8c8c36156710842241101dec5f2f74ba40660ffcfab8f2858deabd7e3523';
const wasmBytes = new Uint8Array(readFileSync(WASM_PATH));
const assetNames = readdirSync(ASSETS_PATH).filter((name) => name.endsWith('.json')).sort();
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

describe('tlottie WebAssembly', () => {
  let api: TLottieTestExports;

  beforeAll(async() => {
    const result = await WebAssembly.instantiate(wasmBytes, {});
    api = result.instance.exports as TLottieTestExports;
  });

  test('is the pinned SIMD demo build without debug sections', () => {
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
    const pointer = api.tl_alloc(bytes.length);
    expect(pointer).not.toBe(0);
    new Uint8Array(api.memory.buffer, pointer, bytes.length).set(bytes);
    expect(api.tl_new(pointer, bytes.length)).toBe(0);
    api.tl_free(pointer, bytes.length);
  });

  test('renders stable RGBA geometry and colors', () => {
    const bytes = new TextEncoder().encode(GOLDEN_ANIMATION);
    const pointer = api.tl_alloc(bytes.length);
    expect(pointer).not.toBe(0);
    new Uint8Array(api.memory.buffer, pointer, bytes.length).set(bytes);
    const handle = api.tl_new(pointer, bytes.length);
    api.tl_free(pointer, bytes.length);
    expect(handle).not.toBe(0);

    try {
      const pixelsPointer = api.tl_render(handle, 0, 32, 32, 1);
      expect(pixelsPointer).not.toBe(0);
      const pixels = new Uint8Array(api.memory.buffer, pixelsPointer, 32 * 32 * 4).slice();
      const pixelAt = (x: number, y: number) => Array.from(pixels.slice((y * 32 + x) * 4, (y * 32 + x) * 4 + 4));

      expect(pixelAt(16, 16)).toEqual([255, 0, 0, 255]);
      expect(pixelAt(0, 0)).toEqual([0, 0, 0, 0]);
      expect(createHash('sha256').update(pixels).digest('hex')).toBe('cefc5c9d0f0bbefec60b856458dd3fdab66c5e03ebceb2057c9d77c2a57e0dec');
    } finally {
      api.tl_drop(handle);
    }
  });

  for(const assetName of assetNames) {
    test(`parses metadata and renders ${assetName}`, () => {
      const bytes = new Uint8Array(readFileSync(resolve(ASSETS_PATH, assetName)));
      const data = JSON.parse(new TextDecoder().decode(bytes));
      const pointer = api.tl_alloc(bytes.length);
      expect(pointer).not.toBe(0);

      new Uint8Array(api.memory.buffer, pointer, bytes.length).set(bytes);
      const handle = api.tl_new(pointer, bytes.length);
      api.tl_free(pointer, bytes.length);
      expect(handle).not.toBe(0);

      try {
        expect(api.tl_width(handle)).toBe(data.w);
        expect(api.tl_height(handle)).toBe(data.h);
        expect(api.tl_frame_rate(handle)).toBeCloseTo(data.fr);

        const frameCount = api.tl_frame_count(handle);
        expect(frameCount).toBe(Math.max(1, Math.floor(data.op - data.ip)));

        const frames = new Set([0, Math.floor(frameCount / 2), frameCount - 1]);
        for(const frame of frames) {
          const pixels = api.tl_render(handle, frame, 64, 64, 1);
          expect(pixels, `${assetName} frame ${frame}`).not.toBe(0);
          expect(new Uint8Array(api.memory.buffer, pixels, 64 * 64 * 4)).toHaveLength(64 * 64 * 4);
        }
      } finally {
        api.tl_drop(handle);
      }
    });
  }
});
