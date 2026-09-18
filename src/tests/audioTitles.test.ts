/**
 * Naming a track. Six places used to dig `documentAttributeAudio` out of a document by hand — the
 * audio row, the topbar plate, the profile playlist row, the reply preview, the music picker, the
 * MediaSession metadata — and each one spelled the fallbacks slightly differently. They all read
 * these two helpers now, so what they agree on is pinned here.
 */

import getAudioAttribute from '@appManagers/utils/docs/getAudioAttribute';
import getAudioTitles from '@appManagers/utils/docs/getAudioTitles';
import type {MyDocument} from '@appManagers/appDocsManager';

// `file_name` is hoisted off documentAttributeFilename by appDocsManager.saveDoc, so a saved
// document carries it directly — that is what the helper reads
const makeDoc = (audio?: {title?: string, performer?: string}, fileName?: string) => ({
  _: 'document',
  id: '1',
  file_name: fileName,
  attributes: [
    {_: 'documentAttributeFilename', file_name: fileName},
    ...(audio ? [{_: 'documentAttributeAudio', pFlags: {}, duration: 214, ...audio}] : [])
  ]
} as any as MyDocument);

describe('getAudioAttribute', () => {
  test('picks the audio attribute out of the list', () => {
    expect(getAudioAttribute(makeDoc({title: 'Bohemian Rhapsody'}, 'queen.mp3')))
    .toMatchObject({_: 'documentAttributeAudio', title: 'Bohemian Rhapsody', duration: 214});
  });

  test('has nothing to say about a document without one', () => {
    expect(getAudioAttribute(makeDoc(undefined, 'notes.pdf'))).toBeUndefined();
    expect(getAudioAttribute(undefined)).toBeUndefined();
  });
});

describe('getAudioTitles', () => {
  test('names the track from its audio attribute', () => {
    expect(getAudioTitles(makeDoc({title: 'Bohemian Rhapsody', performer: 'Queen'})))
    .toEqual({title: 'Bohemian Rhapsody', performer: 'Queen'});
  });

  test('either half on its own is enough', () => {
    expect(getAudioTitles(makeDoc({performer: 'Queen'})))
    .toEqual({title: undefined, performer: 'Queen'});
    expect(getAudioTitles(makeDoc({title: 'Bohemian Rhapsody'})))
    .toEqual({title: 'Bohemian Rhapsody', performer: undefined});
  });

  test('falls back to the file name before giving up', () => {
    expect(getAudioTitles(makeDoc({}, 'queen.mp3')))
    .toEqual({title: 'queen.mp3', performer: undefined});
    // an empty title is no title: the call sites that used `??` would have shown a blank row
    expect(getAudioTitles(makeDoc({title: ''}, 'queen.mp3')))
    .toEqual({title: 'queen.mp3', performer: undefined});
  });

  test('a track with nothing to show gets named nothing at all', () => {
    expect(getAudioTitles(makeDoc({}))).toBeUndefined();
    expect(getAudioTitles(undefined)).toBeUndefined();
  });
});
