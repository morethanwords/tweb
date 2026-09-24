import {Accessor, createSignal, JSX, Setter} from 'solid-js';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import confirmationPopup, {PopupConfirmationOptions} from '@components/confirmationPopup';
import DialogsSelectionHeader from '@components/dialogsSelectionHeader';
import type CheckboxField from '@components/checkboxField';
import {AppSelection} from '@components/chat/selection';
import SetTransition from '@components/singleTransition';
import {DRAG_SLACK, PINNED_DIALOG_CLASS_NAME, REORDERABLE_LIST_CLASS_NAME} from '@components/dialogsPinnedReorder';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import findUpClassName from '@helpers/dom/findUpClassName';
import {getMiddleware, MiddlewareHelper} from '@helpers/middleware';
import {mountSolidComponent} from '@helpers/solid/wrapSolidComponent';
import pause from '@helpers/schedulers/pause';
import {dispatchHeavyAnimationEvent} from '@hooks/useHeavyAnimationCheck';
import ListenerSetter from '@helpers/listenerSetter';
import safeAssign from '@helpers/object/safeAssign';
import liteMode from '@helpers/liteMode';
import {I18n, LangPackKey} from '@lib/langPack';
import {AppManagers} from '@lib/managers';

/** The row of a chat list - what these selections select, and what a drag over one runs across */
export const DIALOG_ROW_CLASS_NAME = 'chatlist-chat';

/** The selection's own checkbox on a row, so nothing else on it can be mistaken for one */
const CHECKBOX_CLASS_NAME = 'dialog-select-checkbox';

/**
 * Carried by a row that wears the checkbox: the row opens a lane at its start for it and moves its
 * own contents past it, the way the peer picker lays out its checkboxes - reading that off the
 * checkbox itself would cost every row a `:has()`
 */
const HAS_CHECKBOX_CLASS_NAME = 'has-select-checkbox';

/**
 * Carried by a row on its way OUT of the mode: it still wears the checkbox, which is fading, and
 * whatever it moved aside for the checkbox is moving back. The row loses both this and the class
 * above once that has run out.
 */
const LEAVING_CLASS_NAME = 'is-leaving-selection';

/**
 * Worn by the list itself while the mode is turning on or off, and only then. The rows animate into
 * the mode and out of it off this, so a row that merely scrolls into view while the mode is already
 * on comes up as it is - with its checkbox, and nothing playing.
 */
const ROWS_ANIMATING_CLASS_NAME = 'is-selection-animating';

/** How long the bar fades over the header and back - the very time its own style gives the fade */
const PLATE_FADE_TIME = 200;

/**
 * How long the rows take to come into the mode and out of it - the checkboxes appearing, the lane
 * every row opens for one. It is `--transition-standard-in-time`, which is what their
 * styles animate with, and it is the window the app's own animations stand aside for.
 */
const ROWS_ANIMATION_TIME = 300;

/**
 * Puts a mode's class on the list that is on screen now, taking it off the one that wore it before
 * when that is another list - the list element can be replaced under a mode (a folder rebuilt, a
 * projection redrawn), so the one the class went on is remembered rather than looked up again.
 *
 * @returns the list that wears the class now
 */
function moveListClass(className: string, previous: HTMLElement, list: HTMLElement) {
  if(previous && previous !== list) {
    previous.classList.remove(className);
  }

  list?.classList.add(className);
  return list;
}

/**
 * One item of the bar's menu: an action in ONE direction. `Pin` and `Unpin` are two entries, one of
 * which `verify` lets through - the way every other menu in the app is built.
 */
export type DialogsSelectionMenuItem<Action extends string> = {
  action: Action,
  /** the direction of the answered actions this item stands for */
  direction: boolean,
  icon: Icon,
  text: LangPackKey,
  danger?: boolean
};

