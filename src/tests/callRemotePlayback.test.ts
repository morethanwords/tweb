/*
 * Group-call remote audio: one element per remote track. The previous single
 * shared element had its srcObject reset for every new track ("EVEN IF
 * MEDIASTREAM IS THE SAME NEW TRACK WON'T PLAY WITHOUT REPLACING IT"), which
 * restarted playback for everyone whenever somebody joined. Per-element volume
 * then carries each participant's volume / muted_by_you; an element is freed
 * with its source (a media player each, capped per page); the element primed
 * in the join gesture serves the first source (WebKit autoplay); and the
 * 1-on-1 call plays through the same helper.
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  appSettings: {callDevices: {speakerId: ''}},
  safePlay: vi.fn()
}));

vi.mock('@helpers/dom/safePlay', () => ({default: mocks.safePlay}));
vi.mock('@lib/calls/helpers/getStreamCached', () => ({default: () => vi.fn()}));
vi.mock('@lib/calls/localConferenceDescription', () => ({default: class LocalConferenceDescription {}}));
vi.mock('@lib/calls/streamManager', () => ({default: class StreamManager {}}));
vi.mock('@stores/appSettings', () => ({appSettings: mocks.appSettings}));

import CallInstanceBase, {OutputAudioState, getOutputAudioElementKey} from '@lib/calls/callInstanceBase';

class PlaybackCall extends CallInstanceBase<Record<never, never>> {
  public manager = {
    addTrack: vi.fn(),
    hasInputTrackKind: vi.fn(() => false),
    inputStream: {getAudioTracks: (): MediaStreamTrack[] => []},
    stop: vi.fn()
  };

  public audioStates = new Map<string, OutputAudioState>();

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

  protected getOutputAudioState(source: string) {
    return this.audioStates.get(source) ?? super.getOutputAudioState(source);
  }

  public refresh(sources: string[]) {
    this.refreshOutputAudioState(sources);
  }

  public audioElement(source: string) {
    return this.getElement(getOutputAudioElementKey(source)) as HTMLAudioElement;
  }

  public get primedElement() {
    return this.audio;
  }

  public release(source: string, track?: MediaStreamTrack) {
    return this.releaseOutputAudio(source, track);
  }

  public play(element: HTMLMediaElement, stream: MediaStream, track: MediaStreamTrack) {
    this.playRemoteAudio(element, stream, track);
  }

  public clone(source: string) {
    return this.cloneVideoElement(source, this.getElement(source) as HTMLVideoElement);
  }

  public releaseVideo(source: string, track?: MediaStreamTrack, keepTiles?: boolean) {
    return this.releaseOutputVideo(source, track, keepTiles);
  }
}

class FakeTrack extends EventTarget {
  constructor(public kind: 'audio' | 'video', public muted = false) {
    super();
  }
}

function makeStream(id: string, ...tracks: FakeTrack[]) {
  return {id, getTracks: () => tracks} as unknown as MediaStream;
}

describe('remote call media playback', () => {
  let play: ReturnType<typeof vi.fn>;
  let originalPlay: PropertyDescriptor | undefined;

  beforeEach(() => {
    mocks.safePlay.mockReset();
    originalPlay = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'play');
    play = vi.fn(() => Promise.resolve());
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {configurable: true, value: play});
  });

  afterEach(() => {
    if(originalPlay) Object.defineProperty(HTMLMediaElement.prototype, 'play', originalPlay);
  });

  it('plays each remote audio track through its own element and never touches the others', () => {
    const call = new PlaybackCall();
    const first = new FakeTrack('audio');
    const firstStream = makeStream('stream1', first);
    call.tryAddTrack({stream: firstStream, track: first as any, type: 'output', source: '1'});
    const firstElement = call.audioElement('1');
    expect(firstElement.srcObject).toBe(firstStream);
    expect(firstElement.isConnected).toBe(true);

    const assignments: unknown[] = [];
    const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject');
    Object.defineProperty(firstElement, 'srcObject', {
      configurable: true,
      get: () => descriptor.get.call(firstElement),
      set: (value) => {
        assignments.push(value);
        descriptor.set.call(firstElement, value);
      }
    });
    play.mockClear();

    const second = new FakeTrack('audio');
    const secondStream = makeStream('stream2', second);
    call.tryAddTrack({stream: secondStream, track: second as any, type: 'output', source: '2'});

    expect(call.audioElement('2')).not.toBe(firstElement);
    expect(call.audioElement('2').srcObject).toBe(secondStream);
    // Joining participant two neither reassigned nor restarted participant one.
    expect(assignments).toEqual([]);
    expect(play.mock.contexts).toEqual([call.audioElement('2')]);
    expect(call.manager.addTrack).toHaveBeenCalledTimes(2);

    call.cleanup();
  });

  it('plays again once a track that appeared muted produces frames', () => {
    const call = new PlaybackCall();
    const track = new FakeTrack('audio', true);
    const stream = makeStream('stream1', track);
    call.tryAddTrack({stream, track: track as any, type: 'output', source: '1'});
    expect(play).toHaveBeenCalledTimes(1);

    track.dispatchEvent(new Event('unmute'));
    expect(play).toHaveBeenCalledTimes(2);
    expect(play.mock.contexts[1]).toBe(call.audioElement('1'));

    call.cleanup();
  });

  it('applies the participant volume, clamped to what an element can play, and muted-for-me', () => {
    const call = new PlaybackCall();
    call.audioStates.set('1', {volume: 0.4, muted: false});
    call.audioStates.set('2', {volume: 1.8, muted: false});
    for(const source of ['1', '2']) {
      const track = new FakeTrack('audio');
      call.tryAddTrack({stream: makeStream('s' + source, track), track: track as any, type: 'output', source});
    }

    expect(call.audioElement('1').volume).toBeCloseTo(0.4);
    expect(call.audioElement('2').volume).toBe(1);

    call.audioStates.set('1', {volume: 1, muted: true});
    call.refresh(['1']);
    expect(call.audioElement('1').muted).toBe(true);
    expect(call.audioElement('1').volume).toBe(1);

    call.cleanup();
  });

  it('retries a playback the autoplay policy refused on the next user gesture', async() => {
    const call = new PlaybackCall();
    play.mockImplementationOnce(() => Promise.reject(new DOMException('blocked', 'NotAllowedError')));
    const track = new FakeTrack('audio');
    call.tryAddTrack({stream: makeStream('s1', track), track: track as any, type: 'output', source: '1'});
    await Promise.resolve();
    await Promise.resolve();
    expect(play).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event('pointerdown'));
    expect(play).toHaveBeenCalledTimes(2);

    // One retry per refusal.
    document.dispatchEvent(new Event('pointerdown'));
    expect(play).toHaveBeenCalledTimes(2);

    call.cleanup();
  });

  it('drops the element of a remote track that ended', () => {
    const call = new PlaybackCall();
    const track = new FakeTrack('audio');
    call.tryAddTrack({stream: makeStream('s1', track), track: track as any, type: 'output', source: '1'});
    const element = call.audioElement('1');

    track.dispatchEvent(new Event('ended'));

    expect(call.audioElement('1')).toBeUndefined();
    expect(element.isConnected).toBe(false);
    call.cleanup();
  });

  it('routes every remote audio element to the selected speaker, including later ones', async() => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'setSinkId');
    const setSinkId = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', {configurable: true, value: setSinkId});
    const call = new PlaybackCall();
    try {
      const first = new FakeTrack('audio');
      call.tryAddTrack({stream: makeStream('s1', first), track: first as any, type: 'output', source: '1'});

      await expect(call.setOutputDeviceId('speaker-b')).resolves.toBe(true);
      expect(setSinkId.mock.contexts).toContain(call.audioElement('1'));

      const second = new FakeTrack('audio');
      call.tryAddTrack({stream: makeStream('s2', second), track: second as any, type: 'output', source: '2'});
      await vi.waitFor(() => expect(setSinkId.mock.contexts).toContain(call.audioElement('2')));
      const secondCall = setSinkId.mock.contexts.indexOf(call.audioElement('2'));
      expect(setSinkId.mock.calls[secondCall]).toEqual(['speaker-b']);
    } finally {
      call.cleanup();
      if(originalDescriptor) {
        Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', originalDescriptor);
      } else {
        delete (HTMLMediaElement.prototype as any).setSinkId;
      }
    }
  });

  it.each([
    ['audio then video', ['audio', 'video']],
    ['video then audio', ['video', 'audio']]
  ] as const)('keeps both remote outputs when tracks arrive %s', (_title, order) => {
    const call = new PlaybackCall();
    const tracks = {
      audio: new FakeTrack('audio'),
      video: new FakeTrack('video')
    };
    const streams = {
      audio: makeStream('remote-audio', tracks.audio),
      video: makeStream('remote-video', tracks.video)
    };

    for(const kind of order) {
      call.tryAddTrack({
        stream: streams[kind],
        track: tracks[kind] as any,
        type: 'output',
        source: kind === 'audio' ? 'remote-user' : 'camera-endpoint'
      });
    }

    expect(call.audioElement('remote-user').srcObject).toBe(streams.audio);
    expect(call.getElement('camera-endpoint').srcObject).toBe(streams.video);
    expect(call.manager.addTrack).toHaveBeenCalledTimes(2);

    call.cleanup();
  });

  it('points the on-screen clones of a video at the stream a rebuilt connection delivers', () => {
    const call = new PlaybackCall();
    const first = new FakeTrack('video');
    const firstStream = makeStream('video-old', first);
    call.tryAddTrack({stream: firstStream, track: first as any, type: 'output', source: '5'});
    // Rendered in another document (Document PiP), out of reach of any
    // document-wide query.
    const clone = call.clone('5');
    expect(clone.srcObject).toBe(firstStream);
    const pipDocument = document.implementation.createHTMLDocument('pip');
    pipDocument.body.append(clone);

    const second = new FakeTrack('video');
    const secondStream = makeStream('video-new', second);
    call.tryAddTrack({stream: secondStream, track: second as any, type: 'output', source: '5'});

    expect(call.getElement('5').srcObject).toBe(secondStream);
    expect(clone.srcObject).toBe(secondStream);

    // A late `ended` of the replaced track keeps the element of its successor.
    first.dispatchEvent(new Event('ended'));
    expect(call.getElement('5').srcObject).toBe(secondStream);
    clone.remove();
    call.cleanup();
  });

  it('retargets the clones too when the old track ended before the new one arrived', () => {
    const call = new PlaybackCall();
    const first = new FakeTrack('video');
    const firstStream = makeStream('video-old', first);
    call.tryAddTrack({stream: firstStream, track: first as any, type: 'output', source: '5'});
    const clone = call.clone('5');
    document.body.append(clone);

    first.dispatchEvent(new Event('ended'));
    expect(call.getElement('5')).toBeUndefined();

    const second = new FakeTrack('video');
    const secondStream = makeStream('video-new', second);
    call.tryAddTrack({stream: secondStream, track: second as any, type: 'output', source: '5'});

    expect(clone.srcObject).toBe(secondStream);
    clone.remove();
    call.cleanup();
  });

  it('hands the element primed in the join gesture to the first remote track only', () => {
    const call = new PlaybackCall();
    const primed = call.primedElement;
    expect(call.getElement('audio')).toBe(primed);

    const first = new FakeTrack('audio');
    call.tryAddTrack({stream: makeStream('s1', first), track: first as any, type: 'output', source: '1'});
    expect(call.audioElement('1')).toBe(primed);
    expect(call.getElement('audio')).toBeUndefined();

    const second = new FakeTrack('audio');
    call.tryAddTrack({stream: makeStream('s2', second), track: second as any, type: 'output', source: '2'});
    expect(call.audioElement('2')).not.toBe(primed);
    call.cleanup();
  });

  it('frees a source element unless it already plays a newer track', async() => {
    const call = new PlaybackCall();
    const old = new FakeTrack('audio');
    call.tryAddTrack({stream: makeStream('old', old), track: old as any, type: 'output', source: '1'});
    const current = new FakeTrack('audio');
    const currentStream = makeStream('current', current);
    call.tryAddTrack({stream: currentStream, track: current as any, type: 'output', source: '1'});
    const element = call.audioElement('1');

    expect(call.release('1', old as any)).toBe(false);
    expect(call.audioElement('1')).toBe(element);

    // A refused playback is forgotten with its element: the next gesture must
    // not resurrect a freed source.
    play.mockImplementationOnce(() => Promise.reject(new DOMException('blocked', 'NotAllowedError')));
    call.tryAddTrack({stream: currentStream, track: current as any, type: 'output', source: '1'});
    await Promise.resolve();
    await Promise.resolve();

    expect(call.release('1', current as any)).toBe(true);
    expect(call.audioElement('1')).toBeUndefined();
    expect(element.isConnected).toBe(false);
    expect(element.srcObject).toBeNull();
    play.mockClear();
    document.dispatchEvent(new Event('pointerdown'));
    expect(play).not.toHaveBeenCalled();
    call.cleanup();
  });

  it('plays a 1-on-1 call element again whenever the remote track resumes', async() => {
    const call = new PlaybackCall();
    const element = document.createElement('audio');
    const track = new FakeTrack('audio', true);
    const stream = makeStream('p2p', track);

    play.mockImplementationOnce(() => Promise.reject(new DOMException('blocked', 'NotAllowedError')));
    call.play(element, stream, track as any);
    expect(element.srcObject).toBe(stream);
    await Promise.resolve();
    await Promise.resolve();

    track.dispatchEvent(new Event('unmute'));
    track.dispatchEvent(new Event('unmute'));
    expect(play).toHaveBeenCalledTimes(3);

    // The refused first play is also retried on the next gesture; the
    // 1-on-1 call used to have no such retry.
    document.dispatchEvent(new Event('keydown'));
    expect(play).toHaveBeenCalledTimes(4);

    // A replaced source is not resumed by its old track.
    element.srcObject = makeStream('p2p-2', new FakeTrack('audio'));
    track.dispatchEvent(new Event('unmute'));
    expect(play).toHaveBeenCalledTimes(4);
    call.cleanup();
  });

  it('frees a video source element, keeping its tiles only across a replaced connection', () => {
    const call = new PlaybackCall();
    const first = new FakeTrack('video');
    const firstStream = makeStream('v1', first);
    call.tryAddTrack({stream: firstStream, track: first as any, type: 'output', source: '7'});
    const element = call.getElement('7');
    const clone = call.clone('7');

    // A stale track does not free the element of its successor.
    expect(call.releaseVideo('7', new FakeTrack('video') as any)).toBe(false);

    // Rejoin: the element goes, the tile follows the rebuilt stream.
    expect(call.releaseVideo('7', first as any, true)).toBe(true);
    expect(call.getElement('7')).toBeUndefined();
    expect(element.srcObject).toBeNull();
    const second = new FakeTrack('video');
    const secondStream = makeStream('v2', second);
    call.tryAddTrack({stream: secondStream, track: second as any, type: 'output', source: '7'});
    expect(clone.srcObject).toBe(secondStream);

    // Left: element and tile registry go; a later source reuse starts clean.
    expect(call.releaseVideo('7', second as any)).toBe(true);
    const third = new FakeTrack('video');
    const thirdStream = makeStream('v3', third);
    call.tryAddTrack({stream: thirdStream, track: third as any, type: 'output', source: '7'});
    expect(clone.srcObject).toBe(secondStream);
    call.cleanup();
  });
});
