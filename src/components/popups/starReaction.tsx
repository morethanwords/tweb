/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '.';
import I18n, {i18n} from '../../lib/langPack';
import wrapPeerTitle, {PeerTitleTsx} from '../wrappers/peerTitle';
import {StarsBalance} from './stars';
import {Accessor, createEffect, createMemo, createSignal, For, onCleanup, onMount, Show} from 'solid-js';
import {easeOutCircApply} from '../../helpers/easing/easeOutCirc';
import RowTsx from '../rowTsx';
import CheckboxField from '../checkboxField';
import {replaceButtonIcon} from '../button';
import rootScope from '../../lib/rootScope.js';
import {Message, MessageReactor, PaidReactionPrivacy} from '../../layer.js';
import {AvatarNewTsx} from '../avatarNew.jsx';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId.js';
import {IconTsx} from '../iconTsx.jsx';
import classNames from '../../helpers/string/classNames.js';
import appImManager from '../../lib/appManagers/appImManager.js';
import {Ripple} from '../rippleTsx.jsx';
import RangeSelector from '../rangeSelector.js';
import clamp from '../../helpers/number/clamp.js';
import {fastRaf} from '../../helpers/schedulers.js';
import {AnimatedCounter} from '../animatedCounter.js';
import debounce from '../../helpers/schedulers/debounce.js';
import {Sparkles} from '../sparkles.js';
import ChatSendAs from '../chat/sendAs.js';
import Icon from '../icon.js';
import {attachClickEvent} from '../../helpers/dom/clickEvent.js';
import {lerp} from '../mediaEditor/utils.js';

