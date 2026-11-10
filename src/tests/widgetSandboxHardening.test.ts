import fs from 'node:fs';
import path from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {GestureCounter} from 'widget-sandbox/host/user-activation';
import {BROKEN_IMAGE, checkUrl, dataImageSize, MAX_IMAGE_PIXELS} from 'widget-sandbox/host/url-policy';
import {sanitizeCssValue} from 'widget-sandbox/host/css-sanitizer';
import {countCssRules, Validator} from 'widget-sandbox/host/validator';
import {createGlue} from 'widget-sandbox/host/glue';
import {LIMIT_DEFAULTS} from 'widget-sandbox/shared/protocol';
import {layoutBudget, mayAllGrid, mayDisplayGrid, widenSelector} from 'widget-sandbox/shared/layout-policy';
import isCollected from '@/tests/helpers/collectGarbage';
import bytesFromWordss from '@helpers/bytes/bytesFromWordss';
import bytesToBase64 from '@helpers/bytes/bytesToBase64';
import {WIDGET_FIXTURES, widgetFixtureFiles} from '@/tests/helpers/widgetFixtures';

/** Bytes as a data: URL's body has them percent-encoded. */
const percentEncoded = (bytes: ArrayLike<number>) => Array.from(bytes, (b) => '%' + b.toString(16).padStart(2, '0')).join('');
/** The signature and IHDR of a PNG of `width` × `height`: all a decoder reads before it allocates. */
const pngBytes = (width: number, height: number) => [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  ...bytesFromWordss(new Uint32Array([width, height])), 8, 6, 0, 0, 0
];
/** A PNG claiming `width` × `height`, as a data: URL. */
const pngHeader = (width: number, height: number) => 'data:image/png;base64,' + bytesToBase64(pngBytes(width, height));

const u16le = (n: number) => [n & 255, n >> 8];
/** A GIF of a `screen` logical screen whose first frame is `frame` ([left, top, width, height]), after `extensions`. */
const gif = (screen: [number, number], frame?: [number, number, number, number], extensions = [0x21, 0xf9, 4, 0, 0, 0, 0, 0]) =>
  'data:image/gif;base64,' + bytesToBase64([
    ...[...'GIF89a'].map((c) => c.charCodeAt(0)), ...u16le(screen[0]), ...u16le(screen[1]), 0, 0, 0,
    ...extensions,
    ...(frame ? [0x2c, ...frame.flatMap(u16le), 0, 2, 2, 0x4c, 0x01, 0] : []),
    0x3b
  ]);
/** A baseline JPEG's frame header of 16 × 16. */
const SOF_16 = [0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x10, 0x03];
/** A JPEG whose frame header (16 × 16) comes after APP1 segments of these lengths. */
const jpegWithSegments = (lengths: number[]) => new Uint8Array([
  0xff, 0xd8,
  ...lengths.flatMap((length) => [0xff, 0xe1, (length + 2) >> 8, (length + 2) & 255, ...new Array(length).fill(0x41)]),
  ...SOF_16
]);
/** A JPEG whose frame header (16 × 16) comes after `fill` fill bytes, a step each (the header's own 0xff the last). */
const jpegWithFill = (fill: number) => [0xff, 0xd8, ...new Array(fill).fill(0xff), ...SOF_16.slice(1)];
/** A 1 × 1 GIF whose frame comes after a comment of `count` sub-blocks of `size` bytes. */
const gifWithBlocks = (count: number, size: number) => gif([1, 1], [0, 0, 1, 1], [
  0x21, 0xfe, ...Array.from({length: count}, () => [size, ...new Array(size).fill(0x41)]).flat(), 0
]);
/** A WebP whose first chunk is `chunk` with these bytes from offset 16 on. */
const webpChunk = (chunk: string, bytes: number[]) => [...[...('RIFF\0\0\0\0WEBP' + chunk)].map((c) => c.charCodeAt(0)), ...bytes];

/** How many characters `run` has atob decode. */
const decodedBy = (run: () => unknown): number => {
  const atob = globalThis.atob;
  let characters = 0;
  globalThis.atob = (text: string) => {
    characters += text.length;
    return atob(text);
  };
  try {
    run();
  } finally {
    globalThis.atob = atob;
  }
  return characters;
};
/**
 * How many times as long a scan of `url` takes as parsing the message that brings it (an `attr` op), which the host pays
 * for every op anyway: the least of rounds that take turns, so that a busy machine slows both alike.
 */
const scanCost = (url: string): number => {
  const message = JSON.stringify([{op: 'attr', id: 1, name: 'src', value: url}]);
  let scan = Infinity, parse = Infinity, sink = 0;
  for(let round = 0; round < 9; round++) {
    let start = performance.now();
    for(let i = 0; i < 20; i++) sink += dataImageSize(url)?.[0] ?? 0;
    scan = Math.min(scan, performance.now() - start);
    start = performance.now();
    for(let i = 0; i < 20; i++) sink += JSON.parse(message).length;
    parse = Math.min(parse, performance.now() - start);
  }
  expect(sink).toBeGreaterThanOrEqual(0);
  return scan / parse;
};

// A finger's or a pen's pointerdown (and a pen's compatibility mousedown) reaches the counter not `trusted`, so not at all
// (renderer/core.ts; the touch and pen cases run in the library's renderer-presses.test.ts): the counter starts a new
// gesture at the renderer's claim of every primary press instead.
describe('a widget\'s gestures (user-activation.ts)', () => {
  it('a press the renderer reports begins a new gesture: a finger\'s release after a drag is not the drag\'s', () => {
    const counter = new GestureCounter();
    // a drag's release, no click after it
    expect(counter.gestureFor({type: 'pointerup'})).toBe(1);
    // the next press: the claim, its pointerdown not trusted, then its release and its click
    counter.pressBegan();
    expect(counter.gestureFor({type: 'pointerup'})).toBe(2);
    expect(counter.gestureFor({type: 'click', detail: 1})).toBe(2);
  });

  it('a mouse\'s press is one from its pointerdown to its click', () => {
    const counter = new GestureCounter();
    counter.pressBegan();
    const press = counter.gestureFor({type: 'pointerdown'});
    expect(press).toBeGreaterThan(0);
    expect(['mousedown', 'pointerup', 'mouseup'].map((type) => counter.gestureFor({type}))).toEqual([press, press, press]);
    expect(counter.gestureFor({type: 'click', detail: 1})).toBe(press);
  });
});

