/**
 * A transcription arrives in pieces: the server answers `pending` first and fills the text in later
 * updates, and it reports failure by answering with no text and nothing more coming. The row folds
 * every one of those updates through `reduceTranscribed`, so the transition table lives here.
 */

import {vi} from 'vitest';
import {reduceTranscribed, TranscriptionState} from '@components/audioTranscription';

// only the premium upsell on the button's click path needs it, and it drags the popup graph into jsdom
vi.mock('@components/popups/premium', () => ({default: {show: () => {}}}));

const IDLE: TranscriptionState = {
  status: 'idle',
  text: '',
  pending: false,
  error: false,
  expanded: false
};

const fold = (prev: TranscriptionState, update: {text: string, pending?: boolean}) => {
  return {...prev, ...reduceTranscribed(prev, update)};
};

describe('audio transcription state', () => {
  test('the first partial answer opens the transcription and keeps the dots', () => {
    const state = fold(IDLE, {text: '', pending: true});

    expect(state.status).toBe('transcribed');
    expect(state.pending).toBe(true);
    expect(state.error).toBe(false);
    expect(state.expanded).toBe(true);
  });

  test('a later answer fills the text in and stops the dots', () => {
    const state = fold(fold(IDLE, {text: 'hel', pending: true}), {text: 'hello there'});

    expect(state.text).toBe('hello there');
    expect(state.pending).toBe(false);
    expect(state.error).toBe(false);
  });

  test('no text and nothing more coming is a failure', () => {
    expect(fold(IDLE, {text: ''}).error).toBe(true);
    // ...whereas no text with more to come is just the server still working
    expect(fold(IDLE, {text: '', pending: true}).error).toBe(false);
  });

  test('an update does not reopen a transcription the reader collapsed', () => {
    const opened = fold(IDLE, {text: 'partial', pending: true});
    const collapsed = {...opened, expanded: false};

    expect(fold(collapsed, {text: 'partial and then some'}).expanded).toBe(false);
  });
});
