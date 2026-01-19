import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import DialogsPlaceholder from '@helpers/dialogsPlaceholder';
import replaceContent from '@helpers/dom/replaceContent';
import ListenerSetter from '@helpers/listenerSetter';
import throttle from '@helpers/schedulers/throttle';
import {SequentialCursorFetcher, SequentialCursorFetcherResult} from '@helpers/sequentialCursorFetcher';
import windowSize from '@helpers/windowSize';
import type {AppDialogsManager} from '@lib/appDialogsManager';
import appImManager from '@lib/appImManager';
import {AppManagers} from '@lib/managers';
import getDialogIndex from '@appManagers/utils/dialogs/getDialogIndex';
import getDialogIndexKey from '@appManagers/utils/dialogs/getDialogIndexKey';
import {isForumTopic} from '@appManagers/utils/dialogs/isDialog';
import {logger} from '@lib/logger';
import rootScope from '@lib/rootScope';
import {AnyDialog} from '@lib/storages/dialogs';
import {MonoforumDialog} from '@lib/storages/monoforumDialogs';
import Scrollable from '@components/scrollable';
import SortedDialogList from '@components/sortedDialogList';
import {AutonomousDialogList} from '@components/autonomousDialogList/dialogs';


export const DIALOG_LOAD_COUNT = 20;
const NOT_IMPLEMENTED_ERROR = new Error('not implemented');

type DialogKey = any;
export type PossibleDialog = AnyDialog | MonoforumDialog;

export type BaseConstructorArgs = {
  appDialogsManager: AppDialogsManager;
};

export class AutonomousDialogListBase<T extends PossibleDialog = PossibleDialog> {
  public sortedList: SortedDialogList;
  public scrollable: Scrollable;
  public loadedDialogsAtLeastOnce: boolean;
  public needPlaceholderAtFirstTime: boolean;
  // protected offsets: {top: number, bottom: number};
  protected indexKey: ReturnType<typeof getDialogIndexKey>;
  protected sliceTimeout: number;
  protected managers: AppManagers;
  protected appDialogsManager: AppDialogsManager;
  protected listenerSetter: ListenerSetter;
  protected loadDialogsPromise: Promise<{cached: boolean, renderPromise: AutonomousDialogList['loadDialogsRenderPromise']}>;
  protected loadDialogsRenderPromise: Promise<void>;
  protected placeholder: DialogsPlaceholder;
  protected log: ReturnType<typeof logger>;
  protected placeholderOptions: ConstructorParameters<typeof DialogsPlaceholder>[0];

  protected cursorFetcher = new SequentialCursorFetcher((cursor: number) => this.loadDialogs(cursor));
  protected hasReachedTheEnd = false;

  protected skipMigrated = true;

  public requestItemForIdx = (idx: number, itemsLength?: number) => {
    this.cursorFetcher.fetchUntil(idx + 1, itemsLength);
  }

  public onListShrinked = () => {
    const items = this.sortedList.getSortedItems();
    const last = items[items.length - 1];

    this.cursorFetcher.setFetchedItemsCount(items.length);
    this.cursorFetcher.setNeededCount(items.length);
    this.cursorFetcher.setCursor(last?.index);

    // Make sure the current request is canceled so the cursor is not overriden to a bigger page
    this.loadDialogsDeferred.reject();
  }

  constructor({appDialogsManager}: BaseConstructorArgs) {
    this.log = logger('CL');
    this.managers = rootScope.managers;
    this.listenerSetter = new ListenerSetter();
    this.appDialogsManager = appDialogsManager;
  }

  public setIndexKey(indexKey: AutonomousDialogListBase['indexKey']) {
    this.indexKey = indexKey;
    this.sortedList.indexKey = indexKey;
  }

  protected deleteDialogByKey(key: DialogKey) {
    this.sortedList.delete(key);
  }

  public deleteDialog(dialog: T) {
    return this.deleteDialogByKey(this.getDialogKey(dialog));
  }

