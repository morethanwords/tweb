import {
  Message,
  MessagesMessages,
  MessagesTranslatedRichMessage,
  MessagesTranslatedText,
  RichMessage,
  TextWithEntities
} from '@layer';
import {AppMessagesManager, MessagesStorage} from '@appManagers/appMessagesManager';
import {AppProfileManager} from '@appManagers/appProfileManager';
import {ApiUpdatesManager} from '@appManagers/apiUpdatesManager';
import AppTranslationsManager from '@appManagers/appTranslationsManager';
import {MESSAGE_ID_OFFSET} from '@appManagers/constants';
import DialogsStorage, {FilterType} from '@lib/storages/dialogs';
import {ReferencesStorage} from '@lib/storages/references';
import MonoforumDialogsStorage from '@lib/storages/monoforumDialogs';
import SlicedArray from '@helpers/slicedArray';
import '@helpers/peerIdPolyfill';

const peerId = 10 as PeerId;
const mid = 42;

function deferred<T>() {
  let resolve: (value: T) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });

  return {promise, resolve, reject};
}

function singleProcessDedupHarness() {
  let cached: Promise<any>;
  const requests: Array<{
    options: any,
    processResult: (result: any) => any,
    transport: ReturnType<typeof deferred<any>>
  }> = [];
  const invokeApiSingleProcess = vi.fn((options: any) => {
    if(cached && !options.options?.overwrite) return cached;

    const transport = deferred<any>();
    requests.push({...options, transport});
    const processed = transport.promise.then(options.processResult);
    const promise = processed.finally(() => {
      if(cached === promise) cached = undefined;
    });
    cached = promise;
    return promise;
  });

  return {invokeApiSingleProcess, requests};
}

function promiseOutcome<T>(value: MaybeDeferredPromise<T>) {
  return Promise.resolve(value).then(() => 'fulfilled' as const, () => 'rejected' as const);
}

function translated(text: string): TextWithEntities {
  return {_: 'textWithEntities', text, entities: []};
}

function translationResult(text: string): MessagesTranslatedText {
  return {_: 'messages.translateResult', result: [translated(text)]};
}

function richTranslationResult(value: RichMessage): MessagesTranslatedRichMessage {
  return {_: 'messages.translatedRichMessage', result: [value]};
}

function makeRichProcessingHarness() {
  const manager = new AppMessagesManager() as any;
  const savePhoto = vi.fn((photo: any, context: unknown) => ({...photo, normalized: 'photo', context}));
  const saveDoc = vi.fn((document: any, context: unknown) => ({...document, normalized: 'document', context}));
  const saveApiChat = vi.fn();
  const deleteContext = vi.fn();
  const deleteCacheContext = vi.fn();
  Object.assign(manager, {
    appPhotosManager: {savePhoto},
    appDocsManager: {saveDoc},
    appChatsManager: {saveApiChat, isBroadcast: () => false},
    referencesStorage: {deleteContext},
    thumbsStorage: {deleteCacheContext}
  });

  return {manager, savePhoto, saveDoc, saveApiChat, deleteContext, deleteCacheContext};
}

function makeTranslationsHarness() {
  const manager = new AppTranslationsManager() as any;
  const invokeApi = vi.fn();
  const richProcessing = makeRichProcessingHarness();
  Object.assign(richProcessing.manager, {
    wrapMessageEntities: vi.fn(),
    getInputEntities: (entities: unknown[]) => entities,
    getMessageByPeer: vi.fn(),
    isMessageIdUnavailableByChannelCutoff: () => false,
    isEphemeralMessageId: () => false,
    isEphemeralMessage: () => false
  });
  Object.assign(manager, {
    apiManager: {invokeApi},
    appPeersManager: {
      getInputPeerById: () => ({_: 'inputPeerEmpty'})
    },
    appMessagesManager: richProcessing.manager
  });

  return {
    manager: manager as AppTranslationsManager,
    invokeApi,
    processingManager: richProcessing.manager,
    savePhoto: richProcessing.savePhoto,
    saveDoc: richProcessing.saveDoc,
    saveApiChat: richProcessing.saveApiChat,
    deleteContext: richProcessing.deleteContext,
    deleteCacheContext: richProcessing.deleteCacheContext
  };
}

async function runNextTranslationBatch() {
  await vi.runOnlyPendingTimersAsync();
  await Promise.resolve();
}

function makeRichMessage(text: string): RichMessage {
  return {
    _: 'richMessage',
    pFlags: {},
    blocks: [{_: 'pageBlockParagraph', text: {_: 'textPlain', text}}],
    photos: [],
    documents: []
  };
}

function makeMessage(richMessage: RichMessage): Message.message {
  return {
    _: 'message',
    id: mid,
    mid,
    peer_id: {_: 'peerUser', user_id: peerId as UserId},
    peerId,
    from_id: {_: 'peerUser', user_id: peerId as UserId},
    fromId: peerId,
    pFlags: {},
    date: 1_000,
    message: '',
    entities: [],
    rich_message: richMessage
  };
}

function slicedArray<T extends number | string>(values: T[]) {
  const result = new SlicedArray<T>();
  result.first.push(...values);
  return result;
}

function makeRichMessagesHarness() {
  const richProcessing = makeRichProcessingHarness();
  const manager = richProcessing.manager;
  const invokeApi = vi.fn();
  const saveApiResult = vi.fn();
  Object.assign(manager, {
    apiManager: {invokeApi},
    rootScope: {dispatchEvent: vi.fn()},
    appPeersManager: {
      getInputPeerById: () => ({_: 'inputPeerEmpty'}),
      saveApiPeers: vi.fn()
    },
    appTranslationsManager: {
      hasTriedToTranslateMessage: () => false,
      resetMessageTranslations: vi.fn(),
      resetPeerTranslationsByChannelCutoff: vi.fn(() => new Set<number>()),
      clearSummaries: vi.fn()
    },
    getMessageByPeer: vi.fn(),
    saveApiResult
  });

  return {...richProcessing, manager, invokeApi, saveApiResult};
}

