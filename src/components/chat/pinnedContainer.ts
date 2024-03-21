/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type Chat from './chat';
import type ChatTopbar from './topbar';
import mediaSizes from '../../helpers/mediaSizes';
import DivAndCaption from '../divAndCaption';
import ripple from '../ripple';
import ListenerSetter from '../../helpers/listenerSetter';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import {Message, StoryItem} from '../../layer';
import safeAssign from '../../helpers/object/safeAssign';
import ButtonIcon from '../buttonIcon';

const classNames: string[] = ['is-pinned-message-shown', 'is-pinned-audio-shown'];
const CLASSNAME_BASE = 'pinned-container';

export type WrapPinnedContainerOptions = {
  title: string | HTMLElement | DocumentFragment,
  subtitle?: WrapPinnedContainerOptions['title'],
  message?: Message.message | Message.messageService,
  storyItem?: StoryItem.storyItem
};

export default class PinnedContainer {
  public wrapperUtils: HTMLElement;
  public btnClose: HTMLElement;
  public container: HTMLElement;
  protected wrapper: HTMLElement;

  protected topbar: ChatTopbar;
  protected chat: Chat;
  protected listenerSetter: ListenerSetter;
  public className: string;
  public divAndCaption: DivAndCaption<(options: WrapPinnedContainerOptions) => void>;

  protected floating = false;

  public onClose?: () => void | Promise<boolean>;

  public height: number;

  constructor(options: {
    topbar: PinnedContainer['topbar'],
    chat: PinnedContainer['chat'],
    listenerSetter: PinnedContainer['listenerSetter'],
    className: PinnedContainer['className'],
    divAndCaption?: PinnedContainer['divAndCaption'],
    onClose?: PinnedContainer['onClose'],
    floating?: PinnedContainer['floating'],
    height: number
  }) {
    safeAssign(this, options);

    const {divAndCaption, className} = this;
    if(divAndCaption) {
      this.container = divAndCaption.container;
      divAndCaption.title.classList.add(CLASSNAME_BASE + '-title');
      divAndCaption.subtitle.classList.add(CLASSNAME_BASE + '-subtitle');
      divAndCaption.content.classList.add(CLASSNAME_BASE + '-content');
    } else {
      this.container = document.createElement('div');
      this.container.classList.add('pinned-' + this.className);
    }

    this.container.classList.add(CLASSNAME_BASE, 'hide');

    this.btnClose = ButtonIcon(`close ${CLASSNAME_BASE + '-close'} pinned-${className}-close`, {noRipple: true});

    this.wrapper = document.createElement('div');
    this.wrapper.classList.add(CLASSNAME_BASE + '-wrapper', `pinned-${className}-wrapper`);
    ripple(this.wrapper);

    this.wrapperUtils = document.createElement('div');
    this.wrapperUtils.classList.add(CLASSNAME_BASE + '-wrapper-utils', `pinned-${className}-wrapper-utils`);
    this.wrapperUtils.append(this.btnClose);

    this.wrapper.append(...(divAndCaption ? Array.from(divAndCaption.container.children) : []), this.wrapperUtils);

    divAndCaption && divAndCaption.container.append(this.wrapper/* , this.close */);

    this.attachOnCloseEvent(this.btnClose);
  }

  public destroy() {}

  public attachOnCloseEvent(elem: HTMLElement) {
    attachClickEvent(elem, (e) => {
      cancelEvent(e);

      ((this.onClose ? this.onClose() : null) || Promise.resolve(true)).then((needClose) => {
        if(needClose) {
          this.toggle(true);
        }
      });
    }, {listenerSetter: this.listenerSetter});
  }

  public toggle(hide?: boolean) {
    const isHidden = this.container.classList.contains('hide');
    if(hide === undefined) {
      hide = !isHidden;
    } else if(hide === isHidden) {
      return;
    }

    // const scrollable = this.chat.bubbles.scrollable;

    const isFloating = (this.floating || mediaSizes.isMobile) && !hide;
    // const scrollTop = isFloating || this.divAndCaption.container.classList.contains('is-floating') ? scrollable.scrollTop : undefined;

    this.container.classList.toggle('is-floating', isFloating);
    this.container.classList.toggle('hide', hide);

    this.topbar.container.classList.toggle(`is-pinned-${this.className}-shown`, !hide);

    // const active = classNames.filter((className) => this.topbar.container.classList.contains(className));
    // const maxActive = hide ? 0 : 1;

    // * not sure when it became unneeded
    // if(scrollTop !== undefined && active.length <= maxActive/*  && !scrollable.isScrolledDown */) {
    //   scrollable.scrollTop = scrollTop + ((hide ? -1 : 1) * HEIGHT);
    // }

    this.topbar.setFloating();
    this.topbar.setUtilsWidth();
  }

  public isVisible() {
    return !this.container.classList.contains('hide');
  }

  public isFloating() {
    return this.container.classList.contains('is-floating');
  }

  public fill(options: WrapPinnedContainerOptions) {
    const {message} = options;
    this.container.dataset.peerId = '' + message.peerId;
    this.container.dataset.mid = '' + message.mid;
    this.divAndCaption.fill(options);
    this.topbar.setUtilsWidth();
  }
}