  /**
   * @returns Returns `true` if a new dialog was just added
   */
  private addOrDeleteDialogIfNeeded(dialog: T, key: any) {
    if(!this.canUpdateDialog(dialog)) {
      this.deleteDialog(dialog);
      return false;
    }

    if(!this.sortedList.has(key)) {
      this.sortedList.add(key);
      return true;
    }

    return false;
  }

  public updateDialog(dialog: T) {
    const key = this.getDialogKey(dialog);

    if(this.addOrDeleteDialogIfNeeded(dialog, key)) return;

    const dialogElement = this.getDialogElement(key);
    if(!dialogElement) {
      return;
    }

    this.appDialogsManager.setLastMessageN({
      dialog,
      dialogElement,
      setUnread: true
    });
    this.sortedList.update(key);
  }

  protected canUpdateDialog(dialog: T) {
    const sortedItems = this.sortedList.getSortedItems();
    const last = sortedItems[sortedItems.length - 1];

    const bottomIndex = last?.index;
    const dialogIndex = getDialogIndex(dialog, this.indexKey);

    return !last || dialogIndex >= bottomIndex || this.hasReachedTheEnd;
  }

  public onChatsScroll() {
    this.requestItemForIdx(0);
  };

  protected onScrolledBottom() {
    this.cursorFetcher.tryToFetchMore();
  }

  public createPlaceholder(): DialogsPlaceholder {
    const placeholder = this.placeholder = new DialogsPlaceholder(this.placeholderOptions);
    const getRectFrom = this.getRectFromForPlaceholder();
    placeholder.attach({
      container: this.sortedList.list.parentElement,
      getRectFrom,
      onRemove: () => {
        if(this.placeholder === placeholder) {
          this.placeholder = undefined;

          // The dialogs placeholder is a little taller than the container, so we need to update the scrollbar
          this.scrollable?.onScroll?.();
        }
      },
      blockScrollable: this.scrollable
    });

    return placeholder;
  }

  private loadDialogsDeferred: CancellablePromise<SequentialCursorFetcherResult<number>>;

  public async loadDialogs(offsetIndex?: number) {
    this.loadDialogsDeferred = deferredPromise();

    this.loadDialogsInner(offsetIndex)
    .then(
      this.loadDialogsDeferred.resolve.bind(this.loadDialogsDeferred),
      this.loadDialogsDeferred.reject.bind(this.loadDialogsDeferred)
    );

    return this.loadDialogsDeferred;
  }

  public getDialogKey(dialog: T): DialogKey {
    throw NOT_IMPLEMENTED_ERROR;
  }

  public getDialogKeyFromElement(element: HTMLElement): DialogKey {
    throw NOT_IMPLEMENTED_ERROR;
  }

  public getRectFromForPlaceholder(): Parameters<DialogsPlaceholder['attach']>[0]['getRectFrom'] {
    throw NOT_IMPLEMENTED_ERROR;
  }

  public getDialogFromElement(element: HTMLElement): Promise<T> {
    throw NOT_IMPLEMENTED_ERROR;
  }

  protected getFilterId(): number {
    throw NOT_IMPLEMENTED_ERROR;
  }

  public checkForDialogsPlaceholder() {
    if(this.placeholder || this.loadedDialogsAtLeastOnce) return;

    this.placeholder = this.createPlaceholder();
  }

  private guessLoadCount() {
    // Make sure we have some scroll even when the screen is very huge
    return Math.max(windowSize.height / 64 * 1.25 | 0, DIALOG_LOAD_COUNT);
  }

  public async preloadDialogs() {
    const filterId = this.getFilterId();

    await this.managers.acknowledged.dialogsStorage.getDialogs({
      offsetIndex: 0,
      limit: this.guessLoadCount(),
      filterId,
      skipMigrated: this.skipMigrated
    });

    this.checkForDialogsPlaceholder();
  }

  protected async dialogsFetcher(offsetIndex: number, limit: number): Promise<{dialogs: PossibleDialog[], count: number, isEnd: boolean}> {
    const ackedResult = await this.managers.acknowledged.dialogsStorage.getDialogs({
      offsetIndex,
      limit,
      filterId: this.getFilterId(),
      skipMigrated: this.skipMigrated
    });

    const result = await ackedResult.result;

    return result;
  }

