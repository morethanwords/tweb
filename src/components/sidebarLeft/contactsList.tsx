import {Accessor, createComputed, createEffect, createMemo, createRenderEffect, createSignal, on, onCleanup, onMount, Show} from 'solid-js';
import {Portal} from 'solid-js/web';
import {User} from '@layer';
import appDialogsManager from '@lib/appDialogsManager';
import apiManagerProxy from '@lib/apiManagerProxy';
import rootScope from '@lib/rootScope';
import {AppManagers} from '@lib/managers';
import sortContacts, {ContactsSortMode} from '@appManagers/utils/users/sortContacts';
import VerticalVirtualList, {createItemsLayout, VerticalVirtualListItemProps, VIRTUAL_LIST_ITEM_CLASS_NAME} from '@components/verticalVirtualList';
import SectionIndex, {SectionIndexLetter} from '@components/sectionIndex';
import {SectionName} from '@components/section';
import type ContactsSelection from '@components/contactsSelection';
import type {DialogsSelectionList} from '@components/dialogsSelectionBase';
import getUserStatusString from '@components/wrappers/getUserStatusString';
import liteMode from '@helpers/liteMode';
import Transitions from '@config/transitions';
import fastSmoothScroll from '@helpers/fastSmoothScroll';
import {cancelAnimationByKey} from '@helpers/animation';
import replaceContent from '@helpers/dom/replaceContent';
import classNames from '@helpers/string/classNames';
import {getMiddleware} from '@helpers/middleware';
import createListenerSetter from '@helpers/solid/createListenerSetter';
import useElementSize from '@hooks/useElementSize';
import {usePeers} from '@stores/peers';
import styles from '@components/sidebarLeft/contactsList.module.scss';

/** An `abitbigger` chat row, which is what a contact is shown as */
const ROW_HEIGHT = 56;
/** A section's letter above its first contact: a section name, as tall as `.section` holds it */
const SECTION_HEIGHT = 40;
/** How far outside the screen rows are kept rendered, so a scroll does not show them being built */
const THRESHOLD_PADDING = ROW_HEIGHT * 4;
/**
 * How long a change of someone's last seen waits before the list is put in that order again -
 * tdesktop's `kSortByOnlineThrottle`: statuses change all the time, and the rows would never rest
 */
const SORT_BY_ONLINE_THROTTLE = 3000;
/** How often the "last seen" lines are brought up to date - "5 minutes ago" does not stay true */
const STATUS_REFRESH_INTERVAL = 30e3;
/** The space under the last row, as the chat list leaves it */
const PADDING_BOTTOM = 8;
/** How long the rows glide to their new places - Android's `DefaultItemAnimator` moves list items so */
const REORDER_TIME = 250;
/** How long a deleted row fades out while the rows under it close the gap - Android's remove */
const REMOVE_TIME = 120;

/** A contact, or the letter of the section that starts there */
type ContactsListItem = PeerId | string;

const isSection = (item: ContactsListItem): item is string => typeof(item) === 'string';
const getItemHeight = (item: ContactsListItem) => isSection(item) ? SECTION_HEIGHT : ROW_HEIGHT;

/**
 * The contacts, as the contacts tab lists them: by how recently each was seen, or alphabetically
 * the way tdesktop has it - sectioned by first letter, with the strip of letters along the side
 * (`SectionIndex`). A search lists what it found in the same order, without the sections.
 *
 * The list is virtual: only the rows on screen, and a few around them, exist at all - an address
 * book runs into thousands, and every row carries an avatar and a live status.
 */
