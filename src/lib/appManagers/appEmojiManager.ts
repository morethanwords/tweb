/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDocument} from './appDocsManager';
import App from '../../config/app';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import isObject from '../../helpers/object/isObject';
import validateInitObject from '../../helpers/object/validateInitObject';
import fixEmoji from '../richTextProcessor/fixEmoji';
import SearchIndex from '../searchIndex';
import {AppManager} from './manager';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import pause from '../../helpers/schedulers/pause';
import filterUnique from '../../helpers/array/filterUnique';
import assumeType from '../../helpers/assumeType';
import {EmojiGroup, EmojiList, MessagesEmojiGroups} from '../../layer';

type EmojiLangPack = {
  keywords: {
    [keyword: string]: string[],
  },
  version: number,
  langCode: string
};

const EMOJI_LANG_PACK: EmojiLangPack = {
  keywords: {},
  version: 0,
  langCode: App.langPackCode
};

const RECENT_MAX_LENGTH = 32;

type EmojiType = 'native' | 'custom';
type EmojiGroupType = 'esg' | 'stickers' | 'status' | 'profilePhoto';

export class AppEmojiManager extends AppManager {
  private static POPULAR_EMOJI = ['😂', '😘', '❤️', '😍', '😊', '😁', '👍', '☺️', '😔', '😄', '😭', '💋', '😒', '😳', '😜', '🙈', '😉', '😃', '😢', '😝', '😱', '😡', '😏', '😞', '😅', '😚', '🙊', '😌', '😀', '😋', '😆', '👌', '😐', '😕'];
  private keywordLangPacks: {
    [langCode: string]: EmojiLangPack
  } = {};

  private index: SearchIndex<EmojiLangPack['keywords'][keyof EmojiLangPack['keywords']]>;
  private indexedLangPacks: {[langCode: string]: boolean} = {};

  private getKeywordsPromises: {[langCode: string]: Promise<EmojiLangPack>} = {};

  private recent: {native?: string[], custom?: DocId[]} = {};
  private getRecentEmojisPromises: {native?: Promise<string[]>, custom?: Promise<DocId[]>} = {};

  private getCustomEmojiDocumentsPromise: Promise<any>;
  private getCustomEmojiDocumentPromises: Map<DocId, CancellablePromise<MyDocument>> = new Map();

  private emojiGroups: {[type in EmojiGroupType]?: MaybePromise<{group: EmojiGroup, document: MyDocument}[]>} = {};

  /* public getPopularEmoji() {
    return stateStorage.get('emojis_popular').then((popEmojis) => {
      var result = []
      if (popEmojis && popEmojis.length) {
        for (var i = 0, len = popEmojis.length; i < len; i++) {
          result.push({code: popEmojis[i][0], rate: popEmojis[i][1]})
        }
        callback(result)
        return
      }

      return stateStorage.get('emojis_recent').then((recentEmojis) => {
        recentEmojis = recentEmojis || popular || []
        var shortcut
        var code
        for (var i = 0, len = recentEmojis.length; i < len; i++) {
          shortcut = recentEmojis[i]
          if (Array.isArray(shortcut)) {
            shortcut = shortcut[0]
          }
          if (shortcut && typeof shortcut === 'string') {
            if (shortcut.charAt(0) == ':') {
              shortcut = shortcut.substr(1, shortcut.length - 2)
            }
            if (code = shortcuts[shortcut]) {
              result.push({code: code, rate: 1})
            }
          }
        }
        callback(result)
      });
    });
  }

  function pushPopularEmoji (code) {
    getPopularEmoji(function (popularEmoji) {
      var exists = false
      var count = popularEmoji.length
      var result = []
      for (var i = 0; i < count; i++) {
        if (popularEmoji[i].code == code) {
          exists = true
          popularEmoji[i].rate++
        }
        result.push([popularEmoji[i].code, popularEmoji[i].rate])
      }
      if (exists) {
        result.sort(function (a, b) {
          return b[1] - a[1]
        })
      } else {
        if (result.length > 41) {
          result = result.slice(0, 41)
        }
        result.push([code, 1])
      }
      ConfigStorage.set({emojis_popular: result})
    })
  } */

  public getEmojiKeywords(langCode: string = App.langPackCode) {
    const promise = this.getKeywordsPromises[langCode];
    if(promise) {
      return promise;
    }

    const storageKey: any = 'emojiKeywords_' + langCode;
    return this.getKeywordsPromises[langCode] = this.appStateManager.storage.get(storageKey).then((pack: EmojiLangPack) => {
      if(!isObject(pack)) {
        pack = {} as any;
      }

      validateInitObject(EMOJI_LANG_PACK, pack);

      // important
      pack.langCode = langCode;
      this.keywordLangPacks[langCode] = pack;

      return this.apiManager.invokeApi('messages.getEmojiKeywordsDifference', {
        lang_code: pack.langCode,
        from_version: pack.version
      }).then((keywordsDifference) => {
        pack.version = keywordsDifference.version;

        const packKeywords = pack.keywords;
        const keywords = keywordsDifference.keywords;
        for(let i = 0, length = keywords.length; i < length; ++i) {
          const {keyword, emoticons} = keywords[i];
          packKeywords[keyword] = emoticons;
        }

        this.appStateManager.storage.set({
          [storageKey]: pack
        });

        return pack;
      }, () => {
        return pack;
      });
    });
  }