describe('a widget\'s data: images (url-policy.ts)', () => {
  it('takes every image of the fixtures, whatever its format, at its size', () => {
    const urls = new Set<string>();
    // the attacks' images are past the cap on purpose (mem-huge-bitmaps), and the limits case has one at it and one past it
    const attacks = path.join(WIDGET_FIXTURES, 'attacks') + path.sep;
    const limits = path.join(WIDGET_FIXTURES, 'conformance', 'auto', '19-limits.html');
    for(const file of widgetFixtureFiles()) {
      if(file.startsWith(attacks) || file === limits) continue;
      for(const [url] of fs.readFileSync(file, 'utf8').matchAll(/data:image\/(?:png|jpe?g|gif|webp)[;,][^"')\s`]+/g)) urls.add(url);
    }
    // the conformance set's broken image (auto/02-attributes-images-b), which has to fire error
    urls.delete('data:image/png;base64,AAAA');

    const formats = new Set([...urls].map((url) => url.slice(11, url.search(/[;,]/))));
    expect([...formats].sort()).toEqual(['gif', 'jpeg', 'png', 'webp']);
    for(const url of urls) {
      const size = dataImageSize(url);
      expect(size, url.slice(0, 60)).not.toBeNull();
      expect(size[0] * size[1], url.slice(0, 60)).toBeLessThanOrEqual(256 * 256);
      expect(checkUrl(url, 'image'), url.slice(0, 60)).toBe(url);
    }
  });

  it('refuses an image whose header claims more pixels than a bitmap may hold', () => {
    // v0.3.0: at most 1024² pixels (docs/changes.md, "Strict limits from the start")
    expect(dataImageSize(pngHeader(4096, 4096))).toEqual([4096, 4096]);
    expect(checkUrl(pngHeader(1024, 1024), 'image')).not.toBeNull();
    expect(checkUrl(pngHeader(1025, 1024), 'image')).toBeNull();
    expect(checkUrl(pngHeader(4096, 4096), 'image')).toBeNull();
    expect(checkUrl(pngHeader(65535, 65535), 'image')).toBeNull();
    expect(1025 * 1024).toBeGreaterThan(MAX_IMAGE_PIXELS);
    // GIF's logical screen, which every frame is drawn in
    expect(checkUrl(gif([65535, 65535], [0, 0, 1, 1]), 'image')).toBeNull();
  });

  it('bounds a GIF by its first frame too, where that frame reaches past the logical screen, as decoders grow it', () => {
    expect(dataImageSize(gif([100, 100], [10, 10, 5, 5]))).toEqual([100, 100]);
    expect(dataImageSize(gif([100, 100], [90, 0, 20, 10]))).toEqual([110, 100]);
    expect(checkUrl(gif([1, 1], [0, 0, 8192, 8192]), 'image')).toBeNull();
    // no frame at all: nothing a decoder draws
    expect(checkUrl(gif([1, 1]), 'image')).toBe(BROKEN_IMAGE);
    // thousands of tiny extensions before the frame (a script's): no image has them, and reading them is the host's time
    const crowded = gif([1, 1], [0, 0, 1, 1], Array.from({length: 20000}, () => [0x21, 0xfe, 0]).flat());
    expect(checkUrl(crowded, 'image')).toBe(BROKEN_IMAGE);
  });

  it('takes a whole lossless WebP shorter than the other chunks need (28 bytes, 1 × 1)', () => {
    const webp = 'data:image/webp;base64,UklGRhQAAABXRUJQVlA4TAgAAAAvAAAAAIiICA==';
    expect(dataImageSize(webp)).toEqual([1, 1]);
    expect(checkUrl(webp, 'image')).toBe(webp);
  });

  it('leaves the URL\'s fragment out of the body, as fetch does', () => {
    const png = pngHeader(2, 3);
    const body = png.slice(png.indexOf(',') + 1);
    expect(dataImageSize(png.replace(body, body.replace(/(.{4})/g, '$1 ')) + '#part')).toEqual([2, 3]);
    const small = gif([1, 1], [0, 0, 1, 1]) + '#x';
    expect(checkUrl(small, 'image')).toBe(small);
  });

  it('reads the body as fetch does: percent-encoded, base64 with spaces', () => {
    const png = pngHeader(2, 3);
    const body = png.slice(png.indexOf(',') + 1);
    expect(dataImageSize(png.replace(body, body.replace(/(.{4})/g, '$1 ')))).toEqual([2, 3]);
    expect(dataImageSize('data:image/png;base64,' + encodeURIComponent(body))).toEqual([2, 3]);
    expect(dataImageSize('data:image/png,' + percentEncoded(pngBytes(2, 3)))).toEqual([2, 3]);
  });

  it('finds a JPEG\'s size past the segments before it, in every encoding of the body, and no further than 64 KB', () => {
    const jpeg = jpegWithSegments([30000, 32000]);
    const body = bytesToBase64(jpeg);
    for(const url of [
      'data:image/jpeg;base64,' + body,
      'data:image/jpeg;base64,' + body.replace(/(.{76})/g, '$1 '),
      'data:image/jpeg;base64,' + body.replace(/\//g, '%2F').replace(/\+/g, '%2b'),
      'data:image/jpeg,' + percentEncoded(jpeg)
    ]) {
      expect(dataImageSize(url), url.slice(0, 40)).toEqual([16, 16]);
    }
    expect(checkUrl('data:image/jpeg;base64,' + bytesToBase64(jpegWithSegments([65533])), 'image')).toBe(BROKEN_IMAGE);
  });

  it('keeps the bytes where the browser has them: a %u is no escape, a pair of surrogates is one character', () => {
    // the browser's bytes: the body as UTF-8, percent-decoded (%u is left alone)
    const app = (payload: string) => {
      const length = new TextEncoder().encode(payload).length + 2;
      return percentEncoded([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 255]) + payload + percentEncoded(SOF_16);
    };
    expect(dataImageSize('data:image/jpeg,' + app('x%u0041y'))).toEqual([16, 16]);
    // the high surrogate on the last character the decoder reads at first
    const prefix = app('').indexOf(percentEncoded(SOF_16));
    expect(dataImageSize('data:image/jpeg,' + app('a'.repeat(4095 - prefix) + '😀' + 'b'.repeat(100)))).toEqual([16, 16]);
  });

  it('breaks bytes of another format, or none, behind an image type: the browser picks the decoder by the bytes', () => {
    // BMP, outside the profile
    expect(checkUrl('data:image/png;base64,' + bytesToBase64([0x42, 0x4d, ...new Array(52).fill(0)]), 'image')).toBe(BROKEN_IMAGE);
    expect(checkUrl('data:image/png;base64,AAAA', 'image')).toBe(BROKEN_IMAGE);
    expect(checkUrl('data:image/png;base64,!!', 'image')).toBe(BROKEN_IMAGE);
    expect(checkUrl(BROKEN_IMAGE, 'image')).toBe(BROKEN_IMAGE);
  });
});

// A check runs for every element and style that names an image, on the chat's thread, and a script can name thousands
// of URLs that differ in their fragment alone: each scan reads the bytes in place, takes a bounded number of steps and
// decodes no more than it reads, so that no bytes cost more than a few parses of the message that brings them.
describe('data: image scans at their worst (url-policy.ts)', () => {
  it('walks a JPEG to its frame header in at most 1024 steps, each a read in place', () => {
    expect(dataImageSize('data:image/jpeg;base64,' + bytesToBase64(jpegWithFill(1024)))).toEqual([16, 16]);
    expect(dataImageSize('data:image/jpeg;base64,' + bytesToBase64(jpegWithFill(1025)))).toBe(null);
    const worst = {
      'fill bytes': [0xff, 0xd8, ...new Array(65000).fill(0xff)],
      'restart markers': [0xff, 0xd8, ...Array.from({length: 32000}, () => [0xff, 0xd0]).flat()],
      'empty segments': [0xff, 0xd8, ...Array.from({length: 16000}, () => [0xff, 0xe0, 0, 2]).flat()]
    };
    for(const [name, bytes] of Object.entries(worst)) {
      const url = 'data:image/jpeg;base64,' + bytesToBase64(bytes);
      expect(checkUrl(url, 'image'), name).toBe(BROKEN_IMAGE);
      expect(decodedBy(() => dataImageSize(url)), name).toBeLessThanOrEqual(2 * 4096);
      expect(scanCost(url), name).toBeLessThan(4);
    }
    // percent-encoded, which is decoded from its start: as far as the steps go
    const percent = 'data:image/jpeg,' + percentEncoded(worst['fill bytes']);
    expect(checkUrl(percent, 'image')).toBe(BROKEN_IMAGE);
    expect(scanCost(percent)).toBeLessThan(4);
    // a frame header past 62 KB of segments: the windows the steps land in
    const far = 'data:image/jpeg;base64,' + bytesToBase64(jpegWithSegments([30000, 32000]));
    expect(dataImageSize(far)).toEqual([16, 16]);
    expect(decodedBy(() => dataImageSize(far))).toBeLessThanOrEqual(3 * 4096);
  });

  it('walks a GIF to its first frame in at most 4096 sub-blocks, each a read in place', () => {
    expect(dataImageSize(gifWithBlocks(4095, 1))).toEqual([1, 1]);
    expect(dataImageSize(gifWithBlocks(4096, 1))).toBe(null);
    // the farthest the steps reach: 4095 sub-blocks to 61 KB in, decoded once
    const far = gifWithBlocks(4095, 14);
    expect(dataImageSize(far)).toEqual([1, 1]);
    expect(decodedBy(() => dataImageSize(far))).toBeLessThanOrEqual(far.length - far.indexOf(',') + 4096);
    expect(scanCost(far)).toBeLessThan(4);
    // one-byte sub-blocks to 64 KB
    const tiny = gifWithBlocks(32000, 1);
    expect(checkUrl(tiny, 'image')).toBe(BROKEN_IMAGE);
    expect(decodedBy(() => dataImageSize(tiny))).toBeLessThanOrEqual(3 * 4096);
    expect(scanCost(tiny)).toBeLessThan(4);
  });

  it('reads a PNG\'s or a WebP\'s size from the body\'s first window, whatever follows', () => {
    const tail = new Array(65000).fill(0);
    const images: [string, number[], [number, number]][] = [
      ['png', pngBytes(2, 3), [2, 3]],
      ['webp', webpChunk('VP8X', [10, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0]), [2, 3]],
      ['webp', webpChunk('VP8L', [13, 0, 0, 0, 0x2f, 0x01, 0x80, 0, 0]), [2, 3]],
      ['webp', webpChunk('VP8 ', [10, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, 2, 0, 3, 0]), [2, 3]]
    ];
    for(const [type, header, size] of images) {
      const url = `data:image/${type};base64,` + bytesToBase64([...header, ...tail]);
      expect(dataImageSize(url), url.slice(0, 50)).toEqual(size);
      expect(decodedBy(() => dataImageSize(url)), url.slice(0, 50)).toBeLessThanOrEqual(4096);
      expect(scanCost(url), url.slice(0, 50)).toBeLessThan(4);
    }
  });

  it('tries a body that is no base64 once, however many signatures are looked for after', () => {
    const valid = bytesToBase64(new Array(48000).fill(0x41));
    const broken = {
      'a character no base64 has': 'data:image/png;base64,!' + valid.slice(1),
      'a padding in the middle': 'data:image/png;base64,QQ==' + valid,
      'with white space': 'data:image/png;base64,! ' + valid.replace(/(.{76})/g, '$1 ')
    };
    for(const [name, url] of Object.entries(broken)) {
      expect(checkUrl(url, 'image'), name).toBe(BROKEN_IMAGE);
      expect(decodedBy(() => dataImageSize(url)), name).toBeLessThanOrEqual(4096);
      expect(scanCost(url), name).toBeLessThan(4);
    }
    // a short one, whose message costs next to nothing to parse: one try
    expect(decodedBy(() => dataImageSize('data:image/png;base64,!!'))).toBe(2);
  });
});

describe('light-dark() in a widget\'s CSS (css-sanitizer.ts)', () => {
  it('checks the branch it picks for the theme', () => {
    const png = pngHeader(1, 1);
    for(const colorScheme of ['light', 'dark'] as const) {
      const diags: string[] = [];
      expect(sanitizeCssValue('light-dark(url(/x.png), url(/y.png))', (kind) => diags.push(kind), 'background', {colorScheme})).toBeNull();
      expect(diags).toContain('url-blocked');
      expect(sanitizeCssValue(`light-dark(url(${png}), red)`, () => {}, 'background', {colorScheme})).toBe(colorScheme === 'light' ? `url(${png})` : 'red');
      expect(sanitizeCssValue('light-dark(red, light-dark(blue, url(/z.png)))', () => {}, 'background', {colorScheme})).toBe(colorScheme === 'light' ? 'red' : null);
    }
  });
});

describe('the stylesheet caps (validator.ts countCssRules)', () => {
  it('counts a rule or a @keyframes once, whatever escaped braces its prelude has', () => {
    expect(countCssRules('.a{color:red}@media all{.b{color:red}}@keyframes k{0%{opacity:0}to{opacity:1}}')).toEqual({rules: 2, keyframes: 1});
    // an escaped brace opens or closes nothing: one rule, not two (a stop below the cap), one @keyframes, not rules
    expect(countCssRules('.a\\{x{color:red}')).toEqual({rules: 1, keyframes: 0});
    expect(countCssRules('@keyframes k\\}x{0%{opacity:0}to{opacity:1}}')).toEqual({rules: 0, keyframes: 1});
    expect(countCssRules('.a{content:"{"}.b{color:red}')).toEqual({rules: 2, keyframes: 0});
  });
});

/** What the glue answers the shim's modules, run here outside QuickJS (sandbox/host.ts's `__host`). */
let onHost: (kind: string, arg?: string) => unknown = () => undefined;
/** The shim's modules, with the glue's globals they read as they load, and no-op hooks of the sandbox's for its mirror. */
const loadShim = async() => {
  const globals = globalThis as any;
  globals.__host ??= (kind: string, arg?: string) => onHost(kind, arg);
  globals.__hostBinary ??= (): null => null;
  const [{Context2D, flushCanvases}, {document}, {setHooks, ensureCreated}, {getComputedStyle}] = await Promise.all([
    import('widget-sandbox/sandbox/canvas'),
    import('widget-sandbox/sandbox/dom'),
    import('widget-sandbox/sandbox/capture'),
    import('widget-sandbox/sandbox/layout')
  ]);
  setHooks({elementCreated() {}, attributeChanged() {}, elementSynced() {}, flushExtra() {}});
  return {Context2D, flushCanvases, document, ensureCreated, getComputedStyle};
};

// The cap is on one canvas's commands in a send (4000 under strict), and tweb's shim sends them as several ops when
// canvases read each other, so that the renderer replays them in the order they were drawn (UPSTREAM.md, item 9).
describe('one canvas\'s commands in a send (canvas.ts, validator.ts)', () => {
  const draws = (count: number) => Array.from({length: count}, () => ['c', 'fillRect', 0, 0, 1, 1]);

  it('the validator counts a canvas\'s ops in a batch together', () => {
    const validator = new Validator(() => {});
    validator.setPolicy('strict');
    validator.processOps([{op: 'el', id: 2, tag: 'canvas'}, {op: 'el', id: 3, tag: 'canvas'}]);
    expect(validator.processOps([
      {op: 'canvas', id: 2, cmds: draws(2000)}, {op: 'canvas', id: 3, cmds: draws(4000)}, {op: 'canvas', id: 2, cmds: draws(2000)}
    ])).toHaveLength(3);
    expect(validator.stopped).toBeNull();
    // the next batch counts afresh
    expect(validator.processOps([{op: 'canvas', id: 2, cmds: draws(2000)}, {op: 'canvas', id: 2, cmds: draws(2001)}])).toEqual([]);
    expect(validator.stopped).toMatch(/^Canvas limit exceeded: 4001 commands/);
  });

  it('the shim throws at the 4001st however many segments another canvas reading this one cut them in', async() => {
    const {Context2D, flushCanvases, document} = await loadShim();
    const [a, b] = [document.createElement('canvas'), document.createElement('canvas')];
    const [contextA, contextB] = [new Context2D(a), new Context2D(b)];
    // three commands for A, then B draws A: A's three go aside, before B's
    const draw = () => {
      for(let i = 0; i < 2000; i++) {
        for(let j = 0; j < 3; j++) contextA.fillRect(0, 0, 1, 1);
        contextB.drawImage(a, 0, 0);
      }
    };
    expect(draw).toThrow(/^Canvas limit exceeded/);
    const sent = new Map<number, number>();
    flushCanvases(({id, cmds}) => sent.set(id, (sent.get(id) ?? 0) + cmds.length));
    expect(Math.max(...sent.values())).toBe(4000);
  });
});

// The engine in the renderer's frame (`frame`) stops on `stop` and lets its VM go: WidgetHost.suspend() keeps the frame
// and the picture, not the engine (16 MB of wasm memory). The warm-up's promise held what it made, and a warm-up the stop
// overtook made it after.
describe('an engine in the renderer\'s frame, stopped (host/glue.ts)', () => {
  const wasm = fs.readFileSync(path.join('src', 'vendor', 'widget-sandbox-quickjs', 'dist', 'emscripten-module.wasm'));
  const run = async(stopWhen: 'loaded' | 'warming') => {
    // the VM's memory, made by the glue
    const Memory = WebAssembly.Memory;
    let memory: WeakRef<WebAssembly.Memory>;
    WebAssembly.Memory = Object.assign(function(descriptor: WebAssembly.MemoryDescriptor) {
      const made = new Memory(descriptor);
      memory ??= new WeakRef(made);
      return made;
    }, {prototype: Memory.prototype}) as unknown as typeof WebAssembly.Memory;
    const posted: string[] = [];
    try {
      const glue = createGlue({post: (msg) => posted.push(msg.type), query: () => ({json: '{}'})});
      glue.receive({
        type: 'init', html: '', transport: 'frame', wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength),
        sandboxBundle: 'globalThis.__twDispatch = function() { return ""; };',
        config: {...LIMIT_DEFAULTS, visible: true, viewport: {innerWidth: 300, innerHeight: 300, dpr: 1}, theme: 'light'}
      });
      if(stopWhen === 'loaded') {
        for(let i = 0; i < 250 && !posted.includes('loaded'); i++) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      glue.receive({type: 'stop'});
      // a warm-up the stop overtook goes on to its end
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } finally {
      WebAssembly.Memory = Memory;
    }
    return {posted, collected: await isCollected(memory)};
  };

  it('lets the VM it ran go', async() => {
    const {posted, collected} = await run('loaded');
    expect(posted).toContain('loaded');
    expect(collected).toBe(true);
  });

  it('makes none when it stopped while the engine compiled', async() => {
    const {posted, collected} = await run('warming');
    expect(posted).not.toContain('warmed');
    expect(collected).toBe(true);
  });
});

// tweb's shim asks for one computed property alone (UPSTREAM.md, item 9); a script that enumerates a computed style gets
// the full answer (`length`), and a query a property would put it past the 128 a task may ask.
describe('a computed style in the shim (sandbox/layout.ts)', () => {
  it('enumerates with one query, and asks for a property alone only what the full answer lacks', async() => {
    const {document, ensureCreated, getComputedStyle} = await loadShim();
    const queries: {prop?: string}[] = [];
    const full: Record<string, string> = {'color': 'red', 'display': 'block', 'touch-action': 'auto'};
    onHost = (kind, arg) => {
      if(kind !== 'query') return;
      const q = JSON.parse(arg);
      queries.push(q);
      return JSON.stringify(q.prop ? (q.prop === 'margin' ? '1px' : full[q.prop] ?? '') : full);
    };
    const [listed, read] = [document.createElement('div'), document.createElement('div')];
    ensureCreated(listed);
    ensureCreated(read);

    const cs = getComputedStyle(listed);
    const values: string[] = [];
    for(let i = 0; i < cs.length; i++) values.push(cs.getPropertyValue(cs[i]));
    expect(values).toEqual(['red', 'block', 'auto']);
    expect(queries).toHaveLength(1);
    // a shorthand, which the full answer lacks
    expect(cs.margin).toBe('1px');
    expect(queries.map((q) => q.prop ?? null)).toEqual([null, 'margin']);

    // a property read without enumerating: asked for alone, not the some 400 a browser lists
    expect(getComputedStyle(read).color).toBe('red');
    expect(queries.map((q) => q.prop ?? null)).toEqual([null, 'margin', 'color']);
    onHost = () => undefined;
  });
});

/** What a renderer posted to its host. */
type Posted = {type: string, [key: string]: any};
/** The renderer suites' clean-up: what render() mocked and stubbed goes. */
const unrender = () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
};

/** The renderer core of one widget on a shadow root, as the shadow renderer makes it; its clock is `now`. */
const ID = {body: 2, p: 3};
let now = 1000;
const render = async(origin: () => null = () => null) => {
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  // one that keeps nothing it is handed (the setup's mock records every call)
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  const {createRenderer} = await import('widget-sandbox/renderer/core');
  const host = document.createElement('div');
  document.body.append(host);
  const root = host.attachShadow({mode: 'open'});
  const [html, head, body] = ['div', 'div', 'div'].map((tag) => document.createElement(tag));
  html.append(head, body);
  root.append(html);
  // © is an emoji of the client's
  const emoji = (text: string) => {
    const runs = text.split(/(©)/).filter(Boolean).map((part) => part === '©' ? {emoji: part, src: 'data:,'} : part);
    return runs.some((run) => typeof run !== 'string') ? runs : undefined;
  };
  const renderer = createRenderer({
    doc: document, root, roots: () => ({html, head, body}), origin, docHeight: () => 0, matchMedia: () => false,
    viewport: () => ({innerWidth: 300, innerHeight: 300, dpr: 1}), onViewportResize: () => () => {},
    onColorSchemeChange: () => () => {}, deferSize: true, emoji
  });
  const posted: Posted[] = [];
  renderer.init((msg) => posted.push(msg as typeof posted[number]));
  const ops = (...list: object[]) => renderer.onMessage({type: 'ops', ops: list});
  ops({op: 'el', id: ID.body, tag: 'body', attrs: [], adopt: 'body'}, {op: 'el', id: ID.p, tag: 'p', attrs: []}, {op: 'ins', parent: ID.body, id: ID.p, before: null});
  let nextId = 10;
  const text = (data: string) => {
    const id = nextId++;
    ops({op: 'text', id, data}, {op: 'ins', parent: ID.p, id, before: null});
    return id;
  };
  return {renderer, ops, text, images: () => body.querySelectorAll('tw-emoji').length, body, posted};
};

// The client's emoji (UPSTREAM.md, item 13) make a node, or a draw on a canvas, for each part of a text, where the
// validator counts and models one op: a widget's texts stand in at most 1024 parts beyond their first at once, and it
// makes at most 2048 of them a second (1024 at once). Canvases have no 2D context in jsdom: their part is in the e2e.
describe('a widget\'s text with the client\'s emoji (renderer/core.ts)', () => {
  afterEach(unrender);

  it('keeps a text of more parts than a widget may make at once in the platform\'s glyphs, whole', async() => {
    const {text, images, body} = await render();
    text('©'.repeat(5000));
    expect(images()).toBe(0);
    expect(body.textContent).toBe('©'.repeat(5000));
    text('a©b');
    expect(images()).toBe(1);
    expect(body.textContent).toBe('©'.repeat(5000) + 'a©b');
  });

  it('holds a widget\'s texts to 1024 parts at once, and gives those of a text that goes to the next', async() => {
    const {ops, text, images} = await render();
    // 64 parts, 63 beyond the first; a second apart, so that only the parts at once count
    const sixtyFour = 'a©'.repeat(32);
    const ids = Array.from({length: 16}, () => (now += 1000, text(sixtyFour)));
    expect(images()).toBe(16 * 32);
    now += 1000;
    text(sixtyFour);
    expect(images()).toBe(16 * 32);
    ops({op: 'rm', id: ids[0]});
    now += 1000;
    text(sixtyFour);
    expect(images()).toBe(16 * 32);
  });

  it('makes at most 2048 parts a second: a text edited past that keeps the platform\'s glyphs until there is room', async() => {
    const {ops, text, images} = await render();
    const sixtyFour = 'a©'.repeat(32);
    now += 1000;
    const id = text(sixtyFour);
    // each edit makes its 63 parts again: 1024 at once
    for(let i = 1; i < 16; i++) ops({op: 'data', id, data: sixtyFour});
    expect(images()).toBe(32);
    ops({op: 'data', id, data: sixtyFour});
    expect(images()).toBe(0);
    // 32 ms later: 65 more
    now += 32;
    ops({op: 'data', id, data: sixtyFour});
    expect(images()).toBe(32);
  });
});

// While a widget is hidden its renderer holds an element's own important play state paused (UPSTREAM.md, item 6): what
// the widget removes meanwhile goes, with what the renderer kept about it.
describe('a hidden widget\'s renderer (renderer/core.ts)', () => {
  afterEach(unrender);

  it('keeps nothing of an element the widget removed while hidden', async() => {
    const {renderer, ops, body} = await render();
    renderer.onMessage({type: 'visibility', visible: false});
    ops({op: 'el', id: 50, tag: 'div', attrs: [['id', 'x'], ['style', 'animation-play-state: running !important']]}, {op: 'ins', parent: ID.p, id: 50, before: null});
    const held = new WeakRef(body.querySelector<HTMLElement>('#x'));
    expect(held.deref().style.getPropertyValue('animation-play-state')).toBe('paused');
    ops({op: 'rm', id: 50});
    // jsdom's selector engine keeps the last nodes it matched
    document.querySelector('html');
    expect(await isCollected(held)).toBe(true);
  });
});

// The renderer keeps each pointer's last position for a move whose browser says it moved nothing (WebKit's synthetic
// ones). Touch browsers give every contact an id of its own: a tap's position goes with it, and its click keeps none.
describe('the positions of the pointers on a widget (renderer/core.ts)', () => {
  afterEach(unrender);

  /** A pointer event of `pointerType` at `x` (jsdom has no PointerEvent: a mouse event with a pointer's fields). */
  const pointer = (type: string, pointerId: number, pointerType: string, x: number) => {
    const e = new MouseEvent(type, {bubbles: true, composed: true, cancelable: true, clientX: x, clientY: 0, screenX: x, screenY: 0});
    Object.defineProperties(e, {pointerId: {value: pointerId}, pointerType: {value: pointerType}, isPrimary: {value: true}, pressure: {value: 0}});
    return e;
  };
  /** What the widget hears of a move of `pointerId` to `x` its browser says moved nothing: how far it moved (moves wait for a frame). */
  const movedBy = async(target: Element, posted: Posted[], pointerId: number, pointerType: string, x: number) => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    await frame();
    posted.length = 0;
    target.dispatchEvent(pointer('pointermove', pointerId, pointerType, x));
    await frame();
    return posted.find((msg) => msg.type === 'event' && msg.ev.type === 'pointermove' && msg.ev.pointerId === pointerId)?.ev.movementX;
  };

  it('keeps no tap\'s position past its end, nor more than a few pointers\' at all', async() => {
    const {renderer, body, posted} = await render();
    renderer.onMessage({type: 'listen', types: ['pointerdown', 'pointermove', 'pointerup', 'pointerout', 'pointerleave', 'click'], since: 0});
    const target = body.querySelector('p');
    // the fallback itself: a pen's move from where it was
    target.dispatchEvent(pointer('pointerdown', 2, 'pen', 10));
    expect(await movedBy(target, posted, 2, 'pen', 25)).toBe(15);
    // and a finger's, while it is down
    target.dispatchEvent(pointer('pointerdown', 9, 'touch', 10));
    expect(await movedBy(target, posted, 9, 'touch', 30)).toBe(20);
    target.dispatchEvent(pointer('pointerup', 9, 'touch', 30));
    // a tap, to its click: its id's next move (a contact of its own) has nothing to go from
    for(const type of ['pointerdown', 'pointerup', 'pointerout', 'pointerleave', 'click']) target.dispatchEvent(pointer(type, 7, 'touch', 10));
    expect(await movedBy(target, posted, 7, 'touch', 50)).toBe(0);
    // forty pens, each once: the first one's position is gone, the last one's kept
    for(let id = 100; id < 140; id++) target.dispatchEvent(pointer('pointermove', id, 'pen', 10));
    expect(await movedBy(target, posted, 100, 'pen', 30)).toBe(0);
    expect(await movedBy(target, posted, 139, 'pen', 30)).toBe(20);
  });
});

// The widget's origin on the page reads the layout (a renderer on a shadow root: two boxes and a computed width): only
// an event with a position is worth it — not every iteration of an animation the widget does not listen for.
describe('what serializing an event costs (renderer/core.ts)', () => {
  afterEach(unrender);

  it('measures the widget\'s origin for a pointer\'s event only', async() => {
    let measured = 0;
    const {body} = await render(() => {
      measured++;
      return null;
    });
    const target = body.querySelector('p');
    for(let i = 0; i < 10; i++) {
      const iteration = new Event('animationiteration', {bubbles: true, composed: true});
      Object.defineProperties(iteration, {animationName: {value: 'k'}, elapsedTime: {value: i}, pseudoElement: {value: ''}});
      target.dispatchEvent(iteration);
    }
    expect(measured).toBe(0);
    target.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true, detail: 1, clientX: 5}));
    expect(measured).toBe(1);
  });
});

