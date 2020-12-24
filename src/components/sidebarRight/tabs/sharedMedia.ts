import appImManager from "../../../lib/appManagers/appImManager";
import appMessagesManager, { MyInputMessagesFilter } from "../../../lib/appManagers/appMessagesManager";
import appPeersManager from "../../../lib/appManagers/appPeersManager";
import appProfileManager from "../../../lib/appManagers/appProfileManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import { logger } from "../../../lib/logger";
import { RichTextProcessor } from "../../../lib/richtextprocessor";
import rootScope from "../../../lib/rootScope";
import AppSearchSuper from "../../appSearchSuper.";
import AvatarElement from "../../avatar";
import Scrollable from "../../scrollable";
import { SliderTab } from "../../slider";

let setText = (text: string, el: HTMLDivElement) => {
  window.requestAnimationFrame(() => {
    if(el.childElementCount > 1) {
      el.firstElementChild.remove();
    }
    
    let p = document.createElement('p');
    p.innerHTML = text;
    el.prepend(p);
    
    el.style.display = '';
  });
};

// TODO: отредактированное сообщение не изменится
export default class AppSharedMediaTab implements SliderTab {
  public container: HTMLElement;
  public closeBtn: HTMLElement;

  private peerId = 0;
  private threadId = 0;

  public profileContentEl: HTMLDivElement;
  public profileElements: {
    avatar: AvatarElement,
    name: HTMLDivElement,
    subtitle: HTMLDivElement,
    bio: HTMLDivElement,
    username: HTMLDivElement,
    phone: HTMLDivElement,
    notificationsRow: HTMLDivElement,
    notificationsCheckbox: HTMLInputElement,
    notificationsStatus: HTMLParagraphElement
  } = {} as any;

  public historiesStorage: {
    [peerId: number]: Partial<{
      [type in MyInputMessagesFilter]: number[]
    }>
  } = {};

  public scroll: Scrollable = null;

  private log = logger('SM'/* , LogLevels.error */);
  setPeerStatusInterval: number;
  cleaned: boolean;
  searchSuper: AppSearchSuper;

  public init() {
    this.container = document.getElementById('shared-media-container');
    this.closeBtn = this.container.querySelector('.sidebar-close-button');

    this.profileContentEl = this.container.querySelector('.profile-content');
    this.profileElements = {
      avatar: this.profileContentEl.querySelector('.profile-avatar'),
      name: this.profileContentEl.querySelector('.profile-name'),
      subtitle: this.profileContentEl.querySelector('.profile-subtitle'),
      bio: this.profileContentEl.querySelector('.profile-row-bio'),
      username: this.profileContentEl.querySelector('.profile-row-username'),
      phone: this.profileContentEl.querySelector('.profile-row-phone'),
      notificationsRow: this.profileContentEl.querySelector('.profile-row-notifications'),
      notificationsCheckbox: this.profileContentEl.querySelector('#profile-notifications'),
      notificationsStatus: this.profileContentEl.querySelector('.profile-row-notifications > p')
    };

    this.scroll = new Scrollable(this.container, 'SR', 400);
    
    this.profileElements.notificationsCheckbox.addEventListener('change', () => {
      //let checked = this.profileElements.notificationsCheckbox.checked;
      appMessagesManager.mutePeer(this.peerId);
    });

    rootScope.on('dialog_notify_settings', (e) => {
      if(this.peerId == e.detail) {
        const muted = appMessagesManager.isPeerMuted(this.peerId);
        this.profileElements.notificationsCheckbox.checked = !muted;
        this.profileElements.notificationsStatus.innerText = muted ? 'Disabled' : 'Enabled';
      }
    });

    rootScope.on('peer_typings', (e) => {
      const {peerId} = e.detail;

      if(this.peerId == peerId) {
        this.setPeerStatus();
      }
    });

    rootScope.on('user_update', (e) => {
      const userId = e.detail;

      if(this.peerId == userId) {
        this.setPeerStatus();
      }
    });

    this.setPeerStatusInterval = window.setInterval(this.setPeerStatus, 60e3);

    /* this.closeBtn.addEventListener('click', () => {
      this.toggleSidebar(false);
    }); */

    this.searchSuper = new AppSearchSuper([{
      inputFilter: 'inputMessagesFilterPhotoVideo',
      name: 'Media'
    }, {
      inputFilter: 'inputMessagesFilterDocument',
      name: 'Docs'
    }, {
      inputFilter: 'inputMessagesFilterUrl',
      name: 'Links'
    }, {
      inputFilter: 'inputMessagesFilterMusic',
      name: 'Audio'
    }], this.scroll);

    this.profileContentEl.append(this.searchSuper.container);
  }

  public setPeerStatus = (needClear = false) => {
    if(!this.peerId) return;

    const peerId = this.peerId;
    if(needClear) {
      this.profileElements.subtitle.innerHTML = '';
    }

    appImManager.getPeerStatus(this.peerId).then((subtitle) => {
      if(peerId != this.peerId) {
        return;
      }

      this.profileElements.subtitle.innerHTML = subtitle;
    });
  };

