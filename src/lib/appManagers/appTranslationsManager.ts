import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import makeError from '@helpers/makeError';
import pause from '@helpers/schedulers/pause';
import {
  MessageEntity,
  MessagesTranslatedRichMessage,
  MessagesTranslatedText,
  MessagesTranslateText,
  RichMessage,
  TextWithEntities
} from '@layer';
import {AppManager} from '@appManagers/manager';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import type {ReferenceContext} from '@lib/storages/references';

const MAX_MESSAGES_PER_REQUEST = 20;

export default class AppTranslationsManager extends AppManager {
  private translateTextBatch: {
    [lang: string]: {
      text: Map<string, MaybeDeferredPromise<TextWithEntities>>,
      messages: Map<PeerId, Map<number, MaybeDeferredPromise<TextWithEntities>>>,
      textPromise?: Promise<any>,
      messagesPromises: Map<PeerId, Promise<any>>
    }
  } = {};
  private translateRichMessageBatch: {
    [lang: string]: {
      messages: Map<PeerId, Map<number, MaybeDeferredPromise<RichMessage>>>,
      messagesPromises: Map<PeerId, Promise<any>>
    }
  } = {};
  private triedToTranslateMessages: Map<`${PeerId}_${number}`, Set<string>> = new Map();
  private summaries: {
    [peerId: PeerId]: {
      [mid: number]: {
        [lang: string]: MaybeDeferredPromise<TextWithEntities>
      }
    }
  } = {};

  public clear = () => {
    const invalidMessageError = makeError('MESSAGE_ID_INVALID');

    for(const lang in this.translateTextBatch) {
      const batch = this.translateTextBatch[lang];
      this.clearTranslationMap(batch.text, invalidMessageError);
      for(const map of batch.messages.values()) {
        this.clearTranslationMap(map, invalidMessageError);
      }
      batch.messages.clear();
      batch.messagesPromises.clear();
      batch.textPromise = undefined;
    }

    for(const lang in this.translateRichMessageBatch) {
      const batch = this.translateRichMessageBatch[lang];
      for(const [peerId, map] of batch.messages) {
        this.clearTranslationMap(map, invalidMessageError, (richMessage, mid) => {
          this.appMessagesManager.releaseRichMessage(
            richMessage,
            this.getRichMessageTranslationReferenceContext(peerId, mid, lang)
          );
        });
      }
      batch.messages.clear();
      batch.messagesPromises.clear();
    }

    this.translateTextBatch = {};
    this.translateRichMessageBatch = {};
    this.triedToTranslateMessages.clear();
    this.summaries = {};
  };

  public hasTriedToTranslateMessage(peerId: PeerId, mid: number) {
    return this.triedToTranslateMessages.has(`${peerId}_${mid}`);
  }

  public resetMessageTranslations(peerId: PeerId, mid: number) {
    const key = `${peerId}_${mid}` as const;
    const languages = this.triedToTranslateMessages.get(key);
    if(!languages) {
      return;
    }

    for(const lang of languages) {
      const textBatch = this.translateTextBatch[lang];
      const textMessages = textBatch?.messages;
      const textMap = textMessages?.get(peerId);
      this.evictMessageTranslation(textMap, mid);
      if(textMap && !textMap.size && !textBatch?.messagesPromises.has(peerId)) {
        textMessages?.delete(peerId);
      }

      const richBatch = this.translateRichMessageBatch[lang];
      const richMessages = richBatch?.messages;
      const richMap = richMessages?.get(peerId);
      this.evictRichMessageTranslation(lang, peerId, mid);
      if(richMap && !richMap.size && !richBatch?.messagesPromises.has(peerId)) {
        richMessages?.delete(peerId);
      }
    }

    this.triedToTranslateMessages.delete(key);
  }

