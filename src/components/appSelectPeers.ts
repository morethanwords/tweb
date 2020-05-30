import Scrollable from "./scrollable_new";
import appMessagesManager, { Dialog } from "../lib/appManagers/appMessagesManager";
import { $rootScope, cancelEvent, findUpTag, findUpClassName } from "../lib/utils";
import appDialogsManager from "../lib/appManagers/appDialogsManager";
import appChatsManager from "../lib/appManagers/appChatsManager";
import appUsersManager from "../lib/appManagers/appUsersManager";
import { appPeersManager } from "../lib/services";
import appPhotosManager from "../lib/appManagers/appPhotosManager";

export class AppSelectPeers {
  public container = document.createElement('div');
  private list = document.createElement('ul');
  private chatsContainer = document.createElement('div');
  private scrollable: Scrollable;
  private selectedScrollable: Scrollable;
  
  private selectedContainer = document.createElement('div');
  private input = document.createElement('input');
  
  private selected: {[peerID: number]: HTMLDivElement} = {};

  public freezed = false;

  private myID = $rootScope.myID;

  private offsetIndex = 0;
  private promise: Promise<any>;

  private query = '';
  private cachedContacts: number[];
  
  constructor(private appendTo: HTMLDivElement, private onChange?: (length: number) => void, private peerType: 'contacts' | 'dialogs' = 'dialogs', onFirstRender?: () => void) {
    this.container.classList.add('selector');

    let topContainer = document.createElement('div');
    topContainer.classList.add('selector-search-container');

    this.selectedContainer.classList.add('selector-search');
    this.input.placeholder = peerType == 'contacts' ? 'Add People...' : 'Select chat';
    this.input.type = 'text';
    this.selectedContainer.append(this.input);
    topContainer.append(this.selectedContainer);
    this.selectedScrollable = new Scrollable(topContainer);

    let delimiter = document.createElement('hr');

    this.chatsContainer.classList.add('chats-container');
    this.chatsContainer.append(this.list);
    this.scrollable = new Scrollable(this.chatsContainer);
    this.scrollable.setVirtualContainer(this.list);

    this.list.addEventListener('click', (e) => {
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
      let li = this.list.querySelector('[data-peerid="' + peerID + '"]') as HTMLElement;
      li.click();
    });

    this.input.addEventListener('input', () => {
      let value = this.input.value;
      if(this.query != value) {
        if(this.peerType == 'contacts') {
          this.cachedContacts = null;
        } else {
          this.offsetIndex = 0;
        }

        this.promise = null;
        this.list.innerHTML = '';
        this.query = value;
        
        console.log('selectPeers input:', this.query);
        this.getMoreResults();
      }
    });

    this.scrollable.onScrolledBottom = () => {
      this.getMoreResults();
    };

    this.container.append(topContainer, delimiter, this.chatsContainer);
    appendTo.append(this.container);

    let getResultsPromise = this.getMoreResults() as Promise<any>;
    if(onFirstRender) {
      getResultsPromise.then(() => {
        onFirstRender();
      });
    }
  }

  private async getMoreDialogs() {
    if(this.promise) return this.promise;
    
    // в десктопе - сначала без группы, потом архивные, потом контакты без сообщений
    const pageCount = appPhotosManager.windowH / 72 * 1.25 | 0;

    this.promise = appMessagesManager.getConversations(this.query, this.offsetIndex, pageCount, 0);
    const value = await this.promise;

    let dialogs = value.dialogs as Dialog[];
    if(!dialogs.length) {
      return;
    }
    
    const newOffsetIndex = dialogs[dialogs.length - 1].index || 0;

    dialogs = dialogs.filter(d => d.peerID != this.myID);
    if(!this.offsetIndex) {
      dialogs.unshift({
        peerID: this.myID,
        pFlags: {}
      } as any);
    }

    this.offsetIndex = newOffsetIndex;

    this.renderResults(dialogs.map(dialog => dialog.peerID));

    this.promise = null;
  }

  private async getMoreContacts() {
    if(this.promise) return this.promise;

    if(!this.cachedContacts) {
      this.promise = appUsersManager.getContacts(this.query);
      this.cachedContacts = (await this.promise).slice();
      this.cachedContacts.findAndSplice(userID => userID == this.myID); // no my account
      this.promise = null;
    }

    if(this.cachedContacts.length) {
      const pageCount = appPhotosManager.windowH / 72 * 1.25 | 0;
      const arr = this.cachedContacts.splice(0, pageCount);
      this.renderResults(arr);
    }
  }

  private getMoreResults() {
    if(this.peerType == 'dialogs') {
      return this.getMoreDialogs();
    } else {
      return this.getMoreContacts();
    }
  }

  private renderResults(peerIDs: number[]) {
    console.log('will renderResults:', peerIDs);
    peerIDs.forEach(peerID => {
      const {dom} = appDialogsManager.addDialog(peerID, this.scrollable, false, false);
      dom.containerEl.insertAdjacentHTML('afterbegin', '<div class="checkbox"><label><input type="checkbox"><span></span></label></div>');

      let subtitle = '';
      if(peerID < 0) {
        subtitle = appChatsManager.getChatMembersString(-peerID);
      } else if(peerID == this.myID) {
        subtitle = 'chat with yourself';
      } else {
        subtitle = appUsersManager.getUserStatusString(peerID);
        if(subtitle == 'online') {
          subtitle = `<i>${subtitle}</i>`;
        }
      }

      dom.lastMessageSpan.innerHTML = subtitle;
    });
  }

  private add(peerID: number) {
    const div = document.createElement('div');
    div.classList.add('selector-user', 'scale-in');
    div.dataset.peerID = '' + peerID;
    this.selected[peerID] = div;
    
    const title = appPeersManager.getPeerTitle(peerID, false, true);

    const avatarEl = document.createElement('avatar-element');
    avatarEl.classList.add('selector-user-avatar', 'tgico');
    avatarEl.setAttribute('dialog', '1');
    avatarEl.setAttribute('peer', '' + peerID);

    div.innerHTML = title;
    div.insertAdjacentElement('afterbegin', avatarEl);

    this.selectedContainer.insertBefore(div, this.input);
    this.selectedScrollable.scrollTop = this.selectedScrollable.scrollHeight;
    this.onChange && this.onChange(Object.keys(this.selected).length);
  }

  private remove(peerID: number) {
    const div = this.selected[peerID];
    div.classList.remove('scale-in');
    void div.offsetWidth;
    div.classList.add('scale-out');
    div.addEventListener('animationend', () => {
      delete this.selected[peerID];
      div.remove();
      this.onChange && this.onChange(Object.keys(this.selected).length);
    }, {once: true});
  }

  public getSelected() {
    return Object.keys(this.selected).map(p => +p);
  }
}