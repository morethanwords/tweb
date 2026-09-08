import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {i18n} from '@lib/langPack';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {StarsBalance} from '@components/popups/stars';
import {DelimiterWithText} from '@components/chat/giveaway';
import {createEffect, createMemo, createSignal, For, on, onCleanup} from 'solid-js';
import {easeOutCircApply} from '@helpers/easing/easeOutCirc';
import Row from '@components/rowTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import rootScope from '@lib/rootScope';
import {Message, MessageReactor, Peer} from '@layer';
import {AvatarNewTsx} from '@components/avatarNew';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {IconTsx} from '@components/iconTsx';
import classNames from '@helpers/string/classNames';
import appImManager from '@lib/appImManager';
import {Ripple} from '@components/rippleTsx';
import clamp from '@helpers/number/clamp';
import {fastRaf} from '@helpers/schedulers';
import {AnimatedCounter} from '@components/animatedCounter';
import debounce from '@helpers/schedulers/debounce';
import {Sparkles} from '@components/sparkles';
import ChatSendAs from '@components/chat/sendAs';
import Icon from '@components/icon';
import {useAppState} from '@stores/appState';
import {SEND_PAID_REACTION_ANONYMOUS_PEER_ID} from '@appManagers/constants';
import type Chat from '@components/chat/chat';
import {PENDING_PAID_REACTIONS} from '@components/chat/reactions';
import findAndSplice from '@helpers/array/findAndSplice';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import {LimitLineTsx} from '@components/limitLineTsx';
import {I18nTsx} from '@helpers/solid/i18n';
import Scrollable from '@components/scrollable2';