describe('manager cache race guards', () => {
  describe('AppTranslationsManager', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
      vi.clearAllTimers();
      vi.useRealTimers();
    });

    test('channel cutoff does not cache translation work and lowering starts fresh requests', async() => {
      const {manager, invokeApi, processingManager} = makeTranslationsHarness();
      let unavailable = true;
      processingManager.isMessageIdUnavailableByChannelCutoff = () => unavailable;

      expect(manager.translateText({peerId, mid, lang: 'es', onlyCache: true})).toBeUndefined();
      await expect(manager.translateText({peerId, mid, lang: 'es'})).rejects.toMatchObject({
        type: 'MESSAGE_ID_INVALID'
      });
      expect(manager.translateRichMessage({peerId, mid, lang: 'es', onlyCache: true})).toBeUndefined();
      await expect(manager.translateRichMessage({peerId, mid, lang: 'es'})).rejects.toMatchObject({
        type: 'MESSAGE_ID_INVALID'
      });
      await expect(manager.summarizeText({peerId, mid, lang: 'es'})).rejects.toMatchObject({
        type: 'MESSAGE_ID_INVALID'
      });
      expect(invokeApi).not.toHaveBeenCalled();
      expect((manager as any).translateTextBatch.es).toBeUndefined();
      expect((manager as any).translateRichMessageBatch.es).toBeUndefined();
      expect((manager as any).summaries[peerId]).toBeUndefined();

      unavailable = false;
      invokeApi
      .mockResolvedValueOnce(translationResult('translated after lowering'))
      .mockResolvedValueOnce(richTranslationResult(makeRichMessage('rich after lowering')))
      .mockResolvedValueOnce(translated('summary after lowering'));

      const textPromise = manager.translateText({peerId, mid, lang: 'es'});
      await runNextTranslationBatch();
      await expect(textPromise).resolves.toEqual(translated('translated after lowering'));

      const richPromise = manager.translateRichMessage({peerId, mid, lang: 'es'});
      await runNextTranslationBatch();
      await expect(richPromise).resolves.toEqual(makeRichMessage('rich after lowering'));

      await expect(manager.summarizeText({peerId, mid, lang: 'es'})).resolves.toEqual(
        translated('summary after lowering')
      );
      expect(invokeApi).toHaveBeenCalledTimes(3);
    });

    test('an obsolete successful translation cannot replace the post-edit request', async() => {
      const {manager, invokeApi} = makeTranslationsHarness();
      const firstResult = deferred<MessagesTranslatedText>();
      const secondResult = deferred<MessagesTranslatedText>();
      invokeApi.mockReturnValueOnce(firstResult.promise).mockReturnValueOnce(secondResult.promise);

      const first = manager.translateText({peerId, mid, lang: 'es'});
      const firstOutcome = promiseOutcome(first);
      await runNextTranslationBatch();
      expect(invokeApi).toHaveBeenCalledTimes(1);

      manager.resetMessageTranslations(peerId, mid);
      const second = manager.translateText({peerId, mid, lang: 'es'});
      expect(second).not.toBe(first);
      await expect(firstOutcome).resolves.toBe('rejected');

      firstResult.resolve(translationResult('obsolete'));
      await Promise.resolve();
      expect(manager.translateText({peerId, mid, lang: 'es', onlyCache: true})).toBe(second);

      await runNextTranslationBatch();
      expect(invokeApi).toHaveBeenCalledTimes(2);
      secondResult.resolve(translationResult('current'));
      await expect(second).resolves.toEqual(translated('current'));
      expect(manager.translateText({peerId, mid, lang: 'es', onlyCache: true})).toEqual(translated('current'));
    });

    test('difference-too-long clears pending translations before a late response can run side effects', async() => {
      const {manager, invokeApi, savePhoto, deleteContext} = makeTranslationsHarness();
      const result = deferred<MessagesTranslatedRichMessage>();
      const lateRichMessage = makeRichMessage('late');
      lateRichMessage.photos = [{
        _: 'photo',
        id: 'late-photo',
        file_reference: [1, 2, 3],
        sizes: []
      } as any];
      const cachedRichMessage = makeRichMessage('cached');
      const cachedReference = [4, 5, 6];
      cachedRichMessage.photos = [{
        _: 'photo',
        id: 'cached-photo',
        file_reference: cachedReference,
        sizes: []
      } as any];
      invokeApi.mockReturnValueOnce(result.promise);
      Object.assign(manager as any, {
        translateRichMessageBatch: {
          fr: {
            messages: new Map([[peerId, new Map([[mid + 1, cachedRichMessage]])]]),
            messagesPromises: new Map()
          }
        },
        triedToTranslateMessages: new Map([
          [`${peerId}_${mid + 1}`, new Set(['fr'])]
        ])
      });

      const pending = manager.translateRichMessage({peerId, mid, lang: 'es'});
      const pendingOutcome = promiseOutcome(pending);
      await runNextTranslationBatch();

      const updatesManager = new ApiUpdatesManager() as any;
      Object.assign(updatesManager, {
        appTranslationsManager: manager,
        rootScope: {dispatchEvent: vi.fn()}
      });
      updatesManager.onDifferenceTooLong();

      await expect(pendingOutcome).resolves.toBe('rejected');
      expect(deleteContext).toHaveBeenCalledWith(cachedReference, {
        type: 'messageRichTranslation',
        peerId,
        messageId: mid + 1,
        lang: 'fr'
      });
      expect(manager.translateRichMessage({peerId, mid: mid + 1, lang: 'fr', onlyCache: true})).toBeUndefined();

      result.resolve(richTranslationResult(lateRichMessage));
      await Promise.resolve();
      await Promise.resolve();

      expect(savePhoto).not.toHaveBeenCalledWith(
        expect.objectContaining({id: 'late-photo'}),
        expect.anything()
      );
      expect(manager.translateRichMessage({peerId, mid, lang: 'es', onlyCache: true})).toBeUndefined();
    });

    test('an obsolete rejected translation cannot evict the post-edit request', async() => {
      const {manager, invokeApi} = makeTranslationsHarness();
      const firstResult = deferred<MessagesTranslatedText>();
      const secondResult = deferred<MessagesTranslatedText>();
      invokeApi.mockReturnValueOnce(firstResult.promise).mockReturnValueOnce(secondResult.promise);

      const first = manager.translateText({peerId, mid, lang: 'fr'});
      const firstOutcome = promiseOutcome(first);
      await runNextTranslationBatch();
      manager.resetMessageTranslations(peerId, mid);
      const second = manager.translateText({peerId, mid, lang: 'fr'});
      const error = new Error('obsolete request failed');
      await expect(firstOutcome).resolves.toBe('rejected');

      firstResult.reject(error);
      await Promise.resolve();
      expect(manager.translateText({peerId, mid, lang: 'fr', onlyCache: true})).toBe(second);

      await runNextTranslationBatch();
      secondResult.resolve(translationResult('actuel'));
      await expect(second).resolves.toEqual(translated('actuel'));
    });

    test('reset before the text batch timer settles the old deferred and sends only its replacement', async() => {
      const {manager, invokeApi} = makeTranslationsHarness();
      const result = deferred<MessagesTranslatedText>();
      invokeApi.mockReturnValueOnce(result.promise);

      const first = manager.translateText({peerId, mid, lang: 'it'});
      const firstOutcome = promiseOutcome(first);
      manager.resetMessageTranslations(peerId, mid);
      const second = manager.translateText({peerId, mid, lang: 'it'});

      expect(second).not.toBe(first);
      await expect(firstOutcome).resolves.toBe('rejected');
      await runNextTranslationBatch();
      expect(invokeApi).toHaveBeenCalledOnce();
      expect(invokeApi).toHaveBeenCalledWith('messages.translateText', {
        peer: {_: 'inputPeerEmpty'},
        id: [mid],
        to_lang: 'it'
      });

      result.resolve(translationResult('corrente'));
      await expect(second).resolves.toEqual(translated('corrente'));
    });

    test('reset before an unneeded text batch timer never invokes an empty batch', async() => {
      const {manager, invokeApi} = makeTranslationsHarness();
      const first = manager.translateText({peerId, mid, lang: 'pl'});
      const firstOutcome = promiseOutcome(first);

      manager.resetMessageTranslations(peerId, mid);
      await expect(firstOutcome).resolves.toBe('rejected');
      await runNextTranslationBatch();

      expect(invokeApi).not.toHaveBeenCalled();
    });

    test('rich message translation uses the rich endpoint and caches the complete structure', async() => {
      const {manager, invokeApi} = makeTranslationsHarness();
      const result = deferred<MessagesTranslatedRichMessage>();
      const translatedRichMessage: RichMessage = {
        _: 'richMessage',
        pFlags: {rtl: true},
        blocks: [{_: 'pageBlockHeader', text: {_: 'textPlain', text: 'Encabezado'}}],
        photos: [],
        documents: []
      };
      invokeApi.mockReturnValueOnce(result.promise);

      const promise = manager.translateRichMessage({peerId, mid, lang: 'es'});
      await runNextTranslationBatch();

      expect(invokeApi).toHaveBeenCalledWith('messages.translateRichMessage', {
        peer: {_: 'inputPeerEmpty'},
        id: [mid],
        to_lang: 'es'
      });

      result.resolve(richTranslationResult(translatedRichMessage));
      await expect(promise).resolves.toEqual(translatedRichMessage);
      expect(manager.translateRichMessage({peerId, mid, lang: 'es', onlyCache: true})).toBe(translatedRichMessage);
      expect(manager.translateRichMessage({peerId, mid, lang: 'es'})).toBe(translatedRichMessage);
      expect(invokeApi).toHaveBeenCalledOnce();
    });

    test('concurrent rich-media reference refreshes share one replacement translation request', async() => {
      const {manager, invokeApi, deleteContext} = makeTranslationsHarness();
      const initialResult = deferred<MessagesTranslatedRichMessage>();
      const refreshResult = deferred<MessagesTranslatedRichMessage>();
      invokeApi.mockReturnValueOnce(initialResult.promise).mockReturnValueOnce(refreshResult.promise);
      const initialRichMessage = makeRichMessage('initial');
      const removedReference = [3, 2, 1];
      initialRichMessage.photos = [{
        _: 'photo',
        id: 'removed-on-refresh',
        file_reference: removedReference,
        sizes: []
      } as any];

      const initial = manager.translateRichMessage({peerId, mid, lang: 'es'});
      await runNextTranslationBatch();
      initialResult.resolve(richTranslationResult(initialRichMessage));
      await initial;

      const firstRefresh = manager.refreshRichMessageTranslation(peerId, mid, 'es');
      const secondRefresh = manager.refreshRichMessageTranslation(peerId, mid, 'es');
      expect(secondRefresh).toBe(firstRefresh);
      await runNextTranslationBatch();
      expect(invokeApi).toHaveBeenCalledTimes(2);

      refreshResult.resolve(richTranslationResult(makeRichMessage('refreshed')));
      await expect(firstRefresh).resolves.toEqual(makeRichMessage('refreshed'));
      expect(deleteContext).toHaveBeenCalledWith(removedReference, {
        type: 'messageRichTranslation',
        peerId,
        messageId: mid,
        lang: 'es'
      });
    });

    test('translated rich media is normalized with its message context and nested channels are saved', async() => {
      const {manager, invokeApi, savePhoto, saveDoc, saveApiChat} = makeTranslationsHarness();
      const result = deferred<MessagesTranslatedRichMessage>();
      const photo = {_: 'photo', id: 'photo-1'} as any;
      const document = {_: 'document', id: 'document-1'} as any;
      const channel = {_: 'channel', id: 77, pFlags: {}, title: 'Embedded'} as any;
      const translatedRichMessage: RichMessage = {
        _: 'richMessage',
        pFlags: {},
        blocks: [{
          _: 'pageBlockDetails',
          pFlags: {},
          title: {_: 'textPlain', text: 'Details'},
          blocks: [{_: 'pageBlockChannel', channel}]
        }],
        photos: [photo],
        documents: [document]
      };
      invokeApi.mockReturnValueOnce(result.promise);

      const promise = manager.translateRichMessage({peerId, mid, lang: 'es'});
      await runNextTranslationBatch();
      result.resolve(richTranslationResult(translatedRichMessage));
      const translated = await promise;
      const context = {type: 'messageRichTranslation', peerId, messageId: mid, lang: 'es'};

      expect(savePhoto).toHaveBeenCalledWith(photo, context);
      expect(saveDoc).toHaveBeenCalledWith(document, context);
      expect(translated.photos[0]).toEqual(expect.objectContaining({normalized: 'photo', context}));
      expect(translated.documents[0]).toEqual(expect.objectContaining({normalized: 'document', context}));
      expect(saveApiChat).toHaveBeenCalledWith(channel);
    });

    test('an obsolete rich translation is rejected before media normalization side effects', async() => {
      const {manager, invokeApi, savePhoto, saveDoc} = makeTranslationsHarness();
      const result = deferred<MessagesTranslatedRichMessage>();
      invokeApi.mockReturnValueOnce(result.promise);
      const obsolete = makeRichMessage('obsolete');
      obsolete.photos = [{_: 'photo', id: 'obsolete-photo', file_reference: [1], sizes: []} as any];
      obsolete.documents = [{_: 'document', id: 'obsolete-doc', file_reference: [2], attributes: []} as any];

      const promise = manager.translateRichMessage({peerId, mid, lang: 'es'});
      const outcome = promiseOutcome(promise);
      await runNextTranslationBatch();
      manager.resetMessageTranslations(peerId, mid);
      await expect(outcome).resolves.toBe('rejected');

      result.resolve(richTranslationResult(obsolete));
      await Promise.resolve();

      expect(savePhoto).not.toHaveBeenCalled();
      expect(saveDoc).not.toHaveBeenCalled();
    });

    test('a rich translation processor exception clears the batch lock and allows retry', async() => {
      const {manager, invokeApi, processingManager} = makeTranslationsHarness();
      const firstResult = deferred<MessagesTranslatedRichMessage>();
      const secondResult = deferred<MessagesTranslatedRichMessage>();
      const error = new Error('rich processing failed');
      const processRichMessage = vi.spyOn(processingManager, 'processRichMessage')
      .mockImplementationOnce(() => {
        throw error;
      })
      .mockImplementation((richMessage) => richMessage);
      invokeApi.mockReturnValueOnce(firstResult.promise).mockReturnValueOnce(secondResult.promise);

      const first = manager.translateRichMessage({peerId, mid, lang: 'de'});
      await runNextTranslationBatch();
      firstResult.resolve(richTranslationResult(makeRichMessage('broken')));
      await expect(first).rejects.toBe(error);

      const second = manager.translateRichMessage({peerId, mid, lang: 'de'});
      await runNextTranslationBatch();
      expect(invokeApi).toHaveBeenCalledTimes(2);
      secondResult.resolve(richTranslationResult(makeRichMessage('current')));
      await expect(second).resolves.toEqual(makeRichMessage('current'));
      expect(processRichMessage).toHaveBeenCalledTimes(2);
    });

    test('evicting a translated rich message releases only its typed media context and temporary caches', async() => {
      const {manager, invokeApi, deleteContext, deleteCacheContext} = makeTranslationsHarness();
      const result = deferred<MessagesTranslatedRichMessage>();
      const richMessage = makeRichMessage('media');
      const photoReference = [1, 2, 3];
      richMessage.photos = [
        {_: 'photo', id: 'referenced-photo', file_reference: photoReference, sizes: []} as any,
        {_: 'photo', id: 'temporary-photo', sizes: []} as any
      ];
      richMessage.documents = [
        {_: 'document', id: 'temporary-doc', attributes: []} as any
      ];
      invokeApi.mockReturnValueOnce(result.promise);

      const promise = manager.translateRichMessage({peerId, mid, lang: 'it'});
      await runNextTranslationBatch();
      result.resolve(richTranslationResult(richMessage));
      await promise;
      manager.resetMessageTranslations(peerId, mid);

      expect(deleteContext).toHaveBeenCalledWith(photoReference, {
        type: 'messageRichTranslation',
        peerId,
        messageId: mid,
        lang: 'it'
      });
      expect(deleteCacheContext).toHaveBeenCalledWith(expect.objectContaining({id: 'temporary-photo'}));
      expect(deleteCacheContext).toHaveBeenCalledWith(expect.objectContaining({id: 'temporary-doc'}));
      expect(deleteCacheContext).toHaveBeenCalledWith(expect.objectContaining({id: 'temporary-doc'}), 'local-thumb');
    });

    test('resetting a peer releases all of its translated rich media without touching another peer', () => {
      const {manager, deleteContext} = makeTranslationsHarness();
      const otherPeerId = 11 as PeerId;
      const ownReference = [1, 0];
      const otherReference = [2, 0];
      const ownRichMessage = makeRichMessage('own');
      ownRichMessage.photos = [{
        _: 'photo',
        id: 'own-photo',
        file_reference: ownReference,
        sizes: []
      } as any];
      const otherRichMessage = makeRichMessage('other');
      otherRichMessage.photos = [{
        _: 'photo',
        id: 'other-photo',
        file_reference: otherReference,
        sizes: []
      } as any];
      const richMessages = new Map([
        [peerId, new Map([[mid, ownRichMessage]])],
        [otherPeerId, new Map([[mid, otherRichMessage]])]
      ]);
      Object.assign(manager as any, {
        translateRichMessageBatch: {
          es: {messages: richMessages, messagesPromises: new Map()}
        },
        triedToTranslateMessages: new Map([
          [`${peerId}_${mid}`, new Set(['es'])],
          [`${otherPeerId}_${mid}`, new Set(['es'])]
        ]),
        summaries: {
          [peerId]: {[mid]: {es: translated('own summary')}},
          [otherPeerId]: {[mid]: {es: translated('other summary')}}
        }
      });

      manager.resetPeerTranslations(peerId);

      expect(richMessages.get(peerId)).toBeUndefined();
      expect(richMessages.get(otherPeerId).get(mid)).toBe(otherRichMessage);
      expect((manager as any).summaries[peerId]).toBeUndefined();
      expect((manager as any).summaries[otherPeerId]).toBeDefined();
      expect(deleteContext).toHaveBeenCalledWith(ownReference, {
        type: 'messageRichTranslation',
        peerId,
        messageId: mid,
        lang: 'es'
      });
      expect(deleteContext).not.toHaveBeenCalledWith(otherReference, expect.anything());
    });

    test('cutoff reset uses the centralized predicate and preserves legacy, local and ephemeral ids', () => {
      const {manager, deleteContext} = makeTranslationsHarness();
      const oldMid = MESSAGE_ID_OFFSET + mid;
      const newMid = mid + 1;
      const legacyMid = mid;
      const localMid = oldMid + 0.001;
      const ephemeralMid = MESSAGE_ID_OFFSET * 2 + mid;
      const oldReference = [3, 0];
      const newReference = [4, 0];
      const oldRichMessage = makeRichMessage('old');
      oldRichMessage.photos = [{
        _: 'photo',
        id: 'old-translation-photo',
        file_reference: oldReference,
        sizes: []
      } as any];
      const newRichMessage = makeRichMessage('new');
      newRichMessage.photos = [{
        _: 'photo',
        id: 'new-translation-photo',
        file_reference: newReference,
        sizes: []
      } as any];
      const richMessages = new Map([[peerId, new Map([
        [oldMid, oldRichMessage],
        [newMid, newRichMessage],
        [legacyMid, makeRichMessage('legacy')],
        [localMid, makeRichMessage('local')],
        [ephemeralMid, makeRichMessage('ephemeral')]
      ])]]);
      Object.assign(manager as any, {
        translateRichMessageBatch: {
          es: {messages: richMessages, messagesPromises: new Map()}
        },
        triedToTranslateMessages: new Map([
          [`${peerId}_${oldMid}`, new Set(['es'])],
          [`${peerId}_${newMid}`, new Set(['es'])],
          [`${peerId}_${legacyMid}`, new Set(['es'])],
          [`${peerId}_${localMid}`, new Set(['es'])],
          [`${peerId}_${ephemeralMid}`, new Set(['es'])]
        ]),
        summaries: {
          [peerId]: {
            [oldMid]: {es: translated('old summary')},
            [newMid]: {es: translated('new summary')},
            [legacyMid]: {es: translated('legacy summary')},
            [localMid]: {es: translated('local summary')},
            [ephemeralMid]: {es: translated('ephemeral summary')}
          }
        }
      });
      Object.assign((manager as any).appMessagesManager, {
        isMessageIdUnavailableByChannelCutoff: (_peerId: PeerId, value: number) => value === oldMid
      });

      expect(manager.resetPeerTranslationsByChannelCutoff(peerId)).toEqual(new Set([oldMid]));

      expect(richMessages.get(peerId).has(oldMid)).toBe(false);
      expect(richMessages.get(peerId).get(newMid)).toBe(newRichMessage);
      expect(richMessages.get(peerId).has(legacyMid)).toBe(true);
      expect(richMessages.get(peerId).has(localMid)).toBe(true);
      expect(richMessages.get(peerId).has(ephemeralMid)).toBe(true);
      expect((manager as any).summaries[peerId][oldMid]).toBeUndefined();
      expect((manager as any).summaries[peerId][newMid]).toEqual({es: translated('new summary')});
      expect((manager as any).summaries[peerId][legacyMid]).toEqual({es: translated('legacy summary')});
      expect((manager as any).summaries[peerId][localMid]).toEqual({es: translated('local summary')});
      expect((manager as any).summaries[peerId][ephemeralMid]).toEqual({es: translated('ephemeral summary')});
      expect(deleteContext).toHaveBeenCalledWith(oldReference, {
        type: 'messageRichTranslation',
        peerId,
        messageId: oldMid,
        lang: 'es'
      });
      expect(deleteContext).not.toHaveBeenCalledWith(newReference, expect.anything());
    });

    test('an obsolete rich translation cannot replace the post-edit request', async() => {
      const {manager, invokeApi} = makeTranslationsHarness();
      const firstResult = deferred<MessagesTranslatedRichMessage>();
      const secondResult = deferred<MessagesTranslatedRichMessage>();
      const obsolete = makeRichMessage('obsolete');
      const current = makeRichMessage('current');
      invokeApi.mockReturnValueOnce(firstResult.promise).mockReturnValueOnce(secondResult.promise);

      const first = manager.translateRichMessage({peerId, mid, lang: 'fr'});
      const firstOutcome = promiseOutcome(first);
      await runNextTranslationBatch();
      manager.resetMessageTranslations(peerId, mid);
      const second = manager.translateRichMessage({peerId, mid, lang: 'fr'});
      await expect(firstOutcome).resolves.toBe('rejected');

      firstResult.resolve(richTranslationResult(obsolete));
      await Promise.resolve();
      expect(manager.translateRichMessage({peerId, mid, lang: 'fr', onlyCache: true})).toBe(second);

      await runNextTranslationBatch();
      secondResult.resolve(richTranslationResult(current));
      await expect(second).resolves.toEqual(current);
      expect(manager.translateRichMessage({peerId, mid, lang: 'fr', onlyCache: true})).toBe(current);
    });

    test('reset before the rich batch timer settles the old deferred and sends only its replacement', async() => {
      const {manager, invokeApi} = makeTranslationsHarness();
      const result = deferred<MessagesTranslatedRichMessage>();
      const current = makeRichMessage('corrente');
      invokeApi.mockReturnValueOnce(result.promise);

      const first = manager.translateRichMessage({peerId, mid, lang: 'pt'});
      const firstOutcome = promiseOutcome(first);
      manager.resetMessageTranslations(peerId, mid);
      const second = manager.translateRichMessage({peerId, mid, lang: 'pt'});

      expect(second).not.toBe(first);
      await expect(firstOutcome).resolves.toBe('rejected');
      await runNextTranslationBatch();
      expect(invokeApi).toHaveBeenCalledOnce();
      expect(invokeApi).toHaveBeenCalledWith('messages.translateRichMessage', {
        peer: {_: 'inputPeerEmpty'},
        id: [mid],
        to_lang: 'pt'
      });

      result.resolve(richTranslationResult(current));
      await expect(second).resolves.toEqual(current);
    });

    test('a rejected rich translation is evicted and can be retried', async() => {
      const {manager, invokeApi} = makeTranslationsHarness();
      const firstResult = deferred<MessagesTranslatedRichMessage>();
      const secondResult = deferred<MessagesTranslatedRichMessage>();
      invokeApi.mockReturnValueOnce(firstResult.promise).mockReturnValueOnce(secondResult.promise);

      const first = manager.translateRichMessage({peerId, mid, lang: 'de'});
      await runNextTranslationBatch();
      const error = new Error('temporary rich translation failure');
      firstResult.reject(error);
      await expect(first).rejects.toBe(error);

      const second = manager.translateRichMessage({peerId, mid, lang: 'de'});
      expect(second).not.toBe(first);
      await runNextTranslationBatch();
      expect(invokeApi).toHaveBeenCalledTimes(2);

      const current = makeRichMessage('aktuell');
      secondResult.resolve(richTranslationResult(current));
      await expect(second).resolves.toEqual(current);
    });

    test('clearing summaries while one is in flight does not restore the stale entry', async() => {
      const {manager, invokeApi} = makeTranslationsHarness();
      const result = deferred<TextWithEntities>();
      invokeApi.mockReturnValueOnce(result.promise);

      const promise = manager.summarizeText({peerId, mid, lang: 'en'});
      manager.clearSummaries(peerId);
      result.resolve(translated('summary'));

      await expect(promise).resolves.toEqual(translated('summary'));
      await Promise.resolve();
      expect((manager as any).summaries[peerId]).toBeUndefined();
    });

    test('a rejected summary is evicted and can be retried', async() => {
      const {manager, invokeApi} = makeTranslationsHarness();
      const firstResult = deferred<TextWithEntities>();
      const secondResult = deferred<TextWithEntities>();
      invokeApi.mockReturnValueOnce(firstResult.promise).mockReturnValueOnce(secondResult.promise);

      const first = manager.summarizeText({peerId, mid, lang: 'en'});
      const error = new Error('temporary summary failure');
      firstResult.reject(error);

      await expect(first).rejects.toBe(error);
      await Promise.resolve();
      expect((manager as any).summaries[peerId]).toBeUndefined();

      const second = manager.summarizeText({peerId, mid, lang: 'en'});
      expect(second).not.toBe(first);
      expect(invokeApi).toHaveBeenCalledTimes(2);

      secondResult.resolve(translated('retry summary'));
      await expect(second).resolves.toEqual(translated('retry summary'));
    });

    test('an obsolete rejected summary cannot evict its replacement', async() => {
      const {manager, invokeApi} = makeTranslationsHarness();
      const firstResult = deferred<TextWithEntities>();
      const secondResult = deferred<TextWithEntities>();
      invokeApi.mockReturnValueOnce(firstResult.promise).mockReturnValueOnce(secondResult.promise);

      const first = manager.summarizeText({peerId, mid, lang: 'en'});
      manager.clearSummaries(peerId, mid);
      const second = manager.summarizeText({peerId, mid, lang: 'en'});
      const error = new Error('obsolete summary failure');
      firstResult.reject(error);

      await expect(first).rejects.toBe(error);
      await Promise.resolve();
      expect(manager.summarizeText({peerId, mid, lang: 'en'})).toBe(second);

      secondResult.resolve(translated('current summary'));
      await expect(second).resolves.toEqual(translated('current summary'));
    });
  });

  describe('AppMessagesManager rich message cache', () => {
    test('channel cutoff rich entry guards stay uncached and lowering can fetch again', async() => {
      const {manager, invokeApi} = makeRichMessagesHarness();
      let unavailable = true;
      manager.isMessageIdUnavailableByChannelCutoff = () => unavailable;

      await expect(manager.getRichMessage(peerId, mid)).resolves.toBeUndefined();
      await expect(manager.refreshRichMessage(peerId, mid)).resolves.toBeUndefined();
      expect(invokeApi).not.toHaveBeenCalled();
      expect((manager as any).richMessages.size).toBe(0);
      expect((manager as any).richMessageRefreshes.size).toBe(0);

      unavailable = false;
      const richMessage = makeRichMessage('available after lowering');
      invokeApi.mockResolvedValueOnce({
        _: 'messages.messages',
        messages: [makeMessage(richMessage)],
        topics: [],
        chats: [],
        users: []
      } as MessagesMessages);

      await expect(manager.refreshRichMessage(peerId, mid)).resolves.toBe(richMessage);
      expect(invokeApi).toHaveBeenCalledTimes(1);
    });

    test('rich media with a reused id releases the old reference when its bytes changed', () => {
      const {manager, deleteContext} = makeRichProcessingHarness();
      const oldReference = [1, 2, 3];
      const oldRichMessage = makeRichMessage('old');
      oldRichMessage.photos = [{
        _: 'photo',
        id: 'same-photo',
        file_reference: oldReference,
        sizes: []
      } as any];
      const newRichMessage = makeRichMessage('new');
      newRichMessage.photos = [{
        _: 'photo',
        id: 'same-photo',
        file_reference: [4, 5, 6],
        sizes: []
      } as any];
      const context = {type: 'message', peerId, messageId: mid} as const;

      manager.releaseRichMessage(oldRichMessage, context, false, newRichMessage);

      expect(deleteContext).toHaveBeenCalledWith(oldReference, context);
    });

    test('rich media with a reused id preserves the canonical reference when the new object omits it', () => {
      const {manager, deleteContext} = makeRichProcessingHarness();
      const oldRichMessage = makeRichMessage('old');
      oldRichMessage.documents = [{
        _: 'document',
        id: 'same-document',
        file_reference: [1, 2, 3],
        attributes: []
      } as any];
      const newRichMessage = makeRichMessage('new');
      newRichMessage.documents = [{
        _: 'document',
        id: 'same-document',
        attributes: []
      } as any];

      manager.releaseRichMessage(oldRichMessage, {
        type: 'message',
        peerId,
        messageId: mid
      }, false, newRichMessage);

      expect(deleteContext).not.toHaveBeenCalled();
    });

    test('source rich media contexts are released on edit and deletion', () => {
      const {manager, deleteContext} = makeRichMessagesHarness();
      const reference = [7, 8, 9];
      const richMessage = makeRichMessage('source');
      richMessage.documents = [{
        _: 'document',
        id: 'source-document',
        file_reference: reference,
        attributes: []
      } as any];
      const oldMessage = makeMessage(richMessage);
      const editedMessage = makeMessage(undefined);
      const storage = new Map() as MessagesStorage;
      storage.peerId = peerId;
      storage.type = 'history';
      storage.key = `${peerId}_history`;

      const richMessageChanged = (manager as any).releaseEditedMessageRichMedia(oldMessage, editedMessage);
      (manager as any).handleEditedMessage(oldMessage, editedMessage, storage, richMessageChanged);
      expect(deleteContext).toHaveBeenCalledWith(reference, {
        type: 'messageRich',
        peerId,
        messageId: mid
      });

      deleteContext.mockClear();
      (manager as any).handleReleasingMessage(oldMessage, storage);
      expect(deleteContext).toHaveBeenCalledWith(reference, {
        type: 'messageRich',
        peerId,
        messageId: mid
      });
    });

    test('saving a source rich message normalizes media and nested embedded channels once', () => {
      const {manager, savePhoto, saveDoc, saveApiChat} = makeRichProcessingHarness();
      const storage = new Map() as MessagesStorage;
      storage.peerId = peerId;
      storage.type = 'history';
      storage.key = `${peerId}_history`;
      const photo = {_: 'photo', id: 'source-photo'} as any;
      const document = {_: 'document', id: 'source-document'} as any;
      const channel = {_: 'channel', id: 78, pFlags: {}, title: 'Nested source'} as any;
      const richMessage: RichMessage = {
        _: 'richMessage',
        pFlags: {},
        blocks: [{
          _: 'pageBlockCover',
          cover: {
            _: 'pageBlockCollage',
            items: [{_: 'pageBlockChannel', channel}],
            caption: {_: 'pageCaption', text: {_: 'textEmpty'}, credit: {_: 'textEmpty'}}
          }
        }],
        photos: [photo],
        documents: [document]
      };
      Object.assign(manager, {
        appPeersManager: {
          peerId: 999 as PeerId,
          getPeerId: () => peerId
        },
        appMessagesIdsManager: {generateMessageId: (id: number) => id},
        timeManager: {getServerTimeOffset: () => 0},
        setMessageUnreadByDialog: vi.fn(),
        setMessageToStorage: (target: MessagesStorage, message: Message.message) => target.set(message.mid, message)
      });
      const source = makeMessage(richMessage);
      delete source.peerId;
      delete source.mid;

      const saved = manager.saveMessage(source, {storage}) as Message.message;
      const context = {type: 'messageRich', peerId, messageId: mid};

      expect(savePhoto).toHaveBeenCalledOnce();
      expect(savePhoto).toHaveBeenCalledWith(photo, context);
      expect(saveDoc).toHaveBeenCalledOnce();
      expect(saveDoc).toHaveBeenCalledWith(document, context);
      expect(saveApiChat).toHaveBeenCalledOnce();
      expect(saveApiChat).toHaveBeenCalledWith(channel);
      expect(saved.rich_message.photos[0]).toEqual(expect.objectContaining({normalized: 'photo'}));
      expect(saved.rich_message.documents[0]).toEqual(expect.objectContaining({normalized: 'document'}));
    });

    test('a rich-only edit invalidates its cached translation', () => {
      const {manager} = makeRichMessagesHarness();
      const translations = (manager as any).appTranslationsManager;
      translations.hasTriedToTranslateMessage = () => true;

      (manager as any).handleEditedMessage(
        makeMessage(makeRichMessage('old')),
        makeMessage(makeRichMessage('edited')),
        new Map() as MessagesStorage,
        true
      );

      expect(translations.resetMessageTranslations).toHaveBeenCalledWith(peerId, mid);
    });

    test('an edit invalidates a rich translation even when the compact rich payload is unchanged', () => {
      const {manager} = makeRichMessagesHarness();
      const translations = (manager as any).appTranslationsManager;
      translations.hasTriedToTranslateMessage = () => true;
      const compactRichMessage = makeRichMessage('same compact payload');
      const oldMessage = makeMessage(compactRichMessage);
      const editedMessage = {
        ...makeMessage(compactRichMessage),
        edit_date: 2_000
      } as Message.message;

      (manager as any).handleEditedMessage(
        oldMessage,
        editedMessage,
        new Map() as MessagesStorage,
        false
      );

      expect(translations.resetMessageTranslations).toHaveBeenCalledWith(peerId, mid);
    });

    test('an edit invalidates a rich translation when only the full-rich cache identifies the source', () => {
      const {manager} = makeRichMessagesHarness();
      const translations = (manager as any).appTranslationsManager;
      translations.hasTriedToTranslateMessage = () => true;
      const oldMessage = makeMessage(undefined);
      const editedMessage = {...makeMessage(undefined), edit_date: 2_000} as Message.message;
      (manager as any).richMessages.set(`${peerId}_${mid}`, Promise.resolve(makeRichMessage('full')));

      (manager as any).handleEditedMessage(
        oldMessage,
        editedMessage,
        new Map() as MessagesStorage,
        false
      );

      expect(translations.resetMessageTranslations).toHaveBeenCalledWith(peerId, mid);
    });

    test('a full-rich refetch releases old media contexts before canonical saving mutates them', async() => {
      const {manager, invokeApi, saveApiResult, deleteContext} = makeRichMessagesHarness();
      const oldReference = [7, 8, 9];
      const oldRichMessage = makeRichMessage('old full');
      oldRichMessage.documents = [{
        _: 'document',
        id: 'removed-document',
        file_reference: oldReference,
        attributes: []
      } as any];
      const oldMessage = makeMessage(oldRichMessage);
      const incomingMessage = makeMessage(makeRichMessage('new full'));
      const result: MessagesMessages = {
        _: 'messages.messages',
        messages: [incomingMessage],
        topics: [],
        chats: [],
        users: []
      };
      manager.getMessageByPeer = vi.fn(() => oldMessage);
      invokeApi.mockResolvedValueOnce(result);

      await expect(manager.getRichMessage(peerId, mid)).resolves.toBe(incomingMessage.rich_message);

      expect(deleteContext).toHaveBeenCalledWith(oldReference, {
        type: 'messageRich',
        peerId,
        messageId: mid
      });
      expect(deleteContext.mock.invocationCallOrder[0]).toBeLessThan(saveApiResult.mock.invocationCallOrder[0]);
    });

    test('refreshing full rich content bypasses its resolved cache and owns the replacement request', async() => {
      const {manager, invokeApi, deleteContext} = makeRichMessagesHarness();
      const oldReference = [7, 7, 7];
      const oldRichMessage = makeRichMessage('old full');
      oldRichMessage.photos = [{
        _: 'photo',
        id: 'refresh-photo',
        file_reference: oldReference,
        sizes: []
      } as any];
      const oldMessage = makeMessage(oldRichMessage);
      const refreshedRichMessage = makeRichMessage('refreshed full');
      refreshedRichMessage.photos = [{
        _: 'photo',
        id: 'refresh-photo',
        file_reference: [8, 8, 8],
        sizes: []
      } as any];
      const refreshedMessage = makeMessage(refreshedRichMessage);
      const refreshResult = deferred<MessagesMessages>();
      manager.getMessageByPeer = vi.fn(() => oldMessage);
      invokeApi
      .mockResolvedValueOnce({
        _: 'messages.messages',
        messages: [oldMessage],
        topics: [],
        chats: [],
        users: []
      })
      .mockReturnValueOnce(refreshResult.promise);

      const cached = manager.getRichMessage(peerId, mid);
      await cached;
      expect(manager.getRichMessage(peerId, mid)).toBe(cached);

      const refreshed = manager.refreshRichMessage(peerId, mid);
      const concurrentRefresh = manager.refreshRichMessage(peerId, mid);
      expect(refreshed).not.toBe(cached);
      expect(concurrentRefresh).toBe(refreshed);
      expect(manager.getRichMessage(peerId, mid)).toBe(refreshed);
      refreshResult.resolve({
        _: 'messages.messages',
        messages: [refreshedMessage],
        topics: [],
        chats: [],
        users: []
      });
      await expect(refreshed).resolves.toBe(refreshedRichMessage);
      expect(invokeApi).toHaveBeenCalledTimes(2);
      expect(deleteContext).toHaveBeenCalledWith(oldReference, {
        type: 'messageRich',
        peerId,
        messageId: mid
      });
    });

    test('full-rich file references refresh through the forced rich endpoint', () => {
      const referencesStorage = new ReferencesStorage() as any;
      const refreshRichMessage = vi.fn(() => Promise.resolve(makeRichMessage('refreshed')));
      Object.assign(referencesStorage, {
        appMessagesManager: {refreshRichMessage}
      });
      const context = {type: 'messageRich', peerId, messageId: mid} as const;

      expect(referencesStorage.getRefreshPromise(context)).toBeInstanceOf(Promise);
      expect(refreshRichMessage).toHaveBeenCalledWith(peerId, mid);
    });

    test('an older successful fetch cannot save a rich message invalidated by an edit', async() => {
      const {manager, invokeApi, saveApiResult} = makeRichMessagesHarness();
      const firstResult = deferred<MessagesMessages>();
      const secondResult = deferred<MessagesMessages>();
      invokeApi.mockReturnValueOnce(firstResult.promise).mockReturnValueOnce(secondResult.promise);

      const oldRichMessage = makeRichMessage('old');
      const editedRichMessage = makeRichMessage('edited');
      const oldMessage = makeMessage(oldRichMessage);
      const editedMessage = makeMessage(editedRichMessage);
      const first = manager.getRichMessage(peerId, mid);
      (manager as any).handleEditedMessage(oldMessage, editedMessage, new Map() as MessagesStorage, true);
      const second = manager.getRichMessage(peerId, mid);
      const staleResult: MessagesMessages = {
        _: 'messages.messages',
        messages: [oldMessage],
        topics: [],
        chats: [],
        users: []
      };

      firstResult.resolve(staleResult);
      await expect(first).rejects.toMatchObject({type: 'MESSAGE_ID_INVALID'});
      expect(saveApiResult).not.toHaveBeenCalled();
      expect(manager.getRichMessage(peerId, mid)).toBe(second);

      const currentResult: MessagesMessages = {
        _: 'messages.messages',
        messages: [editedMessage],
        topics: [],
        chats: [],
        users: []
      };
      secondResult.resolve(currentResult);
      await expect(second).resolves.toEqual(editedRichMessage);
      expect(saveApiResult).toHaveBeenCalledOnce();
      expect(saveApiResult).toHaveBeenCalledWith(currentResult);
    });

    test('any compact edit invalidates an in-flight full rich revision', async() => {
      const {manager, invokeApi, saveApiResult} = makeRichMessagesHarness();
      const firstResult = deferred<MessagesMessages>();
      const secondResult = deferred<MessagesMessages>();
      invokeApi.mockReturnValueOnce(firstResult.promise).mockReturnValueOnce(secondResult.promise);
      const compactRichMessage = makeRichMessage('same compact payload');
      const oldMessage = makeMessage(compactRichMessage);
      const editedMessage = {
        ...makeMessage(compactRichMessage),
        edit_date: 2_000
      } as Message.message;

      const first = manager.getRichMessage(peerId, mid);
      (manager as any).handleEditedMessage(oldMessage, editedMessage, new Map() as MessagesStorage, false);
      const second = manager.getRichMessage(peerId, mid);
      expect(second).not.toBe(first);

      firstResult.resolve({
        _: 'messages.messages',
        messages: [oldMessage],
        topics: [],
        chats: [],
        users: []
      });
      await expect(first).rejects.toMatchObject({type: 'MESSAGE_ID_INVALID'});
      expect(saveApiResult).not.toHaveBeenCalled();

      secondResult.resolve({_: 'messages.messagesNotModified', count: 0});
      await second;
    });

    test('a delete invalidates an in-flight rich fetch even when the message is already absent locally', async() => {
      const {manager, invokeApi, saveApiResult} = makeRichMessagesHarness();
      const result = deferred<MessagesMessages>();
      invokeApi.mockReturnValueOnce(result.promise);
      const message = makeMessage(makeRichMessage('deleted'));
      const storage = new Map() as MessagesStorage;
      storage.peerId = peerId;
      storage.type = 'history';
      storage.key = `${peerId}_history`;
      Object.assign(manager, {
        getMessageFromStorage: (): undefined => undefined,
        fixDialogUnreadMentionsIfNoMessage: vi.fn()
      });

      const promise = manager.getRichMessage(peerId, mid);
      (manager as any).handleDeletedMessages(peerId, storage, [mid]);
      result.resolve({
        _: 'messages.messages',
        messages: [message],
        topics: [],
        chats: [],
        users: []
      });

      await expect(promise).rejects.toMatchObject({type: 'MESSAGE_ID_INVALID'});
      expect(saveApiResult).not.toHaveBeenCalled();
    });

    test('flushing a peer releases rich media and makes an in-flight full-rich response stale', async() => {
      const {manager, invokeApi, saveApiResult, deleteContext} = makeRichMessagesHarness();
      const result = deferred<MessagesMessages>();
      const reference = [4, 2];
      const oldRichMessage = makeRichMessage('old');
      oldRichMessage.photos = [{
        _: 'photo',
        id: 'old-photo',
        file_reference: reference,
        sizes: []
      } as any];
      const oldMessage = makeMessage(oldRichMessage);
      const storage = new Map([[mid, oldMessage]]) as MessagesStorage;
      storage.peerId = peerId;
      storage.type = 'history';
      storage.key = `${peerId}_history`;
      const resetPeerTranslations = vi.fn();
      const clearStreamedMessageDraftsForPeer = vi.spyOn(
        manager as any,
        'clearStreamedMessageDraftsForPeer'
      );
      invokeApi.mockReturnValueOnce(result.promise);
      Object.assign(manager.appPeersManager, {isChannel: () => true});
      Object.assign(manager, {
        appTranslationsManager: {resetPeerTranslations},
        ephemeralMidsByPeerId: new Map(),
        ephemeralCallbackTopicHints: new Map(),
        pendingEphemeralMessages: new Map(),
        historiesStorage: {},
        searchesStorage: {},
        threadsStorage: {},
        pendingAfterMsgs: {},
        pendingTopMsgs: {},
        references: {},
        needSingleMessages: new Map(),
        messagesStorageByPeerId: {[peerId]: storage},
        scheduledMessagesStorage: {},
        schedulePendingEphemeralMessagesTimeout: vi.fn(),
        iterateHistoryStorages: vi.fn(),
        flushPinnedMessagesCache: vi.fn(),
        dialogsStorage: {flushForumTopicsCache: vi.fn()}
      });

      const promise = manager.getRichMessage(peerId, mid);
      manager.flushStoragesByPeerId(peerId);
      result.resolve({
        _: 'messages.messages',
        messages: [makeMessage(makeRichMessage('late'))],
        topics: [],
        chats: [],
        users: []
      });

      await expect(promise).rejects.toMatchObject({type: 'MESSAGE_ID_INVALID'});
      expect(saveApiResult).not.toHaveBeenCalled();
      expect(resetPeerTranslations).toHaveBeenCalledWith(peerId);
      expect(clearStreamedMessageDraftsForPeer).toHaveBeenCalledWith(peerId);
      expect(deleteContext).toHaveBeenCalledWith(reference, {
        type: 'messageRich',
        peerId,
        messageId: mid
      });
      expect(storage.size).toBe(0);
    });

    test('channel history cutoff purges every cache without touching newer or local messages', async() => {
      const {manager, deleteContext} = makeRichMessagesHarness();
      const channelId = 50 as ChatId;
      const channelPeerId = channelId.toPeerId(true);
      const otherPeerId = (+channelId + 1).toPeerId(true);
      const serverMid = 41;
      const olderMid = MESSAGE_ID_OFFSET + serverMid - 1;
      const localMid = MESSAGE_ID_OFFSET + serverMid;
      const newerMid = localMid + 1;
      const tempMid = olderMid + 0.0001;
      const staleMainMid = olderMid - 1;
      const threadOnlyMid = olderMid - 2;
      const searchOnlyMid = olderMid - 3;
      const globalSearchOnlyMid = olderMid - 4;
      const pendingSingleMid = olderMid - 5;
      const richOnlyMid = olderMid - 6;
      const translationOnlyMid = olderMid - 7;
      const metadataOnlyMainMid = olderMid - 8;
      const metadataOnlyTopicMid = olderMid - 9;
      const metadataOnlyMonoforumMid = olderMid - 10;
      const metadataOnlyMonoforumPeerId = 702 as PeerId;
      const legacyMigratedMid = serverMid - 10;
      const firstThreadId = MESSAGE_ID_OFFSET + 100;
      const secondThreadId = MESSAGE_ID_OFFSET + 200;
      const metadataOnlyThreadId = MESSAGE_ID_OFFSET + 300;
      const temporaryThreadId = firstThreadId + 0.0001;
      const reference = [9, 4, 1];
      const richOnlyReference = [9, 4, 2];
      const richMessage = makeRichMessage('search-only');
      richMessage.photos = [{
        _: 'photo',
        id: 'search-only-photo',
        file_reference: reference,
        sizes: []
      } as any];
      const richOnlyMessage = makeRichMessage('rich cache only');
      richOnlyMessage.photos = [{
        _: 'photo',
        id: 'rich-cache-only-photo',
        file_reference: richOnlyReference,
        sizes: []
      } as any];
      const cachedMessage = {
        ...makeMessage(richMessage),
        id: serverMid,
        mid: localMid,
        peer_id: {_: 'peerChannel', channel_id: channelId},
        peerId: channelPeerId,
        fromId: channelPeerId,
        pFlags: {out: true},
        reactions: {
          _: 'messageReactions',
          pFlags: {},
          results: [],
          recent_reactions: [{
            _: 'messagePeerReaction',
            pFlags: {unread: true},
            peer_id: {_: 'peerChannel', channel_id: channelId},
            date: 1
          }]
        },
        reply_to: {
          _: 'messageReplyHeader',
          pFlags: {forum_topic: true},
          reply_to_top_id: secondThreadId,
          reply_to_msg_id: secondThreadId
        }
      } as Message.message;
      const olderMessage = {
        ...makeMessage(undefined),
        id: serverMid - 1,
        mid: olderMid,
        peer_id: {_: 'peerChannel', channel_id: channelId},
        peerId: channelPeerId,
        fromId: channelPeerId,
        pFlags: {unread: true, mentioned: true, media_unread: true},
        reply_to: {
          _: 'messageReplyHeader',
          pFlags: {forum_topic: true},
          reply_to_top_id: firstThreadId,
          reply_to_msg_id: firstThreadId
        }
      } as Message.message;
      const newerMessage = {
        ...makeMessage(undefined),
        id: serverMid + 1,
        mid: newerMid,
        peer_id: {_: 'peerChannel', channel_id: channelId},
        peerId: channelPeerId,
        fromId: channelPeerId
      } as Message.message;
      const tempMessage = {
        ...makeMessage(makeRichMessage('still streaming')),
        id: tempMid,
        mid: tempMid,
        peer_id: {_: 'peerChannel', channel_id: channelId},
        peerId: channelPeerId,
        fromId: channelPeerId,
        pFlags: {currentlyTyping: true}
      } as Message.message;
      const storage = new Map([
        [olderMid, olderMessage],
        [localMid, cachedMessage],
        [newerMid, newerMessage],
        [tempMid, tempMessage]
      ]) as MessagesStorage;
      storage.peerId = channelPeerId;
      storage.type = 'history';
      storage.key = `${channelPeerId}_history`;

      const mainHistoryValues = slicedArray([newerMid, tempMid, localMid, olderMid, staleMainMid, legacyMigratedMid]);
      const mainHistoryDelete = vi.spyOn(mainHistoryValues, 'delete');
      const mainHistory = {
        type: 'history',
        key: `history_${channelPeerId}`,
        history: mainHistoryValues,
        count: 4
      } as any;
      const firstThreadValues = slicedArray([olderMid, threadOnlyMid]);
      const firstThreadHistory = {
        type: 'replies',
        key: `replies_${channelPeerId}_${firstThreadId}`,
        history: firstThreadValues,
        count: 3
      } as any;
      const secondThreadValues = slicedArray([localMid]);
      const secondThreadHistory = {
        type: 'replies',
        key: `replies_${channelPeerId}_${secondThreadId}`,
        history: secondThreadValues,
        count: 4
      } as any;
      const threadStorages: Record<number, any> = {
        [firstThreadId]: firstThreadHistory
      };
      const searchHistoryValues = slicedArray([localMid, searchOnlyMid]);
      const searchHistoryDelete = vi.spyOn(searchHistoryValues, 'delete');
      const searchStorage = {
        type: 'search',
        key: `search_${channelPeerId}_inputMessagesFilterPinned_0`,
        history: searchHistoryValues,
        count: 2,
        filterMessage: vi.fn()
      } as any;
      const globalSearchValues = slicedArray<`${PeerId}_${number}`>([
        `${channelPeerId}_${globalSearchOnlyMid}`,
        `${channelPeerId}_${newerMid}`,
        `${otherPeerId}_${olderMid}`
      ]);
      const globalSearchStorage = {
        type: 'search',
        key: 'search_inputMessagesFilterEmpty',
        history: slicedArray<number>([]),
        searchHistory: globalSearchValues,
        count: 3
      } as any;
      const parentDialog = {
        _: 'dialog',
        pFlags: {},
        peer: {_: 'peerChannel', channel_id: channelId},
        peerId: channelPeerId,
        top_message: metadataOnlyMainMid,
        unread_count: 10,
        unread_mentions_count: 4,
        unread_reactions_count: 4
      } as any;
      const firstTopic = {
        _: 'forumTopic',
        pFlags: {},
        id: firstThreadId,
        peerId: channelPeerId,
        top_message: threadOnlyMid,
        unread_count: 5,
        unread_mentions_count: 2,
        unread_reactions_count: 2
      } as any;
      const secondTopic = {
        _: 'forumTopic',
        pFlags: {},
        id: secondThreadId,
        peerId: channelPeerId,
        top_message: searchOnlyMid,
        unread_count: 6,
        unread_mentions_count: 2,
        unread_reactions_count: 2
      } as any;
      const metadataOnlyTopic = {
        _: 'forumTopic',
        pFlags: {},
        id: metadataOnlyThreadId,
        peerId: channelPeerId,
        top_message: metadataOnlyTopicMid,
        unread_count: 0,
        unread_mentions_count: 0,
        unread_reactions_count: 0
      } as any;
      const temporaryTopic = {
        _: 'forumTopic',
        pFlags: {},
        id: temporaryThreadId,
        peerId: channelPeerId,
        top_message: tempMid,
        unread_count: 0,
        unread_mentions_count: 0,
        unread_reactions_count: 0
      } as any;
      const topics = new Map([
        [firstThreadId, firstTopic],
        [secondThreadId, secondTopic],
        [metadataOnlyThreadId, metadataOnlyTopic]
      ]);
      const temporaryTopics = new Map([[temporaryThreadId, temporaryTopic]]);
      const monoforumDialogs = new Map([[metadataOnlyMonoforumPeerId, {
        _: 'monoForumDialog',
        pFlags: {},
        peerId: metadataOnlyMonoforumPeerId,
        parentPeerId: channelPeerId,
        top_message: metadataOnlyMonoforumMid
      }]]);
      const cachedFull = {
        _: 'channelFull',
        pFlags: {},
        id: channelId,
        about: '',
        available_min_id: serverMid - 1,
        pinned_msg_id: localMid
      } as any;
      const chatFullSnapshots: Array<{oldMessagePresent: boolean, cutoffApplied: boolean}> = [];
      const dispatchEvent = vi.fn((event: string, _payload?: any) => {
        if(event !== 'chat_full_update') return;
        chatFullSnapshots.push({
          oldMessagePresent: storage.has(localMid),
          cutoffApplied: manager.isMessageIdUnavailableByChannelCutoff(channelPeerId, localMid)
        });
      });
      const reloadConversation = vi.fn();
      const getForumTopicById = vi.fn(() => Promise.resolve(undefined));
      const resetMessageTranslations = (manager as any).appTranslationsManager.resetMessageTranslations;
      const resetPeerTranslationsByChannelCutoff = vi.fn(() => new Set([translationOnlyMid]));
      const pendingSingleResolve = vi.fn();
      const updateMonoforumDialogsByPeerId = vi.fn();
      Object.assign(manager.appPeersManager, {
        isBotforum: () => false,
        isChannel: () => true
      });
      Object.assign(manager.appChatsManager, {isForum: () => true});
      Object.assign(manager, {
        appMessagesIdsManager: {
          generateMessageId: (id: number) => id >= MESSAGE_ID_OFFSET ? id : MESSAGE_ID_OFFSET + id
        },
        appTranslationsManager: {
          ...(manager as any).appTranslationsManager,
          resetPeerTranslationsByChannelCutoff
        },
        appProfileManager: {getCachedFullChat: () => cachedFull},
        messagesStorageByPeerId: {[channelPeerId]: storage},
        historiesStorage: {[channelPeerId]: mainHistory},
        threadsStorage: {[channelPeerId]: threadStorages},
        searchesStorage: {
          [channelPeerId]: {0: {inputMessagesFilterPinned: searchStorage}},
          global: globalSearchStorage
        },
        pinnedMessages: {
          [channelPeerId]: {maxId: olderMid, count: 1},
          [`${channelPeerId}_${firstThreadId}`]: {maxId: newerMid, count: 2}
        },
        needSingleMessages: new Map([
          [channelPeerId, new Map([[pendingSingleMid, {resolve: pendingSingleResolve}]])]
        ]),
        richMessages: new Map([[`${channelPeerId}_${richOnlyMid}`, Promise.resolve(richOnlyMessage)]]),
        richMessageRefreshes: new Map(),
        groupedMessagesStorage: {},
        references: {
          [`${channelPeerId}_${localMid}`]: {searchStorages: new Set([searchStorage])}
        },
        rootScope: {dispatchEvent},
        dialogsStorage: {
          getAnyDialog: (_peerId: PeerId, threadId: number) => topics.get(threadId),
          getForumTopicsCacheIfExists: () => ({topics, temporaryTopics}),
          getForumTopicById,
          prepareDialogUnreadCountModifying: () => vi.fn(),
          processDialogForFilters: vi.fn(),
          setDialogToState: vi.fn()
        },
        monoforumDialogsStorage: {
          getDialogByParent: (): undefined => undefined,
          getDialogsByParentIfExists: () => monoforumDialogs,
          updateDialogsByPeerId: updateMonoforumDialogsByPeerId
        },
        getDialogOnly: () => parentDialog,
        reloadConversation,
        getHistoryStorage: (_peerId: PeerId, threadId?: number) => (
          threadId ? threadStorages[threadId] : mainHistory
        ),
        getHistoryMessagesStorage: () => storage,
        getMessageByPeer: (_peerId: PeerId, mid: number) => storage.get(mid),
        deleteMessageFromStorage: (target: MessagesStorage, mid: number) => target.delete(mid),
        clearSearchCountersCache: vi.fn(),
        modifyCachedMentions: vi.fn(),
        updateMessageRepliesIfNeeded: vi.fn()
      });

      const directlyCachedMids = new Set<number>([
        ...storage.keys(),
        ...mainHistoryValues.first,
        ...firstThreadValues.first,
        ...secondThreadValues.first,
        ...searchHistoryValues.first,
        ...Array.from(globalSearchValues.first, (key) => +key.slice(key.lastIndexOf('_') + 1)),
        olderMid,
        newerMid,
        pendingSingleMid,
        richOnlyMid,
        translationOnlyMid
      ]);
      expect(directlyCachedMids.has(metadataOnlyMainMid)).toBe(false);
      expect(directlyCachedMids.has(metadataOnlyTopicMid)).toBe(false);
      expect(directlyCachedMids.has(metadataOnlyMonoforumMid)).toBe(false);

      (manager as any).onUpdateChannelAvailableMessages({
        _: 'updateChannelAvailableMessages',
        channel_id: channelId,
        available_min_id: serverMid
      });
      await Promise.resolve();

      expect(storage.has(olderMid)).toBe(false);
      expect(storage.has(localMid)).toBe(false);
      expect(storage.get(newerMid)).toBe(newerMessage);
      expect(storage.get(tempMid)).toBe(tempMessage);
      expect(mainHistoryDelete).toHaveBeenCalledWith(olderMid);
      expect(mainHistoryDelete).toHaveBeenCalledWith(localMid);
      expect(mainHistoryDelete).toHaveBeenCalledWith(staleMainMid);
      expect(mainHistoryDelete).not.toHaveBeenCalledWith(newerMid);
      expect(mainHistoryDelete).not.toHaveBeenCalledWith(tempMid);
      expect(mainHistoryDelete).not.toHaveBeenCalledWith(legacyMigratedMid);
      expect(mainHistory.count).toBeNull();
      expect(firstThreadHistory.count).toBeNull();
      expect(secondThreadHistory.count).toBe(4);
      expect(searchHistoryDelete).toHaveBeenCalledWith(localMid);
      expect(searchHistoryDelete).toHaveBeenCalledWith(searchOnlyMid);
      expect(searchStorage.count).toBeNull();
      expect(Array.from(globalSearchValues.first)).toEqual([
        `${channelPeerId}_${newerMid}`,
        `${otherPeerId}_${olderMid}`
      ]);
      expect(globalSearchStorage.count).toBeNull();
      expect((manager as any).pinnedMessages).toEqual({});
      expect(cachedFull.available_min_id).toBe(serverMid);
      expect(cachedFull.pinned_msg_id).toBeUndefined();
      expect(chatFullSnapshots).toEqual([{oldMessagePresent: false, cutoffApplied: true}]);
      expect(pendingSingleResolve).toHaveBeenCalledWith(undefined);
      expect((manager as any).richMessages.has(`${channelPeerId}_${richOnlyMid}`)).toBe(false);
      expect(resetMessageTranslations).toHaveBeenCalledWith(channelPeerId, olderMid);
      expect(resetMessageTranslations).toHaveBeenCalledWith(channelPeerId, localMid);
      expect(resetMessageTranslations).not.toHaveBeenCalledWith(channelPeerId, newerMid);
      expect(resetMessageTranslations).toHaveBeenCalledTimes(2);
      expect(resetPeerTranslationsByChannelCutoff).toHaveBeenCalledWith(channelPeerId);
      expect(deleteContext).toHaveBeenCalledTimes(2);
      expect(deleteContext).toHaveBeenCalledWith(reference, {
        type: 'messageRich',
        peerId: channelPeerId,
        messageId: localMid
      });
      expect(deleteContext).toHaveBeenCalledWith(richOnlyReference, {
        type: 'messageRich',
        peerId: channelPeerId,
        messageId: richOnlyMid
      });
      expect(parentDialog).toMatchObject({unread_count: 9, unread_mentions_count: 3, unread_reactions_count: 3});
      expect(firstTopic).toMatchObject({unread_count: 4, unread_mentions_count: 1, unread_reactions_count: 2});
      expect(secondTopic).toMatchObject({unread_count: 6, unread_mentions_count: 2, unread_reactions_count: 1});
      expect(reloadConversation).toHaveBeenCalledWith(channelPeerId, true);
      expect(getForumTopicById).toHaveBeenCalledWith(channelPeerId, firstThreadId);
      expect(getForumTopicById).toHaveBeenCalledWith(channelPeerId, secondThreadId);
      expect(getForumTopicById).toHaveBeenCalledWith(channelPeerId, metadataOnlyThreadId);
      expect(getForumTopicById).not.toHaveBeenCalledWith(channelPeerId, temporaryThreadId);
      expect(updateMonoforumDialogsByPeerId).toHaveBeenCalledWith({
        parentPeerId: channelPeerId,
        ids: [metadataOnlyMonoforumPeerId]
      });
      const historyDeleteEvents = dispatchEvent.mock.calls.filter(([event]) => event === 'history_delete');
      expect(historyDeleteEvents).toHaveLength(1);
      const deleted = historyDeleteEvents[0][1].msgs as Set<number>;
      expect(deleted).toEqual(expect.objectContaining(new Set([
        olderMid,
        localMid,
        staleMainMid,
        threadOnlyMid,
        searchOnlyMid,
        globalSearchOnlyMid,
        pendingSingleMid,
        richOnlyMid,
        translationOnlyMid,
        metadataOnlyMainMid,
        metadataOnlyTopicMid,
        metadataOnlyMonoforumMid
      ])));

      manager.applyChannelAvailableMinId(channelId, serverMid);
      manager.applyChannelAvailableMinId(channelId, serverMid - 1);
      expect(dispatchEvent.mock.calls.filter(([event]) => event === 'history_delete')).toHaveLength(1);
      expect(resetPeerTranslationsByChannelCutoff).toHaveBeenCalledTimes(1);
      expect((manager as any).deletedMessages.size).toBe(0);
    });

    test('authoritative lowering reopens cached ranges in place without reviving true deletions', () => {
      const manager = new AppMessagesManager() as any;
      const channelId = 54 as ChatId;
      const channelPeerId = channelId.toPeerId(true);
      const otherPeerId = 900 as PeerId;
      const cutoff = MESSAGE_ID_OFFSET + 20;
      const reopenedMid = MESSAGE_ID_OFFSET + 10;
      const trueDeletedMid = MESSAGE_ID_OFFSET + 11;
      const currentMid = MESSAGE_ID_OFFSET + 21;
      const mainValues = slicedArray([currentMid]);
      const threadValues = slicedArray([currentMid]);
      const peerSearchValues = slicedArray([currentMid]);
      const globalValues = slicedArray<`${PeerId}_${number}`>([
        `${channelPeerId}_${currentMid}`,
        `${otherPeerId}_${currentMid}`
      ]);
      const unreadValues = slicedArray([currentMid]);
      for(const values of [mainValues, threadValues, peerSearchValues, globalValues, unreadValues]) {
        values.first.setEnd(1);
      }
      const mainStorage = {
        type: 'history', key: `history_${channelPeerId}`, history: mainValues,
        count: 4, wasFetched: true
      } as any;
      const threadStorage = {
        type: 'replies', key: `replies_${channelPeerId}_${currentMid}`, history: threadValues,
        count: 3, wasFetched: true
      } as any;
      const peerSearchStorage = {
        type: 'search', key: `search_${channelPeerId}_inputMessagesFilterEmpty_0`, history: peerSearchValues,
        count: 2, wasFetched: true, nextRate: 7
      } as any;
      const globalStorage = {
        type: 'search', key: 'search_inputMessagesFilterEmpty', history: slicedArray<number>([]),
        searchHistory: globalValues, count: 2, wasFetched: true, nextRate: 8
      } as any;
      const makeReply = (id: number, replyMid: number) => ({
        _: 'message',
        id,
        mid: id,
        peer_id: {_: 'peerUser', user_id: otherPeerId as UserId},
        peerId: otherPeerId,
        pFlags: {},
        date: 1,
        message: 'reply',
        reply_to_mid: replyMid,
        reply_to: {
          _: 'messageReplyHeader',
          pFlags: {},
          reply_to_peer_id: {_: 'peerChannel', channel_id: channelId},
          reply_to_msg_id: replyMid,
          reply_to_msg_deleted: true
        }
      }) as Message.message;
      const revocableReply = makeReply(1, reopenedMid);
      const trueDeletedReply = makeReply(2, trueDeletedMid);
      const replyStorage = new Map([
        [revocableReply.mid, revocableReply],
        [trueDeletedReply.mid, trueDeletedReply]
      ]) as MessagesStorage;
      replyStorage.peerId = otherPeerId;
      replyStorage.type = 'history';
      replyStorage.key = `${otherPeerId}_history`;
      const reloadConversation = vi.fn(() => Promise.resolve(undefined));
      const clearCache = vi.fn();
      const dispatchEvent = vi.fn();
      Object.assign(manager, {
        appMessagesIdsManager: {
          generateMessageId: (id: number) => id >= MESSAGE_ID_OFFSET ? id : MESSAGE_ID_OFFSET + id
        },
        appPeersManager: {
          getPeerId: (peer: any) => peer.channel_id.toPeerId(true)
        },
        apiManager: {clearCache},
        rootScope: {dispatchEvent},
        historiesStorage: {[channelPeerId]: mainStorage},
        threadsStorage: {[channelPeerId]: {[currentMid]: threadStorage}},
        searchesStorage: {
          [channelPeerId]: {0: {inputMessagesFilterEmpty: peerSearchStorage}},
          global: globalStorage
        },
        unreadMentions: {[channelPeerId]: unreadValues},
        messagesStorageByPeerId: {[otherPeerId]: replyStorage},
        pinnedMessages: {},
        flushPinnedMessagesCache: vi.fn(),
        reloadConversation,
        dialogsStorage: {getForumTopicsCacheIfExists: (): undefined => undefined},
        monoforumDialogsStorage: {
          getDialogsByParentIfExists: (): undefined => undefined,
          updateDialogsByPeerId: vi.fn()
        }
      });
      manager.channelAvailableMinIds.set(channelPeerId, cutoff);
      manager.deletedMessages.add(`${channelPeerId}_${trueDeletedMid}`);
      const unrelatedRequestGeneration = manager.getChannelAvailableMinIdRequestGeneration(otherPeerId);
      const mainIdentity = mainStorage.history;
      const globalIdentity = globalStorage.searchHistory;

      manager.applyChannelAvailableMinId(channelId, 0, true);

      expect(manager.isMessageIdUnavailableByChannelCutoff(channelPeerId, reopenedMid)).toBe(false);
      expect(mainStorage.history).toBe(mainIdentity);
      expect(mainStorage.history.first.isEnd(1)).toBe(false);
      expect(threadStorage.history.first.isEnd(1)).toBe(false);
      expect(peerSearchStorage.history.first.isEnd(1)).toBe(false);
      for(const storage of [mainStorage, threadStorage, peerSearchStorage, globalStorage]) {
        expect(storage).toMatchObject({count: null, wasFetched: false, nextRate: undefined});
      }
      expect(globalStorage.searchHistory).toBe(globalIdentity);
      expect(globalStorage.searchHistory.first).toHaveLength(0);
      expect(unreadValues.first).toHaveLength(0);
      expect(unreadValues.first.isEnd(1)).toBe(false);
      expect(manager.deletedMessages.has(`${channelPeerId}_${trueDeletedMid}`)).toBe(true);
      expect((revocableReply.reply_to as any).reply_to_msg_deleted).toBeUndefined();
      expect((trueDeletedReply.reply_to as any).reply_to_msg_deleted).toBe(true);
      expect(reloadConversation).toHaveBeenCalledWith(channelPeerId, true);
      expect(clearCache).toHaveBeenCalledWith('messages.getSearchCounters', expect.any(Function));
      expect(manager.getChannelAvailableMinIdRequestGeneration(otherPeerId)).toBe(unrelatedRequestGeneration);
    });

    test('fresh dialog and forum-topic metadata keeps valid top markers at the cutoff', () => {
      const dialogsStorage = new DialogsStorage() as any;
      const channelId = 51 as ChatId;
      const channelPeerId = channelId.toPeerId(true);
      const generateMessageId = (id: number) => id >= MESSAGE_ID_OFFSET ? id : MESSAGE_ID_OFFSET + id;

      const saveDialog = vi.fn(() => true);
      const dispatchEvent = vi.fn();
      const saveApiResult = vi.fn();
      const getPeerId = (peer: {channel_id: ChatId}) => peer.channel_id.toPeerId(true);
      Object.assign(dialogsStorage, {
        appMessagesManager: {
          saveApiResult,
          pendingTopMsgs: {},
          getUpdateAfterReloadKey: () => 'reload-key',
          newUpdatesAfterReloadToHandle: {}
        },
        appMessagesIdsManager: {generateMessageId},
        appPeersManager: {
          getPeerId,
          getOutputPeer: () => ({_: 'peerChannel', channel_id: channelId}),
          isChannel: () => true
        },
        apiUpdatesManager: {addChannelState: vi.fn()},
        rootScope: {dispatchEvent},
        saveDialog
      });

      const cutoffMarkerDialog = {
        _: 'dialog',
        pFlags: {},
        peer: {_: 'peerChannel', channel_id: channelId},
        top_message: 10
      } as any;
      const currentDialog = {
        _: 'dialog',
        pFlags: {},
        peer: {_: 'peerChannel', channel_id: channelId},
        top_message: 11
      } as any;
      const dialogsResult = {
        _: 'messages.peerDialogs',
        dialogs: [cutoffMarkerDialog, currentDialog],
        messages: [],
        chats: [],
        users: []
      } as any;

      dialogsStorage.applyDialogs(dialogsResult);

      expect(dialogsResult.dialogs).toEqual([cutoffMarkerDialog, currentDialog]);
      expect(saveDialog).toHaveBeenCalledTimes(2);
      expect(saveDialog).toHaveBeenCalledWith({dialog: cutoffMarkerDialog});

      saveDialog.mockClear();
      const cutoffMarkerTopic = {
        _: 'forumTopic',
        pFlags: {},
        id: 100,
        top_message: 10,
        title: 'stale'
      } as any;
      const currentTopic = {
        _: 'forumTopic',
        pFlags: {},
        id: 101,
        top_message: 11,
        title: 'current'
      } as any;
      const topicsResult = {
        _: 'messages.forumTopics',
        pFlags: {},
        count: 2,
        topics: [cutoffMarkerTopic, currentTopic],
        messages: [],
        chats: [],
        users: []
      } as any;

      dialogsStorage.applyDialogs(topicsResult, channelPeerId);

      expect(topicsResult.topics.map((topic: any) => topic.top_message)).toEqual([
        10,
        11
      ]);
      expect(saveDialog).toHaveBeenCalledTimes(2);
      expect(saveDialog).toHaveBeenCalledWith({dialog: cutoffMarkerTopic});
    });

    test('monoforum list and by-id snapshots retry before saving and accept fresh metadata-only tops', async() => {
      const storage = new MonoforumDialogsStorage() as any;
      const parentChannelId = 58 as ChatId;
      const parentPeerId = parentChannelId.toPeerId(true);
      const firstChildPeerId = 700 as PeerId;
      const secondChildPeerId = 701 as PeerId;
      const {invokeApiSingleProcess, requests} = singleProcessDedupHarness();
      const saveApiResult = vi.fn();
      const dispatchEvent = vi.fn();
      let generation = 0;
      Object.assign(storage, {
        apiManager: {invokeApiSingleProcess},
        appPeersManager: {
          getInputPeerById: () => ({_: 'inputPeerEmpty'}),
          isChannel: (value: PeerId) => value === parentPeerId
        },
        appMessagesManager: {
          getMessageByPeer: (): undefined => undefined,
          getChannelAvailableMinIdGeneration: () => generation,
          saveApiResult
        },
        appMessagesIdsManager: {
          generateMessageId: (id: number) => id >= MESSAGE_ID_OFFSET ? id : MESSAGE_ID_OFFSET + id
        },
        rootScope: {dispatchEvent}
      });
      const makeDialog = (childPeerId: PeerId, topMessage: number) => ({
        _: 'monoForumDialog',
        pFlags: {},
        peer: {_: 'peerUser', user_id: childPeerId as UserId},
        top_message: topMessage,
        read_inbox_max_id: 0,
        read_outbox_max_id: 0,
        unread_count: 0,
        unread_reactions_count: 0
      });
      const makeResult = (dialog: ReturnType<typeof makeDialog>): any => ({
        _: 'messages.savedDialogs',
        dialogs: [dialog],
        messages: [],
        chats: [],
        users: []
      });

      const firstList = storage.fetchAndSaveDialogs({parentPeerId, limit: 10});
      const secondList = storage.fetchAndSaveDialogs({parentPeerId, limit: 10});
      expect(requests).toHaveLength(1);
      ++generation;
      requests[0].transport.resolve(makeResult(makeDialog(firstChildPeerId, 1)));
      await Promise.resolve();
      await Promise.resolve();
      expect(requests).toHaveLength(2);
      expect(saveApiResult).not.toHaveBeenCalled();

      const freshListResult = makeResult(makeDialog(firstChildPeerId, 1));
      requests[1].transport.resolve(freshListResult);
      await Promise.all([firstList, secondList]);
      expect(saveApiResult).toHaveBeenCalledWith(freshListResult);
      expect(storage.getDialogsByParentIfExists(parentPeerId).get(firstChildPeerId).top_message)
      .toBe(MESSAGE_ID_OFFSET + 1);

      const firstById = storage.fetchAndSaveDialogsById({parentPeerId, ids: [secondChildPeerId]});
      const secondById = storage.fetchAndSaveDialogsById({parentPeerId, ids: [secondChildPeerId]});
      expect(requests).toHaveLength(3);
      ++generation;
      requests[2].transport.resolve(makeResult(makeDialog(secondChildPeerId, 2)));
      await Promise.resolve();
      await Promise.resolve();
      expect(requests).toHaveLength(4);
      expect(saveApiResult).toHaveBeenCalledTimes(1);

      const freshByIdResult = makeResult(makeDialog(secondChildPeerId, 2));
      requests[3].transport.resolve(freshByIdResult);
      await Promise.all([firstById, secondById]);
      expect(saveApiResult).toHaveBeenCalledTimes(2);
      expect(saveApiResult).toHaveBeenLastCalledWith(freshByIdResult);
      expect(storage.getDialogsByParentIfExists(parentPeerId).get(secondChildPeerId).top_message)
      .toBe(MESSAGE_ID_OFFSET + 2);
      expect(dispatchEvent).toHaveBeenCalledWith('monoforum_dialogs_update', expect.anything());
    });

    test('shared late dialog snapshots retry before any metadata mutation', async() => {
      const manager = new AppMessagesManager() as any;
      const changedPeerId = (51 as ChatId).toPeerId(true);
      const {invokeApiSingleProcess, requests} = singleProcessDedupHarness();
      const saveApiResult = vi.fn();
      Object.assign(manager, {
        apiManager: {invokeApiSingleProcess},
        middleware: {get: () => () => true},
        log: {bindPrefix: () => vi.fn()},
        dialogsStorage: {
          isVirtualFilter: () => false,
          getOffsetDate: () => 0,
          getFolderDialogs: (): any[] => []
        },
        appPeersManager: {getInputPeerById: () => ({_: 'inputPeerEmpty'})},
        saveApiResult
      });

      const options = {limit: 100, folderId: 0, filterType: 0};
      const first = manager.getTopMessages(options);
      const second = manager.getTopMessages(options);
      expect(requests).toHaveLength(1);

      manager.bumpChannelAvailableMinIdGeneration(changedPeerId);
      requests[0].transport.resolve({
        _: 'messages.dialogs',
        dialogs: [],
        messages: [],
        chats: [],
        users: []
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(requests).toHaveLength(2);
      expect(requests[1].options.overwrite).toBe(true);

      requests[1].transport.resolve({_: 'messages.dialogsNotModified', count: 0});
      await expect(Promise.all([first, second])).resolves.toEqual([null, null]);
      expect(saveApiResult).not.toHaveBeenCalled();
    });

    test('shared late forum topic snapshots retry before processing or advancing pagination', async() => {
      const manager = new AppMessagesManager() as any;
      const channelId = 52 as ChatId;
      const forumPeerId = channelId.toPeerId(true);
      const {invokeApiSingleProcess, requests} = singleProcessDedupHarness();
      const mutationOrder: string[] = [];
      const processTopics = vi.fn((_peerId: PeerId, result: any) => {
        mutationOrder.push('processTopics');
        return result;
      });
      const saveApiResult = vi.fn(() => mutationOrder.push('saveApiResult'));
      const updateForumTopicsPaginationOffsets = vi.fn(() => {
        mutationOrder.push('updateForumTopicsPaginationOffsets');
      });
      Object.assign(manager, {
        apiManager: {invokeApiSingleProcess},
        middleware: {get: () => () => true},
        log: {bindPrefix: () => vi.fn()},
        dialogsStorage: {
          isVirtualFilter: () => true,
          getOffsetDate: () => 0,
          getFolderDialogs: (): any[] => [],
          getForumTopicsPaginationOffsets: () => ({date: 0, id: 0, topic: 0}),
          processTopics,
          saveDialog: vi.fn(),
          updateForumTopicsPaginationOffsets
        },
        appPeersManager: {
          getInputPeerById: () => ({_: 'inputPeerEmpty'}),
          isChannel: () => true
        },
        rootScope: {dispatchEvent: vi.fn()},
        getMessageByPeer: vi.fn(),
        saveApiResult
      });

      const makeResult = (topicId: number): any => ({
        _: 'messages.forumTopics',
        pFlags: {},
        count: 1,
        topics: [{
          _: 'forumTopic',
          pFlags: {},
          peerId: forumPeerId,
          id: topicId,
          top_message: topicId + 1
        }],
        messages: [],
        chats: [],
        users: []
      });
      const options = {
        limit: 100,
        folderId: forumPeerId,
        filterType: FilterType.Forum
      };
      const first = manager.getTopMessages(options);
      const second = manager.getTopMessages(options);
      expect(requests).toHaveLength(1);

      manager.bumpChannelAvailableMinIdGeneration(forumPeerId);
      requests[0].transport.resolve(makeResult(100));
      await Promise.resolve();
      await Promise.resolve();
      expect(requests).toHaveLength(2);
      expect(requests[1].options.overwrite).toBe(true);
      expect(processTopics).not.toHaveBeenCalled();
      expect(saveApiResult).not.toHaveBeenCalled();
      expect(updateForumTopicsPaginationOffsets).not.toHaveBeenCalled();

      const freshResult = makeResult(200);
      requests[1].transport.resolve(freshResult);
      await Promise.all([first, second]);
      expect(processTopics).toHaveBeenCalledTimes(1);
      expect(processTopics).toHaveBeenCalledWith(forumPeerId, freshResult);
      expect(saveApiResult).toHaveBeenCalledTimes(1);
      expect(saveApiResult).toHaveBeenCalledWith(freshResult);
      expect(updateForumTopicsPaginationOffsets).toHaveBeenCalledTimes(1);
      expect(updateForumTopicsPaginationOffsets).toHaveBeenCalledWith(
        forumPeerId,
        freshResult.topics
      );
      expect(mutationOrder).toEqual([
        'processTopics',
        'saveApiResult',
        'updateForumTopicsPaginationOffsets'
      ]);
    });

    test('channelFull retries a shared stale response and applies an authoritative zero cutoff', async() => {
      const manager = new AppProfileManager() as any;
      const channelId = 53 as ChatId;
      const channelPeerId = channelId.toPeerId(true);
      const {invokeApiSingleProcess, requests} = singleProcessDedupHarness();
      let cutoffGeneration = 0;
      const applyChannelAvailableMinId = vi.fn();
      const saveFullPeerResult = vi.fn((_peerId, result) => result.full_chat);
      Object.assign(manager, {
        apiManager: {invokeApiSingleProcess},
        chatsFull: {},
        fullExpiration: {},
        appChatsManager: {
          getChat: () => ({_: 'channel', id: channelId, pFlags: {}}),
          getChannelInput: () => ({_: 'inputChannel', channel_id: channelId, access_hash: '1'})
        },
        appMessagesManager: {
          getChannelAvailableMinIdRequestGeneration: () => `0:${cutoffGeneration}`,
          applyChannelAvailableMinId: (...args: any[]) => {
            applyChannelAvailableMinId(...args);
            ++cutoffGeneration;
          }
        },
        saveFullPeerResult
      });

      const first = manager.getChannelFull(channelId);
      const second = manager.getChannelFull(channelId);
      expect(requests).toHaveLength(1);

      // A same-value update is still a source barrier: the older full must not lower it.
      ++cutoffGeneration;
      requests[0].transport.resolve({
        _: 'messages.chatFull',
        full_chat: {_: 'channelFull', pFlags: {}, id: channelId, about: '', available_min_id: 27},
        chats: [],
        users: []
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(requests).toHaveLength(2);
      expect(requests[1].options.overwrite).toBe(true);

      const currentFull = {_: 'channelFull', pFlags: {}, id: channelId, about: ''} as any;
      requests[1].transport.resolve({
        _: 'messages.chatFull',
        full_chat: currentFull,
        chats: [],
        users: []
      });

      await expect(Promise.all([first, second])).resolves.toEqual([currentFull, currentFull]);
      expect(applyChannelAvailableMinId).toHaveBeenCalledTimes(1);
      expect(applyChannelAvailableMinId).toHaveBeenCalledWith(channelId, 0, true);
      expect(saveFullPeerResult).toHaveBeenCalledTimes(1);
      expect(saveFullPeerResult).toHaveBeenCalledWith(channelPeerId, expect.objectContaining({full_chat: currentFull}));
    });

    test('late API results are filtered by the channel cutoff', async() => {
      const manager = new AppMessagesManager() as any;
      const channelId = 52 as ChatId;
      const channelPeerId = channelId.toPeerId(true);
      const cutoff = MESSAGE_ID_OFFSET + 10;
      const stale = {
        ...makeMessage(undefined),
        id: 10,
        peer_id: {_: 'peerChannel', channel_id: channelId}
      } as Message.message;
      const current = {
        ...makeMessage(undefined),
        id: 11,
        peer_id: {_: 'peerChannel', channel_id: channelId}
      } as Message.message;
      const saveMessages = vi.fn();
      const invokeApiSingleProcess = vi.fn(({processResult}) => processResult({
        _: 'messages.searchResultsCalendar',
        pFlags: {},
        count: 2,
        min_date: 0,
        min_msg_id: 0,
        offset_id_offset: 0,
        periods: [],
        messages: [stale, current],
        chats: [],
        users: []
      }));
      Object.assign(manager, {
        apiManager: {invokeApiSingleProcess},
        appPeersManager: {
          saveApiPeers: vi.fn(),
          getInputPeerById: () => ({_: 'inputPeerEmpty'})
        },
        appMessagesIdsManager: {
          generateMessageId: (id: number) => MESSAGE_ID_OFFSET + id
        },
        saveMessages
      });
      manager.channelAvailableMinIds.set(channelPeerId, cutoff);

      const result = {messages: [stale, current]};
      manager.saveApiResult(result);

      expect(result.messages).toEqual([current]);
      expect(saveMessages).toHaveBeenCalledWith(result.messages);

      saveMessages.mockClear();
      const calendarResult = await manager.getSearchResultsCalendar({
        peerId: channelPeerId,
        filter: {_: 'inputMessagesFilterEmpty'}
      });
      expect(calendarResult.messages).toEqual([current]);
      expect(saveMessages).toHaveBeenCalledWith(calendarResult.messages);
    });

    test('calendar retries a shared stale aggregate before saving periods or counts', async() => {
      const manager = new AppMessagesManager() as any;
      const channelPeerId = (55 as ChatId).toPeerId(true);
      const {invokeApiSingleProcess, requests} = singleProcessDedupHarness();
      const saveApiResult = vi.fn();
      Object.assign(manager, {
        apiManager: {invokeApiSingleProcess},
        appPeersManager: {getInputPeerById: () => ({_: 'inputPeerEmpty'})},
        saveApiResult
      });
      const options = {peerId: channelPeerId, filter: {_: 'inputMessagesFilterEmpty'}} as const;
      const first = manager.getSearchResultsCalendar(options);
      const second = manager.getSearchResultsCalendar(options);
      manager.bumpChannelAvailableMinIdGeneration(channelPeerId);
      const stale = {
        _: 'messages.searchResultsCalendar', pFlags: {}, count: 99, min_date: 1,
        min_msg_id: 1, offset_id_offset: 0, periods: [{date: 1, min_msg_id: 1, max_msg_id: 1, count: 99}],
        messages: [], chats: [], users: []
      } as any;
      requests[0].transport.resolve(stale);
      await Promise.resolve();
      await Promise.resolve();
      expect(requests).toHaveLength(2);

      const current = {
        _: 'messages.searchResultsCalendar', pFlags: {}, count: 1, min_date: 2,
        min_msg_id: 2, offset_id_offset: 0, periods: [{date: 2, min_msg_id: 2, max_msg_id: 2, count: 1}],
        messages: [], chats: [], users: []
      } as any;
      requests[1].transport.resolve(current);
      await expect(Promise.all([first, second])).resolves.toEqual([current, current]);
      expect(saveApiResult).toHaveBeenCalledTimes(1);
      expect(saveApiResult).toHaveBeenCalledWith(current);
    });

    test('discussion retries globally and returns undefined when its intended first message is filtered', async() => {
      const manager = new AppMessagesManager() as any;
      const channelPeerId = (56 as ChatId).toPeerId(true);
      const {invokeApiSingleProcess, requests} = singleProcessDedupHarness();
      const getMessageWithReplies = vi.fn();
      const saveApiResult = vi.fn((result: any) => result.messages.splice(0, 1));
      Object.assign(manager, {
        apiManager: {invokeApiSingleProcess},
        appPeersManager: {getInputPeerById: () => ({_: 'inputPeerEmpty'})},
        saveApiResult,
        getMessageWithReplies
      });
      const first = manager.getDiscussionMessage(channelPeerId, MESSAGE_ID_OFFSET + 1);
      const second = manager.getDiscussionMessage(channelPeerId, MESSAGE_ID_OFFSET + 1);
      manager.bumpChannelAvailableMinIdGeneration(channelPeerId);
      requests[0].transport.resolve({
        _: 'messages.discussionMessage', pFlags: {}, messages: [], chats: [], users: [], max_id: 0
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(requests).toHaveLength(2);

      const intended = {
        ...makeMessage(undefined), id: 1, peer_id: {_: 'peerChannel', channel_id: 56 as ChatId}
      } as Message.message;
      requests[1].transport.resolve({
        _: 'messages.discussionMessage', pFlags: {}, messages: [intended], chats: [], users: [], max_id: 1
      });
      await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
      expect(saveApiResult).toHaveBeenCalledTimes(1);
      expect(getMessageWithReplies).not.toHaveBeenCalled();
    });

    test('single-message batches ignore ABA and clear-late responses', async() => {
      vi.useFakeTimers();
      try {
        const manager = new AppMessagesManager() as any;
        const channelId = 57 as ChatId;
        const channelPeerId = channelId.toPeerId(true);
        const requestedMid = MESSAGE_ID_OFFSET + 5;
        let middlewareActive = true;
        const transports = [
          deferred<any>(),
          deferred<any>(),
          deferred<any>(),
          deferred<any>(),
          deferred<any>()
        ];
        let transportIndex = 0;
        const invokeApiSingle = vi.fn(() => transports[transportIndex++].promise);
        const saveApiResult = vi.fn();
        Object.assign(manager, {
          middleware: {
            get: () => () => middlewareActive,
            clean: () => { middlewareActive = false; }
          },
          apiManager: {invokeApiSingle},
          appPeersManager: {isChannel: () => true},
          appChatsManager: {getChannelInput: () => ({_: 'inputChannel', channel_id: channelId, access_hash: '1'})},
          appMessagesIdsManager: {
            generateMessageId: (id: number) => id >= MESSAGE_ID_OFFSET ? id : MESSAGE_ID_OFFSET + id
          },
          rootScope: {dispatchEvent: vi.fn()},
          saveApiResult,
          getMessageByPeer: (): undefined => undefined,
          waitingTranscriptions: new Map()
        });

        const aba = manager.reloadMessage(channelPeerId, requestedMid);
        await vi.runOnlyPendingTimersAsync();
        manager.channelAvailableMinIds.set(channelPeerId, requestedMid);
        manager.bumpChannelAvailableMinIdGeneration(channelPeerId);
        manager.channelAvailableMinIds.delete(channelPeerId);
        manager.bumpChannelAvailableMinIdGeneration(channelPeerId);
        const staleMessage = {
          ...makeMessage(undefined), id: 5, peer_id: {_: 'peerChannel', channel_id: channelId}
        } as Message.message;
        transports[0].resolve({
          _: 'messages.channelMessages', pFlags: {}, pts: 1, count: 1,
          offset_id_offset: 0, messages: [staleMessage], topics: [], chats: [], users: []
        });
        await Promise.resolve();
        await vi.runOnlyPendingTimersAsync();
        expect(invokeApiSingle).toHaveBeenCalledTimes(2);
        expect(saveApiResult).not.toHaveBeenCalled();

        const currentMessage = {...staleMessage, message: 'current'};
        const currentResult: any = {
          _: 'messages.channelMessages', pFlags: {}, pts: 2, count: 1,
          offset_id_offset: 0, messages: [currentMessage], topics: [], chats: [], users: []
        };
        transports[1].resolve(currentResult);
        await expect(aba).resolves.toBe(currentMessage);
        expect(saveApiResult).toHaveBeenCalledTimes(1);
        expect(saveApiResult).toHaveBeenCalledWith(currentResult);

        const missingMid = requestedMid + 1;
        const missing = manager.reloadMessage(channelPeerId, missingMid);
        await vi.runOnlyPendingTimersAsync();
        transports[2].resolve({
          _: 'messages.channelMessages', pFlags: {}, pts: 3, count: 0,
          offset_id_offset: 0,
          messages: [{_: 'messageEmpty', id: 6, peer_id: {_: 'peerChannel', channel_id: channelId}}],
          topics: [], chats: [], users: []
        });
        await expect(missing).resolves.toBeUndefined();
        expect(manager.missingMessages.has(`${channelPeerId}_${missingMid}`)).toBe(true);

        const hiddenMid = requestedMid + 2;
        const hidden = manager.reloadMessage(channelPeerId, hiddenMid);
        await vi.runOnlyPendingTimersAsync();
        manager.channelAvailableMinIds.set(channelPeerId, hiddenMid);
        manager.bumpChannelAvailableMinIdGeneration(channelPeerId);
        const hiddenRequests = [...manager.inFlightSingleMessages.get(channelPeerId)];
        const hiddenRequest = hiddenRequests.find((requests: Map<number, unknown>) => requests.has(hiddenMid));
        hiddenRequest.get(hiddenMid).resolve(undefined);
        hiddenRequest.delete(hiddenMid);
        await expect(hidden).resolves.toBeUndefined();
        transports[3].resolve({
          _: 'messages.channelMessages', pFlags: {}, pts: 4, count: 0,
          offset_id_offset: 0,
          messages: [{_: 'messageEmpty', id: 7, peer_id: {_: 'peerChannel', channel_id: channelId}}],
          topics: [], chats: [], users: []
        });
        await Promise.resolve();
        expect(manager.missingMessages.has(`${channelPeerId}_${hiddenMid}`)).toBe(false);
        manager.channelAvailableMinIds.delete(channelPeerId);
        manager.bumpChannelAvailableMinIdGeneration(channelPeerId);

        const clearMid = requestedMid + 3;
        const cleared = manager.reloadMessage(channelPeerId, clearMid);
        await vi.runOnlyPendingTimersAsync();
        manager.clear(true);
        await expect(cleared).resolves.toBeUndefined();
        transports[4].resolve({
          _: 'messages.channelMessages', pFlags: {}, pts: 5, count: 1,
          offset_id_offset: 0, messages: [{...staleMessage, id: 8}], topics: [], chats: [], users: []
        });
        await Promise.resolve();
        expect(saveApiResult).toHaveBeenCalledTimes(2); // current + the ordinary messageEmpty batch only
      } finally {
        vi.useRealTimers();
      }
    });

    test('peer flush owns its in-flight singles without disturbing another peer in the batch', async() => {
      vi.useFakeTimers();
      try {
        const manager = new AppMessagesManager() as any;
        const firstChannelId = 59 as ChatId;
        const secondChannelId = 60 as ChatId;
        const firstPeerId = firstChannelId.toPeerId(true);
        const secondPeerId = secondChannelId.toPeerId(true);
        const firstMid = MESSAGE_ID_OFFSET + 1;
        const secondMid = MESSAGE_ID_OFFSET + 2;
        const firstTransport = deferred<any>();
        const secondTransport = deferred<any>();
        const dispatchEvent = vi.fn();
        const saveApiResult = vi.fn();
        const invokeApiSingle = vi.fn((_method: string, params: any) => (
          params.channel.channel_id === firstChannelId ? firstTransport.promise : secondTransport.promise
        ));
        Object.assign(manager, {
          middleware: {get: () => () => true},
          apiManager: {invokeApiSingle},
          appPeersManager: {isChannel: () => true},
          appChatsManager: {
            getChannelInput: (channelId: ChatId) => ({_: 'inputChannel', channel_id: channelId, access_hash: '1'})
          },
          appMessagesIdsManager: {
            generateMessageId: (id: number) => id >= MESSAGE_ID_OFFSET ? id : MESSAGE_ID_OFFSET + id
          },
          appTranslationsManager: {resetPeerTranslations: vi.fn()},
          rootScope: {dispatchEvent},
          saveApiResult,
          getMessageByPeer: (): undefined => undefined,
          clearStreamedMessageDraftsForPeer: vi.fn(),
          ephemeralMidsByPeerId: new Map(),
          ephemeralCallbackTopicHints: new Map(),
          pendingEphemeralMessages: new Map(),
          schedulePendingEphemeralMessagesTimeout: vi.fn(),
          historiesStorage: {},
          searchesStorage: {},
          threadsStorage: {},
          pendingAfterMsgs: {},
          pendingTopMsgs: {},
          messagesStorageByPeerId: {},
          scheduledMessagesStorage: {},
          references: {},
          flushPinnedMessagesCache: vi.fn(),
          dialogsStorage: {flushForumTopicsCache: vi.fn()}
        });

        const first = manager.reloadMessage(firstPeerId, firstMid);
        const second = manager.reloadMessage(secondPeerId, secondMid);
        await vi.runOnlyPendingTimersAsync();
        expect(invokeApiSingle).toHaveBeenCalledTimes(2);

        manager.flushStoragesByPeerId(firstPeerId);
        await expect(first).resolves.toBeUndefined();
        expect(manager.inFlightSingleMessages.has(firstPeerId)).toBe(false);
        expect(manager.inFlightSingleMessages.has(secondPeerId)).toBe(true);

        const staleFirstMessage = {
          ...makeMessage(undefined),
          id: 1,
          peer_id: {_: 'peerChannel', channel_id: firstChannelId}
        } as Message.message;
        firstTransport.resolve({
          _: 'messages.channelMessages', pFlags: {}, pts: 1, count: 1,
          offset_id_offset: 0, messages: [staleFirstMessage], topics: [], chats: [], users: []
        });
        await Promise.resolve();
        expect(saveApiResult).not.toHaveBeenCalled();

        const currentSecondMessage = {
          ...makeMessage(undefined),
          id: 2,
          peer_id: {_: 'peerChannel', channel_id: secondChannelId}
        } as Message.message;
        const currentSecondResult = {
          _: 'messages.channelMessages', pFlags: {}, pts: 2, count: 1,
          offset_id_offset: 0, messages: [currentSecondMessage], topics: [], chats: [], users: []
        } as any;
        secondTransport.resolve(currentSecondResult);
        await expect(second).resolves.toBe(currentSecondMessage);
        expect(saveApiResult).toHaveBeenCalledOnce();
        expect(saveApiResult).toHaveBeenCalledWith(currentSecondResult);
        expect(dispatchEvent.mock.calls.filter(([event, payload]) => (
          event === 'messages_downloaded' && payload.peerId === firstPeerId
        ))).toHaveLength(0);
        expect(dispatchEvent).toHaveBeenCalledWith('messages_downloaded', {
          peerId: secondPeerId,
          mids: [secondMid]
        });
      } finally {
        vi.useRealTimers();
      }
    });

    test.each(['success', 'error'] as const)(
      'global clear keeps a replacement same-peer batch isolated from an old %s callback',
      async(oldOutcome) => {
        vi.useFakeTimers();
        try {
          const manager = new AppMessagesManager() as any;
          const channelId = 61 as ChatId;
          const channelPeerId = channelId.toPeerId(true);
          const requestedMid = MESSAGE_ID_OFFSET + 1;
          const oldTransport = deferred<any>();
          const currentTransport = deferred<any>();
          const transports = [oldTransport, currentTransport];
          let transportIndex = 0;
          let middlewareEpoch = 0;
          const dispatchEvent = vi.fn();
          const saveApiResult = vi.fn();
          const invokeApiSingle = vi.fn(() => transports[transportIndex++].promise);
          Object.assign(manager, {
            middleware: {
              get: () => {
                const capturedEpoch = middlewareEpoch;
                return () => capturedEpoch === middlewareEpoch;
              },
              clean: () => { ++middlewareEpoch; }
            },
            apiManager: {invokeApiSingle},
            appPeersManager: {isChannel: () => true},
            appChatsManager: {
              getChannelInput: () => ({_: 'inputChannel', channel_id: channelId, access_hash: '1'})
            },
            appMessagesIdsManager: {
              generateMessageId: (id: number) => id >= MESSAGE_ID_OFFSET ? id : MESSAGE_ID_OFFSET + id
            },
            rootScope: {dispatchEvent},
            saveApiResult,
            getMessageByPeer: (): undefined => undefined,
            waitingTranscriptions: new Map()
          });

          const oldRequest = manager.reloadMessage(channelPeerId, requestedMid);
          await vi.runOnlyPendingTimersAsync();
          expect(invokeApiSingle).toHaveBeenCalledTimes(1);

          manager.clear(true);
          await expect(oldRequest).resolves.toBeUndefined();

          const currentRequest = manager.reloadMessage(channelPeerId, requestedMid);
          await vi.runOnlyPendingTimersAsync();
          expect(invokeApiSingle).toHaveBeenCalledTimes(2);
          const currentInFlight = manager.inFlightSingleMessages.get(channelPeerId);
          expect(currentInFlight).toBeDefined();

          const oldMessage = {
            ...makeMessage(undefined),
            id: 1,
            peer_id: {_: 'peerChannel', channel_id: channelId},
            message: 'obsolete'
          } as Message.message;
          if(oldOutcome === 'success') {
            oldTransport.resolve({
              _: 'messages.channelMessages', pFlags: {}, pts: 1, count: 1,
              offset_id_offset: 0, messages: [oldMessage], topics: [], chats: [], users: []
            });
          } else {
            oldTransport.reject(new Error('obsolete request failed'));
          }
          await oldTransport.promise.catch((): undefined => undefined);
          await Promise.resolve();
          await Promise.resolve();

          expect(saveApiResult).not.toHaveBeenCalled();
          expect(dispatchEvent.mock.calls.filter(([event]) => event === 'messages_downloaded')).toHaveLength(0);
          expect(manager.inFlightSingleMessages.get(channelPeerId)).toBe(currentInFlight);
          expect([...currentInFlight].some((requests: Map<number, unknown>) => requests.has(requestedMid))).toBe(true);

          const currentMessage = {...oldMessage, message: 'current'};
          const currentResult = {
            _: 'messages.channelMessages', pFlags: {}, pts: 2, count: 1,
            offset_id_offset: 0, messages: [currentMessage], topics: [], chats: [], users: []
          } as any;
          currentTransport.resolve(currentResult);

          await expect(currentRequest).resolves.toBe(currentMessage);
          expect(saveApiResult).toHaveBeenCalledOnce();
          expect(saveApiResult).toHaveBeenCalledWith(currentResult);
          expect(dispatchEvent).toHaveBeenCalledWith('messages_downloaded', {
            peerId: channelPeerId,
            mids: [requestedMid]
          });
        } finally {
          vi.useRealTimers();
        }
      }
    );

    test('an edited rich message gets a new request and an older rejection cannot evict it', async() => {
      const {manager, invokeApi} = makeRichMessagesHarness();
      const firstResult = deferred<MessagesMessages>();
      const secondResult = deferred<MessagesMessages>();
      invokeApi.mockReturnValueOnce(firstResult.promise).mockReturnValueOnce(secondResult.promise);

      const oldMessage = makeMessage(makeRichMessage('old'));
      const editedMessage = makeMessage(makeRichMessage('edited'));
      const first = manager.getRichMessage(peerId, mid);
      (manager as any).handleEditedMessage(oldMessage, editedMessage, new Map() as MessagesStorage, true);
      const second = manager.getRichMessage(peerId, mid);

      expect(second).not.toBe(first);
      expect(invokeApi).toHaveBeenCalledTimes(2);

      const error = new Error('obsolete rich request failed');
      firstResult.reject(error);
      await expect(first).rejects.toBe(error);
      expect(manager.getRichMessage(peerId, mid)).toBe(second);
      expect(invokeApi).toHaveBeenCalledTimes(2);

      secondResult.resolve({_: 'messages.messagesNotModified', count: 0});
      await expect(second).resolves.toBeUndefined();
      expect(manager.getRichMessage(peerId, mid)).toBe(second);
    });
  });
});
