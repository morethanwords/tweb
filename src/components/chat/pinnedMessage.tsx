/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type ChatTopbar from '@components/chat/topbar';
import PopupPinMessage from '@components/popups/unpinMessage';
import PinnedMessageBorder from '@components/chat/pinnedMessageBorder';
import {wrapReplyDivAndCaption} from '@components/chat/replyContainer';
import rootScope from '@lib/rootScope';
import Chat from '@components/chat/chat';
import ListenerSetter from '@helpers/listenerSetter';
import {getHeavyAnimationPromise} from '@hooks/useHeavyAnimationCheck';
import {i18n} from '@lib/langPack';
import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import handleScrollSideEvent from '@helpers/dom/handleScrollSideEvent';
import debounce from '@helpers/schedulers/debounce';
import throttle from '@helpers/schedulers/throttle';
import {AppManagers} from '@lib/managers';
import {logger} from '@lib/logger';
import PopupElement from '@components/popups';
import {AnimatedSuper} from '@components/animatedSuper';
import {AnimatedCounter} from '@components/animatedCounter';
import {isMessageSensitive} from '@appManagers/utils/messages/isMessageRestricted';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import ButtonIcon from '@components/buttonIcon';
import {getMiddleware, MiddlewareHelper} from '@helpers/middleware';
import {getKeyboardButtonHandler} from '@components/wrappers/keyboardButton';
import getTextWidth from '@helpers/canvas/getTextWidth';
import {FontFullBold} from '@config/font';
import {KeyboardButton, Message} from '@layer';
import TopbarPlate, {createTopbarPlate, TopbarPlateController} from '@components/chat/topbarPlate';

const LOAD_COUNT = 50;
const LOAD_OFFSET = 5;

export type ChatPinnedMessageController = TopbarPlateController & {
  /** Mutable "user has hidden the plate" flag (matches old `pinnedMessage.hidden`). */
  setUserHidden: (hidden: boolean) => void,
  isUserHidden: () => boolean,
  /** Read-only "currently following a click — ignore scroll" flag. */
  isLocked: () => boolean,

  /** Push the bottom-visible bubble's mid; recomputes which pin to show. */
  testMid: (mid: number, lastScrollDirection?: number) => void,
  setCorrectIndex: (lastScrollDirection?: number) => void,
  setCorrectIndexThrottled: (lastScrollDirection?: number) => void,
  handleFollowingPinnedMessage: () => Promise<void>,
  unsetScrollDownListener: (refreshPosition?: boolean) => void,

  /**
   * Discussion-mode: forces the plate to display a single static message
   * (the thread root) without paging or scroll tracking.
   */
  setStaticMessage: (mid: number) => void
};

