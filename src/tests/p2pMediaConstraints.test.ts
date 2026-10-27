/*
 * What a 1-on-1 call asks the camera and the screen for (p2P/utils
 * getUserStream). Without constraints the browser picked 640×480 for the
 * camera and an unbounded, untuned capture for the screen.
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  appSettings: {callDevices: {cameraId: '', microphoneId: ''}} as {callDevices: Record<string, string>},
  getStream: vi.fn()
}));

vi.mock('@stores/appSettings', () => ({appSettings: mocks.appSettings}));
vi.mock('@lib/calls/helpers/getStream', () => ({default: mocks.getStream}));

import {getP2pVideoConstraints, getUserStream} from '@lib/calls/p2P/utils';

const CAMERA_720P = {
  width: {ideal: 1280, max: 1920},
  height: {ideal: 720, max: 1080},
  frameRate: {ideal: 30, max: 30}
};

beforeEach(() => {
  mocks.appSettings.callDevices = {cameraId: '', microphoneId: ''};
  mocks.getStream.mockReset().mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('P2P camera capture', () => {
  it('asks for 720p30 facing the requested way when no camera was picked', async() => {
    await getUserStream('video', 'environment');

    expect(mocks.getStream).toHaveBeenCalledWith({
      audio: false,
      video: {...CAMERA_720P, facingMode: 'environment'}
    });
  });

  it('asks the picked camera for 720p30, without a facingMode next to its id', async() => {
    mocks.appSettings.callDevices.cameraId = 'camera-1';

    await getUserStream('video', 'user');

    const {video} = mocks.getStream.mock.calls[0][0];
    expect(video).toEqual({...CAMERA_720P, deviceId: {exact: 'camera-1'}});
    expect(video).not.toHaveProperty('facingMode');
  });

  it('gives a device switch the same constraints', () => {
    mocks.appSettings.callDevices.cameraId = 'camera-1';

    expect(getP2pVideoConstraints('user', 'camera-2')).toEqual({...CAMERA_720P, deviceId: {exact: 'camera-2'}});
    // '' is "the system default", not "the saved camera".
    expect(getP2pVideoConstraints('user', '')).toEqual({...CAMERA_720P, facingMode: 'user'});
  });
});

describe('P2P screen capture', () => {
  it('shares the screen the way a group call does: ≤1080p30, no audio, a text hint', async() => {
    const track = {contentHint: ''};
    const stream = {getVideoTracks: () => [track]};
    const getDisplayMedia = vi.fn(async() => stream);
    vi.stubGlobal('navigator', {...navigator, mediaDevices: {getDisplayMedia}});

    await expect(getUserStream('presentation')).resolves.toBe(stream);

    expect(getDisplayMedia).toHaveBeenCalledWith({
      video: {width: {max: 1920}, height: {max: 1080}, frameRate: {max: 30}}
    });
    expect(track.contentHint).toBe('text');
    expect(mocks.getStream).not.toHaveBeenCalled();
  });
});
