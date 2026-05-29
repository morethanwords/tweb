/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import Icon from '@components/icon';
import setInnerHTML from '@helpers/dom/setInnerHTML';
import appImManager from '@lib/appImManager';

const hideQuizHint = (element: HTMLElement, onHide: () => void, timeout: number) => {
  element.classList.remove('active');

  clearTimeout(timeout);
  setTimeout(() => {
    onHide?.();
    element.remove();

    if(prevQuizHint === element && prevQuizHintOnHide === onHide && prevQuizHintTimeout === timeout) {
      prevQuizHint = prevQuizHintOnHide = null;
      prevQuizHintTimeout = 0;
    }
  }, 200);
};

let prevQuizHint: HTMLElement, prevQuizHintOnHide: () => void, prevQuizHintTimeout: number;
let isListenerSet = false;
export const setQuizHint = (options: {
  textElement: HTMLElement | DocumentFragment,
  textRight?: HTMLElement | DocumentFragment,
  title?: HTMLElement,
  onHide?: () => void,
  appendTo: HTMLElement,
  from: 'top' | 'bottom',
  duration?: number,
  icon?: Icon,
  class?: string,
  canCloseOnPeerChange?: boolean
}) => {
  if(prevQuizHint) {
    hideQuizHint(prevQuizHint, prevQuizHintOnHide, prevQuizHintTimeout);
  }

  const element = document.createElement('div');
  element.classList.add('quiz-hint', 'from-' + options.from);
  options.class && element.classList.add(options.class);

  const container = document.createElement('div');
  container.classList.add('quiz-hint-container');

  let titleEl: HTMLElement;
  if(options.title) {
    titleEl = document.createElement('div');
    titleEl.classList.add('quiz-hint-title');
    titleEl.append(options.title);
    container.classList.add('has-title');
  }

  const textEl = document.createElement('div');
  textEl.classList.add('quiz-hint-text');

  let textRightEl: HTMLElement;
  if(options.textRight) {
    textRightEl = document.createElement('div');
    textRightEl.classList.add('quiz-hint-text-right');
    textRightEl.append(options.textRight);
    container.classList.add('has-right-text');
  }

  container.append(...[
    options.icon && Icon(options.icon, 'quiz-hint-icon'),
    titleEl,
    textEl,
    textRightEl
  ].filter(Boolean));
  element.append(container);

  setInnerHTML(textEl, options.textElement);
  options.appendTo.append(element);

  void element.offsetLeft; // reflow
  element.classList.add('active');

  const hide = () => {
    hideQuizHint(element, options.onHide, timeout);
  };

  prevQuizHint = element;
  prevQuizHintOnHide = options.onHide;
  const timeout = prevQuizHintTimeout = options.duration && window.setTimeout(hide, options.duration);

  options.canCloseOnPeerChange ??= true;
  if(!options.canCloseOnPeerChange)
    element.dataset.dontCloseOnPeerChange = '1';

  if(!isListenerSet) {
    isListenerSet = true;
    appImManager.addEventListener('peer_changed', () => {
      if(prevQuizHint && prevQuizHint.dataset.dontCloseOnPeerChange !== '1') {
        hideQuizHint(prevQuizHint, prevQuizHintOnHide, prevQuizHintTimeout);
      }
    });
  }

  return {hide};
};
