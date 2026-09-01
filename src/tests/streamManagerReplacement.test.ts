import {describe, expect, it, vi} from 'vitest';
import StreamManager from '@lib/calls/streamManager';

function makeTrack(kind: 'audio' | 'video', id: string): MediaStreamTrack {
  return {id, kind} as unknown as MediaStreamTrack;
}

describe('StreamManager conference sender transaction', () => {
  it('restores every previous sender track when one replacement rejects', async() => {
    const oldAudio = makeTrack('audio', 'old-audio');
    const oldVideo = makeTrack('video', 'old-video');
    const newAudio = makeTrack('audio', 'new-audio');
    const newVideo = makeTrack('video', 'new-video');
    const replacementError = new Error('video sender rejected');
    const replaceAudio = vi.fn().mockResolvedValue(undefined);
    const replaceVideo = vi.fn()
    .mockRejectedValueOnce(replacementError)
    .mockResolvedValueOnce(undefined);
    const entries = [
      {
        direction: 'sendonly',
        type: 'audio',
        transceiver: {direction: 'sendonly', sender: {track: oldAudio, replaceTrack: replaceAudio}}
      },
      {
        direction: 'sendonly',
        type: 'video',
        transceiver: {direction: 'sendonly', sender: {track: oldVideo, replaceTrack: replaceVideo}}
      }
    ];
    const conference = {
      findEntry: (predicate: (entry: typeof entries[number]) => boolean) => entries.find(predicate)
    };
    const manager = Object.assign(Object.create(StreamManager.prototype), {
      canCreateConferenceEntry: false,
      direction: 'sendonly',
      inputStream: {getTracks: () => [newAudio, newVideo]},
      locked: false,
      log: {error: vi.fn()},
      types: ['audio', 'video']
    }) as StreamManager;

    await expect(manager.appendToConference(conference as any, undefined, true)).rejects.toBe(replacementError);

    expect(replaceAudio).toHaveBeenNthCalledWith(1, newAudio);
    expect(replaceAudio).toHaveBeenNthCalledWith(2, oldAudio);
    expect(replaceVideo).toHaveBeenNthCalledWith(1, newVideo);
    expect(replaceVideo).toHaveBeenNthCalledWith(2, oldVideo);
  });
});
