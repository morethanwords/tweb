/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type Chat from '@components/chat/chat';
import type ChatTopbar from '@components/chat/topbar';
import DivAndCaption from '@components/divAndCaption';
import ripple from '@components/ripple';
import ListenerSetter from '@helpers/listenerSetter';
import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {Message, StoryItem} from '@layer';
import safeAssign from '@helpers/object/safeAssign';
import ButtonIcon from '@components/buttonIcon';
import Button from '@components/buttonTsx';
import classNames from '@helpers/string/classNames';
import {JSX, Ref} from 'solid-js';

const CLASSNAME_BASE = 'pinned-container';

export type WrapPinnedContainerOptions = {
  title: string | HTMLElement | DocumentFragment,
  subtitle?: WrapPinnedContainerOptions['title'],
  message?: Message.message | Message.messageService,
  storyItem?: StoryItem.storyItem,
  isChatSensitive?: boolean,
  savedMusicDocId?: DocId,
};

export default class PinnedContainer {
  public wrapperUtils: HTMLElement;
  public btnClose: HTMLElement;
  public container: HTMLElement;
  public wrapper: HTMLElement;

  protected topbar?: ChatTopbar;
  protected chat: Chat;
  protected listenerSetter: ListenerSetter;
  public className: string;
  public divAndCaption: DivAndCaption<(options: WrapPinnedContainerOptions) => void>;

  public onClose?: () => void | Promise<boolean>;

  public height: number | 'auto';

  constructor(options: {
    topbar: PinnedContainer['topbar'],
    chat: PinnedContainer['chat'],
    listenerSetter: PinnedContainer['listenerSetter'],
    className: PinnedContainer['className'],
    divAndCaption?: PinnedContainer['divAndCaption'],
    onClose?: PinnedContainer['onClose'],
    height: number | 'auto'
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

    this.container.classList.toggle('hide', hide);

    (this.topbar ? this.topbar.container : document.body).classList.toggle(`is-pinned-${this.className}-shown`, !hide);

    if(this.topbar) {
      this.topbar.setFloating();
    }
  }

  public isVisible() {
    return !this.container.classList.contains('hide');
  }

  public createActionButton(options: {
    text: HTMLElement | DocumentFragment | string,
    onClick?: (e: Event) => void,
    as?: 'button' | 'a'
  }): HTMLElement {
    const btn = document.createElement(options.as || 'button');
    btn.classList.add(
      CLASSNAME_BASE + '-action-button',
      'pinned-' + this.className + '-action-button',
      'text-overflow-no-wrap'
    );
    if(typeof(options.text) === 'string') {
      btn.textContent = options.text;
    } else {
      btn.append(options.text);
    }
    if(options.onClick) {
      attachClickEvent(btn, options.onClick, {listenerSetter: this.listenerSetter});
    }
    return btn;
  }

  public createPrimaryButton(props: {
    onClick: () => void,
    children: JSX.Element,
    ref?: Ref<HTMLElement>
  }) {
    return Button({
      class: classNames(
        CLASSNAME_BASE + '-primary-button',
        `pinned-${this.className}-primary-button`
      ),
      primaryTransparent: true,
      ...props
    });
  }

  public fill(options: WrapPinnedContainerOptions) {
    const {message, savedMusicDocId} = options;
    this.container.dataset.peerId = '' + message.peerId;
    this.container.dataset.mid = '' + message.mid;
    if(savedMusicDocId) {
      this.container.dataset.savedMusicDocId = '' + savedMusicDocId;
    } else {
      delete this.container.dataset.savedMusicDocId;
    }
    this.divAndCaption.fill(options);
  }
}
