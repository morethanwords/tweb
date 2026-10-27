import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  appSettings: {
    callDevices: {
      cameraId: '',
      microphoneId: '',
      speakerId: ''
    }
  },
  call: undefined as any,
  setAppSettings: vi.fn()
}));

vi.mock('@stores/appSettings', () => ({
  appSettings: mocks.appSettings,
  setAppSettings: mocks.setAppSettings
}));
vi.mock('@lib/calls/callsController', () => ({
  default: {
    get currentCall() {
      return mocks.call;
    }
  }
}));
vi.mock('@lib/calls/groupCallsController', () => ({default: {groupCall: undefined}}));

import {changeCallDevice, recaptureCallMicrophone} from '@lib/calls/applyDeviceToActiveCall';
import deferred from './helpers/deferred';


beforeEach(() => {
  vi.clearAllMocks();
  mocks.appSettings.callDevices.cameraId = '';
  mocks.appSettings.callDevices.microphoneId = '';
  mocks.appSettings.callDevices.speakerId = '';
  mocks.setAppSettings.mockImplementation((_section, key: keyof typeof mocks.appSettings.callDevices, value: string) => {
    mocks.appSettings.callDevices[key] = value;
  });
  mocks.call = undefined;
});

describe('transactional call device persistence', () => {
  it('rolls the persisted speaker back when the live sink rejects', async() => {
    mocks.appSettings.callDevices.speakerId = 'speaker-old';
    const error = new Error('setSinkId rejected');
    mocks.call = {setOutputDeviceId: vi.fn().mockRejectedValue(error)};

    const change = changeCallDevice('speaker', 'speaker-new');
    expect(mocks.appSettings.callDevices.speakerId).toBe('speaker-new');
    await expect(change).rejects.toBe(error);
    expect(mocks.appSettings.callDevices.speakerId).toBe('speaker-old');
  });

  it('does not let an older failure roll back a newer microphone selection', async() => {
    const changeAResult = deferred<boolean>();
    const changeBResult = deferred<boolean>();
    mocks.call = {
      setInputAudioDeviceId: vi.fn()
      .mockReturnValueOnce(changeAResult.promise)
      .mockReturnValueOnce(changeBResult.promise)
    };

    const changeA = changeCallDevice('microphone', 'mic-a');
    const changeB = changeCallDevice('microphone', 'mic-b');
    changeAResult.reject(new Error('mic-a disappeared'));
    await expect(changeA).resolves.toBe(false);
    expect(mocks.appSettings.callDevices.microphoneId).toBe('mic-b');

    changeBResult.resolve(true);
    await expect(changeB).resolves.toBe(true);
    expect(mocks.appSettings.callDevices.microphoneId).toBe('mic-b');
  });

  it('keeps the cleared default after getStream recovers a missing camera', async() => {
    mocks.call = {
      setInputVideoDeviceId: vi.fn(async() => {
        mocks.appSettings.callDevices.cameraId = '';
        return true;
      })
    };

    await expect(changeCallDevice('camera', 'missing-camera')).resolves.toBe(true);
    expect(mocks.appSettings.callDevices.cameraId).toBe('');
  });
});

describe('capturing the call microphone again', () => {
  it('swaps the microphone of the call that sends the track, and only that', async() => {
    const track = {} as MediaStreamTrack;
    mocks.appSettings.callDevices.microphoneId = 'mic';
    mocks.call = {getInputAudioTrack: () => ({}) as MediaStreamTrack, setInputAudioDeviceId: vi.fn().mockResolvedValue(true)};
    expect(await recaptureCallMicrophone(track)).toBe(false);
    expect(mocks.call.setInputAudioDeviceId).not.toHaveBeenCalled();

    mocks.call.getInputAudioTrack = () => track;
    expect(await recaptureCallMicrophone(track)).toBe(true);
    expect(mocks.call.setInputAudioDeviceId).toHaveBeenCalledWith('mic');
    expect(mocks.appSettings.callDevices.microphoneId).toBe('mic');

    mocks.call = undefined;
    expect(await recaptureCallMicrophone(track)).toBe(false);
  });

  it('leaves a microphone change under way alone', async() => {
    const track = {} as MediaStreamTrack;
    const picked = deferred<boolean>();
    mocks.call = {getInputAudioTrack: () => track, setInputAudioDeviceId: vi.fn().mockReturnValue(picked.promise)};

    // The user's pick is still being captured: the old track is still the one sent.
    const change = changeCallDevice('microphone', 'mic-new');
    expect(await recaptureCallMicrophone(track)).toBe(false);
    expect(mocks.call.setInputAudioDeviceId).toHaveBeenCalledTimes(1);

    picked.resolve(true);
    await expect(change).resolves.toBe(true);
    expect(mocks.appSettings.callDevices.microphoneId).toBe('mic-new');
  });

  it('reports a recapture a newer change superseded', async() => {
    const track = {} as MediaStreamTrack;
    const recaptured = deferred<boolean>();
    const picked = deferred<boolean>();
    mocks.call = {
      getInputAudioTrack: () => track,
      setInputAudioDeviceId: vi.fn().mockReturnValueOnce(recaptured.promise).mockReturnValueOnce(picked.promise)
    };

    const recapture = recaptureCallMicrophone(track);
    const change = changeCallDevice('microphone', 'mic-new');
    recaptured.resolve(true);
    picked.resolve(true);
    // So the caller tries again while the old track is still the one sent.
    await expect(recapture).resolves.toBe(false);
    await expect(change).resolves.toBe(true);
  });
});
