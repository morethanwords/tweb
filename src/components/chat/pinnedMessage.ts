/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type ChatTopbar from './topbar';
import PopupPinMessage from '../popups/unpinMessage';
import PinnedContainer from './pinnedContainer';
import PinnedMessageBorder from './pinnedMessageBorder';
import ReplyContainer, {wrapReplyDivAndCaption} from './replyContainer';
import rootScope from '../../lib/rootScope';
import Chat from './chat';
import ListenerSetter from '../../helpers/listenerSetter';
import ButtonIcon from '../buttonIcon';
import {getHeavyAnimationPromise} from '../../hooks/useHeavyAnimationCheck';
import {i18n} from '../../lib/langPack';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import handleScrollSideEvent from '../../helpers/dom/handleScrollSideEvent';
import debounce from '../../helpers/schedulers/debounce';
import throttle from '../../helpers/schedulers/throttle';
import {AppManagers} from '../../lib/appManagers/managers';
import {Message} from '../../layer';
import {logger} from '../../lib/logger';
import PopupElement from '../popups';
import {AnimatedSuper} from '../animatedSuper';
import {AnimatedCounter} from '../animatedCounter';

const ALWAYS_FLOATING = false;

export default class ChatPinnedMessage {
  private static LOAD_COUNT = 50;
  private static LOAD_OFFSET = 5;

  public pinnedMessageContainer: PinnedContainer;
  private pinnedMessageBorder: PinnedMessageBorder;

  private pinnedMaxMid = 0;
  public pinnedMid = 0;
  public pinnedIndex = -1;
  private wasPinnedIndex = 0;
  private wasPinnedMediaIndex = 0;

  public locked = false;
  private waitForScrollBottom = false;

  public count = 0;
  private mids: number[] = [];
  private offsetIndex = 0;

  private loading = false;
  private loadedBottom = false;
  private loadedTop = false;

  private animatedSubtitle: AnimatedSuper;
  private animatedMedia: AnimatedSuper;
  private animatedCounter: AnimatedCounter;

  private listenerSetter: ListenerSetter;
  private scrollDownListenerSetter: ListenerSetter;

  public hidden = false;

  private getCurrentIndexPromise: Promise<any>;
  private btnOpen: HTMLButtonElement;

  private setPinnedMessage: () => void;

  private isStatic: boolean;

  private debug: boolean;

  public setCorrectIndexThrottled: (lastScrollDirection?: number) => void;

  private log: ReturnType<typeof logger>;

  constructor(private topbar: ChatTopbar, private chat: Chat, private managers: AppManagers) {
    this.listenerSetter = new ListenerSetter();
    this.log = logger('PM');
    this.debug = true;
    this.isStatic = false;

    const dAC = new ReplyContainer('pinned-message');
    this.pinnedMessageContainer = new PinnedContainer({
      topbar,
      chat,
      listenerSetter: this.listenerSetter,
      className: 'message',
      divAndCaption: dAC,
      onClose: async() => {
        if(await managers.appPeersManager.canPinMessage(this.chat.peerId)) {
          PopupElement.createPopup(PopupPinMessage, this.chat.peerId, this.pinnedMid, true);
        } else {
          PopupElement.createPopup(PopupPinMessage, this.chat.peerId, 0, true);
        }

        return false;
      },
      floating: ALWAYS_FLOATING,
      height: 52
    });

    this.pinnedMessageBorder = new PinnedMessageBorder();
    dAC.border.replaceWith(this.pinnedMessageBorder.render(1, 0));

    this.animatedSubtitle = new AnimatedSuper();
    dAC.subtitle.append(this.animatedSubtitle.container);

    this.animatedMedia = new AnimatedSuper();
    this.animatedMedia.container.classList.add('pinned-message-media-container');
    dAC.content.prepend(this.animatedMedia.container);

    this.animatedCounter = new AnimatedCounter({reverse: true});
    dAC.title.append(i18n('PinnedMessage'), ' ', this.animatedCounter.container);

    const btnClose = this.pinnedMessageContainer.btnClose.cloneNode(true) as HTMLElement;
    this.pinnedMessageContainer.attachOnCloseEvent(btnClose);
    dAC.container.prepend(btnClose);

    this.btnOpen = ButtonIcon('pinlist pinned-container-close pinned-message-pinlist', {noRipple: true});

    this.pinnedMessageContainer.wrapperUtils.prepend(this.btnOpen);

    attachClickEvent(this.btnOpen, (e) => {
      cancelEvent(e);
      this.topbar.openPinned(true);
    }, {listenerSetter: this.listenerSetter});

    this.listenerSetter.add(rootScope)('peer_pinned_messages', ({peerId}) => {
      if(peerId === this.chat.peerId) {
        // this.wasPinnedIndex = 0;
        // setTimeout(() => {
        if(this.hidden) {
          this.pinnedMessageContainer.toggle(this.hidden = false);
        }

        this.loadedTop = this.loadedBottom = false;
        this.pinnedIndex = -1;
        this.pinnedMid = 0;
        this.count = 0;
        this.mids = [];
        this.offsetIndex = 0;
        this.pinnedMaxMid = 0;
        this.setCorrectIndex(0);
        // }, 300);
      }
    });

    this.listenerSetter.add(rootScope)('peer_pinned_hidden', ({peerId}) => {
      if(peerId === this.chat.peerId) {
        this.pinnedMessageContainer.toggle(this.hidden = true);
      }
    });

    // * 200 - no lags
    // * 100 - need test
    this.setPinnedMessage = debounce(() => this._setPinnedMessage(), 100, true, true);
    this.setCorrectIndexThrottled = throttle(this.setCorrectIndex.bind(this), 100, false);

    this.isStatic = !this.chat.isPinnedMessagesNeeded();
  }

