import appSidebarRight from "../lib/appManagers/appSidebarRight";
import Scrollable from "./scrollable_new";
import appProfileManager from "../lib/appManagers/appProfileManager";
import { appPeersManager } from "../lib/services";
import appMessagesManager from "../lib/appManagers/appMessagesManager";
import appDialogsManager from "../lib/appManagers/appDialogsManager";
import appChatsManager from "../lib/appManagers/appChatsManager";
import appUsersManager from "../lib/appManagers/appUsersManager";
import { $rootScope, findUpTag, findUpClassName, cancelEvent } from "../lib/utils";
import { putPreloader } from "./misc";

class AppSelectPeers {
  public container = document.createElement('div');
  private chatList = document.createElement('ul');
  private chatsContainer = document.createElement('div');
  private scrollable: Scrollable;
  private selectedScrollable: Scrollable;
  
  private selectedContainer = document.createElement('div');
  private searchInput = document.createElement('input');
  
  private selected: {[peerID: number]: HTMLDivElement} = {};

  public freezed = false;
  
  constructor(private appendTo: HTMLDivElement, private onChange: (length: number) => void) {
    this.container.classList.add('selector');

    let topContainer = document.createElement('div');
    topContainer.classList.add('selector-search-container');

    this.selectedContainer.classList.add('selector-search');
    this.searchInput.placeholder = 'Select chat';
    this.searchInput.type = 'text';
    this.selectedContainer.append(this.searchInput);
    topContainer.append(this.selectedContainer);
    this.selectedScrollable = new Scrollable(topContainer);

    let delimiter = document.createElement('hr');

    this.chatsContainer.classList.add('chats-container');
    this.chatsContainer.append(this.chatList);
    this.scrollable = new Scrollable(this.chatsContainer);

    // в десктопе - сначала без группы, потом архивные, потом контакты без сообщений
    let offsetIndex = 0;
    appMessagesManager.getConversations(offsetIndex, 50, 0).then(value => {
      let dialogs = value.dialogs;
      let myID = $rootScope.myID;

      offsetIndex = dialogs[value.dialogs.length - 1].index || 0;

      if(dialogs[0].peerID != myID) {
        dialogs.findAndSplice(d => d.peerID == myID);
        dialogs.unshift({
          peerID: myID,
          pFlags: {}
        } as any);
      }

      dialogs.forEach(dialog => {
        let peerID = dialog.peerID;

        let {dom} = appDialogsManager.addDialog(dialog, this.chatList, false, false);
        dom.containerEl.insertAdjacentHTML('afterbegin', '<div class="checkbox"><label><input type="checkbox"><span></span></label></div>');

        let subtitle = '';
        if(peerID < 0) {
          subtitle = appChatsManager.getChatMembersString(-peerID);
        } else if(peerID == myID) {
          subtitle = 'chat with yourself';
        } else {
          subtitle = appUsersManager.getUserStatusString(peerID);
          if(subtitle == 'online') {
            subtitle = `<i>${subtitle}</i>`;
          }
        }

        dom.lastMessageSpan.innerHTML = subtitle;
      });
    });

    this.chatList.addEventListener('click', (e) => {
      let target = e.target as HTMLElement;
      cancelEvent(e);

      if(this.freezed) return;

      if(target.tagName != 'LI') {
        target = findUpTag(target, 'LI');
      }

      if(!target) return;

      let peerID = +target.getAttribute('data-peerID');
      target.classList.toggle('active');
      if(peerID in this.selected) {
        this.remove(peerID);
      } else {
        this.add(peerID);
      }

      let checkbox = target.querySelector('input') as HTMLInputElement;
      checkbox.checked = !checkbox.checked;
    });

    this.selectedContainer.addEventListener('click', (e) => {
      if(this.freezed) return;
      let target = e.target as HTMLElement;
      target = findUpClassName(target, 'selector-user');

      if(!target) return;

      let peerID = target.dataset.peerID;
      let li = this.chatList.querySelector('[data-peerid="' + peerID + '"]') as HTMLElement;
      li.click();
    });

    this.container.append(topContainer, delimiter, this.chatsContainer);
    appendTo.append(this.container);
  }

  private add(peerID: number) {
    let div = document.createElement('div');
    div.classList.add('selector-user', 'scale-in');
    div.dataset.peerID = '' + peerID;
    this.selected[peerID] = div;
    
    let title = appPeersManager.getPeerTitle(peerID, false, true);

    let avatarDiv = document.createElement('div');
    avatarDiv.classList.add('user-avatar', 'tgico');
    appProfileManager.putPhoto(avatarDiv, peerID);

    div.innerHTML = title;
    div.insertAdjacentElement('afterbegin', avatarDiv);

    this.selectedContainer.insertBefore(div, this.searchInput);
    this.selectedScrollable.scrollTop = this.selectedScrollable.scrollHeight;
    this.onChange(Object.keys(this.selected).length);
  }

  private remove(peerID: number) {
    let div = this.selected[peerID];
    div.classList.remove('scale-in');
    void div.offsetWidth;
    div.classList.add('scale-out');
    div.addEventListener('animationend', () => {
      delete this.selected[peerID];
      div.remove();
      this.onChange(Object.keys(this.selected).length);
    }, {once: true});
  }

  public getSelected() {
    return Object.keys(this.selected).map(p => +p);
  }
}

class AppForward {
  private container = document.getElementById('forward-container') as HTMLDivElement;
  private closeBtn = this.container.querySelector('.sidebar-close-button') as HTMLButtonElement;
  private sendBtn = this.container.querySelector('.btn-circle') as HTMLButtonElement;

  private selector: AppSelectPeers;
  private msgIDs: number[] = [];

  constructor() {
    this.closeBtn.addEventListener('click', () => {
      this.cleanup();
      this.container.classList.remove('active');
      appSidebarRight.onSidebarScroll();
    });

    this.sendBtn.addEventListener('click', () => {
      let peerIDs = this.selector.getSelected();
      
      if(this.msgIDs.length && peerIDs.length) {
        this.sendBtn.classList.remove('tgico-send');
        this.sendBtn.disabled = true;
        putPreloader(this.sendBtn);
        this.selector.freezed = true;

        let s = () => {
          let promises = peerIDs.splice(0, 3).map(peerID => {
            return appMessagesManager.forwardMessages(peerID, this.msgIDs);
          });
          
          Promise.all(promises).then(() => {
            if(peerIDs.length) {
              return s();
            } else {
              this.closeBtn.click();
            }
          });
        };
        
        s();
      }
    });
  }

  public cleanup() {
    if(this.selector) {
      this.selector.container.remove();
      this.selector = null;
    }
  }

  public init(ids: number[]) {
    this.cleanup();
    this.msgIDs = ids;

    appSidebarRight.toggleSidebar(true);
    this.container.classList.add('active');
    this.sendBtn.innerHTML = '';
    this.sendBtn.classList.add('tgico-send');
    this.sendBtn.disabled = false;

    this.selector = new AppSelectPeers(this.container, (length) => {
      if(length) {
        this.sendBtn.classList.add('is-visible');
      } else {
        this.sendBtn.classList.remove('is-visible');
      }
    });
  }
}

export default new AppForward();