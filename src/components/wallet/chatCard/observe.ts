/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {getAppWindow, onAppWindowChange} from '@helpers/appWindow';

export type WalletCardObserver = Pick<IntersectionObserver, 'observe' | 'unobserve' | 'disconnect'>;

/**
 * An IntersectionObserver of the window the app is in. Its implicit root is the viewport of the realm that made it,
 * so when the app moves into a Document PiP window or back it is made again there and watches what it watched
 * (animationIntersector does the same)
 */
export function observeWalletCards(callback: (entries: IntersectionObserverEntry[]) => void, options?: IntersectionObserverInit): WalletCardObserver {
  const elements: Set<Element> = new Set();
  let observer: IntersectionObserver;
  const create = () => {
    const IO = (getAppWindow() as Window & typeof globalThis).IntersectionObserver;
    observer = new IO(callback, options);
    elements.forEach((element) => observer.observe(element));
  };

  create();
  const off = onAppWindowChange(() => {
    observer.disconnect();
    create();
  });

  return {
    observe: (element) => {
      elements.add(element);
      observer.observe(element);
    },
    unobserve: (element) => {
      elements.delete(element);
      observer.unobserve(element);
    },
    disconnect: () => {
      elements.clear();
      observer.disconnect();
      off();
    }
  };
}
