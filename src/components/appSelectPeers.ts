import appChatsManager, { ChatRights } from "../lib/appManagers/appChatsManager";
import appDialogsManager from "../lib/appManagers/appDialogsManager";
import appMessagesManager, { Dialog } from "../lib/appManagers/appMessagesManager";
import appPeersManager from "../lib/appManagers/appPeersManager";
import appPhotosManager from "../lib/appManagers/appPhotosManager";
import appUsersManager from "../lib/appManagers/appUsersManager";
import $rootScope from "../lib/rootScope";
import { cancelEvent, findUpAttribute, findUpClassName } from "../lib/utils";
import Scrollable from "./scrollable";

type PeerType = 'contacts' | 'dialogs';

// TODO: правильная сортировка для addMembers, т.е. для peerType: 'contacts', потому что там идут сначала контакты - потом неконтакты, а должно всё сортироваться по имени

let loadedAllDialogs = false, loadAllDialogsPromise: Promise<any>;
export default class AppSelectPeers {
  public container = document.createElement('div');
  public list = document.createElement('ul');
  public chatsContainer = document.createElement('div');
  public scrollable: Scrollable;
  public selectedScrollable: Scrollable;
  
  public selectedContainer: HTMLElement;
  public input: HTMLInputElement;
  
  //public selected: {[peerID: number]: HTMLElement} = {};
  public selected = new Set<any>();

  public freezed = false;

  private folderID = 0;
  private offsetIndex = 0;
  private promise: Promise<any>;

  private query = '';
  private cachedContacts: number[];

  private loadedWhat: Partial<{[k in 'dialogs' | 'archived' | 'contacts']: true}> = {};
  
  constructor(private appendTo: HTMLElement, private onChange?: (length: number) => void, private peerType: PeerType[] = ['dialogs'], onFirstRender?: () => void, private renderResultsFunc?: (peerIDs: number[]) => void, private chatRightsAction?: ChatRights, private multiSelect = true) {
    this.container.classList.add('selector');

    if(!this.renderResultsFunc) {
      this.renderResultsFunc = this.renderResults;
    }

    this.input = document.createElement('input');
    this.input.classList.add('selector-search-input');
    this.input.placeholder = !peerType.includes('dialogs') ? 'Add People...' : 'Select chat';
    this.input.type = 'text';

    if(multiSelect) {
      let topContainer = document.createElement('div');
      topContainer.classList.add('selector-search-container');
  
      this.selectedContainer = document.createElement('div');
      this.selectedContainer.classList.add('selector-search');
      
      this.selectedContainer.append(this.input);
      topContainer.append(this.selectedContainer);
      this.selectedScrollable = new Scrollable(topContainer);
  
      let delimiter = document.createElement('hr');

      this.selectedContainer.addEventListener('click', (e) => {
        if(this.freezed) return;
        let target = e.target as HTMLElement;
        target = findUpClassName(target, 'selector-user');
  
        if(!target) return;
  
        const peerID = target.dataset.key;
        const li = this.chatsContainer.querySelector('[data-peerid="' + peerID + '"]') as HTMLElement;
        if(!li) {
          this.remove(+peerID || peerID);
        } else {
          li.click();
        }
      });

      this.container.append(topContainer, delimiter);
    }

    this.chatsContainer.classList.add('chats-container');
    this.chatsContainer.append(this.list);
    this.scrollable = new Scrollable(this.chatsContainer);
    this.scrollable.setVirtualContainer(this.list);

    this.chatsContainer.addEventListener('click', (e) => {
      const target = findUpAttribute(e.target, 'data-peerID') as HTMLElement;
      cancelEvent(e);

      if(!target) return;
      if(this.freezed) return;

      let key: any = target.getAttribute('data-peerID');
      key = +key || key;

      if(!this.multiSelect) {
        this.add(key);
        return;
      }

      target.classList.toggle('active');
      if(this.selected.has(key)) {
        this.remove(key);
      } else {
        this.add(key);
      }

      const checkbox = target.querySelector('input') as HTMLInputElement;
      checkbox.checked = !checkbox.checked;
    });

    this.input.addEventListener('input', () => {
      const value = this.input.value;
      if(this.query != value) {
        if(this.peerType.includes('contacts')) {
          delete this.loadedWhat.contacts;
          this.cachedContacts = null;
        }
        
        //if(this.peerType.includes('dialogs')) {
          delete this.loadedWhat.dialogs;
          delete this.loadedWhat.archived;
          this.folderID = 0;
          this.offsetIndex = 0;
        //}

        this.promise = null;
        this.list.innerHTML = '';
        this.query = value;
        
        //console.log('selectPeers input:', this.query);
        this.getMoreResults();
      }
    });

    this.scrollable.onScrolledBottom = () => {
      this.getMoreResults();
    };

    this.container.append(this.chatsContainer);
    appendTo.append(this.container);

    // WARNING TIMEOUT
    setTimeout(() => {
      let getResultsPromise = this.getMoreResults() as Promise<any>;
      if(onFirstRender) {
        getResultsPromise.then(() => {
          onFirstRender();
        });
      }
    }, 0);
  }

