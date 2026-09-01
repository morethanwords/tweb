import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  appSettings: {
    callDevices: {
      cameraId: '',
      microphoneId: ''
    }
  },
  getUserMedia: vi.fn(),
  setAppSettings: vi.fn()
}));

vi.mock('@stores/appSettings', () => ({
  appSettings: mocks.appSettings,
  setAppSettings: mocks.setAppSettings
}));
vi.mock('@lib/logger', () => ({
  logger: () => Object.assign(vi.fn(), {warn: vi.fn()})
}));

import getStream from '@lib/calls/helpers/getStream';

type FakeTrack = {enabled: boolean, kind: 'audio' | 'video'};

function makeStream(audioTrack?: FakeTrack, videoTrack?: FakeTrack): MediaStream {
  const tracks = [audioTrack, videoTrack].filter(Boolean) as FakeTrack[];
  return {
    getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
    getVideoTracks: () => tracks.filter((track) => track.kind === 'video'),
    getTracks: () => tracks
  } as unknown as MediaStream;
}

function missingDeviceError(): Error {
  return Object.assign(new Error('missing device'), {name: 'NotFoundError'});
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.appSettings.callDevices.cameraId = '';
  mocks.appSettings.callDevices.microphoneId = '';
  vi.stubGlobal('navigator', {mediaDevices: {getUserMedia: mocks.getUserMedia}});
});

describe('getStream stale device recovery', () => {
  it('does not clear a newer persisted microphone after an older request fails', async() => {
    mocks.appSettings.callDevices.microphoneId = 'mic-b';
    const fallback = makeStream({enabled: true, kind: 'audio'});
    mocks.getUserMedia.mockRejectedValueOnce(missingDeviceError()).mockResolvedValueOnce(fallback);

    await expect(getStream({
      audio: {deviceId: {exact: 'mic-a'}}
    })).resolves.toBe(fallback);

    expect(mocks.setAppSettings).not.toHaveBeenCalled();
    expect(mocks.getUserMedia).toHaveBeenNthCalledWith(2, {audio: {}, video: undefined});
  });

  it('clears only the exact persisted id that failed', async() => {
    mocks.appSettings.callDevices.microphoneId = 'mic-a';
    mocks.getUserMedia.mockRejectedValueOnce(missingDeviceError()).mockResolvedValueOnce(
      makeStream({enabled: true, kind: 'audio'})
    );

    await getStream({audio: {deviceId: {exact: 'mic-a'}}});

    expect(mocks.setAppSettings).toHaveBeenCalledWith('callDevices', 'microphoneId', '');
  });

  it('keeps the exact microphone when only the camera is stale', async() => {
    mocks.appSettings.callDevices.microphoneId = 'mic-a';
    mocks.appSettings.callDevices.cameraId = 'camera-a';
    const fallback = makeStream(
      {enabled: true, kind: 'audio'},
      {enabled: true, kind: 'video'}
    );
    mocks.getUserMedia
    .mockRejectedValueOnce(missingDeviceError())
    .mockResolvedValueOnce(fallback);

    await expect(getStream({
      audio: {deviceId: {exact: 'mic-a'}},
      video: {deviceId: {exact: 'camera-a'}}
    })).resolves.toBe(fallback);

    expect(mocks.setAppSettings).toHaveBeenCalledTimes(1);
    expect(mocks.setAppSettings).toHaveBeenCalledWith('callDevices', 'cameraId', '');
    expect(mocks.getUserMedia).toHaveBeenNthCalledWith(2, {
      audio: {deviceId: {exact: 'mic-a'}},
      video: {}
    });
  });

  it('keeps the exact camera when only the microphone is stale', async() => {
    mocks.appSettings.callDevices.microphoneId = 'mic-a';
    mocks.appSettings.callDevices.cameraId = 'camera-a';
    const fallback = makeStream(
      {enabled: true, kind: 'audio'},
      {enabled: true, kind: 'video'}
    );
    mocks.getUserMedia
    .mockRejectedValueOnce(missingDeviceError())
    .mockRejectedValueOnce(missingDeviceError())
    .mockResolvedValueOnce(fallback);

    await expect(getStream({
      audio: {deviceId: {exact: 'mic-a'}},
      video: {deviceId: {exact: 'camera-a'}}
    })).resolves.toBe(fallback);

    expect(mocks.setAppSettings).toHaveBeenCalledTimes(1);
    expect(mocks.setAppSettings).toHaveBeenCalledWith('callDevices', 'microphoneId', '');
    expect(mocks.getUserMedia).toHaveBeenNthCalledWith(3, {
      audio: {},
      video: {deviceId: {exact: 'camera-a'}}
    });
  });

  it('applies call mute intent only to audio in a combined stream', async() => {
    const audioTrack: FakeTrack = {enabled: true, kind: 'audio'};
    const videoTrack: FakeTrack = {enabled: true, kind: 'video'};
    mocks.getUserMedia.mockResolvedValue(makeStream(audioTrack, videoTrack));

    await getStream({audio: true, video: true}, true);

    expect(audioTrack.enabled).toBe(false);
    expect(videoTrack.enabled).toBe(true);
  });
});
