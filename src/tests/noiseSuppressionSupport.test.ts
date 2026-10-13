/*
 * Where calls denoise the microphone with RNNoise, and where the "Noise
 * suppression" switch drives the browser's own suppression instead: Safari
 * (every iOS browser included) keeps Apple's voice processing alone. And the
 * model loaded ahead of a call, where it will run.
 */
import {afterEach, describe, expect, it, vi} from 'vitest';

const browser = vi.hoisted(() => ({IS_SAFARI: false}));
const settings = vi.hoisted(() => ({callDevices: {noiseSuppression: true}}));
vi.mock('@environment/userAgent', async(importOriginal) => ({
  ...await importOriginal<typeof import('@environment/userAgent')>(),
  get IS_SAFARI() {
    return browser.IS_SAFARI;
  }
}));
vi.mock('@stores/appSettings', async(importOriginal) => ({
  ...await importOriginal<typeof import('@stores/appSettings')>(),
  appSettings: settings
}));
vi.mock('@environment/webAssemblyBaselineSupport', () => ({default: true}));
vi.mock('@environment/webAssemblySimdSupport', () => ({default: true}));

async function load(isSafari: boolean, noiseSuppression = true) {
  browser.IS_SAFARI = isSafari;
  settings.callDevices.noiseSuppression = noiseSuppression;
  vi.resetModules();
  vi.stubGlobal('AudioWorkletNode', class {});
  vi.stubGlobal('MediaStreamAudioDestinationNode', class {});
  return import('@lib/calls/noiseSuppression/noiseSuppression');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('call noise suppression support', () => {
  it('runs RNNoise where the browser can, with its own suppression off', async() => {
    const module = await load(false);
    expect(module.IS_RNNOISE_SUPPORTED).toBe(true);
    expect(module.shouldUseRnnoise()).toBe(true);
    expect(module.shouldUseBrowserNoiseSuppression()).toBe(false);
  });

  it('leaves Safari to the browser\'s suppression', async() => {
    const module = await load(true);
    expect(module.IS_RNNOISE_SUPPORTED).toBe(false);
    expect(module.shouldUseRnnoise()).toBe(false);
    expect(module.shouldUseBrowserNoiseSuppression()).toBe(true);
  });

  it('loads the model ahead of a call once, and only where RNNoise will run', async() => {
    const fetch = vi.fn(async() => ({ok: true, arrayBuffer: async() => new ArrayBuffer(8)}));

    let module = await load(false);
    vi.stubGlobal('fetch', fetch);
    module.preloadNoiseSuppression();
    module.preloadNoiseSuppression();
    // The code and the weights, once for the tab.
    expect(fetch).toHaveBeenCalledTimes(2);

    fetch.mockClear();
    module = await load(true);
    vi.stubGlobal('fetch', fetch);
    module.preloadNoiseSuppression();

    // The switch is off.
    module = await load(false, false);
    vi.stubGlobal('fetch', fetch);
    module.preloadNoiseSuppression();
    expect(fetch).not.toHaveBeenCalled();
  });
});
