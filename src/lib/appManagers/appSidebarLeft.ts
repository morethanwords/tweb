//import { logger } from "../polyfill";
import appDialogsManager from "./appDialogsManager";
import { $rootScope } from "../utils";
import appImManager from "./appImManager";
//import apiManager from '../mtproto/apiManager';
import apiManager from '../mtproto/mtprotoworker';
import AppSearch, { SearchGroup } from "../../components/appSearch";
import { horizontalMenu, putPreloader } from "../../components/misc";
import appUsersManager from "./appUsersManager";
import Scrollable from "../../components/scrollable_new";
import appPhotosManager from "./appPhotosManager";
import { appPeersManager } from "../services";
import popupAvatar from "../../components/popupAvatar";
import appChatsManager from "./appChatsManager";
import { AppSelectPeers } from "../../components/appSelectPeers";

const SLIDERITEMSIDS = {
  archived: 1,
  contacts: 2,
  newChannel: 3,
  addMembers: 4,
  newGroup: 5,
};

interface SliderTab {
  onClose?: () => void,
  onCloseAfterTimeout?: () => void
}

class AppAddMembersTab implements SliderTab {
  private container = document.querySelector('.addmembers-container') as HTMLDivElement;
  private contentDiv = this.container.querySelector('.sidebar-content') as HTMLDivElement;
  private backBtn = this.container.querySelector('.sidebar-close-button') as HTMLButtonElement;
  private nextBtn = this.contentDiv.querySelector('.btn-corner') as HTMLButtonElement;
  private selector: AppSelectPeers;
  private peerType: 'channel' | 'chat';
  private peerID: number; // always positive
  private takeOut: (peerIDs: number[]) => void

  constructor() {
    this.nextBtn.addEventListener('click', () => {
      let peerIDs = this.selector.getSelected();
      
      if(peerIDs.length) {
        if(this.takeOut) {
          this.takeOut(peerIDs);
          return;
        }

        this.nextBtn.classList.remove('tgico-next');
        this.nextBtn.disabled = true;
        putPreloader(this.nextBtn);
        this.selector.freezed = true;

        appChatsManager.inviteToChannel(this.peerID, peerIDs).then(() => {
          this.backBtn.click();
        });
      }
    });
  }

  public onCloseAfterTimeout() {
    if(this.selector) {
      this.selector.container.remove();
      this.selector = null;
    }
  }

  public init(id: number, type: 'channel' | 'chat', skipable: boolean, takeOut?: AppAddMembersTab['takeOut']) {
    this.peerID = Math.abs(id);
    this.peerType = type;
    this.takeOut = takeOut;

    this.onCloseAfterTimeout();
    this.selector = new AppSelectPeers(this.contentDiv, skipable ? null : (length) => {
      if(length) {
        this.nextBtn.classList.add('is-visible');
      } else {
        this.nextBtn.classList.remove('is-visible');
      }
    }, 'contacts');

    this.nextBtn.innerHTML = '';
    this.nextBtn.disabled = false;
    this.nextBtn.classList.add('tgico-next');
    if(skipable) {
      this.nextBtn.classList.add('is-visible');
    } else {
      this.nextBtn.classList.remove('is-visible');
    }

    appSidebarLeft.selectTab(SLIDERITEMSIDS.addMembers);
  }
}

class AppNewChannelTab implements SliderTab {
  private container = document.querySelector('.new-channel-container') as HTMLDivElement;
  private canvas = this.container.querySelector('.avatar-edit-canvas') as HTMLCanvasElement;
  private channelNameInput = this.container.querySelector('.new-channel-name') as HTMLInputElement;
  private channelDescriptionInput = this.container.querySelector('.new-channel-description') as HTMLInputElement;
  private nextBtn = this.container.querySelector('.btn-corner') as HTMLButtonElement;
  private backBtn = this.container.querySelector('.sidebar-close-button') as HTMLButtonElement;
  private uploadAvatar: () => Promise<any> = null;