  public getBothEmojiKeywords() {
    const promises: Promise<any>[] = [
      this.getEmojiKeywords()
    ];

    if(this.networkerFactory.language !== App.langPackCode) {
      promises.push(this.getEmojiKeywords(this.networkerFactory.language));
    }

    if(!this.recent.native) {
      promises.push(this.getRecentEmojis('native'));
    }

    if(this.rootScope.premium) {
      promises.push(this.appStickersManager.preloadEmojiSets());
    }

    return Promise.all(promises);
  }

  private indexEmojis() {
    if(!this.index) {
      this.index = new SearchIndex({minChars: 2, fullWords: true});
    }

    for(const langCode in this.keywordLangPacks) {
      if(this.indexedLangPacks[langCode]) {
        continue;
      }

      const pack = this.keywordLangPacks[langCode];
      const keywords = pack.keywords;

      for(const keyword in keywords) {
        const emoticons = keywords[keyword];
        this.index.indexObject(emoticons, keyword);
      }

      this.indexedLangPacks[langCode] = true;
    }
  }

  private searchEmojis({q, limit = 40, minChars = 2, addCustom}: {
    q: string,
    limit?: number,
    minChars?: number,
    addCustom?: boolean,
  }) {
    this.indexEmojis();

    q = q.toLowerCase().replace(/_/g, ' ');

    // const perf = performance.now();
    let emojis: Array<string>/* , docIds: Array<DocId> */;
    if(q.trim()) {
      const set = this.index.search(q, minChars);
      emojis = Array.from(set).reduce((acc, v) => (acc.push(...v), acc), []);
      emojis.length = Math.min(40, emojis.length);
    } else {
      emojis = this.recent.native.concat(AppEmojiManager.POPULAR_EMOJI).slice(0, RECENT_MAX_LENGTH);
      emojis = filterUnique(emojis);
    }

    const appEmojis: AppEmoji[] = [];
    const customEmojiIndex = addCustom && this.appStickersManager.getEmojisSearchIndex();
    emojis.forEach((emoji) => {
      if(/* this.rootScope.premium &&  */customEmojiIndex) {
        const customEmojisResult = customEmojiIndex.search(emoji, minChars);
        const customEmojis = Array.from(customEmojisResult).map((docId) => ({docId, emoji}));
        appEmojis.push(...customEmojis);
      }

      appEmojis.push({emoji});
    });

    appEmojis.length = Math.min(limit, appEmojis.length);
    // docIds = emojis.reduce((acc, emoji) => {
    //   acc.push(...customEmojiIndex.search(emoji));
    //   return acc;
    // }, []);

    // docIds = filterUnique(docIds);
    // docIds.length = Math.min(40, docIds.length);

    // appEmojis.push(
    //   ...(docIds || []).map((docId) => ({docId, emoji: ''})),
    //   ...emojis.map((emoji) => ({emoji}))
    // );
    // console.log('searchEmojis', q, 'time', performance.now() - perf);

    /* for(let i = 0, length = emojis.length; i < length; ++i) {
      if(emojis[i].includes(zeroWidthJoiner) && !emojis[i].includes('\ufe0f')) {
        emojis[i] += '\ufe0f';
      }
    } */

    return appEmojis;
  }

  public async prepareAndSearchEmojis(options: Parameters<AppEmojiManager['searchEmojis']>[0]) {
    await Promise.all([
      this.getBothEmojiKeywords(),
      this.appStickersManager.preloadEmojiSets()
    ]);

    return this.searchEmojis(options);
  }

  public getRecentEmojis<T extends EmojiType>(type: 'custom'): Promise<DocId[]>;
  public getRecentEmojis<T extends EmojiType>(type: 'native'): Promise<string[]>;
  public getRecentEmojis<T extends EmojiType>(type: T): Promise<string[] | DocId[]> {
    const promises = this.getRecentEmojisPromises;
    return promises[type] ??= this.appStateManager.getState().then((state) => {
      let recent: string[] | DocId[] = [];
      if(type === 'native') {
        const {recentEmoji} = state;
        recent = Array.isArray(recentEmoji) && recentEmoji.length ? recentEmoji : AppEmojiManager.POPULAR_EMOJI;
      } else {
        const {recentCustomEmoji} = state;
        recent = Array.isArray(recentCustomEmoji) && recentCustomEmoji.length ? recentCustomEmoji : [];
      }

      return this.recent[type] = recent as any;
    }) as any;
  }

