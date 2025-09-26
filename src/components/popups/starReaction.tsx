/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '.';
import I18n, {i18n} from '../../lib/langPack';
import wrapPeerTitle from '../wrappers/peerTitle';
import {StarsBalance} from './stars';
import {Accessor, createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show} from 'solid-js';
import {easeOutCircApply} from '../../helpers/easing/easeOutCirc';
import Row from '../rowTsx';
import CheckboxField from '../checkboxField';
import {replaceButtonIcon} from '../button';
import rootScope from '../../lib/rootScope';
import {Message, MessageReactor, PaidReactionPrivacy, Peer} from '../../layer';
import {AvatarNewTsx} from '../avatarNew';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import {IconTsx} from '../iconTsx';
import classNames from '../../helpers/string/classNames';
import appImManager from '../../lib/appManagers/appImManager';
import {Ripple} from '../rippleTsx';
import RangeSelector from '../rangeSelector';
import clamp from '../../helpers/number/clamp';
import {fastRaf} from '../../helpers/schedulers';
import {AnimatedCounter} from '../animatedCounter';
import debounce from '../../helpers/schedulers/debounce';
import {Sparkles} from '../sparkles';
import ChatSendAs from '../chat/sendAs';
import Icon from '../icon';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import {lerp} from '../mediaEditor/utils';
import {useAppState} from '../../stores/appState';
import {SEND_PAID_REACTION_ANONYMOUS_PEER_ID} from '../../lib/mtproto/mtproto_config';
import type Chat from '../chat/chat';
import {PENDING_PAID_REACTIONS} from '../chat/reactions';
import findAndSplice from '../../helpers/array/findAndSplice';
import {PeerTitleTsx} from '../peerTitleTsx';

export default class PopupStarReaction extends PopupElement {
  constructor(private peerId: PeerId, private mid: number, private chat: Chat) {
    super('popup-stars popup-star-reaction', {
      closable: true,
      overlayClosable: true,
      body: true,
      scrollable: true,
      footer: true,
      withConfirm: true
      // title: true
    });

    this.footer.classList.add('abitlarger');

    // * cancel all pending paid reactions
    PENDING_PAID_REACTIONS.forEach((it) => it.abortController.abort());

    this.construct();
  }

