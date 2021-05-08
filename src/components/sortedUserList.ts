/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { LazyLoadQueueIntersector } from "./lazyLoadQueue";
import appDialogsManager, { DialogDom } from "../lib/appManagers/appDialogsManager";
import { getHeavyAnimationPromise } from "../hooks/useHeavyAnimationCheck";
import appUsersManager from "../lib/appManagers/appUsersManager";
import { insertInDescendSortedArray } from "../helpers/array";
import isInDOM from "../helpers/dom/isInDOM";
import positionElementByIndex from "../helpers/dom/positionElementByIndex";
import replaceContent from "../helpers/dom/replaceContent";

type SortedUser = {
  peerId: number, 
  status: number, 
  dom: DialogDom
};
export default class SortedUserList {
  public static SORT_INTERVAL = 30e3;
  public list: HTMLUListElement;
  public users: Map<number, SortedUser>;
  public sorted: Array<SortedUser>;
  public lazyLoadQueue: LazyLoadQueueIntersector;

  constructor() {
    this.list = appDialogsManager.createChatList();

    this.users = new Map();
    this.sorted = [];

    let timeout: number;
    const doTimeout = () => {
      timeout = window.setTimeout(() => {
        this.updateList().then((good) => {
          if(good) {
            doTimeout();
          }
        });
      }, SortedUserList.SORT_INTERVAL);
    };

    doTimeout();
  }

  public async updateList() {
    if(!isInDOM(this.list)) {
      return false;
    }

    await getHeavyAnimationPromise();

    if(!isInDOM(this.list)) {
      return false;
    }

    this.users.forEach(user => {
      this.update(user.peerId, true);
    });

    this.sorted.forEach((sortedUser, idx) => {
      positionElementByIndex(sortedUser.dom.listEl, this.list, idx);
    });

    return true;
  }

  public add(peerId: number) {
    if(this.users.has(peerId)) {
      return;
    }

    const {dom} = appDialogsManager.addDialogNew({
      dialog: peerId,
      container: false,
      drawStatus: false,
      avatarSize: 48,
      autonomous: true,
      meAsSaved: false,
      rippleEnabled: false,
      lazyLoadQueue: this.lazyLoadQueue
    });

    const sortedUser: SortedUser = {
      peerId,
      status: appUsersManager.getUserStatusForSort(peerId),
      dom
    };

    this.users.set(peerId, sortedUser);
    this.update(peerId);
  }

  public update(peerId: number, batch = false) {
    const sortedUser = this.users.get(peerId);
    sortedUser.status = appUsersManager.getUserStatusForSort(peerId);
    const status = appUsersManager.getUserStatusString(peerId);
    replaceContent(sortedUser.dom.lastMessageSpan, status);

    const idx = insertInDescendSortedArray(this.sorted, sortedUser, 'status');
    if(!batch) {
      positionElementByIndex(sortedUser.dom.listEl, this.list, idx);
    }
  }
}