  public resetPeerTranslations(peerId: PeerId) {
    const keyPrefix = `${peerId}_`;
    for(const key of [...this.triedToTranslateMessages.keys()]) {
      if(key.startsWith(keyPrefix)) {
        this.resetMessageTranslations(peerId, +key.slice(keyPrefix.length));
      }
    }

    this.clearSummaries(peerId);
  }

  public resetPeerTranslationsByChannelCutoff(peerId: PeerId) {
    const mids = new Set<number>();
    const keyPrefix = `${peerId}_`;
    for(const key of [...this.triedToTranslateMessages.keys()]) {
      if(!key.startsWith(keyPrefix)) continue;
      const mid = +key.slice(keyPrefix.length);
      if(this.appMessagesManager.isMessageIdUnavailableByChannelCutoff(peerId, mid)) {
        mids.add(mid);
        this.resetMessageTranslations(peerId, mid);
      }
    }

    const peerSummaries = this.summaries[peerId];
    if(peerSummaries) {
      for(const key of Object.keys(peerSummaries)) {
        const mid = +key;
        if(this.appMessagesManager.isMessageIdUnavailableByChannelCutoff(peerId, mid)) {
          mids.add(mid);
          delete peerSummaries[mid];
        }
      }
      if(!Object.keys(peerSummaries).length) delete this.summaries[peerId];
    }

    return mids;
  }

  private clearTranslationMap<K, T>(
    map: Map<K, MaybeDeferredPromise<T>>,
    error: ApiError,
    onEvict?: (value: T, key: K) => void
  ) {
    for(const [key, value] of map) {
      map.delete(key);
      if(value instanceof Promise) {
        (value as CancellablePromise<T>).reject(error);
      } else {
        onEvict?.(value, key);
      }
    }
  }

  private evictMessageTranslation<K, T>(
    map: Map<K, MaybeDeferredPromise<T>>,
    key: K,
    onEvict?: (value: T) => void
  ) {
    const value = map?.get(key);
    if(value === undefined) return;

    map.delete(key);
    if(value instanceof Promise) {
      (value as CancellablePromise<T>).reject(makeError('MESSAGE_ID_INVALID'));
    } else {
      onEvict?.(value);
    }
  }

  private evictRichMessageTranslation(
    lang: string,
    peerId: PeerId,
    mid: number,
    releaseMedia = true
  ) {
    this.evictMessageTranslation(
      this.translateRichMessageBatch[lang]?.messages.get(peerId),
      mid,
      releaseMedia ? (richMessage) => this.appMessagesManager.releaseRichMessage(
        richMessage,
        this.getRichMessageTranslationReferenceContext(peerId, mid, lang)
      ) : undefined
    );
  }

  private getRichMessageTranslationReferenceContext(
    peerId: PeerId,
    mid: number,
    lang: string
  ): ReferenceContext.referenceContextMessageRichTranslation {
    return {
      type: 'messageRichTranslation',
      peerId,
      messageId: mid,
      lang
    };
  }

  private processTextWithEntities = (textWithEntities: TextWithEntities) => {
    this.appMessagesManager.wrapMessageEntities(textWithEntities);
    return textWithEntities;
  };

