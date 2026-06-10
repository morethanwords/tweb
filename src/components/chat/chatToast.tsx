/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {JSX} from 'solid-js';

import classNames from '@helpers/string/classNames';
import appImManager from '@lib/appImManager';

import showTooltip from '@components/tooltip';

type CurrentToast = {
  hide: () => void,
  closeOnPeerChange: boolean
};

let current: CurrentToast;
let isListenerSet = false;

/**
 * A toast docked just below the chat topbar (and floating pinned plates).
 *
 * Mounted on the .chat element (sibling to .topbar / .bubbles), NOT inside
 * .bubbles: .bubbles is a transformed z-index:1 stacking context that would
 * trap the toast below the topbar (z-index:2) and chat input. Docking is done
 * by the chat-toast class (see _chatToast.scss).
 *
 * Only one toast is shown at a time — showing a new one hides the previous.
 */
export default function showChatToast(options: {
  textElement: HTMLElement | DocumentFragment,
  title?: HTMLElement,
  rightElement?: JSX.Element,
  icon?: Icon,
  class?: string,
  duration?: number,
  // 'slide' emerges from behind the topbar, 'fade' rises into place fading in
  animation?: 'slide' | 'fade',
  closeOnPeerChange?: boolean,
  onHide?: () => void
}) {
  current?.hide();

  if(!isListenerSet) {
    isListenerSet = true;
    appImManager.addEventListener('peer_changed', () => {
      if(current?.closeOnPeerChange) {
        current.hide();
      }
    });
  }

  options.title?.classList.add('text-bold');

  const {close} = showTooltip({
    element: appImManager.chat.container,
    container: appImManager.chat.container,
    mountOn: appImManager.chat.container,
    relative: true,
    vertical: 'top',
    class: classNames('chat-toast', `chat-toast--${options.animation ?? 'slide'}`, options.class),
    icon: options.icon,
    textElement: options.title ?? options.textElement,
    subtitleElement: options.title && options.textElement,
    rightElement: options.rightElement,
    onClose: () => {
      if(current === entry) {
        current = undefined;
      }

      options.onHide?.();
    }
  });

  const entry: CurrentToast = current = {
    hide: close,
    closeOnPeerChange: options.closeOnPeerChange ?? true
  };

  if(options.duration) {
    setTimeout(close, options.duration);
  }

  return {hide: close};
}
