import {ScrollableBase} from '@components/scrollable';
import SwipeHandler from '@components/swipeHandler';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import rootScope from '@lib/rootScope';
import liteMode from '@helpers/liteMode';
import {Middleware} from '@helpers/middleware';
import clamp from '@helpers/number/clamp';
import safeAssign from '@helpers/object/safeAssign';
import pause from '@helpers/schedulers/pause';
import {getOverlayRoot} from '@helpers/appWindow';
import findUpAsChild from '@helpers/dom/findUpAsChild';
import swallowNextClick from '@helpers/dom/swallowNextClick';
import getSortableRun, {isSortableElement} from '@helpers/dom/sortableRun';
import positionElementByIndex from '@helpers/dom/positionElementByIndex';
import whichChild from '@helpers/dom/whichChild';

/**
 * How far the pointer travels before a press on an element that also does something on a press
 * (opens a chat, a story, an album) becomes a drag: the usual few pixels of slack, so that an
 * ordinary click never lifts it. The element is then taken at the pointer, so the slack is neither
 * waited out nor jumped over.
 */
export const DRAG_SLACK = 8;

/**
 * The `threshold` of a list of such elements. On touch the drag starts from a long press instead
 * (`SwipeHandler`'s `withDelay`), which has already said what it is, so the element is picked up
 * right away.
 */
export const PRESSABLE_DRAG_THRESHOLD = IS_TOUCH_SUPPORTED ? 0 : DRAG_SLACK;

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

/**
 * Where an element dragged `yDiff` off its place in a run stands: how far it may go either way,
 * and which of its siblings it has passed - each one once it is half-way past it. Off the heights
 * of the run's elements, top to bottom, which do not have to be equal: a chat with folder tags is
 * a line taller than one without.
 */
export function getSortableDragStep(heights: number[], idx: number, yDiff: number) {
  let minY = 0, maxY = 0;
  for(let i = 0; i < idx; ++i) minY -= heights[i];
  for(let i = idx + 1; i < heights.length; ++i) maxY += heights[i];

  yDiff = clamp(yDiff, minY, maxY);
  const direction = yDiff >= 0 ? 1 : -1;
  const distance = Math.abs(yDiff);
  let count = 0, passedHeight = 0;
  for(let i = idx + direction; i >= 0 && i < heights.length; i += direction) {
    if(distance < passedHeight + heights[i] / 2) {
      break;
    }

    passedHeight += heights[i];
    ++count;
  }

  return {minY, maxY, yDiff, count, passedHeight};
}

/**
 * How a list is laid out, and so which way its elements are dragged: a column (`y`), a line that
 * runs along the text (`x`: it follows the document's direction, the first element at the inline
 * start), or a grid of equal cells that wraps (`grid`), where an element goes anywhere in its run.
 */
export type SortableAxis = 'y' | 'x' | 'grid';

type SortableSlot = {left: number, top: number, width: number, height: number};

/**
 * Where an element dragged over a grid of equal cells lands: the cell nearest to its middle. The
 * cells are where they stood when it was picked up, its middle is where it is now, in the same terms.
 */
export function getSortableGridTarget(slots: SortableSlot[], center: {x: number, y: number}) {
  let target = 0, nearest = Infinity;
  slots.forEach((slot, idx) => {
    const x = slot.left + slot.width / 2 - center.x;
    const y = slot.top + slot.height / 2 - center.y;
    const distance = x * x + y * y;
    if(distance < nearest) {
      nearest = distance;
      target = idx;
    }
  });

  return target;
}

/**
 * The cell the element at `idx` of a grid stands in while the one at `from` is held over `to`: the
 * ones in between step a cell towards the place it left.
 */
export function getSortableGridSlot(idx: number, from: number, to: number) {
  if(idx === from) return to;
  if(from < to && idx > from && idx <= to) return idx - 1;
  if(to < from && idx >= to && idx < from) return idx + 1;
  return idx;
}

export default class Sortable {
  private element: HTMLElement;
  private elementRect: DOMRect;
  private scrollableRect: DOMRect;
  private minY: number;
  private maxY: number;
  private siblings: HTMLElement[];
  private items: HTMLElement[];
  private moveDirection: number;
  /** how tall the siblings the element has passed are together: where it lands, when dropped */
  private passedHeight: number;
  private pickedUp: boolean;
  private pickUpX: number;
  private pickUpY: number;
  private swipeHandler: SwipeHandler;
  private startScrollPos: number;
  private addScrollPos: number;
  /** x: 1 where the line runs left to right, -1 where it runs right to left */
  private inlineSign: number;
  /** x: the space between two elements of the line */
  private gap: number;
  /** grid: the cells of the run where they stood at the pick up, and the element's own and target ones */
  private slots: SortableSlot[];
  private from: number;
  private to: number;
  /** the gesture under way was dropped (`cancel`): it ends where it began */
  private cancelled: boolean;

