/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import { SliderSuperTab } from "../../slider";

export default class AppArchivedTab extends SliderSuperTab {
  private static filterId = 1;
  private wasFilterId: number;

  init() {
    this.container.id = 'chats-archived-container';
    this.setTitle('ArchivedChats');

    if(!appDialogsManager.chatLists[AppArchivedTab.filterId]) {
      const chatList = appDialogsManager.createChatList();
      appDialogsManager.generateScrollable(chatList, AppArchivedTab.filterId).container.append(chatList);
      appDialogsManager.setListClickListener(chatList, null, true);
      //appDialogsManager.setListClickListener(archivedChatList, null, true); // * to test peer changing
    }

    const scrollable = appDialogsManager.scrollables[AppArchivedTab.filterId];
    this.scrollable.container.replaceWith(scrollable.container);
    this.scrollable = scrollable;
  }

  onOpen() {
    if(this.init) {
      this.init();
      this.init = null;
    }

    this.wasFilterId = appDialogsManager.filterId;
    appDialogsManager.filterId = AppArchivedTab.filterId;
    appDialogsManager.onTabChange();
  }

  // вообще, так делать нельзя, но нет времени чтобы переделать главный чатлист на слайд...
  onOpenAfterTimeout() {
    appDialogsManager.chatLists[this.wasFilterId].innerHTML = '';
  }

  onClose() {
    appDialogsManager.filterId = this.wasFilterId;
    appDialogsManager.onTabChange();
  }

  onCloseAfterTimeout() {
    appDialogsManager.chatLists[AppArchivedTab.filterId].innerHTML = '';
    return super.onCloseAfterTimeout();
  }
}
