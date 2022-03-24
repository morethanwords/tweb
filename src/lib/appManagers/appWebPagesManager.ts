/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 * 
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import appPhotosManager from "./appPhotosManager";
import appDocsManager from "./appDocsManager";
import { RichTextProcessor } from "../richtextprocessor";
import { ReferenceContext } from "../mtproto/referenceDatabase";
import rootScope from "../rootScope";
import { WebPage } from "../../layer";
import { MOUNT_CLASS_TO } from "../../config/debug";
import safeReplaceObject from "../../helpers/object/safeReplaceObject";
import limitSymbols from "../../helpers/string/limitSymbols";

const photoTypeSet = new Set(['photo', 'video', 'gif', 'document']);

type WebPageMessageKey = `${PeerId}_${number}`;

export class AppWebPagesManager {
  private webpages: {
    [webPageId: string]: WebPage
  } = {};
  private pendingWebPages: {
    [webPageId: string]: Set<WebPageMessageKey>
  } = {};
  
  constructor() {
    rootScope.addMultipleEventsListeners({
      updateWebPage: (update) => {
        this.saveWebPage(update.webpage);
      }
    });
  }
  
  public saveWebPage(apiWebPage: WebPage, messageKey?: WebPageMessageKey, mediaContext?: ReferenceContext) {
    if(apiWebPage._ === 'webPageNotModified') return;
    const {id} = apiWebPage;

    const oldWebPage = this.webpages[id];
    const isUpdated = oldWebPage && 
      oldWebPage._ === apiWebPage._ && 
      (oldWebPage as WebPage.webPage).hash === (oldWebPage as WebPage.webPage).hash;

    if(apiWebPage._ === 'webPage') {
      if(apiWebPage.photo?._ === 'photo') {
        apiWebPage.photo = appPhotosManager.savePhoto(apiWebPage.photo, mediaContext);
      } else {
        delete apiWebPage.photo;
      }
  
      if(apiWebPage.document?._ === 'document') {
        apiWebPage.document = appDocsManager.saveDoc(apiWebPage.document, mediaContext);
      } else {
        if(apiWebPage.type === 'document') {
          delete apiWebPage.type;
        }
  
        delete apiWebPage.document;
      }

      const siteName = apiWebPage.site_name;
      let shortTitle = apiWebPage.title || apiWebPage.author || siteName || '';
      if(siteName && shortTitle === siteName) {
        delete apiWebPage.site_name;
      }

      shortTitle = limitSymbols(shortTitle, 80, 100);

      apiWebPage.rTitle = RichTextProcessor.wrapRichText(shortTitle, {noLinks: true, noLinebreaks: true});
      let contextHashtag = '';
      if(siteName === 'GitHub') {
        const matches = apiWebPage.url.match(/(https?:\/\/github\.com\/[^\/]+\/[^\/]+)/);
        if(matches) {
          contextHashtag = matches[0] + '/issues/{1}';
        }
      }

      // delete apiWebPage.description
      const shortDescriptionText = limitSymbols(apiWebPage.description || '', 150, 180);
      apiWebPage.rDescription = RichTextProcessor.wrapRichText(shortDescriptionText, {
        contextSite: siteName || 'external',
        contextHashtag: contextHashtag
      });

      if(!photoTypeSet.has(apiWebPage.type) &&
        !apiWebPage.description &&
        apiWebPage.photo) {
        apiWebPage.type = 'photo';
      }
    }
    
    let pendingSet = this.pendingWebPages[id];
    if(messageKey) {
      if(!pendingSet) pendingSet = this.pendingWebPages[id] = new Set();
      pendingSet.add(messageKey);
    }
    
    if(oldWebPage === undefined) {
      this.webpages[id] = apiWebPage;
    } else {
      safeReplaceObject(oldWebPage, apiWebPage);
    }
    
    if(!messageKey && pendingSet !== undefined && isUpdated) {
      const msgs: {peerId: PeerId, mid: number, isScheduled: boolean}[] = [];
      pendingSet.forEach((value) => {
        const [peerId, mid, isScheduled] = value.split('_');
        msgs.push({
          peerId: peerId.toPeerId(), 
          mid: +mid, 
          isScheduled: !!isScheduled
        });
      });

      rootScope.dispatchEvent('webpage_updated', {
        id,
        msgs
      });
    }

    return apiWebPage;
  }

  public getMessageKeyForPendingWebPage(peerId: PeerId, mid: number, isScheduled?: boolean): WebPageMessageKey {
    return peerId + '_' + mid + (isScheduled ? '_s' : '') as any;
  }

  public deleteWebPageFromPending(webPage: WebPage, messageKey: WebPageMessageKey) {
    const id = (webPage as WebPage.webPage).id;
    if(!id) return;

    const set = this.pendingWebPages[id];
    if(set && set.has(messageKey)) {
      set.delete(messageKey);

      if(!set.size) {
        delete this.pendingWebPages[id];
      }
    }
  }

  public getWebPage(id: WebPage.webPage['id']) {
    return this.webpages[id];
  }
}

const appWebPagesManager = new AppWebPagesManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appWebPagesManager = appWebPagesManager);
export default appWebPagesManager;