  private batchValues<T, V>(
    map: Map<T, MaybeDeferredPromise<V>>,
    request: (keys: T[]) => Promise<V[]>,
    processValue?: (value: V, key: T) => V,
    noCaching?: boolean
  ) {
    if(!map || ![...map.values()].some((value) => value instanceof Promise)) {
      return;
    }

    return pause(0).then(async() => {
      const doingEntries = [...map.entries()]
      .filter(([, value]) => value instanceof Promise)
      .slice(0, MAX_MESSAGES_PER_REQUEST);
      if(!doingEntries.length) {
        return;
      }

      const doingMap = new Map(doingEntries);
      const doingKeys = doingEntries.map(([key]) => key);

      let values: V[];
      try {
        values = await request(doingKeys);
      } catch(error) {
        doingKeys.forEach((key) => {
          const deferred = doingMap.get(key) as CancellablePromise<V>;
          if(map.get(key) === deferred) {
            map.delete(key);
          }
          deferred.reject(error);
        });
        return;
      }

      doingKeys.forEach((key, index) => {
        const deferred = doingMap.get(key) as CancellablePromise<V>;
        const value = values[index];
        if(value === undefined) {
          if(map.get(key) === deferred) {
            map.delete(key);
          }
          deferred.reject(makeError('UNKNOWN'));
          return;
        }

        // An edit/reset can replace this deferred while the request is in flight.
        // Check ownership before normalizing media or running any other side effect.
        if(map.get(key) !== deferred) {
          return;
        }

        let processedValue: V;
        try {
          processedValue = processValue ? processValue(value, key) : value;
        } catch(error) {
          if(map.get(key) === deferred) {
            map.delete(key);
          }
          deferred.reject(error);
          return;
        }

        if(noCaching) map.delete(key);
        else map.set(key, processedValue);
        deferred.resolve(processedValue);
      });
    });
  }

  private batchTranslation<T>(
    lang: string,
    map: Map<any, MaybeDeferredPromise<TextWithEntities>>,
    getParams: (keys: T[]) => Partial<MessagesTranslateText>,
    noCaching?: boolean
  ) {
    return this.batchValues(map, async(keys) => {
      const result: MessagesTranslatedText = await this.apiManager.invokeApi('messages.translateText', {
        ...getParams(keys),
        to_lang: lang
      });
      return result.result;
    }, this.processTextWithEntities, noCaching);
  }

  private releaseMessageBatch<T>(batch: {
    messages: Map<PeerId, Map<number, MaybeDeferredPromise<T>>>,
    messagesPromises: Map<PeerId, Promise<any>>
  }, peerId: PeerId, promise?: Promise<any>) {
    if(batch.messagesPromises.get(peerId) === promise) {
      batch.messagesPromises.delete(peerId);
    }
    const currentMap = batch.messages.get(peerId);
    if(currentMap && !currentMap.size) {
      batch.messages.delete(peerId);
    }
  }

  private batchMessageTranslation(lang: string, peerId: PeerId) {
    const batch = this.translateTextBatch[lang];
    if(!batch || batch.messagesPromises.get(peerId)) {
      return;
    }

    const map = batch.messages.get(peerId);
    const promise = this.batchTranslation<number>(lang, map, (mids) => ({
      peer: this.appPeersManager.getInputPeerById(peerId),
      id: mids.map((mid) => getServerMessageId(mid))
    }));
    promise && batch.messagesPromises.set(peerId, promise);
    const release = () => {
      this.releaseMessageBatch(batch, peerId, promise);
      this.batchMessageTranslation(lang, peerId);
    };
    promise?.then(release, release);
  }

  private batchTextTranslation(lang: string) {
    const batch = this.translateTextBatch[lang];
    if(!batch || batch.textPromise) {
      return;
    }

    const map = batch.text;
    const promise = this.batchTranslation<string>(lang, map, (keys) => ({
      text: keys.map((key) => ({entities: [], ...JSON.parse(key)}))
    }), true);
    promise && (batch.textPromise = promise);
    const release = () => {
      if(batch.textPromise === promise) {
        batch.textPromise = undefined;
      }
      this.batchTextTranslation(lang);
    };
    promise?.then(release, release);
  }

  private batchRichMessageTranslation(lang: string, peerId: PeerId) {
    const batch = this.translateRichMessageBatch[lang];
    if(!batch || batch.messagesPromises.get(peerId)) {
      return;
    }

    const map = batch.messages.get(peerId);
    const promise = this.batchValues(map, async(mids) => {
      const result: MessagesTranslatedRichMessage = await this.apiManager.invokeApi('messages.translateRichMessage', {
        peer: this.appPeersManager.getInputPeerById(peerId),
        id: mids.map((mid) => getServerMessageId(mid)),
        to_lang: lang
      });
      return result.result;
    }, (richMessage, mid) => this.appMessagesManager.processRichMessage(
      richMessage,
      this.getRichMessageTranslationReferenceContext(peerId, mid, lang)
    ));
    promise && batch.messagesPromises.set(peerId, promise);
    const release = () => {
      this.releaseMessageBatch(batch, peerId, promise);
      this.batchRichMessageTranslation(lang, peerId);
    };
    promise?.then(release, release);
  }

