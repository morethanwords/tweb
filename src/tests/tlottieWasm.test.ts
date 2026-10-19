import {createHash} from 'crypto';
import {readdirSync, readFileSync} from 'fs';
import {resolve} from 'path';
import IS_WEB_ASSEMBLY_BASELINE_SUPPORTED from '@environment/webAssemblyBaselineSupport';
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

const VENDOR_PATH = resolve(process.cwd(), 'src/vendor/tlottie');
const ASSETS_PATH = resolve(process.cwd(), 'public/assets/tgs');
// The SIMD build is the fast path; the no-SIMD one is what browsers without
// WebAssembly SIMD get - both come from the same pinned upstream commit.
const VARIANTS = [{
  name: 'tlottie.wasm',
  simd: true,
  sha256: '2f3be462e448170ddf3682a0af40f527c45f03a2e3d566728001dc8909342534'
}, {
  name: 'tlottie.nosimd.wasm',
  simd: false,
  sha256: '22673f5ea917a018cdf23de9e14fc373a348d75e7f80a839bba762748ef7ed22'
}] as const;
type TLottieVariantName = typeof VARIANTS[number]['name'];
const variantBytes = new Map(VARIANTS.map((variant) => [
  variant.name,
  new Uint8Array(readFileSync(resolve(VENDOR_PATH, variant.name)))
]));
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

const createWasmResponse = (name: TLottieVariantName = 'tlottie.wasm') => ({
  ok: true,
  status: 200,
  clone() {
    return this;
  },
  async arrayBuffer() {
    return variantBytes.get(name).slice().buffer;
  }
}) as Response;

// Metadata plus a hash of every sampled frame - the two builds have to agree on all of it.
const renderAsset = (api: TLottieTestExports, bytes: Uint8Array) => {
  const pointer = api.tlottie_alloc(bytes.length);
  expect(pointer).not.toBe(0);

  new Uint8Array(api.memory.buffer, pointer, bytes.length).set(bytes);
  const handle = api.tlottie_new_with_options(pointer, bytes.length, 0, 0, 0);
  api.tlottie_free(pointer, bytes.length);
  expect(handle).not.toBe(0);

  try {
    const frameCount = api.tlottie_frame_count(handle);
    const frames = new Set([0, Math.floor(frameCount / 2), frameCount - 1]);
    const hashes = [...frames].map((frame) => {
      const pixels = api.tlottie_render(handle, frame, 64, 64, 1);
      expect(pixels, `frame ${frame}`).not.toBe(0);
      const rgba = new Uint8Array(api.memory.buffer, pixels, 64 * 64 * 4);
      expect(rgba).toHaveLength(64 * 64 * 4);
      return createHash('sha256').update(rgba).digest('hex');
    });

    return {
      width: api.tlottie_width(handle),
      height: api.tlottie_height(handle),
      frameRate: api.tlottie_frame_rate(handle),
      frameCount,
      hashes
    };
  } finally {
    api.tlottie_drop(handle);
  }
};