  private renderSaved() {
    if(!this.offsetIndex && this.folderID == 0 && 
      (!this.query 
        || 'saved messages'.includes(this.query.toLowerCase()) 
        || appUsersManager.getUser($rootScope.myID).sortName.includes(this.query.toLowerCase())) && 
      this.peerType.includes('dialogs')) {
      this.renderResultsFunc([$rootScope.myID]);
    }
  }

  private async getMoreDialogs(): Promise<any> {
    if(this.promise) return this.promise;

    if(this.loadedWhat.dialogs && this.loadedWhat.archived) {
      return;
    }
    
    // в десктопе - сначала без группы, потом архивные, потом контакты без сообщений
    const pageCount = appPhotosManager.windowH / 72 * 1.25 | 0;

    this.promise = appMessagesManager.getConversations(this.query, this.offsetIndex, pageCount, this.folderID);
    const value = await this.promise;
    this.promise = null;

    let dialogs = value.dialogs as Dialog[];
    if(dialogs.length) {
      const newOffsetIndex = dialogs[dialogs.length - 1].index || 0;

      dialogs = dialogs.slice();
      dialogs.findAndSplice(d => d.peerID == $rootScope.myID); // no my account

      if(this.chatRightsAction) {
        dialogs = dialogs.filter(d => {
          return (d.peerID > 0 && (this.chatRightsAction != 'send' || appUsersManager.canSendToUser(d.peerID))) || appChatsManager.hasRights(-d.peerID, this.chatRightsAction);
        });
      }

      this.renderSaved();

      this.offsetIndex = newOffsetIndex;

      this.renderResultsFunc(dialogs.map(dialog => dialog.peerID));
    } else {
      if(!this.loadedWhat.dialogs) {
        this.renderSaved();

        this.loadedWhat.dialogs = true;
        this.offsetIndex = 0;
        this.folderID = 1;

        return this.getMoreDialogs();
      } else {
        this.loadedWhat.archived = true;

        if(!this.loadedWhat.contacts && this.peerType.includes('contacts')) {
          return this.getMoreContacts();
        }
      }
    }
  }

  private async getMoreContacts() {
    if(this.promise) return this.promise;

    if(this.loadedWhat.contacts) {
      return;
    }

    if(!this.cachedContacts) {
      /* const promises: Promise<any>[] = [appUsersManager.getContacts(this.query)];
      if(!this.peerType.includes('dialogs')) {
        promises.push(appMessagesManager.getConversationsAll());
      }

      this.promise = Promise.all(promises);
      this.cachedContacts = (await this.promise)[0].slice(); */
      this.promise = appUsersManager.getContacts(this.query);
      this.cachedContacts = (await this.promise).slice();
      this.cachedContacts.findAndSplice(userID => userID == $rootScope.myID); // no my account
      this.promise = null;
    }

    if(this.cachedContacts.length) {
      const pageCount = appPhotosManager.windowH / 72 * 1.25 | 0;
      const arr = this.cachedContacts.splice(0, pageCount);
      this.renderResultsFunc(arr);
    }
    
    if(!this.cachedContacts.length) {
      this.loadedWhat.contacts = true;

      // need to load non-contacts
      if(!this.peerType.includes('dialogs')) {
        return this.getMoreDialogs();
      }
    }
  }

