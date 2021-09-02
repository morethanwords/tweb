/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { copy, safeReplaceObject } from "../../helpers/object";
import type { DialogFilter, Update } from "../../layer";
import type { Modify } from "../../types";
import type { AppPeersManager } from "../appManagers/appPeersManager";
import type { AppUsersManager } from "../appManagers/appUsersManager";
//import type { ApiManagerProxy } from "../mtproto/mtprotoworker";
import type _rootScope from "../rootScope";
import type {AppMessagesManager, Dialog} from '../appManagers/appMessagesManager';
import type {AppNotificationsManager} from "../appManagers/appNotificationsManager";
import type { ApiUpdatesManager } from "../appManagers/apiUpdatesManager";
import apiManager from "../mtproto/mtprotoworker";
import { forEachReverse } from "../../helpers/array";
import { AppStateManager } from "../appManagers/appStateManager";

export type MyDialogFilter = Modify<DialogFilter, {
  pinned_peers: number[],
  include_peers: number[],
  exclude_peers: number[]
}>;

// ! because 0 index is 'All Chats'
const START_ORDER_INDEX = 1;

export default class FiltersStorage {
  public filters: {[filterId: string]: MyDialogFilter};
  private orderIndex: number;

  constructor(private appMessagesManager: AppMessagesManager,
    private appPeersManager: AppPeersManager, 
    private appUsersManager: AppUsersManager, 
    private appNotificationsManager: AppNotificationsManager, 
    private appStateManager: AppStateManager,
    private apiUpdatesManager: ApiUpdatesManager, 
    /* private apiManager: ApiManagerProxy, */ 
    private rootScope: typeof _rootScope) {
    this.clear();
    this.filters = {};

    this.appStateManager.getState().then((state) => {
      safeReplaceObject(this.filters, state.filters);

      for(const filterId in this.filters) {
        const filter = this.filters[filterId];
        if(filter.hasOwnProperty('orderIndex') && filter.orderIndex >= this.orderIndex) {
          this.orderIndex = filter.orderIndex + 1;
        }

        /* this.appMessagesManager.dialogsStorage.folders[+filterId] = {
          dialogs: []
        }; */
      }
    });

    rootScope.addMultipleEventsListeners({
      updateDialogFilter: this.onUpdateDialogFilter,

      updateDialogFilters: (update) => {
        //console.warn('updateDialogFilters', update);

        const oldFilters = copy(this.filters);

        this.getDialogFilters(true).then(filters => {
          for(const _filterId in oldFilters) {
            const filterId = +_filterId;
            if(!filters.find(filter => filter.id === filterId)) { // * deleted
              this.onUpdateDialogFilter({_: 'updateDialogFilter', id: filterId});
            }
          }

          this.onUpdateDialogFilterOrder({_: 'updateDialogFilterOrder', order: filters.map(filter => filter.id)});
        });
      },

      updateDialogFilterOrder: this.onUpdateDialogFilterOrder
    });
  }

  public clear(init = false) {
    if(!init) {
      safeReplaceObject(this.filters, {});
    }

    this.orderIndex = START_ORDER_INDEX;
  }

  private onUpdateDialogFilter = (update: Update.updateDialogFilter) => {
    if(update.filter) {
      this.saveDialogFilter(update.filter as any);
    } else if(this.filters[update.id]) { // Папка удалена
      //this.getDialogFilters(true);
      this.rootScope.dispatchEvent('filter_delete', this.filters[update.id]);
      delete this.filters[update.id];
    }

    this.appStateManager.pushToState('filters', this.filters);
  };

  private onUpdateDialogFilterOrder = (update: Update.updateDialogFilterOrder) => {
    //console.log('updateDialogFilterOrder', update);

    this.orderIndex = START_ORDER_INDEX;
    update.order.forEach((filterId, idx) => {
      const filter = this.filters[filterId];
      delete filter.orderIndex;
      this.setOrderIndex(filter);
    });

    this.rootScope.dispatchEvent('filter_order', update.order);

    this.appStateManager.pushToState('filters', this.filters);
  };

