import {Match, Switch} from 'solid-js';
import {I18nTsx} from '@helpers/solid/i18n';
import {Message, MessageAction, StarGift} from '@layer';


import {MyStarGift} from '@appManagers/appGiftsManager';
import {i18n} from '@lib/langPack';
import tsNow from '@helpers/tsNow';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import formatDuration, {DurationType} from '@helpers/formatDuration';
import {createCurrentTime} from '@helpers/solid/createCurrentTime';
import ripple from '@components/ripple';

import styles from '@components/chat/bubbles/starGiftOffer.module.scss';
import {MyDocument} from '@appManagers/appDocsManager';
import {StarGiftBackdrop} from '@components/stargifts/stargiftBackdrop';
import {StickerTsx} from '@components/wrappers/sticker';
import Icon from '@components/icon';
import Chat from '@components/chat/chat';
import confirmationPopup from '@components/confirmationPopup';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import rootScope from '@lib/rootScope';
import {transferStarGiftConfirmationPopup} from '@components/popups/transferStarGift';
import PopupElement from '../../popups';
import PopupStarGiftInfo from '../../popups/starGiftInfo';
ripple; // keep

function wrapExpiresIn(duration: number) {
  const formatted = formatDuration(duration, 2)
  if(formatted[0].type <= DurationType.Minutes) {
    formatted.splice(1, Infinity)
  }
  return wrapFormattedDuration(formatted)
}

export function StarGiftOfferBubble(props: {
  gift: MyStarGift
  title: HTMLElement
  outgoing: boolean
  action: MessageAction.messageActionStarGiftPurchaseOffer
  modifyBubble?: (callback: VoidFunction) => void
}) {
  const now = createCurrentTime({
    fn: () => tsNow(true),
    updateWrapper: props.modifyBubble
  })
  const expired = () => props.action.expires_at < now()

  return (
    <div
      class={/* @once */ styles.wrap}
      onClick={() => {
        PopupElement.createPopup(PopupStarGiftInfo, {gift: props.gift})
      }}
    >
      <div class={/* @once */ styles.giftWrap}>
        <StarGiftBackdrop
          backdrop={props.gift.collectibleAttributes.backdrop}
          patternEmoji={props.gift.collectibleAttributes.pattern.document as MyDocument}
          small
          canvasClass={/* @once */ styles.giftBackdropCanvas}
        />
        <StickerTsx
          sticker={props.gift.collectibleAttributes.model.document as MyDocument}
          width={48}
          height={48}
          autoStyle
          extraOptions={{play: true}}
        />
      </div>

      <div class={/* @once */ styles.title}>
        {props.title}
      </div>

      <Switch>
        <Match when={props.action.pFlags.accepted}>
          <I18nTsx class={/* @once */ styles.status} key="StarGiftOffer.Accepted" />
        </Match>
        <Match when={props.action.pFlags.declined}>
          <I18nTsx class={/* @once */ styles.status} key="StarGiftOffer.Rejected" />
        </Match>
        <Match when={!expired()}>
          <I18nTsx
            class={/* @once */ styles.status}
            key="StarGiftOffer.ExpiresIn"
            args={[wrapExpiresIn(props.action.expires_at - now())]}
          />
        </Match>
        <Match when={expired()}>
          <I18nTsx class={/* @once */ styles.status} key="StarGiftOffer.Expired" />
        </Match>
      </Switch>
    </div>
  )
}

export function showStarGiftOfferButtons(act: MessageAction.messageActionStarGiftPurchaseOffer) {
  return !act.pFlags.accepted && !act.pFlags.declined && act.expires_at > tsNow(true);
}

export function StarGiftOfferReplyMarkup(props: {
  gift: MyStarGift,
  message: Message.messageService,
  chat: Chat
}) {
  const onRejectClick = async() => {
    await confirmationPopup({
      titleLangKey: 'StarGiftOffer.RejectOfferTitle',
      descriptionLangKey: 'StarGiftOffer.RejectOfferText',
      descriptionLangArgs: [await wrapPeerTitle({peerId: props.message.peerId})],
      button: {
        langKey: 'StarGiftOffer.Reject',
        isDanger: true
      }
    });

    await rootScope.managers.appGiftsManager.resolveGiftOffer(props.message.id, 'reject')
  }
  const onAcceptClick = () => {
    transferStarGiftConfirmationPopup({
      gift: props.gift,
      recipient: props.message.peerId,
      fromOffer: props.message.action as MessageAction.messageActionStarGiftPurchaseOffer,
      handleSubmit: async() => {
        await rootScope.managers.appGiftsManager.resolveGiftOffer(props.message.id, 'accept')
      }
    })
  }

  return (
    <div class="reply-markup">
      <div class="reply-markup-row">
        <button class="reply-markup-button is-first" use:ripple onClick={onRejectClick}>
          <span class="reply-markup-button-text reply-markup-suggested-action">
            {Icon('crossround_filled')}{/* @once */i18n('StarGiftOffer.Reject')}
          </span>
        </button>
        <button class="reply-markup-button is-last" use:ripple onClick={onAcceptClick}>
          <span class="reply-markup-button-text reply-markup-suggested-action">
            {Icon('checkround_filled')}{/* @once */i18n('StarGiftOffer.Accept')}
          </span>
        </button>
      </div>
    </div>
  )
}
