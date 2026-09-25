import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import AppTranslationsManager from '@appManagers/appTranslationsManager';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {InputPeer, Message, RichMessage} from '@layer';

const peerId = 10 as PeerId;
const inputPeer: InputPeer.inputPeerUser = {
  _: 'inputPeerUser',
  user_id: 10,
  access_hash: '1'
};

const translated = (text: string): RichMessage.richMessage => ({
  _: 'richMessage',
  pFlags: {},
  blocks: [{
    _: 'pageBlockHeading2',
    text: {_: 'textPlain', text}
  }],
  photos: [],
  documents: []
});

function makeManager(results: RichMessage[]) {
  const manager = new AppTranslationsManager();
  const invokeApi = vi.fn().mockResolvedValue({
    _: 'messages.translatedRichMessage',
    result: results
  });
  const saveDoc = vi.fn((document) => document);
  const savePhoto = vi.fn((photo) => photo);
  const appMessagesManager = new AppMessagesManager();
  Object.assign(appMessagesManager as any, {
    appDocsManager: {saveDoc},
    appPhotosManager: {savePhoto},
    referencesStorage: {deleteContext: vi.fn()},
    thumbsStorage: {deleteCacheContext: vi.fn()}
  });

  Object.assign(manager as any, {
    apiManager: {invokeApi},
    appPeersManager: {getInputPeerById: vi.fn(() => inputPeer)},
    appMessagesManager,
    appDocsManager: {saveDoc},
    appPhotosManager: {savePhoto}
  });

  return {invokeApi, manager, saveDoc, savePhoto};
}

describe('rich message translation manager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('batches messages by peer and language and caches structured results', async() => {
    const first = translated('Erste');
    const second = translated('Zweite');
    const {invokeApi, manager} = makeManager([first, second]);

    const firstPromise = manager.translateRichMessage({peerId, mid: 41, lang: 'de'});
    const secondPromise = manager.translateRichMessage({peerId, mid: 42, lang: 'de'});
    await vi.runAllTimersAsync();

    await expect(firstPromise).resolves.toBe(first);
    await expect(secondPromise).resolves.toBe(second);
    expect(invokeApi).toHaveBeenCalledOnce();
    expect(invokeApi).toHaveBeenCalledWith('messages.translateRichMessage', {
      peer: inputPeer,
      id: [41, 42],
      to_lang: 'de'
    });
    expect(manager.translateRichMessage({peerId, mid: 41, lang: 'de', onlyCache: true})).toBe(first);
  });

  test('registers translated media with the source message reference context', async() => {
    const result = translated('Medien');
    result.documents = [{_: 'document', id: 100} as any];
    result.photos = [{_: 'photo', id: 200, sizes: []} as any];
    const {manager, saveDoc, savePhoto} = makeManager([result]);

    const promise = manager.translateRichMessage({peerId, mid: 42, lang: 'de'});
    await vi.runAllTimersAsync();
    await promise;

    const context = {type: 'messageRichTranslation', peerId, messageId: 42, lang: 'de'};
    expect(saveDoc).toHaveBeenCalledWith(result.documents[0], context);
    expect(savePhoto).toHaveBeenCalledWith(result.photos[0], context);
  });

  test('drops cached rich translations when a message is reset', async() => {
    const first = translated('Alt');
    const second = translated('Neu');
    const {invokeApi, manager} = makeManager([first]);

    const initial = manager.translateRichMessage({peerId, mid: 42, lang: 'de'});
    await vi.runAllTimersAsync();
    await initial;
    manager.resetMessageTranslations(peerId, 42);
    expect(manager.translateRichMessage({peerId, mid: 42, lang: 'de', onlyCache: true})).toBeUndefined();

    invokeApi.mockResolvedValueOnce({_: 'messages.translatedRichMessage', result: [second]});
    const refreshed = manager.translateRichMessage({peerId, mid: 42, lang: 'de'});
    await vi.runAllTimersAsync();
    await expect(refreshed).resolves.toBe(second);
    expect(invokeApi).toHaveBeenCalledTimes(2);
  });

  test('does not publish an in-flight rich translation after the source message was edited', async() => {
    let resolveRequest!: (value: {
      _: 'messages.translatedRichMessage',
      result: RichMessage[]
    }) => void;
    const {invokeApi, manager} = makeManager([]);
    invokeApi.mockReturnValueOnce(new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const pending = manager.translateRichMessage({peerId, mid: 42, lang: 'de'});
    vi.advanceTimersByTime(0);
    manager.resetMessageTranslations(peerId, 42);

    await expect(pending).rejects.toMatchObject({type: 'MESSAGE_ID_INVALID'});
    resolveRequest({_: 'messages.translatedRichMessage', result: [translated('Stale')]});
    await Promise.resolve();
    await Promise.resolve();

    expect(manager.translateRichMessage({peerId, mid: 42, lang: 'de', onlyCache: true}))
    .toBeUndefined();
  });

  test('invalidates a cached translation when only the rich blocks were edited', () => {
    const manager = new AppMessagesManager();
    const resetMessageTranslations = vi.fn();
    Object.assign(manager as any, {
      appTranslationsManager: {
        hasTriedToTranslateMessage: vi.fn(() => true),
        resetMessageTranslations,
        clearSummaries: vi.fn()
      }
    });
    const makeMessage = (richMessage: RichMessage): Message.message => ({
      _: 'message',
      id: 42,
      mid: 42,
      peerId,
      peer_id: {_: 'peerUser', user_id: 10},
      pFlags: {},
      date: 0,
      message: '',
      rich_message: richMessage
    });

    (manager as any).handleEditedMessage(
      makeMessage(translated('Before')),
      makeMessage(translated('After')),
      {}
    );

    expect(resetMessageTranslations).toHaveBeenCalledWith(peerId, 42);
  });
});
