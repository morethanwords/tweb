/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type AppGifsManager from '../../../lib/appManagers/appGifsManager';
import {EMOTICONSSTICKERGROUP} from '..';
import GifsMasonry from '../../gifsMasonry';
import {putPreloader} from '../../putPreloader';
import {AppManagers} from '../../../lib/appManagers/managers';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import EmoticonsTabC from '../tab';
import safeAssign from '../../../helpers/object/safeAssign';
import {i18n} from '../../../lib/langPack';
import {onCleanup} from 'solid-js';
import {Middleware} from '../../../helpers/middleware';
import createMiddleware from '../../../helpers/solid/createMiddleware';
import rootScope from '../../../lib/rootScope';

export default class GifsTab extends EmoticonsTabC<any, Awaited<ReturnType<AppGifsManager['searchGifs']>>> {
  private query: string;

  constructor(options: {
    managers: AppManagers
  }) {
    super({
      managers: options.managers,
      noMenu: true,
      searchFetcher: async(value) => {
        if(!value) return {documents: [], nextOffset: ''};
        return this.managers.appGifsManager.searchGifs(this.query = value);
      },
      groupFetcher: async(group) => {
        if(group?._ !== 'emojiGroup') return {documents: [], nextOffset: ''};
        return this.managers.appGifsManager.searchGifs(this.query = group.emoticons.join(''));
      },
      processSearchResult: async({data: {documents: gifs, nextOffset}, searching, grouping}) => {
        if(!gifs || (!searching && !grouping)) {
          return;
        }

        if(!gifs.length) {
          const span = i18n('NoGIFsFound');
          span.classList.add('emoticons-not-found');
          return span;
        }

        const middleware = createMiddleware().get();
        const container = this.categoriesContainer.cloneNode(false) as HTMLElement;
        const {masonry, container: gifsContainer} = this.createMasonry(middleware);
        gifs.forEach((doc) => masonry.add(doc));
        container.append(gifsContainer);

        const old = this.scrollable.onAdditionalScroll;
        this.scrollable.onAdditionalScroll = () => {
          old?.();

          if(!nextOffset) {
            return;
          }

          this.managers.appGifsManager.searchGifs(this.query, nextOffset).then(({documents, nextOffset: newNextOffset}) => {
            if(!middleware()) {
              return;
            }

            documents.forEach((doc) => masonry.add(doc));
            nextOffset = newNextOffset;
          });

          // prevent multiple requests
          nextOffset = undefined;
        };

        onCleanup(() => {
          this.scrollable.onAdditionalScroll = old;
        });

        return container;
      },
      searchNoLoader: true,
      searchPlaceholder: 'SearchGIFs',
      searchType: 'gifs'
    });

    safeAssign(this, options);
    this.container.classList.add('gifs-padding');
    this.content.id = 'content-gifs';
  }

  private createMasonry(middleware: Middleware) {
    const gifsContainer = document.createElement('div');
    gifsContainer.classList.add('gifs-masonry');
    const detachClickEvent = attachClickEvent(gifsContainer, this.emoticonsDropdown.onMediaClick);
    const masonry = new GifsMasonry(gifsContainer, EMOTICONSSTICKERGROUP, this.scrollable);

    middleware.onDestroy(() => {
      masonry.clear();
      detachClickEvent();
    });

    this.emoticonsDropdown.addLazyLoadQueueRepeat(masonry.lazyLoadQueue, masonry.processInvisibleDiv, middleware);
    return {masonry, container: gifsContainer};
  }

  public init() {
    const middleware = this.middlewareHelper.get();
    const {masonry, container} = this.createMasonry(middleware);
    this.categoriesContainer.append(container);
    const preloader = putPreloader(this.content, true);

    this.managers.appGifsManager.getGifs().then((docs) => {
      masonry.addBatch(docs);
      preloader.remove();
    });

    rootScope.addEventListener('gifs_updated', (gifs) => {
      masonry.update(gifs);
    });

    this.attachHelpers({
      isGif: true
    });

    this.init = undefined;
  }
}
