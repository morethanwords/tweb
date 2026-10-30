import {Accessor, createEffect, createMemo, createSignal, For, onCleanup, onMount, Show} from 'solid-js';
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
import {PreloaderTsx} from '@components/putPreloader';
import {IconTsx} from '@components/iconTsx';
import {attachPickerGrid} from '@helpers/dom/attachListNavigation';
import styles from '@components/popups/myQrCode.module.scss';

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
  // only the unique ones: everything else is left out by the request itself
  const [store, actions] = createProfileGiftsStore({
    peerId: ownerId,
    managers,
    initialFilters: {unlimited: false, limited: false, upgradable: false}
  });
  const items = createMemo(() => unwrap(store.items).filter(isThemeGift));
  // a page that does not come leaves the panel as it is: what came, or the empty state
  const [failed, setFailed] = createSignal(false);
  const done = () => store.loaded || failed();
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
      <Show when={items().length || !done()} fallback={
        <div class={styles.giftsEmpty}>
          <IconTsx icon="gift_filled" class={styles.giftsEmptyIcon} />
          <div class={styles.giftsEmptyTitle}>{i18n('QRCode.NoGiftsTitle')}</div>
          <div class={styles.giftsEmptyInfo}>{i18n(props.isSelf ? 'QRCode.NoGiftsInfo' : 'QRCode.ChatNoCollectibles')}</div>
        </div>
      }>
        <div ref={grid} class={styles.gifts} role="group" aria-label={I18n.format('StarGiftCategoryCollectibles', true)}>
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
        <Show when={!done()}>
          <PreloaderTsx class={styles.giftsPreloader} />
        </Show>
      </Show>
    </div>
  );
}
