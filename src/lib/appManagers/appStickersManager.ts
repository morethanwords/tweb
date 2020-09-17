import AppStorage from '../storage';
//import apiManager from '../mtproto/apiManager';
import apiManager from '../mtproto/mtprotoworker';
import appDocsManager from './appDocsManager';
import { $rootScope } from '../utils';
import { StickerSet, InputStickerSet, StickerSetCovered, MessagesRecentStickers, Document, InputFileLocation, MessagesStickerSet, PhotoSize } from '../../layer';
import { Modify } from '../../types';

class AppStickersManager {
  private stickerSets: {
    [stickerSetID: string]: MessagesStickerSet
  } = {};

  private saveSetsTimeout: number;

  private hashes: Partial<{
    featured: Partial<{hash: number, result: StickerSetCovered[]}>,
    search: {
      [query: string]: Partial<{
        hash: number, 
        result: StickerSetCovered[]
      }>
    }
  }> = {
    featured: {},
    search: {}
  };
  
  constructor() {
    AppStorage.get<AppStickersManager['stickerSets']>('stickerSets').then((sets) => {
      if(sets) {
        for(let id in sets) {
          let set = sets[id];
          this.saveStickers(set.documents);
        }

        this.stickerSets = sets;
      }

      //if(!this.stickerSets['emoji']) {
        this.getStickerSet({id: 'emoji', access_hash: ''}, {overwrite: true});
      //}
    });

    $rootScope.$on('apiUpdate', (e: CustomEvent) => {
      const update = e.detail;
      
      switch(update._) {
        case 'updateNewStickerSet': {
          this.saveStickerSet(update.stickerset, update.stickerset.set.id);
          $rootScope.$broadcast('stickers_installed', update.stickerset.set);
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

    const stickerSet = await apiManager.invokeApi('messages.getStickerSet', {
      stickerset: this.getStickerSetInput(set)
    });

    this.saveStickerSet(stickerSet, set.id);

    return stickerSet as any;
  }

  public async getRecentStickers(): Promise<Modify<MessagesRecentStickers.messagesRecentStickers, {
    stickers: Document[]
  }>> {
    const res = await apiManager.invokeApi('messages.getRecentStickers', {flags: 0, hash: 0}) as MessagesRecentStickers.messagesRecentStickers;

    if(res._ == 'messages.recentStickers') {
      this.saveStickers(res.stickers);
    }

    return res as any;
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
    this.saveSetsTimeout = setTimeout(() => {
      const savedSets: {[id: string]: MessagesStickerSet} = {};
      for(const id in this.stickerSets) {
        const set = this.stickerSets[id];
        if(set.set.installed_date || id == 'emoji') {
          savedSets[id] = set;
        }
      }

      AppStorage.set({
        stickerSets: savedSets
      });

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
    const res = await apiManager.invokeApi('messages.getFeaturedStickers', {
      hash: this.hashes.featured?.hash || 0
    });
    
    const hashed = this.hashes.featured ?? (this.hashes.featured = {});
    if(res._ != 'messages.featuredStickersNotModified') {
      hashed.hash = res.hash;
      hashed.result = res.sets;
    }

    hashed.result.forEach(covered => {
      this.saveStickerSet({set: covered.set, documents: [], packs: []}, covered.set.id);
    });

    return hashed.result;
  }

  public async toggleStickerSet(set: StickerSet.stickerSet) {
    if(set.installed_date) {
      const res = await apiManager.invokeApi('messages.uninstallStickerSet', {
        stickerset: this.getStickerSetInput(set)
      });

      if(res) {
        delete set.installed_date;
        $rootScope.$broadcast('stickers_deleted', set);
        return true;
      }
    } else {
      const res = await apiManager.invokeApi('messages.installStickerSet', {
        stickerset: this.getStickerSetInput(set),
        archived: false
      });

      if(res) {
        set.installed_date = Date.now() / 1000 | 0;
        $rootScope.$broadcast('stickers_installed', set);
        return true;
      }
    }

    return false;
  }

  public async searchStickerSets(query: string, excludeFeatured = true) {
    const flags = excludeFeatured ? 1 : 0;
    const res = await apiManager.invokeApi('messages.searchStickerSets', {
      flags,
      exclude_featured: excludeFeatured || undefined,
      q: query,
      hash: this.hashes.search[query]?.hash || 0
    });

    const hashed = this.hashes.search[query] ?? (this.hashes.search[query] = {});
    if(res._ != 'messages.foundStickerSetsNotModified') {
      hashed.hash = res.hash;
      hashed.result = res.sets;
    }

    hashed.result.forEach(covered => {
      this.saveStickerSet({set: covered.set, documents: [], packs: []}, covered.set.id);
    });

    const foundSaved: StickerSetCovered[] = [];
    for(let id in this.stickerSets) {
      const {set} = this.stickerSets[id];

      if(set.title.toLowerCase().includes(query.toLowerCase()) && !hashed.result.find(c => c.set.id == set.id)) {
        foundSaved.push({_: 'stickerSetCovered', set, cover: null});
      }
    }

    return hashed.result.concat(foundSaved);
  }

  public async cleanup() { // if logout
    await AppStorage.remove('stickerSets');
  }
}

const appStickersManager = new AppStickersManager();
// @ts-ignore
if(process.env.NODE_ENV != 'production') {
  (window as any).appStickersManager = appStickersManager;
}
export default appStickersManager;
