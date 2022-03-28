/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { AppMessagesManager } from "../../lib/appManagers/appMessagesManager";
import type { AppPeersManager } from "../../lib/appManagers/appPeersManager";
import type ChatTopbar from "./topbar";
import PopupPinMessage from "../popups/unpinMessage";
import PinnedContainer from "./pinnedContainer";
import PinnedMessageBorder from "./pinnedMessageBorder";
import ReplyContainer, { wrapReplyDivAndCaption } from "./replyContainer";
import rootScope from "../../lib/rootScope";
import Chat from "./chat";
import ListenerSetter from "../../helpers/listenerSetter";
import ButtonIcon from "../buttonIcon";
import { getHeavyAnimationPromise } from "../../hooks/useHeavyAnimationCheck";
import { i18n } from "../../lib/langPack";
import { cancelEvent } from "../../helpers/dom/cancelEvent";
import { attachClickEvent } from "../../helpers/dom/clickEvent";
import handleScrollSideEvent from "../../helpers/dom/handleScrollSideEvent";
import debounce from "../../helpers/schedulers/debounce";

class AnimatedSuper {
  static DURATION = 200;
  static BASE_CLASS = 'animated-super';
  container: HTMLDivElement;
  rows: {[index: string]: {element: HTMLElement, timeout?: number, new?: true}} = {};
  clearTimeout: number;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = AnimatedSuper.BASE_CLASS;
  }

  public getRow(index: number, animateFirst = false) {
    if(this.rows[index]) return this.rows[index].element;
    const row = document.createElement('div');
    const isFirst = !Object.keys(this.rows).length && !animateFirst;
    row.className = AnimatedSuper.BASE_CLASS + '-row' + (isFirst ? '' : ' is-hiding hide');
    this.rows[index] = {element: row, new: true};
    this.container.append(row);
    return row;
  }

  public clearRow(index: number) {
    if(!this.rows[index]) return;
    this.rows[index].element.remove();
    delete this.rows[index];
  }

  public clearRows(currentIndex?: number) {
    if(this.clearTimeout) clearTimeout(this.clearTimeout);
    this.clearTimeout = window.setTimeout(() => {
      for(const i in this.rows) {
        if(+i === currentIndex) continue;
        this.clearRow(+i);
      }
    }, AnimatedSuper.DURATION);
  }

  public setNewRow(index: number, reflow = false) {
    const row = this.rows[index];
    if(row.new) {
      if(reflow) {
        row.element.classList.remove('hide');
        void row.element.offsetLeft; // reflow
      } else {
        row.element.classList.remove('is-hiding', 'hide');
      }

      delete row.new;
    }

    this.clearRows(index);
  }

  public animate(index: number, previousIndex: number, fromTop = index > previousIndex, ignorePrevious = false) {
    if(index === previousIndex) { // * handle if set index 0 and previousIndex 0
      return this.setNewRow(index);
    }

    const row = this.rows[index];
    const previousRow = this.rows[previousIndex];
    if(!previousRow && !ignorePrevious) {
      return this.setNewRow(index);
    }

    const sides = ['from-top', 'from-bottom'];
    if(!fromTop) sides.reverse();

    row.element.classList.add(sides[0]);
    row.element.classList.remove(sides[1]);
    if(previousRow) {
      previousRow.element.classList.add(sides[1]);
      previousRow.element.classList.remove(sides[0]);
    }

    if(row.new) {
      this.setNewRow(index, true);
    }

    row.element.classList.toggle('is-hiding', false);
    previousRow && previousRow.element.classList.toggle('is-hiding', true);

    /* const height = row.element.getBoundingClientRect().height;
    row.element.style.transform = `translateY(${fromTop ? height * -1 : height}px)`;
    if(previousRow) {
      previousRow.element.style.transform = `translateY(${fromTop ? height : height * -1}px)`;
    } */

    /* row.element.style.setProperty('--height', row.element.getBoundingClientRect().height + 'px');
    if(previousRow) {
      previousRow.element.style.setProperty('--height', previousRow.element.getBoundingClientRect().height + 'px');
    } */
    
    this.clearRows(index);
  }
}

