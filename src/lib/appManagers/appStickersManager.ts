/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { Document, InputFileLocation, InputStickerSet, MessagesAllStickers, MessagesFeaturedStickers, MessagesFoundStickerSets, MessagesRecentStickers, MessagesStickers, MessagesStickerSet, PhotoSize, StickerPack, StickerSet, StickerSetCovered } from '../../layer';
import { Modify } from '../../types';
import apiManager from '../mtproto/mtprotoworker';
import rootScope from '../rootScope';
import appDocsManager, { MyDocument } from './appDocsManager';
import AppStorage from '../storage';
import { MOUNT_CLASS_TO } from '../../config/debug';
import DATABASE_STATE from '../../config/databases/state';
import lottieLoader from '../rlottie/lottieLoader';
import mediaSizes from '../../helpers/mediaSizes';
import { getEmojiToneIndex } from '../../vendor/emoji';
import RichTextProcessor from '../richtextprocessor';
import assumeType from '../../helpers/assumeType';
import fixBase64String from '../../helpers/fixBase64String';
import IS_WEBM_SUPPORTED from '../../environment/webmSupport';
import forEachReverse from '../../helpers/array/forEachReverse';
import findAndSplice from '../../helpers/array/findAndSplice';

const CACHE_TIME = 3600e3;

const EMOJI_SET_LOCAL_ID = 'emoji';
const EMOJI_ANIMATIONS_SET_LOCAL_ID = 'emojiAnimations';
const LOCAL_IDS_SET = new Set([
  EMOJI_SET_LOCAL_ID,
  EMOJI_ANIMATIONS_SET_LOCAL_ID
]);

// let TEST_FILE_REFERENCE_REFRESH = true;

export type MyStickerSetInput = {
  id: StickerSet.stickerSet['id'],
  access_hash?: StickerSet.stickerSet['access_hash']
};

export type MyMessagesStickerSet = MessagesStickerSet.messagesStickerSet;

export class AppStickersManager {
  private storage = new AppStorage<Record<Long, MyMessagesStickerSet>, typeof DATABASE_STATE>(DATABASE_STATE, 'stickerSets');

  private getStickerSetPromises: {[setId: Long]: Promise<MyMessagesStickerSet>};
  private getStickersByEmoticonsPromises: {[emoticon: string]: Promise<Document[]>};

  private greetingStickers: Document.document[];
  private getGreetingStickersTimeout: number;
  private getGreetingStickersPromise: Promise<void>;

  private sounds: Record<string, MyDocument>;
  private getAnimatedEmojiSoundsPromise: Promise<void>;
  
  constructor() {
    this.getStickerSetPromises = {};
    this.getStickersByEmoticonsPromises = {};    
    this.sounds = {};

    this.getAnimatedEmojiStickerSet();

    rootScope.addMultipleEventsListeners({
      updateNewStickerSet: (update) => {
        const stickerSet = update.stickerset as MyMessagesStickerSet;
        this.saveStickerSet(stickerSet, stickerSet.set.id);
        rootScope.dispatchEvent('stickers_installed', stickerSet.set);
      }
    });

    this.getGreetingStickersTimeout = window.setTimeout(() => {
      this.getGreetingStickersTimeout = undefined;
      this.getGreetingSticker(true);
    }, 5000);
  }

