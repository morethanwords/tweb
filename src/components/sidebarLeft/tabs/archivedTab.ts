import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import SidebarSlider, { SliderSuperTab } from "../../slider";

export default class AppArchivedTab extends SliderSuperTab {
  public loadedAll: boolean;
  public loadDialogsPromise: Promise<any>;
  public wasFilterId: number;

  constructor(slider: SidebarSlider) {
    super(slider, true);
  }

  init() {
    this.container.id = 'chats-archived-container';
    this.title.innerHTML = 'Archived Chats';

    //this.scrollable = new Scrollable(this.container, 'CLA', 500);
    this.scrollable.append(appDialogsManager.chatListArchived);
    this.scrollable.container.addEventListener('scroll', appDialogsManager.onChatsRegularScroll);
    this.scrollable.setVirtualContainer(appDialogsManager.chatListArchived);
    this.scrollable.onScrolledBottom = appDialogsManager.onChatsScroll;
    ///this.scroll.attachSentinels();

    appDialogsManager.setListClickListener(appDialogsManager.chatListArchived, null, true);

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
    appDialogsManager.filterId = 1;
    appDialogsManager.onTabChange();

    return super.onOpen();
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
    appDialogsManager.chatListArchived.innerHTML = '';
    return super.onCloseAfterTimeout();
  }
}