/** The items the chat and the topic bars offer alike, for each to put its own menu together from */
export const MENU_ITEM_READ: DialogsSelectionMenuItem<'read'> = {action: 'read', direction: true, icon: 'readchats', text: 'MarkAsRead'};
export const MENU_ITEMS_PIN: DialogsSelectionMenuItem<'pin'>[] = [
  {action: 'pin', direction: true, icon: 'pin', text: 'ChatList.Context.Pin'},
  {action: 'pin', direction: false, icon: 'unpin', text: 'ChatList.Context.Unpin'}
];
export const MENU_ITEMS_MUTE: DialogsSelectionMenuItem<'mute'>[] = [
  {action: 'mute', direction: true, icon: 'mute', text: 'ChatList.Context.Mute'},
  {action: 'mute', direction: false, icon: 'unmute', text: 'ChatList.Context.Unmute'}
];
export const MENU_ITEM_DELETE: DialogsSelectionMenuItem<'delete'> = {action: 'delete', direction: true, icon: 'delete', text: 'Delete', danger: true};

/**
 * What the selection needs of the list it is made in: the element the rows are in, and what the
 * rows are held under in the order the list shows them. `SortedDialogList` is one.
 */
export type DialogsSelectionList = {
  list: HTMLElement,
  getSortedItems: () => {id: any}[]
};

/** What a selection can be done with: an absent key is an action that is not offered at all */
export type DialogsSelectionActionsOf<Action extends string> = Partial<Record<Action, boolean>>;

export type DialogsSelectionBaseOptions = {
  managers: AppManagers,
  /** the header of the sidebar tab the list lives in - the bar stands in for it */
  getHeader: () => HTMLElement,
  /**
   * the list the selection is made in, in `dialogsStorage`'s own filter id space - for a list that
   * is one of its filters (the chats, the topics of a forum)
   */
  getFilterId?: () => number,
  getSortedList: () => DialogsSelectionList,
  /**
   * what a row is held under - the list's own `getDialogKeyFromElement`, so what is selected is
   * held under the very keys the list sorts its rows by
   */
  getDialogKey: (element: HTMLElement) => number,
  /** the element the list lives under, where the drag that selects a stretch is listened for */
  listContainer: HTMLElement
};

/**
 * Selecting several rows of a chat list and acting on all of them at once, the way Android and iOS
 * do it: the header turns into a bar that counts what is held and offers what every one of them can
 * take. Selection starts from a row's context menu and ends when the last row is deselected.
 *
 * The selecting itself - the checkboxes, the drag that runs a selection across a stretch of rows,
 * the mode and its back navigation - is `AppSelection`, the very one the chat and the search select
 * messages with. This adds what a chat list needs on top, and leaves to whoever extends it the two
 * things that differ between a list of chats and a list of topics: what a row is held under, and
 * what can be done with what is held.
 */
export abstract class DialogsSelectionBase<Action extends string = string> extends AppSelection {
  protected getHeader: () => HTMLElement;
  protected getFilterId: () => number;
  protected getSortedList: () => DialogsSelectionList;
  private getDialogKey: (element: HTMLElement) => number;

  /** what is selected, by the key its row is held under (a peer id, a topic id) */
  protected selectedKeys: Set<number> = new Set();
  protected actions: DialogsSelectionActionsOf<Action> = {};

  /** the string the bar counts with, which reads "N chats selected", "N topics selected" and so on */
  protected abstract countLangKey: LangPackKey;

  /**
   * Whether the list's pinned block becomes draggable while its rows are being selected. The chat
   * list is dragged only in this mode (a press on a row otherwise opens the chat); a list that is
   * reorderable throughout leaves this alone, or the mode would take its grip away on the way out.
   */
  protected reorderInSelection = false;

  /** Whether the bar titles itself the way a header with rows does: smaller, for a narrow tab */
  protected compactPlate = false;

  private header: HTMLElement;
  // * the bar is built when the selection starts and dropped when it ends, so neither its listeners
  // * nor its reactive scope accumulate over a session
  private plate: HTMLElement;
  private disposePlate: () => void;
  private plateListenerSetter: ListenerSetter;
  private count: Accessor<number>;
  private setCount: Setter<number>;
  private reorderableList: HTMLElement;
  // the list the rows are animating in, and the timer that takes that mark off it
  private animatingList: HTMLElement;
  private animatingTimeout: number;
  // * rows on their way out of the mode, with the timer that takes the checkbox off at the end of
  // * the animation - a row that comes back into the mode meanwhile cancels its own
  private leavingRows: Map<HTMLElement, number> = new Map();
  private middlewareHelper: MiddlewareHelper = getMiddleware();

