/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { AppMessagesManager } from "../../lib/appManagers/appMessagesManager";
import DropdownHover from "../../helpers/dropdownHover";
import { ReplyMarkup } from "../../layer";
import RichTextProcessor from "../../lib/richtextprocessor";
import rootScope from "../../lib/rootScope";
import { safeAssign } from "../../helpers/object";
import ListenerSetter, { Listener } from "../../helpers/listenerSetter";
import findUpClassName from "../../helpers/dom/findUpClassName";
import { isTouchSupported } from "../../helpers/touchSupport";
import findUpAsChild from "../../helpers/dom/findUpAsChild";
import { cancelEvent } from "../../helpers/dom/cancelEvent";

export default class ReplyKeyboard extends DropdownHover {
  private static BASE_CLASS = 'reply-keyboard';
  private appendTo: HTMLElement;
  private listenerSetter: ListenerSetter;
  private appMessagesManager: AppMessagesManager;
  private btnHover: HTMLElement;
  private peerId: number;
  private touchListener: Listener;

  constructor(options: {
    listenerSetter: ListenerSetter,
    appMessagesManager: AppMessagesManager,
    appendTo: HTMLElement,
    btnHover: HTMLElement
  }) {
    super({
      element: document.createElement('div')
    });

    safeAssign(this, options);

    this.element.classList.add(ReplyKeyboard.BASE_CLASS);
    this.element.style.display = 'none';

    this.attachButtonListener(this.btnHover, this.listenerSetter);
    this.listenerSetter.add(rootScope)('history_reply_markup', ({peerId}) => {
      if(this.peerId === peerId && this.checkAvailability() && this.isActive()) {
        this.render();
      }
    });
  }

  protected init() {
    this.appendTo.append(this.element);

    this.listenerSetter.add(this)('open', () => {
      this.render();

      if(isTouchSupported) {
        this.touchListener = this.listenerSetter.add(document.body)('touchstart', this.onBodyTouchStart, {passive: false, capture: true}) as any as Listener;
        this.listenerSetter.add(this)('close', () => {
          this.listenerSetter.remove(this.touchListener);
        }, {once: true});
      }
    });
    
    this.listenerSetter.add(this.element)('click', (e) => {
      const target = findUpClassName(e.target, 'btn');
      if(!target) {
        return;
      }

      this.appMessagesManager.sendText(this.peerId, target.dataset.text);
      this.toggle(false);
    });

    return super.init();
  }

  private onBodyTouchStart = (e: TouchEvent) => {
    const target = e.touches[0].target as HTMLElement;
    if(!findUpAsChild(target, this.element) && target !== this.btnHover) {
      cancelEvent(e);
      this.toggle(false);
    }
  };

  private getReplyMarkup(): ReplyMarkup {
    return this.appMessagesManager.getHistoryStorage(this.peerId).replyMarkup ?? {
      _: 'replyKeyboardHide'
    };
  }

  public render(replyMarkup: ReplyMarkup.replyKeyboardMarkup = this.getReplyMarkup() as any) {
    this.element.innerHTML = '';

    for(const row of replyMarkup.rows) {
      const div = document.createElement('div');
      div.classList.add(ReplyKeyboard.BASE_CLASS + '-row');

      for(const button of row.buttons) {
        const btn = document.createElement('button');
        btn.classList.add(ReplyKeyboard.BASE_CLASS + '-button', 'btn');
        btn.innerHTML = RichTextProcessor.wrapEmojiText(button.text);
        btn.dataset.text = button.text;
        div.append(btn);
      }

      this.element.append(div);
    }
  }

  public checkAvailability(replyMarkup: ReplyMarkup = this.getReplyMarkup()) {
    const hide = replyMarkup._ === 'replyKeyboardHide';
    this.btnHover.classList.toggle('hide', hide);

    if(hide) {
      this.toggle(false);
    }

    return !hide;
  }

  public setPeer(peerId: number) {
    this.peerId = peerId;

    this.checkAvailability();
  }
}
