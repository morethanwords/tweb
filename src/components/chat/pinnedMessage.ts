import type { AppImManager } from "../../lib/appManagers/appImManager";
import type { AppMessagesManager } from "../../lib/appManagers/appMessagesManager";
import { ScreenSize } from "../../helpers/mediaSizes";
import appPeersManager from "../../lib/appManagers/appPeersManager";
import PopupPinMessage from "../popupUnpinMessage";
import PinnedContainer from "./pinnedContainer";
import PinnedMessageBorder from "./pinnedMessageBorder";
import ReplyContainer, { wrapReplyDivAndCaption } from "./replyContainer";
import rootScope from "../../lib/rootScope";
import { findUpClassName } from "../../helpers/dom";

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

    this.clearRows(index);
  }
}

class AnimatedCounter {
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
    const EMPTY_INDEX = 0;
    byDecimal.forEach((decimal) => {
      const row = decimal.animatedSuper.getRow(EMPTY_INDEX, true);
      decimal.animatedSuper.animate(EMPTY_INDEX, this.previousNumber, this.reverse ? number < this.previousNumber : number > this.previousNumber, true);
      //decimal.container.remove();
      //decimal.animatedSuper.clearRows();
    });

    this.clear(number);
  }

  setCount(number: number) {
    //this.prepareNumber(number);

    const byDecimal = Array.from('' + number).map(n => +n);
    byDecimal.forEach((decimalNumber, idx) => {
      const decimal = this.getDecimal(idx);
      const row = decimal.animatedSuper.getRow(number, true);
      row.innerText = decimal.placeholder.innerText = '' + decimalNumber;
      decimal.animatedSuper.animate(number, this.previousNumber, this.reverse ? number < this.previousNumber : number > this.previousNumber, true);
    });

    /* const sides = ['from-top', 'from-bottom'];
    if(this.reverse) {
      sides.reverse();
    }

    const isHigher = number > this.previousNumber;
    if(!isHigher) {
      sides.reverse();
    }

    this.container.classList.add(sides[0]);
    this.container.classList.remove(sides[1]); */
    
    this.hideLeft(number);
    //this.clear(number);
    this.previousNumber = number;
  }
}

export default class PinnedMessage {
  public pinnedMessageContainer: PinnedContainer;
  public pinnedMessageBorder: PinnedMessageBorder;
  public pinnedIndex = 0;
  public wasPinnedIndex = 0;
  public locked = false;
  public waitForScrollBottom = false;

  public animatedSubtitle: AnimatedSuper;
  public animatedMedia: AnimatedSuper;
  public animatedCounter: AnimatedCounter;
  
  constructor(private appImManager: AppImManager, private appMessagesManager: AppMessagesManager) {
    this.pinnedMessageContainer = new PinnedContainer('message', new ReplyContainer('pinned-message'), () => {
      if(appPeersManager.canPinMessage(this.appImManager.peerID)) {
        new PopupPinMessage(this.appImManager.peerID, 0);
        return Promise.resolve(false);
      }
    });

    this.pinnedMessageBorder = new PinnedMessageBorder();
    this.pinnedMessageContainer.divAndCaption.border.replaceWith(this.pinnedMessageBorder.render(1, 0));
    this.appImManager.btnJoin.parentElement.insertBefore(this.pinnedMessageContainer.divAndCaption.container, this.appImManager.btnJoin);

    this.animatedSubtitle = new AnimatedSuper();
    this.pinnedMessageContainer.divAndCaption.subtitle.append(this.animatedSubtitle.container);

    this.animatedMedia = new AnimatedSuper();
    this.animatedMedia.container.classList.add('pinned-message-media-container');
    this.pinnedMessageContainer.divAndCaption.content.prepend(this.animatedMedia.container);

    this.animatedCounter = new AnimatedCounter(true);
    this.pinnedMessageContainer.divAndCaption.title.innerHTML = 'Pinned Message ';
    this.pinnedMessageContainer.divAndCaption.title.append(this.animatedCounter.container);

    rootScope.on('peer_pinned_messages', (e) => {
      const peerID = e.detail;

      if(peerID == this.appImManager.peerID) {
        this.setPinnedMessage();
      }
    });
  }