  public destroy() {
    this.animatedMedia.destroy();
    this.animatedSubtitle.destroy();
    this.animatedCounter.destroy();
    this.pinnedMessageContainer.container.remove();
    this.pinnedMessageContainer.toggle(true);
    this.listenerSetter.removeAll();
    this.unsetScrollDownListener(false);
  }

  public setCorrectIndex(lastScrollDirection?: number) {
    if(this.isStatic) return;
    // return;

    this.debug && this.log('setCorrectIndex', lastScrollDirection);

    if(this.locked || this.hidden/*  || this.chat.setPeerPromise || this.chat.bubbles.messagesQueuePromise */) {
      return;
    }

    if((this.loadedBottom || this.loadedTop) && !this.count) {
      return;
    }

    // const perf = performance.now();
    const el = this.chat.bubbles.getBubbleByPoint('bottom');
    // this.log('setCorrectIndex: get last element perf:', performance.now() - perf, el);
    if(!el) return;

    // return;

    const mid = el.dataset.mid;
    if(mid !== undefined) {
      // this.log('setCorrectIndex will test mid:', mid);
      this.testMid(+mid, lastScrollDirection);
    }
  }

  public testMid(mid: number, lastScrollDirection?: number) {
    if(this.isStatic) return;

    // if(lastScrollDirection !== undefined) return;
    if(this.hidden) return;

    // this.log('testMid', mid);

    let currentIndex: number = this.mids.findIndex((_mid) => _mid <= mid);
    if(currentIndex !== -1 && !this.isNeededMore(currentIndex)) {
      currentIndex += this.offsetIndex;
    } else if(this.loadedTop && mid < this.mids[this.mids.length - 1]) {
      // currentIndex = 0;
      currentIndex = this.mids.length - 1 + this.offsetIndex;
    } else {
      return this.getCurrentIndexPromise ??= this.getCurrentIndex(mid, lastScrollDirection !== undefined);
    }

    // const idx = Math.max(0, this.mids.indexOf(mid));

    /* if(currentIndex === this.count) {
      currentIndex = 0;
    } */

    // this.log('testMid: pinned currentIndex', currentIndex, mid);

    const changed = this.pinnedIndex !== currentIndex;
    if(changed) {
      if(this.waitForScrollBottom && lastScrollDirection !== undefined) {
        if(this.pinnedIndex === 0 || this.pinnedIndex > currentIndex) { // если не скроллил вниз и пытается поставить нижний пиннед - выйти
          return;
        }
      }

      this.pinnedIndex = currentIndex;
      this.pinnedMid = this.mids.find((_mid) => _mid <= mid) || this.mids[this.mids.length - 1];
      return this.setPinnedMessage();
    }
  }

