/*
 * Every StreamManager owns an AudioContext (one per call, plus one per camera /
 * screen connection) and `stop()` only ever stopped the tracks, so each call
 * left a running audio thread and its analyser graph behind.
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import StreamManager from '@lib/calls/streamManager';

class FakeNode {
  public connect = vi.fn();
  public disconnect = vi.fn();
}

class FakeAnalyser extends FakeNode {
  public frequencyBinCount = 4;
  public getByteFrequencyData = vi.fn();
}

class FakeAudioContext {
  public state = 'running';
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
  const context = (manager as any).context as FakeAudioContext;
  const addAudio = (id: string) => {
    const track = new FakeTrack('audio', id);
    const stream = new FakeMediaStream(id);
    stream.addTrack(track);
    manager.addTrack(stream as any, track as any, 'input');
    return track;
  };
  return {manager, context, addAudio};
}

describe('StreamManager audio context lifecycle', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('MediaStream', FakeMediaStream);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('disconnects the analyser graph of a removed audio track', () => {
    const {manager, context, addAudio} = makeManager();
    const track = addAudio('mic');
    expect(context.sources).toHaveLength(1);

    manager.removeTrack(track as any);

    expect(context.sources[0].disconnect).toHaveBeenCalledTimes(1);
    expect(context.analysers[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it('releases every analyser and closes the context exactly once on stop', () => {
    const {manager, context, addAudio} = makeManager();
    const first = addAudio('mic');
    const second = addAudio('mic-2');

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

  it('does not build an analyser on a closed context', () => {
    const {manager, context, addAudio} = makeManager();
    manager.stop();

    addAudio('late');

    expect(context.sources).toHaveLength(0);
    expect(() => manager.analyse()).not.toThrow();
  });

  it('tolerates a context that cannot be closed', () => {
    vi.stubGlobal('AudioContext', class {});
    const manager = new StreamManager();

    expect(() => manager.stop()).not.toThrow();
  });
});