  constructor() {
    this.container.querySelector('.avatar-edit').addEventListener('click', () => {
      popupAvatar.open(this.canvas, (_upload) => {
        this.uploadAvatar = _upload;
      });
    });

    this.channelNameInput.addEventListener('input', () => {
      let value = this.channelNameInput.value;
      if(value.length) {
        this.nextBtn.classList.add('is-visible');
      } else {
        this.nextBtn.classList.remove('is-visible');
      }
    });

    this.nextBtn.addEventListener('click', () => {
      let title = this.channelNameInput.value;
      let about = this.channelDescriptionInput.value;

      this.nextBtn.disabled = true;
      appChatsManager.createChannel(title, about).then((channelID) => {
        if(this.uploadAvatar) {
          this.uploadAvatar().then((inputFile: any) => {
            appChatsManager.editPhoto(channelID, inputFile);
          });
        }
        
        appSidebarLeft.removeTabFromHistory(SLIDERITEMSIDS.newChannel);
        appSidebarLeft.addMembersTab.init(channelID, 'channel', true);
      });
    });
  }

  public onCloseAfterTimeout() {
    let ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.uploadAvatar = null;
    this.channelNameInput.value = '';
    this.channelDescriptionInput.value = '';
    this.nextBtn.disabled = false;
  }
}

class AppNewGroupTab implements SliderTab {
  private container = document.querySelector('.new-group-container') as HTMLDivElement;
  private contentDiv = this.container.querySelector('.sidebar-content') as HTMLDivElement;
  private canvas = this.container.querySelector('.avatar-edit-canvas') as HTMLCanvasElement;
  private groupNameInput = this.container.querySelector('.new-group-name') as HTMLInputElement;
  private nextBtn = this.container.querySelector('.btn-corner') as HTMLButtonElement;
  private searchGroup = new SearchGroup('', 'contacts', true, 'new-group-members disable-hover', false);
  private uploadAvatar: () => Promise<any> = null;
  private userIDs: number[];
  
  constructor() {
    this.container.querySelector('.avatar-edit').addEventListener('click', () => {
      popupAvatar.open(this.canvas, (_upload) => {
        this.uploadAvatar = _upload;
      });
    });

    this.groupNameInput.addEventListener('input', () => {
      let value = this.groupNameInput.value;
      if(value.length) {
        this.nextBtn.classList.add('is-visible');
      } else {
        this.nextBtn.classList.remove('is-visible');
      }
    });

    this.nextBtn.addEventListener('click', () => {
      let title = this.groupNameInput.value;

      this.nextBtn.disabled = true;
      appChatsManager.createChat(title, this.userIDs).then((chatID) => {
        if(this.uploadAvatar) {
          this.uploadAvatar().then((inputFile: any) => {
            appChatsManager.editPhoto(chatID, inputFile);
          });
        }
        
        appSidebarLeft.selectTab(0);
      });
    });

    let chatsContainer = document.createElement('div');
    chatsContainer.classList.add('chats-container');
    chatsContainer.append(this.searchGroup.container);

    let scrollable = new Scrollable(chatsContainer);

    this.contentDiv.append(chatsContainer);
  }

  public onClose() {

  }

  public onCloseAfterTimeout() {
    this.searchGroup.clear();

    let ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.uploadAvatar = null;
    this.groupNameInput.value = '';
    this.nextBtn.disabled = false;
  }

  public init(userIDs: number[]) {
    this.userIDs = userIDs;

    appSidebarLeft.selectTab(SLIDERITEMSIDS.newGroup);
    this.userIDs.forEach(userID => {
      let {dom} = appDialogsManager.addDialog(userID, this.searchGroup.list, false, false);

      let subtitle = '';
      subtitle = appUsersManager.getUserStatusString(userID);
      if(subtitle == 'online') {
        subtitle = `<i>${subtitle}</i>`;
      }

      if(subtitle) {
        dom.lastMessageSpan.innerHTML = subtitle;
      }
    });

    this.searchGroup.nameEl.innerText = this.userIDs.length + ' members';
    this.searchGroup.setActive();
  }
}

class AppContactsTab implements SliderTab {
  private container = document.getElementById('contacts-container');
  private list = this.container.querySelector('#contacts') as HTMLUListElement;
  private scrollable: Scrollable;
  private promise: Promise<void>;
  private input = this.container.querySelector('#contacts-search') as HTMLInputElement;

  constructor() {
    appDialogsManager.setListClickListener(this.list);
    this.scrollable = new Scrollable(this.list.parentElement);

    let prevValue = '';
    this.input.addEventListener('input', () => {
      let value = this.input.value;
      if(prevValue != value) {
        this.list.innerHTML = '';
        this.openContacts(prevValue = value);
      }
    });

    // preload contacts
    appUsersManager.getContacts();
  }