  private _construct(params: {
    defaultSendAs?: PaidReactionPrivacy,
    peerTitle: HTMLElement,
    message: Message.message
  }) {
    const {defaultSendAs, peerTitle, message} = params;
    this.footer.append(this.btnConfirm);
    this.body.after(this.footer);

    const sendText = new I18n.IntlElement({key: 'PaidReaction.Send'});

    this.btnConfirm.append(sendText.element);
    replaceButtonIcon(this.btnConfirm, 'star');

    const sendAsContainer = document.createElement('div');
    sendAsContainer.classList.add('popup-stars-send-as');
    this.header.append(sendAsContainer);

    this.header.append(StarsBalance() as HTMLElement);

    const [appState] = useAppState();
    const maximumStars = appState.appConfig.stars_paid_reaction_amount_max;
    const [starsSliderValue, setStarsSliderValue] = createSignal<number>(0.1); // 50 stars
    const [sendAsPeerId, setSendAsPeerId] = createSignal<PeerId>(
      (!defaultSendAs || defaultSendAs._ === 'paidReactionPrivacyDefault') ? rootScope.myId :
        defaultSendAs._ === 'paidReactionPrivacyAnonymous' ? SEND_PAID_REACTION_ANONYMOUS_PEER_ID :
          getPeerId(defaultSendAs.peer)
    );
    const topSenders = () => {
      return message.reactions?.top_reactors?.slice() ?? [];
    };

    let defaultSendAsPeerId: PeerId;
    const myReactor = topSenders().find((sender) => sender.pFlags.my);
    if(myReactor) {
      defaultSendAsPeerId = getPeerId(myReactor.peer_id);
    } else {
      defaultSendAsPeerId = rootScope.myId;
    }

    const starsCount = () => {
      const value$ = starsSliderValue();
      const v = easeOutCircApply(1 - value$, 1);
      return Math.max(1, Math.round((1 - v) * maximumStars));
    };

    attachClickEvent(this.btnConfirm, () => {
      this.chat.sendReaction({
        sendAsPeerId: sendAsPeerId(),
        message,
        reaction: {_: 'reactionPaid'},
        count: starsCount()
      });
      this.destroy();
    }, {listenerSetter: this.listenerSetter});

    const range = new RangeSelector({
      step: 0.0001,
      min: 0,
      max: 1,
      useProperty: true,
      offsetAxisValue: 30
    }, starsSliderValue());
    range.setListeners();
    range.setHandlers({
      onScrub: setStarsSliderValue
    });

    const checkboxField = new CheckboxField({
      text: 'StarsReactionShowMeInTopSenders',
      checked: myReactor ? !myReactor.pFlags.anonymous : defaultSendAs?._ !== 'paidReactionPrivacyAnonymous'
    });
    checkboxField.input.addEventListener('change', () => {
      const sendAsPeerId$ = checkboxField.checked ? sendAs.getSendAsPeerId() : SEND_PAID_REACTION_ANONYMOUS_PEER_ID;
      setSendAsPeerId(sendAsPeerId$);
    });

    const hintCounter = new AnimatedCounter({
      reverse: true,
      duration: 50,
      calculateWidth: true
    });
    hintCounter.setCount(starsCount());

    const sendAs = new ChatSendAs({
      managers: this.managers,
      menuContainer: sendAsContainer,
      onReady: (el) => {
        sendAsContainer.replaceChildren(
          el,
          Icon('down')
        );
      },
      onChange: (peerId) => {
        if(sendAsPeerId() === SEND_PAID_REACTION_ANONYMOUS_PEER_ID) return;
        setSendAsPeerId(peerId);
      },
      forPaidReaction: true,
      defaultPeerId: defaultSendAsPeerId
    });
    sendAs.setPeerId(message.peerId);
    sendAs.update(true);

    // * modify privacy
    if(myReactor) createEffect(on(sendAsPeerId, (sendAsPeerId$) => {
      this.managers.appReactionsManager.togglePaidReactionPrivacy(
        message.peerId,
        message.mid,
        sendAsPeerId$
      );
    }, {defer: true}));

    let hintRef!: HTMLDivElement;
    let tailRef!: HTMLDivElement;
    let tailContainerRef!: HTMLDivElement;
    function updateHintPosition() {
      const hintWidth = hintRef.getBoundingClientRect().width;
      const parentWidth = hintRef.parentElement.getBoundingClientRect().width;

      const starsSliderValue$ = starsSliderValue();
      const calculateSliderTipPosition = (value: number) => value * parentWidth + 30 * (1 - value) - 15;
      const sliderTipPosition = calculateSliderTipPosition(starsSliderValue$);

      const hintLeft = sliderTipPosition - hintWidth / 2;
      const hintPadding = 8;
      const minHintLeft = hintPadding;
      const maxHintLeft = parentWidth - hintWidth - hintPadding;
      const hintLeftClamped = clamp(hintLeft, minHintLeft, maxHintLeft);
      hintRef.style.setProperty('--left', hintLeftClamped + 'px');

      const tailWidth = 46;
      const halfTailWidth = tailWidth / 2;
      const extra = 15;
      const extraHalf = extra / 2;
      const tailLeft = sliderTipPosition - halfTailWidth;
      let tailLeft2 = tailLeft;
      const tailLeftMin = -extra;
      const tailLeftMax = parentWidth - tailWidth + extra;
      if((tailLeftMax - tailLeft) < extra) {
        tailLeft2 += lerp(0, extra, 1 - (tailLeftMax - tailLeft) / extra);
      }
      if(tailLeft < extraHalf) {
        tailLeft2 -= lerp(0, extra, 1 - -(-extraHalf - tailLeft) / extra);
      }
      const tailLeftClamped = clamp(tailLeft2, tailLeftMin, tailLeftMax);
      const tailInset1 = (tailLeftMax - tailLeft2) > extra ? 0 : (1 - Math.max(tailLeftMax - tailLeft2, 0) / extra * 0.633) * 50;
      const tailInset2 = tailLeft2 > extra ? 0 : (1 - Math.max(-(-extra - tailLeft2), 0) / extra * 0.595) * 50;
      tailContainerRef.style.setProperty('--tail-left', tailLeftClamped + 'px');
      tailContainerRef.style.clipPath = `inset(0 ${tailInset1}% 0 ${tailInset2}%)`;
      tailRef.style.setProperty('--tail-left-relative', String(clamp((sliderTipPosition - hintLeftClamped) / hintWidth, 0, 1)));


      const borderRadius = 24;
      const leftProgress = tailLeft2 < 16 ? Math.max(0, (7 + tailLeft2)) / borderRadius : 1;
      const tailRight = parentWidth - tailLeft2 - tailWidth;
      const rightProgress = tailRight < 16 ? Math.max(0, (8 + tailRight)) / borderRadius : 1;

      const radiusLeftBottom = leftProgress === 1 ? borderRadius : lerp(0, borderRadius, leftProgress);
      const radiusRightBottom = rightProgress === 1 ? borderRadius : lerp(0, borderRadius, rightProgress);

      hintRef.style.setProperty('--border-radius', `${borderRadius}px ${borderRadius}px ${radiusRightBottom}px ${radiusLeftBottom}px`);
    }

    const updateCounterDebounced = debounce(hintCounter.setCount.bind(hintCounter), 10, true, true);

    createEffect(() => {
      sendText.compareAndUpdate({
        args: [starsCount()]
      });
      fastRaf(updateHintPosition);
      updateCounterDebounced(starsCount());
    });
    onMount(() => {
      resizeObserver.observe(hintRef);
      fastRaf(updateHintPosition);
    });
    const resizeObserver = new ResizeObserver(updateHintPosition);

    const mySender = createMemo(() => {
      const existing = topSenders().find((sender) => sender.pFlags.my);
      const sendAsPeerId$ = sendAsPeerId();
      const anonymous = sendAsPeerId$ === SEND_PAID_REACTION_ANONYMOUS_PEER_ID;
      const peerId: Peer = anonymous ? undefined : (
        sendAsPeerId$ === rootScope.myId ?
          {_: 'peerUser', user_id: rootScope.myId} :
          {_: 'peerChannel', channel_id: sendAsPeerId$}
      );

      const reactor: MessageReactor = {
        _: 'messageReactor',
        pFlags: {my: true, anonymous: anonymous || undefined},
        peer_id: peerId,
        get count() {
          return (existing?.count || 0) + starsCount();
        }
      };

      return reactor;
    });

    const topSendersWithMe = createMemo(() => {
      const topSenders$ = topSenders();
      findAndSplice(topSenders$, (sender) => sender.pFlags.my);
      topSenders$.push(mySender());
      return topSenders$.sort((a, b) => b.count - a.count).slice(0, 3);
    });

    const sparkles = (
      <Sparkles
        count={clamp(starsCount(), 20, 100)}
        mode="progress"
      />
    );
    range.container.querySelector('.progress-line__filled').appendChild(sparkles as HTMLElement);

    const renderSender = (sender: MessageReactor.messageReactor) => {
      const peerId = getPeerId(sender.peer_id);
      const anonymous = sender.pFlags.anonymous;
      let ret = (
        <div
          class={classNames('popup-star-reaction-senders-item', !anonymous && 'is-clickable')}
          onClick={() => {
            if(anonymous) return;
            appImManager.setInnerPeer({
              peerId,
              stack: {
                peerId: this.peerId,
                mid: this.mid
              }
            });
            this.hide();
          }}
        >
          <div class="popup-star-reaction-senders-avatar-wrap">
            {anonymous ? (
              <div class="popup-star-reaction-senders-item-anonymous">
                <img src="assets/img/anon_paid_reaction.png" alt="Anonymous" />
              </div>
            ) : (
              <AvatarNewTsx peerId={peerId} size={60} />
            )}
            <div class="popup-star-reaction-senders-amount">
              <IconTsx icon="star" />
              {sender.count}
            </div>
          </div>
          {anonymous ? (
            <div class="peer-title">
              {i18n('AuthorHiddenShort')}
            </div>
          ) : (
            <PeerTitleTsx
              peerId={peerId}
            />
          )}
        </div>
      );

      if(!anonymous) {
        ret = (
          <Ripple>
            {ret}
          </Ripple>
        );
      }

      return ret;
    };

    return (
      <>
        <div class="popup-stars-slider">
          {range.container}
          <div class="popup-stars-slider-hint-tail-container" ref={tailContainerRef}>
            <div class="popup-stars-slider-hint-tail" ref={tailRef} />
          </div>
          <div class="popup-stars-slider-hint" ref={hintRef}>
            <IconTsx icon="star" />
            {hintCounter.container}
            <Sparkles mode="button" />
          </div>
        </div>
        <div class="popup-stars-title">{i18n('StarsReactionTitle')}</div>
        <div class="popup-stars-subtitle">{i18n('StarsReactionText', [peerTitle])}</div>
        <div class="popup-star-reaction-senders">
          <div class="popup-star-reaction-senders-delimiter">
            <div class="popup-star-reaction-senders-line"></div>
            <span class="popup-star-reaction-senders-text">
              {i18n('StarsReactionTopSenders')}
            </span>
            <div class="popup-star-reaction-senders-line"></div>
          </div>
          <div class="popup-star-reaction-senders-list">
            <For each={topSendersWithMe()}>
              {renderSender}
            </For>
          </div>
        </div>
        <div class="popup-star-reaction-checkbox">
          <Row class="popup-star-reaction-checkbox-row">
            <Row.CheckboxField>{checkboxField.label}</Row.CheckboxField>
          </Row>
        </div>
      </>
    );
  }

  private async construct() {
    const [peerTitle, message, privacy] = await Promise.all([
      wrapPeerTitle({peerId: this.peerId}),
      rootScope.managers.appMessagesManager.getMessageByPeer(this.peerId, this.mid),
      rootScope.managers.appReactionsManager.getPaidReactionPrivacy()
    ]);

    this.appendSolid(() => this._construct({
      peerTitle,
      message: message as Message.message,
      defaultSendAs: privacy
    }));
    this.show();
  }
}
