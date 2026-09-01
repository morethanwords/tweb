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

import {changeCallDevice} from '@lib/calls/applyDeviceToActiveCall';
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
