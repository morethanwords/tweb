import AppStorage from '../storage';
//import apiManager from '../mtproto/apiManager';
import apiManager from '../mtproto/mtprotoworker';
import apiFileManager from '../mtproto/apiFileManager';
import appDocsManager from './appDocsManager';
import { MTDocument } from '../../types';

export type MTStickerSet = {
  _: 'stickerSet',
  flags: number,
  archived?: true,
  official?: true,
  masks?: true,
  animated?: true,
  installed_date?: number,
  id: string, // long
  access_hash: string, // long,
  title: string,
  short_name: string, // Short name of stickerset to use in tg://addstickers?set=short_name
  thumb?: {
    _: 'photoSize',
    type: 'm',
    location: {
      _: string,
      volume_id: string,
      local_id: number
    },
    w: number,
    h: number,
    size: number
  },
  pFlags: {
    animated?: boolean
  }
  thumb_dc_id?: number,
  count: number,
  hash: number
};

export type MTStickerSetFull = {
  set: MTStickerSet,
  packs: any[],
  documents: MTDocument[]
};

export type MTStickerSetCovered = {
  _: 'stickerSetCovered',
  set: MTStickerSet,
  cover: MTDocument
};

export type MTStickerSetMultiCovered = {
  _: 'stickerSetMultiCovered',
  set: MTStickerSet,
  covers: MTDocument[]
};

class AppStickersManager {
  private documents: {
    [fileID: string]: MTDocument
  } = {};
  
  private stickerSets: {
    [stickerSetID: string]: MTStickerSetFull
  } = {};

  private saveSetsTimeout: number;

  private hashes: Partial<{
    featured: Partial<{hash: number, result: (MTStickerSetCovered | MTStickerSetMultiCovered)[]}>,
    search: {
      [query: string]: Partial<{
        hash: number, 
        result: (MTStickerSetCovered | MTStickerSetMultiCovered)[]
      }>
    }
  }> = {
    featured: {},
    search: {}
  };
  
  constructor() {
    AppStorage.get<{
      [stickerSetID: string]: MTStickerSetFull
    }>('stickerSets').then((sets) => {
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
  }
  
  public saveSticker(doc: MTDocument) {
    if(this.documents[doc.id]) return this.documents[doc.id];

    doc = appDocsManager.saveDoc(doc);
    this.documents[doc.id] = doc;

    return doc;
  }

  public saveStickers(docs: MTDocument[]) {
    docs.forEach((doc, idx) => {
      docs[idx] = this.saveSticker(doc);
    });
  }
  
  public getSticker(fileID: string) {
    return this.documents[fileID];
  }
  
  public async getStickerSet(set: {
    id: string,
    access_hash: string
  }, params: Partial<{
    overwrite: boolean
  }> = {}) {
    if(this.stickerSets[set.id] && !params.overwrite && this.stickerSets[set.id].documents?.length) return this.stickerSets[set.id];
    
    let promise = apiManager.invokeApi('messages.getStickerSet', {
      stickerset: this.getStickerSetInput(set)
    });
    
    let res = await promise;
    let stickerSet: {
      _: "messages.stickerSet",
      set: MTStickerSet,
      packs: any[],
      documents: MTDocument[]
    } = res as any;

    this.saveStickerSet(stickerSet, set.id);

    return stickerSet;
  }

  public async getRecentStickers() {
    let res: {
      _: string,
      hash: number,
      packs: any[],
      stickers: MTDocument[],
      dates: number[]
    } = await apiManager.invokeApi('messages.getRecentStickers', {flags: 0, hash: 0});

    this.saveStickers(res.stickers);

    return res;
  }

  public getAnimatedEmojiSticker(emoji: string) {
    let stickerSet = this.stickerSets.emoji;

    emoji = emoji.replace(/\ufe0f/g, '').replace(/🏻|🏼|🏽|🏾|🏿/g, '');
    return stickerSet.documents.find(doc => doc.stickerEmojiRaw == emoji);
  }
  
  public saveStickerSet(res: {
    //_: "messages.stickerSet",
    set: MTStickerSet,
    packs: any[],
    documents: MTDocument[]
  }, id: string) {
    //console.log('stickers save set', res);w

    const newSet = {
      set: res.set,
      packs: res.packs,
      documents: res.documents
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
      const savedSets: {[id: string]: MTStickerSetFull} = {};
      for(const id in this.stickerSets) {
        const set = this.stickerSets[id];
        if(set.set.installed_date) {
          savedSets[id] = set;
        }
      }

      AppStorage.set({
        stickerSets: savedSets
      });

      this.saveSetsTimeout = 0;
    }, 100);
  }

  public getStickerSetThumb(stickerSet: MTStickerSet) {
    const thumb = stickerSet.thumb;
    const dcID = stickerSet.thumb_dc_id;

    const isAnimated = stickerSet.pFlags?.animated;

    const promise = apiFileManager.downloadFile(dcID, {
      _: 'inputStickerSetThumb',
      stickerset: this.getStickerSetInput(stickerSet),
      volume_id: thumb.location.volume_id,
      local_id: thumb.location.local_id
    }, thumb.size, {
      stickerType: isAnimated ? 2 : 1,
      mimeType: isAnimated ? "application/x-tgsticker" : 'image/webp'
    });

    return promise;
  }

  public getStickerSetInput(set: {id: string, access_hash: string}) {
    return set.id == 'emoji' ? {
      _: 'inputStickerSetAnimatedEmoji'
    } : {
      _: 'inputStickerSetID',
      id: set.id,
      access_hash: set.access_hash
    };
  }

  public async getFeaturedStickers() {
    const res = (await apiManager.invokeApi('messages.getFeaturedStickers', {
      hash: this.hashes.featured?.hash || 0
    })) as {
      _: 'messages.featuredStickers',
      unread: string[],
      count: number,
      hash: number,
      sets: (MTStickerSetMultiCovered | MTStickerSetCovered)[]
    } | {
      _: 'messages.featuredStickersNotModified',
      count: number
    };
    
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

  public async toggleStickerSet(set: MTStickerSet) {
    if(set.installed_date) {
      const res = await apiManager.invokeApi('messages.uninstallStickerSet', {
        stickerset: this.getStickerSetInput(set)
      });

      if(res) {
        delete set.installed_date;
        return true;
      }
    } else {
      const res = await apiManager.invokeApi('messages.installStickerSet', {
        stickerset: this.getStickerSetInput(set),
        archived: false
      });

      if(res) {
        set.installed_date = Date.now() / 1000 | 0;
        return true;
      }
    }

    return false;
  }

  public async searchStickerSets(query: string, excludeFeatured = true) {
    const flags = excludeFeatured ? 1 : 0;
    const res = await apiManager.invokeApi('messages.searchStickerSets', {
      flags,
      exclude_featured: excludeFeatured,
      q: query,
      hash: this.hashes.search[query]?.hash || 0
    }) as {
      _: 'messages.foundStickerSets',
      hash: number,
      sets: Array<MTStickerSetCovered | MTStickerSetMultiCovered>
    } | {
      _: 'messages.foundStickerSetsNotModified'
    };

    const hashed = this.hashes.search[query] ?? (this.hashes.search[query] = {});
    if(res._ != 'messages.foundStickerSetsNotModified') {
      hashed.hash = res.hash;
      hashed.result = res.sets;
    }

    hashed.result.forEach(covered => {
      this.saveStickerSet({set: covered.set, documents: [], packs: []}, covered.set.id);
    });

    const foundSaved: MTStickerSetCovered[] = [];
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
(window as any).appStickersManager = appStickersManager;
export default appStickersManager;
