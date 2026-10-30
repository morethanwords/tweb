import {Accessor, createEffect, createSignal, JSX, on, onCleanup, untrack} from 'solid-js';
import {Portal} from 'solid-js/web';
import Sortable, {PRESSABLE_DRAG_THRESHOLD, SortableAxis} from '@helpers/dom/sortable';
import getSortableRun from '@helpers/dom/sortableRun';
import findUpAsChild from '@helpers/dom/findUpAsChild';
import getInlineArrowKeys from '@helpers/dom/getInlineArrowKeys';
import {isElementRTL} from '@helpers/dom/isDocumentRTL';
import createMiddleware from '@helpers/solid/createMiddleware';
import {I18nTsx} from '@helpers/solid/i18n';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import ButtonTsx from '@components/buttonTsx';
import Tabs from '@components/tabs';
import {IS_MOBILE_SAFARI} from '@environment/userAgent';
import type {ScrollableBase} from '@components/scrollable';
import I18n, {LangPackKey} from '@lib/langPack';
import Modes from '@config/modes';

/**
 * The mode a profile's owner rearranges the items of one of its lists in (the albums and the stories
 * of a profile, the gift collections): what carries this class can be dragged to a new place.
 */
export const REORDERABLE_CLASS_NAME = 'is-reorderable';

export type ReorderMode = {
  active: Accessor<boolean>,
  start: () => void,
  stop: () => void
};

/** Escape and the back gesture leave the mode, as they leave a selection */
export function createReorderMode(options?: {onStart?: () => void}): ReorderMode {
  const [active, setActive] = createSignal(false);
  let navigationItem: NavigationItem;

  const stop = () => {
    if(navigationItem) {
      appNavigationController.removeItem(navigationItem);
      navigationItem = undefined;
    }

    setActive(false);
  };

  onCleanup(stop);

  return {
    active,
    start: () => {
      if(active()) {
        return;
      }

      options?.onStart?.();
      setActive(true);
      if(!IS_MOBILE_SAFARI) {
        appNavigationController.pushItem(navigationItem = {
          type: 'multiselect',
          onPop: () => {
            navigationItem = undefined;
            setActive(false);
          }
        });
      }
    },
    stop
  };
}

/** The ids of a run of items, `dataset[key]`, with the one at `from` put at `to` */
export function moveInRun(items: HTMLElement[], from: number, to: number, key: 'mid' | 'value') {
  const ids = items.map((item) => +item.dataset[key]);
  ids.splice(to, 0, ...ids.splice(from, 1));
  return ids;
}

/**
 * Lets the elements of a list be put in a new order by dragging them while the reorder is on, and
 * with the layer, by Alt and an arrow along the line - one place at a time, focus kept on the moved
 * element. Only the ones carrying `REORDERABLE_CLASS_NAME` take part, and only in their run.
 */
export function attachReorder({list, axis, scrollable, active, key, onMove}: {
  list: HTMLElement,
  axis: SortableAxis,
  scrollable: Pick<ScrollableBase, 'container'>,
  active: Accessor<boolean>,
  key: 'mid' | 'value',
  onMove: (ids: number[]) => void
}) {
  const sortable = new Sortable({
    list,
    axis,
    scrollable,
    middleware: createMiddleware().get(),
    // * a press on an element opens what it stands for (a story, an album): a click is not a drag
    threshold: PRESSABLE_DRAG_THRESHOLD,
    // * the list renders its order from its store, which is put in the new one on the drop
    moveInDom: false,
    sortableClassName: REORDERABLE_CLASS_NAME,
    enabled: active,
    onSort: (prevIdx, newIdx, {items, from, to}) => onMove(moveInRun(items, from, to, key))
  });

  // * Escape or back can end the mode with an element still held: it goes back, and nothing is saved
  createEffect(on(active, (active) => {
    if(!active) {
      sortable.cancel();
      returnFocus();
    }
  }, {defer: true}));

  // * with the layer, the focus the bar took with it as it went (its Done) comes back to the list's chosen
  // * element (a chip) - not one the user has put elsewhere
  const returnFocus = () => {
    if(!Modes.a11y) {
      return;
    }

    const focused = list.ownerDocument.activeElement;
    if(focused && focused !== list.ownerDocument.body && !focused.closest(`.${REORDER_BAR_CLASS_NAME}`)) {
      return;
    }

    list.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if(!Modes.a11y || !active() || !e.altKey || e.defaultPrevented) {
      return;
    }

    const {next, previous} = getInlineArrowKeys(isElementRTL(list));
    const step = e.key === next ? 1 : e.key === previous ? -1 : 0;
    const item = findUpAsChild(e.target as HTMLElement, list);
    if(!step || !item?.classList.contains(REORDERABLE_CLASS_NAME)) {
      return;
    }

    e.preventDefault();
    const items = getSortableRun(item, REORDERABLE_CLASS_NAME);
    const from = items.indexOf(item);
    const to = from + step;
    if(to < 0 || to >= items.length) {
      return;
    }

    onMove(moveInRun(items, from, to, key));
    // * the element is moved in the document, which takes the focus off it
    item.focus();
  };

  list.addEventListener('keydown', onKeyDown);
  onCleanup(() => list.removeEventListener('keydown', onKeyDown));
}

