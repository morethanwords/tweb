import {createRoot} from 'solid-js';
import type {Message} from '@layer';
import {EPHEMERAL_MESSAGE_ID_OFFSET} from '@appManagers/constants';

const mocks = vi.hoisted(() => {
  const messages = new Map<string, Message.message>();
  const listeners = new Map<string, Set<(payload: any) => void>>();
  return {
    detectLanguage: vi.fn<(text: string) => Promise<TranslatableLanguageISO>>(),
    messages,
    addEventListener: vi.fn((event: string, callback: (payload: any) => void) => {
      let callbacks = listeners.get(event);
      if(!callbacks) listeners.set(event, callbacks = new Set());
      callbacks.add(callback);
    }),
    dispatch(event: string, payload: any) {
      listeners.get(event)?.forEach((callback) => callback(payload));
    }
  };
});

vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    getMessageByPeer: (peerId: PeerId, mid: number) => mocks.messages.get(`${peerId}_${mid}`)
  }
}));
vi.mock('@lib/rootScope', () => ({default: {addEventListener: mocks.addEventListener}}));
vi.mock('@lib/tinyld/detect', () => ({default: mocks.detectLanguage}));
vi.mock('@stores/appSettings', () => ({
  useAppSettings: () => [{translations: {doNotTranslate: [] as TranslatableLanguageISO[]}}]
}));
vi.mock('@lib/langPack', () => ({default: {langCodeNormalized: () => 'en'}}));

import usePeerLanguage, {
  getMessageTranslationSourceToken,
  processMessageForTranslation,
  setPeerLanguageLoaded
} from '@stores/peerLanguage';

function message(peerId: PeerId, mid: number, text: string, editDate = 0): Message.message {
  return {
    _: 'message',
    pFlags: {},
    id: mid,
    mid,
    peer_id: {_: 'peerUser', user_id: peerId as UserId},
    peerId,
    date: 1,
    edit_date: editDate || undefined,
    message: text
  };
}

function saveMessage(value: Message.message) {
  mocks.messages.set(`${value.peerId}_${value.mid}`, value);
  return value;
}

function editMessage(value: Message.message) {
  saveMessage(value);
  mocks.dispatch('message_edit', {
    storageKey: `${value.peerId}_history`,
    peerId: value.peerId,
    mid: value.mid,
    message: value
  });
}

function editEphemeralMessage(value: Message.message) {
  saveMessage(value);
  mocks.dispatch('ephemeral_history_edit', {
    storageKey: `${value.peerId}_history`,
    peerId: value.peerId,
    mid: value.mid,
    message: value
  });
}

function languageAccessor(peerId: PeerId, onlyIfForeign = false) {
  let dispose: () => void;
  const accessor = createRoot((_dispose) => {
    dispose = _dispose;
    return usePeerLanguage(() => peerId, onlyIfForeign);
  });
  return {accessor, dispose: () => dispose()};
}