  public async loadDialogsInner(offsetIndex?: number): Promise<SequentialCursorFetcherResult<number>> {
    const filterId = this.getFilterId();

    this.checkForDialogsPlaceholder();

    /**
     * The first time getDialogs might return `count: null`, which is not good for this
     * infinite loading implementation, that's why we're refetching after 0.5 seconds to
     * make sure we get the latest total count of dialogs to properly render the whole list
     */
    let shouldRefetch = false;
    if(this.appDialogsManager.isFirstDialogsLoad && !offsetIndex) {
      this.appDialogsManager.isFirstDialogsLoad = false;
      shouldRefetch = true;
    }

    const result = await this.dialogsFetcher(offsetIndex, this.guessLoadCount());

    if(shouldRefetch) {
      setTimeout(async() => {
        const {totalCount} = await this.loadDialogsInner();
        this.cursorFetcher.setFetchedItemsCount(totalCount);
      }, 500);
    }

    const newOffsetIndex = result.dialogs.reduce((prev, curr) => {
      const index = getDialogIndex(curr, this.indexKey);
      return index < prev ? index : prev;
    }, offsetIndex || Infinity);

    const items = await Promise.all(result.dialogs.map(async(dialog) => {
      const key = this.getDialogKey(dialog as T);

      return this.sortedList.createItemForKey(key);
    }));

    if(this.loadDialogsDeferred?.isRejected) throw new Error();

    this.loadedDialogsAtLeastOnce = true;
    this.hasReachedTheEnd = !!result.isEnd;

    this.sortedList.addDeferredItems(items, result.count || 0);

    this.placeholder?.detach(this.sortedList.itemsLength());

    return {
      cursor: newOffsetIndex === Infinity ? undefined : newOffsetIndex,
      count: result.dialogs.length,
      totalCount: this.sortedList.itemsLength() // Note that at some point we might add duplicates
    };
  }

  public async setTyping(dialog: T) {
    const key = this.getDialogKey(dialog);
    const dom = this.getDialogDom(key);
    if(!dom) {
      return;
    }

    const oldTypingElement = dom.lastMessageSpan.querySelector('.peer-typing-container') as HTMLElement;
    const newTypingElement = await appImManager.getPeerTyping(
      dialog.peerId,
      oldTypingElement,
      isForumTopic(dialog) ? dialog.id : undefined
    );
    if(!oldTypingElement && newTypingElement) {
      replaceContent(dom.lastMessageSpan, newTypingElement);
      dom.lastMessageSpan.classList.add('user-typing');
    }
  }

  public unsetTyping(dialog: T) {
    const key = this.getDialogKey(dialog);
    const dialogElement = this.getDialogElement(key);
    if(!dialogElement) {
      return;
    }

    dialogElement.dom.lastMessageSpan.classList.remove('user-typing');
    this.appDialogsManager.setLastMessageN({
      dialog,
      lastMessage: null,
      dialogElement,
      setUnread: null
    });
  }

  public getDialogDom(key: DialogKey) {
    // return this.doms[peerId];
    const element = this.sortedList.get(key);
    return element?.dom;
  }

  public getDialogElement(key: DialogKey) {
    const element = this.sortedList.get(key);
    return element;
  }

  public bindScrollable() {
    this.scrollable.onScrolledBottom = throttle(() => {
      this.onScrolledBottom();
    }, 200, false);
  }

  public clear() {
    this.sortedList.clear();
    this.placeholder?.remove();
    this.loadDialogsDeferred?.reject();
    this.cursorFetcher.reset();
    this.hasReachedTheEnd = false;
  }

  public reset() {
    this.loadDialogsRenderPromise = undefined;
    this.loadDialogsPromise = undefined;
  }

  public fullReset() {
    this.reset();
    this.clear();
    return this.onChatsScroll();
  }

  public destroy() {
    this.clear();
    this.scrollable.destroy();
    this.listenerSetter.removeAll();
    this.sortedList?.destroy();
  }
}