const REORDER_BAR_CLASS_NAME = 'search-super-reorder-bar';

/** What the bar says while the mode is on: its name, and the button that leaves it */
export function ReorderBarContent(props: {
  titleKey: LangPackKey,
  onDone: () => void
}) {
  return (
    <div class={`search-super-selection-container ${REORDER_BAR_CLASS_NAME}`}>
      <div class="search-super-selection-count search-super-reorder-title">
        <I18nTsx key={props.titleKey} />
      </div>
      <ButtonTsx
        icon="check"
        class="btn-icon primary"
        aria-label={I18n.format('Done', true)}
        onClick={() => props.onDone()}
      />
    </div>
  );
}

/** The plates that show their bar in a profile's tab row, which every list's plate shares, by how each gives way */
const shownPlates: WeakMap<HTMLElement, Set<() => void>> = new WeakMap();

/**
 * The row shows a bar while any plate in it does, and only while it goes `forwards`, as a selection's transitions
 * leave it. One bar at a time: a plate that comes makes those shown give way, their selection or reorder ending.
 */
function setPlateShown(mount: HTMLElement, giveWay: () => void, shown: boolean) {
  let plates = shownPlates.get(mount);
  if(!plates) {
    shownPlates.set(mount, plates = new Set());
  }

  if(shown) {
    [...plates].forEach((other) => untrack(other));
    plates.add(giveWay);
  } else {
    plates.delete(giveWay);
  }

  const selecting = plates.size > 0;
  mount.classList.toggle('is-selecting', selecting);
  mount.classList.toggle('forwards', selecting);
  mount.classList.toggle('backwards', !selecting);
}

/**
 * The bar of a selection or of a reorder, over the profile's own tab row (`mount`) while `shown`;
 * with nowhere to mount into, it brings the plate the search tabs would have sat on.
 */
export function SelectionPlate(props: {
  shown: Accessor<boolean>,
  mount?: HTMLElement,
  /** ends what the bar is for (`shown` goes): another list's plate takes the row */
  giveWay?: () => void,
  children: JSX.Element
}) {
  if(props.mount) {
    const mount = props.mount;
    const giveWay = () => props.giveWay?.();
    // * only a change of its own counts: a plate that comes idle leaves the row to the one that is on
    let wasShown = false;
    createEffect(() => {
      const shown = props.shown();
      if(shown !== wasShown) {
        setPlateShown(mount, giveWay, wasShown = shown);
      }
    });
    // * the mount is the profile's own tab row, which outlives the list: it is handed back as it is when
    // * nothing is selected
    onCleanup(() => {
      if(wasShown) {
        setPlateShown(mount, giveWay, wasShown = false);
      }
    });

    // * the other lists' bars wait in the same row, which shows every bar in it while one is on: a bar
    // * that is not the one stays hidden
    return (
      <Portal mount={mount}>
        <div classList={{'search-super-selection-idle': !props.shown()}}>{props.children}</div>
      </Portal>
    );
  }

  return (
    <Tabs.MenuShell
      class="search-super-tabs-scrollable sticky is-single search-super-selection-plate"
      classList={{'is-selecting': props.shown(), 'forwards': props.shown(), 'backwards': !props.shown()}}
    >
      {props.children}
    </Tabs.MenuShell>
  );
}