  // need to clear, and left 1 page for smooth slide
  public onClose() {
    let pageCount = appPhotosManager.windowH / 72 * 1.25 | 0;
    (Array.from(this.list.children) as HTMLElement[]).slice(pageCount).forEach(el => el.remove());
  }

  public onCloseAfterTimeout() {
    this.list.innerHTML = '';
  }

  public openContacts(query?: string) {
    appSidebarLeft.selectTab(SLIDERITEMSIDS.contacts);
    if(this.promise) return this.promise;
    this.scrollable.onScrolledBottom = null;

    this.promise = appUsersManager.getContacts(query).then(contacts => {
      this.promise = null;

      if(appSidebarLeft.historyTabIDs[appSidebarLeft.historyTabIDs.length - 1] != SLIDERITEMSIDS.contacts) {
        console.warn('user closed contacts before it\'s loaded');
        return;
      }

      let sorted = contacts
      .map(userID => {
        let user = appUsersManager.getUser(userID);
        let status = appUsersManager.getUserStatusForSort(user.status);

        return {user, status};
      })
      .sort((a, b) => b.status - a.status);

      let renderPage = () => {
        let pageCount = appPhotosManager.windowH / 72 * 1.25 | 0;
        let arr = sorted.splice(0, pageCount); // надо splice!

        arr.forEach(({user}) => {
          let {dialog, dom} = appDialogsManager.addDialog(user.id, this.list, false);
  
          let status = appUsersManager.getUserStatusString(user.id);
          dom.lastMessageSpan.innerHTML = status == 'online' ? `<i>${status}</i>` : status;
        });

        if(!sorted.length) renderPage = undefined;
      };

      renderPage();
      this.scrollable.onScrolledBottom = () => {
        if(renderPage) {
          renderPage();
        } else {
          this.scrollable.onScrolledBottom = null;
        }
      };
    });
  }
}

class AppSidebarLeft {
  private sidebarEl = document.getElementById('column-left') as HTMLDivElement;
  private toolsBtn = this.sidebarEl.querySelector('.sidebar-tools-button') as HTMLButtonElement;
  private backBtn = this.sidebarEl.querySelector('.sidebar-back-button') as HTMLButtonElement;
  private searchContainer = this.sidebarEl.querySelector('#search-container') as HTMLDivElement;
  private searchInput = document.getElementById('global-search') as HTMLInputElement;
  
  private menuEl = this.toolsBtn.querySelector('.btn-menu');
  private newGroupBtn = this.menuEl.querySelector('.menu-new-group');
  private contactsBtn = this.menuEl.querySelector('.menu-contacts');
  private archivedBtn = this.menuEl.querySelector('.menu-archive');
  private savedBtn = this.menuEl.querySelector('.menu-saved');
  private logOutBtn = this.menuEl.querySelector('.menu-logout');
  public archivedCount = this.archivedBtn.querySelector('.archived-count') as HTMLSpanElement;

  private newBtnMenu = this.sidebarEl.querySelector('#new-menu');
  private newButtons = {
    channel: this.newBtnMenu.querySelector('.menu-channel'),
    group: this.newBtnMenu.querySelector('.menu-group'),
    privateChat: this.newBtnMenu.querySelector('.menu-private-chat'),
  };
  
  public newChannelTab = new AppNewChannelTab();
  public addMembersTab = new AppAddMembersTab();
  public contactsTab = new AppContactsTab();
  public newGroupTab = new AppNewGroupTab();

  private tabs: {[id: number]: SliderTab} = {
    [SLIDERITEMSIDS.newChannel]: this.newChannelTab,
    [SLIDERITEMSIDS.contacts]: this.contactsTab,
    [SLIDERITEMSIDS.addMembers]: this.addMembersTab,
    [SLIDERITEMSIDS.newGroup]: this.newGroupTab,
  };

  //private log = logger('SL');

  private searchGroups = {
    contacts: new SearchGroup('Contacts and Chats', 'contacts'),
    globalContacts: new SearchGroup('Global Search', 'contacts'),
    messages: new SearchGroup('Global Search', 'messages'),
    people: new SearchGroup('People', 'contacts', false, 'search-group-people'),
    recent: new SearchGroup('Recent', 'contacts', false, 'search-group-recent')
  };
  private globalSearch = new AppSearch(this.searchContainer, this.searchInput, this.searchGroups);

  private _selectTab: (id: number) => void;
  public historyTabIDs: number[] = [];

