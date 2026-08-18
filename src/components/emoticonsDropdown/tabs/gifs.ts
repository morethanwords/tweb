import type AppGifsManager from '@appManagers/appGifsManager';
import GifsMasonry from '@components/gifsMasonry';
import {putPreloader} from '@components/putPreloader';
import {AppManagers} from '@lib/managers';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import EmoticonsTabC from '@components/emoticonsDropdown/tab';
import safeAssign from '@helpers/object/safeAssign';
import {i18n} from '@lib/langPack';
import {onCleanup} from 'solid-js';
import {Middleware} from '@helpers/middleware';
import createMiddleware from '@helpers/solid/createMiddleware';
import rootScope from '@lib/rootScope';
import {MyDocument} from '@appManagers/appDocsManager';

// * a query keeps its results (and the pages scrolled into them) for as long as the search
// * lasts, so going back to an earlier query is instant and costs no inline bot request
type GifsSearchResults = Awaited<ReturnType<AppGifsManager['searchGifs']>> & {query: string};

export default class GifsTab extends EmoticonsTabC<any, GifsSearchResults> {
  private searchCache: Map<string, MaybePromise<GifsSearchResults>>;

  constructor(options: {
    managers: AppManagers
  }) {
    super({
      managers: options.managers,
      noMenu: true,
      searchFetcher: (value) => {
        if(!value) {
          // * the cache lives for one search, exactly like tdesktop's cancelGifsSearch
          this.searchCache?.clear();
          return {documents: [], nextOffset: '', query: value};
        }

        return this.getSearchResults(value);
      },
      groupFetcher: (group) => {
        if(group?._ !== 'emojiGroup') return {documents: [], nextOffset: '', query: ''};
        return this.getSearchResults(group.emoticons.join(''));
      },
      // * only a value that still has to be asked for waits out the debounce - clearing the
      // * search and returning to an already fetched query both answer at once
      searchVerifyDebounce: (value) => {
        value = value.trim();
        return !!value && !this.searchCache?.has(value);
      },
      processSearchResult: async({data, searching, grouping}) => {
        if(!searching && !grouping) {
          return;
        }

        // * `data` is undefined until the first fetch resolves and again whenever one fails
        const gifs = data?.documents;
        if(!gifs?.length) {
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

          const {nextOffset} = data;
          if(!nextOffset) {
            return;
          }

          // prevent multiple requests
          data.nextOffset = undefined;

          this.managers.appGifsManager.searchGifs(data.query, nextOffset).then((result) => {
            // * this view is what the results were rendered into - once it is gone the page
            // * has nowhere to go, so put the offset back and let the next view ask again,
            // * otherwise the rebuilt view would carry on past a page it never got
            if(!middleware()) {
              data.nextOffset = nextOffset;
              return;
            }

            result.documents.forEach((doc) => masonry.add(doc));
            data.documents.push(...result.documents);
            data.nextOffset = result.nextOffset;
          }, () => {
            // * let a later scroll retry the page instead of ending the list here
            data.nextOffset = nextOffset;
          });
        };

        onCleanup(() => {
          this.scrollable.onAdditionalScroll = old;
        });

        return container;
      },
      searchNoLoader: true,
      searchPlaceholder: 'SearchGIFs',
      searchType: 'gifs',
      // * every keystroke is an inline bot query - firing one per character earns a
      // * multi-minute FLOOD_WAIT that freezes the whole panel on its last results.
      // * 400ms is what tdesktop waits (kSearchRequestDelay in gifs_list_widget.cpp)
      searchDebounceTime: 400
    });

    safeAssign(this, options);
    this.container.classList.add('gifs-padding');
    this.content.id = 'content-gifs';
  }

  private getSearchResults(query: string) {
    const cache = this.searchCache ??= new Map();
    const cached = cache.get(query);
    if(cached) {
      return cached;
    }

    // * the promise is cached too so the pending query is never requested twice, and it is
    // * swapped for the plain results afterwards - a repeat of the query then resolves
    // * synchronously and the search input skips its debounce for it
    const promise = this.managers.appGifsManager.searchGifs(query).then((result) => {
      const results: GifsSearchResults = {...result, query};
      // * the search may have been cancelled (dropping the cache) while this was in flight -
      // * results of a search that is over must not reappear in the next one
      if(cache.get(query) === promise) {
        cache.set(query, results);
      }

      return results;
    }, (err) => {
      cache.delete(query);
      throw err;
    });

    cache.set(query, promise);
    return promise;
  }

  private createMasonry(middleware: Middleware) {
    const gifsContainer = document.createElement('div');
    gifsContainer.classList.add('gifs-masonry');
    const detachClickEvent = attachClickEvent(gifsContainer, this.emoticonsDropdown.onMediaClick);
    const masonry = new GifsMasonry(gifsContainer, this.animationGroup, this.scrollable);

    middleware.onDestroy(() => {
      masonry.clear();
      detachClickEvent();
    });

    this.emoticonsDropdown.addLazyLoadQueueRepeat(masonry.lazyLoadQueue, masonry.processInvisibleDiv, middleware);
    return {masonry, container: gifsContainer};
  }

  public init() {
    super.init();

    const middleware = this.middlewareHelper.get();
    const {masonry, container} = this.createMasonry(middleware);
    this.categoriesContainer.append(container);
    const preloader = putPreloader(this.content, true);

    let rendered = 0;
    const onGifsUpdated = (gifs: MyDocument[]) => {
      masonry.update(gifs);
      rendered = gifs.length;
    };

    this.managers.appGifsManager.getGifs().then((docs) => {
      masonry.addBatch(docs);
      rendered = docs.length;
      preloader.remove();
    });

    const onGifsUpdatedPostponed = this.postponedEvent(onGifsUpdated);
    rootScope.addEventListener('gifs_updated', (gifs) => {
      // a shorter list means a gif was taken out of the saved ones — the user did that and has
      // to see it go; a list of the same length is the reorder that follows using one, which
      // waits for the panel to hide
      (gifs.length < rendered ? onGifsUpdated : onGifsUpdatedPostponed)(gifs);
    });

    this.attachHelpers({
      isGif: true
    });

    this.init = undefined;
  }
}