  checkForTriggers = () => {
    this.scrollable.checkForTriggers();
  };

  private getMoreResults() {
    const get = () => {
      const promises: Promise<any>[] = [];

      if(!loadedAllDialogs && !loadAllDialogsPromise) {
        loadAllDialogsPromise = appMessagesManager.getConversationsAll()
        .then(() => {
          loadedAllDialogs = true;
        }, () => {
          loadAllDialogsPromise = null;
        });

        promises.push(loadAllDialogsPromise);
      }
  
      if((this.peerType.includes('dialogs') || this.loadedWhat.contacts) && !this.loadedWhat.archived) { // to load non-contacts
        promises.push(this.getMoreDialogs());
  
        if(!this.loadedWhat.archived) {
          return promises;
        }
      }
      
      if(this.peerType.includes('contacts') && !this.loadedWhat.contacts) {
        promises.push(this.getMoreContacts());
      }
  
      return promises;
    };
    
    const promises = get();
    const promise = Promise.all(promises);
    if(promises.length) {
      promise.then(this.checkForTriggers);
    }
    return promise
  }

  private renderResults(peerIDs: number[]) {
    //console.log('will renderResults:', peerIDs);

    // оставим только неконтакты с диалогов
    if(!this.peerType.includes('dialogs') && this.loadedWhat.contacts) {
      peerIDs = peerIDs.filter(peerID => {
        return appUsersManager.isNonContactUser(peerID);
      });
    }

    peerIDs.forEach(peerID => {
      const {dom} = appDialogsManager.addDialog(peerID, this.scrollable, false, false);

      if(this.multiSelect) {
        const selected = this.selected.has(peerID);
        dom.containerEl.insertAdjacentHTML('afterbegin', `<div class="checkbox"><label><input type="checkbox" ${selected ? 'checked' : ''}><span></span></label></div>`);
        if(selected) dom.listEl.classList.add('active');
      }

      let subtitle = '';
      if(peerID < 0) {
        subtitle = appChatsManager.getChatMembersString(-peerID);
      } else if(peerID == $rootScope.myID) {
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

  public add(peerID: any, title?: string) {
    //console.trace('add');
    this.selected.add(peerID);

    if(!this.multiSelect) {
      this.onChange(this.selected.size);
      return;
    }

    const div = document.createElement('div');
    div.classList.add('selector-user', 'scale-in');

    const avatarEl = document.createElement('avatar-element');
    avatarEl.classList.add('selector-user-avatar', 'tgico');
    avatarEl.setAttribute('dialog', '1');

    div.dataset.key = '' + peerID;
    if(typeof(peerID) === 'number') {
      if(title === undefined) {
        title = peerID == $rootScope.myID ? 'Saved' : appPeersManager.getPeerTitle(peerID, false, true);
      }

      avatarEl.setAttribute('peer', '' + peerID);
    }

    if(title) {
      div.innerHTML = title;
    }

    div.insertAdjacentElement('afterbegin', avatarEl);

    this.selectedContainer.insertBefore(div, this.input);
    //this.selectedScrollable.scrollTop = this.selectedScrollable.scrollHeight;
    this.selectedScrollable.scrollTo(this.selectedScrollable.scrollHeight, 'top', true, true);
    this.onChange && this.onChange(this.selected.size);

    return div;
  }

  public remove(key: any) {
    if(!this.multiSelect) return;
    //const div = this.selected[peerID];
    const div = this.selectedContainer.querySelector(`[data-key="${key}"]`) as HTMLElement;
    div.classList.remove('scale-in');
    void div.offsetWidth;
    div.classList.add('scale-out');
    div.addEventListener('animationend', () => {
      this.selected.delete(key);
      div.remove();
      this.onChange && this.onChange(this.selected.size);
    }, {once: true});
  }

  public getSelected() {
    return [...this.selected];
  }
}