import AppStorage from '../storage';
import { MTDocument } from '../../components/wrappers';
//import apiManager from '../mtproto/apiManager';
import apiManager from '../mtproto/mtprotoworker';
import apiFileManager from '../mtproto/apiFileManager';
import appDocsManager from './appDocsManager';

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

class AppStickersManager {
  private documents: {
    [fileID: string]: MTDocument
  } = {};
  
  private stickerSets: {
    [stickerSetID: string]: MTStickerSetFull
  } = {};
  
  constructor() {
    AppStorage.get<{
      [stickerSetID: string]: MTStickerSetFull
    }>('stickerSets').then((sets) => {
      if(sets) {
        for(let id in sets) {
          let set = sets[id];
          set.documents.forEach(doc => {
            this.saveSticker(doc);
          });
        }

        this.stickerSets = sets;
      }

      if(!this.stickerSets['emoji']) {
        this.getStickerSet({id: 'emoji', access_hash: ''});
      }
    });
  } 
  
  public saveSticker(doc: MTDocument) {
    if(this.documents[doc.id]) return this.documents[doc.id];

    doc = appDocsManager.saveDoc(doc);
    this.documents[doc.id] = doc;

    return doc;
  }
  
  public getSticker(fileID: string) {
    return this.documents[fileID];
  }
  
  public async getStickerSet(set: {
    id: string,
    access_hash: string
  }) {
    if(this.stickerSets[set.id]) return this.stickerSets[set.id];
    
    let promise = apiManager.invokeApi('messages.getStickerSet', {
      stickerset: set.id == 'emoji' ? {
        _: 'inputStickerSetAnimatedEmoji'
      } : {
        _: 'inputStickerSetID',
        id: set.id,
        access_hash: set.access_hash
      }
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

  public getAnimatedEmojiSticker(emoji: string) {
    let stickerSet = this.stickerSets.emoji;

    return stickerSet.documents.find(doc => doc.attributes.find(attribute => attribute.alt == emoji));
  }
  
  public async saveStickerSet(res: {
    _: "messages.stickerSet",
    set: MTStickerSet,
    packs: any[],
    documents: MTDocument[]
  }, id: string) {
    //console.log('stickers save set', res);
    
    this.stickerSets[id] = {
      set: res.set,
      packs: res.packs,
      documents: res.documents
    };

    res.documents.forEach(this.saveSticker.bind(this));
    
    //console.log('stickers wrote', this.stickerSets);
    await AppStorage.set({
      stickerSets: this.stickerSets
    });
    
    /* AppStorage.get('stickerSets').then((sets: any) => {
      this.stickerSets = sets;
      console.log('stickers got', this.stickerSets);
    }); */
  }

  public getStickerSetThumb(stickerSet: MTStickerSet) {
    let thumb = stickerSet.thumb;
    let dcID = stickerSet.thumb_dc_id;

    let promise = apiFileManager.downloadSmallFile({
      _: 'inputStickerSetThumb',
      stickerset: {
        _: 'inputStickerSetID',
        id: stickerSet.id,
        access_hash: stickerSet.access_hash
      },
      volume_id: thumb.location.volume_id,
      local_id: thumb.location.local_id
    }, {dcID: dcID});

    return promise;
  }

  public async cleanup() { // if logout
    await AppStorage.remove('stickerSets');
  }
}

const appStickersManager = new AppStickersManager();
(window as any).appStickersManager = appStickersManager;
export default appStickersManager;
