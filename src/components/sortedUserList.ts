/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appDialogsManager, { AppDialogsManager, DialogDom } from "../lib/appManagers/appDialogsManager";
import { getHeavyAnimationPromise } from "../hooks/useHeavyAnimationCheck";
import isInDOM from "../helpers/dom/isInDOM";
import positionElementByIndex from "../helpers/dom/positionElementByIndex";
import replaceContent from "../helpers/dom/replaceContent";
import { fastRaf } from "../helpers/schedulers";
import SortedList, { SortedElementBase } from "../helpers/sortedList";
import safeAssign from "../helpers/object/safeAssign";
import { AppManagers } from "../lib/appManagers/managers";
import getUserStatusString from "./wrappers/getUserStatusString";
import type LazyLoadQueue from "./lazyLoadQueue";

interface SortedUser extends SortedElementBase {
  dom: DialogDom
}

export default class SortedUserList extends SortedList<SortedUser> {
  protected static SORT_INTERVAL = 30e3;
  public list: HTMLUListElement;
  
  protected lazyLoadQueue: LazyLoadQueue;
  protected avatarSize = 48;
  protected rippleEnabled = true;
  protected autonomous = true;
  protected createChatListOptions: Parameters<AppDialogsManager['createChatList']>[0];
  protected onListLengthChange: () => void;
  protected getIndex: (element: SortedUser) => number;
  protected onUpdate: (element: SortedUser) => void;
  protected managers: AppManagers;

  constructor(options: Partial<{
    lazyLoadQueue: SortedUserList['lazyLoadQueue'],
    avatarSize: SortedUserList['avatarSize'],
    rippleEnabled: SortedUserList['rippleEnabled'],
    createChatListOptions: SortedUserList['createChatListOptions'],
    autonomous: SortedUserList['autonomous'],
    onListLengthChange: SortedUserList['onListLengthChange'],
    getIndex: SortedUserList['getIndex'],
    onUpdate: SortedUserList['onUpdate']
  }> & {
    managers: SortedUserList['managers']
  }) {
    super({
      getIndex: options.getIndex || ((element) => this.managers.appUsersManager.getUserStatusForSort(element.id)),
      onDelete: (element) => {
        element.dom.listEl.remove();
        this.onListLengthChange && this.onListLengthChange();
      },
      onUpdate: options.onUpdate || (async(element) => {
        const status = getUserStatusString(await this.managers.appUsersManager.getUser(element.id));
        replaceContent(element.dom.lastMessageSpan, status);
      }),
      onSort: (element, idx) => {
        const willChangeLength = element.dom.listEl.parentElement !== this.list;
        positionElementByIndex(element.dom.listEl, this.list, idx);

        if(willChangeLength && this.onListLengthChange) {
          this.onListLengthChange();
        }
      },
      onElementCreate: (base) => {
        const {dom} = appDialogsManager.addDialogNew({
          peerId: base.id,
          container: false,
          avatarSize: this.avatarSize,
          autonomous: this.autonomous,
          meAsSaved: false,
          rippleEnabled: this.rippleEnabled,
          lazyLoadQueue: this.lazyLoadQueue
        });

        (base as SortedUser).dom = dom;
        return base as SortedUser;
      },
      updateElementWith: fastRaf,
      updateListWith: async(callback) => {
        if(!isInDOM(this.list)) {
          return callback(false);
        }
    
        await getHeavyAnimationPromise();
    
        if(!isInDOM(this.list)) {
          return callback(false);
        }

        callback(true);
      }
    });

    safeAssign(this, options);

    this.list = appDialogsManager.createChatList(this.createChatListOptions);

    let timeout: number;
    const doTimeout = () => {
      timeout = window.setTimeout(() => {
        this.updateList((good) => {
          if(good) {
            doTimeout();
          }
        });
      }, SortedUserList.SORT_INTERVAL);
    };

    doTimeout();
  }
}