  public setCorrectIndex(lastScrollDirection?: number) {
    if(this.locked || this.appImManager.setPeerPromise) {
      return;
    }/*  else if(this.waitForScrollBottom) {
      if(lastScrollDirection === 1) {
        this.waitForScrollBottom = false;
      } else {
        return;
      }
    } */

    ///const perf = performance.now();
    const rect = this.appImManager.scrollable.container.getBoundingClientRect();
    const x = Math.ceil(rect.left + ((rect.right - rect.left) / 2) + 1);
    const y = Math.floor(rect.top + rect.height - 1);
    let el: HTMLElement = document.elementFromPoint(x, y) as any;
    //this.appImManager.log('[PM]: setCorrectIndex: get last element perf:', performance.now() - perf, el, x, y);
    if(!el) return;
    el = findUpClassName(el, 'bubble');
    if(!el) return;

    if(el && el.dataset.mid !== undefined) {
      const mid = +el.dataset.mid;
      this.appMessagesManager.getPinnedMessages(this.appImManager.peerID).then(mids => {
        let currentIndex = mids.findIndex(_mid => _mid <= mid);
        if(currentIndex === -1) {
          currentIndex = mids.length ? mids.length - 1 : 0;
        }

        //this.appImManager.log('pinned currentIndex', currentIndex);
  
        const changed = this.pinnedIndex != currentIndex;
        if(changed) {
          if(this.waitForScrollBottom) {
            if(lastScrollDirection === 1) { // если проскроллил вниз - разблокировать
              this.waitForScrollBottom = false;
            } else if(this.pinnedIndex > currentIndex) { // если не скроллил вниз и пытается поставить нижний пиннед - выйти
              return;
            }
          }

          this.pinnedIndex = currentIndex;
          this.setPinnedMessage();
        }
      });
    }
  }

  public async followPinnedMessage(mid: number) {
    const message = this.appMessagesManager.getMessage(mid);
    if(message && !message.deleted) {
      this.locked = true;

      try {
        const mids = await this.appMessagesManager.getPinnedMessages(message.peerID);
        const index = mids.indexOf(mid);
        
        this.pinnedIndex = index >= (mids.length - 1) ? 0 : index + 1;
        this.setPinnedMessage();
        
        const setPeerPromise = this.appImManager.setPeer(message.peerID, mid);
        if(setPeerPromise instanceof Promise) {
          await setPeerPromise;
        }
  
        await this.appImManager.scrollable.scrollLockedPromise;
      } catch(err) {
        this.appImManager.log.error('[PM]: followPinnedMessage error:', err);
      }

      // подождём, пока скролл остановится
      setTimeout(() => {
        this.locked = false;
        this.waitForScrollBottom = true;
      }, 50);
    }
  }

  public onChangeScreen(from: ScreenSize, to: ScreenSize) {
    this.pinnedMessageContainer.divAndCaption.container.classList.toggle('is-floating', to == ScreenSize.mobile 
      /* || (!this.chatAudio.divAndCaption.container.classList.contains('hide') && to == ScreenSize.medium) */);
  }

  public setPinnedMessage() {
    /////this.log('setting pinned message', message);
    //return;
    const promise: Promise<any> = this.appImManager.setPeerPromise || this.appImManager.messagesQueuePromise || Promise.resolve();
    Promise.all([
      this.appMessagesManager.getPinnedMessages(this.appImManager.peerID),
      promise
    ]).then(([mids]) => {
      //const mids = results[0];
      if(mids.length) {
        const pinnedIndex = this.pinnedIndex >= mids.length ? mids.length - 1 : this.pinnedIndex;
        const message = this.appMessagesManager.getMessage(mids[pinnedIndex]);

        //this.animatedCounter.prepareNumber(mids.length);

        //setTimeout(() => {
          const isLast = pinnedIndex === 0;
          this.animatedCounter.container.classList.toggle('is-last', isLast);
          //SetTransition(this.animatedCounter.container, 'is-last', isLast, AnimatedSuper.DURATION);
          if(!isLast) {
            this.animatedCounter.setCount(mids.length - pinnedIndex);
          }
        //}, 100);

        //this.pinnedMessageContainer.fill(undefined, message.message, message);
        this.pinnedMessageContainer.toggle(false);

        const fromTop = pinnedIndex > this.wasPinnedIndex;

        this.appImManager.log('[PM]: setPinnedMessage: fromTop', fromTop, pinnedIndex, this.wasPinnedIndex);

        const writeTo = this.animatedSubtitle.getRow(pinnedIndex);
        const writeMediaTo = this.animatedMedia.getRow(pinnedIndex);
        writeMediaTo.classList.add('pinned-message-media');
        const isMediaSet = wrapReplyDivAndCaption({
          title: undefined,
          titleEl: null,
          subtitle: message.message,
          subtitleEl: writeTo,
          message,
          mediaEl: writeMediaTo
        });

        this.pinnedMessageContainer.divAndCaption.container.classList.toggle('is-media', isMediaSet);

        //if(this.wasPinnedIndex != this.pinnedIndex) {
          this.animatedSubtitle.animate(pinnedIndex, this.wasPinnedIndex);
          if(isMediaSet) {
            this.animatedMedia.animate(pinnedIndex, this.wasPinnedIndex);
          } else {
            this.animatedMedia.clearRows();
          }
        //}

        this.pinnedMessageBorder.render(mids.length, mids.length - pinnedIndex - 1);
        this.wasPinnedIndex = pinnedIndex;
        this.pinnedMessageContainer.divAndCaption.container.dataset.mid = '' + message.mid;
      } else {
        this.pinnedMessageContainer.toggle(true);
        this.wasPinnedIndex = 0;
      }
    });
  }
}