  private isNeededMore(currentIndex: number) {
    return (this.count > ChatPinnedMessage.LOAD_COUNT &&
      (
        (!this.loadedBottom && currentIndex <= ChatPinnedMessage.LOAD_OFFSET) ||
        (!this.loadedTop && (this.count - 1 - currentIndex) <= ChatPinnedMessage.LOAD_OFFSET)
      )
    );
  }

  private async getCurrentIndex(mid: number, correctAfter = true) {
    if(this.loading) return;
    this.loading = true;

    try {
      const log = this.debug ? this.log.bindPrefix('getCurrentIndex') : undefined;
      log && log('start', mid, correctAfter);

      let gotRest = false;
      const promises = [
        this.managers.appMessagesManager.getHistory({
          peerId: this.chat.peerId,
          inputFilter: {_: 'inputMessagesFilterPinned'},
          offsetId: mid,
          limit: ChatPinnedMessage.LOAD_COUNT,
          backLimit: ChatPinnedMessage.LOAD_COUNT,
          threadId: this.chat.threadId,
          needRealOffsetIdOffset: true
        }).then((r) => {
          gotRest = true;
          return r;
        })
      ];

      if(!this.pinnedMaxMid) {
        const promise = this.managers.appMessagesManager.getPinnedMessage(
          this.chat.peerId,
          this.chat.threadId
        ).then((p) => {
          if(!p.maxId) return;
          this.pinnedMaxMid = p.maxId;

          if(!gotRest && correctAfter) {
            this.mids = [this.pinnedMaxMid];
            this.count = p.count;
            this.pinnedIndex = 0;
            this.pinnedMid = this.mids[0];
            this.setPinnedMessage();
            // this.pinnedMessageContainer.toggle(false);
          }
        });

        promises.push(promise as any);
      }

      const result = (await Promise.all(promises))[0];

      const history = result.history;

      let backLimited = history.findIndex((_mid) => _mid <= mid);
      if(backLimited === -1) {
        backLimited = history.length;
      }/*  else {
        backLimited -= 1;
      } */

      this.offsetIndex = Math.max(0, result.offsetIdOffset) ? result.offsetIdOffset - backLimited : 0;
      this.mids = history.slice();
      this.count = result.count;

      if(!this.count) {
        this.pinnedMessageContainer.toggle(true);
      }

      this.loadedTop = (this.offsetIndex + this.mids.length) === this.count;
      this.loadedBottom = !this.offsetIndex;

      log && log('result', mid, result, backLimited, this.offsetIndex, this.loadedTop, this.loadedBottom);
    } catch(err) {
      this.log.error('getCurrentIndex error', err);
    }

    this.loading = false;

    if(this.locked) {
      this.testMid(mid);
    } else if(correctAfter) {
      this.setCorrectIndex(0);
    }

    this.getCurrentIndexPromise = undefined;
    // return result.offset_id_offset || 0;
  }

  private setScrollDownListener() {
    this.waitForScrollBottom = true;

    if(!this.scrollDownListenerSetter) {
      this.scrollDownListenerSetter = new ListenerSetter();
      handleScrollSideEvent(this.chat.bubbles.scrollable.container, 'bottom', () => {
        this.unsetScrollDownListener();
      }, this.scrollDownListenerSetter);
    }
  }

  public unsetScrollDownListener(refreshPosition = true) {
    this.waitForScrollBottom = false;

    if(this.scrollDownListenerSetter) {
      this.scrollDownListenerSetter.removeAll();
      this.scrollDownListenerSetter = undefined;
    }

    if(refreshPosition) {
      this.setCorrectIndex(0);
    }
  }

