/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type ListenerSetter from '../listenerSetter';

export function requestFullScreen(element: HTMLElement) {
  if(element.requestFullscreen) {
    element.requestFullscreen();
    // @ts-ignore
  } else if(element.mozRequestFullScreen) {
    // @ts-ignore
    element.mozRequestFullScreen(); // Firefox
    // @ts-ignore
  } else if(element.webkitRequestFullscreen) {
    // @ts-ignore
    element.webkitRequestFullscreen(); // Chrome and Safari
    // @ts-ignore
  } else if(element.msRequestFullscreen) {
    // @ts-ignore
    element.msRequestFullscreen();
  }
}

export function cancelFullScreen() {
  // @ts-ignore
  if(document.cancelFullScreen) {
    // @ts-ignore
    document.cancelFullScreen();
    // @ts-ignore
  } else if(document.mozCancelFullScreen) {
    // @ts-ignore
    document.mozCancelFullScreen();
    // @ts-ignore
  } else if(document.webkitCancelFullScreen) {
    // @ts-ignore
    document.webkitCancelFullScreen();
    // @ts-ignore
  } else if(document.msExitFullscreen) {
    // @ts-ignore
    document.msExitFullscreen();
  }
}

export function addFullScreenListener(element: HTMLElement, callback: (e: Event) => any, listenerSetter?: ListenerSetter) {
  const addListener = listenerSetter ? listenerSetter.add(element) : element.addEventListener.bind(element);
  'webkitfullscreenchange mozfullscreenchange fullscreenchange MSFullscreenChange'.split(' ').forEach((eventName) => {
    addListener(eventName, callback, false);
  });
}

export function getFullScreenElement(): HTMLElement {
  // @ts-ignore
  return document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
}

export function isFullScreen() {
  return !!getFullScreenElement();
}
