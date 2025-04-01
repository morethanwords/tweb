import {For, onCleanup, onMount} from 'solid-js';
import {MyStarGift} from '../lib/appManagers/appGiftsManager';
import {StarsStar} from './popups/stars';
import {AvatarNewTsx} from './avatarNew';
import getPeerId from '../lib/appManagers/utils/peers/getPeerId';
import {i18n} from '../lib/langPack';
import LazyLoadQueue from './lazyLoadQueue';
import SuperStickerRenderer from './emoticonsDropdown/tabs/SuperStickerRenderer';
import rootScope from '../lib/rootScope';
import ListenerSetter from '../helpers/listenerSetter';

function StarGiftGridItem(props: {
  item: MyStarGift,
  view: 'profile' | 'list'
  onClick?: () => void
  renderer: SuperStickerRenderer
}) {
  let stickerRef!: HTMLDivElement;

  onMount(() => {
    props.renderer.renderSticker(props.item.sticker, stickerRef);
    props.renderer.observeAnimated(stickerRef);
  })

  return (
    <div
      class={`star-gifts-grid-item view-${props.view}`}
      onClick={props.onClick}
    >
      <div
        class="star-gifts-grid-item-sticker"
        ref={stickerRef}
      />

      {props.item.raw._ === 'starGift' && (
        <div class="star-gifts-grid-item-price">
          {/* todo: huge performance hit */}
          {/* {props.view === 'list' && (
            <Sparkles mode='button' isDiv />
          )} */}
          <StarsStar />
          <span class="star-gifts-grid-item-price-value">
            {props.item.raw.stars}
          </span>
        </div>
      )}

      {props.view === 'profile' && (
        <div class="star-gifts-grid-item-from">
          {props.item.saved.from_id ? (
            <AvatarNewTsx
              peerId={getPeerId(props.item.saved.from_id)}
              size={20}
            />
          ) : (
            <div class="star-gifts-grid-item-anonymous">
              <img src="/assets/img/anon_paid_reaction.png" alt="Anonymous" />
            </div>
          )}
        </div>
      )}

      {(() => {
        const gift = props.item.raw;
        if(gift._ !== 'starGift') return null;

        if(props.view === 'list' && gift.availability_remains === 0) {
          return (
            <div class="star-gifts-grid-item-badge soldout">
              <div class="star-gifts-grid-item-badge-text">
                {i18n('StarGiftSoldOutBadge')}
              </div>
            </div>
          )
        }

        return props.item.raw.availability_total && (
          <div class="star-gifts-grid-item-badge">
            <div class="star-gifts-grid-item-badge-text">
              {i18n('StarGiftLimitedBadge')}
            </div>
          </div>
        )
      })()}
    </div>
  );
}

export function StarGiftsGrid(props: {
  items: MyStarGift[],
  view: 'profile' | 'list'
  onClick?: (item: MyStarGift) => void
  scrollParent: HTMLElement
}) {
  const lazyLoadQueue = new LazyLoadQueue();
  const stickerRenderer = new SuperStickerRenderer({
    regularLazyLoadQueue: lazyLoadQueue,
    group: 'none',
    managers: rootScope.managers,
    intersectionObserverInit: {root: props.scrollParent},
    visibleRenderOptions: {loop: false, width: 80, height: 80},
    withLock: false
  });

  onCleanup(() => {
    stickerRenderer.destroy();
    lazyLoadQueue.clear();
  });

  return (
    <div class="star-gifts-grid">
      <For each={props.items}>
        {(item) => (
          <StarGiftGridItem
            item={item}
            view={props.view}
            onClick={() => props.onClick?.(item)}
            renderer={stickerRenderer}
          />
        )}
      </For>
    </div>
  )
}