  private trackMessageTranslation(peerId: PeerId, mid: number, lang: string) {
    const key = `${peerId}_${mid}` as const;
    let tried = this.triedToTranslateMessages.get(key);
    if(!tried) {
      this.triedToTranslateMessages.set(key, tried = new Set());
    }
    tried.add(lang);
  }

  private getChannelCutoffResult(peerId: PeerId, mid: number, onlyCache?: boolean) {
    if(!this.appMessagesManager.isMessageIdUnavailableByChannelCutoff(peerId, mid)) {
      return {unavailable: false as const};
    }

    return {
      unavailable: true as const,
      result: onlyCache ? undefined : Promise.reject(makeError('MESSAGE_ID_INVALID'))
    };
  }

  public translateText(options: ({
    peerId: PeerId,
    mid: number
  } | {
    text: TextWithEntities
  }) & {lang: string, onlyCache?: boolean}): MaybeDeferredPromise<TextWithEntities> {
    const isMessage = 'peerId' in options;
    if(isMessage) {
      const cutoff = this.getChannelCutoffResult(options.peerId, options.mid, options.onlyCache);
      if(cutoff.unavailable) return cutoff.result;
    }

    this.translateTextBatch[options.lang] ??= {text: new Map(), messages: new Map(), messagesPromises: new Map()};
    const batch = this.translateTextBatch[options.lang];

    if(isMessage) {
      const message = this.appMessagesManager.getMessageByPeer(options.peerId, options.mid);
      if(this.appMessagesManager.isEphemeralMessageId(options.mid) && !message) {
        return Promise.reject(makeError('MESSAGE_ID_INVALID'));
      }

      if(this.appMessagesManager.isEphemeralMessage(message)) {
        return this.translateText({
          text: {
            _: 'textWithEntities',
            text: message.message,
            entities: message.entities || []
          },
          lang: options.lang,
          onlyCache: options.onlyCache
        });
      }

      let map = batch.messages.get(options.peerId);
      if(!map) {
        batch.messages.set(options.peerId, map = new Map());
      }

      let promise = map.get(options.mid);
      if(promise || options.onlyCache) {
        return promise;
      }

      promise = deferredPromise<TextWithEntities>();
      map.set(options.mid, promise);

      this.trackMessageTranslation(options.peerId, options.mid, options.lang);

      this.batchMessageTranslation(options.lang, options.peerId);

      return promise;
    } else {
      const key = JSON.stringify({
        _: 'textWithEntities',
        text: options.text.text,
        entities: this.getInputEntities(options.text.entities)
      });
      let promise = batch.text.get(key);
      if(promise || options.onlyCache) {
        return promise;
      }

      promise = deferredPromise<TextWithEntities>();
      batch.text.set(key, promise);

      this.batchTextTranslation(options.lang);

      return promise;
    }
  }

  public translateRichMessage(options: {
    peerId: PeerId,
    mid: number,
    lang: string,
    onlyCache?: boolean
  }): MaybeDeferredPromise<RichMessage> {
    const cutoff = this.getChannelCutoffResult(options.peerId, options.mid, options.onlyCache);
    if(cutoff.unavailable) return cutoff.result;

    if(this.appMessagesManager.isEphemeralMessageId(options.mid)) {
      return Promise.reject(makeError('MESSAGE_ID_INVALID'));
    }

    this.translateRichMessageBatch[options.lang] ??= {messages: new Map(), messagesPromises: new Map()};
    const batch = this.translateRichMessageBatch[options.lang];
    let map = batch.messages.get(options.peerId);
    if(!map) {
      batch.messages.set(options.peerId, map = new Map());
    }

    let promise = map.get(options.mid);
    if(promise || options.onlyCache) {
      return promise;
    }

    promise = deferredPromise<RichMessage>();
    map.set(options.mid, promise);
    this.trackMessageTranslation(options.peerId, options.mid, options.lang);
    this.batchRichMessageTranslation(options.lang, options.peerId);

    return promise;
  }

