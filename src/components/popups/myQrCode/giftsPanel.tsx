import {Accessor, createEffect, createMemo, createResource, createSignal, For, onCleanup, onMount, Show} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {StarGift} from '@layer';
import {MyStarGift} from '@appManagers/appGiftsManager';
import {MyDocument} from '@appManagers/appDocsManager';
import {AppManagers} from '@lib/managers';
import I18n, {i18n} from '@lib/langPack';
import SuperStickerRenderer from '@components/emoticonsDropdown/tabs/SuperStickerRenderer';
import {StarGiftBackdrop} from '@components/stargifts/stargiftBackdrop';
import {createStarGiftsRenderer} from '@components/stargifts/stargiftsGrid';
import {createProfileGiftsStore} from '@components/stargifts/profileStore';
import wrapSticker from '@components/wrappers/sticker';
import {IconTsx} from '@components/iconTsx';
import liteMode from '@helpers/liteMode';
import {getMiddleware} from '@helpers/middleware';
import {attachPickerGrid} from '@helpers/dom/attachListNavigation';
import styles from '@components/popups/myQrCode.module.scss';

/** Scrolling this close to the end asks for the next page */
const NEXT_PAGE_MARGIN = 200;
/** The grid's padding and the gap between its tiles */
const GIFTS_PAD = 8;
/** The sheet of an owner with no gifts (`QrShareView.EMPTY_H`) */
export const GIFTS_EMPTY_HEIGHT = 286;
/** The dog of the empty state: the first sticker of this set (`QrShareView.DOG_SET`) */
const EMPTY_STICKER_SET = 'Redo_edc21keMa';
const EMPTY_STICKER_SIZE = 99;

export type ThemeGift = {
  gift: StarGift.starGiftUnique,
  /** How the owner names it, for a chat's gift */
  input: MyStarGift['input']
};

export type GiftsLayout = {count: number, done: boolean};

/** A row of tiles: as high as a third of the sheet, whatever their width */
export const giftRowHeight = (sheetWidth: number) => (sheetWidth - 4 * GIFTS_PAD) / 3;

/** The sheet's height for a short list, as on Android: one row up to three gifts, the empty state for none */
export function giftsSheetHeight(layout: GiftsLayout | undefined, sheetWidth: number) {
  if(!layout?.done || layout.count > 3) return;
  return layout.count ? giftRowHeight(sheetWidth) + 2 * GIFTS_PAD : GIFTS_EMPTY_HEIGHT;
}

/** The server takes a unique gift that is neither refunded nor burned (`COLLECTIBLE_INVALID`) */
const isThemeGift = (item: MyStarGift) => item.raw._ === 'starGiftUnique' && !item.saved?.pFlags?.refunded && !item.raw.pFlags?.burned;
const giftId = (item: MyStarGift) => (item.raw as StarGift.starGiftUnique).id;

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

/** "No gifts yet": the dog of the set Android takes it from, the gift icon until it has come */
function GiftsEmpty(props: {managers: AppManagers, isSelf: boolean, onBrowse?: () => void}) {
  let dog: HTMLDivElement;
  const [dogShown, setDogShown] = createSignal(false);
  const helper = getMiddleware();
  onCleanup(() => helper.destroy());
  // taken once: after `destroy` the helper hands out a fresh middleware, which would read as alive
  const middleware = helper.get();
  onMount(async() => {
    try {
      const set = await props.managers.appStickersManager.getStickerSet(EMPTY_STICKER_SET);
      const doc = set?.documents?.[0] as MyDocument;
      if(!doc || !middleware()) return;
      const {render} = await wrapSticker({
        doc,
        div: dog,
        middleware,
        width: EMPTY_STICKER_SIZE,
        height: EMPTY_STICKER_SIZE,
        play: liteMode.isAvailable('stickers_panel'),
        loop: true,
        // watched as any sticker is: it stops while its panel is hidden
        group: '',
        managers: props.managers
      });
      await render;
      if(middleware()) setDogShown(true);
    } catch{}
  });

  return (
    <div class={styles.giftsEmpty} style={{height: GIFTS_EMPTY_HEIGHT + 'px'}}>
      <div class={styles.giftsEmptyArt}>
        <div ref={dog} class={styles.giftsEmptyDog} aria-hidden="true" />
        <Show when={!dogShown()}>
          <IconTsx icon="gift_filled" class={styles.giftsEmptyIcon} />
        </Show>
      </div>
      <div class={styles.giftsEmptyTitle}>{i18n('QRCode.NoGiftsTitle')}</div>
      <div class={styles.giftsEmptyInfo}>{i18n(props.isSelf ? 'QRCode.NoGiftsInfo' : 'QRCode.ChatNoCollectibles')}</div>
      <Show when={props.onBrowse}>
        <button type="button" class={styles.giftsBrowse} onClick={() => props.onBrowse()}>
          {i18n('QRCode.BrowseGifts')}
        </button>
      </Show>
    </div>
  );
}

