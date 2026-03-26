import type ChatBubbles from '@components/chat/bubbles';
import {IGNORE_ACTIONS} from '@components/chat/bubbles';
import type Chat from '@components/chat/chat';
import type {Middleware} from '@helpers/middleware';
import {Message, MessageMedia} from '@layer';
import {i18n, langPack} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import wrapMessageActionTextNew from '@components/wrappers/messageActionTextNew';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import wrapMessageForReply from '@components/wrappers/messageForReply';
import PeerTitle from '@components/peerTitle';
import Icon from '@components/icon';
import Button from '@components/button';
import {PremiumGiftBubble} from '@components/chat/bubbles/premiumGift';
import {StarGiftBubble} from '@components/chat/bubbles/starGift';
import {showStarGiftOfferButtons, StarGiftOfferBubble, StarGiftOfferReplyMarkup} from '@components/chat/bubbles/starGiftOffer';
import {SuggestBirthdayBubble} from '@components/chat/bubbles/suggestBirthday';
import {NoForwardsRequestContent, NoForwardsRequestReplyMarkup} from '@components/chat/bubbles/noForwardsRequest';
import SimilarChannels from '@components/chat/similarChannels';
import {getGiftAssetName} from '@components/chat/giveaway';
import {wrapSolidComponent} from '@helpers/solid/wrapSolidComponent';
import {wrapStoryMedia} from '@components/stories/preview';
import {createStoriesViewerWithPeer} from '@components/stories/viewer';
import {avatarNew} from '@components/avatarNew';
import shouldDisplayGiftCodeAsGift from '@helpers/shouldDisplayGiftCodeAsGift';
import formatStarsAmount from '@appManagers/utils/payments/formatStarsAmount';
import {formatDaysDuration} from '@helpers/date';
import {formatNanoton, nanotonToJsNumber} from '@helpers/paymentsWrapCurrencyAmount';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import deferredPromise from '@helpers/cancellablePromise';
import liteMode from '@helpers/liteMode';
import {getTransition} from '@config/transitions';
import {attachClickEvent, simulateClickEvent} from '@helpers/dom/clickEvent';
import cancelEvent from '@helpers/dom/cancelEvent';
import callbackify from '@helpers/callbackify';
import {modifyAckedPromise} from '@helpers/modifyAckedResult';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import {getHeavyAnimationPromise} from '@hooks/useHeavyAnimationCheck';
import {getPriceChangedActionMessageLangParams} from '@lib/lang';
import {checkIfNotMePosted} from '@components/chat/bubbleParts/suggestPostServiceMessage';
import tsNow from '@helpers/tsNow';
import {InternalLink, INTERNAL_LINK_TYPE} from '@lib/internalLink';
import internalLinkProcessor from '@lib/internalLinkProcessor';
import PopupPayment from '@components/popups/payment';
import PopupElement from '@components/popups';
import PopupGiftLink from '@components/popups/giftLink';
import PopupPremium from '@components/popups/premium';
import PopupStars from '@components/popups/stars';
import PopupStarGiftInfo from '@components/popups/starGiftInfo';
import {createRoot, createEffect} from 'solid-js';
import {render} from 'solid-js/web';
import type {MyDocument} from '@appManagers/appDocsManager';
import {toastNew} from '@components/toast';

export type ServiceBubbleArgs = {
  bubbles: ChatBubbles;
  message: Message.message | Message.messageService;
  isMessage: boolean;
  our: boolean;
  bubble: HTMLElement;
  bubbleContainer: HTMLElement;
  contentWrapper: HTMLElement;
  middleware: Middleware;
  wrapOptions: WrapSomethingOptions;
  loadPromises: Promise<any>[];
  isStoryMention: boolean;
  isSelfDestructingMedia: boolean;
  regularAsService: boolean;
};

/**
 * Renders a service message bubble. Extracted from ChatBubbles.renderMessage.
 * Returns true if the message was rendered as a service bubble (returnService = true).
 */
