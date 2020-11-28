import { Document, InputFileLocation, InputStickerSet, MessagesAllStickers, MessagesFeaturedStickers, MessagesFoundStickerSets, MessagesRecentStickers, MessagesStickers, MessagesStickerSet, PhotoSize, StickerPack, StickerSet, StickerSetCovered } from '../../layer';
import { Modify } from '../../types';
import apiManager from '../mtproto/mtprotoworker';
import { MOUNT_CLASS_TO } from '../mtproto/mtproto_config';
import rootScope from '../rootScope';
import appDocsManager from './appDocsManager';
import appStateManager from './appStateManager';

// TODO: если пак будет сохранён и потом обновлён, то недостающие стикеры не подгрузит

export class AppStickersManager {
  private stickerSets: {
    [stickerSetID: string]: MessagesStickerSet
  } = {};

  private saveSetsTimeout: number;

  private getStickerSetPromises: {[setID: string]: Promise<MessagesStickerSet>} = {};
  private getStickersByEmoticonsPromises: {[emoticon: string]: Promise<Document[]>} = {};
  
  constructor() {
    appStateManager.getState().then(({stickerSets}) => {
      if(stickerSets) {
        for(let id in stickerSets) {
          let set = stickerSets[id];
          this.saveStickers(set.documents);
        }

        this.stickerSets = stickerSets;
      }

      //if(!this.stickerSets['emoji']) {
        this.getStickerSet({id: 'emoji', access_hash: ''}, {overwrite: true});
      //}
    });

    rootScope.on('apiUpdate', (e) => {
      const update = e.detail;
      
      switch(update._) {
        case 'updateNewStickerSet': {
          this.saveStickerSet(update.stickerset, update.stickerset.set.id);
          rootScope.broadcast('stickers_installed', update.stickerset.set);
          break;
        }
      }
    });
  }

  public saveStickers(docs: Document[]) {
    docs.forEachReverse((doc, idx) => {
      doc = appDocsManager.saveDoc(doc);

      if(!doc) docs.splice(idx, 1);
      else docs[idx] = doc;
    });
  }

  public async getStickerSet(set: {
    id: string,
    access_hash: string
  }, params: Partial<{
    overwrite: boolean
  }> = {}): Promise<MessagesStickerSet> {
    if(this.stickerSets[set.id] && !params.overwrite && this.stickerSets[set.id].documents?.length) return this.stickerSets[set.id];

    if(this.getStickerSetPromises[set.id]) {
      return this.getStickerSetPromises[set.id];
    }

    const promise = this.getStickerSetPromises[set.id] = apiManager.invokeApi('messages.getStickerSet', {
      stickerset: this.getStickerSetInput(set)
    });
    
    const stickerSet = await promise;
    delete this.getStickerSetPromises[set.id];
    this.saveStickerSet(stickerSet, set.id);

    return stickerSet;
  }

  public async getRecentStickers(): Promise<Modify<MessagesRecentStickers.messagesRecentStickers, {
    stickers: Document[]
  }>> {
    const res = await apiManager.invokeApiHashable('messages.getRecentStickers') as MessagesRecentStickers.messagesRecentStickers;

    this.saveStickers(res.stickers);

    return res;
  }

  public getAnimatedEmojiSticker(emoji: string) {
    let stickerSet = this.stickerSets.emoji;
    if(!stickerSet || !stickerSet.documents) return undefined;

    emoji = emoji.replace(/\ufe0f/g, '').replace(/🏻|🏼|🏽|🏾|🏿/g, '');
    return stickerSet.documents.find(doc => (doc as Document.document).stickerEmojiRaw == emoji);
  }
  
