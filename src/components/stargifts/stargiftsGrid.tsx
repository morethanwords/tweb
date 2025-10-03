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
import {changeBrightness, getRgbColorFromTelegramColor, rgbaToHexa, rgbIntToHex} from '../../helpers/color';
import createContextMenu from '../../helpers/dom/createContextMenu';
import PopupPickUser from '../popups/pickUser';
import appImManager from '../../lib/appManagers/appImManager';
import {StarGift} from '../../layer';
import {copyTextToClipboard} from '../../helpers/clipboard';
import {toastNew} from '../toast';
import transferStarGift from '../popups/transferStarGift';
import {numberThousandSplitterForStars} from '../../helpers/number/numberThousandSplitter';
import CheckboxFieldTsx from '../checkboxFieldTsx';
import tsNow from '../../helpers/tsNow';
import PopupStarGiftWear from '../popups/starGiftWear';

function StarGiftGridItem(props: {
  item: MyStarGift,
  view: 'profile' | 'list' | 'resale'
  hasSelection?: boolean
  selected?: boolean
  onClick?: () => void
  renderer: SuperStickerRenderer
}) {
  let containerRef!: HTMLDivElement;
  let stickerRef!: HTMLDivElement;

  onMount(() => {
    props.renderer.renderSticker(props.item.sticker, stickerRef);
    props.renderer.observeAnimated(stickerRef);

    if(props.view === 'profile' && !props.hasSelection) {
      const {raw, saved, input, isIncoming, isWearing} = props.item;
      const isOwnedUniqueGift = raw._ === 'starGiftUnique' && getPeerId(raw.owner_id) === rootScope.myId && saved !== undefined;

      createContextMenu({
        listenTo: containerRef,
        buttons: [
          {
            icon: 'forward',
            text: 'ShareFile',
            verify: () => raw._ === 'starGiftUnique',
            onClick: () => {
              PopupPickUser.createSharingPicker2().then(({peerId, threadId, monoforumThreadId}) => {
                rootScope.managers.appMessagesManager.sendText({peerId, threadId, replyToMonoforumPeerId: monoforumThreadId, text: 'https://t.me/nft/' + (raw as StarGift.starGiftUnique).slug});
                appImManager.setInnerPeer({peerId, threadId, monoforumThreadId});
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
            icon: 'gem_transfer_outline',
            text: 'StarGiftTransferFull',
            verify: () => isOwnedUniqueGift,
            onClick: () => {
              transferStarGift(props.item);
            }
          },
          {
            icon: isWearing ? 'crownoff_outline' : 'crown_outline',
            text: isWearing ? 'StarGiftWearStopFull' : 'StarGiftWearFull',
            verify: () => isOwnedUniqueGift,
            onClick: () => {
              if(isWearing) {
                rootScope.managers.appUsersManager.updateEmojiStatus({_: 'emojiStatusEmpty'});
              } else {
                PopupStarGiftWear.open(props.item);
              }
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
  const isPremium = () => props.view === 'list' && props.item.raw._ === 'starGift' && props.item.raw.pFlags.require_premium && props.item.raw.availability_remains > 0;
  const isLocked = () => props.view === 'list' && props.item.raw._ === 'starGift' && props.item.raw.locked_until_date > tsNow(true);

  return (
    <div
      class={/* @once */ classNames(
        styles.gridItem,
        {
          profile: styles.viewProfile,
          list: styles.viewList,
          resale: styles.viewResale
        }[props.view],
        isPremium() && styles.itemPremium
      )}
      style={{
        '--overlay-color': rgbaToHexa(changeBrightness(getRgbColorFromTelegramColor(props.item.collectibleAttributes?.backdrop?.edge_color ?? 0), 0.9))
      }}
      onClick={props.onClick}
      ref={containerRef}
    >
      {props.hasSelection && (
        <CheckboxFieldTsx
          round
          class={/* @once */ styles.checkbox}
          checked={props.selected}
        />
      )}

      {isPremium() && (
        <div class={/* @once */ styles.itemPremiumBackground} />
      )}

      {props.item.collectibleAttributes && (
        <StarGiftBackdrop
          class={/* @once */ styles.itemBackdrop}
          small
          backdrop={props.item.collectibleAttributes.backdrop}
          patternEmoji={props.item.collectibleAttributes.pattern.document as MyDocument}
        />
      )}

      {isPinned() && !props.item.resellOnlyTon && (
        <IconTsx icon="pin2" class={/* @once */ styles.itemPin} />
      )}

      {isLocked() && (
        <IconTsx icon="time_lock" class={/* @once */ styles.itemLock} />
      )}

      {props.item.resellOnlyTon && (
        <div class={/* @once */ styles.tonIcon}>
          <IconTsx icon="ton" />
        </div>
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
          <span>{
            props.item.isResale && props.item.raw.resell_min_stars ?
              `${numberThousandSplitterForStars(props.item.raw.resell_min_stars)}+` :
              numberThousandSplitterForStars(props.item.raw.stars)
          }</span>
        </div>
      )}

      {props.item.resellPriceStars && (
        <div class={/* @once */ styles.itemPrice}>
          <IconTsx icon="star" />
          <span>{numberThousandSplitterForStars(props.item.resellPriceStars)}</span>
        </div>
      )}

      {props.view === 'profile' && props.item.raw._ === 'starGift' && !props.hasSelection && (
        <div class={/* @once */ styles.itemFrom}>
          {props.item.saved.from_id && !props.item.saved.pFlags.name_hidden ? (
            <AvatarNewTsx
              peerId={getPeerId(props.item.saved.from_id)}
              size={20}
            />
          ) : (
            <div class={/* @once */ styles.itemFromAnonymous}>
              <img src="assets/img/anon_paid_reaction.png" alt="Anonymous" />
            </div>
          )}
        </div>
      )}

      {(() => {
        const gift = props.item.raw;
        if(gift._ !== 'starGift') {
          if(props.view === 'profile' && props.item.resellPriceStars) {
            return (
              <StarGiftBadge class={/* @once */ styles.badgeResale}>
                {i18n('StarGiftResaleBadgeProfile')}
              </StarGiftBadge>
            )
          }

          return (
            <StarGiftBadge
              class={/* @once */ styles.badgeUnique}
              backdropAttr={props.item.collectibleAttributes.backdrop}
            >
              {isPinned() || props.view === 'resale' ? `#${gift.num}` : i18n('StarGiftLimitedBadgeNum', [formatNumber(gift.availability_total, 1)])}
            </StarGiftBadge>
          );
        };

        if(props.view === 'list' && props.item.isResale) {
          return (
            <StarGiftBadge class={/* @once */ styles.badgeResale}>
              {i18n('StarGiftResaleBadge')}
            </StarGiftBadge>
          )
        }

        if(isPremium()) {
          return (
            <StarGiftBadge class={/* @once */ styles.badgePremium}>
              {i18n('StarGiftPremiumBadge')}
            </StarGiftBadge>
          )
        }

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
  view: 'profile' | 'list' | 'resale'
  autoplay?: boolean
  onClick?: (item: MyStarGift) => void
  selected?: (item: MyStarGift) => boolean
  scrollParent: HTMLElement
}) {
  const lazyLoadQueue = new LazyLoadQueue();
  const stickerRenderer = new SuperStickerRenderer({
    regularLazyLoadQueue: lazyLoadQueue,
    group: 'none',
    managers: rootScope.managers,
    intersectionObserverInit: {root: props.scrollParent},
    visibleRenderOptions: {
      loop: false,
      play: props.autoplay ?? true,
      width: 120,
      height: 120
    },
    withLock: false,
    playOnHover: true
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
            hasSelection={/* @once */ props.selected !== undefined}
            selected={props.selected?.(item)}
            onClick={() => props.onClick?.(item)}
            renderer={stickerRenderer}
          />
        )}
      </For>
    </div>
  )
}
