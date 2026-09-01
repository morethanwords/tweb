import {afterEach, describe, expect, it, vi} from 'vitest';
import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';

const mocks = vi.hoisted(() => {
  class IntersectionObserverMock {
    public observe() {}
    public unobserve() {}
    public disconnect() {}
    public takeRecords(): IntersectionObserverEntry[] { return []; }
  }

  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/webp;base64,';
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
  vi.stubGlobal('CSS', {supports: () => true});
  vi.stubGlobal('Worker', class Worker {
    public addEventListener() {}
    public removeEventListener() {}
    public postMessage() {}
    public terminate() {}
  });
  return {acquireStream: vi.fn()};
});

vi.mock('@lib/calls/helpers/getAudioConstraints', () => ({
  default: (deviceId?: string) => ({deviceId})
}));

vi.mock('@lib/calls/helpers/acquireStream', () => ({
  default: mocks.acquireStream
}));

vi.mock('@lib/calls/applyDeviceToActiveCall', () => ({
  changeCallDevice: vi.fn()
}));

vi.mock('@components/rtmp/outputDevicePopup', () => ({
  default: vi.fn()
}));

vi.mock('@stores/appSettings', () => ({
  useAppSettings: () => [{callDevices: {}}]
}));

vi.mock('@lib/richTextProcessor/wrapEmojiText', () => ({
  default: (text: string) => text
}));

vi.mock('@components/toast', () => ({
  toastNew: vi.fn()
}));

vi.mock('@components/section', () => ({
  default: (props: {children: any}) => <section>{props.children}</section>
}));

vi.mock('@components/rowTsx', () => {
  const Row = (props: {children: any}) => <div>{props.children}</div>;
  Row.Title = (props: {children: any}) => <span>{props.children}</span>;
  return {default: Row};
});

import MicrophoneLevelMeter from '@components/call/microphoneLevelMeter';
import CallCameraSection from '@components/call/cameraSection';
import {useCallDeviceSettings} from '@components/call/callDeviceSettings';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

function stubMediaDevices() {
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: {
      addEventListener: vi.fn(),
      enumerateDevices: vi.fn().mockResolvedValue([]),
      removeEventListener: vi.fn()
    }
  });
}

function TestCameraSection() {
  return <CallCameraSection settings={useCallDeviceSettings()} />;
}

afterEach(() => {
  mocks.acquireStream.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('conference UI lifecycle', () => {
  it('closes every microphone AudioContext on device change and unmount', async() => {
    const contexts: Array<{close: ReturnType<typeof vi.fn>}> = [];
    class AudioContextMock {
      public close = vi.fn().mockResolvedValue(undefined);

      constructor() {
        contexts.push(this);
      }

      public createMediaStreamSource() {
        return {connect: vi.fn(), disconnect: vi.fn()};
      }

      public createAnalyser() {
        return {
          disconnect: vi.fn(),
          fftSize: 0,
          frequencyBinCount: 1,
          getByteFrequencyData: vi.fn(),
          smoothingTimeConstant: 0
        };
      }
    }

    vi.stubGlobal('AudioContext', AudioContextMock);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const disposals = [vi.fn(), vi.fn()];
    mocks.acquireStream
    .mockReturnValueOnce({promise: Promise.resolve({}), dispose: disposals[0]})
    .mockReturnValueOnce({promise: Promise.resolve({}), dispose: disposals[1]});

    const host = document.createElement('div');
    const [deviceId, setDeviceId] = createSignal('mic-a');
    const dispose = render(() => <MicrophoneLevelMeter deviceId={deviceId()} />, host);
    await flushPromises();

    expect(contexts).toHaveLength(1);
    setDeviceId('mic-b');
    await flushPromises();

    expect(disposals[0]).toHaveBeenCalledTimes(1);
    expect(contexts[0].close).toHaveBeenCalledTimes(1);
    expect(contexts).toHaveLength(2);

    dispose();
    expect(disposals[1]).toHaveBeenCalledTimes(1);
    expect(contexts[1].close).toHaveBeenCalledTimes(1);
  });

  it('disposes an in-flight camera preview on unmount', () => {
    const disposeAcquisition = vi.fn();
    mocks.acquireStream.mockReturnValue({
      promise: new Promise(() => {}),
      dispose: disposeAcquisition
    });
    stubMediaDevices();

    const host = document.createElement('div');
    const dispose = render(() => <TestCameraSection />, host);
    expect(mocks.acquireStream).toHaveBeenCalledTimes(1);

    dispose();
    expect(disposeAcquisition).toHaveBeenCalledTimes(1);
  });

  it('shows a localized live camera error without exposing the browser message', async() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const disposeAcquisition = vi.fn();
    mocks.acquireStream.mockReturnValue({
      promise: Promise.reject(new Error('raw camera permission text')),
      dispose: disposeAcquisition
    });
    stubMediaDevices();

    const host = document.createElement('div');
    const dispose = render(() => <TestCameraSection />, host);
    await flushPromises();

    const status = host.querySelector('.speakers-and-camera-preview-error') as HTMLElement;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');
    expect(status.textContent).toBe('CallSettings.CameraUnavailable');
    expect(status.textContent).not.toContain('raw camera permission text');
    expect(host.textContent).toContain('CallSettings.Camera');
    expect(host.querySelector('.speakers-and-camera-preview')).toBeNull();

    dispose();
    expect(disposeAcquisition).toHaveBeenCalledTimes(1);
  });

  it('shows a localized live error without exposing a raw browser message', async() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.acquireStream.mockReturnValue({
      promise: Promise.reject(new Error('raw browser permission text')),
      dispose: vi.fn()
    });

    const host = document.createElement('div');
    const dispose = render(() => <MicrophoneLevelMeter />, host);
    await flushPromises();

    const status = host.querySelector('[role="status"]') as HTMLElement;
    expect(status.textContent).toBe('CallSettings.MicrophoneUnavailable');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).not.toContain('raw browser permission text');
    expect(host.querySelector('.microphone-level-meter')?.hasAttribute('title')).toBe(false);
    dispose();
  });
});
