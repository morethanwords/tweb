import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  getStream: vi.fn(),
  managers: [] as Array<{added: MediaStream[]}>
}));

vi.mock('@lib/calls/helpers/getAudioConstraints', () => ({
  default: () => ({deviceId: {exact: 'microphone'}})
}));
vi.mock('@lib/calls/helpers/getVideoConstraints', () => ({
  default: () => ({deviceId: {exact: 'camera'}})
}));
vi.mock('@lib/calls/helpers/getStream', () => ({default: mocks.getStream}));
vi.mock('@lib/logger', () => ({
  logger: () => Object.assign(vi.fn(), {error: vi.fn()})
}));
vi.mock('@lib/calls/streamManager', () => ({
  default: class StreamManager {
    public added: MediaStream[] = [];
    public inputStream = {} as MediaStream;

    constructor() {
      mocks.managers.push(this);
    }

    public addStream(stream: MediaStream) {
      this.added.push(stream);
    }
  }
}));

import createMainStreamManager from '@lib/calls/helpers/createMainStreamManager';

function makeStream(kind: 'audio' | 'video'): MediaStream {
  return {kind} as unknown as MediaStream;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.managers.length = 0;
});

describe('createMainStreamManager media fallback', () => {
  it('preserves microphone capture when the combined request fails only for camera', async() => {
    const combinedError = new Error('combined failed');
    const cameraError = new Error('camera denied');
    const audioStream = makeStream('audio');
    mocks.getStream
    .mockRejectedValueOnce(combinedError)
    .mockResolvedValueOnce(audioStream)
    .mockRejectedValueOnce(cameraError);

    const manager = await createMainStreamManager(false, true);

    expect(mocks.managers[mocks.managers.length - 1]?.added).toEqual([audioStream]);
    expect(manager.audioInputError).toBeUndefined();
    expect(manager.inputError).toBeUndefined();
    expect(manager.videoInputError).toBe(cameraError);
    expect(mocks.getStream).toHaveBeenNthCalledWith(2, {
      audio: {deviceId: {exact: 'microphone'}}
    }, false);
    expect(mocks.getStream).toHaveBeenNthCalledWith(3, {
      video: {deviceId: {exact: 'camera'}}
    });
  });

  it('preserves camera capture and identifies a microphone-only failure', async() => {
    const microphoneError = new Error('microphone denied');
    const videoStream = makeStream('video');
    mocks.getStream
    .mockRejectedValueOnce(new Error('combined failed'))
    .mockRejectedValueOnce(microphoneError)
    .mockResolvedValueOnce(videoStream);

    const manager = await createMainStreamManager(true, true);

    expect(mocks.managers[mocks.managers.length - 1]?.added).toEqual([videoStream]);
    expect(manager.audioInputError).toBe(microphoneError);
    expect(manager.inputError).toBe(microphoneError);
    expect(manager.videoInputError).toBeUndefined();
  });

  it('keeps the single combined acquisition on the success path', async() => {
    const stream = makeStream('audio');
    mocks.getStream.mockResolvedValue(stream);

    const manager = await createMainStreamManager(true, true);

    expect(mocks.managers[mocks.managers.length - 1]?.added).toEqual([stream]);
    expect(mocks.getStream).toHaveBeenCalledTimes(1);
    expect(manager.audioInputError).toBeUndefined();
    expect(manager.videoInputError).toBeUndefined();
  });
});
