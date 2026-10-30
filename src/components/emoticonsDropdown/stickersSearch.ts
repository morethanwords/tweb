import type {MyDocument} from '@appManagers/appDocsManager';
import type {ReadingManagers} from '@lib/managers';
import pause from '@helpers/schedulers/pause';

// * kSearchRequestDelay of tdesktop's stickers_list_widget.cpp: the server is asked once typing pauses
const SERVER_SEARCH_DELAY = 400;
// * kPreloadOfficialPages there: the next page is asked for while the end is this many screens away
const PRELOAD_SCREENS = 4;

export type StickersSearch = ReturnType<typeof createStickersSearch>;

/**
 * Sticker search the way the official clients run it (tdesktop's StickersListWidget, iOS's SearchStickers):
 * the user's own stickers for the emoji the query stands for come at once, the server's search follows
 * once typing pauses, and its later pages as the results are scrolled toward their end. A sticker comes
 * once, wherever it was found first — `shown` are those already on the screen. Its pages come after
 * waits, so `managers` are the session's.
 */
export default function createStickersSearch(managers: ReadingManagers, query: string, shown: MyDocument[] = []) {
  const shownIds: Set<DocId> = new Set(shown.map((doc) => doc.id));
  const take = (stickers: MyDocument[]) => stickers.filter((doc) => !shownIds.has(doc.id) && !!shownIds.add(doc.id));

  // * undefined once the server has nothing more
  let nextOffset = 0;
  // * the last page asked for did not come: only a scroll asks for it again
  let failed = false;
  let loading = false, destroyed = false;
  let observer: IntersectionObserver, disarm: () => void;

  /**
   * The server's next stickers, without what came already: pages on until one brings a sticker not shown
   * yet (one of only those, or of WebM a browser cannot play, says nothing about the next) or there are no
   * more. Nothing while a page is on its way or once all came.
   */
  const more = (): Promise<MyDocument[]> => {
    if(loading || destroyed || nextOffset === undefined) {
      return;
    }

    loading = true;
    failed = false;
    // * a query typed on before the pause is never asked for
    return (nextOffset ? Promise.resolve() : pause(SERVER_SEARCH_DELAY)).then(async() => {
      let stickers: MyDocument[] = [];
      while(!stickers.length && !destroyed && nextOffset !== undefined) {
        const page = await managers.appStickersManager.searchStickersOnServer(query, nextOffset);
        nextOffset = page.nextOffset;
        stickers = take(page.stickers);
      }

      return stickers;
    }).catch(() => {
      // * the offset stays: a later scroll asks for the page again
      failed = true;
      return [] as MyDocument[];
    }).finally(() => {
      loading = false;
    });
  };

  /**
   * Hands the server's pages to `onStickers` as they come: the first right away, each next one while
   * `sentinel`, placed after the results, is within a few screens of the end of `root`; `onEnd` once the
   * server has nothing more.
   */
  const paginate = (
    sentinel: HTMLElement,
    root: HTMLElement,
    onStickers: (stickers: MyDocument[]) => MaybePromise<void>,
    onEnd?: () => void
  ) => {
    // * still near the end: observing anew makes the observer say so again
    const rearm = () => {
      disarm?.();
      disarm = undefined;
      if(!destroyed) {
        observer.unobserve(sentinel);
        observer.observe(sentinel);
      }
    };

    const load = () => {
      more()?.then(async(stickers) => {
        if(destroyed) {
          return;
        }

        if(stickers.length) {
          await onStickers(stickers);
        }

        if(destroyed) {
          return;
        }

        if(nextOffset === undefined) {
          onEnd?.();
          return;
        }

        // * a page that did not come is asked for again on a scroll, as tdesktop's
        // checkPaginateSearchStickers does, never in a loop of failures; the scroll is caught on its way
        // down, since the element scrolling may be inside `root` and the event does not bubble
        if(failed) {
          root.addEventListener('scroll', rearm, {once: true, passive: true, capture: true});
          disarm = () => root.removeEventListener('scroll', rearm, {capture: true});
        } else {
          rearm();
        }
      });
    };

    observer = new IntersectionObserver((entries) => {
      if(entries[entries.length - 1].isIntersecting) {
        load();
      }
    }, {root, rootMargin: `0px 0px ${PRELOAD_SCREENS * 100}% 0px`});

    if(nextOffset === 0) {
      load();
    }

    observer.observe(sentinel);
  };

  return {
    query,
    /** The user's own stickers for the query: they come first */
    local: () => managers.appStickersManager.searchStickers(query).then(take),
    /**
     * What to show first: the user's own stickers, or with none of those the server's first page —
     * whether anything is found at all is then the server's to say, unless its page did not come (`failed`)
     */
    first: (own: MyDocument[]): Promise<MyDocument[]> => own.length ? Promise.resolve(own) : (more() || Promise.resolve([])),
    more,
    /** The last page asked for did not come: nothing came is then no answer, `paginate` asks again */
    failed: () => failed,
    paginate,
    destroy: () => {
      destroyed = true;
      observer?.disconnect();
      disarm?.();
    }
  };
}
