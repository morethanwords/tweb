import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  appSettings: {callDevices: {speakerId: ''}},
  safePlay: vi.fn()
}));

vi.mock('@helpers/dom/safePlay', () => ({default: mocks.safePlay}));
vi.mock('@lib/calls/helpers/getStreamCached', () => ({default: () => vi.fn()}));
vi.mock('@lib/calls/localConferenceDescription', () => ({default: class LocalConferenceDescription {}}));
vi.mock('@lib/calls/streamManager', () => ({default: class StreamManager {}}));
vi.mock('@stores/appSettings', () => ({appSettings: mocks.appSettings}));

import CallInstanceBase from '@lib/calls/callInstanceBase';

class PlaybackCall extends CallInstanceBase<Record<never, never>> {
  public manager = {
    addTrack: vi.fn(),
    hasInputTrackKind: vi.fn(() => false),
    inputStream: {getAudioTracks: (): MediaStreamTrack[] => []},
    outputStream: {id: 'mixed-output'},
    stop: vi.fn()
  };

  constructor() {
    super();
    this.log = Object.assign(vi.fn(), {warn: vi.fn()}) as any;
  }

  public get streamManager() {
    return this.manager as any;
  }

  public get description(): undefined {
    return undefined;
  }

  public get isMuted() {
    return true;
  }

  public get isClosing() {
    return false;
  }

  public toggleMuted(): Promise<void> {
    return Promise.resolve();
  }

  public get audioElement() {
    return this.audio;
  }
}

describe('remote call media playback', () => {
  beforeEach(() => {
    mocks.safePlay.mockReset();
  });

  it('installs the mixed stream before playing and retries when a muted track becomes live', () => {
    const call = new PlaybackCall();
    const unmuteListeners: Array<() => void> = [];
    const track = {
      addEventListener: vi.fn((type: string, listener: () => void) => {
        if(type === 'unmute') unmuteListeners.push(listener);
      }),
      kind: 'audio',
      muted: true
    } as unknown as MediaStreamTrack;
    const stream = {id: 'remote-stream'} as MediaStream;
    const sourcesSeenAtPlay: unknown[] = [];
    mocks.safePlay.mockImplementation((element: HTMLMediaElement) => {
      sourcesSeenAtPlay.push(element.srcObject);
    });

    call.tryAddTrack({stream, track, type: 'output', source: '123'});

    expect(call.audioElement.srcObject).toBe(call.manager.outputStream);
    expect(sourcesSeenAtPlay).toEqual([call.manager.outputStream]);
    expect(unmuteListeners).toHaveLength(1);

    unmuteListeners[0]();
    expect(sourcesSeenAtPlay).toEqual([call.manager.outputStream, call.manager.outputStream]);

    call.cleanup();
  });

  it('plays a newly-installed remote stream even when the empty audio element reports playing', () => {
    const call = new PlaybackCall();
    const track = {
      addEventListener: vi.fn(),
      kind: 'audio',
      muted: false
    } as unknown as MediaStreamTrack;
    const stream = {id: 'remote-stream'} as MediaStream;

    // The constructor primes this shared element before it has a source. Some
    // browsers can keep `paused === false` after that empty play attempt even
    // though assigning srcObject later does not start the new MediaStream.
    Object.defineProperty(call.audioElement, 'paused', {
      configurable: true,
      value: false
    });
    mocks.safePlay.mockClear();

    call.tryAddTrack({stream, track, type: 'output', source: '123'});

    expect(call.audioElement.srcObject).toBe(call.manager.outputStream);
    expect(mocks.safePlay).toHaveBeenCalledOnce();
    expect(mocks.safePlay).toHaveBeenCalledWith(call.audioElement);

    call.cleanup();
  });

  it.each([
    ['audio then video', ['audio', 'video']],
    ['video then audio', ['video', 'audio']]
  ] as const)('keeps both remote outputs when tracks arrive %s', (_title, order) => {
    const call = new PlaybackCall();
    mocks.safePlay.mockClear();
    const audioStream = {id: 'remote-audio'} as MediaStream;
    const videoStream = {id: 'remote-video'} as MediaStream;
    const tracks = {
      audio: {
        addEventListener: vi.fn(),
        kind: 'audio',
        muted: false
      } as unknown as MediaStreamTrack,
      video: {
        addEventListener: vi.fn(),
        kind: 'video',
        muted: false
      } as unknown as MediaStreamTrack
    };

    for(const kind of order) {
      call.tryAddTrack({
        stream: kind === 'audio' ? audioStream : videoStream,
        track: tracks[kind],
        type: 'output',
        source: kind === 'audio' ? 'remote-user' : 'camera-endpoint'
      });
    }

    expect(call.audioElement.srcObject).toBe(call.manager.outputStream);
    expect(call.getElement('camera-endpoint').srcObject).toBe(videoStream);
    expect(call.manager.addTrack).toHaveBeenCalledTimes(2);
    expect(mocks.safePlay.mock.calls.map(([element]) => element.srcObject)).toEqual(
      order.map((kind) => kind === 'audio' ? call.manager.outputStream : videoStream)
    );

    call.cleanup();
  });
});
