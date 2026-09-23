import type SortedDialogList from '@components/sortedDialogList';
import type {ScrollableBase} from '@components/scrollable';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import Sortable from '@helpers/dom/sortable';
import {Middleware} from '@helpers/middleware';
import {AppManagers} from '@lib/managers';
import {logger} from '@lib/logger';
import movePinnedKey, {PinnedKey} from '@appManagers/utils/dialogs/movePinnedKey';

/**
 * How far the pointer travels before a press on a row becomes a drag. The rows of a chat list are
 * not inert - a press on one opens the chat, or toggles it while chats are being selected - so
 * neither the reorder nor the selection may start under an ordinary click; this is the usual few
 * pixels of slack. The row is then taken at the pointer, so the slack is neither waited out nor
 * jumped over. (tdesktop asks for 30px and animates the row's catch-up instead - the same
 * protection, paid for with a visible lag at the start.)
 */
export const DRAG_SLACK = 8;

/**
 * On touch the reorder starts from a long press instead (`SwipeHandler`'s `withDelay`), which has
 * already said what it is, so the row is picked up right away - as it is on Android, where the same
 * long press drags a pinned chat while the list is in selection mode.
 */
const REORDER_THRESHOLD = IS_TOUCH_SUPPORTED ? 0 : DRAG_SLACK;

/** Carried by a row whose dialog is pinned in the list it is rendered in */
export const PINNED_DIALOG_CLASS_NAME = 'is-pinned';

/**
 * Carried by a list whose pinned block can be dragged right now, and only while that is a mode it
 * is in. The rows read it to show the grip they are dragged by, in place of the time and the
 * badges - the affordance Android puts on a cell it lets you move.
 */
export const REORDERABLE_LIST_CLASS_NAME = 'is-reorderable';

const log = logger('PINNED-REORDER');

/**
 * Lets the pinned block of a chat list be reordered by dragging one of its rows, like every other
 * client. Only the pinned rows take part (they are the only ones carrying
 * `PINNED_DIALOG_CLASS_NAME`), so a row can neither leave the block nor push an unpinned chat
 * around, and the list is left to re-render the new order from its own model.
 */
export default function attachPinnedDialogsReorder({list, scrollable, middleware, sortedList, managers, getFilterId, getDialogKey, canReorder}: {
  list: HTMLElement,
  scrollable: ScrollableBase,
  middleware: Middleware,
  sortedList: SortedDialogList,
  managers: AppManagers,
  /** the list the pins belong to, in `dialogsStorage`'s own filter id space */
  getFilterId: () => number,
  /** the key a row is held under in `sortedList` - the list's own `getDialogKeyFromElement` */
  getDialogKey: (element: HTMLElement) => PinnedKey,
  /**
   * When the list can be reordered at all. The chat list answers with its selection - a press on a
   * row otherwise opens the chat, so the drag belongs to the mode where a press does not - and the
   * owner keeps `REORDERABLE_LIST_CLASS_NAME` in step with it. A list with no such mode says
   * nothing and is reorderable throughout.
   */
  canReorder?: () => boolean
}) {
  // * a list that has a mode may be built while it is already on (a folder rebuilt under a
  // * selection), so it starts in step with it. A list with no mode is reorderable throughout and
  // * says nothing: the grip marks a mode the rows enter and leave, and standing in for their time
  // * and badges is only worth it while it lasts
  list.classList.toggle(REORDERABLE_LIST_CLASS_NAME, !!canReorder?.());

  return new Sortable({
    list,
    middleware,
    scrollable,
    threshold: REORDER_THRESHOLD,
    moveInDom: false,
    sortableClassName: PINNED_DIALOG_CLASS_NAME,
    enabled: canReorder,
    onSort: (prevIdx, newIdx, {items, from, to}) => {
      const filterId = getFilterId();
      const keys = items.map(getDialogKey);
      const reordered = keys.slice();
      reordered.splice(to, 0, ...reordered.splice(from, 1));

      // * the rows are already where the drag left them, so the model is put there in the same
      // * task - a repaint in between would show them jumping back. The managers answer with the
      // * very same order a moment later, which is then a no-op for the sorting.
      // * The list's own move animation is held back for it: the rows have just been carried there
      // * by hand, and animating them again would play the reorder a second time.
      const unblock = sortedList.blockAnimation();
      const revert = sortedList.reorderItems(reordered) ? () => sortedList.reorderItems(keys) : undefined;
      queueMicrotask(unblock);

      pinnedOrderAfterDrag({managers, filterId, key: keys[from], reordered, to}).then(
        (order) => managers.appMessagesManager.reorderPinnedDialogs({filterId, order})
        // * the managers have applied it locally by now and own the state from here, so a refused
        // * request is theirs to reconcile - putting the rows back would only disagree with them
        .catch((err) => log.error('the pinned order was not saved', err)),
        (err) => {
          // nothing was sent, so the rows go back where they were
          log.warn('not reordering the pinned dialogs:', err);
          revert?.();
        }
      );
    }
  });
}

/**
 * Turns the move the drag made into the list's whole pinned order.
 *
 * The order the drag produced covers only the rows that were on screen, and a list can hold pins
 * with no row at all (the member chats of a folded Community keep theirs), so the move is
 * replayed onto the stored order by the neighbour it ended up next to rather than by how many
 * slots it travelled.
 */
async function pinnedOrderAfterDrag({managers, filterId, key, reordered, to}: {
  managers: AppManagers,
  filterId: number,
  key: PinnedKey,
  reordered: PinnedKey[],
  to: number
}) {
  const order = await managers.dialogsStorage.getPinnedOrderForFilter(filterId);
  const moved = movePinnedKey(
    order,
    key,
    to > 0 ? reordered[to - 1] : undefined,
    reordered[to + 1]
  );
  if(!moved) {
    throw new Error('the pins the drag was about are not pinned any more');
  }

  return moved;
}
