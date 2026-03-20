import {createMemo, For, onCleanup, onMount} from 'solid-js';
import {MyStarGift} from '@appManagers/appGiftsManager';
import {StarsStar} from '@components/popups/stars';
import {AvatarNewTsx} from '@components/avatarNew';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {i18n} from '@lib/langPack';
import LazyLoadQueue from '@components/lazyLoadQueue';
import SuperStickerRenderer from '@components/emoticonsDropdown/tabs/SuperStickerRenderer';
import rootScope from '@lib/rootScope';

import styles from '@components/stargifts/stargiftsGrid.module.scss';
import classNames from '@helpers/string/classNames';
import {StarGiftBadge} from '@components/stargifts/stargiftBadge';
import {StarGiftBackdrop} from '@components/stargifts/stargiftBackdrop';
import {MyDocument} from '@appManagers/appDocsManager';
import {IconTsx} from '@components/iconTsx';
import formatNumber from '@helpers/number/formatNumber';
import {changeBrightness, getRgbColorFromTelegramColor, rgbaToHexa, rgbIntToHex} from '@helpers/color';
import createContextMenu from '@helpers/dom/createContextMenu';
import PopupPickUser from '@components/popups/pickUser';
import appImManager from '@lib/appImManager';
import {StarGift, StarGiftCollection} from '@layer';
import {copyTextToClipboard} from '@helpers/clipboard';
import {toastNew} from '@components/toast';
import transferStarGift from '@components/popups/transferStarGift';
import {numberThousandSplitterForStars} from '@helpers/number/numberThousandSplitter';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import tsNow from '@helpers/tsNow';
import PopupStarGiftWear from '@components/popups/starGiftWear';
import createSubmenuTrigger from '@components/createSubmenuTrigger';
import {ButtonMenuItemOptions, ButtonMenuItemOptionsVerifiable, ButtonMenuSync} from '@components/buttonMenu';
import CheckboxField from '@components/checkboxField';

function StarGiftGridItem(props: {
  item: MyStarGift,
  view: 'profile' | 'list' | 'resale' | 'transfer'
  profilePeerId?: PeerId
  canManageGifts?: boolean
  profileCollections?: StarGiftCollection[]
  hasSelection?: boolean
  selected?: boolean
  onClick?: () => void
  renderer: SuperStickerRenderer
}) {
  const profileCollections = createMemo(() => props.profileCollections ?? []);
  let containerRef!: HTMLDivElement;
  let stickerRef!: HTMLDivElement;

  onMount(() => {
    props.renderer.renderSticker(props.item.sticker, stickerRef);
    props.renderer.observeAnimated(stickerRef);

    if(props.view === 'profile' && !props.hasSelection) {
      const {raw, saved, input, isIncoming, isWearing} = props.item;
      const profilePeerId = props.profilePeerId ?? rootScope.myId;
      const isEditableUniqueGift = Boolean(raw._ === 'starGiftUnique' && props.canManageGifts && saved);

      const buttons: ButtonMenuItemOptionsVerifiable[] = [
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
          verify: () => isEditableUniqueGift,
          onClick: () => {
            rootScope.managers.appGiftsManager.togglePinnedGift(input, profilePeerId);
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
          verify: () => isEditableUniqueGift,
          onClick: () => {
            transferStarGift(props.item);
          }
        },
        createSubmenuTrigger({
          options: {
            icon: 'folder',
            text: 'StarGiftCollectionsAddToCollection',
            verify: () => isEditableUniqueGift && profileCollections().length > 0
          },
          createSubmenu: () => {
            if(!saved || !input || !props.profilePeerId || !profileCollections().length) {
              return ButtonMenuSync({buttons: []});
            }

            const buttons: ButtonMenuItemOptions[] = profileCollections().map((collection) => {
              const checkboxField = new CheckboxField({
                checked: !!saved.collection_id?.includes(collection.collection_id)
              });

              return {
                regularText: collection.title,
                onClick: () => {
                  const wasChecked = checkboxField.checked;
                  checkboxField.checked = !wasChecked;
                  rootScope.managers.appGiftsManager.updateCollection({
                    peerId: props.profilePeerId,
                    collectionId: collection.collection_id,
                    [wasChecked ? 'delete' : 'add']: [input]
                  }).catch(() => {
                    checkboxField.checked = wasChecked;
                    toastNew({langPackKey: 'Error.AnError'});
                  });
                },
                checkboxField,
                noCheckboxClickListener: true,
                keepOpen: true
              };
            });

            return ButtonMenuSync({buttons});
          }
        }),
        {
          icon: isWearing ? 'crownoff_outline' : 'crown_outline',
          text: isWearing ? 'StarGiftWearStopFull' : 'StarGiftWearFull',
          verify: () => isEditableUniqueGift,
          onClick: async() => {
            if(isWearing) {
              if(profilePeerId === rootScope.myId) {
                rootScope.managers.appUsersManager.updateEmojiStatus({_: 'emojiStatusEmpty'});
              } else {
                rootScope.managers.apiManager.invokeApiSingleProcess({
                  method: 'channels.updateEmojiStatus',
                  params: {
                    channel: await rootScope.managers.appChatsManager.getChannelInput(profilePeerId.toChatId()),
                    emoji_status: {_: 'emojiStatusEmpty'}
                  }
                }).then((updates) => {
                  rootScope.managers.apiUpdatesManager.processUpdateMessage(updates);
                }).catch(() => {
                  toastNew({langPackKey: 'Error.AnError'});
                });
              }
            } else {
              PopupStarGiftWear.open(props.item, profilePeerId);
            }
          }
        },
        {
          icon: saved.pFlags.unsaved ? 'eye' : 'eyecross_outline',
          text: saved.pFlags.unsaved ? 'Show' : 'Hide',
          verify: () => isIncoming || isEditableUniqueGift,
          onClick: () => {
            rootScope.managers.appGiftsManager.toggleGiftHidden(input, !saved.pFlags.unsaved);
          }
        }
      ];

      createContextMenu({
        listenTo: containerRef,
        buttons,
        onElementReady: () => {
          buttons.forEach((button) => button.onOpen?.());
        }
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
          transfer: styles.viewTransfer,
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

      {props.item.resellOnlyTon && props.view !== 'transfer' && (
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

      {props.item.resellPriceStars && props.view !== 'transfer' && (
        <div class={/* @once */ styles.itemPrice}>
          <IconTsx icon="star" />
          <span>{numberThousandSplitterForStars(props.item.resellPriceStars)}</span>
        </div>
      )}

      {props.view === 'transfer' && (
        <div class={/* @once */ styles.itemPrice}>
          {i18n('StarGiftTransferFull')}
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
  view: 'profile' | 'list' | 'resale' | 'transfer'
  autoplay?: boolean
  onClick?: (item: MyStarGift) => void
  selected?: (item: MyStarGift) => boolean
  profilePeerId?: PeerId
  canManageGifts?: boolean
  profileCollections?: StarGiftCollection[]
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
            profilePeerId={props.profilePeerId}
            canManageGifts={props.canManageGifts}
            profileCollections={props.profileCollections}
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
