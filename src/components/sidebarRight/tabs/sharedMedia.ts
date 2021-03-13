import appImManager from "../../../lib/appManagers/appImManager";
import appMessagesManager from "../../../lib/appManagers/appMessagesManager";
import appPeersManager from "../../../lib/appManagers/appPeersManager";
import appProfileManager from "../../../lib/appManagers/appProfileManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import { logger } from "../../../lib/logger";
import { RichTextProcessor } from "../../../lib/richtextprocessor";
import rootScope from "../../../lib/rootScope";
import AppSearchSuper, { SearchSuperType } from "../../appSearchSuper.";
import AvatarElement from "../../avatar";
import Scrollable from "../../scrollable";
import { SliderTab } from "../../slider";
import CheckboxField from "../../checkboxField";
import { attachClickEvent } from "../../../helpers/dom";
import appSidebarRight from "..";
import { TransitionSlider } from "../../transition";
import appNotificationsManager from "../../../lib/appManagers/appNotificationsManager";
import AppEditGroupTab from "./editGroup";
import PeerTitle from "../../peerTitle";

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
  public closeBtn: HTMLButtonElement;
  public editBtn: HTMLElement;

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
      [type in SearchSuperType]: {mid: number, peerId: number}[]
    }>
  } = {};

  public scroll: Scrollable = null;

  private log = logger('SM'/* , LogLevels.error */);
  setPeerStatusInterval: number;
  cleaned: boolean;
  searchSuper: AppSearchSuper;

  private setBioTimeout: number;

  public init() {
    this.container = document.getElementById('shared-media-container');
    this.closeBtn = this.container.querySelector('.sidebar-header .btn-icon');
    this.closeBtn.classList.add('sidebar-close-button');
    this.editBtn = this.container.querySelector('.sidebar-header .tgico-edit');

    this.profileContentEl = this.container.querySelector('.profile-content');
    this.profileElements = {
      avatar: this.profileContentEl.querySelector('.profile-avatar'),
      name: this.profileContentEl.querySelector('.profile-name'),
      subtitle: this.profileContentEl.querySelector('.profile-subtitle'),
      bio: this.profileContentEl.querySelector('.profile-row-bio'),
      username: this.profileContentEl.querySelector('.profile-row-username'),
      phone: this.profileContentEl.querySelector('.profile-row-phone'),
      notificationsRow: this.profileContentEl.querySelector('.profile-row-notifications'),
      notificationsCheckbox: null,
      notificationsStatus: this.profileContentEl.querySelector('.profile-row-notifications > p')
    };

    const checkboxField = new CheckboxField({
      text: 'Notifications', 
      name: 'notifications'
    });
    this.profileElements.notificationsCheckbox = checkboxField.input;
    this.profileElements.notificationsCheckbox.checked = true;
    this.profileElements.notificationsRow.prepend(checkboxField.label);

    this.scroll = new Scrollable(this.container, 'SR', 400);

    const HEADER_HEIGHT = 56;
    const closeIcon = this.closeBtn.firstElementChild as HTMLElement;
    this.scroll.onAdditionalScroll = () => {
      const rect = this.searchSuper.nav.getBoundingClientRect(); 
      if(!rect.width) return;

      const top = rect.top;
      const isSharedMedia = top <= HEADER_HEIGHT;
      closeIcon.classList.toggle('state-back', isSharedMedia);
      transition(+isSharedMedia);

      if(!isSharedMedia) {
        this.searchSuper.goingHard = {};
      }
    };

    const transition = TransitionSlider(this.closeBtn.nextElementSibling as HTMLElement, 'slide-fade', 400, null, false);

    transition(0);

    attachClickEvent(this.closeBtn, (e) => {
      if(this.closeBtn.firstElementChild.classList.contains('state-back')) {
        this.scroll.scrollIntoViewNew(this.scroll.container.firstElementChild as HTMLElement, 'start');
        transition(0);
        closeIcon.classList.remove('state-back');
      } else if(!this.scroll.isHeavyAnimationInProgress) {
        appSidebarRight.onCloseBtnClick();
      }
    });

    attachClickEvent(this.editBtn, (e) => {
      let tab: AppEditGroupTab;
      if(appPeersManager.isAnyGroup(this.peerId)) {
        tab = new AppEditGroupTab(appSidebarRight);
      } else if(this.peerId > 0) {

      } else {

      }

      if(tab) {
        tab.peerId = this.peerId;
        tab.open();
      }
    });

    this.container.prepend(this.closeBtn.parentElement);

    this.profileElements.notificationsCheckbox.addEventListener('change', () => {
      //let checked = this.profileElements.notificationsCheckbox.checked;
      appMessagesManager.mutePeer(this.peerId);
    });

    rootScope.on('dialog_notify_settings', (dialog) => {
      if(this.peerId === dialog.peerId) {
        const muted = appNotificationsManager.isPeerLocalMuted(this.peerId, false);
        this.profileElements.notificationsCheckbox.checked = !muted;
        this.profileElements.notificationsStatus.innerText = muted ? 'Disabled' : 'Enabled';
      }
    });

    rootScope.on('peer_typings', (e) => {
      const {peerId} = e;

      if(this.peerId === peerId) {
        this.setPeerStatus();
      }
    });

    rootScope.on('peer_bio_edit', (peerId) => {
      if(peerId === this.peerId) {
        this.setBio(true);
      }
    });

    rootScope.on('user_update', (e) => {
      const userId = e;

      if(this.peerId === userId) {
        this.setPeerStatus();
      }
    });

    this.setPeerStatusInterval = window.setInterval(this.setPeerStatus, 60e3);

    this.searchSuper = new AppSearchSuper([{
      inputFilter: 'inputMessagesFilterPhotoVideo',
      name: 'Media'
    }, {
      inputFilter: 'inputMessagesFilterDocument',
      name: 'Files'
    }, {
      inputFilter: 'inputMessagesFilterUrl',
      name: 'Links'
    }, {
      inputFilter: 'inputMessagesFilterMusic',
      name: 'Music'
    }], this.scroll/* , undefined, undefined, false */);

    this.profileContentEl.append(this.searchSuper.container);
  }

  public setPeerStatus = (needClear = false) => {
    if(!this.peerId) return;

    const peerId = this.peerId;
    if(needClear) {
      this.profileElements.subtitle.innerHTML = '';
    }

    appImManager.getPeerStatus(this.peerId).then((subtitle) => {
      if(peerId !== this.peerId) {
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
      const filtered = this.searchSuper.filterMessagesByType(mids.map(mid => appMessagesManager.getMessageByPeer(peerId, mid)), inputFilter);
      if(filtered.length) {
        if(this.historiesStorage[peerId][inputFilter]) {
          this.historiesStorage[peerId][inputFilter].unshift(...filtered.map(message => ({mid: message.mid, peerId: message.peerId})));
        }

        if(this.peerId === peerId && this.searchSuper.usedFromHistory[inputFilter] !== -1) {
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
        const idx = history.findIndex(m => m.mid === mid);
        if(idx !== -1) {
          history.splice(idx, 1);

          if(this.peerId === peerId) {
            const container = this.searchSuper.tabs[inputFilter];
            const div = container.querySelector(`div[data-mid="${mid}"][data-peer-id="${peerId}"]`);
            if(div) {
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
    this.editBtn.style.display = 'none';
    if(this.setBioTimeout) {
      window.clearTimeout(this.setBioTimeout);
      this.setBioTimeout = 0;
    }

    this.searchSuper.cleanupHTML();
    this.searchSuper.selectTab(0, false);
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
    this.searchSuper.setQuery({
      peerId, 
      //threadId, 
      historyStorage: this.historiesStorage[peerId] ?? (this.historiesStorage[peerId] = {})
    });
    this.cleaned = true;
  }

  public loadSidebarMedia(single: boolean) {
    this.searchSuper.load(single);
  }

  public fillProfileElements() {
    if(!this.cleaned) return;
    this.cleaned = false;
    
    const peerId = this.peerId;

    this.cleanupHTML();

    this.profileElements.avatar.setAttribute('peer', '' + peerId);

    // username
    if(peerId !== rootScope.myId) {
      let username = appPeersManager.getPeerUsername(peerId);
      if(username) {
        setText(appPeersManager.getPeerUsername(peerId), this.profileElements.username);
      }
      
      const muted = appNotificationsManager.isPeerLocalMuted(peerId, false);
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
      if(user.phone && peerId !== rootScope.myId) {
        setText(user.rPhone, this.profileElements.phone);
      }
    }/*  else {
      //membersLi.style.display = appPeersManager.isBroadcast(peerId) ? 'none' : '';
    } */

    this.setBio();

    this.profileElements.name.innerHTML = '';
    this.profileElements.name.append(new PeerTitle({
      peerId,
      dialog: true
    }).element);
    
    this.editBtn.style.display = '';

    this.setPeerStatus(true);
  }

  public setBio(override?: true) {
    if(this.setBioTimeout) {
      window.clearTimeout(this.setBioTimeout);
      this.setBioTimeout = 0;
    }

    const peerId = this.peerId;
    const threadId = this.threadId;

    if(!peerId) {
      return;
    }

    let promise: Promise<boolean>;
    if(peerId > 0) {
      promise = appProfileManager.getProfile(peerId, override).then(userFull => {
        if(this.peerId !== peerId || this.threadId !== threadId) {
          this.log.warn('peer changed');
          return false;
        }
        
        if(userFull.rAbout && peerId !== rootScope.myId) {
          setText(userFull.rAbout, this.profileElements.bio);
        }
        
        //this.log('userFull', userFull);
        return true;
      });
    } else {
      promise = appProfileManager.getChatFull(-peerId, override).then((chatFull) => {
        if(this.peerId !== peerId || this.threadId !== threadId) {
          this.log.warn('peer changed');
          return false;
        }
        
        //this.log('chatInfo res 2:', chatFull);
        
        if(chatFull.about) {
          setText(RichTextProcessor.wrapRichText(chatFull.about), this.profileElements.bio);
        }

        return true;
      });
    }

    promise.then((canSetNext) => {
      if(canSetNext) {
        this.setBioTimeout = window.setTimeout(() => this.setBio(true), 60e3);
      }
    });
  }

  onOpenAfterTimeout() {
    this.scroll.onScroll();
  }
}