describe('tlottie WebAssembly', () => {
  let api: TLottieTestExports;
  let noSimdApi: TLottieTestExports;

  beforeAll(async() => {
    const instantiate = async(name: TLottieVariantName) => {
      const result = await WebAssembly.instantiate(variantBytes.get(name), {});
      return result.instance.exports as TLottieTestExports;
    };

    api = await instantiate('tlottie.wasm');
    noSimdApi = await instantiate('tlottie.nosimd.wasm');
  });

  test('runs on this environment', () => {
    expect(IS_WEB_ASSEMBLY_BASELINE_SUPPORTED).toBe(true);
    expect(IS_WEB_ASSEMBLY_SIMD_SUPPORTED).toBe(true);
  });

  for(const variant of VARIANTS) {
    test(`${variant.name} is the pinned web build without debug sections`, () => {
      const bytes = variantBytes.get(variant.name);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(variant.sha256);
      // 'simd128' only survives in target_features - the name section is stripped
      expect(Buffer.from(bytes).includes(Buffer.from('simd128'))).toBe(variant.simd);

      const module = new WebAssembly.Module(bytes);
      expect(WebAssembly.Module.imports(module)).toEqual([]);
      expect(WebAssembly.Module.customSections(module, 'name')).toHaveLength(0);
      expect(WebAssembly.Module.customSections(module, '.debug_info')).toHaveLength(0);
      expect(WebAssembly.Module.customSections(module, 'target_features')).toHaveLength(1);
    });
  }

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

  for(const variant of VARIANTS) {
    test(`applies authored Fitz skin-tone replacements with ${variant.name}`, async() => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(createWasmResponse(variant.name));

      try {
        const tlottie = await TLottieWasm.create(`/${variant.name}`);
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
  }

  for(const assetName of assetNames) {
    test(`parses metadata and renders ${assetName} the same in both builds`, () => {
      const bytes = new Uint8Array(readFileSync(resolve(ASSETS_PATH, assetName)));
      const data = JSON.parse(new TextDecoder().decode(bytes));
      const rendered = renderAsset(api, bytes);

      expect(rendered.width).toBe(data.w);
      expect(rendered.height).toBe(data.h);
      expect(rendered.frameRate).toBeCloseTo(data.fr);
      expect(rendered.frameCount).toBe(Math.max(1, Math.floor(data.op - data.ip)));

      expect(renderAsset(noSimdApi, bytes)).toEqual(rendered);
    });
  }
});

// * A WebAssembly heap never shrinks, and tlottie keeps several frame-sized buffers per animation, so
// * TLottieWasm holds only what is in use: idle animations sleep (their instance dropped, re-created
// * from the source on the next render) and an oversized heap is replaced by a fresh instance. The
// * numbers these tests lean on are the constants at the top of tlottieWasm.ts.
describe('tlottie memory', () => {
  const MB = 1024 * 1024;
  const readAsset = (name: string) => readFileSync(resolve(ASSETS_PATH, name), 'utf8');
  const hashFrames = (tlottie: TLottieWasm, handle: number, frameCount: number, size = 96) => {
    return [0, Math.floor(frameCount / 2), frameCount - 1].map((frame) => {
      return createHash('sha256').update(tlottie.render(handle, frame, size, size)).digest('hex');
    });
  };

  let fetchMock: ReturnType<typeof vi.spyOn>;
  let tlottie: TLottieWasm;
  beforeEach(async() => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance']});
    fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(createWasmResponse());
    tlottie = await TLottieWasm.create('/tlottie.wasm');
  });

  afterEach(() => {
    fetchMock.mockRestore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // * the heap a sticker-heavy moment leaves behind: big frames, many at once, then gone
  const growHeap = (count: number) => {
    const json = readAsset('UtyanSearch.json');
    const handles = Array.from({length: count}, () => {
      const {handle} = tlottie.createAnimation(json);
      tlottie.render(handle, 0, 1024, 1024);
      return handle;
    });
    handles.forEach((handle) => tlottie.destroyAnimation(handle));
  };

  test('a fresh instance gives the heap back and every animation draws the same frames', () => {
    // * an animation gone before the swap shifts where the others land in the fresh heap - a fresh
    // * allocator would otherwise hand them their old addresses and hide a stale pointer
    const leading = tlottie.createAnimation(readAsset('UtyanSearch.json'));
    tlottie.render(leading.handle, 0, 256, 256);
    const animations = ['Cake.json', 'hand_stop.json', 'Diamond.json'].map((name) => tlottie.createAnimation(readAsset(name)));
    const golden = tlottie.createAnimation(GOLDEN_ANIMATION);
    tlottie.destroyAnimation(leading.handle);
    const before = animations.map(({handle, frameCount}) => hashFrames(tlottie, handle, frameCount));

    growHeap(8);
    const grownHeap = tlottie.heapBytes;
    expect(grownHeap).toBeGreaterThan(64 * MB);

    expect(tlottie.recycle()).toBe(true);
    expect(tlottie.stats).toMatchObject({awake: 0, recycles: 1});
    expect(tlottie.heapBytes).toBeLessThan(grownHeap / 4);

    // * the same handles wake on their next render and draw the same pixels - a static composition included
    expect(animations.map(({handle, frameCount}) => hashFrames(tlottie, handle, frameCount))).toEqual(before);
    expect(createHash('sha256').update(tlottie.render(golden.handle, golden.frameCount - 1, 32, 32)).digest('hex'))
    .toBe('cefc5c9d0f0bbefec60b856458dd3fdab66c5e03ebceb2057c9d77c2a57e0dec');
    expect(tlottie.stats).toMatchObject({awake: 4, wakes: 4});
    expect(tlottie.heapBytes).toBeLessThan(grownHeap / 4);

    animations.forEach(({handle}) => tlottie.destroyAnimation(handle));
    expect(() => tlottie.render(animations[0].handle, 0, 32, 32)).toThrow('tlottie animation is destroyed');
  });

  test('an animation nobody renders sleeps, and wakes with the same frames', () => {
    const animation = tlottie.createAnimation(readAsset('Cake.json'));
    const before = hashFrames(tlottie, animation.handle, animation.frameCount);

    vi.advanceTimersByTime(2 * 60 * 1000 - 1);
    expect(tlottie.stats.awake).toBe(1);
    vi.advanceTimersByTime(15 * 1000);
    expect(tlottie.stats).toMatchObject({animations: 1, awake: 0, wakes: 0});

    expect(hashFrames(tlottie, animation.handle, animation.frameCount)).toEqual(before);
    expect(tlottie.stats).toMatchObject({awake: 1, wakes: 1});
  });

  test('past the budget the longest idle sleep first, and a playing one never does', () => {
    const json = readAsset('hand_stop.json');
    // * 768 px: about 7.7 MB each of the estimate, so the 24 MB budget holds three
    const handles = Array.from({length: 5}, () => tlottie.createAnimation(json).handle);
    handles.forEach((handle, index) => {
      tlottie.render(handle, 0, 768, 768);
      vi.advanceTimersByTime(100 * (index + 1));
    });

    // * handles[4] keeps playing; the rest go idle in the order they were last drawn
    for(let i = 0; i < 30; ++i) {
      tlottie.render(handles[4], i, 768, 768);
      vi.advanceTimersByTime(100);
    }

    expect(tlottie.stats).toMatchObject({awake: 3, wakes: 0});
    const wakes = (handle: number) => {
      const before = tlottie.stats.wakes;
      tlottie.render(handle, 0, 768, 768);
      return tlottie.stats.wakes - before;
    };
    // * the two drawn last are still awake, the playing one never slept, the oldest did
    expect(wakes(handles[3])).toBe(0);
    expect(wakes(handles[2])).toBe(0);
    expect(wakes(handles[4])).toBe(0);
    expect(wakes(handles[0])).toBe(1);
  });

  test('playing animations past the budget are left alone rather than re-created over and over', () => {
    const json = readAsset('hand_stop.json');
    const handles = Array.from({length: 5}, () => tlottie.createAnimation(json).handle);
    for(let i = 0; i < 100; ++i) {
      handles.forEach((handle) => tlottie.render(handle, i, 768, 768));
      vi.advanceTimersByTime(100);
    }

    expect(tlottie.stats).toMatchObject({awake: 5, wakes: 0});
  });

  test('a fresh instance replaces an oversized heap by itself, at most once a minute', () => {
    // * awake and small enough to re-parse at once
    const kept = tlottie.createAnimation(readAsset('hand_stop.json'));
    const before = hashFrames(tlottie, kept.handle, kept.frameCount);

    growHeap(8);
    const grownHeap = tlottie.heapBytes;
    expect(tlottie.stats.recycles).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(tlottie.stats.recycles).toBe(1);
    expect(tlottie.heapBytes).toBeLessThan(grownHeap / 4);
    expect(hashFrames(tlottie, kept.handle, kept.frameCount)).toEqual(before);

    // * another burst within the minute, and nothing awake after it: nothing but the wait itself is
    // * left to bring the fresh instance once it is allowed
    tlottie.destroyAnimation(kept.handle);
    growHeap(8);
    vi.advanceTimersByTime(30 * 1000);
    expect(tlottie.stats).toMatchObject({awake: 0, recycles: 1});
    vi.advanceTimersByTime(45 * 1000);
    expect(tlottie.stats.recycles).toBe(2);
    expect(tlottie.heapBytes).toBeLessThan(grownHeap / 4);
  });

  test('with nothing awake a modest heap is given back too - it costs nothing', () => {
    const json = readAsset('UtyanSearch.json');
    const handles = Array.from({length: 3}, () => tlottie.createAnimation(json).handle);
    handles.forEach((handle) => tlottie.render(handle, 0, 512, 512));
    const heap = tlottie.heapBytes;
    expect(heap).toBeGreaterThan(8 * MB);
    expect(heap).toBeLessThan(32 * MB);

    // * one still awake: below the size where re-creating it would pay
    handles.slice(1).forEach((handle) => tlottie.destroyAnimation(handle));
    vi.advanceTimersByTime(5000);
    expect(tlottie.stats.recycles).toBe(0);

    tlottie.destroyAnimation(handles[0]);
    vi.advanceTimersByTime(5000);
    expect(tlottie.stats.recycles).toBe(1);
    expect(tlottie.heapBytes).toBeLessThan(heap / 4);
  });

  test('no fresh instance while what is awake would be costly to re-create', () => {
    // * five animations of ~300 KB of JSON each, playing: well past the re-parse cap
    const playing = Array.from({length: 5}, () => tlottie.createAnimation(readAsset('Gift12.json')).handle);
    growHeap(8);
    for(let i = 0; i < 100; ++i) {
      playing.forEach((handle) => tlottie.render(handle, i, 64, 64));
      vi.advanceTimersByTime(100);
    }

    expect(tlottie.heapBytes).toBeGreaterThan(64 * MB);
    expect(tlottie.stats.recycles).toBe(0);
  });

  test('remembers when the heap set a record and what was awake then, and again after a fresh instance', () => {
    expect(tlottie.peaks.events).toHaveLength(0);
    growHeap(8);
    const [first] = tlottie.peaks.events;
    expect(first.value).toBeGreaterThanOrEqual(16 * MB);
    expect(first.details).toMatchObject({frameBytes: 1024 * 1024 * 4});
    expect(first.details.awake).toBeGreaterThan(0);
    const recorded = tlottie.peaks.events.length;

    tlottie.recycle();
    growHeap(8);
    expect(tlottie.peaks.events.length).toBeGreaterThan(recorded);
  });

  test('wakes from the Blob it was given, read back synchronously', () => {
    const json = readAsset('Cake.json');
    const blob = new Blob([json]);
    const readAsText = vi.fn((source: Blob) => {
      expect(source).toBe(blob);
      return json;
    });
    vi.stubGlobal('FileReaderSync', class {
      public readAsText = readAsText;
    });

    const animation = tlottie.createAnimation(json, 0, blob);
    const before = hashFrames(tlottie, animation.handle, animation.frameCount);
    expect(tlottie.recycle()).toBe(true);
    expect(hashFrames(tlottie, animation.handle, animation.frameCount)).toEqual(before);
    expect(readAsText).toHaveBeenCalledTimes(1);
  });

  test('a source that cannot be read fails that one render and leaves the animation asleep', () => {
    const json = readAsset('Cake.json');
    vi.stubGlobal('FileReaderSync', class {
      public readAsText(): string {
        throw new Error('NotReadableError');
      }
    });

    const broken = tlottie.createAnimation(json, 0, new Blob([json]));
    const fine = tlottie.createAnimation(json);
    const before = hashFrames(tlottie, fine.handle, fine.frameCount);
    tlottie.recycle();

    expect(() => tlottie.render(broken.handle, 0, 96, 96)).toThrow('NotReadableError');
    expect(tlottie.stats).toMatchObject({awake: 0, wakes: 0});
    expect(hashFrames(tlottie, fine.handle, fine.frameCount)).toEqual(before);
  });
});