class AnimatedCounter {
  static EMPTY_INDEX = -1;
  static BASE_CLASS = 'animated-counter';
  container: HTMLElement;
  decimals: {
    container: HTMLElement,
    placeholder: HTMLElement,
    animatedSuper: AnimatedSuper
  }[] = [];
  previousNumber = 0;
  clearTimeout: number;

  constructor(private reverse = false) {
    this.container = document.createElement('div');
    this.container.className = AnimatedCounter.BASE_CLASS;
  }

  getDecimal(index: number) {
    if(this.decimals[index]) return this.decimals[index];
    const item = document.createElement('div');
    item.className = AnimatedCounter.BASE_CLASS + '-decimal';

    const placeholder = document.createElement('div');
    placeholder.className = AnimatedCounter.BASE_CLASS + '-decimal-placeholder';

    const animatedSuper = new AnimatedSuper();
    animatedSuper.container.className = AnimatedCounter.BASE_CLASS + '-decimal-wrapper';

    item.append(placeholder, animatedSuper.container);

    this.container.append(item);

    return this.decimals[index] = {container: item, placeholder, animatedSuper};
  }

  clear(number: number) {
    if(this.clearTimeout) clearTimeout(this.clearTimeout);

    const decimals = ('' + number).length;
    if(decimals >= this.decimals.length) {
      return;
    }

    this.clearTimeout = window.setTimeout(() => {
      const byDecimal = this.decimals.splice(decimals, this.decimals.length - decimals);
      byDecimal.forEach((decimal) => {
        decimal.container.remove();
      });
    }, AnimatedSuper.DURATION);
  }

  /* prepareNumber(number: number) {
    const decimals = ('' + number).length;
    if(this.decimals.length < decimals) {
      for(let i = this.decimals.length; i < decimals; ++i) {
        this.getDecimal(i);
      }
    }
  } */

  hideLeft(number: number) {
    const decimals = ('' + number).length;
    const byDecimal = this.decimals.slice(decimals);//this.decimals.splice(deleteCount, this.decimals.length - deleteCount);
    byDecimal.forEach((decimal) => {
      const previousDecimalNumber = +decimal.placeholder.innerText || 0;
      const row = decimal.animatedSuper.getRow(AnimatedCounter.EMPTY_INDEX, true);
      decimal.animatedSuper.animate(AnimatedCounter.EMPTY_INDEX, previousDecimalNumber, this.reverse ? number < this.previousNumber : number > this.previousNumber, true);
    });

    this.clear(number);
  }

  setCount(number: number) {
    //this.prepareNumber(number);

    const previousByDecimal = Array.from('' + this.previousNumber).map(n => +n);
    const byDecimal = Array.from('' + number).map(n => +n);
    byDecimal.forEach((decimalNumber, idx) => {
      const decimal = this.getDecimal(idx);
      //const row = decimal.animatedSuper.getRow(number, true);
      const row = decimal.animatedSuper.getRow(decimalNumber, true);
      const previousDecimalNumber = previousByDecimal[idx] ?? AnimatedCounter.EMPTY_INDEX;
      row.innerText = decimal.placeholder.innerText = '' + decimalNumber;
      //decimal.animatedSuper.animate(number, this.previousNumber, this.reverse ? number < this.previousNumber : number > this.previousNumber, true);
      decimal.animatedSuper.animate(decimalNumber, previousDecimalNumber, this.reverse ? number < this.previousNumber : number > this.previousNumber, true);
    });

    this.hideLeft(number);
    //this.clear(number);
    this.previousNumber = number;
  }
}

export default class ChatPinnedMessage {
  public static LOAD_COUNT = 50;
  public static LOAD_OFFSET = 5;

  public pinnedMessageContainer: PinnedContainer;
  public pinnedMessageBorder: PinnedMessageBorder;

  public pinnedMaxMid = 0;
  public pinnedMid = 0;
  public pinnedIndex = -1;
  public wasPinnedIndex = 0;
  public wasPinnedMediaIndex = 0;
  
