/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type Chat from "./chat";
import type ChatTopbar from "./topbar";
import mediaSizes from "../../helpers/mediaSizes";
import DivAndCaption from "../divAndCaption";
import { ripple } from "../ripple";
import ListenerSetter from "../../helpers/listenerSetter";
import { cancelEvent } from "../../helpers/dom/cancelEvent";
import { attachClickEvent } from "../../helpers/dom/clickEvent";

//const classNames: string[] = [];
const classNames: string[] = ['is-pinned-message-shown', 'is-pinned-audio-shown'];
const CLASSNAME_BASE = 'pinned-container';
const HEIGHT = 52;

export default class PinnedContainer {
  private close: HTMLElement;
  protected wrapper: HTMLElement;

  constructor(protected topbar: ChatTopbar, protected chat: Chat, public listenerSetter: ListenerSetter, protected className: string, public divAndCaption: DivAndCaption<(title: string | HTMLElement, subtitle: string | HTMLElement, message?: any) => void>, onClose?: () => void | Promise<boolean>) {
    /* const prev = this.divAndCaption.fill;
    this.divAndCaption.fill = (mid, title, subtitle) => {
      this.divAndCaption.container.dataset.mid = '' + mid;
      prev(mid, title, subtitle);
    }; */

    //classNames.push(`is-pinned-${className}-shown`);

    divAndCaption.container.classList.add(CLASSNAME_BASE, 'hide');
    divAndCaption.title.classList.add(CLASSNAME_BASE + '-title');
    divAndCaption.subtitle.classList.add(CLASSNAME_BASE + '-subtitle');
    divAndCaption.content.classList.add(CLASSNAME_BASE + '-content');

    this.close = document.createElement('button');
    this.close.classList.add(CLASSNAME_BASE + '-close', `pinned-${className}-close`, 'btn-icon', 'tgico-close');

    //divAndCaption.container.prepend(this.close);

    this.wrapper = document.createElement('div');
    this.wrapper.classList.add(CLASSNAME_BASE + '-wrapper');
    this.wrapper.append(...Array.from(divAndCaption.container.children));
    ripple(this.wrapper);
    
    divAndCaption.container.append(this.close, this.wrapper);

    attachClickEvent(this.close, (e) => {
      cancelEvent(e);

      ((onClose ? onClose() : null) || Promise.resolve(true)).then(needClose => {
        if(needClose) {
          this.toggle(true);
        }
      });
    }, {listenerSetter: this.listenerSetter});
  }

  public toggle(hide?: boolean) {
    const isHidden = this.divAndCaption.container.classList.contains('hide');
    if(hide === undefined) {
      hide = !isHidden;
    } else if(hide === isHidden) {
      return;
    }

    this.divAndCaption.container.classList.toggle('is-floating', mediaSizes.isMobile);
    this.topbar.container.classList.toggle('is-pinned-floating', mediaSizes.isMobile);

    const scrollable = this.chat.bubbles.scrollable;

    const scrollTop = mediaSizes.isMobile /* && !appImManager.scrollable.isScrolledDown */ ? scrollable.scrollTop : undefined;
    this.divAndCaption.container.classList.toggle('hide', hide);
    const className = `is-pinned-${this.className}-shown`;
    this.topbar.container.classList.toggle(className, !hide);

    const active = classNames.filter(className => this.topbar.container.classList.contains(className));
    const maxActive = hide ? 0 : 1;
    
    if(scrollTop !== undefined && active.length <= maxActive/*  && !scrollable.isScrolledDown */) {
      scrollable.scrollTop = scrollTop + ((hide ? -1 : 1) * HEIGHT);
    }

    this.topbar.setUtilsWidth();
  }

  public fill(title: string | HTMLElement, subtitle: string | HTMLElement, message: any) {
    this.divAndCaption.container.dataset.peerId = '' + message.peerId;
    this.divAndCaption.container.dataset.mid = '' + message.mid;
    this.divAndCaption.fill(title, subtitle, message);
    this.topbar.setUtilsWidth();
  }
}