  constructor(options: DialogsSelectionBaseOptions) {
    super({
      managers: options.managers,
      getElementFromTarget: (target) => findUpClassName(target, DIALOG_ROW_CLASS_NAME),
      // * the drag runs across rows, but never starts on a pinned one: that press belongs to the
      // * reorder of the pinned block, and the grip on the row says so
      verifyTarget: (e, target) => this.isSelecting &&
        this.canSelect(target) &&
        !target.classList.contains(PINNED_DIALOG_CLASS_NAME),
      targetLookupClassName: DIALOG_ROW_CLASS_NAME,
      lookupBetweenParentClassName: 'chatlist',
      lookupBetweenElementsQuery: '.' + DIALOG_ROW_CLASS_NAME
    });

    safeAssign(this, options);

    // a row opens what it stands for, and in this mode toggles, so a press on one is not a drag
    // until it travels - the same slack the reorder asks for
    this.dragThreshold = DRAG_SLACK;

    // on touch a press on a row belongs to the context menu, and in this mode to the reorder
    if(!IS_TOUCH_SUPPORTED) {
      this.attachListeners(options.listContainer, new ListenerSetter());
    }
  }

  /** Whether a row can take part in the selection at all */
  public abstract canSelect(element: HTMLElement): boolean;

  /** Whether an element is a row of the list on screen - the first thing `canSelect` asks */
  protected isRowOfList(element: HTMLElement) {
    const list = this.getSortedList()?.list;
    return !!element && !!list && element.parentElement === list;
  }

  /** Every direction of every action the bar's menu can offer, in the order it offers them */
  protected abstract getMenuItems(): DialogsSelectionMenuItem<Action>[];

  /** Asks the managers what the selection as a whole can be done with, for the menu to read */
  protected abstract updateActions(): Promise<void>;

  /**
   * Does one of the actions to everything that is selected, in the direction it was offered in.
   * @returns `false` when the selection is to stay: the action was called off, or it is carried on
   * by something else that ends the selection itself
   */
  protected abstract perform(action: Action, direction: boolean): MaybePromise<boolean | void>;

  /** An action picked from the bar: it is done, and with that the selection is over */
  private async performFromMenu(action: Action) {
    const direction = this.actions[action];
    if(direction === undefined) {
      return;
    }

    if(await this.perform(action, direction) !== false) {
      this.cancelSelection();
    }
  }

  /**
   * Asks before a delete, with the red button every delete is confirmed with
   * @returns how the checkboxes were ticked, or `undefined` when the delete was called off
   */
  protected async confirmDeletion(options: Omit<PopupConfirmationOptions, 'button'>): Promise<boolean[]> {
    try {
      const checked = await confirmationPopup({...options, button: {langKey: 'Delete', isDanger: true}});
      return (checked as boolean[]) || [];
    } catch{
      return undefined;
    }
  }

  // * what the selection holds: `AppSelection` keeps messages of peers, this keeps rows of a list
  public length() {
    return this.selectedKeys.size;
  }

  protected clearSelection() {
    this.selectedKeys.clear();
  }

  protected getKeyFromElement(element: HTMLElement) {
    return this.canSelect(element) ? '' + this.getDialogKey(element) : undefined;
  }

  protected getCheckboxName(element: HTMLElement) {
    return '' + this.getDialogKey(element);
  }

  protected isElementShouldBeSelected(element: HTMLElement) {
    return this.selectedKeys.has(this.getDialogKey(element));
  }

  public toggleByElement = (element: HTMLElement, selected?: boolean) => {
    if(!this.canSelect(element)) {
      return;
    }

    const key = this.getDialogKey(element);

    const isSelected = this.selectedKeys.has(key);
    if(selected !== undefined && selected === isSelected) {
      return;
    }

    if(isSelected) {
      this.selectedKeys.delete(key);
    } else {
      this.selectedKeys.add(key);
    }

    this.updateElementSelection(element, !isSelected);
  };

