/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDocument} from './appDocsManager';
import type {DownloadOptions} from '../mtproto/apiFileManager';
import {Document, InputFileLocation, InputStickerSet, MessageEntity, MessagesAllStickers, MessagesFavedStickers, MessagesFeaturedStickers, MessagesFoundStickerSets, MessagesRecentStickers, MessagesStickers, MessagesStickerSet, PhotoSize, StickerPack, StickerSet, StickerSetCovered, Update, VideoSize} from '../../layer';
import {Modify} from '../../types';
import AppStorage from '../storage';
import {AccountDatabase, getDatabaseState} from '../../config/databases/state';
import assumeType from '../../helpers/assumeType';
import fixBase64String from '../../helpers/fixBase64String';
import forEachReverse from '../../helpers/array/forEachReverse';
import findAndSplice from '../../helpers/array/findAndSplice';
import {AppManager} from './manager';
import fixEmoji from '../richTextProcessor/fixEmoji';
import ctx from '../../environment/ctx';
import {getEnvironment} from '../../environment/utils';
import getDocumentInput from './utils/docs/getDocumentInput';
import getStickerEffectThumb from './utils/stickers/getStickerEffectThumb';
import tsNow from '../../helpers/tsNow';
import SearchIndex from '../searchIndex';
import parseEntities from '../richTextProcessor/parseEntities';
import toArray from '../../helpers/array/toArray';

const CACHE_TIME = 3600e3;

type LOCAL_STICKER_SET_ID = Extract<
  InputStickerSet['_'],
  'inputStickerSetAnimatedEmoji' | 'inputStickerSetAnimatedEmojiAnimations' |
  'inputStickerSetPremiumGifts' | 'inputStickerSetEmojiGenericAnimations' |
  'inputStickerSetEmojiDefaultStatuses' | 'inputStickerSetEmojiDefaultTopicIcons'
>;

type LOCAL_ID = 'EMOJI' | 'EMOJI_ANIMATIONS' | 'PREMIUM_GIFTS' | 'GENERIC_ANIMATIONS' | 'DEFAULT_STATUSES' | 'DEFAULT_TOPIC_ICONS';

const LOCAL_IDS: {[key in LOCAL_ID]: LOCAL_STICKER_SET_ID} = {
  EMOJI: 'inputStickerSetAnimatedEmoji',
  EMOJI_ANIMATIONS: 'inputStickerSetAnimatedEmojiAnimations',
  PREMIUM_GIFTS: 'inputStickerSetPremiumGifts',
  GENERIC_ANIMATIONS: 'inputStickerSetEmojiGenericAnimations',
  DEFAULT_STATUSES: 'inputStickerSetEmojiDefaultStatuses',
  DEFAULT_TOPIC_ICONS: 'inputStickerSetEmojiDefaultTopicIcons'
};

const LOCAL_IDS_SET: Set<LOCAL_STICKER_SET_ID> = new Set(Object.values(LOCAL_IDS) as any);

// let TEST_FILE_REFERENCE_REFRESH = true;

export type MyStickerSetInput = {
  id: StickerSet.stickerSet['id'],
  access_hash?: StickerSet.stickerSet['access_hash']
};

export type MyMessagesStickerSet = MessagesStickerSet.messagesStickerSet;

export class AppStickersManager extends AppManager {
  private storage: AppStorage<Record<Long, MyMessagesStickerSet>, AccountDatabase>;

  private getStickerSetPromises: {[setId: Long]: Promise<MyMessagesStickerSet>};
  private getStickersByEmoticonsPromises: {[emoticon: string]: Promise<MyDocument[]>};

  private greetingStickers: MyDocument[];
  private getGreetingStickersTimeout: number;
  private getGreetingStickersPromise: Promise<void>;

  private sounds: Record<string, MyDocument>;
  private getAnimatedEmojiSoundsPromise: Promise<void>;

  private favedStickers: MyDocument[];
  private recentStickers: MyDocument[];

  private names: Record<string, InputStickerSet.inputStickerSetID>;

  private indexes: Partial<{
    stickers: SearchIndex<DocId>,
    emojis: SearchIndex<DocId>
  }>;

