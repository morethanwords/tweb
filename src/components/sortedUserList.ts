/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { LazyLoadQueueIntersector } from "./lazyLoadQueue";
import appDialogsManager, { AppDialogsManager, DialogDom } from "../lib/appManagers/appDialogsManager";
import { getHeavyAnimationPromise } from "../hooks/useHeavyAnimationCheck";
import appUsersManager from "../lib/appManagers/appUsersManager";
import isInDOM from "../helpers/dom/isInDOM";
import positionElementByIndex from "../helpers/dom/positionElementByIndex";
import replaceContent from "../helpers/dom/replaceContent";
import { fastRaf } from "../helpers/schedulers";
import SortedList, { SortedElementBase } from "../helpers/sortedList";
import safeAssign from "../helpers/object/safeAssign";

interface SortedUser extends SortedElementBase {
  dom: DialogDom
}

export default class SortedUserList extends SortedList<SortedUser> {
  protected static SORT_INTERVAL = 30e3;
  public list: HTMLUListElement;
  
  protected lazyLoadQueue: LazyLoadQueueIntersector;
  protected avatarSize = 48;
  protected rippleEnabled = true;
  protected autonomous = true;
  protected createChatListOptions: Parameters<AppDialogsManager['createChatList']>[0];
  protected onListLengthChange: () => void;

  constructor(options: Partial<{
    lazyLoadQueue: SortedUserList['lazyLoadQueue'],
    avatarSize: SortedUserList['avatarSize'],
    rippleEnabled: SortedUserList['rippleEnabled'],
    createChatListOptions: SortedUserList['createChatListOptions'],
    autonomous: SortedUserList['autonomous'],
    onListLengthChange: SortedUserList['onListLengthChange']
  }> = {}) {
    super({
      getIndex: (element) => appUsersManager.getUserStatusForSort(element.id),
      onDelete: (element) => {
        element.dom.listEl.remove();
        this.onListLengthChange && this.onListLengthChange();
      },
      onUpdate: (element) => {
        const status = appUsersManager.getUserStatusString(element.id);
        replaceContent(element.dom.lastMessageSpan, status);
      },
      onSort: (element, idx) => {
        const willChangeLength = element.dom.listEl.parentElement !== this.list;
        positionElementByIndex(element.dom.listEl, this.list, idx);

        if(willChangeLength && this.onListLengthChange) {
          this.onListLengthChange();
        }
      },
      onElementCreate: (base) => {
        const {dom} = appDialogsManager.addDialogNew({
          dialog: base.id,
          container: false,
          drawStatus: false,
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
