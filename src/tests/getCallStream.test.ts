/*
 * What a call captures as its microphone: denoised by RNNoise when the
 * "Noise suppression" switch is on, and — since the browser's own suppression
 * was left off for RNNoise — captured again with it when RNNoise cannot start;
 * when only its model was late, the call moves onto RNNoise once it is in.
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  getStream: vi.fn(),
  denoiseMicrophone: vi.fn(),
  shouldUseRnnoise: vi.fn(() => true),
  constraintSupported: vi.fn(() => true),
  recaptureCallMicrophone: vi.fn(async(_track: unknown) => true),
  RnnoiseLoadingError: class extends Error {
    constructor(public loaded: Promise<unknown>) {
      super('RNNoise took too long to load');
    }
  }
}));

vi.mock('@lib/calls/helpers/getStream', () => ({default: mocks.getStream}));
vi.mock('@lib/calls/noiseSuppression/noiseSuppression', () => ({
  default: mocks.denoiseMicrophone,
  shouldUseRnnoise: mocks.shouldUseRnnoise,
  RnnoiseLoadingError: mocks.RnnoiseLoadingError
}));
vi.mock('@lib/calls/applyDeviceToActiveCall', () => ({recaptureCallMicrophone: mocks.recaptureCallMicrophone}));
vi.mock('@environment/constraintSupport', () => ({default: mocks.constraintSupported}));
vi.mock('@lib/logger', () => ({
  logger: () => Object.assign(vi.fn(), {warn: vi.fn(), error: vi.fn()})
}));

import getCallStream from '@lib/calls/helpers/getCallStream';

class FakeTrack extends EventTarget {
  public readyState: MediaStreamTrackState = 'live';
  constructor(public kind: 'audio' | 'video') {
    super();
  }

  public stop() {
    this.readyState = 'ended';
  }
}

class FakeStream {
  constructor(private tracks: FakeTrack[]) {}
  public getTracks() {
    return this.tracks;
  }

  public getAudioTracks() {
    return this.tracks.filter((track) => track.kind === 'audio');
  }

  public getVideoTracks() {
    return this.tracks.filter((track) => track.kind === 'video');
  }
}

const AUDIO = {echoCancellation: true, noiseSuppression: false, deviceId: {exact: 'mic'}};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.shouldUseRnnoise.mockReturnValue(true);
  mocks.constraintSupported.mockReturnValue(true);
  mocks.recaptureCallMicrophone.mockResolvedValue(true);
  vi.stubGlobal('MediaStream', FakeStream);
});

afterEach(() => {
  vi.useRealTimers();
});

/** RNNoise rejected because its model is still loading; resolve() lets it in. */
function lateModel(recaptured = new FakeTrack('audio')) {
  let resolve: () => void;
  const loaded = new Promise<void>((r) => resolve = r);
  mocks.getStream
  .mockResolvedValueOnce(new FakeStream([new FakeTrack('audio')]))
  .mockResolvedValueOnce(new FakeStream([recaptured]));
  mocks.denoiseMicrophone.mockRejectedValue(new mocks.RnnoiseLoadingError(loaded));
  return {recaptured, loaded: () => resolve()};
}