  public locked = false;
  public waitForScrollBottom = false;

  public count = 0;
  public mids: number[] = [];
  public offsetIndex = 0;

  public loading = false;
  public loadedBottom = false;
  public loadedTop = false;

  public animatedSubtitle: AnimatedSuper;
  public animatedMedia: AnimatedSuper;
  public animatedCounter: AnimatedCounter;

  public listenerSetter: ListenerSetter;
  public scrollDownListenerSetter: ListenerSetter = null;

  public hidden = false;

  public getCurrentIndexPromise: Promise<any> = null;
  public btnOpen: HTMLButtonElement;
  
  public setPinnedMessage: () => void;

  private isStatic = false;

  private debug = false;
  
  constructor(private topbar: ChatTopbar, private chat: Chat, private appMessagesManager: AppMessagesManager, private appPeersManager: AppPeersManager) {
    this.listenerSetter = new ListenerSetter();

    const dAC = new ReplyContainer('pinned-message');
    this.pinnedMessageContainer = new PinnedContainer({
      topbar, 
      chat, 
      listenerSetter: this.listenerSetter, 
      className: 'message', 
      divAndCaption: dAC, 
      onClose: async() => {
        if(appPeersManager.canPinMessage(this.topbar.peerId)) {
          new PopupPinMessage(this.topbar.peerId, this.pinnedMid, true);
        } else {
          new PopupPinMessage(this.topbar.peerId, 0, true);
        }

        return false;
      }
    });

    this.pinnedMessageBorder = new PinnedMessageBorder();
    dAC.border.replaceWith(this.pinnedMessageBorder.render(1, 0));

    this.animatedSubtitle = new AnimatedSuper();
    dAC.subtitle.append(this.animatedSubtitle.container);

    this.animatedMedia = new AnimatedSuper();
    this.animatedMedia.container.classList.add('pinned-message-media-container');
    dAC.content.prepend(this.animatedMedia.container);

    this.animatedCounter = new AnimatedCounter(true);
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
      if(peerId === this.topbar.peerId) {
        //this.wasPinnedIndex = 0;
        //setTimeout(() => {
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
        //}, 300);
      }
    });

    this.listenerSetter.add(rootScope)('peer_pinned_hidden', ({peerId}) => {
      if(peerId === this.topbar.peerId) {
        this.pinnedMessageContainer.toggle(this.hidden = true);
      }
    });

    // * 200 - no lags
    // * 100 - need test
    this.setPinnedMessage = debounce(() => this._setPinnedMessage(), 100, true, true);

    this.isStatic = this.chat.type === 'discussion';
  }

  public destroy() {
    this.pinnedMessageContainer.divAndCaption.container.remove();
    this.pinnedMessageContainer.toggle(true);
    this.listenerSetter.removeAll();
    this.unsetScrollDownListener(false);
  }

  public setCorrectIndex(lastScrollDirection?: number) {
    if(this.isStatic) return;
    // return;

    if(this.locked || this.hidden/*  || this.chat.setPeerPromise || this.chat.bubbles.messagesQueuePromise */) {
      return;
    }

    if((this.loadedBottom || this.loadedTop) && !this.count) {
      return;
    }

    //const perf = performance.now();
    let el = this.chat.bubbles.getBubbleByPoint('bottom');
    //this.chat.log('[PM]: setCorrectIndex: get last element perf:', performance.now() - perf, el);
    if(!el) return;

    //return;

    const mid = el.dataset.mid;
    if(el && mid !== undefined) {
      //this.chat.log('[PM]: setCorrectIndex will test mid:', mid);
      this.testMid(+mid, lastScrollDirection);
    }
  }

  public testMid(mid: number, lastScrollDirection?: number) {
    if(this.isStatic) return;
    
    //if(lastScrollDirection !== undefined) return;
    if(this.hidden) return;

    //this.chat.log('[PM]: testMid', mid);

    let currentIndex: number = this.mids.findIndex(_mid => _mid <= mid);
    if(currentIndex !== -1 && !this.isNeededMore(currentIndex)) {
      currentIndex += this.offsetIndex;
    } else if(this.loadedTop && mid < this.mids[this.mids.length - 1]) {
      //currentIndex = 0;
      currentIndex = this.mids.length - 1 + this.offsetIndex;
    } else {
      if(!this.getCurrentIndexPromise) {
        this.getCurrentIndexPromise = this.getCurrentIndex(mid, lastScrollDirection !== undefined);
      }

      return;
    }

    //const idx = Math.max(0, this.mids.indexOf(mid));

    /* if(currentIndex === this.count) {
      currentIndex = 0;
    } */

    //this.chat.log('[PM]: testMid: pinned currentIndex', currentIndex, mid);

    const changed = this.pinnedIndex !== currentIndex;
    if(changed) {
      if(this.waitForScrollBottom && lastScrollDirection !== undefined) {
        if(this.pinnedIndex === 0 || this.pinnedIndex > currentIndex) { // если не скроллил вниз и пытается поставить нижний пиннед - выйти
          return;
        }
      }

      this.pinnedIndex = currentIndex;
      this.pinnedMid = this.mids.find(_mid => _mid <= mid) || this.mids[this.mids.length - 1];
      this.setPinnedMessage();
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
      let gotRest = false;
      const promises = [
        this.appMessagesManager.getSearch({
          peerId: this.topbar.peerId, 
          inputFilter: {_: 'inputMessagesFilterPinned'}, 
          maxId: mid, 
          limit: ChatPinnedMessage.LOAD_COUNT, 
          backLimit: ChatPinnedMessage.LOAD_COUNT
        })
        .then(r => {
          gotRest = true;
          return r;
        })
      ];
  
      if(!this.pinnedMaxMid) {
        const promise = this.appMessagesManager.getPinnedMessage(this.topbar.peerId).then(p => {
          if(!p.maxId) return;
          this.pinnedMaxMid = p.maxId;

          if(!gotRest && correctAfter) {
            this.mids = [this.pinnedMaxMid];
            this.count = p.count;
            this.pinnedIndex = 0;
            this.pinnedMid = this.mids[0];
            this.setPinnedMessage();
            //this.pinnedMessageContainer.toggle(false);
          }
        });
  
        promises.push(promise as any);
      }
      
      const result = (await Promise.all(promises))[0];
  
      let backLimited = result.history.findIndex(message => message.mid <= mid);
      if(backLimited === -1) {
        backLimited = result.history.length;
      }/*  else {
        backLimited -= 1;
      } */
      
      this.offsetIndex = result.offset_id_offset ? result.offset_id_offset - backLimited : 0;
      this.mids = result.history.map(message => message.mid).slice();
      this.count = result.count;

      if(!this.count) {
        this.pinnedMessageContainer.toggle(true);
      }
  
      this.loadedTop = (this.offsetIndex + this.mids.length) === this.count;
      this.loadedBottom = !this.offsetIndex;
  
      this.debug && this.chat.log('[PM]: getCurrentIndex result:', mid, result, backLimited, this.offsetIndex, this.loadedTop, this.loadedBottom);
    } catch(err) {
      this.chat.log.error('[PM]: getCurrentIndex error', err);
    }
    
    this.loading = false;

    if(this.locked) {
      this.testMid(mid);
    } else if(correctAfter) {
      this.setCorrectIndex(0);
    }

    this.getCurrentIndexPromise = null;
    //return result.offset_id_offset || 0;
  }

  public setScrollDownListener() {
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
      this.scrollDownListenerSetter = null;
    }

    if(refreshPosition) {
      this.setCorrectIndex(0);
    }
  }

  public async handleFollowingPinnedMessage() {
    this.locked = true;

    this.debug && this.chat.log('[PM]: handleFollowingPinnedMessage');
    try {
      this.setScrollDownListener();

      const setPeerPromise = this.chat.setPeerPromise;
      if(setPeerPromise instanceof Promise) {
        await setPeerPromise;
      }
  
      //await this.chat.bubbles.scrollable.scrollLockedPromise;
      await getHeavyAnimationPromise();

      if(this.getCurrentIndexPromise) {
        await this.getCurrentIndexPromise;
      }

      this.debug && this.chat.log('[PM]: handleFollowingPinnedMessage: unlock');
      this.locked = false;

      /* // подождём, пока скролл остановится
      setTimeout(() => {
        this.chat.log('[PM]: handleFollowingPinnedMessage: unlock');
        this.locked = false;
      }, 50); */
    } catch(err) {
      this.chat.log.error('[PM]: handleFollowingPinnedMessage error:', err);

      this.locked = false;
      this.waitForScrollBottom = false;
      this.setCorrectIndex(0);
    }
  }

  public async followPinnedMessage(mid: number) {
    const message = this.chat.getMessage(mid);
    if(message && !message.deleted) {
      this.chat.setMessageId(mid);
      (this.chat.setPeerPromise || Promise.resolve()).then(() => { // * debounce fast clicker
        this.handleFollowingPinnedMessage();
        this.testMid(this.pinnedIndex >= (this.count - 1) ? this.pinnedMaxMid : mid - 1);
      });
    }
  }

  public async _setPinnedMessage() {
    /////this.log('setting pinned message', message);
    //return;
    /* const promise: Promise<any> = this.chat.setPeerPromise || this.chat.bubbles.messagesQueuePromise || Promise.resolve();
    Promise.all([
      promise
    ]).then(() => { */
      //const mids = results[0];
      const count = this.count;
      if(count) {
        const pinnedIndex = this.pinnedIndex;
        const message = this.chat.getMessage(this.pinnedMid);

        //this.animatedCounter.prepareNumber(count);

        //setTimeout(() => {
          const isLast = pinnedIndex === 0;
          this.animatedCounter.container.classList.toggle('is-last', isLast);
          //SetTransition(this.animatedCounter.container, 'is-last', isLast, AnimatedSuper.DURATION);
          if(!isLast) {
            this.animatedCounter.setCount(count - pinnedIndex);
          }
        //}, 100);

        //this.pinnedMessageContainer.fill(undefined, message.message, message);
        this.pinnedMessageContainer.toggle(false);

        const fromTop = pinnedIndex > this.wasPinnedIndex;

        this.debug && this.chat.log('[PM]: setPinnedMessage: fromTop', fromTop, pinnedIndex, this.wasPinnedIndex);

        const writeTo = this.animatedSubtitle.getRow(pinnedIndex);
        const writeMediaTo = this.animatedMedia.getRow(pinnedIndex);
        writeMediaTo.classList.add('pinned-message-media');
        //writeMediaTo.innerHTML = writeMediaTo.style.cssText = writeMediaTo.dataset.docId = '';
        const loadPromises: Promise<any>[] = [];
        const isMediaSet = wrapReplyDivAndCaption({
          title: undefined,
          titleEl: null,
          subtitle: message.message,
          subtitleEl: writeTo,
          message,
          mediaEl: writeMediaTo,
          loadPromises
        });

        await Promise.all(loadPromises);

        this.pinnedMessageContainer.divAndCaption.container.classList.toggle('is-media', isMediaSet);

        //if(this.wasPinnedIndex !== this.pinnedIndex) {
          this.animatedSubtitle.animate(pinnedIndex, this.wasPinnedIndex);
          if(isMediaSet) {
            this.animatedMedia.animate(pinnedIndex, this.wasPinnedMediaIndex); // * wasPinnedMediaIndex из-за того, что блок меняется с другим алгоритмом
            this.wasPinnedMediaIndex = pinnedIndex;
          } else {
            this.animatedMedia.clearRows();
          }
        //}

        this.pinnedMessageBorder.render(count, count - pinnedIndex - 1);
        this.wasPinnedIndex = pinnedIndex;
        this.pinnedMessageContainer.divAndCaption.container.dataset.mid = '' + message.mid;
      } else {
        this.pinnedMessageContainer.toggle(true);
        this.wasPinnedIndex = 0;
      }

      this.pinnedMessageContainer.divAndCaption.container.classList.toggle('is-many', this.count > 1);
    //});
  }
}
