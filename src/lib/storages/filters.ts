/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { DialogFilter, Update } from "../../layer";
import type { Dialog } from '../appManagers/appMessagesManager';
import forEachReverse from "../../helpers/array/forEachReverse";
import copy from "../../helpers/object/copy";
import { AppManager } from "../appManagers/manager";
import findAndSplice from "../../helpers/array/findAndSplice";
import assumeType from "../../helpers/assumeType";
import { FOLDER_ID_ALL, FOLDER_ID_ARCHIVE, REAL_FOLDERS, REAL_FOLDER_ID } from "../mtproto/mtproto_config";

export type MyDialogFilter = DialogFilter.dialogFilter;

const convertment = [
  ['pinned_peers', 'pinnedPeerIds'], 
  ['exclude_peers', 'excludePeerIds'], 
  ['include_peers', 'includePeerIds']
] as ['pinned_peers' | 'exclude_peers' | 'include_peers', 'pinnedPeerIds' | 'excludePeerIds' | 'includePeerIds'][];

const START_LOCAL_ID = Math.max(...Array.from(REAL_FOLDERS)) + 1 as MyDialogFilter['localId'];
const PREPENDED_FILTERS = REAL_FOLDERS.size;

const LOCAL_FILTER: MyDialogFilter = {
  _: 'dialogFilter',
  pFlags: {},
  flags: 0,
  id: 0,
  title: '',
  exclude_peers: [],
  include_peers: [],
  pinned_peers: [],
  excludePeerIds: [],
  includePeerIds: [],
  pinnedPeerIds: [],
};

export default class FiltersStorage extends AppManager {
  private filters: {[filterId: string]: MyDialogFilter};
  private filtersArr: Array<MyDialogFilter>;
  private localFilters: {[filterId: string]: MyDialogFilter};
  private localId: number;
  private reloadedPeerIds: Set<PeerId>;

