import {batch, onCleanup} from 'solid-js';

import {default as appDialogsManager, DialogElement} from '../lib/appManagers/appDialogsManager';
import getDialogIndexKey from '../lib/appManagers/utils/dialogs/getDialogIndexKey';
import {AppManagers} from '../lib/appManagers/managers';
import safeAssign from '../helpers/object/safeAssign';
import namedPromises from '../helpers/namedPromises';
import pickKeys from '../helpers/object/pickKeys';
import {logger} from '../lib/logger';

import {createDeferredSortedVirtualList, DeferredSortedVirtualListItem} from './deferredSortedVirtualList';
import {LoadingDialogSkeletonSize} from './loadingDialogSkeleton';
import Scrollable from './scrollable';


export default class SortedDialogList {
  private appDialogsManager: typeof appDialogsManager;
  public managers: AppManagers;
  public log: ReturnType<typeof logger>;
  public list: HTMLElement;
  public indexKey: ReturnType<typeof getDialogIndexKey>;
  public onListLengthChange: () => void;
  public virtualFilterId: PeerId;

  private virtualList: ReturnType<typeof createDeferredSortedVirtualList<DialogElement>>;

  /**
   * The custom emoji from the last message gets destroyed completely when removing the dialog
   * element from the DOM, with no easy way of re-initializing them, so we need to forcefully
   * re-initialize the last message
   */
  private unmountedDialogElements = new WeakMap<DialogElement, boolean>;

  constructor(options: {
    appDialogsManager: SortedDialogList['appDialogsManager'],
    managers: SortedDialogList['managers'],
    log?: SortedDialogList['log'],
    indexKey: SortedDialogList['indexKey'],
    onListLengthChange?: SortedDialogList['onListLengthChange'],
    virtualFilterId?: SortedDialogList['virtualFilterId'],

    scrollable: Scrollable,
    requestItemForIdx: (idx: number, itemsLength: number) => void,
    onListShrinked: () => void,
    itemSize: LoadingDialogSkeletonSize,
    noAvatar?: boolean // For the loading skeleton placeholder
  }) {
    safeAssign(this, pickKeys(options, [
      'appDialogsManager',
      'managers',
      'log',
      'indexKey',
      'virtualFilterId',
      'onListLengthChange'
    ]));

    this.virtualList = createDeferredSortedVirtualList({
      scrollable: options.scrollable.container,
      getItemElement: (item, key) => {
        if(this.unmountedDialogElements.get(item)) {
          const {options} = this.getDialogOptions(key);

          /**
           * Re-initing the dialog is pretty expensive on performance,
           * so we wait a little bit before it, in case the user scrolls
           * like crazy up and down
           */
          const timeout = self.setTimeout(() => {
            this.appDialogsManager.initDialog(item, options)
            .then(
              () => {
                this.unmountedDialogElements.delete(item);
              },
              () => {}
            );
          }, 200);

          onCleanup(() => {
            self.clearTimeout(timeout);
          });
        }
        return item.dom.listEl;
      },
      onItemUnmount: (item) => {
        this.unmountedDialogElements.set(item, true);
      },
      onListShrinked: options.onListShrinked,
      requestItemForIdx: options.requestItemForIdx,
      sortWith: (a, b) => b - a,
      itemSize: options.itemSize,
      noAvatar: options.noAvatar,
      onListLengthChange: options.onListLengthChange
    });

    this.list = this.virtualList.list;

    this.list.classList.add('chatlist', 'virtual-chatlist');
  }


  public getIndexForKey(key: any) {
    return this.managers.dialogsStorage.getDialogIndex(
      this.virtualFilterId ?? key,
      this.indexKey,
      this.virtualFilterId ? key : undefined
    )
  }

  public async createItemForKey(key: any) {
    const {index, value} = await namedPromises({
      index: this.getIndexForKey(key),
      value: this.createElementForKey(key)
    });

    return {id: key, index, value};
  }

  private getDialogOptions(key: any) {
    const loadPromises: Promise<any>[] = [];

    const options: Parameters<typeof appDialogsManager['addListDialog']>[0] = {
      peerId: this.virtualFilterId ?? key,
      loadPromises,
      isBatch: true,
      threadId: this.virtualFilterId ? key : undefined,
      isMainList: this.indexKey === 'index_0',
      controlled: true,
      wrapOptions: undefined
    };

    return {options, loadPromises};
  }

  public async createElementForKey(key: any) {
    const {options, loadPromises} = this.getDialogOptions(key);

    const dialogElement = this.appDialogsManager.addListDialog(options);

    await Promise.all(loadPromises);

    return dialogElement;
  }

  public addDeferredItems(items: DeferredSortedVirtualListItem<DialogElement>[], totalCount: number) {
    batch(() => {
      this.virtualList.setWasAtLeastOnceFetched(true);
      this.virtualList.addItems(items);
      this.virtualList.setTotalCount(totalCount);
    });
  }

  public async add(key: any) {
    const item = await this.createItemForKey(key);
    this.virtualList.addItems([item]);
    // this.virtualList.setTotalCount(prev => prev + 1);
  }

  public delete(key: any) {
    this.virtualList.removeItem(key);
    this.virtualList.setTotalCount(prev => prev - 1);
  }

  public has(key: any) {
    return this.virtualList.has(key);
  }

  public get(key: any) {
    return this.virtualList.get(key);
  }

  public getAll() {
    return this.virtualList.getAll();
  }

  public getSortedItems() {
    return this.virtualList.sortedItems();
  }

  public async update(key: any) {
    const index = await this.getIndexForKey(key);
    this.virtualList.updateItem(key, index);
  }

  public itemsLength() {
    return this.virtualList.itemsLength();
  }

  public clear() {
    this.virtualList?.clear();
  }

  public destroy() {
    this.virtualList?.dispose();
  }
}
