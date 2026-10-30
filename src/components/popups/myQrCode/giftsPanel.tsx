import {Accessor, createSignal, For, onCleanup, onMount, Show} from 'solid-js';
import {StarGift} from '@layer';
import {MyStarGift} from '@appManagers/appGiftsManager';
import {MyDocument} from '@appManagers/appDocsManager';
import {AppManagers} from '@lib/managers';
import I18n, {i18n} from '@lib/langPack';
import SuperStickerRenderer from '@components/emoticonsDropdown/tabs/SuperStickerRenderer';
import LazyLoadQueue from '@components/lazyLoadQueue';
import {StarGiftBackdrop} from '@components/stargifts/stargiftBackdrop';
import {PreloaderTsx} from '@components/putPreloader';
import {IconTsx} from '@components/iconTsx';
import {attachPickerGrid} from '@helpers/dom/attachListNavigation';
import styles from '@components/popups/myQrCode.module.scss';

const PAGE_SIZE = 30;
/** Scrolling this close to the end asks for the next page */
const NEXT_PAGE_MARGIN = 200;

export type ThemeGift = {
  gift: StarGift.starGiftUnique,
  /** How the owner names it, for a chat's gift */
  input: MyStarGift['input']
};

/** The server takes a unique gift that is neither refunded nor burned (`COLLECTIBLE_INVALID`) */
const isThemeGift = (item: MyStarGift) => item.raw._ === 'starGiftUnique' && !item.saved?.pFlags?.refunded && !item.raw.pFlags?.burned;

function GiftTile(props: {
  item: MyStarGift,
  selected: boolean,
  renderer: SuperStickerRenderer,
  onClick: () => void
}) {
  let sticker: HTMLDivElement;
  const attributes = props.item.collectibleAttributes;
  onMount(() => {
    props.renderer.renderSticker(props.item.sticker, sticker);
  });

  return (
    <button
      type="button"
      class={styles.giftTile}
      aria-pressed={props.selected}
      aria-label={(props.item.raw as StarGift.starGiftUnique).title}
      onClick={props.onClick}
    >
      <Show when={attributes}>
        <StarGiftBackdrop
          class={styles.giftBackdrop}
          small
          backdrop={attributes.backdrop}
          patternEmoji={attributes.pattern.document as MyDocument}
        />
      </Show>
      <div ref={sticker} class={styles.giftSticker} />
    </button>
  );
}

/**
 * The collectible gifts the owner has, shown or hidden: three to a row, paged as they scroll. One picked is the whole
 * theme. Nothing here asks for a gift that cannot be a theme.
 */
export function GiftsPanel(props: {
  managers: AppManagers,
  ownerId: PeerId,
  isSelf: boolean,
  /** The id of the gift on show */
  selectedId: Accessor<string | undefined>,
  onPick: (pick: ThemeGift) => void
}) {
  const {managers, ownerId} = props;
  const [items, setItems] = createSignal<MyStarGift[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  let scrollable: HTMLDivElement;
  let grid: HTMLDivElement;
  let next: string | undefined = '';
  let loading = false;
  let destroyed = false;

  const lazyLoadQueue = new LazyLoadQueue();
  let renderer: SuperStickerRenderer;
  onCleanup(() => {
    destroyed = true;
    renderer?.destroy();
    lazyLoadQueue.clear();
  });

  const loadNext = async() => {
    if(loading || loaded()) return;
    loading = true;
    try {
      // only the unique ones: everything else is left out by the request itself
      const page = await managers.appGiftsManager.getProfileGifts({
        peerId: ownerId,
        offset: next,
        limit: PAGE_SIZE,
        unlimited: false,
        limited: false,
        upgradable: false
      });
      if(destroyed) return;
      next = page.next;
      setItems((current) => current.concat(page.gifts.filter(isThemeGift)));
      if(!page.next) setLoaded(true);
    } catch{
      if(!destroyed) setLoaded(true);
    }

    loading = false;
    // a page that fills less than the sheet has to ask for the next one itself
    if(!destroyed && !loaded() && scrollable && scrollable.scrollHeight <= scrollable.clientHeight + NEXT_PAGE_MARGIN) loadNext();
  };

  onMount(() => {
    renderer = new SuperStickerRenderer({
      regularLazyLoadQueue: lazyLoadQueue,
      group: 'none',
      managers,
      intersectionObserverInit: {root: scrollable},
      visibleRenderOptions: {loop: false, play: false, width: 120, height: 120},
      withLock: false
    });
    const detach = attachPickerGrid(grid, '.' + styles.giftTile);
    onCleanup(detach);
    loadNext();
  });

  const onScroll = () => {
    if(scrollable.scrollTop + scrollable.clientHeight > scrollable.scrollHeight - NEXT_PAGE_MARGIN) loadNext();
  };

  return (
    <div ref={scrollable} class={styles.giftsScroll} onScroll={onScroll} data-sheet-scroll>
      <Show when={items().length || !loaded()} fallback={
        <div class={styles.giftsEmpty}>
          <IconTsx icon="gift_filled" class={styles.giftsEmptyIcon} />
          <div class={styles.giftsEmptyTitle}>{i18n('QRCode.NoGiftsTitle')}</div>
          <div class={styles.giftsEmptyInfo}>{i18n(props.isSelf ? 'QRCode.NoGiftsInfo' : 'QRCode.ChatNoCollectibles')}</div>
        </div>
      }>
        <div ref={grid} class={styles.gifts} role="group" aria-label={I18n.format('QRCode.Collectibles', true)}>
          <For each={items()}>
            {(item) => (
              <GiftTile
                item={item}
                renderer={renderer}
                selected={props.selectedId() === (item.raw as StarGift.starGiftUnique).id}
                onClick={() => props.onPick({gift: item.raw as StarGift.starGiftUnique, input: item.input})}
              />
            )}
          </For>
        </div>
        <Show when={!loaded()}>
          <PreloaderTsx class={styles.giftsPreloader} />
        </Show>
      </Show>
    </div>
  );
}