export default class PopupStarReaction extends PopupElement {
  constructor(private peerId: PeerId, private mid: number) {
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

    const maximumStars = 2500;
    const [starsSliderValue, setStarsSliderValue] = createSignal<number>(0.1983); // 50 stars
    const [sendAsPeerId, setSendAsPeerId] = createSignal<'anonymous' | PeerId>(
      (!defaultSendAs || defaultSendAs._ === 'paidReactionPrivacyDefault') ? rootScope.myId :
        defaultSendAs._ === 'paidReactionPrivacyAnonymous' ? 'anonymous' :
          getPeerId(defaultSendAs.peer)
    );

    const starsCount = () => {
      const value$ = starsSliderValue();
      const v = easeOutCircApply(1 - value$, 1);
      return Math.max(1, Math.round((1 - v) * maximumStars));
    };


    attachClickEvent(this.btnConfirm, () => {
      const sendAsPeerId$ = sendAsPeerId();
      this.managers.appReactionsManager.sendReaction({
        sendAsPeerId: sendAsPeerId$ === 'anonymous' ? undefined : sendAsPeerId$,
        message,
        reaction: {_: 'reactionPaid'},
        count: starsCount()
      });
      this.destroy();
    });

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
      checked: defaultSendAs?._ !== 'paidReactionPrivacyAnonymous'
    });
    checkboxField.input.addEventListener('change', () => {
      setSendAsPeerId(checkboxField.checked ? sendAs.getSendAsPeerId() : 'anonymous')
    })

    const hintCounter = new AnimatedCounter({
      reverse: true,
      duration: 50
    });
    hintCounter.setCount(starsCount());

    const sendAs = new ChatSendAs({
      managers: this.managers,
      menuContainer: sendAsContainer,
      onReady: (el) => {
        sendAsContainer.replaceChildren(
          el,
          Icon('down')
        )
      },
      onChange: (peerId) => {
        if(sendAsPeerId() === 'anonymous') return
        setSendAsPeerId(peerId)
      },
      forPaidReaction: true
    })
    sendAs.setPeerId(message.peerId)
    sendAs.update(true)

    let hintRef!: HTMLDivElement;
    let tailRef!: HTMLDivElement;
    function updateHintPosition() {
      const hintWidth = hintRef.getBoundingClientRect().width;
      const parentWidth = hintRef.parentElement.getBoundingClientRect().width;

      const starsSliderValue$ = starsSliderValue();
      const sliderTipPosition = starsSliderValue$ * parentWidth + 30 * (1 - starsSliderValue$) - 15;

      const hintLeft = sliderTipPosition - hintWidth / 2
      const maxHintLeft = parentWidth - hintWidth - 8;
      const hintLeftClamped = clamp(hintLeft, 8, maxHintLeft)
      hintRef.style.setProperty('--left', hintLeftClamped + 'px');

      const halfTailWidth = 23;
      const tailLeft = sliderTipPosition - halfTailWidth;
      tailRef.style.setProperty('--tail-left', clamp(tailLeft, 0, parentWidth - 46) + 'px');
      tailRef.style.setProperty('--tail-left-relative', String(clamp((sliderTipPosition - hintLeftClamped) / hintWidth, 0, 1)));


      const leftProgress = tailLeft < 16 ? (8 + tailLeft) / 24 : 1;
      const tailRight = parentWidth - tailLeft - 46
      const rightProgress = tailRight < 16 ? (8 + tailRight) / 24 : 1;

      const radiusLeftBottom = leftProgress === 1 ? 24 : lerp(0, 24, leftProgress)
      const radiusRightBottom = rightProgress === 1 ? 24 : lerp(0, 24, rightProgress);

      hintRef.style.setProperty('--border-radius', `24px 24px ${radiusRightBottom}px ${radiusLeftBottom}px`);
      tailRef.style.setProperty('--translate-y', lerp(-20, 0, Math.min(leftProgress, rightProgress)) + 'px');
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

    const topSendersWithMe = createMemo(() => {
      const topSenders = message.reactions?.top_reactors.slice() ?? [];
      const sendAsPeerId$ = sendAsPeerId()

      if(sendAsPeerId$ === 'anonymous') {
        topSenders.push({
          _: 'messageReactor',
          pFlags: {my: true, anonymous: true},
          count: starsCount()
        });
      } else {
        const existingIdx = topSenders.findIndex((sender) => getPeerId(sender.peer_id) === sendAsPeerId$ && !sender.pFlags.anonymous);
        if(existingIdx !== -1) {
          topSenders[existingIdx] = {...topSenders[existingIdx], count: topSenders[existingIdx].count + starsCount()};
        } else {
          topSenders.push({
            _: 'messageReactor',
            pFlags: {my: true},
            peer_id: sendAsPeerId$ === rootScope.myId ?
                {_: 'peerUser', user_id: rootScope.myId} :
                {_: 'peerChannel', channel_id: sendAsPeerId$},
            count: starsCount()
          });
        }
      }


      return topSenders.sort((a, b) => b.count - a.count).slice(0, 3);
    })

    const sparkles = (
      <Sparkles
        count={clamp(starsCount(), 20, 100)}
        mode="progress"
      />
    )
    range.container.querySelector('.progress-line__filled').appendChild(sparkles as HTMLElement);

    return (
      <>
        <div class="popup-stars-slider">
          {range.container}
          <div class="popup-stars-slider-hint-tail" ref={tailRef} />
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
              {(sender: MessageReactor.messageReactor) => {
                const peerId = getPeerId(sender.peer_id);
                const anonymous = sender.pFlags.anonymous;
                let ret = (
                  <div
                    class={classNames('popup-star-reaction-senders-item', !anonymous && 'is-clickable')}
                    onClick={() => {
                      if(anonymous) return
                      appImManager.setInnerPeer({peerId})
                      this.hide();
                    }}
                  >
                    <div class="popup-star-reaction-senders-avatar-wrap">
                      {sender.pFlags.anonymous ? (
                        <div class="popup-star-reaction-senders-item-anonymous">
                          <img src="/assets/img/anon_paid_reaction.png" alt="Anonymous" />
                        </div>
                      ) : (
                        <AvatarNewTsx peerId={peerId} size={60} />
                      )}
                      <div class="popup-star-reaction-senders-amount">
                        <IconTsx icon="star" />
                        {sender.count}
                      </div>
                    </div>
                    {sender.pFlags.anonymous ? (
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
                  )
                }

                return ret;
              }}
            </For>
          </div>
        </div>
        <div class="popup-star-reaction-checkbox">
          <RowTsx
            classList={{'popup-star-reaction-checkbox-row': true}}
            checkboxField={checkboxField.label}
          />
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
