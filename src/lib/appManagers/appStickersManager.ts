/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { Document, InputFileLocation, InputStickerSet, MessagesAllStickers, MessagesFeaturedStickers, MessagesFoundStickerSets, MessagesRecentStickers, MessagesStickers, MessagesStickerSet, PhotoSize, StickerPack, StickerSet, StickerSetCovered } from '../../layer';
import { Modify } from '../../types';
import apiManager from '../mtproto/mtprotoworker';
import rootScope from '../rootScope';
import appDocsManager from './appDocsManager';
import AppStorage from '../storage';
import { MOUNT_CLASS_TO } from '../../config/debug';
import { forEachReverse } from '../../helpers/array';
import DATABASE_STATE from '../../config/databases/state';

const CACHE_TIME = 3600e3;

export type MyStickerSetInput = {
  id: string,
  access_hash?: string
};

export class AppStickersManager {
  private storage = new AppStorage<Record<string, MessagesStickerSet>, typeof DATABASE_STATE>(DATABASE_STATE, 'stickerSets');

  private getStickerSetPromises: {[setId: string]: Promise<MessagesStickerSet>} = {};
  private getStickersByEmoticonsPromises: {[emoticon: string]: Promise<Document[]>} = {};

  private greetingStickers: Document.document[];
  private getGreetingStickersTimeout: number;
  private getGreetingStickersPromise: Promise<void>;
  
  constructor() {
    this.getAnimatedEmojiStickerSet();

    rootScope.addMultipleEventsListeners({
      updateNewStickerSet: (update) => {
        this.saveStickerSet(update.stickerset, update.stickerset.set.id);
        rootScope.dispatchEvent('stickers_installed', update.stickerset.set);
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
  }> = {}): Promise<MessagesStickerSet> {
    const id = set.id;
    if(this.getStickerSetPromises[id]) {
      return this.getStickerSetPromises[id];
    }

    return this.getStickerSetPromises[id] = new Promise(async(resolve) => {
      if(!params.overwrite) {
        const cachedSet = await this.storage.get(id);
        if(cachedSet && cachedSet.documents?.length && ((Date.now() - cachedSet.refreshTime) < CACHE_TIME || params.useCache)) {
          this.saveStickers(cachedSet.documents);
          resolve(cachedSet);
          delete this.getStickerSetPromises[id];
          return;
        }
      }

      try {
        const stickerSet = await apiManager.invokeApi('messages.getStickerSet', {
          stickerset: this.getStickerSetInput(set)
        });
  
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
    return this.getStickerSet({id: 'emoji'}, {saveById: true});
  }

  public async getRecentStickers(): Promise<Modify<MessagesRecentStickers.messagesRecentStickers, {
    stickers: Document[]
  }>> {
    const res = await apiManager.invokeApiHashable('messages.getRecentStickers') as MessagesRecentStickers.messagesRecentStickers;

    this.saveStickers(res.stickers);

    return res;
  }

  public getAnimatedEmojiSticker(emoji: string) {
    const stickerSet = this.storage.getFromCache('emoji');
    if(!stickerSet || !stickerSet.documents) return undefined;

    emoji = emoji.replace(/\ufe0f/g, '').replace(/🏻|🏼|🏽|🏾|🏿/g, '');
    const pack = stickerSet.packs.find(p => p.emoticon === emoji);
    return pack ? appDocsManager.getDoc(pack.documents[0]) : undefined;
  }

  public preloadAnimatedEmojiSticker(emoji: string) {
    return this.getAnimatedEmojiStickerSet().then(() => {
      const doc = this.getAnimatedEmojiSticker(emoji);
      if(doc) {
        return appDocsManager.downloadDoc(doc);
      }
    });
  }
  
  public saveStickerSet(res: Omit<MessagesStickerSet.messagesStickerSet, '_'>, id: string) {
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
    const needSave = stickerSet.set.installed_date || id === 'emoji';
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
    if(set.id === 'emoji') {
      return {
        _: 'inputStickerSetAnimatedEmoji'
      };
    } else if(!set.access_hash) {
      return {
        _: 'inputStickerSetShortName',
        short_name: set.id
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
    const res = await apiManager.invokeApiHashable('messages.getFeaturedStickers') as MessagesFeaturedStickers.messagesFeaturedStickers;
    
    res.sets.forEach(covered => {
      this.saveStickerSet({set: covered.set, documents: [], packs: []}, covered.set.id);
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
    const res = await apiManager.invokeApiHashable('messages.searchStickerSets', {
      flags,
      exclude_featured: excludeFeatured || undefined,
      q: query
    }) as MessagesFoundStickerSets.messagesFoundStickerSets;

    res.sets.forEach(covered => {
      this.saveStickerSet({set: covered.set, documents: [], packs: []}, covered.set.id);
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
    return apiManager.invokeApiHashable('messages.getAllStickers');
  }

  public preloadStickerSets() {
    return this.getAllStickers().then(allStickers => {
      return Promise.all((allStickers as MessagesAllStickers.messagesAllStickers).sets.map(set => this.getStickerSet(set, {useCache: true})));
    });
  }

  public getStickersByEmoticon(emoticon: string, includeOurStickers = true) {
    if(this.getStickersByEmoticonsPromises[emoticon]) return this.getStickersByEmoticonsPromises[emoticon];

    return this.getStickersByEmoticonsPromises[emoticon] = Promise.all([
      apiManager.invokeApiHashable('messages.getStickers', {
        emoticon
      }),
      includeOurStickers ? this.preloadStickerSets() : [],
      includeOurStickers ? this.getRecentStickers().then(res => res.packs) : []
    ]).then(([messagesStickers, installedSets, recentStickers]) => {
      const foundStickers = (messagesStickers as MessagesStickers.messagesStickers).stickers.map(sticker => appDocsManager.saveDoc(sticker));
      const cachedStickersAnimated: Document.document[] = [], cachedStickersStatic: Document.document[] = [];

      //console.log('getStickersByEmoticon', messagesStickers, installedSets, recentStickers);

      const iteratePacks = (packs: StickerPack.stickerPack[]) => {
        for(const pack of packs) {
          if(pack.emoticon.includes(emoticon)) {
            for(const docId of pack.documents) {
              const doc = appDocsManager.getDoc(docId);
              (doc.animated ? cachedStickersAnimated : cachedStickersStatic).push(doc);
            }
          }
        }
      };

      iteratePacks(recentStickers);

      for(const set of installedSets) {
        iteratePacks(set.packs);
      }

      const stickers = [...new Set(cachedStickersAnimated.concat(cachedStickersStatic, foundStickers))]/* .filter(doc => !doc.animated) */;

      return stickers;
    });
  }
}

const appStickersManager = new AppStickersManager();
MOUNT_CLASS_TO.appStickersManager = appStickersManager;
export default appStickersManager;