/**
 * The collectible gifts the owner has, shown or hidden, paged as they scroll: three to a row, and one or two at the end
 * of the list share the row (as the profile's gifts do). One picked is the whole theme. The theme's own gift stands
 * first while the pages loaded so far do not hold it. Nothing here asks for a gift that cannot be a theme.
 */
export function GiftsPanel(props: {
  managers: AppManagers,
  ownerId: PeerId,
  isSelf: boolean,
  /** The gift on show */
  selected: Accessor<StarGift.starGiftUnique | undefined>,
  /** The sheet's width: a row is a third of it high */
  width: Accessor<number>,
  onPick: (pick: ThemeGift) => void,
  /** The own profile's: the gift store, where collectibles come from */
  onBrowse?: () => void,
  /** How many there are, once they are all known: the sheet shrinks for a few */
  onLayout?: (layout: GiftsLayout) => void
}) {
  const {managers, ownerId} = props;
  // only the unique ones: everything else is left out by the request itself
  const [store, actions] = createProfileGiftsStore({
    peerId: ownerId,
    managers,
    initialFilters: {unlimited: false, limited: false, upgradable: false}
  });
  // a page that does not come leaves the panel as it is: what came, or the empty state
  const [failed, setFailed] = createSignal(false);
  const done = () => store.loaded || failed();

  const loaded = createMemo(() => unwrap(store.items).filter(isThemeGift));
  // the gift on show that the pages so far do not hold, wrapped as the list's are
  const missing = () => {
    const gift = props.selected();
    return gift && !loaded().some((item) => giftId(item) === gift.id) ? gift : undefined;
  };
  const [missingItem] = createResource(missing, (gift) => managers.appGiftsManager.wrapGift(gift));
  const items = createMemo(() => {
    const pinned = missingItem();
    return pinned && giftId(pinned) === missing()?.id ? [pinned, ...loaded()] : loaded();
  });
  const columns = () => done() && items().length && items().length < 3 ? items().length : 3;

  createEffect(() => props.onLayout?.({count: items().length, done: done()}));

  let scrollable: HTMLDivElement;
  let grid: HTMLDivElement;
  let renderer: SuperStickerRenderer;

  const loadNext = () => {
    if(!failed()) actions.loadNext().catch(() => setFailed(true));
  };

  onMount(() => {
    renderer = createStarGiftsRenderer({managers, scrollParent: scrollable, autoplay: false});
    onCleanup(attachPickerGrid(grid, '.' + styles.giftTile));
    loadNext();
  });

  // a page that fills less than the sheet has to ask for the next one itself
  createEffect(() => {
    if(!store.items.length || store.loading || done()) return;
    if(scrollable.scrollHeight <= scrollable.clientHeight + NEXT_PAGE_MARGIN) loadNext();
  });

  const onScroll = () => {
    if(scrollable.scrollTop + scrollable.clientHeight > scrollable.scrollHeight - NEXT_PAGE_MARGIN) loadNext();
  };

  return (
    <div ref={scrollable} class={styles.giftsScroll} onScroll={onScroll} data-sheet-scroll>
      <Show when={items().length || !done()} fallback={<GiftsEmpty managers={managers} isSelf={props.isSelf} onBrowse={props.onBrowse} />}>
        <div
          ref={grid}
          class={styles.gifts}
          role="group"
          aria-label={I18n.format('StarGiftCategoryCollectibles', true)}
          style={{
            'grid-template-columns': `repeat(${columns()}, minmax(0, 1fr))`,
            'grid-auto-rows': giftRowHeight(props.width()) + 'px'
          }}
        >
          <For each={items()}>
            {(item) => (
              <GiftTile
                item={item}
                renderer={renderer}
                selected={props.selected()?.id === giftId(item)}
                onClick={() => props.onPick({gift: item.raw as StarGift.starGiftUnique, input: item.input})}
              />
            )}
          </For>
        </div>
        <Show when={!items().length}>
          <div class={styles.giftsLoading}>{i18n('QRCode.LoadingGifts')}</div>
        </Show>
      </Show>
    </div>
  );
}