  public renderNewMessages(peerId: number, mids: number[]) {
    if(this.init) return; // * not inited yet

    if(!this.historiesStorage[peerId]) return;
    
    mids = mids.slice().reverse(); // ! because it will be ascend sorted array
    for(const type of this.searchSuper.types) {
      const inputFilter = type.inputFilter;
      const filtered = this.searchSuper.filterMessagesByType(mids, inputFilter);
      if(filtered.length) {
        if(this.historiesStorage[peerId][inputFilter]) {
          this.historiesStorage[peerId][inputFilter].unshift(...mids);
        }

        if(this.peerId == peerId && this.searchSuper.usedFromHistory[inputFilter] !== -1) {
          this.searchSuper.usedFromHistory[inputFilter] += filtered.length;
          this.searchSuper.performSearchResult(filtered, inputFilter, false);
        }

        break;
      }
    }
  }

  public deleteDeletedMessages(peerId: number, mids: number[]) {
    if(this.init) return; // * not inited yet

    if(!this.historiesStorage[peerId]) return;

    for(const mid of mids) {
      for(const type of this.searchSuper.types) {
        const inputFilter = type.inputFilter;

        if(!this.historiesStorage[peerId][inputFilter]) continue;

        const history = this.historiesStorage[peerId][inputFilter];
        const idx = history.findIndex(m => m == mid);
        if(idx !== -1) {
          history.splice(idx, 1);

          if(this.peerId == peerId) {
            const container = this.searchSuper.tabs[inputFilter];
            const div = container.querySelector(`div[data-mid="${mid}"]`);
            if(div) {
              if(inputFilter == 'inputMessagesFilterPhotoVideo') {
                delete this.searchSuper.mediaDivsByIds[mid];
              }
  
              div.remove();
            }
  
            if(this.searchSuper.usedFromHistory[inputFilter] >= (idx + 1)) {
              this.searchSuper.usedFromHistory[inputFilter]--;
            }
          }

          break;
        }
      }
    }

    this.scroll.onScroll();
  }

  public cleanupHTML() {
    this.profileElements.bio.style.display = 'none';
    this.profileElements.phone.style.display = 'none';
    this.profileElements.username.style.display = 'none';
    this.profileElements.notificationsRow.style.display = '';
    this.profileElements.notificationsCheckbox.checked = true;
    this.profileElements.notificationsStatus.innerText = 'Enabled';

    this.searchSuper.cleanupHTML();
  }

  public setLoadMutex(promise: Promise<any>) {
    this.searchSuper.loadMutex = promise;
  }

  public setPeer(peerId: number, threadId = 0) {
    if(this.peerId === peerId && this.threadId === peerId) return;

    if(this.init) {
      this.init();
      this.init = null;
    }

    this.peerId = peerId;
    this.threadId = threadId;
    this.searchSuper.setQuery(peerId, '', threadId, this.historiesStorage[peerId] ?? (this.historiesStorage[peerId] = {}));
    this.cleaned = true;
  }

  public loadSidebarMedia(single: boolean) {
    this.searchSuper.load(single);
  }

  public fillProfileElements() {
    if(!this.cleaned) return;
    this.cleaned = false;
    
    const peerId = this.peerId;
    const threadId = this.threadId;

    this.cleanupHTML();

    this.profileElements.avatar.setAttribute('peer', '' + peerId);

    // username
    if(peerId != rootScope.myId) {
      let username = appPeersManager.getPeerUsername(peerId);
      if(username) {
        setText(appPeersManager.getPeerUsername(peerId), this.profileElements.username);
      }
      
      const muted = appMessagesManager.isPeerMuted(peerId);
      this.profileElements.notificationsCheckbox.checked = !muted;
      this.profileElements.notificationsStatus.innerText = muted ? 'Disabled' : 'Enabled';
    } else {
      window.requestAnimationFrame(() => {
        this.profileElements.notificationsRow.style.display = 'none';
      });
    }
    
    //let membersLi = this.profileTabs.firstElementChild.children[0] as HTMLLIElement;
    if(peerId > 0) {
      //membersLi.style.display = 'none';

      let user = appUsersManager.getUser(peerId);
      if(user.phone && peerId != rootScope.myId) {
        setText(user.rPhone, this.profileElements.phone);
      }
      
      appProfileManager.getProfile(peerId).then(userFull => {
        if(this.peerId !== peerId || this.threadId !== threadId) {
          this.log.warn('peer changed');
          return;
        }
        
        if(userFull.rAbout && peerId != rootScope.myId) {
          setText(userFull.rAbout, this.profileElements.bio);
        }
        
        //this.log('userFull', userFull);
      });
    } else {
      //membersLi.style.display = appPeersManager.isBroadcast(peerId) ? 'none' : '';
      let chat = appPeersManager.getPeer(peerId);
      
      appProfileManager.getChatFull(chat.id).then((chatFull) => {
        if(this.peerId !== peerId || this.threadId !== threadId) {
          this.log.warn('peer changed');
          return;
        }
        
        //this.log('chatInfo res 2:', chatFull);
        
        if(chatFull.about) {
          setText(RichTextProcessor.wrapRichText(chatFull.about), this.profileElements.bio);
        }
      });
    }

    let title: string;
    if(peerId == rootScope.myId) title = 'Saved Messages';
    else title = appPeersManager.getPeerTitle(peerId);
    this.profileElements.name.innerHTML = title;

    this.setPeerStatus(true);
  }

  /* onOpen() {
    this.scroll.onScroll();
  } */

  onOpenAfterTimeout() {
    this.scroll.onScroll();
  }
}