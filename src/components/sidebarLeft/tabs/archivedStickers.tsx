import {Component, For, Show, createSignal, onCleanup} from 'solid-js';
import {StickerSet} from '@layer';
import rootScope from '@lib/rootScope';
import {i18n} from '@lib/langPack';
import cancelEvent from '@helpers/dom/cancelEvent';
import classNames from '@helpers/string/classNames';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {getStickerSetInputByStickerSet} from '@lib/appManagers/utils/stickers/getStickerSetInput';
import Button from '@components/buttonTsx';
import LazyLoadQueue from '@components/lazyLoadQueue';
import showStickersPopup from '@components/popups/stickers';
import Section from '@components/section';
import StickerSetRow from '@components/stickerSetRow';
import {SearchEmpty} from '@components/searchStatus';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppArchivedStickersTab} from '@components/solidJsTabs/tabs';

/**
 * The sticker sets the user has archived — by hand, or by the server to make room for new ones — page by page
 * as the list is scrolled (Android's ArchivedStickersActivity, tdesktop's archived section). Each can be
 * added back from here, and archived again; a click opens the set.
 */
const ArchivedStickers: Component = () => {
  const [tab] = useSuperTab<typeof AppArchivedStickersTab>();
  const promiseCollector = usePromiseCollector();
  const lazyLoadQueue = new LazyLoadQueue();
  // * thumbnails still waiting off screen are let go with the tab
  onCleanup(() => lazyLoadQueue.clear());
  const [sets, setSets] = createSignal<StickerSet.stickerSet[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  // * out of the archive now, whether from here or anywhere else
  const [added, setAdded] = createSignal<ReadonlySet<StickerSet.stickerSet['id']>>(new Set());

  const setAddedState = (id: StickerSet.stickerSet['id'], isAdded: boolean) => {
    const ids = new Set(added());
    isAdded ? ids.add(id) : ids.delete(id);
    setAdded(ids);
  };

  subscribeOn(rootScope)('stickers_installed', (set) => setAddedState(set.id, true));
  subscribeOn(rootScope)('stickers_deleted', (set) => setAddedState(set.id, false));

  // * a page that comes after the tab closed is dropped, and asks for none after it
  const middleware = tab.middlewareHelper.get();
  let loading = false;
  const load = () => {
    if(loading) {
      return;
    }

    loading = true;
    const loadedSets = sets();
    const offsetId = loadedSets[loadedSets.length - 1]?.id;
    return tab.managers.appStickersManager.getArchivedStickers(offsetId).then((archived) => {
      loading = false;
      if(!middleware()) {
        return;
      }

      const known = new Set(loadedSets.map((set) => set.id));
      const fresh = archived.sets.filter((set) => !known.has(set.id));
      setSets([...loadedSets, ...fresh]);
      setLoaded(true);

      // * a page with nothing new is the end of the archive; with the end still in reach — a screen the
      // page did not fill — the next one is asked for at once
      if(!fresh.length) {
        tab.scrollable.onScrolledBottom = null;
      } else {
        tab.scrollable.checkForTriggers();
      }
    }, () => {
      // * a page that failed is asked for again on the next scroll to the end
      loading = false;
    });
  };

  tab.scrollable.onScrolledBottom = load;
  promiseCollector.collect(load());

  const renderAction = (set: StickerSet.stickerSet) => {
    const isAdded = () => added().has(set.id);
    return (
      <Button
        class={classNames('btn-primary btn-color-primary btn-control-small', isAdded() && 'active')}
        text={isAdded() ? 'Stickers.SearchAdded' : 'Stickers.SearchAdd'}
        onClick={(event) => {
          cancelEvent(event);
          const {appStickersManager} = tab.managers;
          return isAdded() ? appStickersManager.archiveStickerSet(set) : appStickersManager.toggleStickerSet(set);
        }}
      />
    );
  };

  return (
    <Show
      when={sets().length}
      fallback={
        <Show when={loaded()}>
          <SearchEmpty>{i18n('ArchivedStickersEmpty')}</SearchEmpty>
        </Show>
      }
    >
      <Section caption="ArchivedStickersInfo">
        <For each={sets()}>
          {(set) => (
            <StickerSetRow
              set={set}
              isEmoji={false}
              lazyLoadQueue={lazyLoadQueue}
              action={() => renderAction(set)}
              onClick={() => showStickersPopup(getStickerSetInputByStickerSet(set))}
            />
          )}
        </For>
      </Section>
    </Show>
  );
};

export default ArchivedStickers;
