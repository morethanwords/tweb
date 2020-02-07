import { logger } from "../polyfill";
import { scrollable } from "../../components/misc";
import appMessagesManager from "./appMessagesManager";
import appDialogsManager from "./appDialogsManager";
import { isElementInViewport } from "../utils";
import appMessagesIDsManager from "./appMessagesIDsManager";

class AppSidebarLeft {
  private sidebarEl = document.querySelector('.page-chats .chats-container') as HTMLDivElement;
  private searchInput = document.getElementById('global-search') as HTMLInputElement;
  private toolsBtn = this.sidebarEl.querySelector('.sidebar-tools-button') as HTMLButtonElement;
  private searchContainer = this.sidebarEl.querySelector('#search-container') as HTMLDivElement;
  
  private listsContainer: HTMLDivElement = null;
  private searchMessagesList: HTMLUListElement = null;
  
  private log = logger('SL');
  
  private peerID = 0;
  private minMsgID = 0;
  private loadedCount = 0;
  private foundCount = 0;
  private offsetRate = 0;
  
  private searchPromise: Promise<void> = null;
  private searchTimeout: number = 0;

  private query = '';
  
  constructor() {
    this.listsContainer = scrollable(this.searchContainer);
    this.searchMessagesList = document.createElement('ul');
    
    this.listsContainer.onscroll = this.onSidebarScroll.bind(this);
    
    this.searchContainer.append(this.listsContainer);
    
    appDialogsManager.setListClickListener(this.searchMessagesList);
    
    this.searchInput.addEventListener('focus', (e) => {
      this.toolsBtn.classList.remove('tgico-menu');
      this.toolsBtn.classList.add('tgico-back');
      this.searchContainer.classList.add('active');
      
      if(!this.searchInput.value) {
        this.searchMessagesList.innerHTML = '';
      }
      
      this.searchInput.addEventListener('blur', (e) => {
        if(!this.searchInput.value) {
          this.toolsBtn.classList.add('tgico-menu');
          this.toolsBtn.classList.remove('tgico-back');
          this.searchContainer.classList.remove('active');
        }
        
        /* this.peerID = 0;
        this.loadedCount = 0;
        this.minMsgID = 0; */
      }, {once: true});
    });
    
    this.searchInput.addEventListener('input', (e) => {
      //console.log('messageInput input', this.innerText, serializeNodes(Array.from(messageInput.childNodes)));
      let value = this.searchInput.value;
      this.log('input', value);
      
      if(this.listsContainer.contains(this.searchMessagesList)) {
        this.listsContainer.removeChild(this.searchMessagesList)
      }
      
      if(!value.trim()) {
        return;
      }

      this.query = value;
      this.minMsgID = 0;
      this.loadedCount = 0;
      this.foundCount = 0;
      this.offsetRate = 0;
      this.searchMessagesList.innerHTML = '';
      this.searchPromise = null;
      this.searchMore().then(() => {
        this.listsContainer.append(this.searchMessagesList);
      });
    });
    
    this.toolsBtn.addEventListener('click', () => {
      if(this.toolsBtn.classList.contains('tgico-back')) {
        this.searchInput.value = '';
        this.toolsBtn.classList.add('tgico-menu');
        this.toolsBtn.classList.remove('tgico-back');
        this.searchContainer.classList.remove('active');
        this.peerID = 0;
      }
    });

    window.addEventListener('resize', () => {
      setTimeout(() => this.onSidebarScroll(), 0);
    });
  }
  
  public onSidebarScroll() {
    let elements = Array.from(this.searchMessagesList.childNodes).slice(-5);
    for(let li of elements) {
      if(isElementInViewport(li)) {
        this.log('Will load more search');

        if(!this.searchTimeout) {
          this.searchTimeout = setTimeout(() => {
            this.searchMore();
            this.searchTimeout = 0;
          }, 0);
        }
        
        break;
      }
    }
  }
  
  public beginSearch(peerID?: number) {
    if(peerID) {
      this.peerID = peerID;
    }
    
    this.searchInput.focus();
  }

  private searchMore() {
    if(this.searchPromise) return this.searchPromise;

    let query = this.query;

    if(this.loadedCount != 0 && this.loadedCount >= this.foundCount) {
      return Promise.resolve();
    }
    
    let maxID = appMessagesIDsManager.getMessageIDInfo(this.minMsgID)[0];

    return this.searchPromise = appMessagesManager.getSearch(this.peerID, query, null, maxID, 20, this.offsetRate).then(res => {
      this.searchPromise = null;

      if(this.searchInput.value != query) {
        return;
      }
      
      this.log('input search result:', this.peerID, query, null, maxID, 20, res);
      
      let {count, history, next_rate} = res;

      if(history[0] == this.minMsgID) {
        history.shift();
      }
      
      history.forEach((msgID: number) => {
        let message = appMessagesManager.getMessage(msgID);
        let originalDialog = appMessagesManager.getDialogByPeerID(message.peerID)[0];
        
        if(!originalDialog) {
          this.log('no original dialog by message:', message);

          originalDialog = {
            peerID: message.peerID,
            pFlags: {},
            peer: message.to_id
          };
        }
        
        let {dialog, dom} = appDialogsManager.addDialog(originalDialog, this.searchMessagesList, false);
        appDialogsManager.setLastMessage(dialog, message, dom);
      });

      this.minMsgID = history[history.length - 1];
      this.offsetRate = next_rate;
      this.loadedCount += history.length;

      if(!this.foundCount) {
        this.foundCount = count;
      }
    }).catch(err => {
      this.log.error('search error', err);
      this.searchPromise = null;
    });
  }
}

export default new AppSidebarLeft();
