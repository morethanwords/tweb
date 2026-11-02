/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Accessor, createEffect, createMemo, on, onCleanup, untrack} from 'solid-js';
import liteMode from '@helpers/liteMode';
import {offsetIn} from '@components/wallet/visual/dom';

/**
 * The history's rows as iOS changes them (a list transition of 0.25 s, ease in and out): a row that comes fades
 * in, one that goes fades out where it stood, and the rows around it move to their new places. Only rows on
 * screen take part; nothing is measured unless the list changed, and every read goes before every write.
 *
 * A "Sending" row is left to the send animation: it comes with its own entrance, and when it turns into its
 * transaction the two swap in place, with nothing fading.
 */

const DURATION = 250;
const EASING = 'ease-in-out';
/** a change bigger than this (another wallet, the first page) is not animated row by row */
const MAX_ANIMATED = 12;

type Snapshot = {element: HTMLElement, top: number, left: number, width: number, height: number};

export default function createHistoryMotion<T extends {key: string, pending?: unknown}>(options: {
  items: Accessor<T[]>,
  scroller: Accessor<HTMLElement>
}) {
  const rows: Map<string, HTMLElement> = new Map();
  let before: Map<string, Snapshot>;

  const register = (key: string, element: HTMLElement) => {
    rows.set(key, element);
    onCleanup(() => {
      if(rows.get(key) === element) rows.delete(key);
    });
  };

  const measure = () => {
    const scroller = options.scroller();
    if(!scroller?.clientHeight || !liteMode.isAvailable('animations')) return;
    const snapshot: Map<string, Snapshot> = new Map();
    rows.forEach((element, key) => {
      if(!element.isConnected) return;
      const {x, y} = offsetIn(element, scroller);
      snapshot.set(key, {element, top: y, left: x, width: element.offsetWidth, height: element.offsetHeight});
    });

    return snapshot;
  };

  // * read where the rows stand before the list renders the change: the memo is computed before the rows are
  const items = createMemo<T[]>((previous) => {
    const list = options.items();
    before = previous?.length ? untrack(measure) : undefined;
    return list;
  });

  createEffect(on(items, (list, previous) => {
    const snapshot = before;
    before = undefined;
    if(snapshot?.size && previous) play(snapshot, previous, list);
  }, {defer: true}));

  function play(snapshot: Map<string, Snapshot>, previous: T[], list: T[]) {
    const scroller = options.scroller();
    if(!scroller?.clientHeight) return;
    const nextKeys = new Set(list.map((item) => item.key));
    if(!list.some((item) => snapshot.has(item.key))) return;
    const viewTop = scroller.scrollTop, viewBottom = viewTop + scroller.clientHeight;
    const inView = (top: number, height: number) => top + height > viewTop && top < viewBottom;
    // * a "Sending" row turned into its transaction: the new row takes its place as it is
    const swapped = previous.some((item) => item.pending && !nextKeys.has(item.key));

    // * reads
    const moves: [HTMLElement, number][] = [], fades: HTMLElement[] = [];
    for(const item of list) {
      const element = rows.get(item.key);
      if(!element?.isConnected) continue;
      const top = offsetIn(element, scroller).y, height = element.offsetHeight;
      const old = snapshot.get(item.key);
      if(old) {
        if(Math.abs(old.top - top) > 0.5 && (inView(old.top, old.height) || inView(top, height))) {
          moves.push([element, old.top - top]);
        }
      } else if(!item.pending && !swapped && inView(top, height)) {
        fades.push(element);
      }
    }

    const leaving = previous
    .filter((item) => !item.pending && !nextKeys.has(item.key))
    .map((item) => snapshot.get(item.key))
    .filter((old) => old && !old.element.isConnected && inView(old.top, old.height));

    if(moves.length + fades.length + leaving.length > MAX_ANIMATED) return;

    // * writes
    const timing: KeyframeAnimationOptions = {duration: DURATION, easing: EASING};
    if(liteMode.isAvailable('motion')) {
      moves.forEach(([element, delta]) => element.animate([{translate: `0 ${delta}px`}, {translate: '0 0'}], timing));
    }

    fades.forEach((element) => element.animate([{opacity: 0}, {opacity: 1}], timing));
    // * a row that went fades out where it stood, over the list and out of its way
    leaving.forEach((old) => {
      const element = old.element;
      Object.assign(element.style, {
        position: 'absolute',
        top: `${old.top}px`,
        left: `${old.left}px`,
        width: `${old.width}px`,
        height: `${old.height}px`,
        margin: '0',
        pointerEvents: 'none'
      });
      element.setAttribute('aria-hidden', 'true');
      element.inert = true;
      scroller.append(element);
      element.animate([{opacity: 1}, {opacity: 0}], {...timing, fill: 'forwards'}).finished
      .catch(() => {})
      .then(() => element.remove());
    });
  }

  return {items, register};
}
