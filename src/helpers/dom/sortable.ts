import {ScrollableBase} from '@components/scrollable';
import SwipeHandler from '@components/swipeHandler';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import rootScope from '@lib/rootScope';
import liteMode from '@helpers/liteMode';
import {Middleware} from '@helpers/middleware';
import clamp from '@helpers/number/clamp';
import safeAssign from '@helpers/object/safeAssign';
import pause from '@helpers/schedulers/pause';
import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {getOverlayRoot} from '@helpers/appWindow';
import findUpAsChild from '@helpers/dom/findUpAsChild';
import getSortableRun, {isSortableElement} from '@helpers/dom/sortableRun';
import positionElementByIndex from '@helpers/dom/positionElementByIndex';
import whichChild from '@helpers/dom/whichChild';

/**
 * What the moved element ended up doing, in terms of the run of sortable siblings it was
 * dragged inside of (see `getSortableRun`) rather than of the list's DOM children. A list
 * whose order lives in a model - not in the DOM - reorders that model from here.
 */
export type SortableSortContext = {
  element: HTMLElement,
  /** the contiguous run of sortable elements the drag was confined to, in visual order */
  items: HTMLElement[],
  /** `element`'s index in `items` before the drag */
  from: number,
  /** where it has to end up in `items` */
  to: number
};

export default class Sortable {
  private element: HTMLElement;
  private elementRect: DOMRect;
  private scrollableRect: DOMRect;
  private minY: number;
  private maxY: number;
  private siblings: HTMLElement[];
  private items: HTMLElement[];
  private moveDirection: number;
  private pickedUp: boolean;
  private pickUpY: number;
  private swipeHandler: SwipeHandler;
  private startScrollPos: number;
  private addScrollPos: number;

  private list: HTMLElement;
  private middleware: Middleware;
  private onSort: (prevIdx: number, newIdx: number, context: SortableSortContext) => void;
  private scrollable: ScrollableBase;
  private threshold: number;
  private moveInDom: boolean;
  private sortableClassName: string;
  private enabled: () => boolean;

  constructor(options: {
    list: HTMLElement,
    middleware: Middleware,
    onSort: Sortable['onSort'],
    scrollable?: Sortable['scrollable'],
    /**
     * How far the pointer has to travel before the element is picked up - the slack that keeps a
     * click with a shaky hand from lifting a row that also opens something on release. Lists whose
     * rows do nothing on a press need none of it (the default). The element is taken at the pointer
     * rather than at where the press began, so the slack costs no jump.
     */
    threshold?: Sortable['threshold'],
    /**
     * Whether to move the element among its siblings once the drag ends. Leave it off when the
     * list renders its own order from a model: the reorder then belongs to that model, and a DOM
     * move would either be reverted by the next render or fight it.
     */
    moveInDom?: Sortable['moveInDom'],
    /**
     * When set, only children carrying this class can be dragged, and a run ends where it stops.
     * `cant-sort` says "not this one" in a list that is sortable throughout; this is the other way
     * round - for a list where only a part of the rows is (a chat list's pinned block).
     */
    sortableClassName?: Sortable['sortableClassName'],
    /**
     * Asked at the start of every gesture. A list that is sortable only part of the time - while a
     * mode is on, while something is selected - answers from that state instead of being attached
     * and detached with it.
     */
    enabled?: Sortable['enabled']
  }) {
    this.threshold = 0;
    this.moveInDom = true;
    safeAssign(this, options);

    this.swipeHandler = new SwipeHandler({
      element: this.list,
      onSwipe: this.onSwipe,
      verifyTouchTarget: this.verifyTouchTarget,
      onStart: this.onStart,
      onReset: this.onReset,
      setCursorTo: getOverlayRoot(),
      middleware: this.middleware,
      withDelay: true
    });
  }

  private onSwipe = (xDiff: number, yDiff: number) => {
    if(!this.pickedUp) {
      if(Math.abs(yDiff) < this.threshold) {
        return;
      }

      this.pickUp();
      // * the element is taken where the pointer already is and follows it from there: handing it
      // * the whole travel would snap it forward by everything the threshold ate
      this.pickUpY = yDiff;
    }

    yDiff -= this.pickUpY;

    // * the run is re-read on every move: a virtualized list mounts and drops rows underneath
    // * the drag, and one of them can be the element itself
    this.items = getSortableRun(this.element, this.sortableClassName);
    const idx = this.items.indexOf(this.element);
    if(idx === -1) {
      this.swipeHandler.reset();
      return;
    }

    // * the drag is confined to the run, so a row can never be dragged out of it (past a
    // * `cant-sort` sibling, or out of the pinned block of a chat list) - and the reach is
    // * re-derived with the run, since it grows and shrinks under a virtualized list. It is
    // * counted in rows off the element's own rect: the siblings carry the drag's own transforms
    // * by now, so their rects no longer say where the run is
    const height = this.elementRect.height;
    this.minY = -idx * height;
    this.maxY = (this.items.length - 1 - idx) * height;

    yDiff = clamp(yDiff, this.minY, this.maxY);
    this.element.style.transform = `translateY(${yDiff}px)`;
    const toEnd = yDiff >= 0;
    this.moveDirection = toEnd ? 1 : -1;
    const maxCount = toEnd ? this.items.length - 1 - idx : idx;
    const count = Math.min(Math.round(Math.abs(yDiff) / this.elementRect.height), maxCount);
    const lastSiblings = this.siblings;
    this.siblings = toEnd ?
      this.items.slice(idx + 1, idx + 1 + count) :
      this.items.slice(idx - count, idx);

    (lastSiblings || []).forEach((sibling) => {
      if(!this.siblings.includes(sibling)) {
        sibling.style.transform = '';
      }
    });

    this.siblings.forEach((sibling) => {
      const y = this.elementRect.height * (toEnd ? -1 : 1);
      sibling.style.transform = `translateY(${y}px)`;
    });

    if(this.scrollableRect) {
      const diff = yDiff;
      const elementEndPos = toEnd ? this.elementRect.bottom : this.elementRect.top;
      const clientY = elementEndPos + diff - this.addScrollPos;
      // console.log(clientY, this.scrollableRect.top, elementEndPos, diff, this.addScrollPos, toEnd);
      let change = 2;
      if((clientY + (toEnd ? 0 : this.elementRect.height)) >= this.scrollableRect.bottom/*  && diff < this.maxY */) {

      } else if((clientY - (toEnd ? this.elementRect.height : 0)) <= this.scrollableRect.top/*  && diff > this.minY */) {
        change *= -1;
      } else {
        change = undefined;
      }

      if(change !== undefined) {
        this.scrollable.scrollPosition += change;
      }
    }
  };