// What may be a grid is read from the widget's declarations, matched by selector, never from a computed value (in a
// shadow root whose host is a size container that is a layout already): a state that changes without an op counts as
// held both ways (layout-policy.ts, UPSTREAM.md item 14).
describe('what may make a widget\'s element a grid (shared/layout-policy.ts)', () => {
  it('takes a display from elsewhere as a grid\'s', () => {
    for(const value of ['grid', 'inline-grid', 'var(--d)', 'var(--d, block)', 'inherit', 'revert-layer', 'attr(data-d type(<custom-ident>))']) {
      expect(mayDisplayGrid(value)).toBe(true);
    }
    for(const value of ['', 'block', 'flex', 'none', 'inline', 'revert', 'initial', 'unset', 'table']) {
      expect(mayDisplayGrid(value)).toBe(false);
    }
    expect(mayAllGrid('inherit')).toBe(true);
    expect(mayAllGrid('var(--a)')).toBe(true);
    expect(mayAllGrid('unset')).toBe(false);
  });

  it('widens a selector to every state of the user\'s and every attribute the renderer or the browser writes', () => {
    const cases: [string, string][] = [
      ['.a:hover > .b', '.a:is(*) > .b'],
      ['div:not(:hover)', 'div:is(*)'],
      ['div:not(.x) span', 'div:not(.x) span'],
      ['li:nth-child(2n+1):first-child', 'li:nth-child(2n+1):first-child'],
      ['li:nth-child(2 of .a:hover)', 'li:is(*)'],
      [':is(.a:focus-visible, .b) .c', ':is(.a:is(*), .b) .c'],
      [':has(> .a:checked) .b', ':has(> .a:is(*)) .b'],
      ['[style*="grid"] .x', ':is(*) .x'],
      ['details[open] > div', 'details:is(*) > div'],
      ['[data-tw-active] .x, [data-x] .y', ':is(*) .x, [data-x] .y'],
      ['[data-x="a:hover"]', '[data-x="a:hover"]'],
      ['.a\\:hover', '.a\\:hover'],
      ['p::before, p:after', 'p:is(*), p:is(*)'],
      [':root .a', ':root .a'],
      ['div:lang(ar) > .a, :dir(rtl) .b', 'div:is(*) > .a, :is(*) .b']
    ];
    for(const [selector, widened] of cases) expect(widenSelector(selector)).toBe(widened);
  });
});