  public async handleFollowingPinnedMessage() {
    this.locked = true;

    this.debug && this.log('handleFollowingPinnedMessage');
    try {
      this.setScrollDownListener();

      const setPeerPromise = this.chat.setPeerPromise;
      if(setPeerPromise instanceof Promise) {
        await setPeerPromise;
      }

      // await this.chat.bubbles.scrollable.scrollLockedPromise;
      await getHeavyAnimationPromise();

      this.getCurrentIndexPromise && await this.getCurrentIndexPromise;

      this.debug && this.log('handleFollowingPinnedMessage: unlock');
      this.locked = false;

      /* // подождём, пока скролл остановится
      setTimeout(() => {
        this.log('handleFollowingPinnedMessage: unlock');
        this.locked = false;
      }, 50); */
    } catch(err) {
      this.log.error('handleFollowingPinnedMessage error:', err);

      this.locked = false;
      this.waitForScrollBottom = false;
      this.setCorrectIndex(0);
    }
  }

  public followPinnedMessage(mid: number) {
    const message = this.chat.getMessage(mid);
    if(!message) {
      return;
    }

    this.chat.setMessageId({lastMsgId: mid});
    (this.chat.setPeerPromise || Promise.resolve()).then(() => { // * debounce fast clicker
      this.handleFollowingPinnedMessage();
      this.testMid(this.pinnedIndex >= (this.count - 1) ? this.pinnedMaxMid : mid - 1);
    });
  }

  public async _setPinnedMessage() {
    // ///this.log('setting pinned message', message);
    // return;
    /* const promise: Promise<any> = this.chat.setPeerPromise || this.chat.bubbles.messagesQueuePromise || Promise.resolve();
    Promise.all([
      promise
    ]).then(() => { */
    // const mids = results[0];
    const count = this.count;
    if(count) {
      const pinnedIndex = this.pinnedIndex;
      const message = this.chat.getMessage(this.pinnedMid);

      // this.animatedCounter.prepareNumber(count);

      // setTimeout(() => {
      const isLast = pinnedIndex === 0;
      this.animatedCounter.container.classList.toggle('is-last', isLast);
      // SetTransition(this.animatedCounter.container, 'is-last', isLast, AnimatedSuper.DURATION);
      if(!isLast) {
        this.animatedCounter.setCount(count - pinnedIndex);
      }
      // }, 100);

      // this.pinnedMessageContainer.fill(undefined, message.message, message);
      this.pinnedMessageContainer.toggle(false);

      const fromTop = pinnedIndex > this.wasPinnedIndex;

      this.debug && this.log('setPinnedMessage: fromTop', fromTop, pinnedIndex, this.wasPinnedIndex);

      const writeTo = this.animatedSubtitle.getRow(pinnedIndex);
      const writeMediaTo = this.animatedMedia.getRow(pinnedIndex);
      writeMediaTo.classList.add('pinned-message-media');
      // writeMediaTo.innerHTML = writeMediaTo.style.cssText = writeMediaTo.dataset.docId = '';
      const loadPromises: Promise<any>[] = [];
      const isMediaSet = await wrapReplyDivAndCaption({
        titleEl: null,
        subtitleEl: writeTo,
        message,
        mediaEl: writeMediaTo,
        loadPromises,
        animationGroup: this.chat.animationGroup,
        textColor: 'primary-text-color',
        canTranslate: !message.pFlags.out,
        middleware: this.animatedSubtitle.getRow(pinnedIndex).middlewareHelper.get()
      });

      await Promise.all(loadPromises);

      this.pinnedMessageContainer.container.classList.toggle('is-media', isMediaSet);

      // if(this.wasPinnedIndex !== this.pinnedIndex) {
      this.animatedSubtitle.animate(pinnedIndex, this.wasPinnedIndex);
      if(isMediaSet) {
        this.animatedMedia.animate(pinnedIndex, this.wasPinnedMediaIndex); // * wasPinnedMediaIndex из-за того, что блок меняется с другим алгоритмом
        this.wasPinnedMediaIndex = pinnedIndex;
      } else {
        this.animatedMedia.clearRows();
      }
      // }

      this.pinnedMessageBorder.render(count, count - pinnedIndex - 1);
      this.wasPinnedIndex = pinnedIndex;
      this.pinnedMessageContainer.container.dataset.mid = '' + message.mid;
    } else {
      this.pinnedMessageContainer.toggle(true);
      this.wasPinnedIndex = 0;
    }

    this.pinnedMessageContainer.container.classList.toggle('is-many', this.count > 1);
    // });
  }
}
