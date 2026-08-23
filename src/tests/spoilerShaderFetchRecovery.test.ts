import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import DotRendererCore from '@components/dotRendererCore';
import withTimeout from '@helpers/schedulers/withTimeout';

const VERTEX_URL = 'https://tweb.test/vertex.glsl';
const FRAGMENT_URL = 'https://tweb.test/fragment.glsl';

const getShaderTexts = () => (DotRendererCore as any).shaderTexts as {[url: string]: unknown};

function makeCore() {
  const context = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    createShader: () => ({}),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => true,
    getShaderInfoLog: () => ''
  };

  const canvas = {getContext: () => context} as any;
  return new DotRendererCore(canvas, {vertex: VERTEX_URL, fragment: FRAGMENT_URL});
}

describe('withTimeout', () => {
  test('passes a settled value straight through', async() => {
    await expect(withTimeout(Promise.resolve('done'), 1000, 'fallback')).resolves.toBe('done');
  });

  test('resolves with the fallback when the promise never settles', async() => {
    await expect(withTimeout(new Promise(() => {}), 5, 'fallback')).resolves.toBe('fallback');
  });

  test('still propagates a rejection', async() => {
    await expect(withTimeout(Promise.reject(new Error('nope')), 1000, 'fallback')).rejects.toThrow('nope');
  });
});

describe('spoiler shader fetch recovery', () => {
  beforeEach(() => {
    const texts = getShaderTexts();
    for(const url in texts) {
      delete texts[url];
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('a failed shader fetch is not memoized, so a later spoiler can retry', async() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network'))));

    const core = makeCore();
    await expect(core.init()).rejects.toThrow('network');

    // the whole bug: `shaderTexts[url] ??= fetch(...)` used to keep handing the dead promise to
    // every later attempt, so one stalled request disabled spoilers — and therefore every chat
    // containing one — for the rest of the session
    expect(getShaderTexts()[VERTEX_URL]).toBeUndefined();
    expect(getShaderTexts()[FRAGMENT_URL]).toBeUndefined();

    const fetchMock = vi.fn(() => Promise.reject(new Error('network again')));
    vi.stubGlobal('fetch', fetchMock);

    await expect(makeCore().init()).rejects.toThrow('network again');
    expect(fetchMock).toHaveBeenCalled();
  });

  test('a failed init is not memoized on the instance either', async() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network'))));

    const core = makeCore();
    await expect(core.init()).rejects.toThrow('network');

    expect((core as any).initPromise).toBeUndefined();
  });

  test('a hanging shader fetch does not block the spoiler past its deadline', async() => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

    const core = makeCore();
    const readyResult = core.init() as Promise<boolean>;

    // `wrapMediaSpoiler` awaits this result; bounding it is what keeps a silent renderer from
    // parking the message batch — and with it the chat's whole peer change
    await expect(withTimeout(readyResult, 10, 'timed-out')).resolves.toBe('timed-out');
  });
});

describe('withTimeout timer hygiene', () => {
  test('clears its timer once the promise settles first', async() => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    await withTimeout(Promise.resolve('done'), 60000, 'fallback');
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  test('clears its timer when the promise rejects first', async() => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    await expect(withTimeout(Promise.reject(new Error('nope')), 60000, 'fallback')).rejects.toThrow('nope');
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