describe('getCallStream', () => {
  it('hands the capture to RNNoise', async() => {
    const captured = new FakeStream([new FakeTrack('audio')]);
    const denoised = new FakeStream([new FakeTrack('audio')]);
    mocks.getStream.mockResolvedValue(captured);
    mocks.denoiseMicrophone.mockResolvedValue(denoised);

    expect(await getCallStream({audio: AUDIO}, true)).toBe(denoised);
    expect(mocks.getStream).toHaveBeenCalledWith({audio: AUDIO}, true);
    expect(mocks.denoiseMicrophone).toHaveBeenCalledWith(captured);
  });

  it('leaves the capture alone with the switch off, or without a microphone in it', async() => {
    const captured = new FakeStream([new FakeTrack('audio')]);
    mocks.getStream.mockResolvedValue(captured);
    mocks.shouldUseRnnoise.mockReturnValue(false);
    expect(await getCallStream({audio: AUDIO})).toBe(captured);

    const camera = new FakeStream([new FakeTrack('video')]);
    mocks.getStream.mockResolvedValue(camera);
    mocks.shouldUseRnnoise.mockReturnValue(true);
    expect(await getCallStream({audio: AUDIO, video: true})).toBe(camera);
    expect(mocks.denoiseMicrophone).not.toHaveBeenCalled();
  });

  it('captures the microphone again with the browser\'s suppression when RNNoise fails', async() => {
    const microphone = new FakeTrack('audio');
    const camera = new FakeTrack('video');
    const recaptured = new FakeTrack('audio');
    mocks.getStream
    .mockResolvedValueOnce(new FakeStream([microphone, camera]))
    .mockResolvedValueOnce(new FakeStream([recaptured]));
    mocks.denoiseMicrophone.mockRejectedValue(new Error('AudioContext is suspended'));
    const ended = vi.fn();
    microphone.addEventListener('ended', ended);

    const stream = await getCallStream({audio: AUDIO, video: true}, false);

    expect(mocks.getStream).toHaveBeenLastCalledWith({audio: {...AUDIO, noiseSuppression: true}}, false);
    expect(stream.getTracks()).toEqual([recaptured, camera]);
    expect(microphone.readyState).toBe('ended');
    expect(ended).toHaveBeenCalled();
  });

  it('keeps the first capture when the browser has no suppression or the second capture fails', async() => {
    const first = new FakeStream([new FakeTrack('audio')]);
    mocks.getStream.mockResolvedValue(first);
    mocks.denoiseMicrophone.mockRejectedValue(new Error('no AudioWorklet'));
    mocks.constraintSupported.mockReturnValue(false);
    expect(await getCallStream({audio: AUDIO})).toBe(first);
    expect(mocks.getStream).toHaveBeenCalledTimes(1);

    mocks.constraintSupported.mockReturnValue(true);
    mocks.getStream.mockResolvedValueOnce(first).mockRejectedValueOnce(new Error('NotReadableError'));
    expect(await getCallStream({audio: AUDIO})).toBe(first);
    expect(first.getAudioTracks()[0].readyState).toBe('live');
  });

  it('moves the call onto RNNoise once the late model is in, as soon as the call sends the microphone', async() => {
    vi.useFakeTimers({toFake: ['setTimeout']});
    const {recaptured, loaded} = lateModel();
    // A group call takes its microphone only once it has joined.
    mocks.recaptureCallMicrophone.mockResolvedValueOnce(false);

    expect((await getCallStream({audio: AUDIO})).getTracks()).toEqual([recaptured]);
    expect(mocks.recaptureCallMicrophone).not.toHaveBeenCalled();

    loaded();
    await vi.waitFor(() => expect(mocks.recaptureCallMicrophone).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.recaptureCallMicrophone).toHaveBeenCalledTimes(2);
    expect(mocks.recaptureCallMicrophone).toHaveBeenLastCalledWith(recaptured);
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.recaptureCallMicrophone).toHaveBeenCalledTimes(2);
  });

  it('leaves a microphone the call has let go of', async() => {
    vi.useFakeTimers({toFake: ['setTimeout']});
    const {recaptured, loaded} = lateModel();
    await getCallStream({audio: AUDIO});
    recaptured.stop();
    loaded();
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.recaptureCallMicrophone).not.toHaveBeenCalled();
  });

  it('leaves the microphone alone once the switch is turned off', async() => {
    vi.useFakeTimers({toFake: ['setTimeout']});
    const {loaded} = lateModel();
    await getCallStream({audio: AUDIO});
    mocks.shouldUseRnnoise.mockReturnValue(false);
    loaded();
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.recaptureCallMicrophone).not.toHaveBeenCalled();
  });

  it('does not come back to a microphone RNNoise failed on for any other reason', async() => {
    vi.useFakeTimers({toFake: ['setTimeout']});
    mocks.getStream
    .mockResolvedValueOnce(new FakeStream([new FakeTrack('audio')]))
    .mockResolvedValueOnce(new FakeStream([new FakeTrack('audio')]));
    mocks.denoiseMicrophone.mockRejectedValue(new Error('the noise suppressor took too long to start'));
    await getCallStream({audio: AUDIO});
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.recaptureCallMicrophone).not.toHaveBeenCalled();
  });
});