export default function createChatPinnedMessage(
  topbar: ChatTopbar,
  chat: Chat,
  managers: AppManagers
): ChatPinnedMessageController {
  const log = logger('PM');
  const debug = true;

  // Imperative animation pieces — kept as-is per refactor scope; only refs are
  // threaded through JSX below.
  const animatedSubtitle = new AnimatedSuper();
  const animatedMedia = new AnimatedSuper();
  animatedMedia.container.classList.add('pinned-message-media-container');
  const animatedCounter = new AnimatedCounter({reverse: true});
  const pinnedMessageBorder = new PinnedMessageBorder();
  let wasPinnedIndex = 0;
  let wasPinnedMediaIndex = 0;
  let customButtonMiddleware: MiddlewareHelper | undefined;

  // Listeners — top-level for the lifetime of this plate, plus a transient
  // one for the wait-for-bottom-scroll flow.
  const listenerSetter = new ListenerSetter();
  let scrollDownListenerSetter: ListenerSetter | undefined;

  // State (closure vars — were class fields).
  let mids: number[] = [];
  let offsetIndex = 0;
  let count = 0;
  let pinnedIndex = -1;
  let pinnedMid = 0;
  let pinnedMaxMid = 0;
  let loadedTop = false;
  let loadedBottom = false;
  let waitForScrollBottom = false;
  let getCurrentIndexPromise: Promise<any> | undefined;
  let loading = false;
  let userHidden = false;
  let locked = false;
  const isStatic = !chat.isPinnedMessagesNeeded();

  // Captured from inside the plate's render fn — drives `hide` class.
  let plateSetHidden!: (hidden: boolean) => void;

  // ────────────────────────────────────────────────────────────────────────
  // DOM bits that live as siblings of the Body inside the plate root.
  // ────────────────────────────────────────────────────────────────────────

  const menu = ButtonMenuToggle({
    direction: 'bottom-right',
    buttons: [{
      icon: 'pinlist',
      text: 'PinnedMessages',
      onClick: () => {
        topbar.openPinned(true);
      },
      verify: () => true
    }, {
      icon: 'unpin',
      text: 'UnpinMessage',
      onClick: () => {
        PopupElement.createPopup(PopupPinMessage, chat.peerId, pinnedMid, true);
      },
      verify: () => managers.appPeersManager.canPinMessage(chat.peerId)
    }, {
      icon: 'eyecross_outline',
      text: 'Popup.Unpin.HideTitle',
      onClick: () => {
        PopupElement.createPopup(PopupPinMessage, chat.peerId, 0, true);
      },
      verify: async() => !(await managers.appPeersManager.canPinMessage(chat.peerId))
    }],
    listenerSetter,
    icon: 'pin'
  });
  menu.classList.add('pinned-message-menu');

  const btnUnpin = ButtonIcon('close pinned-message-unpin');
  attachClickEvent(btnUnpin, async(e) => {
    cancelEvent(e);
    const canPin = await managers.appPeersManager.canPinMessage(chat.peerId);
    PopupElement.createPopup(
      PopupPinMessage,
      chat.peerId,
      canPin ? pinnedMid : 0,
      true
    );
  }, {listenerSetter});

  const actionContainer = document.createElement('div');
  actionContainer.classList.add('pinned-message-action');
  actionContainer.append(btnUnpin);

  // ────────────────────────────────────────────────────────────────────────
  // Plate
  // ────────────────────────────────────────────────────────────────────────

  const plate = createTopbarPlate({
    modifier: 'message',
    height: 48,
    initiallyHidden: true,
    onVisibilityChange: () => topbar.setFloating(),
    render: ({setHidden}) => {
      plateSetHidden = setHidden;

      return (
        <>
          {menu}
          <TopbarPlate.Body
            class="hover-primary-effect"
            onClick={() => followPinnedMessage(pinnedMid)}
          >
            {pinnedMessageBorder.render(1, 0)}
            <TopbarPlate.Content>
              {animatedMedia.container}
              <TopbarPlate.Title>
                {i18n('PinnedMessage')}
                {' '}
                {animatedCounter.container}
              </TopbarPlate.Title>
              <TopbarPlate.Subtitle>
                {animatedSubtitle.container}
              </TopbarPlate.Subtitle>
            </TopbarPlate.Content>
          </TopbarPlate.Body>
          {actionContainer}
        </>
      );
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // rootScope listeners
  // ────────────────────────────────────────────────────────────────────────

  listenerSetter.add(rootScope)('peer_pinned_messages', ({peerId}) => {
    if(peerId !== chat.peerId) return;
    if(userHidden) {
      userHidden = false;
      plateSetHidden(false);
    }

    loadedTop = loadedBottom = false;
    pinnedIndex = -1;
    pinnedMid = 0;
    count = 0;
    mids = [];
    offsetIndex = 0;
    pinnedMaxMid = 0;
    setCorrectIndex(0);
  });

  listenerSetter.add(rootScope)('peer_pinned_hidden', ({peerId}) => {
    if(peerId !== chat.peerId) return;
    userHidden = true;
    plateSetHidden(true);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Implementation
  // ────────────────────────────────────────────────────────────────────────

  const setPinnedMessageDebounced = debounce(() => _setPinnedMessage(), 100, true, true);

  function setCorrectIndex(lastScrollDirection?: number) {
    const bound = log.bindPrefix('setCorrectIndex');
    if(isStatic) {
      debug && bound('not needed, static');
    }

    if(locked || userHidden) {
      debug && bound('not needed 1');
      return;
    }

    if((loadedBottom || loadedTop) && !count) {
      debug && bound('not needed 2');
      return;
    }

    const el = chat.bubbles.getBubbleByPoint('bottom');
    if(!el) {
      debug && bound('no element');
      return;
    }

    const mid = el.dataset.mid;
    debug && bound('direction', lastScrollDirection, 'mid', mid);
    if(mid !== undefined) {
      testMid(+mid, lastScrollDirection);
    }
  }

  const setCorrectIndexThrottled = throttle(setCorrectIndex, 100, false);

  function testMid(mid: number, lastScrollDirection?: number) {
    if(isStatic) return;
    if(userHidden) return;

    let currentIndex: number = mids.findIndex((_mid) => _mid <= mid);
    if(currentIndex !== -1 && !isNeededMore(currentIndex)) {
      currentIndex += offsetIndex;
    } else if(loadedTop && mid < mids[mids.length - 1]) {
      currentIndex = mids.length - 1 + offsetIndex;
    } else {
      return getCurrentIndexPromise ??= getCurrentIndex(mid, lastScrollDirection !== undefined);
    }

    const changed = pinnedIndex !== currentIndex;
    if(changed) {
      if(waitForScrollBottom && lastScrollDirection !== undefined) {
        if(pinnedIndex === 0 || pinnedIndex > currentIndex) { // если не скроллил вниз и пытается поставить нижний пиннед - выйти
          return;
        }
      }

      pinnedIndex = currentIndex;
      pinnedMid = mids.find((_mid) => _mid <= mid) || mids[mids.length - 1];
      return setPinnedMessageDebounced();
    }
  }

  function isNeededMore(currentIndex: number) {
    return (count > LOAD_COUNT &&
      (
        (!loadedBottom && currentIndex <= LOAD_OFFSET) ||
        (!loadedTop && (count - 1 - currentIndex) <= LOAD_OFFSET)
      )
    );
  }

  async function getCurrentIndex(mid: number, correctAfter = true) {
    if(loading) return;
    loading = true;

    try {
      const bound = debug ? log.bindPrefix('getCurrentIndex') : undefined;
      bound && bound('start', mid, correctAfter);

      let gotRest = false;
      const promises = [
        managers.appMessagesManager.getHistory({
          peerId: chat.peerId,
          inputFilter: {_: 'inputMessagesFilterPinned'},
          offsetId: mid,
          limit: LOAD_COUNT,
          backLimit: LOAD_COUNT,
          threadId: chat.threadId,
          needRealOffsetIdOffset: true
        }).then((r) => {
          gotRest = true;
          return r;
        })
      ];

      if(!pinnedMaxMid) {
        const promise = managers.appMessagesManager.getPinnedMessage(
          chat.peerId,
          chat.threadId
        ).then((p) => {
          if(!p.maxId) return;
          pinnedMaxMid = p.maxId;

          if(!gotRest && correctAfter) {
            mids = [pinnedMaxMid];
            count = p.count;
            pinnedIndex = 0;
            pinnedMid = mids[0];
            setPinnedMessageDebounced();
          }
        });

        promises.push(promise as any);
      }

      const result = (await Promise.all(promises))[0];

      const history = result.history;

      let backLimited = history.findIndex((_mid) => _mid <= mid);
      if(backLimited === -1) {
        backLimited = history.length;
      }

      offsetIndex = Math.max(0, result.offsetIdOffset) ? result.offsetIdOffset - backLimited : 0;
      mids = history.slice();
      count = result.count;

      if(!count) {
        plateSetHidden(true);
      }

      loadedTop = (offsetIndex + mids.length) === count;
      loadedBottom = !offsetIndex;

      bound && bound('result', mid, result, backLimited, offsetIndex, loadedTop, loadedBottom);
    } catch(err) {
      log.error('getCurrentIndex error', err);
    }

    loading = false;

    if(locked) {
      testMid(mid);
    } else if(correctAfter) {
      setCorrectIndex(0);
    }

    getCurrentIndexPromise = undefined;
  }

  function setScrollDownListener() {
    waitForScrollBottom = true;

    if(!scrollDownListenerSetter) {
      scrollDownListenerSetter = new ListenerSetter();
      handleScrollSideEvent(chat.bubbles.scrollable.container, 'bottom', () => {
        unsetScrollDownListener();
      }, scrollDownListenerSetter);
    }
  }

  function unsetScrollDownListener(refreshPosition = true) {
    waitForScrollBottom = false;

    if(scrollDownListenerSetter) {
      scrollDownListenerSetter.removeAll();
      scrollDownListenerSetter = undefined;
    }

    if(refreshPosition) {
      setCorrectIndex(0);
    }
  }

  async function handleFollowingPinnedMessage() {
    locked = true;

    debug && log('handleFollowingPinnedMessage');
    try {
      setScrollDownListener();

      const setPeerPromise = chat.setPeerPromise;
      if(setPeerPromise instanceof Promise) {
        await setPeerPromise;
      }

      await getHeavyAnimationPromise();

      getCurrentIndexPromise && await getCurrentIndexPromise;

      debug && log('handleFollowingPinnedMessage: unlock');
      locked = false;
    } catch(err) {
      log.error('handleFollowingPinnedMessage error:', err);

      locked = false;
      waitForScrollBottom = false;
      setCorrectIndex(0);
    }
  }

  function followPinnedMessage(mid: number) {
    const message = chat.getMessage(mid);
    if(!message) {
      return;
    }

    chat.setMessageId({lastMsgId: mid});
    (chat.setPeerPromise || Promise.resolve()).then(() => { // * debounce fast clicker
      handleFollowingPinnedMessage();
      testMid(pinnedIndex >= (count - 1) ? pinnedMaxMid : mid - 1);
    });
  }

  async function _setPinnedMessage() {
    if(count) {
      const message = chat.getMessage(pinnedMid);

      const isLast = pinnedIndex === 0;
      animatedCounter.container.classList.toggle('is-last', isLast);
      if(!isLast) {
        animatedCounter.setCount(count - pinnedIndex);
      }

      plateSetHidden(false);

      const fromTop = pinnedIndex > wasPinnedIndex;
      debug && log('setPinnedMessage: fromTop', fromTop, pinnedIndex, wasPinnedIndex);

      const writeTo = animatedSubtitle.getRow(pinnedIndex);
      const writeMediaTo = animatedMedia.getRow(pinnedIndex);
      writeMediaTo.classList.add('pinned-message-media');
      const loadPromises: Promise<any>[] = [];
      const isMediaSet = await wrapReplyDivAndCaption({
        titleEl: null,
        subtitleEl: writeTo,
        message,
        mediaEl: writeMediaTo,
        loadPromises,
        animationGroup: chat.animationGroup,
        isSensitive: chat.isSensitive || isMessageSensitive(message),
        textColor: 'primary-text-color',
        canTranslate: !message.pFlags.out,
        middleware: animatedSubtitle.getRow(pinnedIndex).middlewareHelper.get()
      });

      await Promise.all(loadPromises);

      plate.container.classList.toggle('is-media', isMediaSet);

      animatedSubtitle.animate(pinnedIndex, wasPinnedIndex);
      if(isMediaSet) {
        animatedMedia.animate(pinnedIndex, wasPinnedMediaIndex);
        wasPinnedMediaIndex = pinnedIndex;
      } else {
        animatedMedia.clearRows();
      }

      pinnedMessageBorder.render(count, count - pinnedIndex - 1);
      wasPinnedIndex = pinnedIndex;
      plate.container.dataset.mid = '' + message.mid;
      updateActionButton(message as Message.message);
    } else {
      plateSetHidden(true);
      wasPinnedIndex = 0;
      updateActionButton();
    }

    plate.container.classList.toggle('is-many', count > 1);
  }

  function getSingleInlineButton(message?: Message.message): KeyboardButton | undefined {
    const replyMarkup = message?.reply_markup;
    if(replyMarkup?._ !== 'replyInlineMarkup') return;
    const rows = replyMarkup.rows;
    if(rows.length !== 1 || rows[0].buttons.length !== 1) return;
    const button = rows[0].buttons[0];
    return button.text ? button : undefined;
  }

  function updateActionButton(message?: Message.message) {
    const button = getSingleInlineButton(message);

    const oldBtn = actionContainer.querySelector(
      '.pinned-container-action-button:not(.is-leaving)'
    ) as HTMLElement | null;
    const oldMiddleware = customButtonMiddleware;
    customButtonMiddleware = undefined;

    let newBtn: HTMLElement | undefined;

    if(button) {
      const middleware = getMiddleware();
      const handler = getKeyboardButtonHandler({
        button,
        chat,
        message,
        wrapOptions: {
          middleware: middleware.get(),
          textColor: 'white'
        }
      });

      if(handler) {
        newBtn = createCustomActionButton({
          text: handler.text,
          onClick: handler.onClick,
          as: handler.as
        });
        handler.refCallbacks.forEach((cb) => cb(newBtn));
        customButtonMiddleware = middleware;
      } else {
        middleware.destroy();
      }
    }

    if(newBtn) {
      actionContainer.append(newBtn);

      // Measure the actual button width: text + horizontal padding (1rem each side = 32px),
      // capped at the button's max-width (10rem = 160px). Add a small gap so the wrapper
      // text doesn't run flush against the button.
      const BUTTON_PADDING_X = 32;
      const BUTTON_MAX_WIDTH = 160;
      const TEXT_TO_BUTTON_GAP = 8;
      const textWidth = getTextWidth(button.text, FontFullBold);
      const buttonWidth = Math.min(Math.ceil(textWidth) + BUTTON_PADDING_X, BUTTON_MAX_WIDTH) - 48;
      plate.container.style.setProperty('--action-button-width', `${buttonWidth + TEXT_TO_BUTTON_GAP}px`);
    }

    plate.container.classList.toggle('has-custom-action-button', !!newBtn);

    if(oldBtn) {
      oldBtn.classList.add('is-leaving');
      setTimeout(() => {
        oldBtn.remove();
        oldMiddleware?.destroy();
      }, 200);
    }
  }

  /**
   * Build the cross-fading action button. The TopbarPlate.ActionButton primitive
   * is intentionally JSX-only; here we need an imperative one because the swap
   * (old.is-leaving + remove after 200ms) is driven from `updateActionButton`.
   */
  function createCustomActionButton(opts: {
    text: HTMLElement | DocumentFragment | string,
    onClick?: (e: Event) => void,
    as?: 'button' | 'a'
  }): HTMLElement {
    const btn = document.createElement(opts.as || 'button');
    btn.classList.add(
      'pinned-container-action-button',
      'pinned-message-action-button',
      'text-overflow-no-wrap'
    );
    if(typeof opts.text === 'string') {
      btn.textContent = opts.text;
    } else {
      btn.append(opts.text);
    }
    if(opts.onClick) {
      attachClickEvent(btn, opts.onClick, {listenerSetter});
    }
    return btn;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Controller
  // ────────────────────────────────────────────────────────────────────────

  const controller: ChatPinnedMessageController = {
    container: plate.container,
    height: plate.height,
    hidden: plate.hidden,
    setHidden: plate.setHidden,
    isVisible: plate.isVisible,
    isUserHidden: () => userHidden,
    setUserHidden: (v: boolean) => {
      userHidden = v;
      if(v) plateSetHidden(true);
      else if(count > 0) plateSetHidden(false);
    },
    isLocked: () => locked,
    testMid,
    setCorrectIndex,
    setCorrectIndexThrottled,
    handleFollowingPinnedMessage,
    unsetScrollDownListener,
    setStaticMessage: (mid: number) => {
      pinnedMid = mid;
      count = 1;
      pinnedIndex = 0;
      _setPinnedMessage();
    },
    destroy: () => {
      animatedMedia.destroy();
      animatedSubtitle.destroy();
      animatedCounter.destroy();
      customButtonMiddleware?.destroy();
      customButtonMiddleware = undefined;
      listenerSetter.removeAll();
      unsetScrollDownListener(false);
      plate.destroy();
    }
  };

  return controller;
}