  public saveStickerSet(res: Omit<MessagesStickerSet.messagesStickerSet, '_'>, id: string) {
    //console.log('stickers save set', res);w

    const newSet: MessagesStickerSet = {
      _: 'messages.stickerSet',
      set: res.set,
      packs: res.packs,
      documents: res.documents as Document[]
    };
    
    if(this.stickerSets[id]) {
      Object.assign(this.stickerSets[id], newSet);
    } else {
      this.stickerSets[id] = newSet;
    }

    this.saveStickers(res.documents);
    
    //console.log('stickers wrote', this.stickerSets);
    if(this.saveSetsTimeout) return;
    this.saveSetsTimeout = window.setTimeout(() => {
      const savedSets: {[id: string]: MessagesStickerSet} = {};
      for(const id in this.stickerSets) {
        const set = this.stickerSets[id];
        if(set.set.installed_date || id == 'emoji') {
          savedSets[id] = set;
        }
      }

      appStateManager.pushToState('stickerSets', savedSets);
      appStateManager.saveState();

      this.saveSetsTimeout = 0;
    }, 100);
  }

  public getStickerSetThumbDownloadOptions(stickerSet: StickerSet.stickerSet) {
    const thumb = stickerSet.thumb as PhotoSize.photoSize;
    const dcID = stickerSet.thumb_dc_id;

    const isAnimated = stickerSet.pFlags?.animated;

    const input: InputFileLocation.inputStickerSetThumb = {
      _: 'inputStickerSetThumb',
      stickerset: this.getStickerSetInput(stickerSet),
      volume_id: thumb.location.volume_id,
      local_id: thumb.location.local_id
    };

    return {dcID, location: input, size: thumb.size, mimeType: isAnimated ? "application/x-tgsticker" : 'image/webp'};
  }

  /* public getStickerSetThumbURL(stickerSet: MTStickerSet) {
    const thumb = stickerSet.thumb;
    const dcID = stickerSet.thumb_dc_id;

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

  public getStickerSetInput(set: {id: string, access_hash: string}): InputStickerSet {
    return set.id == 'emoji' ? {
      _: 'inputStickerSetAnimatedEmoji'
    } : {
      _: 'inputStickerSetID',
      id: set.id,
      access_hash: set.access_hash
    };
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
        rootScope.broadcast('stickers_deleted', set);
        return true;
      }
    } else {
      const res = await apiManager.invokeApi('messages.installStickerSet', {
        stickerset: this.getStickerSetInput(set),
        archived: false
      });

      if(res) {
        set.installed_date = Date.now() / 1000 | 0;
        rootScope.broadcast('stickers_installed', set);
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
    for(let id in this.stickerSets) {
      const {set} = this.stickerSets[id];

      if(set.title.toLowerCase().includes(query.toLowerCase()) && !res.sets.find(c => c.set.id == set.id)) {
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
      return Promise.all((allStickers as MessagesAllStickers.messagesAllStickers).sets.map(set => this.getStickerSet(set)));
    });
  }

  public getStickersByEmoticon(emoticon: string) {
    if(this.getStickersByEmoticonsPromises[emoticon]) return this.getStickersByEmoticonsPromises[emoticon];

    return this.getStickersByEmoticonsPromises[emoticon] = Promise.all([
      apiManager.invokeApiHashable('messages.getStickers', {
        emoticon
      }),
      this.preloadStickerSets(),
      this.getRecentStickers()
    ]).then(([messagesStickers, installedSets, recentStickers]) => {
      const foundStickers = (messagesStickers as MessagesStickers.messagesStickers).stickers.map(sticker => appDocsManager.saveDoc(sticker));
      const cachedStickersAnimated: Document.document[] = [], cachedStickersStatic: Document.document[] = [];

      //console.log('getStickersByEmoticon', messagesStickers, installedSets, recentStickers);

      const iteratePacks = (packs: StickerPack.stickerPack[]) => {
        for(const pack of packs) {
          if(pack.emoticon.includes(emoticon)) {
            for(const docID of pack.documents) {
              const doc = appDocsManager.getDoc(docID);
              (doc.animated ? cachedStickersAnimated : cachedStickersStatic).push(doc);
            }
          }
        }
      };

      iteratePacks(recentStickers.packs);

      for(const set of installedSets) {
        iteratePacks(set.packs);
      }

      const stickers = [...new Set(cachedStickersAnimated.concat(cachedStickersStatic, foundStickers))];

      return stickers;
    });
  }
}

const appStickersManager = new AppStickersManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appStickersManager = appStickersManager);
export default appStickersManager;
