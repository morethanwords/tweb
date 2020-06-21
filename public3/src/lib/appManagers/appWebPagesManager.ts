import { $rootScope, safeReplaceObject, copy } from "../utils";
import appPhotosManager from "./appPhotosManager";
import appDocsManager from "./appDocsManager";
import { RichTextProcessor } from "../richtextprocessor";

class AppWebPagesManager {
  webpages: any = {};
  pendingWebPages: any = {};
  
  constructor() {
    $rootScope.$on('apiUpdate', (e: CustomEvent) => {
      let update = e.detail;

      switch(update._) {
        case 'updateWebPage':
          this.saveWebPage(update.webpage);
          break;
      }
    });
  }
  
  public saveWebPage(apiWebPage: any, messageID?: number, mediaContext?: any) {
    if(apiWebPage.photo && apiWebPage.photo._ === 'photo') {
      //appPhotosManager.savePhoto(apiWebPage.photo, mediaContext);
      apiWebPage.photo = appPhotosManager.savePhoto(apiWebPage.photo, mediaContext);
    } else {
      delete apiWebPage.photo;
    }

    if(apiWebPage.document && apiWebPage.document._ === 'document') {
      apiWebPage.document = appDocsManager.saveDoc(apiWebPage.document, mediaContext); // warning 11.04.2020
    } else {
      if(apiWebPage.type == 'document') {
        delete apiWebPage.type;
      }

      delete apiWebPage.document;
    }
    
    var siteName = apiWebPage.site_name;
    var shortTitle = apiWebPage.title || apiWebPage.author || siteName || '';
    if(siteName && shortTitle == siteName) {
      delete apiWebPage.site_name;
    }

    if(shortTitle.length > 100) {
      shortTitle = shortTitle.substr(0, 80) + '...';
    }

    apiWebPage.rTitle = RichTextProcessor.wrapRichText(shortTitle, {noLinks: true, noLinebreaks: true});
    var contextHashtag = '';
    if(siteName == 'GitHub') {
      var matches = apiWebPage.url.match(/(https?:\/\/github\.com\/[^\/]+\/[^\/]+)/);
      if(matches) {
        contextHashtag = matches[0] + '/issues/{1}';
      }
    }

    // delete apiWebPage.description
    var shortDescriptionText = (apiWebPage.description || '');
    if(shortDescriptionText.length > 180) {
      shortDescriptionText = shortDescriptionText.substr(0, 150).replace(/(\n|\s)+$/, '') + '...';
    }
    apiWebPage.rDescription = RichTextProcessor.wrapRichText(shortDescriptionText, {
      contextSite: siteName || 'external',
      contextHashtag: contextHashtag
    });
    
    if(apiWebPage.type != 'photo' &&
    apiWebPage.type != 'video' &&
    apiWebPage.type != 'gif' &&
    apiWebPage.type != 'document' &&
    !apiWebPage.description &&
    apiWebPage.photo) {
      apiWebPage.type = 'photo';
    }
    
    if(messageID) {
      if(this.pendingWebPages[apiWebPage.id] === undefined) {
        this.pendingWebPages[apiWebPage.id] = {};
      }

      this.pendingWebPages[apiWebPage.id][messageID] = true;
      this.webpages[apiWebPage.id] = apiWebPage;
    }
    
    if(this.webpages[apiWebPage.id] === undefined) {
      this.webpages[apiWebPage.id] = apiWebPage;
    } else {
      safeReplaceObject(this.webpages[apiWebPage.id], apiWebPage);
    }
    
    if(!messageID && this.pendingWebPages[apiWebPage.id] !== undefined) {
      var msgs = [];
      for(let msgID in this.pendingWebPages[apiWebPage.id]) {
        msgs.push(msgID);
      }

      $rootScope.$broadcast('webpage_updated', {
        id: apiWebPage.id,
        msgs: msgs
      });
    }
  }

  public getWebPage(id: string) {
    return this.webpages[id];
  }
}

export default new AppWebPagesManager();