export default async function showStarReactionPopup(peerId: PeerId, mid: number, chat: Chat) {
  // * cancel all pending paid reactions
  PENDING_PAID_REACTIONS.forEach((it) => it.abortController.abort());

  const [peerTitle, message, defaultSendAs] = await Promise.all([
    wrapPeerTitle({peerId}),
    rootScope.managers.appMessagesManager.getMessageByPeer(peerId, mid) as Promise<Message.message>,
    rootScope.managers.appReactionsManager.getPaidReactionPrivacy()
  ]);

  // the senders list opens a profile, and that has to close the popup from outside a button
  const [show, setShow] = createSignal(true);

  createPopup(() => {
    const managers = rootScope.managers;
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

    const myReactor = topSenders().find((sender) => sender.pFlags.my);
    const defaultSendAsPeerId: PeerId = myReactor ? getPeerId(myReactor.peer_id) : rootScope.myId;

    const starsCount = () => {
      const value$ = starsSliderValue();
      const v = easeOutCircApply(1 - value$, 1);
      return Math.max(1, Math.round((1 - v) * maximumStars));
    };

    const hintCounter = new AnimatedCounter({
      reverse: true,
      duration: 50,
      calculateWidth: true
    });
    hintCounter.setCount(starsCount());

    const updateCounterDebounced = debounce((val: number) => fastRaf(() => hintCounter.setCount(val)), 10, true, true);
    createEffect(() => {
      updateCounterDebounced(starsCount());
    });

    // the menu anchors on this element, so it has to exist before `ChatSendAs` is constructed
    const sendAsContainer = document.createElement('div');
    sendAsContainer.classList.add('popup-stars-send-as');

    const sendAs = new ChatSendAs({
      managers,
      menuContainer: sendAsContainer,
      onReady: (el) => {
        sendAsContainer.replaceChildren(
          el,
          Icon('down')
        );
      },
      onChange: (chosenPeerId) => {
        if(sendAsPeerId() === SEND_PAID_REACTION_ANONYMOUS_PEER_ID) return;
        setSendAsPeerId(chosenPeerId);
      },
      forPaidReaction: true,
      defaultPeerId: defaultSendAsPeerId
    });
    sendAs.setPeerId(message.peerId);
    sendAs.update(true);

    onCleanup(() => {
      updateCounterDebounced.clearTimeout();
      hintCounter.destroy();
      sendAs.destroy();
    });

    // * modify privacy
    if(myReactor) createEffect(on(sendAsPeerId, (sendAsPeerId$) => {
      managers.appReactionsManager.togglePaidReactionPrivacy(
        message.peerId,
        message.mid,
        sendAsPeerId$
      );
    }, {defer: true}));

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

    const renderSender = (sender: MessageReactor.messageReactor) => {
      const senderPeerId = getPeerId(sender.peer_id);
      const anonymous = sender.pFlags.anonymous;
      let ret = (
        <div
          class={classNames('popup-star-reaction-senders-item', !anonymous && 'is-clickable')}
          onClick={() => {
            if(anonymous) return;
            appImManager.setInnerPeer({
              peerId: senderPeerId,
              stack: {peerId, mid}
            });
            setShow(false);
          }}
        >
          <div class="popup-star-reaction-senders-avatar-wrap">
            {anonymous ? (
              <div class="popup-star-reaction-senders-item-anonymous">
                <img src="assets/img/anon_paid_reaction.png" alt="Anonymous" />
              </div>
            ) : (
              <AvatarNewTsx peerId={senderPeerId} size={60} />
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
              peerId={senderPeerId}
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
      <PopupElement
        class="popup-stars popup-star-reaction"
        closable
        old
        show={show()}
      >
        <PopupElement.Header>
          <PopupElement.CloseButton />
          {sendAsContainer}
          <StarsBalance />
        </PopupElement.Header>
        <PopupElement.Body>
          <Scrollable withBorders="both">
            <LimitLineTsx
              class="popup-stars-slider"
              filledProgressElement={sparkles as HTMLElement}
              progress={starsSliderValue()}
              onScrub={setStarsSliderValue}
              hint={
                <div class="popup-stars-slider-hint">
                  {hintCounter.container}
                  <Sparkles mode="button" />
                </div>
              }
              hintIcon="star"
            />
            <div class="popup-stars-title">{i18n('StarsReactionTitle')}</div>
            <div class="popup-stars-subtitle">{i18n('StarsReactionText', [peerTitle])}</div>
            <div class="popup-star-reaction-senders">
              <DelimiterWithText
                langKey="StarsReactionTopSenders"
                class="popup-star-reaction-senders-delimiter"
                textClass="popup-star-reaction-senders-text"
              />
              <div class="popup-star-reaction-senders-list">
                <For each={topSendersWithMe()}>
                  {renderSender}
                </For>
              </div>
            </div>
            <div class="popup-star-reaction-checkbox">
              <Row class="popup-star-reaction-checkbox-row">
                <Row.CheckboxField>
                  <CheckboxFieldTsx
                    checked={myReactor ? !myReactor.pFlags.anonymous : defaultSendAs?._ !== 'paidReactionPrivacyAnonymous'}
                    onChange={(checked) => {
                      setSendAsPeerId(checked ? sendAs.getSendAsPeerId() : SEND_PAID_REACTION_ANONYMOUS_PEER_ID);
                    }}
                  />
                </Row.CheckboxField>
                <Row.Title>{i18n('StarsReactionShowMeInTopSenders')}</Row.Title>
              </Row>
            </div>
          </Scrollable>
        </PopupElement.Body>
        <PopupElement.Footer>
          <PopupElement.FooterButton
            iconRight="star"
            callback={() => {
              // fire and forget: the popup closes right away, as it did before
              chat.sendReaction({
                sendAsPeerId: sendAsPeerId(),
                message,
                reaction: {_: 'reactionPaid'},
                count: starsCount()
              });
            }}
          >
            <I18nTsx key="PaidReaction.Send" args={['' + starsCount()]} />
          </PopupElement.FooterButton>
        </PopupElement.Footer>
      </PopupElement>
    );
  });
}
