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

import {ReferenceContext} from '../mtproto/referenceDatabase';
import {WebPage} from '../../layer';
import safeReplaceObject from '../../helpers/object/safeReplaceObject';
import {AppManager} from './manager';

const photoTypeSet = new Set(['photo', 'video', 'gif', 'document']);

type WebPageMessageKey = `${PeerId}_${number}`;

export class AppWebPagesManager extends AppManager {
  private webpages: {
    [webPageId: string]: WebPage
  } = {};
  private pendingWebPages: {
    [webPageId: string]: Set<WebPageMessageKey>
  } = {};

  protected after() {
    this.apiUpdatesManager.addMultipleEventsListeners({
      updateWebPage: (update) => {
        this.saveWebPage(update.webpage);
      },

      updateChannelWebPage: (update) => {
        this.saveWebPage(update.webpage);
      }
    });
  }

  public saveWebPage(apiWebPage: WebPage, messageKey?: WebPageMessageKey, mediaContext?: ReferenceContext) {
    if(apiWebPage._ === 'webPageNotModified' || apiWebPage._ === 'webPageEmpty') return;
    const {id} = apiWebPage;

    mediaContext ??= {
      type: 'webPage',
      url: apiWebPage.url
    };

    const oldWebPage = this.webpages[id];
    const isUpdated = oldWebPage &&
      oldWebPage._ === apiWebPage._ &&
      (oldWebPage as WebPage.webPage).hash !== (apiWebPage as WebPage.webPage).hash;
    let isMediaUpdated = false;

    if(apiWebPage._ === 'webPage') {
      if(apiWebPage.photo?._ === 'photo') {
        apiWebPage.photo = this.appPhotosManager.savePhoto(apiWebPage.photo, mediaContext);
      } else {
        delete apiWebPage.photo;
      }

      if(apiWebPage.document?._ === 'document') {
        apiWebPage.document = this.appDocsManager.saveDoc(apiWebPage.document, mediaContext);
      } else {
        if(apiWebPage.type === 'document') {
          delete apiWebPage.type;
        }

        delete apiWebPage.document;
      }

      if(oldWebPage?._ === apiWebPage._) {
        isMediaUpdated = oldWebPage.photo?.id !== apiWebPage.photo?.id ||
          oldWebPage.document?.id !== apiWebPage.document?.id;
      }

      const siteName = apiWebPage.site_name;
      const shortTitle = apiWebPage.title || apiWebPage.author || '';
      if(siteName && shortTitle === siteName) {
        delete apiWebPage.site_name;
      }

      for(const attribute of apiWebPage.attributes || []) {
        switch(attribute._) {
          case 'webPageAttributeStory': {
            const cache = this.appStoriesManager.getPeerStoriesCache(this.appPeersManager.getPeerId(attribute.peer));
            attribute.story = this.appStoriesManager.saveStoryItem(attribute.story, cache);
            break;
          }
        }
      }

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

    if(((!messageKey && isUpdated) || isMediaUpdated) && pendingSet !== undefined) {
      const msgs: {peerId: PeerId, mid: number, isScheduled: boolean}[] = [];
      pendingSet.forEach((value) => {
        const [peerId, mid, isScheduled] = value.split('_');
        msgs.push({
          peerId: peerId.toPeerId(),
          mid: +mid,
          isScheduled: !!isScheduled
        });
      });

      this.rootScope.dispatchEvent('webpage_updated', {
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

  public getCachedWebPage(id: WebPage.webPage['id']) {
    return this.webpages[id];
  }

  public getWebPage(url: string) {
    return this.apiManager.invokeApiHashable({
      method: 'messages.getWebPage',
      processResult: (messagesWebPage) => {
        this.appPeersManager.saveApiPeers(messagesWebPage);
        return this.saveWebPage(messagesWebPage.webpage);
      },
      params: {
        url
      }
    });
  }
}
