/*
 * A StreamManager analyses only our own microphone (the speaking indicator for
 * "you"); remote levels come from RTP. Its AudioContext is created with the
 * first microphone track — a camera/screen-only manager has none — and `stop()`
 * used to only stop the tracks, leaving a running audio thread and its analyser
 * graph behind.
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import StreamManager from '@lib/calls/streamManager';

class FakeNode {
  public connect = vi.fn();
  public disconnect = vi.fn();
}

class FakeAnalyser extends FakeNode {
  public fftSize = 4;
  public samples = [0, 0, 0, 0];
  public getFloatTimeDomainData = vi.fn((array: Float32Array) => {
    for(let i = 0; i < array.length; ++i) array[i] = this.samples[i % this.samples.length];
  });
}

class FakeAudioContext {
  public static instances: FakeAudioContext[] = [];
  public state = 'running';
  constructor() {
    FakeAudioContext.instances.push(this);
  }

  public sources: FakeNode[] = [];
  public analysers: FakeAnalyser[] = [];
  public close = vi.fn(async() => {
    this.state = 'closed';
  });

  public createMediaStreamSource() {
    const node = new FakeNode();
    this.sources.push(node);
    return node;
  }

  public createAnalyser() {
    const node = new FakeAnalyser();
    this.analysers.push(node);
    return node;
  }

  public createGain() {
    return new FakeNode();
  }
}

class FakeTrack extends EventTarget {
  public readyState = 'live';
  public stop = vi.fn(() => {
    this.readyState = 'ended';
  });

  constructor(public readonly kind: 'audio' | 'video', public readonly id: string) {
    super();
  }
}

class FakeMediaStream {
  private tracks: FakeTrack[] = [];

  constructor(public id = 'stream') {}

  public getTracks() {
    return this.tracks.slice();
  }

  public addTrack(track: FakeTrack) {
    this.tracks.push(track);
  }

  public removeTrack(track: FakeTrack) {
    this.tracks = this.tracks.filter((t) => t !== track);
  }
}

function makeManager() {
  const manager = new StreamManager();
  const getContext = () => (manager as any).context as FakeAudioContext;
  const addTrack = (kind: 'audio' | 'video', id: string, type: 'input' | 'output' = 'input') => {
    const track = new FakeTrack(kind, id);
    const stream = new FakeMediaStream(type === 'output' ? 'stream123' : id);
    stream.addTrack(track);
    manager.addTrack(stream as any, track as any, type);
    return track;
  };
  const addAudio = (id: string) => addTrack('audio', id);
  return {manager, getContext, addAudio, addTrack};
}

describe('StreamManager audio context lifecycle', () => {
  beforeEach(() => {
    FakeAudioContext.instances.length = 0;
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('MediaStream', FakeMediaStream);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates no audio context for a manager without a microphone, nor for remote audio', () => {
    const {addTrack} = makeManager();
    addTrack('video', 'camera');
    addTrack('audio', 'remote', 'output');

    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('disconnects the analyser graph of a removed audio track', () => {
    const {manager, getContext, addAudio} = makeManager();
    const track = addAudio('mic');
    const context = getContext();
    expect(context.sources).toHaveLength(1);

    manager.removeTrack(track as any);

    expect(context.sources[0].disconnect).toHaveBeenCalledTimes(1);
    expect(context.analysers[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it('releases every analyser and closes the context exactly once on stop', () => {
    const {manager, getContext, addAudio} = makeManager();
    const first = addAudio('mic');
    const second = addAudio('mic-2');
    const context = getContext();

    manager.stop();
    manager.stop();

    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(second.stop).toHaveBeenCalledTimes(1);
    for(const node of [...context.sources, ...context.analysers]) {
      expect(node.disconnect).toHaveBeenCalledTimes(1);
    }
    expect(context.close).toHaveBeenCalledTimes(1);
    expect((manager as any).items).toHaveLength(0);
  });

  it('does not build an analyser (or a new context) after stop', () => {
    const {manager, addAudio} = makeManager();
    addAudio('mic');
    manager.stop();
    const context = FakeAudioContext.instances[0];

    addAudio('late');

    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(context.sources).toHaveLength(1);
    expect(manager.getInputAudioLevel()).toBeUndefined();
  });

  it('reads the microphone level as RMS and reports a disabled track as silence', () => {
    const {manager, getContext, addAudio} = makeManager();
    const track = addAudio('mic') as FakeTrack & {enabled?: boolean};
    track.enabled = true;
    getContext().analysers[0].samples = [0.5, -0.5, 0.5, -0.5];

    expect(manager.getInputAudioLevel()).toBeCloseTo(0.5);

    track.enabled = false;
    expect(manager.getInputAudioLevel()).toBe(0);
  });

  it('tolerates a context that cannot be closed', () => {
    vi.stubGlobal('AudioContext', class {});
    const manager = new StreamManager();

    expect(() => manager.stop()).not.toThrow();
  });
});