  public getGreetingSticker(justPreload = false) {
    if(this.getGreetingStickersTimeout) {
      clearTimeout(this.getGreetingStickersTimeout);
      this.getGreetingStickersTimeout = undefined;
    }

    if(!this.getGreetingStickersPromise) {
      this.getGreetingStickersPromise = this.getStickersByEmoticon('👋⭐️', false).then(docs => {
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

      appDocsManager.downloadDoc(this.greetingStickers[0]); // preload next sticker

      return doc;
    });
  }

  public saveStickers(docs: Document[]) {
    forEachReverse(docs, (doc, idx) => {
      doc = appDocsManager.saveDoc(doc);

      if(!doc) docs.splice(idx, 1);
      else docs[idx] = doc;
    });
  }

  public async getStickerSet(set: MyStickerSetInput, params: Partial<{
    overwrite: boolean,
    useCache: boolean,
    saveById: boolean
  }> = {}): Promise<MyMessagesStickerSet> {
    const id = set.id;
    if(this.getStickerSetPromises[id]) {
      return this.getStickerSetPromises[id];
    }

    return this.getStickerSetPromises[id] = new Promise(async(resolve) => {
      if(!params.overwrite) {
        // const perf = performance.now();
        const cachedSet = await this.storage.get(id);
        if(cachedSet && cachedSet.documents?.length && ((Date.now() - cachedSet.refreshTime) < CACHE_TIME || params.useCache)) {
          this.saveStickers(cachedSet.documents);
          resolve(cachedSet);
          delete this.getStickerSetPromises[id];
          // console.log('get sticker set from cache time', id, performance.now() - perf);
          return;
        }
      }

      try {
        const stickerSet = await apiManager.invokeApi('messages.getStickerSet', {
          stickerset: this.getStickerSetInput(set),
          hash: 0
        }) as MyMessagesStickerSet;
  
        const saveById = params.saveById ? id : stickerSet.set.id;
        this.saveStickerSet(stickerSet, saveById);
  
        resolve(stickerSet);
      } catch(err) {
        resolve(null);
      }
      
      delete this.getStickerSetPromises[id];
    });
  }

  public getAnimatedEmojiStickerSet() {
    return Promise.all([
      this.getStickerSet({id: EMOJI_SET_LOCAL_ID}, {saveById: true}),
      this.getStickerSet({id: EMOJI_ANIMATIONS_SET_LOCAL_ID}, {saveById: true}),
      this.getAnimatedEmojiSounds()
    ]).then(([emoji, animations]) => {
      return {emoji, animations};
    });
  }

  public getAnimatedEmojiSounds(overwrite?: boolean) {
    if(this.getAnimatedEmojiSoundsPromise && !overwrite) return this.getAnimatedEmojiSoundsPromise;
    const promise = this.getAnimatedEmojiSoundsPromise = Promise.resolve(apiManager.getAppConfig(overwrite)).then(appConfig => {
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
        
        const doc = appDocsManager.saveDoc({
          _: 'document',
          pFlags: {},
          flags: 0,
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
          dc_id: rootScope.config.this_dc,
          file_reference: bytes,
          mime_type: 'audio/ogg',
          size: 1
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

  public async getRecentStickers(): Promise<Modify<MessagesRecentStickers.messagesRecentStickers, {
    stickers: Document[]
  }>> {
    const res = await apiManager.invokeApiHashable({
      method: 'messages.getRecentStickers',
      processResult: (res) => {
        assumeType<MessagesRecentStickers.messagesRecentStickers>(res);

        this.saveStickers(res.stickers);
        return res;
      }
    });

    return res;
  }

  private cleanEmoji(emoji: string) {
    return emoji.replace(/\ufe0f/g, '').replace(/🏻|🏼|🏽|🏾|🏿/g, '');
  }

  public getAnimatedEmojiSticker(emoji: string, isAnimation?: boolean) {
    const stickerSet = this.storage.getFromCache(isAnimation ? EMOJI_ANIMATIONS_SET_LOCAL_ID : EMOJI_SET_LOCAL_ID);
    if(!stickerSet || !stickerSet.documents) return undefined;

    if(isAnimation) {
      if(['🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎'].includes(emoji)) {
        emoji = '❤️';
      }
    }

    emoji = this.cleanEmoji(emoji);
    const pack = stickerSet.packs.find(p => p.emoticon === emoji);
    return pack ? appDocsManager.getDoc(pack.documents[0]) : undefined;
  }

  public getAnimatedEmojiSoundDocument(emoji: string) {
    return this.sounds[this.cleanEmoji(emoji)];
  }

  public preloadAnimatedEmojiSticker(emoji: string, width?: number, height?: number) {
    const preloadEmojiPromise = this.getAnimatedEmojiStickerSet().then(() => {
      const doc = this.getAnimatedEmojiSticker(emoji);
      if(doc) {
        return appDocsManager.downloadDoc(doc)
        .then(async(blob) => {
          const mediaSize = mediaSizes.active.emojiSticker;
          const toneIndex = getEmojiToneIndex(emoji);
          const animation = await lottieLoader.loadAnimationWorker({
            container: undefined,
            animationData: blob,
            width: width ?? mediaSize.width,
            height: height ?? mediaSize.height,
            name: 'doc' + doc.id,
            autoplay: false,
            loop: false,
            toneIndex
          }, 'none');

          animation.addEventListener('firstFrame', () => {
            appDocsManager.saveLottiePreview(doc, animation.canvas, toneIndex);
            animation.remove();
          }, {once: true});
        });
      }
    });
    
    return Promise.all([
      preloadEmojiPromise,
      this.preloadAnimatedEmojiStickerAnimation(emoji)
    ]);
  }

  public preloadAnimatedEmojiStickerAnimation(emoji: string) {
    return this.getAnimatedEmojiStickerSet().then(() => {
      const doc = this.getAnimatedEmojiSticker(emoji, true);
      if(doc) {
        const soundDoc = this.getAnimatedEmojiSoundDocument(emoji);
        return Promise.all([
          appDocsManager.downloadDoc(doc),
          soundDoc ? appDocsManager.downloadDoc(soundDoc) : undefined
        ]);
      }
    });
  }
  
  public saveStickerSet(res: Omit<MessagesStickerSet.messagesStickerSet, '_'>, id: DocId) {
    //console.log('stickers save set', res);w

    const newSet: MessagesStickerSet = {
      _: 'messages.stickerSet',
      set: res.set,
      packs: res.packs,
      documents: res.documents as Document[]
    };
    
    let stickerSet = this.storage.getFromCache(id);
    if(stickerSet) {
      Object.assign(stickerSet, newSet);
    } else {
      stickerSet = this.storage.setToCache(id, newSet);
    }

    this.saveStickers(res.documents);
    
    //console.log('stickers wrote', this.stickerSets);
    const needSave = stickerSet.set.installed_date || LOCAL_IDS_SET.has(id as any);
    stickerSet.refreshTime = Date.now();
    this.storage.set({[id]: stickerSet}, !needSave);
  }

  public getStickerSetThumbDownloadOptions(stickerSet: StickerSet.stickerSet) {
    const thumb = stickerSet.thumbs.find(thumb => thumb._ === 'photoSize') as PhotoSize.photoSize;
    const dcId = stickerSet.thumb_dc_id;

    const isAnimated = stickerSet.pFlags?.animated;

    const input: InputFileLocation.inputStickerSetThumb = {
      _: 'inputStickerSetThumb',
      stickerset: this.getStickerSetInput(stickerSet),
      thumb_version: stickerSet.thumb_version
    };

    return {dcId, location: input, size: thumb.size, mimeType: isAnimated ? 'application/x-tgsticker' : 'image/webp'};
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
    if(set.id === EMOJI_SET_LOCAL_ID) {
      return {
        _: 'inputStickerSetAnimatedEmoji'
      };
    } else if(set.id === EMOJI_ANIMATIONS_SET_LOCAL_ID) {
      return {
        _: 'inputStickerSetAnimatedEmojiAnimations'
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
    const res = await apiManager.invokeApiHashable({
      method: 'messages.getFeaturedStickers',
      processResult: (res) => {
        assumeType<MessagesFeaturedStickers.messagesFeaturedStickers>(res);

        forEachReverse(res.sets, (covered, idx, arr) => {
          if(covered.set.pFlags.videos && !IS_WEBM_SUPPORTED) {
            arr.splice(idx, 1);
          }
        });

        res.sets.forEach(covered => {
          this.saveStickerSet({set: covered.set, documents: [], packs: []}, covered.set.id);
        });

        return res;
      }
    });

    return res.sets;
  }

  public async toggleStickerSet(set: StickerSet.stickerSet) {
    if(set.installed_date) {
      const res = await apiManager.invokeApi('messages.uninstallStickerSet', {
        stickerset: this.getStickerSetInput(set)
      });

      if(res) {
        delete set.installed_date;
        rootScope.dispatchEvent('stickers_deleted', set);
        this.storage.delete(set.id, true);
        return true;
      }
    } else {
      const res = await apiManager.invokeApi('messages.installStickerSet', {
        stickerset: this.getStickerSetInput(set),
        archived: false
      });

      if(res) {
        set.installed_date = Date.now() / 1000 | 0;
        rootScope.dispatchEvent('stickers_installed', set);
        return true;
      }
    }

    return false;
  }

  public async searchStickerSets(query: string, excludeFeatured = true) {
    const flags = excludeFeatured ? 1 : 0;
    const res = await apiManager.invokeApiHashable({
      method: 'messages.searchStickerSets', 
      params: {
        flags,
        exclude_featured: excludeFeatured || undefined,
        q: query
      },
      processResult: (res) => {
        assumeType<MessagesFoundStickerSets.messagesFoundStickerSets>(res);

        forEachReverse(res.sets, (covered, idx, arr) => {
          if(covered.set.pFlags.videos && !IS_WEBM_SUPPORTED) {
            arr.splice(idx, 1);
          }
        });

        res.sets.forEach(covered => {
          this.saveStickerSet({set: covered.set, documents: [], packs: []}, covered.set.id);
        });

        return res;
      }
    });

    const foundSaved: StickerSetCovered[] = [];
    const cache = this.storage.getCache();
    for(let id in cache) {
      const {set} = cache[id];

      if(set.title.toLowerCase().includes(query.toLowerCase()) && !res.sets.find(c => c.set.id === set.id)) {
        foundSaved.push({_: 'stickerSetCovered', set, cover: null});
      }
    }

    return res.sets.concat(foundSaved);
  }

  public getAllStickers() {
    return apiManager.invokeApiHashable({
      method: 'messages.getAllStickers', 
      processResult: (allStickers) => {
        assumeType<MessagesAllStickers.messagesAllStickers>(allStickers);

        forEachReverse(allStickers.sets, (stickerSet, idx, arr) => {
          if(stickerSet.pFlags.videos && !IS_WEBM_SUPPORTED) {
            arr.splice(idx, 1);
          }
        });

        return allStickers;
      }
    });
  }

  public preloadStickerSets() {
    return this.getAllStickers().then(allStickers => {
      return Promise.all((allStickers as MessagesAllStickers.messagesAllStickers).sets.map(set => this.getStickerSet(set, {useCache: true})));
    });
  }

  // TODO: detect "🤷" by "🤷‍♂️"
  public getStickersByEmoticon(emoticon: string, includeOurStickers = true) {
    emoticon = RichTextProcessor.fixEmoji(emoticon);
    if(this.getStickersByEmoticonsPromises[emoticon]) return this.getStickersByEmoticonsPromises[emoticon];

    return this.getStickersByEmoticonsPromises[emoticon] = Promise.all([
      apiManager.invokeApiHashable({
        method: 'messages.getStickers', 
        params: {
          emoticon
        },
        processResult: (stickers) => stickers
      }),
      includeOurStickers ? this.preloadStickerSets() : [],
      includeOurStickers ? this.getRecentStickers() : undefined
    ]).then(([messagesStickers, installedSets, recentStickers]) => {
      const foundStickers = (messagesStickers as MessagesStickers.messagesStickers).stickers.map(sticker => appDocsManager.saveDoc(sticker));
      const cachedStickersAnimated: Document.document[] = [], cachedStickersStatic: Document.document[] = [];

      //console.log('getStickersByEmoticon', messagesStickers, installedSets, recentStickers);

      const iteratePacks = (packs: StickerPack.stickerPack[]) => {
        for(const pack of packs) {
          const packEmoticon = RichTextProcessor.fixEmoji(pack.emoticon);
          if(packEmoticon.includes(emoticon)) {
            for(const docId of pack.documents) {
              const doc = appDocsManager.getDoc(docId);
              (doc.animated ? cachedStickersAnimated : cachedStickersStatic).push(doc);
            }
          }
        }
      };

      if(recentStickers) {
        iteratePacks(recentStickers.packs);
        const stickers = recentStickers.stickers;
        [cachedStickersAnimated, cachedStickersStatic].forEach(s => {
          s.sort((a, b) => stickers.indexOf(a) - stickers.indexOf(b));
        });
      }

      for(const set of installedSets) {
        iteratePacks(set.packs);
      }

      /* const entities = RichTextProcessor.parseEntities(emoticon);
      if(entities.length === 1) {
        [cachedStickersAnimated, cachedStickersStatic].forEach(s => {
          forEachReverse(s, (doc, idx) => {
            const docEmoticon = RichTextProcessor.fixEmoji(doc.stickerEmojiRaw);
            if(docEmoticon !== emoticon) {
              s.splice(idx, 1);
            }
          });
        });
      } */

      const stickers = [...new Set(cachedStickersAnimated.concat(cachedStickersStatic, foundStickers))]/* .filter(doc => !doc.animated) */;

      forEachReverse(stickers, (sticker, idx, arr) => {
        if(sticker.sticker === 3 && !IS_WEBM_SUPPORTED) {
          arr.splice(idx, 1);
        }
      });

      return stickers;
    });
  }

  public pushRecentSticker(doc: MyDocument) {
    const docEmoticon = RichTextProcessor.fixEmoji(doc.stickerEmojiRaw);
    for(const emoticon in this.getStickersByEmoticonsPromises) {
      const promise = this.getStickersByEmoticonsPromises[emoticon];
      promise.then(stickers => {
        const _doc = findAndSplice(stickers, _doc => _doc.id === doc.id);
        if(_doc) {
          stickers.unshift(_doc);
        } else if(emoticon.includes(docEmoticon)) {
          stickers.unshift(doc);
        }
      });
    }
  }
}

const appStickersManager = new AppStickersManager();
MOUNT_CLASS_TO.appStickersManager = appStickersManager;
export default appStickersManager;