  private verifyTouchTarget = (e: {target: EventTarget}) => {
    if(this.list.classList.contains('is-reordering') || this.enabled?.() === false) {
      return false;
    }

    this.element = this.getSortableTarget(e.target as HTMLElement);
    if(!this.element) {
      return false;
    }

    // nothing to reorder within a run of one
    return getSortableRun(this.element, this.sortableClassName).length > 1;
  };

  private onScroll = () => {
    const scrollPos = this.scrollable.scrollPosition;
    const diff = this.addScrollPos = scrollPos - this.startScrollPos;
    const isVertical = this.scrollable.scrollPositionProperty === 'scrollTop';
    this.swipeHandler.add(isVertical ? 0 : diff, isVertical ? diff : 0);
  };

  private onStart = () => {
    this.pickedUp = false;
    this.siblings = undefined;
  };

  /** The visual half of the start, deferred until the pointer has travelled `threshold` */
  private pickUp() {
    this.pickedUp = true;
    this.list.classList.add('is-reordering');
    this.element.classList.add('is-dragging', 'no-transition');
    this.swipeHandler.setCursor('grabbing');
    this.elementRect = this.element.getBoundingClientRect();
    this.addScrollPos = 0;

    if(this.scrollable) {
      this.startScrollPos = this.scrollable.scrollPosition;
      this.scrollableRect = this.scrollable.container.getBoundingClientRect();
      this.scrollable.container.addEventListener('scroll', this.onScroll);
    }
  }

  private onReset = async() => {
    if(!this.pickedUp) {
      this.clearState();
      return;
    }

    const items = this.items;
    const from = items.indexOf(this.element);
    // * the pick up and the first move that shifts anything are two different events, and the drag
    // * can be reset in between (the row can even be dropped from a virtualized list)
    const siblings = this.siblings || [];
    const length = siblings.length;
    const move = length && length * this.moveDirection;
    const idx = whichChild(this.element);
    const newIdx = idx + move;
    const element = this.element;

    this.element.classList.remove('no-transition');
    this.element.style.transform = move ? `translateY(${move * this.elementRect.height}px)` : '';
    this.swipeHandler.setCursor('');

    if(this.scrollable) {
      this.scrollable.container.removeEventListener('scroll', this.onScroll);
    }

    if(!IS_TOUCH_SUPPORTED) {
      // Swallow the click that ends the reorder on the active window's body (the PiP doc when popped
      // out), else the post-drag click isn't suppressed there. (The drag itself runs via SwipeHandler.)
      // A drag that ends over another row makes its click on the common ancestor of the two, so
      // `ignoreMove` is what lets this one past the moved-since-mousedown guard - without it the
      // swallow is skipped in the very case it is here for, and the row the drag began on is acted
      // upon (a chat list in selection mode toggles it).
      attachClickEvent(getOverlayRoot(), cancelEvent, {capture: true, once: true, ignoreMove: true});
    }

    if(liteMode.isAvailable('animations')) {
      await pause(250);
    }

    this.list.classList.remove('is-reordering');
    this.element.classList.remove('is-dragging');
    if(this.moveInDom) {
      positionElementByIndex(this.element, this.list, newIdx, idx);
    }
    [this.element, ...siblings].forEach((element) => {
      element.style.transform = '';
    });

    this.clearState();

    // cancelClick = true;

    if(!move || from === -1) {
      return;
    }

    this.onSort(idx, newIdx, {element, items, from, to: from + move});
  };

  private clearState() {
    this.pickedUp = false;
    this.pickUpY =
      this.element =
      this.siblings =
      this.items =
      this.elementRect =
      this.minY =
      this.maxY =
      this.moveDirection =
      this.startScrollPos =
      this.addScrollPos =
      undefined;
  }

  private getSortableTarget(target: HTMLElement) {
    if(!target) {
      return;
    }

    const child = findUpAsChild(target as HTMLElement, this.list);
    return isSortableElement(child, this.sortableClassName) ? child : undefined;
  }
}