  protected after() {
    this.clear(true);

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateDialogFilter: this.onUpdateDialogFilter,

      updateDialogFilters: this.onUpdateDialogFilters,

      updateDialogFilterOrder: this.onUpdateDialogFilterOrder
    });

    // delete peers when dialog is being dropped
    /* rootScope.addEventListener('peer_deleted', (peerId) => {
      for(const filterId in this.filters) {
        const filter = this.filters[filterId];
        let modified = false;
        [filter.pinned_peers, filter.include_peers, filter.exclude_peers].forEach((arr) => {
          forEachReverse(arr, (inputPeer, idx) => {
            if(getPeerId(inputPeer) === peerId) {
              arr.splice(idx, 1);
              modified = true;
            }
          });
        });

        if(modified) {
          this.saveDialogFilter(filter, true);
        }
      }
    }); */

    this.rootScope.addEventListener('premium_toggle', () => {
      this.onUpdateDialogFilters({_: 'updateDialogFilters'});
    });

    return this.appStateManager.getState().then((state) => {
      const filtersArr = this.prependFilters(state.filtersArr);
      filtersArr.map((filter) => {
        this.saveDialogFilter(filter, false, true);
      });
    });
  }

  /**
   * ! use it only with saving
   */
  private prependFilters(filters: DialogFilter[]) {
    filters = filters.slice();

    const allChatsFilter = this.localFilters[FOLDER_ID_ALL];
    const archiveFilter = this.localFilters[FOLDER_ID_ARCHIVE];

    const allChatsFilterIndex = filters.findIndex((filter) => filter._ === 'dialogFilterDefault' || filter.id === FOLDER_ID_ALL);
    if(allChatsFilterIndex !== -1) filters[allChatsFilterIndex] = allChatsFilter;
    else filters.unshift(allChatsFilter);

    findAndSplice(filters, (filter) => (filter as MyDialogFilter).id === FOLDER_ID_ARCHIVE);
    filters.splice(/* 1 */filters[0] === allChatsFilter ? 1 : 0, 0, archiveFilter);

    this.localId = START_LOCAL_ID;
    filters.forEach((filter) => {
      delete filter.localId;
    });

    return filters;
  }

  private generateLocalFilter(id: REAL_FOLDER_ID) {
    const filter: MyDialogFilter = {...copy(LOCAL_FILTER), id};
    if(id === FOLDER_ID_ALL) {
      filter.pFlags.exclude_archived = true;
    } else if(id === FOLDER_ID_ARCHIVE) {
      filter.pFlags.exclude_unarchived = true;
    }

    if(REAL_FOLDERS.has(id)) {
      filter.pinnedPeerIds = this.dialogsStorage.getPinnedOrders(id);
    }

    return filter;
  }

  // private getLocalFilter(id: number) {
  //   return this.filters[id] ??= this.generateLocalFilter(id);
  // }

  public clear = (init?: boolean) => {
    if(!init) {
      // safeReplaceObject(this.filters, {});
      this.reloadedPeerIds.clear();
      this.clearFilters();
    } else {
      this.filters = {};
      this.filtersArr = [];
      this.reloadedPeerIds = new Set();
      
      this.localFilters = {};
      for(const filterId of REAL_FOLDERS) {
        this.localFilters[filterId] = this.generateLocalFilter(filterId as REAL_FOLDER_ID);
      }
    }

    this.localId = START_LOCAL_ID;
  };

  private onUpdateDialogFilter = (update: Update.updateDialogFilter) => {
    if(update.filter) {
      this.saveDialogFilter(update.filter as any);
    } else if(this.filters[update.id]) { // Папка удалена
      //this.getDialogFilters(true);
      this.rootScope.dispatchEvent('filter_delete', this.filters[update.id]);
      delete this.filters[update.id];
      findAndSplice(this.filtersArr, (filter) => (filter as DialogFilter.dialogFilter).id === update.id);
    }

    this.pushToState();
  };

  private onUpdateDialogFilters = (update: Update.updateDialogFilters) => {
    //console.warn('updateDialogFilters', update);

    const oldFilters = copy(this.filters);

    this.getDialogFilters(true).then((filters) => {
      for(const _filterId in oldFilters) {
        const filterId = +_filterId;
        if(!filters.find((filter) => filter.id === filterId)) { // * deleted
          this.onUpdateDialogFilter({_: 'updateDialogFilter', id: filterId});
        }
      }

      this.onUpdateDialogFilterOrder({_: 'updateDialogFilterOrder', order: filters.map((filter) => filter.id)});
    });
  };

  private onUpdateDialogFilterOrder = (update: Update.updateDialogFilterOrder) => {
    //console.log('updateDialogFilterOrder', update);

    const order = update.order.slice();
    if(!order.includes(FOLDER_ID_ARCHIVE)) {
      order.splice(order[0] === FOLDER_ID_ALL ? 1 : 0, 0, FOLDER_ID_ARCHIVE);
    }

    this.localId = START_LOCAL_ID;
    order.forEach((filterId) => {
      const filter = this.filters[filterId];
      delete filter.localId;
      this.setLocalId(filter);
    });

    this.rootScope.dispatchEvent('filter_order', order);

    this.pushToState();
  };

  private pushToState() {
    this.appStateManager.pushToState('filtersArr', this.filtersArr);
  }

  public testDialogForFilter(dialog: Dialog, filter: MyDialogFilter) {
    if(REAL_FOLDERS.has(filter.id)) {
      return dialog.folder_id === filter.id;
    }

    const peerId = dialog.peerId;

    // * check whether dialog exists
    if(!this.appMessagesManager.getDialogOnly(peerId)) {
      return false;
    }

    // exclude_peers
    if(filter.excludePeerIds.includes(peerId)) {
      return false;
    }

    // include_peers
    if(filter.includePeerIds.includes(peerId)) {
      return true;
    }

    const pFlags = filter.pFlags;

    // exclude_archived
    if(pFlags.exclude_archived && dialog.folder_id === FOLDER_ID_ARCHIVE) {
      return false;
    }

    // exclude_read
    if(pFlags.exclude_read && !this.appMessagesManager.isDialogUnread(dialog)) {
      return false;
    }

    // exclude_muted
    if(pFlags.exclude_muted && this.appNotificationsManager.isPeerLocalMuted(peerId) && !(dialog.unread_mentions_count && dialog.unread_count)) {
      return false;
    }

    if(this.appPeersManager.isAnyChat(peerId)) {
      // broadcasts
      if(pFlags.broadcasts && this.appPeersManager.isBroadcast(peerId)) {
        return true;
      }

      // groups
      if(pFlags.groups && this.appPeersManager.isAnyGroup(peerId)) {
        return true;
      }
    } else {
      const userId = peerId.toUserId();
      
      // bots
      if(this.appUsersManager.isBot(userId)) {
        return !!pFlags.bots;
      }
      
      // non_contacts
      if(pFlags.non_contacts && !this.appUsersManager.isContact(userId)) {
        return true;
      }

      // contacts
      if(pFlags.contacts && this.appUsersManager.isContact(userId)) {
        return true;
      }
    }

    return false;
  }

  public testDialogForFilterId(dialog: Dialog, filterId: number) {
    return this.testDialogForFilter(dialog, this.filters[filterId]);
  }

  public getFilter(filterId: number) {
    return this.filters[filterId];
  }

  public getFilters() {
    return this.filters;
  }

  public clearFilters() {
    const filters = this.getFilters();
    for(const filterId in filters) { // delete filters
      if(REAL_FOLDERS.has(+filterId)) {
        continue;
      }

      this.onUpdateDialogFilter({
        _: 'updateDialogFilter',
        id: +filterId,
      });
    }
  }

  public async toggleDialogPin(peerId: PeerId, filterId: number) {
    const filter = this.filters[filterId];

    const index = filter.pinnedPeerIds.indexOf(peerId);
    const wasPinned = index !== -1;

    if(wasPinned) {
      filter.pinned_peers.splice(index, 1);
      filter.pinnedPeerIds.splice(index, 1);
    }
    
    if(!wasPinned) {
      if(filter.pinned_peers.length >= (await this.apiManager.getConfig()).pinned_infolder_count_max) {
        return Promise.reject({type: 'PINNED_DIALOGS_TOO_MUCH'});
      }
      
      filter.pinned_peers.unshift(this.appPeersManager.getInputPeerById(peerId));
      filter.pinnedPeerIds.unshift(peerId);
    }
    
    return this.updateDialogFilter(filter);
  }

  public createDialogFilter(filter: MyDialogFilter, prepend?: boolean) {
    const maxId = Math.max(1, ...Object.keys(this.filters).map((i) => +i));
    filter = copy(filter);
    filter.id = maxId + 1;
    return this.updateDialogFilter(filter, undefined, prepend);
  }

  public updateDialogFilter(filter: MyDialogFilter, remove = false, prepend = false) {
    const flags = remove ? 0 : 1;

    return this.apiManager.invokeApi('messages.updateDialogFilter', {
      flags,
      id: filter.id,
      filter: remove ? undefined : this.getOutputDialogFilter(filter)
    }).then((bool: boolean) => { // возможно нужна проверка и откат, если результат не ТРУ
      //console.log('updateDialogFilter bool:', bool);

      if(bool) {
        /* if(!this.filters[filter.id]) {
          this.saveDialogFilter(filter);
        }

        rootScope.$broadcast('filter_update', filter); */

        this.onUpdateDialogFilter({
          _: 'updateDialogFilter',
          id: filter.id,
          filter: remove ? undefined : filter as any
        });

        if(prepend) {
          const f: MyDialogFilter[] = [];
          for(const filterId in this.filters) {
            const filter = this.filters[filterId];
            ++filter.localId;
            f.push(filter);
          }

          filter.localId = START_LOCAL_ID;

          const order = f.sort((a, b) => a.localId - b.localId).map((filter) => filter.id);
          this.onUpdateDialogFilterOrder({
            _: 'updateDialogFilterOrder',
            order
          });
        }
      }

      return bool;
    });
  }

  public getOutputDialogFilter(filter: MyDialogFilter) {
    const c = copy(filter);
    /* convertment.forEach(([from, to]) => {
      c[from] = c[to].map((peerId) => this.appPeersManager.getInputPeerById(peerId));
    }); */

    this.filterIncludedPinnedPeers(filter);

    return c;
  }

  private filterIncludedPinnedPeers(filter: MyDialogFilter) {
    forEachReverse(filter.includePeerIds, (peerId, idx) => {
      if(filter.pinnedPeerIds.includes(peerId)) {
        filter.include_peers.splice(idx, 1);
        filter.includePeerIds.splice(idx, 1);
      }
    });
  }

  // private spliceMissingPeerIds(filterId: number, type: ArgumentTypes<FiltersStorage['reloadMissingPeerIds']>[1], missingPeerIds: PeerId[]) {
  //   const filter = this.getFilter(filterId);
  //   const peers = filter && filter[type];
  //   if(!peers?.length) {
  //     return;
  //   }

  //   let spliced = false;
  //   missingPeerIds.forEach((peerId) => {
  //     const inputPeer = findAndSplice(peers, (inputPeer) => getPeerId(inputPeer) === peerId);
  //     if(inputPeer) {
  //       spliced = true;
  //     }
  //   });

  //   if(spliced) {
  //     this.onUpdateDialogFilter({
  //       _: 'updateDialogFilter',
  //       id: filterId,
  //       filter
  //     });
  //   }
  // }

  public reloadMissingPeerIds(filterId: number, type: 'pinned_peers' | 'include_peers' | 'exclude_peers' = 'pinned_peers') {
    const filter = this.getFilter(filterId);
    const peers = filter && filter[type];
    if(!peers?.length) {
      return;
    }

    // const missingPeerIds: PeerId[] = [];
    const reloadDialogs = peers.filter((inputPeer) => {
      const peerId = this.appPeersManager.getPeerId(inputPeer);
      const isAlreadyReloaded = this.reloadedPeerIds.has(peerId);
      const dialog = this.appMessagesManager.getDialogOnly(peerId);
      // if(isAlreadyReloaded && !dialog) {
      //   missingPeerIds.push(peerId);
      // }

      const reload = !isAlreadyReloaded && !dialog;
      return reload;
    });

    if(!reloadDialogs.length) {
      // if(missingPeerIds.length) {
      //   this.spliceMissingPeerIds(filterId, type, missingPeerIds);
      // }

      return;
    }

    const reloadPromises = reloadDialogs.map((inputPeer) => {
      const peerId = this.appPeersManager.getPeerId(inputPeer);
      const promise = this.appMessagesManager.reloadConversation(inputPeer)
      .then((dialog) => {
        this.reloadedPeerIds.add(peerId);

        return dialog ? undefined : peerId;
      });

      return promise;
    });

    const reloadPromise = Promise.all(reloadPromises).then((missingPeerIds) => {
      missingPeerIds = missingPeerIds.filter(Boolean);
      if(!missingPeerIds.length) {
        return;
      }

      // this.spliceMissingPeerIds(filterId, type, missingPeerIds);
    });

    return reloadPromise;
  }

  public async getDialogFilters(overwrite = false): Promise<MyDialogFilter[]> {
    const keys = Object.keys(this.filters);
    if(keys.length > PREPENDED_FILTERS && !overwrite) {
      return keys.map((filterId) => this.filters[filterId]).sort((a, b) => a.localId - b.localId);
    }

    const filters = await this.apiManager.invokeApiSingle('messages.getDialogFilters');
    const prepended = this.prependFilters(filters);
    return prepended.map((filter) => this.saveDialogFilter(filter, overwrite)).filter(Boolean);
  }

  public getSuggestedDialogsFilters() {
    return this.apiManager.invokeApi('messages.getSuggestedDialogFilters');
  }

  public saveDialogFilter(filter: DialogFilter, update = true, silent?: boolean) {
    // defineNotNumerableProperties(filter, ['includePeerIds', 'excludePeerIds', 'pinnedPeerIds']);

    if(filter._ === 'dialogFilterDefault') {
      filter = this.localFilters[FOLDER_ID_ALL];
    }

    assumeType<MyDialogFilter>(filter);
    if(!REAL_FOLDERS.has(filter.id)) {
      convertment.forEach(([from, to]) => {
        assumeType<MyDialogFilter>(filter);
        filter[to] = filter[from].map((peer) => this.appPeersManager.getPeerId(peer));
      });

      this.filterIncludedPinnedPeers(filter);
    
      filter.include_peers = filter.pinned_peers.concat(filter.include_peers);
      filter.includePeerIds = filter.pinnedPeerIds.concat(filter.includePeerIds);
    }

    const oldFilter = this.filters[filter.id];
    if(oldFilter) {
      Object.assign(oldFilter, filter);
    } else {
      this.filters[filter.id] = filter;
    }
    
    this.setLocalId(filter);
    
    if(!silent) {
      if(update) {
        this.rootScope.dispatchEvent('filter_update', filter);
      } else if(!oldFilter) {
        this.rootScope.dispatchEvent('filter_new', filter);
      }
    }

    return filter;
  }

  private setLocalId(filter: MyDialogFilter) {
    if(filter.localId !== undefined) {
      if(filter.localId >= this.localId) {
        this.localId = filter.localId + 1;
      }
    } else {
      filter.localId = this.localId++ as MyDialogFilter['localId'];
      findAndSplice(this.filtersArr, (_filter) => _filter.id === filter.id);
      this.filtersArr.push(filter);
      this.pushToState();
    }
  }

  public async isFilterIdAvailable(filterId: number) {
    if(REAL_FOLDERS.has(filterId)) {
      return true;
    }

    const isPremium = this.rootScope.premium;
    let isFolderAvailable = isPremium;
    if(!isPremium) {
      const config = await this.apiManager.getAppConfig();
      const limit = config.dialog_filters_limit_default;
      isFolderAvailable = this.filtersArr.filter((filter) => !REAL_FOLDERS.has(filter.id)).slice(0, limit).some((filter) => filter.id === filterId);
    }

    return isFolderAvailable;
  }
}