  private list: HTMLElement;
  private middleware: Middleware;
  private onSort: (prevIdx: number, newIdx: number, context: SortableSortContext) => void;
  /** scrolled along the list's axis (down the page for a grid) while an element is dragged to its edge */
  private scrollable: Pick<ScrollableBase, 'container'>;
  private axis: SortableAxis;
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
    enabled?: Sortable['enabled'],
    /** `y` unless told otherwise */
    axis?: Sortable['axis']
  }) {
    this.threshold = 0;
    this.moveInDom = true;
    this.axis = 'y';
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
      const travel = this.axis === 'y' ? Math.abs(yDiff) :
        this.axis === 'x' ? Math.abs(xDiff) :
        Math.max(Math.abs(xDiff), Math.abs(yDiff));
      if(travel < this.threshold) {
        return;
      }

      this.pickUp();
      // * the element is taken where the pointer already is and follows it from there: handing it
      // * the whole travel would snap it forward by everything the threshold ate
      this.pickUpX = xDiff;
      this.pickUpY = yDiff;
    }

    xDiff -= this.pickUpX;
    yDiff -= this.pickUpY;

    if(this.axis === 'grid') {
      this.moveInGrid(xDiff, yDiff);
    } else {
      // * along a line, what counts is how far the element went towards its end
      this.moveInLine(this.axis === 'x' ? xDiff * this.inlineSign : yDiff);
    }
  };

  /** The element's shift by `diff` along the line, towards its end, as a transform */
  private translateInLine(diff: number) {
    return this.axis === 'x' ? `translateX(${diff * this.inlineSign}px)` : `translateY(${diff}px)`;
  }

  private moveInLine(diff: number) {
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
    // * counted off the rows' own sizes rather than their rects: the siblings carry the drag's
    // * own transforms by now, so their rects no longer say where the run is
    const isX = this.axis === 'x';
    const sizes = this.items.map((item) => isX ? item.offsetWidth + this.gap : item.offsetHeight);
    const step = getSortableDragStep(sizes, idx, diff);
    this.minY = step.minY;
    this.maxY = step.maxY;

    diff = step.yDiff;
    this.element.style.transform = this.translateInLine(diff);
    const toEnd = diff >= 0;
    this.moveDirection = toEnd ? 1 : -1;
    this.passedHeight = step.passedHeight;
    const count = step.count;
    const lastSiblings = this.siblings;
    this.siblings = toEnd ?
      this.items.slice(idx + 1, idx + 1 + count) :
      this.items.slice(idx - count, idx);

    (lastSiblings || []).forEach((sibling) => {
      if(!this.siblings.includes(sibling)) {
        sibling.style.transform = '';
      }
    });

    const elementSize = isX ? this.elementRect.width + this.gap : this.elementRect.height;
    this.siblings.forEach((sibling) => {
      sibling.style.transform = this.translateInLine(elementSize * (toEnd ? -1 : 1));
    });

    const shift = diff * (isX ? this.inlineSign : 1);
    this.scrollToEdge(isX ? shift : 0, isX ? 0 : shift);
  }

  private moveInGrid(xDiff: number, yDiff: number) {
    if(!this.element.isConnected) {
      this.swipeHandler.reset();
      return;
    }

    // * a page loaded under the drag adds cells at the end of the run: they take part from here on, measured
    // * where they would have stood at the pick up. A run that changed any other way - shorter, or in
    // * another order - is no longer the one the drag began on
    const run = getSortableRun(this.element, this.sortableClassName);
    if(run.length < this.items.length || this.items.some((item, idx) => run[idx] !== item)) {
      this.cancel();
      return;
    }

    for(const item of run.slice(this.items.length)) {
      const rect = item.getBoundingClientRect();
      this.slots.push({left: rect.left, top: rect.top + this.addScrollPos, width: rect.width, height: rect.height});
      this.items.push(item);
    }

    // * a cell is free to go anywhere in the run, so it simply follows the pointer, and the cells
    // * it is held over step aside towards the place it left
    this.element.style.transform = `translate(${xDiff}px, ${yDiff}px)`;
    const {from, slots} = this;
    const slot = slots[from];
    const to = getSortableGridTarget(slots, {
      x: slot.left + slot.width / 2 + xDiff,
      y: slot.top + slot.height / 2 + yDiff
    });

    if(to !== this.to) {
      this.to = to;
      this.items.forEach((item, idx) => {
        if(item === this.element) {
          return;
        }

        const target = slots[getSortableGridSlot(idx, from, to)];
        const x = target.left - slots[idx].left;
        const y = target.top - slots[idx].top;
        item.style.transform = x || y ? `translate(${x}px, ${y}px)` : '';
      });
    }

    this.scrollToEdge(xDiff, yDiff);
  }

  /**
   * Scrolls on a little while the element, shifted by `x` and `y` from its place, reaches over an
   * edge of the scrollable - along the line for a line, down the page for a grid. Physical
   * coordinates throughout: the rects are, and `scrollLeft` moves the view right in either direction.
   */
  private scrollToEdge(x: number, y: number) {
    if(!this.scrollableRect) {
      return;
    }

    const isX = this.axis === 'x';
    const start = (isX ? this.elementRect.left + x : this.elementRect.top + y) - this.addScrollPos;
    const end = start + (isX ? this.elementRect.width : this.elementRect.height);
    let change: number;
    if(end >= (isX ? this.scrollableRect.right : this.scrollableRect.bottom)) {
      change = 2;
    } else if(start <= (isX ? this.scrollableRect.left : this.scrollableRect.top)) {
      change = -2;
    }

    if(change) {
      this.scrollable.container[isX ? 'scrollLeft' : 'scrollTop'] += change;
    }
  }

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

  /** The scrollable's offset along the list's axis, physical: what the element's layout moves by */
  private getScrollPos() {
    const container = this.scrollable.container;
    return this.axis === 'x' ? container.scrollLeft : container.scrollTop;
  }

  private onScroll = () => {
    const diff = this.addScrollPos = this.getScrollPos() - this.startScrollPos;
    const isX = this.axis === 'x';
    this.swipeHandler.add(isX ? diff : 0, isX ? 0 : diff);
  };

  private onStart = () => {
    this.pickedUp = false;
    this.siblings = undefined;
    this.cancelled = false;
  };

  /**
   * Drops the gesture under way, if there is one: what it moved goes back to its place and nothing is
   * sorted - for a list whose mode ends while an element is held
   */
  public cancel() {
    if(!this.element) {
      return;
    }

    this.cancelled = true;
    this.swipeHandler.reset();
  }

  /** The visual half of the start, deferred until the pointer has travelled `threshold` */
  private pickUp() {
    this.pickedUp = true;
    this.list.classList.add('is-reordering');
    this.element.classList.add('is-dragging', 'no-transition');
    this.swipeHandler.setCursor('grabbing');
    this.elementRect = this.element.getBoundingClientRect();
    this.addScrollPos = 0;

    if(this.axis === 'x') {
      const style = getComputedStyle(this.list);
      this.inlineSign = style.direction === 'rtl' ? -1 : 1;
      this.gap = parseFloat(style.columnGap) || 0;
    } else if(this.axis === 'grid') {
      // * the run is taken once, as it stands: its cells are where the element can land
      this.items = getSortableRun(this.element, this.sortableClassName);
      this.slots = this.items.map((item) => item.getBoundingClientRect());
      this.from = this.to = this.items.indexOf(this.element);
    }

    if(this.scrollable) {
      this.startScrollPos = this.getScrollPos();
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
    const isGrid = this.axis === 'grid';
    // * the pick up and the first move that shifts anything are two different events, and the drag
    // * can be reset in between (the row can even be dropped from a virtualized list)
    const siblings = (isGrid ? items.filter((item) => item !== this.element) : this.siblings) || [];
    const move = this.cancelled ? 0 :
      isGrid ? this.to - this.from : siblings.length && siblings.length * this.moveDirection;
    const idx = whichChild(this.element);
    const newIdx = idx + move;
    const element = this.element;

    let transform = '';
    if(move && isGrid) {
      const {slots} = this;
      const x = slots[this.to].left - slots[this.from].left;
      const y = slots[this.to].top - slots[this.from].top;
      transform = `translate(${x}px, ${y}px)`;
    } else if(move) {
      transform = this.translateInLine(this.moveDirection * this.passedHeight);
    }

    this.element.classList.remove('no-transition');
    this.element.style.transform = transform;
    // * a dropped gesture takes the ones that made way back together with the element
    if(this.cancelled) {
      siblings.forEach((sibling) => sibling.style.transform = '');
    }

    this.swipeHandler.setCursor('');

    if(this.scrollable) {
      this.scrollable.container.removeEventListener('scroll', this.onScroll);
    }

    if(!IS_TOUCH_SUPPORTED) {
      // Swallow the click that ends the reorder on the active window's body (the PiP doc when popped
      // out), else the post-drag click isn't suppressed there. (The drag itself runs via SwipeHandler.)
      // Without it the row the drag began on is acted upon (a chat list in selection mode toggles it).
      swallowNextClick(getOverlayRoot());
    }

    if(liteMode.isAvailable('motion')) {
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
    this.pickUpX =
      this.pickUpY =
      this.slots =
      this.from =
      this.to =
      this.inlineSign =
      this.gap =
      this.element =
      this.siblings =
      this.items =
      this.elementRect =
      this.minY =
      this.maxY =
      this.passedHeight =
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