  protected after() {
    this.storage = new AppStorage(getDatabaseState(this.getAccountNumber()), 'stickerSets');
    this.clear(true);

    this.rootScope.addEventListener('user_auth', () => {
      setTimeout(() => {
        this.getAnimatedEmojiStickerSet();

        Promise.resolve(this.getLocalStickerSet(LOCAL_IDS.GENERIC_ANIMATIONS)).then(async(messagesStickerSet) => {
          for(const doc of messagesStickerSet.documents) {
            await this.apiFileManager.downloadMedia({media: doc as Document.document});
          }
        });
        // this.getFavedStickersStickers();
      }, 1000);

      if(!this.getGreetingStickersPromise) {
        this.getGreetingStickersTimeout ??= ctx.setTimeout(() => {
          this.getGreetingStickersTimeout = undefined;
          this.getGreetingSticker(true);
        }, 5000);
      }

      this.rootScope.addEventListener('app_config', () => this.onStickersUpdated('faved', true));
    });

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateNewStickerSet: (update) => {
        const stickerSet = update.stickerset as MyMessagesStickerSet;
        this.saveStickerSet(stickerSet, stickerSet.set.id);
        this.rootScope.dispatchEvent('stickers_installed', stickerSet.set);
      },

      updateRecentStickers: () => this.onStickersUpdated('recent', true),

      updateFavedStickers: () => this.onStickersUpdated('faved', true),

      updateMoveStickerSetToTop: (update) => {
        this.rootScope.dispatchEvent('stickers_top', update.stickerset);
      },

      updateStickerSetsOrder: (update) => {
        this.rootScope.dispatchEvent('stickers_order', {
          type: update.pFlags.emojis ? 'emojis' : (update.pFlags.masks ? 'masks' : 'stickers'),
          order: update.order
        });
      }

      // updateStickerSets: (update) => {
      //   if(update.pFlags.masks) {
      //     return;
      //   }

      //   this.storage.clear(false);

      //   if(update.pFlags.emojis) {

      //   } else {
      //     this.favedStickers = undefined;
      //     this.recentStickers = undefined;
      //     this.onStickersUpdated('recent', true);
      //     this.onStickersUpdated('faved', true);
      //   }
      // }
    });
  }

  public clear = (init?: boolean) => {
    this.getStickerSetPromises = {};
    this.getStickersByEmoticonsPromises = {};
    this.sounds = {};
    this.names = {};
    this.indexes = {};
  };

  private async onStickersUpdated(type: 'faved' | 'recent', overwrite: boolean) {
    const stickers = await (type === 'faved' ? this.getFavedStickersStickers(overwrite) : this.getRecentStickersStickers(overwrite));
    this.rootScope.dispatchEvent('stickers_updated', {
      type,
      stickers
    });
  }

  public getGreetingSticker(justPreload = false) {
    if(this.getGreetingStickersTimeout) {
      clearTimeout(this.getGreetingStickersTimeout);
      this.getGreetingStickersTimeout = undefined;
    }

    if(!this.getGreetingStickersPromise) {
      this.getGreetingStickersPromise = this.getStickersByEmoticon({
        emoticon: '👋⭐️',
        includeServerStickers: true
      }).then((docs) => {
        if(!docs.length) throw 'NO_STICKERS';
        this.greetingStickers = docs.slice() as Document.document[];
        this.greetingStickers.sort((a, b) => Math.random() - Math.random());
      });
    }

    return this.getGreetingStickersPromise.then(() => {
      let doc: Document.document;
      if(!justPreload) {
        doc = this.greetingStickers.shift();
        this.greetingStickers.push(doc);
      }

      this.apiFileManager.downloadMedia({media: this.greetingStickers[0]}); // preload next sticker

      return doc;
    });
  }

  private saveStickers(docs: Document[]) {
    if(!docs || (docs as any).saved) return;
    (docs as any).saved = true;
    forEachReverse(docs, (doc, idx) => {
      doc = this.appDocsManager.saveDoc(doc);

      if(!doc) docs.splice(idx, 1);
      else docs[idx] = doc;
    });
  }

  private canUseStickerSetCache(set: MyMessagesStickerSet, useCache?: boolean) {
    return set && set.documents?.length && ((Date.now() - set.refreshTime) < CACHE_TIME || useCache);
  }

  public getStickerSet(set: MyStickerSetInput, params: Partial<{
    overwrite: boolean,
    useCache: boolean,
    saveById: boolean
  }> = {}): Promise<MyMessagesStickerSet> | MyMessagesStickerSet {
    let {id} = set;
    if(!set.access_hash) {
      set = this.names[id] || set;
      id = set.id;
    }

    if(this.getStickerSetPromises[id]) {
      return this.getStickerSetPromises[id];
    }

    if(!params.overwrite) {
      const cachedSet = this.storage.getFromCache(id);
      if(this.canUseStickerSetCache(cachedSet, params.useCache)) {
        return cachedSet;
      }
    }

    const promise = this.getStickerSetPromises[id] = new Promise(async(resolve) => {
      if(!params.overwrite) {
        const cachedSet = await this.storage.get(id);
        if(this.canUseStickerSetCache(cachedSet, params.useCache)) {
          delete (cachedSet.documents as any).saved;
          this.saveStickerSetLocal(cachedSet);
          resolve(cachedSet);

          if(this.getStickerSetPromises[id] === promise) {
            delete this.getStickerSetPromises[id];
          }

          return;
        }
      }

      try {
        const stickerSet = await this.apiManager.invokeApi('messages.getStickerSet', {
          stickerset: this.getStickerSetInput(set),
          hash: 0
        }) as MyMessagesStickerSet;

        const saveById = params.saveById ? id : stickerSet.set.id;
        this.saveStickerSet(stickerSet, saveById);

        resolve(stickerSet);
      } catch(err) {
        resolve(null);
      }

      if(this.getStickerSetPromises[id] === promise) {
        delete this.getStickerSetPromises[id];
      }
    });

    return promise;
  }

  public getLocalStickerSet(id: LOCAL_STICKER_SET_ID) {
    return this.getStickerSet({id}, {saveById: true});
  }

  public getAnimatedEmojiStickerSet() {
    return Promise.all([
      this.getLocalStickerSet(LOCAL_IDS.EMOJI),
      this.getLocalStickerSet(LOCAL_IDS.EMOJI_ANIMATIONS),
      this.getAnimatedEmojiSounds(),
      this.getLocalStickerSet(LOCAL_IDS.GENERIC_ANIMATIONS)
    ]).then(([emoji, animations]) => {
      return {emoji, animations};
    });
  }

  public getAnimatedEmojiSounds(overwrite?: boolean) {
    if(this.getAnimatedEmojiSoundsPromise && !overwrite) return this.getAnimatedEmojiSoundsPromise;
    const promise = this.getAnimatedEmojiSoundsPromise = Promise.all([
      this.apiManager.getAppConfig(overwrite),
      this.apiManager.getConfig()
    ]).then(([appConfig, config]) => {
      if(this.getAnimatedEmojiSoundsPromise !== promise) {
        return;
      }

      for(const emoji in appConfig.emojies_sounds) {
        const sound = appConfig.emojies_sounds[emoji];
        const bytesStr = atob(fixBase64String(sound.file_reference_base64, false));
        const bytes = new Uint8Array(bytesStr.length);
        for(let i = 0, length = bytes.length; i < length; ++i) {
          bytes[i] = bytesStr[i].charCodeAt(0);
        }

        // if(TEST_FILE_REFERENCE_REFRESH) {
        //   bytes[0] = bytes[1] = bytes[2] = bytes[3] = bytes[4] = 0;
        //   sound.access_hash += '999';
        // }

        const doc = this.appDocsManager.saveDoc({
          _: 'document',
          pFlags: {},
          id: sound.id,
          access_hash: sound.access_hash,
          attributes: [{
            _: 'documentAttributeAudio',
            duration: 1,
            pFlags: {
              voice: true
            }
          }],
          date: 0,
          dc_id: config.this_dc,
          file_reference: bytes,
          mime_type: 'audio/ogg'
          // size: 101010 // test loading everytime
        }, {
          type: 'emojiesSounds'
        });

        this.sounds[emoji] = doc;
      }

      // if(TEST_FILE_REFERENCE_REFRESH) {
      //   TEST_FILE_REFERENCE_REFRESH = false;
      // }
    });

    return promise;
  }

  public async getRecentStickers(overwrite?: boolean): Promise<Modify<MessagesRecentStickers.messagesRecentStickers, {
    stickers: Document[]
  }>> {
    const res = await this.apiManager.invokeApiHashable({
      method: 'messages.getRecentStickers',
      processResult: (res) => {
        assumeType<MessagesRecentStickers.messagesRecentStickers>(res);

        this.recentStickers = res.stickers as MyDocument[];
        this.saveStickers(res.stickers);
        return res;
      },
      overwrite
    });

    return res;
  }

  public getRecentStickersStickers(overwrite?: boolean) {
    if(overwrite) this.recentStickers = undefined;
    else if(this.recentStickers) return this.recentStickers;
    return this.getRecentStickers(overwrite).then(() => this.recentStickers);
  }

  public async saveRecentSticker(docId: DocId, unsave?: boolean, attached?: boolean) {
    await this.getRecentStickersStickers();

    const doc = this.appDocsManager.getDoc(docId);

    findAndSplice(this.recentStickers, (_doc) => _doc.id === docId);
    if(!unsave) {
      this.recentStickers.unshift(doc);

      const docEmoticon = fixEmoji(doc.stickerEmojiRaw);
      for(const emoticon in this.getStickersByEmoticonsPromises) {
        const promise = this.getStickersByEmoticonsPromises[emoticon];
        promise.then((stickers) => {
          const _doc = findAndSplice(stickers, (_doc) => _doc.id === doc.id);
          if(_doc) {
            stickers.unshift(_doc);
          } else if(emoticon.includes(docEmoticon)) {
            stickers.unshift(doc);
          }
        });
      }
    }

    this.rootScope.dispatchEvent('sticker_updated', {type: 'recent', faved: !unsave, document: doc});

    if(unsave) {
      this.onStickersUpdated('recent', false);
    }

    return this.apiManager.invokeApi('messages.saveRecentSticker', {
      id: getDocumentInput(doc),
      unsave,
      attached
    });
  }

  private cleanEmoji(emoji: string) {
    return emoji.replace(/\ufe0f/g, '').replace(/🏻|🏼|🏽|🏾|🏿/g, '');
  }

  public getAnimatedEmojiSticker(emoji: string, isAnimation?: boolean) {
    const id = isAnimation ? LOCAL_IDS.EMOJI_ANIMATIONS : LOCAL_IDS.EMOJI;
    const stickerSet = this.storage.getFromCache(id);
    // const stickerSet = await this.getStickerSet({id});
    if(!stickerSet?.documents) return;

    if(isAnimation) {
      if(['🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎'].includes(emoji)) {
        emoji = '❤️';
      }
    }

    emoji = this.cleanEmoji(emoji);
    const pack = stickerSet.packs.find((p) => p.emoticon === emoji);
    return pack ? this.appDocsManager.getDoc(pack.documents[0]) : undefined;
  }

  public getAnimatedEmojiSoundDocument(emoji: string) {
    return this.sounds[this.cleanEmoji(emoji)];
  }

  public preloadAnimatedEmojiSticker(emoji: string) {
    const preloadEmojiPromise = this.getAnimatedEmojiStickerSet().then(() => {
      return this.getAnimatedEmojiSticker(emoji);
    });

    return Promise.all([
      preloadEmojiPromise,
      this.preloadAnimatedEmojiStickerAnimation(emoji)
    ]).then(([doc, a]) => {
      return {
        doc: doc,
        animation: a?.doc,
        sound: a?.sound
      };
    });
  }

  public preloadAnimatedEmojiStickerAnimation(emoji: string) {
    return this.getAnimatedEmojiStickerSet().then(() => {
      return this.getAnimatedEmojiSticker(emoji, true);
    }).then((doc) => {
      if(!doc) {
        return;
      }

      const sound = this.getAnimatedEmojiSoundDocument(emoji);
      return Promise.all([
        this.preloadSticker(doc.id),
        sound ? this.preloadSticker(sound.id) : undefined
      ]).then(() => {
        return {doc, sound};
      });
    });
  }

  public preloadSticker(docId: DocId, isPremiumEffect?: boolean) {
    const doc = this.appDocsManager.getDoc(docId);
    return this.apiFileManager.downloadMedia({media: doc, thumb: isPremiumEffect ? doc.video_thumbs?.[0] as Extract<VideoSize, VideoSize.videoSize> : undefined});
  }

  public getEmojisSearchIndex() {
    return this.indexes.emojis;
  }

  private indexStickerSet(stickerSet: MessagesStickerSet.messagesStickerSet) {
    const isEmojis = stickerSet.set.pFlags.emojis;
    const index = this.indexes[isEmojis ? 'emojis' : 'stickers'] ??= new SearchIndex({minChars: 2, fullWords: true});

    const map: Map<DocId, string[]> = new Map();
    stickerSet.keywords.forEach((keyword) => {
      map.set(keyword.document_id, keyword.keyword.slice());
    });

    stickerSet.packs.forEach((pack) => {
      const emoticon = fixEmoji(pack.emoticon);
      pack.documents.forEach((docId) => {
        let array = map.get(docId);
        if(!array) {
          map.set(docId, array = []);
        }

        array.push(emoticon);
      });
    });

    const shouldRemove = !stickerSet.set.installed_date;
    map.forEach((keywords, docId) => {
      index.indexObjectArray(docId as DocId, shouldRemove ? [] : keywords);
    });
  }

  private saveStickerSetLocal(stickerSet: MessagesStickerSet.messagesStickerSet) {
    if(stickerSet.set.short_name) {
      this.names[stickerSet.set.short_name] = this.getStickerSetInput(stickerSet.set) as any;
    }

    this.saveStickers(stickerSet.documents);
    this.indexStickerSet(stickerSet);
  }

  private saveStickerSet(res: Omit<MessagesStickerSet.messagesStickerSet, '_'>, id: DocId) {
    const newSet: MessagesStickerSet = {
      _: 'messages.stickerSet',
      set: res.set,
      packs: res.packs,
      documents: res.documents as Document[],
      keywords: res.keywords
    };

    let stickerSet = this.storage.getFromCache(id);
    if(stickerSet) {
      Object.assign(stickerSet, newSet);
    } else {
      stickerSet = this.storage.setToCache(id, newSet);
    }

    this.saveStickerSetLocal(newSet);

    // console.log('stickers wrote', this.stickerSets);
    const needSave = stickerSet.set.installed_date || LOCAL_IDS_SET.has(id as any);
    stickerSet.refreshTime = Date.now();
    this.storage.set({[id]: stickerSet}, !needSave);
  }

  public getStickerSetThumbDownloadOptions(stickerSet: StickerSet.stickerSet): DownloadOptions {
    const thumb = stickerSet.thumbs.find((thumb) => thumb._ === 'photoSize') as PhotoSize.photoSize;
    const dcId = stickerSet.thumb_dc_id;

    const isLottie = thumb.type === 'a';
    const isVideo = thumb.type === 'v';

    const input: InputFileLocation.inputStickerSetThumb = {
      _: 'inputStickerSetThumb',
      stickerset: this.getStickerSetInput(stickerSet),
      thumb_version: stickerSet.thumb_version
    };

    return {
      dcId,
      location: input,
      size: thumb.size,
      mimeType: isLottie ? 'application/x-tgsticker' : (isVideo && getEnvironment().IS_WEBM_SUPPORTED ? 'video/webm' : 'image/webp')
    };
  }

  /* public getStickerSetThumbURL(stickerSet: MTStickerSet) {
    const thumb = stickerSet.thumb;
    const dcId = stickerSet.thumb_dc_id;

    const isAnimated = stickerSet.pFlags?.animated;

    const input: inputStickerSetThumb = {
      _: 'inputStickerSetThumb',
      stickerset: this.getStickerSetInput(stickerSet),
      volume_id: thumb.location.volume_id,
      local_id: thumb.location.local_id
    };

    const url = getFileURL('document', this.getStickerSetThumbDownloadOptions(stickerSet));
    return url;

    //return promise;
  } */

  public getStickerSetInput(set: MyStickerSetInput): InputStickerSet {
    if(LOCAL_IDS_SET.has(set.id as any)) {
      return {
        _: set.id as any
      };
    } else if(!set.access_hash) {
      return {
        _: 'inputStickerSetShortName',
        short_name: '' + set.id
      };
    } else {
      return {
        _: 'inputStickerSetID',
        id: set.id,
        access_hash: set.access_hash
      };
    }
  }

  public async getFeaturedStickers() {
    const res = await this.apiManager.invokeApiHashable({
      method: 'messages.getFeaturedStickers',
      processResult: (res) => {
        assumeType<MessagesFeaturedStickers.messagesFeaturedStickers>(res);

        // forEachReverse(res.sets, (covered, idx, arr) => {
        //   if(covered.set.pFlags.videos && !getEnvironment().IS_WEBM_SUPPORTED) {
        //     arr.splice(idx, 1);
        //   }
        // });

        res.sets.forEach((covered) => {
          this.saveStickerSet({
            documents: [],
            packs: [],
            keywords: [],
            ...(covered as StickerSetCovered.stickerSetFullCovered)
          }, covered.set.id);
        });

        return res;
      }
    });

    return res.sets;
  }

  public getPromoPremiumStickers() {
    return this.getStickersByEmoticon({
      emoticon: '⭐️⭐️',
      includeServerStickers: true
    });
  }

  public getPremiumStickers() {
    return this.getStickersByEmoticon({
      emoticon: '📂⭐️',
      includeServerStickers: true
    });
  }

  public getFavedStickers(overwrite?: boolean) {
    return this.apiManager.invokeApiHashable({
      method: 'messages.getFavedStickers',
      processResult: (favedStickers) => {
        assumeType<MessagesFavedStickers.messagesFavedStickers>(favedStickers);
        this.saveStickers(favedStickers.stickers);
        this.favedStickers = favedStickers.stickers as MyDocument[];
        return favedStickers;
      },
      overwrite
    });
  }

  public getFavedStickersStickers(overwrite?: boolean) {
    if(overwrite) this.favedStickers = undefined;
    else if(this.favedStickers) return this.favedStickers;
    return this.getFavedStickers(overwrite).then(() => this.favedStickers);
  }

  public getFavedStickersLimit() {
    return this.apiManager.getLimit('favedStickers');
  }

  public async faveSticker(docId: DocId, unfave?: boolean) {
    if(!this.favedStickers) {
      await this.getFavedStickersStickers();
    }

    const limit = await this.getFavedStickersLimit();

    const doc = this.appDocsManager.getDoc(docId);
    findAndSplice(this.favedStickers, (_doc) => _doc.id === doc.id);

    if(!unfave) {
      this.favedStickers.unshift(doc);
      const spliced = this.favedStickers.splice(limit, this.favedStickers.length - limit);
    }

    this.rootScope.dispatchEvent('sticker_updated', {type: 'faved', faved: !unfave, document: doc});

    return this.apiManager.invokeApi('messages.faveSticker', {
      id: getDocumentInput(doc),
      unfave
    }).then(() => {
      if(unfave) {
        this.onStickersUpdated('faved', true);
      }
    });
  }

  public async toggleStickerSet(set: StickerSet.stickerSet) {
    const stickerSet = this.storage.getFromCache(set.id);
    set = stickerSet.set;

    if(set.installed_date) {
      const res = await this.apiManager.invokeApi('messages.uninstallStickerSet', {
        stickerset: this.getStickerSetInput(set)
      });

      if(res) {
        delete set.installed_date;
        this.saveStickerSetLocal(stickerSet);
        this.rootScope.dispatchEvent('stickers_deleted', set);
        this.storage.delete(set.id, true);
        return true;
      }
    } else {
      const res = await this.apiManager.invokeApi('messages.installStickerSet', {
        stickerset: this.getStickerSetInput(set),
        archived: false
      });

      if(res) {
        set.installed_date = tsNow(true);
        this.saveStickerSetLocal(stickerSet);
        this.rootScope.dispatchEvent('stickers_installed', set);
        return true;
      }
    }

    return false;
  }

  public toggleStickerSets(sets: StickerSet.stickerSet[]) {
    return Promise.all(sets.map((set) => this.toggleStickerSet(set)));
  }

  public async searchStickerSets(query: string, excludeFeatured = true) {
    const flags = excludeFeatured ? 1 : 0;
    const res = await this.apiManager.invokeApiHashable({
      method: 'messages.searchStickerSets',
      params: {
        flags,
        exclude_featured: excludeFeatured || undefined,
        q: query
      },
      processResult: (res) => {
        assumeType<MessagesFoundStickerSets.messagesFoundStickerSets>(res);

        // forEachReverse(res.sets, (covered, idx, arr) => {
        //   if(covered.set.pFlags.videos && !getEnvironment().IS_WEBM_SUPPORTED) {
        //     arr.splice(idx, 1);
        //   }
        // });

        res.sets.forEach((covered) => {
          this.saveStickerSet({
            set: covered.set,
            documents: [],
            keywords: [],
            packs: [],
            ...(covered as StickerSetCovered.stickerSetFullCovered)
          }, covered.set.id);
        });

        return res;
      }
    });

    const foundSaved: StickerSetCovered[] = [];
    const cache = this.storage.getCache();
    for(const id in cache) {
      const {set} = cache[id];

      if(set.title.toLowerCase().includes(query.toLowerCase()) && !res.sets.find((c) => c.set.id === set.id)) {
        foundSaved.push({_: 'stickerSetCovered', set, cover: null});
      }
    }

    return res.sets.concat(foundSaved);
  }

  private processAllStickersResult = (allStickers: MessagesAllStickers) => {
    assumeType<MessagesAllStickers.messagesAllStickers>(allStickers);

    // forEachReverse(allStickers.sets, (stickerSet, idx, arr) => {
    //   if(stickerSet.pFlags.videos && !getEnvironment().IS_WEBM_SUPPORTED) {
    //     arr.splice(idx, 1);
    //   }
    // });

    return allStickers;
  };

  public getAllStickers() {
    return this.apiManager.invokeApiHashable({
      method: 'messages.getAllStickers',
      processResult: this.processAllStickersResult
    });
  }

  public getEmojiStickers() {
    return this.apiManager.invokeApiHashable({
      method: 'messages.getEmojiStickers',
      processResult: this.processAllStickersResult
    });
  }

  private onPreloadStickerSetsResult = (allStickers: MessagesAllStickers) => {
    const sets = (allStickers as MessagesAllStickers.messagesAllStickers).sets;
    return Promise.all(sets.map((set) => this.getStickerSet(set, {useCache: true})));
  };

  public preloadStickerSets() {
    return this.getAllStickers().then(this.onPreloadStickerSetsResult);
  }

  public preloadEmojiSets() {
    return this.getEmojiStickers().then(this.onPreloadStickerSetsResult);
  }

  // TODO: detect "🤷" by "🤷‍♂️"
  public getStickersByEmoticon({
    emoticon,
    includeOurStickers,
    includeServerStickers,
    excludePremiumEffectStickers
  }: {
    emoticon: string | string[],
    includeOurStickers?: boolean,
    includeServerStickers?: boolean,
    excludePremiumEffectStickers?: boolean
  }) {
    const emoticonArray = toArray(emoticon).map((emoji) => fixEmoji(emoji));
    emoticon = emoticonArray.join('');
    const cacheKey = emoticon + (includeOurStickers ? '1' : '0') + (includeServerStickers ? '1' : '0');
    if(this.getStickersByEmoticonsPromises[cacheKey]) return this.getStickersByEmoticonsPromises[cacheKey];

    return this.getStickersByEmoticonsPromises[cacheKey] = Promise.all([
      includeServerStickers ? this.apiManager.invokeApiHashable({
        method: 'messages.getStickers',
        params: {
          emoticon
        },
        processResult: (stickers) => stickers
      }) : undefined,
      includeOurStickers ? this.preloadStickerSets() : [],
      includeOurStickers ? this.getRecentStickers() : undefined
    ]).then(([messagesStickers, installedSets, recentStickers]) => {
      const foundStickers = messagesStickers ? (messagesStickers as MessagesStickers.messagesStickers).stickers.map((sticker) => this.appDocsManager.saveDoc(sticker)) : [];
      const cachedStickersAnimated: Document.document[] = [], cachedStickersStatic: Document.document[] = [];

      // console.log('getStickersByEmoticon', messagesStickers, installedSets, recentStickers);

      const iteratePacks = (packs: StickerPack.stickerPack[]) => {
        for(const emoticon of emoticonArray) {
          for(const pack of packs) {
            const packEmoticon = fixEmoji(pack.emoticon);
            if(packEmoticon.includes(emoticon)) {
              for(const docId of pack.documents) {
                const doc = this.appDocsManager.getDoc(docId);
                (doc.animated ? cachedStickersAnimated : cachedStickersStatic).push(doc);
              }
            }
          }
        }
      };

      if(recentStickers) {
        iteratePacks(recentStickers.packs);
        const stickers = recentStickers.stickers;
        [cachedStickersAnimated, cachedStickersStatic].forEach((s) => {
          s.sort((a, b) => stickers.indexOf(a) - stickers.indexOf(b));
        });
      }

      for(const set of installedSets) {
        iteratePacks(set.packs);
      }

      /* const entities = parseEntities(emoticon);
      if(entities.length === 1) {
        [cachedStickersAnimated, cachedStickersStatic].forEach((s) => {
          forEachReverse(s, (doc, idx) => {
            const docEmoticon = fixEmoji(doc.stickerEmojiRaw);
            if(docEmoticon !== emoticon) {
              s.splice(idx, 1);
            }
          });
        });
      } */

      const stickers = [...new Set(cachedStickersAnimated.concat(cachedStickersStatic, foundStickers))]/* .filter((doc) => !doc.animated) */;

      forEachReverse(stickers, (sticker, idx, arr) => {
        if((sticker.sticker === 3 && !getEnvironment().IS_WEBM_SUPPORTED) ||
          (excludePremiumEffectStickers && !this.rootScope.premium && getStickerEffectThumb(sticker))) {
          arr.splice(idx, 1);
        }
      });

      return stickers;
    });
  }

  private async splitSearchQuery(query: string): Promise<string[]> {
    query = query.trim();
    if(!query) {
      return [];
    }

    const entities = parseEntities(query);
    const emojiEntities = entities
    .filter((entity) => entity._ === 'messageEntityEmoji' || entity._ === 'messageEntityCustomEmoji')
    .map((entity) => query.slice(entity.offset, entity.offset + entity.length));

    let emojis: string[] = emojiEntities;
    if(!emojis.length) {
      emojis = (await this.appEmojiManager.prepareAndSearchEmojis({q: query, limit: 200, minChars: 1})).map(({emoji}) => emoji);
    }

    return emojis;
  }

  public async searchStickers(query: string): Promise<MyDocument[]> {
    return this.getStickersByEmoticon({
      emoticon: await this.splitSearchQuery(query),
      includeOurStickers: true
    });
  }

  public clearRecentStickers() {
    if(this.recentStickers) {
      this.recentStickers.length = 0;
      this.onStickersUpdated('recent', false);
    }

    return this.apiManager.invokeApi('messages.clearRecentStickers');
  }

  public reorderStickerSets(order: StickerSet.stickerSet['id'][], emojis?: boolean, masks?: boolean) {
    return this.apiManager.invokeApi('messages.reorderStickerSets', {
      emojis,
      masks,
      order
    }).then(() => {
      this.apiUpdatesManager.processLocalUpdate({
        _: 'updateStickerSetsOrder',
        order,
        pFlags: {
          emojis: emojis || undefined,
          masks: masks || undefined
        }
      });
    });
  }
}