  constructor() {
    let peopleContainer = document.createElement('div');
    peopleContainer.classList.add('search-group-scrollable');
    peopleContainer.append(this.searchGroups.people.list);
    this.searchGroups.people.container.append(peopleContainer);
    let peopleScrollable = new Scrollable(peopleContainer, 'x');

    this.savedBtn.addEventListener('click', (e) => {
      ///////this.log('savedbtn click');
      setTimeout(() => { // menu doesn't close if no timeout (lol)
        let dom = appDialogsManager.getDialogDom(appImManager.myID);
        appImManager.setPeer(appImManager.myID);
      }, 0);
    });
    
    this.archivedBtn.addEventListener('click', (e) => {
      this.selectTab(SLIDERITEMSIDS.archived);
    });

    this.contactsBtn.addEventListener('click', (e) => {
      this.contactsTab.openContacts();
    });

    this.logOutBtn.addEventListener('click', (e) => {
      apiManager.logOut();
    });

    this.searchInput.addEventListener('focus', (e) => {
      this.toolsBtn.classList.remove('active');
      this.backBtn.classList.add('active');
      this.searchContainer.classList.remove('hide');
      void this.searchContainer.offsetWidth; // reflow
      this.searchContainer.classList.add('active');

      false && this.searchInput.addEventListener('blur', (e) => {
        if(!this.searchInput.value) {
          this.toolsBtn.classList.add('active');
          this.backBtn.classList.remove('active');
          this.backBtn.click();
        }
      }, {once: true});
    });

    this.backBtn.addEventListener('click', (e) => {
      appDialogsManager.chatsArchivedContainer.classList.remove('active');
      this.toolsBtn.classList.add('active');
      this.backBtn.classList.remove('active');
      this.searchContainer.classList.remove('active');

      setTimeout(() => {
        this.searchContainer.classList.add('hide');
        this.globalSearch.reset();

        this.searchGroups.people.setActive();
        //this.searchGroups.recent.setActive();
      }, 150);
    });

    this.newButtons.channel.addEventListener('click', (e) => {
      this.selectTab(SLIDERITEMSIDS.newChannel);
    });

    [this.newButtons.group, this.newGroupBtn].forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.addMembersTab.init(0, 'chat', false, (peerIDs) => {
          this.newGroupTab.init(peerIDs);
        });
      });
    });

    $rootScope.$on('dialogs_archived_unread', (e: CustomEvent) => {
      this.archivedCount.innerText = '' + e.detail.count;
    });

    this._selectTab = horizontalMenu(null, this.sidebarEl.querySelector('.sidebar-slider') as HTMLDivElement, null, null, 420);
    this._selectTab(0);

    let onCloseBtnClick = () => {
      console.log('sidebar-close-button click:', this.historyTabIDs);
      let closingID = this.historyTabIDs.pop(); // pop current
      this.onCloseTab(closingID);
      this._selectTab(this.historyTabIDs.pop() || 0);
    };
    Array.from(this.sidebarEl.querySelectorAll('.sidebar-close-button') as any as HTMLElement[]).forEach(el => {
      el.addEventListener('click', onCloseBtnClick);
    });

    appUsersManager.getTopPeers().then(categories => {
      console.log('got top categories:', categories);

      let category = categories[0];
      if(!category || !category.peers) {
        return;
      }
      
      category.peers.forEach((topPeer: {
        _: 'topPeer',
        peer: any,
        rating: number
      }) => {
        let peerID = appPeersManager.getPeerID(topPeer.peer);
        let {dialog, dom} = appDialogsManager.addDialog(peerID, this.searchGroups.people.list, false, true, true);

        this.searchGroups.people.setActive();
      });
    });
  }

  public selectTab(id: number) {
    this.historyTabIDs.push(id);
    this._selectTab(id);
  }

  public removeTabFromHistory(id: number) {
    this.historyTabIDs.findAndSplice(i => i == id);
    this.onCloseTab(id);
  }

  public onCloseTab(id: number) {
    let tab = this.tabs[id];
    if(tab) {
      if('onClose' in tab) {
        tab.onClose();
      }

      if('onCloseAfterTimeout' in tab) {
        setTimeout(() => {
          tab.onCloseAfterTimeout();
        }, 420);
      }
    }
  }
}

const appSidebarLeft = new AppSidebarLeft();
(window as any).appSidebarLeft = appSidebarLeft;
export default appSidebarLeft;
