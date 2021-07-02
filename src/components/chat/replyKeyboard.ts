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
import ListenerSetter from "../../helpers/listenerSetter";
import findUpClassName from "../../helpers/dom/findUpClassName";

export default class ReplyKeyboard extends DropdownHover {
  private static BASE_CLASS = 'reply-keyboard';
  private appendTo: HTMLElement;
  private listenerSetter: ListenerSetter;
  private appMessagesManager: AppMessagesManager;
  private btnHover: HTMLElement;
  private peerId: number;

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
    this.listenerSetter.add(rootScope, 'history_reply_markup', ({peerId}) => {
      if(this.peerId === peerId && this.checkAvailability() && this.isActive()) {
        this.render();
      }
    });
  }

  protected init() {
    this.appendTo.append(this.element);

    this.listenerSetter.add(this, 'open', () => {
      this.render();
    });

    this.listenerSetter.add(this.element, 'click', (e) => {
      const target = findUpClassName(e.target, 'btn');
      if(!target) {
        return;
      }

      this.appMessagesManager.sendText(this.peerId, target.dataset.text);
      this.toggle(false);
    });

    return super.init();
  }

  private getReplyMarkup(): ReplyMarkup {
    return this.appMessagesManager.getHistoryStorage(this.peerId).reply_markup ?? {
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