describe('peer message language accounting', () => {
  beforeEach(() => {
    mocks.messages.clear();
    mocks.detectLanguage.mockReset();
    mocks.detectLanguage.mockImplementation(async(text) => text.startsWith('fr') ? 'fr' : 'ru');
  });

  test('an edited message replaces its language counters and ignores stale in-flight detection', async() => {
    const peerId = 701 as PeerId;
    const firstMid = 11;
    const secondMid = 12;
    const thirdMid = 13;
    setPeerLanguageLoaded(peerId);
    const {accessor, dispose} = languageAccessor(peerId);

    await processMessageForTranslation(peerId, firstMid, saveMessage(message(peerId, firstMid, 'ru one')));
    await processMessageForTranslation(peerId, secondMid, saveMessage(message(peerId, secondMid, 'ru two')));
    await processMessageForTranslation(peerId, thirdMid, saveMessage(message(peerId, thirdMid, 'fr one')));
    expect(accessor()).toBe('ru');

    let resolveStale: (language: TranslatableLanguageISO) => void;
    let resolveCurrent: (language: TranslatableLanguageISO) => void;
    const stale = new Promise<TranslatableLanguageISO>((resolve) => resolveStale = resolve);
    const current = new Promise<TranslatableLanguageISO>((resolve) => resolveCurrent = resolve);
    mocks.detectLanguage.mockImplementation((text) => {
      if(text === 'fr stale') return stale;
      if(text === 'fr current') return current;
      return Promise.resolve(text.startsWith('fr') ? 'fr' : 'ru');
    });

    editMessage(message(peerId, firstMid, 'fr stale', 1));
    const staleProcessing = processMessageForTranslation(peerId, firstMid);
    editMessage(message(peerId, firstMid, 'fr current', 2));
    const currentProcessing = processMessageForTranslation(peerId, firstMid);

    resolveCurrent('fr');
    await currentProcessing;
    expect(accessor()).toBe('fr');

    resolveStale('ru');
    await staleProcessing;
    expect(accessor()).toBe('fr');
    dispose();
  });

  test('editing a foreign message updates the foreign percentage instead of double-counting it', async() => {
    const peerId = 702 as PeerId;
    setPeerLanguageLoaded(peerId);
    const {accessor, dispose} = languageAccessor(peerId, true);

    for(let index = 0; index < 8; ++index) {
      const text = index < 6 ? `fr ${index}` : `en ${index}`;
      mocks.detectLanguage.mockResolvedValueOnce(index < 6 ? 'fr' : 'en');
      await processMessageForTranslation(
        peerId,
        100 + index,
        saveMessage(message(peerId, 100 + index, text))
      );
    }
    expect(accessor()).toBe('fr');

    mocks.detectLanguage.mockResolvedValueOnce('en');
    const edited = message(peerId, 100, 'en edited', 1);
    editMessage(edited);
    await processMessageForTranslation(peerId, edited.mid);

    expect(accessor()).toBeUndefined();
    dispose();
  });

  test('streaming and temporary message ids never enter language accounting', async() => {
    const peerId = 703 as PeerId;
    setPeerLanguageLoaded(peerId);
    const streaming = message(peerId, 21, 'fr streaming');
    streaming.pFlags.currentlyTyping = true;

    saveMessage(streaming);
    await processMessageForTranslation(peerId, streaming.mid, {
      sourceText: 'fr streaming',
      sourceToken: getMessageTranslationSourceToken(streaming)
    });
    const temporary = saveMessage(message(peerId, 22.0001, 'fr temp'));
    await processMessageForTranslation(peerId, temporary.mid, {
      sourceText: 'fr temp',
      sourceToken: getMessageTranslationSourceToken(temporary)
    });

    expect(mocks.detectLanguage).not.toHaveBeenCalled();
  });

  test('media-only rich messages do not detect language from UI fallback labels', async() => {
    const peerId = 706 as PeerId;
    const mid = 23;
    const mediaOnly = message(peerId, mid, '');
    mediaOnly.rich_message = {
      _: 'richMessage',
      pFlags: {},
      blocks: [{
        _: 'pageBlockPhoto',
        pFlags: {},
        photo_id: 1,
        caption: {_: 'pageCaption', text: {_: 'textEmpty'}, credit: {_: 'textEmpty'}}
      }],
      photos: [],
      documents: []
    };

    await processMessageForTranslation(peerId, mid, saveMessage(mediaOnly));

    expect(mocks.detectLanguage).not.toHaveBeenCalled();
  });

  test('a mutable rich-media refresh does not invalidate in-flight text detection', async() => {
    const peerId = 707 as PeerId;
    const mid = 24;
    setPeerLanguageLoaded(peerId);
    const {accessor, dispose} = languageAccessor(peerId);
    const rich = message(peerId, mid, '');
    rich.rich_message = {
      _: 'richMessage',
      pFlags: {},
      blocks: [{_: 'pageBlockParagraph', text: {_: 'textPlain', text: 'fr stable text'}}],
      photos: [{
        _: 'photo',
        id: 'mutable-photo',
        file_reference: [1, 2, 3],
        sizes: []
      } as any],
      documents: []
    };
    saveMessage(rich);

    let resolveDetection: (language: TranslatableLanguageISO) => void;
    mocks.detectLanguage.mockReturnValueOnce(new Promise((resolve) => resolveDetection = resolve));
    const processing = processMessageForTranslation(peerId, mid, {
      sourceText: 'fr stable text',
      sourceToken: getMessageTranslationSourceToken(rich, 'fr stable text')
    });
    await Promise.resolve();

    const photo = rich.rich_message.photos[0] as any;
    photo.file_reference[0] = 9;
    photo.downloaded = 128;
    resolveDetection('fr');
    await processing;

    expect(accessor()).toBe('fr');
    dispose();
  });

  test('a nested rich-text change updates the source token even when the compact summary is stable', () => {
    const peerId = 709 as PeerId;
    const mid = 26;
    const makeNestedMessage = (nestedText: string) => {
      const value = message(peerId, mid, 'stable compact summary');
      value.rich_message = {
        _: 'richMessage',
        pFlags: {},
        blocks: [{
          _: 'pageBlockSlideshow',
          caption: {
            _: 'pageCaption',
            text: {_: 'textPlain', text: 'stable caption'},
            credit: {_: 'textEmpty'}
          },
          items: [{
            _: 'pageBlockPhoto',
            pFlags: {},
            photo_id: 1,
            caption: {
              _: 'pageCaption',
              text: {_: 'textPlain', text: nestedText},
              credit: {_: 'textEmpty'}
            }
          }]
        }],
        photos: [],
        documents: []
      };
      return value;
    };

    expect(getMessageTranslationSourceToken(makeNestedMessage('fr nested')))
    .not.toBe(getMessageTranslationSourceToken(makeNestedMessage('ru nested')));
  });

  test('a peer history flush drops counters and late detection before accumulating fresh history', async() => {
    const peerId = 708 as PeerId;
    const mid = 25;
    setPeerLanguageLoaded(peerId);
    const {accessor, dispose} = languageAccessor(peerId);
    const oldMessage = saveMessage(message(peerId, mid, 'fr obsolete'));
    let resolveOld: (language: TranslatableLanguageISO) => void;
    mocks.detectLanguage.mockReturnValueOnce(new Promise((resolve) => resolveOld = resolve));

    const oldProcessing = processMessageForTranslation(peerId, mid, oldMessage);
    await Promise.resolve();
    mocks.dispatch('peer_history_flush', {peerId});
    mocks.messages.delete(`${peerId}_${mid}`);
    resolveOld('fr');
    await oldProcessing;
    expect(accessor()).toBeUndefined();

    mocks.detectLanguage.mockResolvedValue('ru');
    for(let index = 0; index < 8; ++index) {
      const freshMid = 100 + index;
      await processMessageForTranslation(
        peerId,
        freshMid,
        saveMessage(message(peerId, freshMid, `ru fresh ${index}`))
      );
    }
    expect(accessor()).toBe('ru');

    mocks.dispatch('state_cleared', undefined);
    expect(accessor()).toBeUndefined();
    dispose();
  });

  test('history_delete removes language accounting for ordinary cached messages', async() => {
    const peerId = 710 as PeerId;
    const mids = Array.from({length: 8}, (_, index) => 200 + index);
    setPeerLanguageLoaded(peerId);
    const {accessor, dispose} = languageAccessor(peerId);

    for(const mid of mids) {
      await processMessageForTranslation(peerId, mid, saveMessage(message(peerId, mid, `fr ${mid}`)));
    }
    expect(accessor()).toBe('fr');

    mids.forEach((mid) => mocks.messages.delete(`${peerId}_${mid}`));
    mocks.dispatch('history_delete', {peerId, msgs: new Set(mids)});

    expect(accessor()).toBeUndefined();
    dispose();
  });

  test('a rich-text edit invalidates an obsolete flattened-text detection', async() => {
    const peerId = 704 as PeerId;
    const mid = 31;
    setPeerLanguageLoaded(peerId);
    const {accessor, dispose} = languageAccessor(peerId);
    const oldMessage = message(peerId, mid, '');
    oldMessage.rich_message = {
      _: 'richMessage',
      pFlags: {},
      blocks: [{_: 'pageBlockParagraph', text: {_: 'textPlain', text: 'ru obsolete'}}],
      photos: [],
      documents: []
    };
    saveMessage(oldMessage);

    let resolveOld: (language: TranslatableLanguageISO) => void;
    let resolveNew: (language: TranslatableLanguageISO) => void;
    const oldResult = new Promise<TranslatableLanguageISO>((resolve) => resolveOld = resolve);
    const newResult = new Promise<TranslatableLanguageISO>((resolve) => resolveNew = resolve);
    mocks.detectLanguage.mockImplementation((text) => text.includes('obsolete') ? oldResult : newResult);

    const oldProcessing = processMessageForTranslation(peerId, mid, {
      sourceText: 'ru obsolete',
      sourceToken: getMessageTranslationSourceToken(oldMessage)
    });
    const newMessage = message(peerId, mid, '', 1);
    newMessage.rich_message = {
      _: 'richMessage',
      pFlags: {},
      blocks: [{_: 'pageBlockParagraph', text: {_: 'textPlain', text: 'fr current'}}],
      photos: [],
      documents: []
    };
    editMessage(newMessage);
    const newProcessing = processMessageForTranslation(peerId, mid, {
      sourceText: 'fr current',
      sourceToken: getMessageTranslationSourceToken(newMessage)
    });

    resolveNew('fr');
    await newProcessing;
    expect(accessor()).toBe('fr');

    resolveOld('ru');
    await oldProcessing;
    expect(accessor()).toBe('fr');
    dispose();
  });

  test('ephemeral edits and deletes replace counters while fractional stream ids stay excluded', async() => {
    const peerId = 705 as PeerId;
    const ephemeralMid = EPHEMERAL_MESSAGE_ID_OFFSET + 41;
    setPeerLanguageLoaded(peerId);
    const {accessor, dispose} = languageAccessor(peerId);
    const initial = saveMessage(message(peerId, ephemeralMid, 'ru initial'));
    await processMessageForTranslation(peerId, ephemeralMid, initial);
    expect(accessor()).toBe('ru');

    let resolveEdit: (language: TranslatableLanguageISO) => void;
    const editResult = new Promise<TranslatableLanguageISO>((resolve) => resolveEdit = resolve);
    mocks.detectLanguage.mockImplementation((text) => (
      text === 'fr ephemeral edit' ? editResult : Promise.resolve('ru')
    ));

    const edited = message(peerId, ephemeralMid, 'fr ephemeral edit', 1);
    editEphemeralMessage(edited);
    mocks.messages.delete(`${peerId}_${ephemeralMid}`);
    mocks.dispatch('ephemeral_history_delete', {
      peerId,
      msgs: new Set([ephemeralMid])
    });

    resolveEdit('fr');
    await editResult;
    await Promise.resolve();
    expect(accessor()).toBeUndefined();

    const streamed = message(peerId, 42.0001, 'fr streamed');
    streamed.pFlags.currentlyTyping = true;
    editMessage(streamed);
    mocks.dispatch('history_delete', {peerId, msgs: new Set([streamed.mid])});
    await Promise.resolve();
    expect(accessor()).toBeUndefined();
    dispose();
  });
});