export async function renderServiceBubbleContent({
  bubbles,
  message,
  isMessage,
  our,
  bubble,
  bubbleContainer,
  contentWrapper,
  middleware,
  wrapOptions,
  loadPromises,
  isStoryMention,
  isSelfDestructingMedia,
  regularAsService
}: ServiceBubbleArgs): Promise<boolean> {
  const messageService = message as Message.messageService;
  const action = messageService.action;

  if(action) {
    const _ = action._;

    const ignoreAction = IGNORE_ACTIONS.get(_);
    if(ignoreAction && (ignoreAction === true || ignoreAction(messageService))) {
      return undefined; // signal to caller: return from renderMessage
    }

    if(langPack.hasOwnProperty(_) && !langPack[_]) {
      return undefined;
    }
  }

  const chat = bubbles.chat;
  const peerId = (bubbles as any).peerId as PeerId;
  const lazyLoadQueue = (bubbles as any).lazyLoadQueue;
  const listenerSetter = (bubbles as any).listenerSetter;
  const scrollable = (bubbles as any).scrollable;

  const wrapSomeSolid = (func: () => any, container: HTMLElement, mw: Middleware) => {
    const dispose = render(func, container);
    mw.onClean(dispose);
  };

  bubble.className = 'bubble service';
  bubbleContainer.replaceChildren();

  const s = document.createElement('div');
  s.classList.add('service-msg');

  if(action) {
    const isGiftCode = action._ === 'messageActionGiftCode';
    let promise: Promise<any>;

    if(action._ === 'messageActionGiftStars' || action._ === 'messageActionPrizeStars') {
      const content = bubbleContainer.cloneNode(false) as HTMLElement;
      content.classList.add('has-service-before');

      s.append(await wrapMessageActionTextNew({message, middleware}));

      const isSent = message.fromId === rootScope.myId;
      const isPrize = action._ === 'messageActionPrizeStars';

      let subtitle: HTMLElement;
      if(isPrize) {
        subtitle = i18n(
          'Action.StarGiveawayPrize',
          [+action.stars, await wrapPeerTitle({peerId: getPeerId(action.boost_peer)})]
        );
      } else {
        subtitle = i18n(isSent ? 'ActionGiftStarsSubtitle' : 'ActionGiftStarsSubtitleYou', [await wrapPeerTitle({peerId: message.peerId})]);
      }

      wrapSomeSolid(() => PremiumGiftBubble({
        rlottieOptions: {middleware},
        assetName: 'Gift3',
        title: i18n(isPrize ? 'BoostingCongratulations' : 'ActionGiftStarsTitle', [action.stars]),
        subtitle,
        buttonText: i18n('ActionGiftPremiumView'),
        buttonCallback: async() => {
          PopupPayment.create({
            message: message as Message.message,
            noPaymentForm: true,
            transaction: {
              _: 'starsTransaction',
              date: message.date,
              id: action.transaction_id || (isSent ? '' : '1'),
              peer: {
                _: 'starsTransactionPeer',
                peer: isPrize ? action.boost_peer : {
                  _: 'peerUser',
                  user_id: isSent ? message.peerId : rootScope.myId
                }
              },
              pFlags: {
                gift: isPrize ? undefined : true
              },
              amount: formatStarsAmount(action.stars),
              giveaway_post_id: isPrize ? action.giveaway_msg_id : undefined
            }
          });
        }
      }), content, middleware);

      bubbleContainer.after(content);
    } else if(isGiftCode && !shouldDisplayGiftCodeAsGift(action)) {
      const isUnclaimed = action.pFlags.unclaimed;
      const isGiveaway = action.pFlags.via_giveaway;
      const title = i18n(isUnclaimed ? 'BoostingUnclaimedPrize' : 'BoostingCongratulations');
      const subtitle = document.createElement('span');
      subtitle.append(
        i18n(
          isUnclaimed ? 'BoostingYouHaveUnclaimedPrize' : (isGiveaway ? 'BoostingReceivedPrizeFrom' : (action.boost_peer ? 'BoostingReceivedGiftFrom' : 'BoostingReceivedGiftNoName')),
          action.boost_peer ? [await wrapPeerTitle({peerId: getPeerId(action.boost_peer)})] : undefined
        ),
        document.createElement('br'),
        document.createElement('br'),
        i18n(
          isUnclaimed ? 'BoostingUnclaimedPrizeDuration' : (isGiveaway ? 'BoostingReceivedPrizeDuration' : 'BoostingReceivedGiftDuration'),
          [formatDaysDuration(action.days, true)]
        )
      );

      const assetName = getGiftAssetName(action.days);

      wrapSomeSolid(() => PremiumGiftBubble({
        rlottieOptions: {middleware},
        assetName,
        title,
        subtitle,
        buttonText: i18n('BoostingReceivedGiftOpenBtn'),
        buttonCallback: () => {
          PopupElement.createPopup(PopupGiftLink, action.slug);
        }
      }), bubbleContainer, middleware);
    } else if(action._ === 'messageActionChannelMigrateFrom') {
      const peerTitle = new PeerTitle();
      promise = peerTitle.update({peerId: action.chat_id.toPeerId(true), wrapOptions});
      s.append(i18n('ChatMigration.From', [peerTitle.element]));
    } else if(action._ === 'messageActionChatMigrateTo') {
      const peerTitle = new PeerTitle();
      promise = peerTitle.update({peerId: action.channel_id.toPeerId(true), wrapOptions});
      s.append(i18n('ChatMigration.To', [peerTitle.element]));
    } else if(action._ === 'messageActionPaidMessagesPrice') {
      const result = getPriceChangedActionMessageLangParams(action, chat.isBroadcast, () => {
        const peerTitle = new PeerTitle();
        promise = peerTitle.update({peerId: message.peerId.toPeerId(true), wrapOptions});
        return peerTitle.element;
      });
      s.append(i18n(
        result.langPackKey,
        result.args
      ));
    } else if(action._ === 'messageActionPaidMessagesRefunded') {
      const peerTitle = new PeerTitle();
      const savedPeerId = chat.canManageDirectMessages && getPeerId(message.saved_peer_id);
      promise = peerTitle.update({peerId: savedPeerId || peerId, onlyFirstName: true, wrapOptions});

      s.append(i18n(
        our ? 'PaidMessages.StarsRefundedByYou' : 'PaidMessages.StarsRefundedToYou',
        [+action.stars, peerTitle.element]
      ));
    } else if(action._ === 'messageActionSuggestedPostApproval' || action._ === 'messageActionSuggestedPostRefund' || action._ === 'messageActionSuggestedPostSuccess') {
      const {default: SuggestedPostActionContent} = await import('../bubbleParts/suggestedPostActionContent');
      const content = new SuggestedPostActionContent;

      let peerTitle;
      if(action._ === 'messageActionSuggestedPostApproval' && checkIfNotMePosted({peerId, canManageDirectMessages: chat.canManageDirectMessages, message})) {
        peerTitle = new PeerTitle();
        promise = peerTitle.update({peerId, onlyFirstName: chat.canManageDirectMessages, limitSymbols: 20, wrapOptions});
      }

      content.feedProps({
        action,
        message,
        canManageDirectMessages: chat.canManageDirectMessages,
        fromPeerTitle: peerTitle?.element
      });

      s.append(content);
    } else if(action._ === 'messageActionSuggestBirthday') {
      const title = await wrapMessageActionTextNew({message, middleware});
      const container = wrapSolidComponent(() => SuggestBirthdayBubble({
        birthday: action.birthday,
        outgoing: message.pFlags.out,
        title
      }), middleware);
      s.append(container);
    } else if(action._ === 'messageActionStarGiftPurchaseOffer') {
      const [title, gift] = await Promise.all([
        wrapMessageActionTextNew({message, middleware}),
        (bubbles as any).managers.appGiftsManager.wrapGift(action.gift)
      ]);

      const container = wrapSolidComponent(() => StarGiftOfferBubble({
        gift: gift,
        title,
        outgoing: message.pFlags.out,
        action,
        modifyBubble: (bubbles as any).modifyBubble
      }), middleware);
      s.append(container);

      if(!message.pFlags.out && showStarGiftOfferButtons(action)) {
        bubble.classList.add('with-reply-markup');
        const buttons = wrapSolidComponent(() => StarGiftOfferReplyMarkup({
          gift,
          message: message as Message.messageService,
          chat
        }), middleware);
        contentWrapper.append(buttons);
      }
    } else if(action._ === 'messageActionNoForwardsRequest' && !action.pFlags.expired) {
      const peerTitle = message.pFlags.out ? undefined : await wrapPeerTitle({peerId: message.fromId});
      wrapSomeSolid(() => NoForwardsRequestContent({
        peerTitle
      }), s, middleware);
      s.style.maxWidth = '20rem';
      bubble.classList.add('has-service-description');

      const isExpired = tsNow(true) >= message.date + chat.appConfig.no_forwards_request_expire_period;
      if(!message.pFlags.out && !isExpired) {
        bubble.classList.add('with-reply-markup');
        const buttons = wrapSolidComponent(() => NoForwardsRequestReplyMarkup({
          message: message as Message.messageService,
          chat
        }), middleware);
        contentWrapper.append(buttons);
      }
    } else {
      promise = wrapMessageActionTextNew({
        message,
        ...wrapOptions
      }).then((el) => s.append(el));
    }

    if(action._ === 'messageActionGiftPremium' || (isGiftCode && shouldDisplayGiftCodeAsGift(action))) {
      const content = bubbleContainer.cloneNode(false) as HTMLElement;
      content.classList.add('has-service-before');

      const assetName = getGiftAssetName(action.days);

      const title = i18n('ActionGiftPremiumTitle2', [formatDaysDuration(action.days, false)]);
      const subtitle =
        action.message ?
          wrapRichText(action.message.text, {entities: action.message.entities}) :
          i18n('ActionGiftPremiumSubtitle2');

      wrapSomeSolid(() => PremiumGiftBubble({
        rlottieOptions: {middleware},
        assetName,
        title,
        subtitle,
        buttonText: i18n(isGiftCode && message.fromId === message.peerId ? 'GiftPremiumUseGiftBtn' : 'ActionGiftPremiumView'),
        buttonCallback: () => {
          if(isGiftCode) {
            const link: InternalLink.InternalLinkGiftCode = {
              _: INTERNAL_LINK_TYPE.GIFT_CODE,
              slug: action.slug,
              stack: chat.appImManager.getStackFromElement(bubble)
            };

            internalLinkProcessor.processGiftCodeLink(link);
            return;
          }

          PopupPremium.show({
            gift: action,
            peerId,
            isOut: !!message.pFlags.out
          });
        }
      }), content, middleware);

      bubbleContainer.after(content);
    } else if(action._ === 'messageActionGiftTon') {
      const content = bubbleContainer.cloneNode(false) as HTMLElement;
      content.classList.add('has-service-before');

      const stickers = await (bubbles as any).managers.appStickersManager.getLocalStickerSet('inputStickerSetTonGifts');
      let idx: number;
      const amountNum = nanotonToJsNumber(action.amount);
      if(amountNum > 50) idx = 2;
      else if(amountNum > 10) idx = 1;
      else idx = 0;

      wrapSomeSolid(() => PremiumGiftBubble({
        rlottieOptions: {middleware},
        sticker: stickers.documents[idx] as MyDocument,
        title: formatNanoton(action.crypto_amount) + ' ' + action.crypto_currency,
        subtitle: i18n('TonGiftSubtitle'),
        buttonText: i18n('ActionGiftPremiumView'),
        buttonCallback: () => {
          PopupElement.createPopup(PopupStars, {ton: true});
        }
      }), content, middleware);

      bubbleContainer.after(content);
    } else if(action._ === 'messageActionChannelJoined') {
      bubble.classList.add('is-similar-channels');

      const c = document.createElement('div');
      c.classList.add('bubble-similar-channels');

      let visible = false;
      const toggle = (force = !visible, noAnimation?: boolean) => {
        if(force === visible) {
          return;
        }

        visible = force;

        if(force && !c.parentElement) {
          bubbleContainer.after(c);
        }

        if(!liteMode.isAvailable('animations')) {
          noAnimation = true;
        }

        let scrollSaver: ReturnType<ChatBubbles['createScrollSaver']>;
        if(bubble.isConnected) {
          scrollSaver = (bubbles as any).createScrollSaver(true);
          scrollSaver.save();
        }

        const {duration, easing} = getTransition('standard');
        const options: KeyframeAnimationOptions = {duration: noAnimation ? 0 : duration, fill: 'forwards', easing};
        const keyframes: Keyframe[] = [{height: '0'}, {height: '9.125rem'}];
        if(!force) keyframes.reverse();
        const animation = c.animate(keyframes, options);
        if(scrollSaver) (bubbles as any).animateSomethingWithScroll(animation.finished, scrollSaver);
        if(!force) animation.finished.then(() => {
          if(visible === force) {
            c.remove();
          }
        });

        updateHidden(!force);
      };

      const deferred = deferredPromise<void>();

      const updateHidden = async(hidden: boolean) => {
        const array = chat.appState.hiddenSimilarChannels.slice();
        if(hidden) array.push(peerId);
        else indexOfAndSplice(array, peerId);
        await (chat as any).setAppState('hiddenSimilarChannels', array);
      };

      let cached: boolean;
      wrapSomeSolid(
        () => SimilarChannels({
          chatId: peerId.toChatId(),
          onClose: () => {
            toggle(false);
          },
          onAcked: (_cached) => {
            cached = _cached;
            if(!cached) {
              deferred.resolve();
            }
          },
          onReady: async() => {
            bubbleContainer.classList.add('is-clickable');
            await getHeavyAnimationPromise();

            if(!chat.appState.hiddenSimilarChannels.includes(peerId)) {
              toggle(true, cached);
            }

            if(cached) {
              deferred.resolve();
            }

            attachClickEvent(bubbleContainer, () => {
              toggle();
            });
          },
          onEmpty: () => {
            if(deferred.isFulfilled) {
              toggle(false);
            }

            deferred.resolve();
          }
        }),
        c,
        middleware
      );

      loadPromises.push(deferred);
    } else if(action._ === 'messageActionStarGift' || action._ === 'messageActionStarGiftUnique') {
      const container = document.createElement('div');
      container.classList.add('bubble-star-gift-container');
      bubbleContainer.after(container);

      const gift = await (bubbles as any).managers.appGiftsManager.wrapGiftFromMessage(message as Message.messageService);
      wrapSomeSolid(() => StarGiftBubble({
        gift,
        fromId: getPeerId(gift.saved.from_id),
        asUpgrade: gift.isIncoming &&
          !(action._ === 'messageActionStarGift' && action.pFlags.upgraded) &&
          (gift.isUpgradedBySender || action.pFlags.prepaid_upgrade),
        asPrepaidUpgrade: action._ === 'messageActionStarGift' && action.pFlags.upgrade_separate,
        ownerId: gift.isIncoming ? undefined : message.peerId,
        wrapStickerOptions: {
          middleware,
          lazyLoadQueue,
          group: chat.animationGroup,
          scrollable,
          liteModeKey: 'stickers_chat',
          play: true,
          loop: false
        },
        onViewClick: async() => {
          if(action._ === 'messageActionStarGift' && action.upgrade_msg_id) {
            const upgradeMsg = await (bubbles as any).managers.appMessagesManager.getMessageById(action.upgrade_msg_id);
            if(!upgradeMsg) {
              toastNew({langPackKey: 'MessageNotFound'});
              return;
            }

            const upgradedGift = await (bubbles as any).managers.appGiftsManager.wrapGiftFromMessage(upgradeMsg as Message.messageService);
            PopupElement.createPopup(PopupStarGiftInfo, {gift: upgradedGift});
          } else {
            PopupElement.createPopup(PopupStarGiftInfo, {gift});
          }
        }
      }), container, middleware);
    } else if(action._ === 'messageActionTodoAppendTasks' || action._ === 'messageActionTodoCompletions') {
      bubble.classList.add('is-reply');
    }

    loadPromises.push(promise);
  } else if(isStoryMention) {
    const messageMedia = (message as Message.message).media as MessageMedia.messageMediaStory;
    const storyPeerId = getPeerId(messageMedia.peer);
    const storyId = messageMedia.id;
    const isMyStory = storyPeerId === rootScope.myId;

    const result = await modifyAckedPromise((bubbles as any).managers.acknowledged.appStoriesManager.getStoryById(storyPeerId, storyId));
    if(!result.cached) {
      s.append(i18n('Loading'));
      (result.result as Promise<any>).then(() => {
        (bubbles as any).safeRenderMessage({
          message,
          reverse: true,
          bubble
        });
      });
    } else if(!result.result) {
      let elem: HTMLElement;
      if(isMyStory) elem = i18n('ExpiredStoryMentionYou', [await wrapPeerTitle({peerId: message.peerId})]);
      else elem = i18n('ExpiredStoryMention');
      const icon = Icon('bomb', 'expired-story-icon');
      s.append(icon, elem);
    } else {
      s.classList.add('bubble-story-mention-wrapper');

      const avatarContainer = document.createElement('div');
      avatarContainer.classList.add('bubble-story-mention-avatar-container');

      const avatar = avatarNew({
        middleware,
        size: 100,
        peerId: storyPeerId,
        lazyLoadQueue,
        withStories: true,
        storyId,
        storyColors: {
          read: 'rgba(255, 255, 255, .3)'
        }
      });
      avatar.node.dataset.storyId = '' + storyId;
      loadPromises.push(avatar.readyThumbPromise);

      const deferred = deferredPromise<void>();
      loadPromises.push(deferred);
      callbackify(result.result, (storyItem: any) => {
        if(!middleware() || !storyItem || storyItem.pFlags.noforwards) {
          deferred.resolve();
          return;
        }

        createRoot((dispose) => {
          middleware.onClean(() => {
            deferred.resolve();
            dispose();
          });

          const {container, ready} = wrapStoryMedia({
            peerId: storyPeerId,
            storyItem,
            forPreview: true,
            noInfo: true,
            lazyLoadQueue,
            withPreloader: true,
            noAspecter: true
          });

          createEffect(() => {
            if(ready()) {
              deferred.resolve();
              (container as HTMLElement).classList.add('bubble-story-mention-preview');
              attachClickEvent(avatarContainer, (e) => {
                cancelEvent(e);
                createStoriesViewerWithPeer({peerId: storyPeerId, id: storyId, target: () => container as HTMLElement});
              }, {listenerSetter});
              avatarContainer.append(container as HTMLElement);
            }
          });
        });
      });

      avatarContainer.append(avatar.node);

      const text = i18n(
        isMyStory ? 'StoryMentionYou' : 'StoryMention',
        [await wrapPeerTitle({peerId: isMyStory ? message.peerId : storyPeerId})]
      );
      text.classList.add('bubble-story-mention-text');

      const button = Button('bubble-service-button bubble-story-mention-button', {noRipple: true, text: 'StoryMentionView'});
      attachClickEvent(button, () => {
        simulateClickEvent(avatar.node);
      }, {listenerSetter});

      s.append(avatarContainer, text, button);
    }
  } else if(isSelfDestructingMedia) {
    const promise = wrapMessageForReply({
      message,
      ...wrapOptions
    }).then((el) => s.append(el));

    loadPromises.push(promise);
  }

  bubbleContainer.append(s);

  if((message as Message.messageService).pFlags.is_single) {
    bubble.classList.add('is-group-last');
  }

  return true;
}
