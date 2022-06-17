/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import type { LOCAL_FOLDER_ID } from "../../../lib/storages/dialogs";
import type { MyDialogFilter } from "../../../lib/storages/filters";
import { SliderSuperTab } from "../../slider";

export default class AppArchivedTab extends SliderSuperTab {
  private static filterId: LOCAL_FOLDER_ID = 1;
  private wasFilterId: number;

  protected init() {
    this.wasFilterId = appDialogsManager.filterId;

    this.container.id = 'chats-archived-container';
    this.setTitle('ArchivedChats');

    if(!appDialogsManager.sortedLists[AppArchivedTab.filterId]) {
      const chatList = appDialogsManager.createChatList();
      appDialogsManager.generateScrollable(chatList, {id: AppArchivedTab.filterId, orderIndex: 1} as any as MyDialogFilter).container.append(chatList);
      appDialogsManager.setListClickListener(chatList, null, true);
      //appDialogsManager.setListClickListener(archivedChatList, null, true); // * to test peer changing
    }

    const scrollable = appDialogsManager.scrollables[AppArchivedTab.filterId];
    this.scrollable.container.replaceWith(scrollable.container);
    this.scrollable = scrollable;

    return appDialogsManager.setFilterIdAndChangeTab(AppArchivedTab.filterId).then(({cached, renderPromise}) => {
      if(cached) {
        return renderPromise;
      }
    });
  }

  // вообще, так делать нельзя, но нет времени чтобы переделать главный чатлист на слайд...
  onOpenAfterTimeout() {
    appDialogsManager.sortedLists[this.wasFilterId].clear();
  }

  onClose() {
    appDialogsManager.setFilterIdAndChangeTab(this.wasFilterId);
  }

  onCloseAfterTimeout() {
    appDialogsManager.sortedLists[AppArchivedTab.filterId].clear();
    return super.onCloseAfterTimeout();
  }
}