  public modifyRecentEmoji(emoji: AppEmoji, add: boolean) {
    const type: EmojiType = emoji.docId ? 'custom' : 'native';
    emoji.emoji = fixEmoji(emoji.emoji);
    // @ts-ignore
    this.getRecentEmojis(type).then((recent) => {
      const i = emoji.docId || emoji.emoji;
      indexOfAndSplice(recent, i);
      if(add) recent.unshift(i);
      recent.splice(RECENT_MAX_LENGTH, recent.length - RECENT_MAX_LENGTH);

      this.appStateManager.pushToState(type === 'custom' ? 'recentCustomEmoji' : 'recentEmoji', recent);
      this.rootScope.dispatchEvent('emoji_recent', {emoji, deleted: !add});
    });
  }

  public pushRecentEmoji(emoji: AppEmoji) {
    return this.modifyRecentEmoji(emoji, true);
  }

  public deleteRecentEmoji(emoji: AppEmoji) {
    return this.modifyRecentEmoji(emoji, false);
  }

  public getCustomEmojiDocuments(docIds: DocId[]): Promise<MyDocument[]> {
    if(!docIds.length) return Promise.resolve([]);
    return this.apiManager.invokeApi('messages.getCustomEmojiDocuments', {document_id: docIds}).then((documents) => {
      return documents.map((doc) => {
        return this.appDocsManager.saveDoc(doc, {
          type: 'customEmoji',
          docId: doc.id
        });
      });
    }, () => {
      return new Array(docIds.length).fill(undefined);
    });
  }

  public getCachedCustomEmojiDocuments(docIds: DocId[]) {
    return docIds.map((docId) => this.appDocsManager.getDoc(docId));
  }

  private setDebouncedGetCustomEmojiDocuments() {
    if(this.getCustomEmojiDocumentsPromise || !this.getCustomEmojiDocumentPromises.size) {
      return;
    }

    this.getCustomEmojiDocumentsPromise = pause(0).then(() => {
      const allIds = [...this.getCustomEmojiDocumentPromises.keys()];
      const promises: Promise<any>[] = [];
      do {
        const ids = allIds.splice(0, 100);
        const promise = this.getCustomEmojiDocuments(ids).then((docs) => {
          docs.forEach((doc, idx) => {
            const docId = ids[idx];
            const deferred = this.getCustomEmojiDocumentPromises.get(docId);
            this.getCustomEmojiDocumentPromises.delete(docId);
            deferred.resolve(doc);
          });
        });

        promises.push(promise);
      } while(allIds.length);

      return Promise.all(promises);
    }).finally(() => {
      this.getCustomEmojiDocumentsPromise = undefined;
      this.setDebouncedGetCustomEmojiDocuments();
    });
  }

  public getCustomEmojiDocument(id: DocId) {
    let promise = this.getCustomEmojiDocumentPromises.get(id);
    if(promise) {
      return promise;
    }

    const doc = this.appDocsManager.getDoc(id);
    if(doc) {
      return doc;
    }

    promise = deferredPromise();
    this.getCustomEmojiDocumentPromises.set(id, promise);

    this.setDebouncedGetCustomEmojiDocuments();

    return promise;
  }

  public getCustomEmojis() {
    return this.appStickersManager.getEmojiStickers();
  }

  public getEmojiGroups(type: EmojiGroupType) {
    const pushPremiumGroup = (groups: EmojiGroup[]) => {
      if(groups.some((group) => group._ === 'emojiGroupPremium')) {
        return;
      }

      groups.push({
        _: 'emojiGroupPremium',
        title: 'Premium',
        icon_emoji_id: '5269590556232664327'
      });
    };

    return this.emojiGroups[type] ??= this.apiManager.invokeApiSingleProcess({
      method: type === 'esg' || type === 'stickers' ? 'messages.getEmojiGroups' : (type === 'status' ? 'messages.getEmojiStatusGroups' : 'messages.getEmojiProfilePhotoGroups'),
      params: {hash: 0},
      processResult: async(messagesEmojiGroups) => {
        assumeType<MessagesEmojiGroups.messagesEmojiGroups>(messagesEmojiGroups);

        // * until layer 179
        if(type === 'esg' || type === 'stickers') {
          pushPremiumGroup(messagesEmojiGroups.groups);
        }

        const documents = await Promise.all(messagesEmojiGroups.groups.map((emojiGroup) => this.getCustomEmojiDocument(emojiGroup.icon_emoji_id)));
        return this.emojiGroups[type] = messagesEmojiGroups.groups.map((group, idx) => {
          return {group, document: documents[idx]};
        });
      }
    });
  }

  public searchCustomEmoji(emoticon: string) {
    return this.apiManager.invokeApiCacheable(
      'messages.searchCustomEmoji',
      {hash: 0, emoticon},
      {cacheSeconds: 3600, syncIfHasResult: true}
    ) as MaybePromise<EmojiList.emojiList>;
  }
}