  public testDialogForFilter(dialog: Dialog, filter: MyDialogFilter) {
    const peerId = dialog.peerId;

    // exclude_peers
    if(filter.exclude_peers.includes(peerId)) {
      return false;
    }

    // include_peers
    if(filter.include_peers.includes(peerId)) {
      return true;
    }

    const pFlags = filter.pFlags;

    // exclude_archived
    if(pFlags.exclude_archived && dialog.folder_id === 1) {
      return false;
    }

    // exclude_read
    if(pFlags.exclude_read && !dialog.unread_count && !dialog.pFlags.unread_mark) {
      return false;
    }

    // exclude_muted
    if(pFlags.exclude_muted) {
      const isMuted = this.appNotificationsManager.isPeerLocalMuted(peerId);
      if(isMuted) {
        return false;
      }
    }

    if(peerId < 0) {
      // broadcasts
      if(pFlags.broadcasts && this.appPeersManager.isBroadcast(peerId)) {
        return true;
      }

      // groups
      if(pFlags.groups && this.appPeersManager.isAnyGroup(peerId)) {
        return true;
      }
    } else {
      // bots
      if(this.appUsersManager.isBot(peerId)) {
        return !!pFlags.bots;
      }
      
      // non_contacts
      if(pFlags.non_contacts && !this.appUsersManager.isContact(peerId)) {
        return true;
      }

      // contacts
      if(pFlags.contacts && this.appUsersManager.isContact(peerId)) {
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

  public toggleDialogPin(peerId: number, filterId: number) {
    const filter = this.filters[filterId];

    const wasPinned = filter.pinned_peers.findAndSplice(p => p === peerId);
    if(!wasPinned) {
      if(filter.pinned_peers.length >= this.rootScope.config.pinned_infolder_count_max) {
        return Promise.reject({type: 'PINNED_DIALOGS_TOO_MUCH'});
      }
      
      filter.pinned_peers.unshift(peerId);
    }
    
    return this.updateDialogFilter(filter);
  }

  public createDialogFilter(filter: MyDialogFilter) {
    const maxId = Math.max(1, ...Object.keys(this.filters).map(i => +i));
    filter = copy(filter);
    filter.id = maxId + 1;
    return this.updateDialogFilter(filter);
  }

  public updateDialogFilter(filter: MyDialogFilter, remove = false) {
    const flags = remove ? 0 : 1;

    return apiManager.invokeApi('messages.updateDialogFilter', {
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
      }

      return bool;
    });
  }

  public getOutputDialogFilter(filter: MyDialogFilter) {
    const c: MyDialogFilter = copy(filter);
    ['pinned_peers', 'exclude_peers', 'include_peers'].forEach(key => {
      // @ts-ignore
      c[key] = c[key].map((peerId: number) => this.appPeersManager.getInputPeerById(peerId));
    });

    forEachReverse(c.include_peers, (peerId, idx) => {
      if(c.pinned_peers.includes(peerId)) {
        c.include_peers.splice(idx, 1);
      }
    });

    return c as any as DialogFilter;
  }

  public async getDialogFilters(overwrite = false): Promise<MyDialogFilter[]> {
    const keys = Object.keys(this.filters);
    if(keys.length && !overwrite) {
      return keys.map(filterId => this.filters[filterId]).sort((a, b) => a.orderIndex - b.orderIndex);
    }

    const filters: MyDialogFilter[] = await apiManager.invokeApiSingle('messages.getDialogFilters') as any;
    for(const filter of filters) {
      this.saveDialogFilter(filter, overwrite);
    }

    //console.log(this.filters);
    return filters;
  }

  public saveDialogFilter(filter: MyDialogFilter, update = true) {
    ['pinned_peers', 'exclude_peers', 'include_peers'].forEach(key => {
      // @ts-ignore
      filter[key] = filter[key].map((peer: any) => this.appPeersManager.getPeerId(peer));
    });

    forEachReverse(filter.include_peers, (peerId, idx) => {
      if(filter.pinned_peers.includes(peerId)) {
        filter.include_peers.splice(idx, 1);
      }
    });
    
    filter.include_peers = filter.pinned_peers.concat(filter.include_peers);

    if(this.filters[filter.id]) {
      Object.assign(this.filters[filter.id], filter);
    } else {
      this.filters[filter.id] = filter;
    }

    this.setOrderIndex(filter);

    if(update) {
      this.rootScope.dispatchEvent('filter_update', filter);
    }
  }

  public setOrderIndex(filter: MyDialogFilter) {
    if(filter.hasOwnProperty('orderIndex')) {
      if(filter.orderIndex >= this.orderIndex) {
        this.orderIndex = filter.orderIndex + 1;
      }
    } else {
      filter.orderIndex = this.orderIndex++ as DialogFilter['orderIndex'];
    }

    this.appStateManager.pushToState('filters', this.filters);
  }
}
