import {beforeAll, describe, expect, it, vi} from 'vitest';
import {stubBrowserGlobals} from '@/tests/helpers/browserGlobals';
import {makeSharedMediaMessages, photo, video} from '@/tests/helpers/richMessages';

// * the worker proxy, which nothing here needs
vi.mock('@lib/apiManagerProxy', () => ({default: {addEventListener: () => {}, getState: () => Promise.resolve({})}}));

let getMessageMediaPeekSource: typeof import('@components/mediaPeek').getMessageMediaPeekSource;

beforeAll(async() => {
  // * the peek's module pulls the custom emoji and the environment probes in, which want what jsdom has none of
  stubBrowserGlobals();
  ({getMessageMediaPeekSource} = await import('@components/mediaPeek'));
});

// * a tile of the shared media holding a rich message is that message's photo or video (`getMediaFromMessageOrRich`),
// * and a hold on it peeks at that, as on any other tile

describe('a rich message held in the shared media', () => {
  const {richPhoto, richVideoAfterPhoto, richText, plainPhoto} = makeSharedMediaMessages();

  it('peeks at the photo or video its tile shows', () => {
    expect(getMessageMediaPeekSource(richVideoAfterPhoto, undefined, true)?.media).toBe(video);
    expect(getMessageMediaPeekSource(richPhoto, undefined, true)?.media).toBe(photo);
    expect(getMessageMediaPeekSource(richText, undefined, true)).toBeUndefined();
    expect(getMessageMediaPeekSource(plainPhoto, undefined, true)?.media).toBe(photo);
  });

  it('keeps out what a peek never shows', () => {
    const outgoing = makeSharedMediaMessages().richPhoto;
    outgoing.pFlags.is_outgoing = true;
    expect(getMessageMediaPeekSource(outgoing, undefined, true)).toBeUndefined();
    // * in the chat a rich message is held by its blocks' own media, never by the message
    expect(getMessageMediaPeekSource(richPhoto)).toBeUndefined();
  });
});
