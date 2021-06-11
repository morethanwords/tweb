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
import { safeReplaceObject } from "../../helpers/object";
import { limitSymbols } from "../../helpers/string";

export class AppWebPagesManager {
  private webpages: any = {};
  private pendingWebPages: {
    [webPageId: string]: {
      [mid: string]: true
    }
  } = {};
  
  constructor() {
    rootScope.addMultipleEventsListeners({
      updateWebPage: (update) => {
        this.saveWebPage(update.webpage);
      }
    });
  }
  
  public saveWebPage(apiWebPage: any, mid?: number, mediaContext?: ReferenceContext) {
    if(apiWebPage.photo && apiWebPage.photo._ === 'photo') {
      //appPhotosManager.savePhoto(apiWebPage.photo, mediaContext);
      apiWebPage.photo = appPhotosManager.savePhoto(apiWebPage.photo, mediaContext);
    } else {
      delete apiWebPage.photo;
    }

    if(apiWebPage.document && apiWebPage.document._ === 'document') {
      apiWebPage.document = appDocsManager.saveDoc(apiWebPage.document, mediaContext); // warning 11.04.2020
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
    
    if(apiWebPage.type !== 'photo' &&
      apiWebPage.type !== 'video' &&
      apiWebPage.type !== 'gif' &&
      apiWebPage.type !== 'document' &&
      !apiWebPage.description &&
      apiWebPage.photo) {
      apiWebPage.type = 'photo';
    }
    
    if(mid) {
      if(this.pendingWebPages[apiWebPage.id] === undefined) {
        this.pendingWebPages[apiWebPage.id] = {};
      }

      this.pendingWebPages[apiWebPage.id][mid] = true;
    }
    
    if(this.webpages[apiWebPage.id] === undefined) {
      this.webpages[apiWebPage.id] = apiWebPage;
    } else {
      safeReplaceObject(this.webpages[apiWebPage.id], apiWebPage);
    }
    
    if(!mid && this.pendingWebPages[apiWebPage.id] !== undefined) {
      const msgs: number[] = [];
      for(const msgId in this.pendingWebPages[apiWebPage.id]) {
        msgs.push(+msgId);
      }

      rootScope.dispatchEvent('webpage_updated', {
        id: apiWebPage.id,
        msgs
      });
    }

    return apiWebPage;
  }

  public deleteWebPageFromPending(webPage: any, mid: number) {
    const id = webPage.id;
    if(this.pendingWebPages[id] && this.pendingWebPages[id][mid]) {
      delete this.pendingWebPages[id][mid];

      if(!Object.keys(this.pendingWebPages[id]).length) {
        delete this.pendingWebPages[id];
      }
    }
  }

  public getWebPage(id: string) {
    return this.webpages[id];
  }
}

export default new AppWebPagesManager();