export default function ContactsList(props: {
  managers: AppManagers,
  query: string,
  sortMode: ContactsSortMode,
  /** the scrollable the list is laid out in, from its very top */
  scrollable: HTMLElement,
  /** where the strip of letters goes: over the scrollable, and following the pointer in it */
  indexContainer: HTMLElement,
  selection: ContactsSelection,
  /** hands the list out for the selection and the clicks on it, once it is in the document */
  ref: (list: DialogsSelectionList) => void
}) {
  const peers = usePeers();
  const listenerSetter = createListenerSetter();
  const middlewareHelper = getMiddleware();
  onCleanup(() => middlewareHelper.destroy());

  const [peerIds, setPeerIds] = createSignal<PeerId[]>([]);
  // * sorting reads the users as they are right now, not reactively: the list is put in order again
  // * when something it is ordered by has changed, and no more often than that
  const [sortVersion, setSortVersion] = createSignal(0);
  const resort = () => setSortVersion((version) => version + 1);
  const [statusTick, setStatusTick] = createSignal(0);

  let loadToken = 0;
  /** @param glide whether the rows glide to where the fresh list puts them - not for a list of its own */
  const load = (glide?: boolean) => {
    const token = ++loadToken;
    const middleware = middlewareHelper.get();
    props.managers.appUsersManager.getContactsPeerIds(props.query, false, 'none').then((peerIds) => {
      if(token !== loadToken || !middleware()) {
        return;
      }

      if(glide) reorder(() => setPeerIds(peerIds));
      else setPeerIds(peerIds);
    });
  };

  createEffect(on(() => props.query, () => load()));

  const sorted = createMemo(() => {
    sortVersion();
    return sortContacts(peerIds(), props.sortMode, (userId) => apiManagerProxy.getUser(userId));
  });

  const contactsSet = createMemo(() => new Set(peerIds()));

  // * The rows glide to their new places when the list changes under them - someone came online, a
  // * contact was added or deleted - but not when the order itself is switched or a search typed:
  // * that is a list of its own, and it just appears. The glide is a transform animation, which the
  // * compositor runs: a move animated from here, a frame at a time, stutters with whatever else the
  // * page is busy with, and a list of contacts is busy with avatars. It is made with `animate()`
  // * rather than a transition, since the row that moves furthest has its node moved in the list,
  // * and a node put back into the document has no style of before to transition from.
  let list: HTMLUListElement;
  let reorderTimeout: number;
  // * the moves the update being made has made, and the rows it has taken out of the list, while
  // * it is one that glides
  let moves: {element: HTMLElement, from: number, to: number}[];
  type Removal = {element: HTMLElement, remove: () => void};
  let removals: Removal[];
  let animations: Animation[] = [];
  // the deleted rows fading out, kept in the list until they are gone
  let fading: Removal[] = [];

  /** @param cancel whether the rows are to jump to their places, the list having become another */
  const endReorder = (cancel?: boolean) => {
    clearTimeout(reorderTimeout);
    reorderTimeout = undefined;
    if(cancel) animations.forEach((animation) => animation.cancel());
    animations = [];
    fading.forEach(({remove}) => remove());
    fading = [];
    list?.classList.remove(styles.reordering);
    list?.querySelectorAll('.' + styles.lifted).forEach((element) => element.classList.remove(styles.lifted));
  };

  const reorder = (update: () => void) => {
    const {scrollable} = props;
    const scrollTop = scrollable.scrollTop;
    moves = [];
    removals = [];
    update();
    const made = moves, removed = removals;
    moves = removals = undefined;

    // * when everything on screen moved by the same amount, the list keeps it in place by scrolling
    // * instead (`VerticalVirtualList`) - there is nothing to glide then
    if(
      (!made.length && !removed.length) ||
      scrollable.scrollTop !== scrollTop ||
      !liteMode.isAvailable('animations')
    ) {
      removed.forEach(({remove}) => remove());
      return;
    }

    endReorder(true);
    list.classList.add(styles.reordering);

    // * a deleted row fades where it was, as Android fades a removed item, under the rows that close
    // * the gap - so it goes back into the list first, where they are painted over it
    for(const removal of removed) {
      list.prepend(removal.element);
      fading.push(removal);
      animations.push(removal.element.animate([
        {opacity: 1},
        {opacity: 0}
      ], {duration: REMOVE_TIME, easing: Transitions.standard.easing, fill: 'forwards'}));
    }

    for(const {element, from, to} of made) {
      // a row carried further than to the next place rides over the ones it passes
      element.classList.toggle(styles.lifted, Math.abs(to - from) > ROW_HEIGHT);
      animations.push(element.animate([
        {transform: `translateY(${from}px)`},
        {transform: `translateY(${to}px)`}
      ], {duration: REORDER_TIME, easing: Transitions.standard.easing}));
    }

    reorderTimeout = window.setTimeout(endReorder, REORDER_TIME);
  };

  createComputed(on([() => props.sortMode, () => props.query], () => endReorder(true), {defer: true}));
  onCleanup(() => endReorder(true));

  // * the rows with the section headers between them, as they go down the list, and the letters
  // * with where their sections start - a search lists what it found without sections, as tdesktop
  // * does, and so does the order by last seen
  const content = createMemo(() => {
    const {peerIds, sections} = sorted();
    if(!sections || props.query) {
      return {items: peerIds as ContactsListItem[], sectionByIdx: undefined as string[]};
    }

    const items: ContactsListItem[] = [];
    const sectionByIdx: string[] = [];
    peerIds.forEach((peerId, idx) => {
      const section = sections[idx];
      if(section !== sections[idx - 1]) {
        items.push(section);
        sectionByIdx.push(section);
      }

      items.push(peerId);
      sectionByIdx.push(section);
    });

    return {items, sectionByIdx};
  });

  const layout = createMemo(() => content().sectionByIdx && createItemsLayout(content().items, getItemHeight));

  const letters = createMemo<SectionIndexLetter[]>(() => {
    const {items, sectionByIdx} = content();
    if(!sectionByIdx) {
      return [];
    }

    const itemsLayout = layout();
    const letters: SectionIndexLetter[] = [];
    items.forEach((item, idx) => {
      if(isSection(item)) {
        letters.push({letter: item, top: itemsLayout.top(idx)});
      }
    });

    return letters;
  });

  // * the sections with rows on screen - the strip lights their letters, as tdesktop's does
  const [scrollTop, setScrollTop] = createSignal(0);
  const scrollableSize = useElementSize(() => props.scrollable);
  // * the size comes with the next frame once the tab is shown; until then it is asked of the
  // * element right away, or the strip opening with the tab would come up a frame late and empty
  const viewportHeight = () => scrollableSize.height || props.scrollable.clientHeight;
  const visibleLetters = createMemo(() => {
    const visible: Set<string> = new Set();
    const {items, sectionByIdx} = content();
    if(!sectionByIdx) {
      return visible;
    }

    const itemsLayout = layout();
    const top = scrollTop(), bottom = top + viewportHeight();
    // the first item that reaches into the screen
    let low = 0, high = items.length;
    while(low < high) {
      const middle = (low + high) >> 1;
      if(itemsLayout.top(middle + 1) <= top) low = middle + 1;
      else high = middle;
    }

    for(let idx = low; idx < items.length && itemsLayout.top(idx) < bottom; ++idx) {
      if(!isSection(items[idx])) {
        visible.add(sectionByIdx[idx]);
      }
    }

    return visible;
  });

  const jumpTo = (top: number, animate: boolean) => {
    const {scrollable} = props;
    if(!animate) {
      cancelAnimationByKey(scrollable);
      scrollable.scrollTop = top;
      return;
    }

    fastSmoothScroll({
      container: scrollable,
      element: scrollable,
      getElementPosition: () => top - scrollable.scrollTop,
      position: 'start'
    });
  };

  // * someone's last seen reorders the list by last seen - not at once, and never more than once
  // * in `SORT_BY_ONLINE_THROTTLE`; the order by name does not hear of it at all
  let sortTimeout: number;
  const cancelSortTimeout = () => {
    clearTimeout(sortTimeout);
    sortTimeout = undefined;
  };

  createEffect(on(() => props.sortMode, cancelSortTimeout));
  onCleanup(cancelSortTimeout);

  listenerSetter.add(rootScope)('user_update', (userId) => {
    if(props.sortMode !== 'online' || sortTimeout !== undefined || !contactsSet().has(userId.toPeerId())) {
      return;
    }

    sortTimeout = window.setTimeout(() => {
      sortTimeout = undefined;
      reorder(resort);
    }, SORT_BY_ONLINE_THROTTLE);
  });

  // a renamed contact moves to where its new name goes
  listenerSetter.add(rootScope)('peer_title_edit', ({peerId, threadId}) => {
    if(!threadId && contactsSet().has(peerId)) {
      reorder(resort);
    }
  });

  // * a contact added or deleted - several at once, when they are deleted from the selection - is
  // * asked for again as one list, in the next task
  let reloadTimeout: number;
  listenerSetter.add(rootScope)('contacts_update', () => {
    clearTimeout(reloadTimeout);
    reloadTimeout = window.setTimeout(() => load(true), 0);
  });
  onCleanup(() => clearTimeout(reloadTimeout));

  onMount(() => {
    const interval = window.setInterval(() => setStatusTick((tick) => tick + 1), STATUS_REFRESH_INTERVAL);
    onCleanup(() => clearInterval(interval));

    listenerSetter.add(props.scrollable)('scroll', () => setScrollTop(props.scrollable.scrollTop));
  });

  /** Places an item where the list puts it, and says where it came from when that is to glide */
  const placeItem = (element: HTMLElement, top: Accessor<number>) => {
    let lastTop: number;
    createRenderEffect(() => {
      const _top = top();
      if(moves && lastTop !== undefined && lastTop !== _top) {
        moves.push({element, from: lastTop, to: _top});
      }

      lastTop = _top;
      element.style.transform = `translateY(${_top}px)`;
    });
  };

  const ContactRow = (rowProps: {peerId: PeerId, top: number}) => {
    const dialogElement = appDialogsManager.addDialogNew({
      peerId: rowProps.peerId,
      container: false,
      avatarSize: 'abitbigger',
      autonomous: true,
      meAsSaved: false,
      wrapOptions: {
        middleware: middlewareHelper.get()
      },
      withStories: true
    });

    const {listEl, lastMessageSpan} = dialogElement.dom;
    listEl.classList.add(VIRTUAL_LIST_ITEM_CLASS_NAME, styles.item);
    placeItem(listEl, () => rowProps.top);

    // * the status follows the user, and the clock for "last seen N minutes ago"
    createEffect(() => {
      statusTick();
      replaceContent(lastMessageSpan, getUserStatusString(peers[rowProps.peerId] as User.user));
    });

    // * the row is built as it scrolls into view, so it comes up in the state the selection has it in
    onMount(() => {
      props.selection.applyToElement(listEl, false);
    });

    onCleanup(() => {
      // a contact deleted from the list while it glides fades out before it goes
      if(removals && !contactsSet().has(rowProps.peerId)) {
        removals.push({element: listEl, remove: () => dialogElement.remove()});
        return;
      }

      dialogElement.destroy();
    });

    return listEl;
  };

  const ListItem = (itemProps: VerticalVirtualListItemProps<ContactsListItem>) => {
    const {item} = itemProps;
    if(isSection(item)) {
      let name: HTMLDivElement;
      const section = <SectionName ref={name} class={classNames(VIRTUAL_LIST_ITEM_CLASS_NAME, styles.section)}>{item}</SectionName>;
      placeItem(name, () => itemProps.top);
      return section;
    }

    return <ContactRow peerId={item} top={itemProps.top} />;
  };

  onMount(() => {
    props.ref({
      list,
      getSortedItems: () => sorted().peerIds.map((id) => ({id}))
    });
  });

  return (
    <>
      <VerticalVirtualList
        ref={list}
        class="chatlist virtual-chatlist"
        list={content().items}
        layout={layout()}
        ListItem={ListItem}
        scrollableHost={props.scrollable}
        itemHeight={ROW_HEIGHT}
        thresholdPadding={THRESHOLD_PADDING}
        animate={false}
        extraPaddingBottom={PADDING_BOTTOM}
      />
      <Show when={letters().length >= 2}>
        <Portal mount={props.indexContainer}>
          <SectionIndex
            letters={letters()}
            height={viewportHeight()}
            visibleLetters={visibleLetters()}
            onJump={jumpTo}
            scrollable={props.scrollable}
            approachElement={props.indexContainer}
          />
        </Portal>
      </Show>
    </>
  );
}
