/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { AppMessagesManager } from "../../lib/appManagers/appMessagesManager";
import type ChatInput from "./input";
import DropdownHover from "../../helpers/dropdownHover";
import { KeyboardButton, ReplyMarkup } from "../../layer";
import RichTextProcessor from "../../lib/richtextprocessor";
import rootScope from "../../lib/rootScope";
import ListenerSetter, { Listener } from "../../helpers/listenerSetter";
import findUpClassName from "../../helpers/dom/findUpClassName";
import { IS_TOUCH_SUPPORTED } from "../../environment/touchSupport";
import findUpAsChild from "../../helpers/dom/findUpAsChild";
import cancelEvent from "../../helpers/dom/cancelEvent";
import { getHeavyAnimationPromise } from "../../hooks/useHeavyAnimationCheck";
import confirmationPopup from "../confirmationPopup";
import safeAssign from "../../helpers/object/safeAssign";

export default class ReplyKeyboard extends DropdownHover {
  private static BASE_CLASS = 'reply-keyboard';
  private appendTo: HTMLElement;
  private listenerSetter: ListenerSetter;
  private appMessagesManager: AppMessagesManager;
  private btnHover: HTMLElement;
  private peerId: PeerId;
  private touchListener: Listener;
  private chatInput: ChatInput;

  constructor(options: {
    listenerSetter: ListenerSetter,
    appMessagesManager: AppMessagesManager,
    appendTo: HTMLElement,
    btnHover: HTMLElement,
    chatInput: ChatInput
  }) {
    super({
      element: document.createElement('div')
    });

    safeAssign(this, options);

    this.element.classList.add(ReplyKeyboard.BASE_CLASS);
    this.element.style.display = 'none';

    this.attachButtonListener(this.btnHover, this.listenerSetter);
    this.listenerSetter.add(rootScope)('history_reply_markup', ({peerId}) => {
      if(this.peerId === peerId) {
        if(this.checkAvailability() && this.isActive()) {
          this.render();
        }

        getHeavyAnimationPromise().then(() => {
          this.checkForceReply();
        });
      }
    });
  }

  protected init() {
    this.appendTo.append(this.element);

    this.listenerSetter.add(this)('open', () => {
      this.render();

      if(IS_TOUCH_SUPPORTED) {
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

      const type = target.dataset.type as KeyboardButton['_'];
      const {peerId} = this;
      switch(type) {
        case 'keyboardButtonRequestPhone': {
          confirmationPopup({
            titleLangKey: 'ShareYouPhoneNumberTitle',
            button: {
              langKey: 'OK'
            },
            descriptionLangKey: 'AreYouSureShareMyContactInfoBot'
          }).then(() => {
            this.appMessagesManager.sendContact(peerId, rootScope.myId);
          });
          break;
        }

        default: {
          this.appMessagesManager.sendText(peerId, target.dataset.text);
          break;
        }
      }

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

  public checkForceReply() {
    const replyMarkup = this.getReplyMarkup();
    if(replyMarkup._ === 'replyKeyboardForceReply' &&
      !replyMarkup.pFlags.hidden && 
      !replyMarkup.pFlags.used) {
      replyMarkup.pFlags.used = true;
      this.chatInput.initMessageReply(replyMarkup.mid);
    }
  }

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
        btn.dataset.type = button._;
        div.append(btn);
      }

      this.element.append(div);
    }
  }

  public checkAvailability(replyMarkup: ReplyMarkup = this.getReplyMarkup()) {
    const hide = replyMarkup._ === 'replyKeyboardHide' || !(replyMarkup as ReplyMarkup.replyInlineMarkup).rows?.length;
    this.btnHover.classList.toggle('hide', hide);

    if(hide) {
      this.toggle(false);
    }

    return !hide;
  }

  public setPeer(peerId: PeerId) {
    this.peerId = peerId;

    this.checkAvailability();
    this.checkForceReply();
  }
}
