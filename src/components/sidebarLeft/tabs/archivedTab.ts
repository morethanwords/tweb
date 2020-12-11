import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import Scrollable from "../../scrollable";
import { SliderTab } from "../../slider";

export default class AppArchivedTab implements SliderTab {
  public container = document.getElementById('chats-archived-container') as HTMLDivElement;
  public chatList = document.getElementById('dialogs-archived') as HTMLUListElement;
  public scroll: Scrollable = null;
  public loadedAll: boolean;
  public loadDialogsPromise: Promise<any>;
  public wasFilterId: number;

  init() {
    this.scroll = new Scrollable(this.container, 'CLA', 500);
    this.scroll.container.addEventListener('scroll', appDialogsManager.onChatsRegularScroll);
    this.scroll.setVirtualContainer(this.chatList);
    this.scroll.onScrolledBottom = appDialogsManager.onChatsScroll;
    ///this.scroll.attachSentinels();

    appDialogsManager.setListClickListener(this.chatList, null, true);

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
    appDialogsManager.scroll = this.scroll;
    appDialogsManager.filterId = 1;
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
    this.chatList.innerHTML = '';
  }
}
