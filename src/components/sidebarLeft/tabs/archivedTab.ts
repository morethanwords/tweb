import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import { SliderSuperTab } from "../../slider";

export default class AppArchivedTab extends SliderSuperTab {
  public static filterId = 1;
  public loadedAll: boolean;
  public loadDialogsPromise: Promise<any>;
  public wasFilterId: number;

  init() {
    this.container.id = 'chats-archived-container';
    this.setTitle('ArchivedChats');

    //this.scrollable = new Scrollable(this.container, 'CLA', 500);
    const chatList = appDialogsManager.chatLists[AppArchivedTab.filterId];
    this.scrollable.append(chatList);
    this.scrollable.container.addEventListener('scroll', appDialogsManager.onChatsRegularScroll);
    this.scrollable.setVirtualContainer(chatList);
    this.scrollable.onScrolledBottom = appDialogsManager.onChatsScroll;
    ///this.scroll.attachSentinels();

    appDialogsManager.setListClickListener(chatList, null, true);

    window.addEventListener('resize', () => {
      setTimeout(appDialogsManager.scroll.checkForTriggers, 0);
    });
  }

  onOpen() {
    if(this.init) {
      this.init();
      this.init = null;
    }

    this.wasFilterId = appDialogsManager.filterId;
    appDialogsManager.scroll = this.scrollable;
    appDialogsManager.filterId = AppArchivedTab.filterId;
    appDialogsManager.onTabChange();
  }

  // вообще, так делать нельзя, но нет времени чтобы переделать главный чатлист на слайд...
  onOpenAfterTimeout() {
    appDialogsManager.chatLists[this.wasFilterId].innerHTML = '';
  }

  onClose() {
    appDialogsManager.scroll = appDialogsManager._scroll;
    appDialogsManager.filterId = this.wasFilterId;
    appDialogsManager.onTabChange();
  }

  onCloseAfterTimeout() {
    appDialogsManager.chatLists[AppArchivedTab.filterId].innerHTML = '';
    return super.onCloseAfterTimeout();
  }
}
