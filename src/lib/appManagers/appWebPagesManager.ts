/*
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import {ReferenceContext} from '@lib/storages/references';
import {MessageMedia, WebPage} from '@layer';
import safeReplaceObject from '@helpers/object/safeReplaceObject';
import {AppManager} from '@appManagers/manager';
import findAndSplice from '@helpers/array/findAndSplice';

const photoTypeSet = new Set(['photo', 'video', 'gif', 'document']);
const WEB_PAGE_PREVIEW_CACHE_LIMIT = 100;
const WEB_PAGE_PREVIEW_CACHE_TTL = 5 * 60 * 1000;
const WEB_PAGE_PREVIEW_ERROR_CACHE_TTL = 5 * 1000;

type WebPageMessageKey = `${PeerId}_${number}${'' | '_s'}`;
type WebPagePreview = MessageMedia.messageMediaWebPage | undefined;
type WebPagePreviewCacheEntry = {
  expiresAt: number;
  promise: Promise<WebPagePreview>;
};

export class AppWebPagesManager extends AppManager {
  private webpages: {
    [webPageId: string]: WebPage
  } = {};
  private pendingWebPages: {
    [webPageId: string]: Set<WebPageMessageKey>
  } = {};
  private webPagePreviewCache = new Map<string, WebPagePreviewCacheEntry>();

  public clear = () => {
    this.webpages = {};
    this.pendingWebPages = {};
    this.webPagePreviewCache.clear();
  };

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

  private dispatchWebPageUpdated(id: WebPage.webPage['id'], pendingSet?: Set<WebPageMessageKey>) {
    const msgs: {peerId: PeerId, mid: number, isScheduled: boolean}[] = [];
    pendingSet?.forEach((value) => {
      const [peerId, mid, scheduledMarker] = value.split('_');
      msgs.push({
        peerId: +peerId as PeerId,
        mid: +mid,
        isScheduled: scheduledMarker === 's'
      });
    });

    this.rootScope.dispatchEvent('webpage_updated', {id, msgs});
  }

  public saveWebPage(apiWebPage: WebPage, messageKey?: WebPageMessageKey, mediaContext?: ReferenceContext) {
    if(!apiWebPage || apiWebPage._ === 'webPageNotModified') {
      return;
    }

    const {id} = apiWebPage;
    const oldWebPage = this.webpages[id];
    if(apiWebPage._ === 'webPageEmpty') {
      if(oldWebPage?._ !== 'webPagePending') return;

      if(!apiWebPage.url && oldWebPage.url) {
        apiWebPage = {...apiWebPage, url: oldWebPage.url};
      }

      safeReplaceObject(oldWebPage, apiWebPage);
      this.dispatchWebPageUpdated(id, this.pendingWebPages[id]);
      return oldWebPage as unknown as WebPage.webPageEmpty;
    }

    if(oldWebPage?._ === 'webPage' && apiWebPage._ !== oldWebPage._) {
      this.log.warn('ignore webpage update, type changed', oldWebPage, apiWebPage);
      return oldWebPage;
    }

    const isUpdated = oldWebPage &&
      (
        oldWebPage._ !== apiWebPage._ ||
        (oldWebPage as WebPage.webPage).hash !== (apiWebPage as WebPage.webPage).hash
      );
    let isMediaUpdated = false;

    mediaContext ??= {
      type: 'webPage',
      url: apiWebPage.url
    };

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
          case 'webPageAttributeStickerSet': {
            attribute.stickers = attribute.stickers.map((doc) => this.appDocsManager.saveDoc(doc, mediaContext)).filter(Boolean);
            break;
          }
          case 'webPageAttributeStarGiftCollection': {
            attribute.icons = attribute.icons.map((doc) => this.appDocsManager.saveDoc(doc, mediaContext)).filter(Boolean);
            break;
          }
        }
      }

      const cachedPage = apiWebPage.cached_page;
      if(cachedPage) {
        cachedPage.photos = cachedPage.photos?.map((photo) => {
          return this.appPhotosManager.savePhoto(photo, mediaContext);
        }).filter(Boolean);

        cachedPage.documents = cachedPage.documents?.map((doc) => {
          return this.appDocsManager.saveDoc(doc, mediaContext);
        }).filter(Boolean);

        if(apiWebPage.photo) {
          findAndSplice(cachedPage.photos, (photo) => photo.id === apiWebPage.photo.id);
          cachedPage.photos.push(apiWebPage.photo);
        }

        if(apiWebPage.document) {
          findAndSplice(cachedPage.documents, (doc) => doc.id === apiWebPage.document.id);
          cachedPage.documents.push(apiWebPage.document);
        }

        cachedPage.blocks.forEach((block) => {
          if('channel' in block) {
            this.appChatsManager.saveApiChats([block.channel]);
          }
        });
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

    if((!messageKey && isUpdated) || isMediaUpdated) {
      this.dispatchWebPageUpdated(id, pendingSet);
    }

    return apiWebPage;
  }

  public getMessageKeyForPendingWebPage(peerId: PeerId, mid: number, isScheduled?: boolean): WebPageMessageKey {
    return peerId + '_' + mid + (isScheduled ? '_s' : '') as any;
  }

  public deleteWebPageFromPending(webPage: WebPage, messageKey: WebPageMessageKey) {
    const id = (webPage as WebPage.webPage).id;
    if(!id) {
      return;
    }

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

  public getWebPagePreview(url: string) {
    const cached = this.webPagePreviewCache.get(url);
    if(cached) {
      if(cached.expiresAt > Date.now()) {
        this.webPagePreviewCache.delete(url);
        this.webPagePreviewCache.set(url, cached);
        return cached.promise;
      }

      this.webPagePreviewCache.delete(url);
    }

    const promise = this.apiManager.invokeApiSingle('messages.getWebPagePreview', {
      message: url
    }).then((preview) => {
      this.appPeersManager.saveApiPeers(preview);

      if(preview.media._ !== 'messageMediaWebPage') return;

      if(preview.media.webpage._ !== 'webPageNotModified' && !preview.media.webpage.url) {
        preview.media.webpage.url = url;
      }

      const webpage = this.saveWebPage(preview.media.webpage);
      if(webpage) preview.media.webpage = this.getCachedWebPage(webpage.id) || webpage;

      return preview.media;
    });
    const entry: WebPagePreviewCacheEntry = {
      expiresAt: Date.now() + WEB_PAGE_PREVIEW_CACHE_TTL,
      promise
    };

    promise.then(() => {
      entry.expiresAt = Date.now() + WEB_PAGE_PREVIEW_CACHE_TTL;
    }, () => {
      entry.expiresAt = Date.now() + WEB_PAGE_PREVIEW_ERROR_CACHE_TTL;
    });

    this.webPagePreviewCache.set(url, entry);
    if(this.webPagePreviewCache.size > WEB_PAGE_PREVIEW_CACHE_LIMIT) {
      this.webPagePreviewCache.delete(this.webPagePreviewCache.keys().next().value);
    }

    return promise;
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