  /**
   * A chat-list row wears `animating`/`forwards`/`backwards` for its own transitions - the muted
   * icon animates off them, the badges take their colour from them - so the selection marks it with
   * the class alone. Nothing of the list reads that class: the checkbox is what shows the mark.
   */
  protected toggleElementSelected(element: HTMLElement, isSelected: boolean) {
    element.classList.toggle('is-selected', isSelected);
  }

  /** The checkbox is the row's own, and is told apart from anything else the row may carry */
  protected appendCheckbox(element: HTMLElement, checkboxField: CheckboxField) {
    checkboxField.label.classList.add(CHECKBOX_CLASS_NAME);
    super.appendCheckbox(element, checkboxField);
  }

  /**
   * Puts a row into the state the selection has it in
   * @param animate whether a row that leaves the mode plays its way out of it - not so for one that
   * is only now coming into view, which simply has to be as the list is
   */
  public applyToElement(element: HTMLElement, animate = true) {
    const leaving = this.leavingRows.get(element);
    if(leaving !== undefined) {
      clearTimeout(leaving);
      this.leavingRows.delete(element);
      element.classList.remove(LEAVING_CLASS_NAME);
    }

    if(this.isSelecting && this.canSelect(element)) {
      this.toggleElementCheckbox(element, true);
      element.classList.add(HAS_CHECKBOX_CLASS_NAME);
      return;
    }

    // * the row leaves the mode the way it came into it: the checkbox fades where it stands and
    // * what moved aside for it moves back, and only then does the row lose them both. Nothing to
    // * animate for a row that was never in the mode, or when the mode is being dropped outright
    if(!animate || !this.animatesRows() || !element.classList.contains(HAS_CHECKBOX_CLASS_NAME)) {
      element.classList.remove(HAS_CHECKBOX_CLASS_NAME);
      this.toggleElementCheckbox(element, false);
      return;
    }

    element.classList.add(LEAVING_CLASS_NAME);
    this.leavingRows.set(element, window.setTimeout(() => {
      this.leavingRows.delete(element);
      element.classList.remove(HAS_CHECKBOX_CLASS_NAME, LEAVING_CLASS_NAME);
      this.toggleElementCheckbox(element, false);
    }, ROWS_ANIMATION_TIME));
  }

  public toggleSelection(toggleCheckboxes = true, forceSelection = false) {
    const ret = super.toggleSelection(toggleCheckboxes, forceSelection);

    if(ret && toggleCheckboxes) {
      // the checkboxes come and go with the mode, so every row on screen hears about it
      const list = this.getSortedList()?.list;
      (Array.from(list?.children || []) as HTMLElement[]).forEach((element) => {
        this.applyToElement(element);
      });
    }

    return ret;
  }

  /** Whether the rows play their way into the mode and out of it - their styles do only then */
  private animatesRows() {
    return !this.doNotAnimate && liteMode.isAvailable('animations');
  }

  protected onToggleSelection = (forwards: boolean) => {
    this.toggleReorderable(forwards);

    const animate = this.animatesRows();
    if(animate) {
      this.markRowsAnimating();

      // * every row on screen puts a checkbox on or takes one off at once, which is a heavy moment:
      // * the app's own animations (stickers, avatars, the virtual list's own moves) stand aside
      // * for as long as it lasts
      dispatchHeavyAnimationEvent(pause(ROWS_ANIMATION_TIME), ROWS_ANIMATION_TIME);
    }

    if(forwards) {
      this.header = this.getHeader();
      this.createPlate();
    }

    // the bar fades over the header it stands in for, and the header's own contents stay put
    SetTransition({
      element: this.plate,
      className: 'is-visible',
      forwards,
      duration: animate ? PLATE_FADE_TIME : 0,
      onTransitionEnd: forwards ? undefined : () => {
        if(this.isSelecting) {
          return;
        }

        this.plateListenerSetter.removeAll();
        this.plate.remove();
        this.disposePlate();
        this.plate = this.disposePlate = this.plateListenerSetter = undefined;
      }
    });
  };

