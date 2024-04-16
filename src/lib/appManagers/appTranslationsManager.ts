/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import pause from '../../helpers/schedulers/pause';
import {TextWithEntities, MessagesTranslatedText} from '../../layer';
import {AppManager} from './manager';
import getServerMessageId from './utils/messageId/getServerMessageId';

// ! possible race-condition if message was edited while translation is in progress

export default class AppTranslationsManager extends AppManager {
  private translateTextBatch: {
    [lang: string]: {
      text: Map<TextWithEntities, MaybeDeferredPromise<TextWithEntities>>,
      messages: Map<PeerId, Map<number, MaybeDeferredPromise<TextWithEntities>>>,
      textPromise?: Promise<any>,
      messagesPromises: Map<PeerId, Promise<any>>
    }
  } = {};
  private triedToTranslateMessages: Map<`${PeerId}_${number}`, Set<string>> = new Map();

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
      const batch = this.translateTextBatch[lang];
      if(!batch) {
        continue;
      }

      const map = batch.messages.get(peerId);
      if(!map) {
        continue;
      }

      map.delete(mid);
    }

    this.triedToTranslateMessages.delete(key);
  }

  private processTextWithEntities = (textWithEntities: TextWithEntities) => {
    this.appMessagesManager.wrapMessageEntities(textWithEntities);
    return textWithEntities;
  };

  private batchMessageTranslation(lang: string, peerId: PeerId) {
    const batch = this.translateTextBatch[lang];
    if(!batch || batch.messagesPromises.get(peerId)) {
      return;
    }

    const map = batch.messages.get(peerId);
    if(!map || ![...map.values()].some((v) => v instanceof Promise)) {
      return;
    }

    const promise = pause(0).then(async() => {
      const doingEntries = [...map.entries()].filter(([mid, v]) => v instanceof Promise);
      const doingMap = new Map(doingEntries);
      const doingMids = doingEntries.map(([mid]) => mid);

      const result: MessagesTranslatedText = await this.apiManager.invokeApi('messages.translateText', {
        peer: this.appPeersManager.getInputPeerById(peerId),
        id: doingMids.map((mid) => getServerMessageId(mid)),
        to_lang: lang
      }).catch((err) => {
        doingMids.forEach((mid) => {
          const deferred = doingMap.get(mid) as CancellablePromise<TextWithEntities>;
          map.delete(mid);
          deferred.reject(err);
        });

        return undefined;
      });

      if(result) result.result.forEach((textWithEntities, idx) => {
        this.processTextWithEntities(textWithEntities);
        const mid = doingMids[idx];
        const deferred = doingMap.get(mid) as CancellablePromise<TextWithEntities>;
        map.set(mid, textWithEntities);
        deferred.resolve(textWithEntities);
      });

      batch.messagesPromises.delete(peerId);
      this.batchMessageTranslation(lang, peerId);
    });

    batch.messagesPromises.set(peerId, promise);
  }

  public translateText(options: ({
    peerId: PeerId,
    mid: number
  } | {
    text: Array<TextWithEntities>
  }) & {lang: string, onlyCache?: boolean}) {
    this.translateTextBatch[options.lang] ??= {text: new Map(), messages: new Map(), messagesPromises: new Map()};
    const batch = this.translateTextBatch[options.lang];
    const isMessage = 'peerId' in options;

    if(isMessage) {
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

      const key = `${options.peerId}_${options.mid}` as const;
      let tried = this.triedToTranslateMessages.get(key);
      if(!tried) {
        this.triedToTranslateMessages.set(key, tried = new Set());
      }
      tried.add(options.lang);

      this.batchMessageTranslation(options.lang, options.peerId);

      return promise;
    }
  }

  public togglePeerTranslations(peerId: PeerId, disabled: boolean) {
    this.appProfileManager.modifyCachedFullPeer(peerId, (fullPeer) => {
      if(disabled) fullPeer.pFlags.translations_disabled = true;
      else delete fullPeer.pFlags.translations_disabled;
    });

    return this.apiManager.invokeApi('messages.togglePeerTranslations', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      disabled
    });
  }
}