  public refreshRichMessageTranslation(peerId: PeerId, mid: number, lang: string) {
    const current = this.translateRichMessageBatch[lang]?.messages.get(peerId)?.get(mid);
    if(current instanceof Promise) return current;

    // Keep the old context alive while ReferencesStorage is refreshing it: the
    // replacement response mutates the shared reference bytes in place.
    this.evictRichMessageTranslation(lang, peerId, mid, false);
    const promise = this.translateRichMessage({peerId, mid, lang});
    if(current) {
      const context = this.getRichMessageTranslationReferenceContext(peerId, mid, lang);
      Promise.resolve(promise).then(
        (richMessage) => this.appMessagesManager.releaseRichMessage(
          current,
          context,
          false,
          richMessage
        ),
        () => this.appMessagesManager.releaseRichMessage(current, context)
      );
    }

    return promise;
  }

  public togglePeerTranslations(peerId: PeerId, disabled: boolean) {
    this.appProfileManager.modifyCachedFullPeer(peerId, (fullPeer) => {
      if(!('pFlags' in fullPeer)) {
        return false;
      }
      if(disabled) fullPeer.pFlags.translations_disabled = true;
      else delete fullPeer.pFlags.translations_disabled;
    });

    return this.apiManager.invokeApi('messages.togglePeerTranslations', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      disabled
    });
  }

  public summarizeText({peerId, mid, lang}: {
    peerId: PeerId,
    mid: number,
    lang?: string
  }) {
    const cutoff = this.getChannelCutoffResult(peerId, mid);
    if(cutoff.unavailable) return cutoff.result;

    if(
      this.appMessagesManager.isEphemeralMessageId(mid) ||
      this.appMessagesManager.isEphemeralMessage(this.appMessagesManager.getMessageByPeer(peerId, mid))
    ) {
      return Promise.reject(makeError('UNKNOWN'));
    }

    let promise = ((this.summaries[peerId] ??= {})[mid] ??= {})[lang];
    if(promise) {
      return promise;
    }

    this.summaries[peerId][mid][lang] = promise = this.apiManager.invokeApi('messages.summarizeText', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      id: getServerMessageId(mid),
      to_lang: lang
    })/* .then(() => {
      throw makeError('SUMMARY_FLOOD_PREMIUM');
    }) */;

    promise.then(
      (textWithEntities) => {
        if(this.summaries[peerId]?.[mid]?.[lang] === promise) {
          this.summaries[peerId][mid][lang] = textWithEntities;
        }
      },
      () => {
        if(this.summaries[peerId]?.[mid]?.[lang] === promise) {
          const peerSummaries = this.summaries[peerId];
          const messageSummaries = peerSummaries[mid];
          delete messageSummaries[lang];
          if(!Object.keys(messageSummaries).length) delete peerSummaries[mid];
          if(!Object.keys(peerSummaries).length) delete this.summaries[peerId];
        }
      }
    );

    return promise;
  }

  public clearSummaries(peerId: PeerId, mid?: number) {
    const summaries = this.summaries[peerId];
    if(!summaries) {
      return;
    }

    if(mid) {
      delete summaries[mid];
    } else {
      delete this.summaries[peerId];
    }
  }

  private getInputEntities(entities: MessageEntity[]): MessageEntity[] {
    return entities ? this.appMessagesManager.getInputEntities(entities)?.filter((entity) => entity._ !== 'messageEntityEmoji') || [] : [];
  }
}
