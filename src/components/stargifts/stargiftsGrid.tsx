import {For, onCleanup, onMount} from 'solid-js';
import {MyStarGift} from '../../lib/appManagers/appGiftsManager';
import {StarsStar} from '../popups/stars';
import {AvatarNewTsx} from '../avatarNew';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import {i18n} from '../../lib/langPack';
import LazyLoadQueue from '../lazyLoadQueue';
import SuperStickerRenderer from '../emoticonsDropdown/tabs/SuperStickerRenderer';
import rootScope from '../../lib/rootScope';

import styles from './stargiftsGrid.module.scss';
import classNames from '../../helpers/string/classNames';
import {StarGiftBadge} from './stargiftBadge';
import {StarGiftBackdrop} from './stargiftBackdrop';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import {IconTsx} from '../iconTsx';
import formatNumber from '../../helpers/number/formatNumber';
import {rgbIntToHex} from '../../helpers/color';
import createContextMenu from '../../helpers/dom/createContextMenu';
import PopupPickUser from '../popups/pickUser';
import appImManager from '../../lib/appManagers/appImManager';
import {StarGift} from '../../layer';
import {copyTextToClipboard} from '../../helpers/clipboard';
import {toastNew} from '../toast';
import {wearStarGift} from '../popups/wearStarGift';
import transferStarGift from '../popups/transferStarGift';

function StarGiftGridItem(props: {
  item: MyStarGift,
  view: 'profile' | 'list'
  onClick?: () => void
  renderer: SuperStickerRenderer
}) {
  let containerRef!: HTMLDivElement;
  let stickerRef!: HTMLDivElement;

  onMount(() => {
    props.renderer.renderSticker(props.item.sticker, stickerRef);
    props.renderer.observeAnimated(stickerRef);

    if(props.view === 'profile') {
      const {raw, saved, input, isIncoming} = props.item;
      const isOwnedUniqueGift = raw._ === 'starGiftUnique' && getPeerId(raw.owner_id) === rootScope.myId && saved !== undefined;

      createContextMenu({
        listenTo: containerRef,
        buttons: [
          {
            icon: 'forward',
            text: 'ShareFile',
            verify: () => raw._ === 'starGiftUnique',
            onClick: () => {
              PopupPickUser.createSharingPicker2().then((peerId) => {
                rootScope.managers.appMessagesManager.sendText({peerId, text: 'https://t.me/nft/' + (raw as StarGift.starGiftUnique).slug});
                appImManager.setInnerPeer({peerId});
              });
            }
          },
          {
            icon: saved?.pFlags.pinned_to_top ? 'unpin' : 'pin',
            text: saved?.pFlags.pinned_to_top ? 'StarGiftUnpin' : 'StarGiftPin',
            verify: () => isOwnedUniqueGift,
            onClick: () => {
              rootScope.managers.appGiftsManager.togglePinnedGift(input);
            }
          },
          {
            icon: 'link',
            text: 'CopyLink',
            verify: () => raw._ === 'starGiftUnique',
            onClick: () => {
              copyTextToClipboard('https://t.me/nft/' + (raw as StarGift.starGiftUnique).slug);
              toastNew({langPackKey: 'LinkCopied'});
            }
          },
          {
            icon: 'gem_transfer',
            text: 'StarGiftTransferFull',
            verify: () => isOwnedUniqueGift,
            onClick: () => {
              transferStarGift(props.item);
            }
          },
          {
            icon: 'crown',
            text: 'StarGiftWearFull',
            verify: () => isOwnedUniqueGift,
            onClick: () => {
              wearStarGift(raw.id);
            }
          },
          {
            icon: saved.pFlags.unsaved ? 'eye' : 'eyecross_outline',
            text: saved.pFlags.unsaved ? 'Show' : 'Hide',
            verify: () => isOwnedUniqueGift || isIncoming,
            onClick: () => {
              rootScope.managers.appGiftsManager.toggleGiftHidden(input, !saved.pFlags.unsaved);
            }
          }
        ]
      })
    }
  })

  const isPinned = () => props.item.saved?.pFlags.pinned_to_top;

  return (
    <div
      class={/* @once */ classNames(
        styles.gridItem,
        props.view === 'profile' ? styles.viewProfile : styles.viewList
      )}
      onClick={props.onClick}
      ref={containerRef}
    >

      {props.item.collectibleAttributes && (
        <StarGiftBackdrop
          class={/* @once */ styles.itemBackdrop}
          small
          backdrop={props.item.collectibleAttributes.backdrop}
          patternEmoji={props.item.collectibleAttributes.pattern.document as MyDocument}
        />
      )}
      {isPinned() && (
        <IconTsx icon="pin2" class={/* @once */ styles.itemPin} />
      )}

      {props.view === 'profile' && props.item.saved?.pFlags.unsaved && (
        <IconTsx icon="hide" class={/* @once */ styles.itemUnsaved} />
      )}
      <div
        class={/* @once */ styles.itemSticker}
        ref={stickerRef}
      />

      {props.view === 'list' && props.item.raw._ === 'starGift' && (
        <div class={/* @once */ styles.itemPrice}>
          {/* todo: huge performance hit */}
          {/* {props.view === 'list' && (
            <Sparkles mode='button' isDiv />
          )} */}
          <StarsStar />
          <span>{props.item.raw.stars}</span>
        </div>
      )}

      {props.view === 'profile' && props.item.raw._ === 'starGift' && (
        <div class={/* @once */ styles.itemFrom}>
          {props.item.saved.from_id ? (
            <AvatarNewTsx
              peerId={getPeerId(props.item.saved.from_id)}
              size={20}
            />
          ) : (
            <div class={/* @once */ styles.itemFromAnonymous}>
              <img src="/assets/img/anon_paid_reaction.png" alt="Anonymous" />
            </div>
          )}
        </div>
      )}

      {(() => {
        const gift = props.item.raw;
        if(gift._ !== 'starGift') {
          return (
            <StarGiftBadge
              class={/* @once */ styles.badgeUnique}
              backdropAttr={props.item.collectibleAttributes.backdrop}
            >
              {isPinned() ? `#${gift.num}` : i18n('StarGiftLimitedBadgeNum', [formatNumber(gift.availability_total, 1)])}
            </StarGiftBadge>
          );
        };

        if(props.view === 'list' && gift.availability_remains === 0) {
          return (
            <StarGiftBadge class={/* @once */ styles.badgeSoldout}>
              {i18n('StarGiftSoldOutBadge')}
            </StarGiftBadge>
          )
        }

        if(props.item.raw.availability_total) {
          return (
            <StarGiftBadge>
              {props.view === 'list' ? i18n('StarGiftLimitedBadge') : i18n('StarGiftLimitedBadgeNum', [formatNumber(gift.availability_total, 1)])}
            </StarGiftBadge>
          )
        }
      })()}
    </div>
  );
}

export function StarGiftsGrid(props: {
  class?: string
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
    visibleRenderOptions: {loop: false, width: 120, height: 120},
    withLock: false
  });

  onCleanup(() => {
    stickerRenderer.destroy();
    lazyLoadQueue.clear();
  });

  return (
    <div class={classNames(styles.grid, props.class)}>
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