  /**
   * Says on the list that its rows are coming into the mode, or leaving it, right now - for as long
   * as that takes and no longer. What plays is the mode changing, not a row appearing: the virtual
   * list mounts rows as it is scrolled, and those have to come up with the mode already on them.
   */
  private markRowsAnimating() {
    const list = this.getSortedList()?.list;
    if(!list) {
      return;
    }

    clearTimeout(this.animatingTimeout);
    this.animatingList = moveListClass(ROWS_ANIMATING_CLASS_NAME, this.animatingList, list);
    this.animatingTimeout = window.setTimeout(() => {
      this.animatingTimeout = undefined;
      this.animatingList = undefined;
      list.classList.remove(ROWS_ANIMATING_CLASS_NAME);
    }, ROWS_ANIMATION_TIME);
  }

  /**
   * The pinned block is draggable exactly while rows are being selected, and its rows show the grip
   * for it off this class (see `attachPinnedDialogsReorder`)
   */
  private toggleReorderable(reorderable: boolean) {
    if(!this.reorderInSelection) {
      return;
    }

    const list = reorderable ? this.getSortedList()?.list : undefined;
    this.reorderableList = moveListClass(REORDERABLE_LIST_CLASS_NAME, this.reorderableList, list);
  }

  /**
   * The bar itself: a `sidebar-header` faded over the list's own one, with the count and what the
   * selection can take. Five buttons do not fit a sidebar this narrow, so several actions live in a
   * menu rather than beside each other; a single one is a button of its own, as on Android's bar.
   */
  private createPlate() {
    if(this.plate) {
      return;
    }

    this.plateListenerSetter = new ListenerSetter();

    const items = this.getMenuItems();
    const menu = items.length === 1 ? undefined : ButtonMenuToggle({
      buttonOptions: {noRipple: true},
      listenerSetter: this.plateListenerSetter,
      direction: 'bottom-left',
      // * what the rows can take is asked for right before the menu is built, so every item
      // * answers `verify` off a fresh answer
      onOpenBefore: () => this.updateActions(),
      buttons: items.map(({action, direction, icon, text, danger}) => ({
        icon,
        text,
        danger,
        onClick: () => this.performFromMenu(action),
        verify: () => this.actions[action] === direction
      }))
    });
    menu?.classList.add('sidebar-header-right');

    const mounted = mountSolidComponent((middleware) => {
      const [count, setCount] = createSignal(this.length());
      this.count = count;
      this.setCount = setCount;
      middleware.onClean(() => {
        this.count = this.setCount = undefined;
      });

      return DialogsSelectionHeader({
        countLangKey: this.countLangKey,
        compact: this.compactPlate,
        get count() {
          return count();
        },
        onCancel: () => this.cancelSelection(),
        actions: menu || this.renderActionButton(items[0])
      });
    }, this.middlewareHelper.get());

    this.plate = mounted.element;
    this.disposePlate = mounted.dispose;
    this.header.after(this.plate);

    // the bar is built and shown in one go, so the browser is made to look at it transparent first -
    // without that it is born with the class already on and the fade has nothing to start from
    void this.plate.offsetWidth; // reflow
  }

  /** The one action of a bar that has no more: it asks what the rows can take when it is pressed */
  private renderActionButton({action, icon, text}: DialogsSelectionMenuItem<Action>): JSX.Element {
    return ButtonIconTsx({
      class: 'sidebar-header-right',
      icon,
      noRipple: true,
      'aria-label': I18n.format(text, true),
      onClick: async() => {
        await this.updateActions();
        this.performFromMenu(action);
      }
    });
  }

  /** The bar follows the selection: the count is all it shows until the menu is opened */
  protected async updateContainer(forceSelection = false) {
    const count = this.length();
    // * nothing selected means the bar is on its way out - it keeps the number it went out with
    // * rather than counting down to zero in front of the eyes
    if(!count) {
      return;
    }

    this.setCount?.(count);
  }

  /**
   * What is selected in the order it is in the list, topmost first - the order a bulk pin has to
   * follow, since every pin goes to the top.
   */
  protected getOrderedKeys() {
    const items = this.getSortedList()?.getSortedItems() || [];
    const positions = new Map(items.map((item, idx) => [item.id, idx]));
    return Array.from(this.selectedKeys)
    .sort((a, b) => (positions.get(a) ?? Infinity) - (positions.get(b) ?? Infinity));
  }
}