// The layout budget (renderer/core.ts, layout-policy.ts): every node is laid out afresh once for each pass of the
// elements above it that may be grids, two a level — 100,000 boxes and 50 more a node.
describe('the layout budget (renderer/core.ts)', () => {
  afterEach(unrender);

  /** `depth` divs nested in `parent` (the widget's <p>), from id 100, each with `attrs`. */
  const nested = (depth: number, attrs: [string, string][] = [], parent = ID.p): object[] => Array.from({length: depth}, (_, i): object[] => [
    {op: 'el', id: 100 + i, tag: 'div', attrs: [['id', 'd' + i], ...attrs]},
    {op: 'ins', parent: i ? 100 + i - 1 : parent, id: 100 + i, before: null}
  ]).flat();
  /** A script's animation `aid` of `target` whose one keyframe sets `display`. */
  const displayAnimation = (aid: number, target: number, display: string) => ({
    aid, target, keyframes: [{offset: 0, easing: 'linear', composite: null as string, values: {display}}],
    timing: {duration: 1000, delay: 0, endDelay: 0, iterations: 1, iterationStart: 0, direction: 'normal', fill: 'both', easing: 'linear'},
    composite: 'replace', iterationComposite: 'replace', startTime: 0, holdTime: null as number, playbackRate: 1
  });
  const sheet = (css: string): object[] => [
    {op: 'el', id: 90, tag: 'style', attrs: []}, {op: 'ins', parent: ID.body, id: 90, before: null}, {op: 'css', id: 90, text: css}
  ];
  const limits = (posted: Posted[]) => posted.filter((msg) => msg.type === 'limit');
  const hidden = (body: HTMLElement) => [...body.querySelectorAll<HTMLElement>('[id^="d"]')]
  .filter((el) => el.style.getPropertyValue('display') === 'none' && el.style.getPropertyPriority('display') === 'important')
  .map((el) => el.id);

  it('stops a widget whose nested grids pass it before any layout, the grids from the level past it taken away', async() => {
    const {ops, posted, body} = await render();
    // in a batch with a scroll after them: the scroll is a layout, and it does not come
    ops(...sheet('div{display:grid}'), ...nested(30), {op: 'prop', id: 129, name: 'scrollTop', value: 10},
      {op: 'el', id: 200, tag: 'span', attrs: [['id', 'after']]}, {op: 'ins', parent: ID.p, id: 200, before: null});
    expect(limits(posted)).toEqual([expect.objectContaining({code: 'layout-limit'})]);
    // the body (a div: a grid), the <p> and the <style> under it, the 30 divs: 33 nodes, a budget of 101,650 boxes. The
    // body is laid out once, the <p>, the <style> and d0 twice, d(i) 2^(i+1) times: the nodes with at most 15 grids
    // above them come to 2^16 + 3 boxes, with 16 to 2^17 + 3. The grids with 15 above them go: d14, and what it holds.
    expect(layoutBudget(33)).toBe(101_650);
    expect(hidden(body)).toEqual(['d14']);
    expect(body.querySelector('#after')).toBeNull();
    // and the widget takes nothing more
    ops({op: 'el', id: 201, tag: 'span', attrs: [['id', 'later']]}, {op: 'ins', parent: ID.p, id: 201, before: null});
    expect(body.querySelector('#later')).toBeNull();
    expect(limits(posted)).toHaveLength(1);
  });

  it('counts what a user\'s state, a substitution, an inline style or a script\'s keyframes may make a grid', async() => {
    const variants: [string, () => Promise<void>][] = [
      ['a :hover rule', async() => {
        const {ops, posted} = await render();
        ops(...sheet('.never-hovered:hover div{display:grid}'), {op: 'attr', id: ID.p, name: 'class', value: 'never-hovered'}, ...nested(30));
        expect(limits(posted)).toHaveLength(1);
      }],
      ['a var() display', async() => {
        const {ops, posted} = await render();
        ops(...sheet('div{display:var(--d,block)}'), ...nested(30));
        expect(limits(posted)).toHaveLength(1);
      }],
      ['an inline style', async() => {
        const {ops, posted} = await render();
        ops(...nested(30, [['style', 'display: grid']]));
        expect(limits(posted)).toHaveLength(1);
      }],
      ['a script\'s keyframes', async() => {
        const {renderer, ops, posted} = await render();
        ops(...nested(30));
        expect(limits(posted)).toHaveLength(0);
        renderer.onMessage({type: 'anim', now: 0, anims: Array.from({length: 30}, (_, i) => displayAnimation(i + 1, 100 + i, 'grid'))});
        expect(limits(posted)).toHaveLength(1);
      }],
      ['an animation shorthand that waits for a substitution (its longhands are empty strings until then)', async() => {
        const {ops, posted} = await render();
        ops(...sheet('@keyframes k{from,to{display:grid}}div{--a:k 1s infinite;animation:var(--a)}'), ...nested(30));
        expect(limits(posted)).toHaveLength(1);
      }]
    ];
    for(const [name, run] of variants) {
      await run().catch((error) => {
        throw new Error(name + ': ' + error.message);
      });
      unrender();
    }
  });

  it('counts again when a text changes: the client\'s emoji put it in an element, which a sibling selector sees', async() => {
    const {ops, posted} = await render();
    // a plain text before the divs is no element: `* + #d0` matches nothing
    ops(...sheet('* + #d0, * + #d0 div{display:grid}'), {op: 'text', id: 80, data: 'plain'}, {op: 'ins', parent: ID.p, id: 80, before: null}, ...nested(30));
    expect(limits(posted)).toHaveLength(0);
    // with an emoji of the client's it stands in a <tw-text> before them, and all 30 are grids
    ops({op: 'data', id: 80, data: 'a©b'});
    expect(limits(posted)).toHaveLength(1);
  });

  it('forgets a script\'s animation that may make a grid once it is removed or given other keyframes', async() => {
    const {renderer, ops, posted} = await render();
    ops(...nested(30));
    // one nested div after another made a grid and let go: never more than one at once
    for(let i = 0; i < 30; i++) {
      renderer.onMessage({type: 'anim', now: 0, anims: [displayAnimation(i + 1, 100 + i, 'grid')]});
      renderer.onMessage({type: 'anim', now: 0, anims: i % 2 ? [{aid: i + 1, remove: true}] : [displayAnimation(i + 1, 100 + i, 'block')]});
    }
    expect(limits(posted)).toHaveLength(0);
  });

  it('counts the widget built out of the page with its sheets, before it is put in', async() => {
    // read from the sheet's text: one without a grid stops nothing
    for(const [css, stops] of [['div div{color:red}', 0], ['div div{display:grid}', 1]] as const) {
      const {ops, posted, body} = await render();
      (body.getRootNode() as ShadowRoot).host.remove();
      ops(...sheet(css), ...nested(30));
      expect(limits(posted)).toHaveLength(stops);
      unrender();
    }
  });

  it('counts again after the renderer changes the DOM itself: its stopped badge makes a sibling selector match', async() => {
    const {renderer, ops, posted, body} = await render();
    // the last of the body's children: `:not(:last-child)` matches it once the badge comes after it
    ops(...sheet('.late:not(:last-child) div{display:grid}'), {op: 'el', id: 60, tag: 'div', attrs: [['class', 'late']]},
      {op: 'ins', parent: ID.body, id: 60, before: null}, ...nested(30, [], 60));
    expect(limits(posted)).toHaveLength(0);
    renderer.onMessage({type: 'frozen', reason: 'CPU limit exceeded', fatal: true});
    expect(body.querySelector('[data-tw-badge]')).not.toBeNull();
    expect(hidden(body)).toHaveLength(1);
  });

  it('lets a widget of grids in grids in grids run, whatever it holds (1500 nodes under the third)', async() => {
    const {ops, posted} = await render();
    ops(...sheet('.g{display:grid}'), ...nested(3, [['class', 'g']]),
      ...Array.from({length: 1500}, (_, i): object[] => [{op: 'el', id: 1000 + i, tag: 'span', attrs: []}, {op: 'ins', parent: 102, id: 1000 + i, before: null}]).flat());
    expect(limits(posted)).toHaveLength(0);
  });
});
