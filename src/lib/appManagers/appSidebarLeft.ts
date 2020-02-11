import { logger } from "../polyfill";
import { putPreloader } from "../../components/misc";
import Scrollable from '../../components/scrollable';
import appMessagesManager from "./appMessagesManager";
import appDialogsManager from "./appDialogsManager";
import { isElementInViewport } from "../utils";
import appMessagesIDsManager from "./appMessagesIDsManager";
import appImManager from "./appImManager";

class AppSidebarLeft {
  private sidebarEl = document.querySelector('.page-chats .chats-container') as HTMLDivElement;
  private searchInput = document.getElementById('global-search') as HTMLInputElement;
  private toolsBtn = this.sidebarEl.querySelector('.sidebar-tools-button') as HTMLButtonElement;
  private searchContainer = this.sidebarEl.querySelector('#search-container') as HTMLDivElement;
  
  private menuEl = this.toolsBtn.querySelector('.btn-menu');
  private savedBtn = this.menuEl.querySelector('.menu-saved');
  
  private listsContainer: HTMLDivElement = null;
  private searchMessagesList: HTMLUListElement = null;
  
  private chatsContainer = document.getElementById('chats-container') as HTMLDivElement;
  private chatsOffsetIndex = 0;
  private chatsPreloader: HTMLDivElement;
  private chatsLoadCount = 0;
  private loadDialogsPromise: Promise<any>;
  
  private log = logger('SL');
  
  private peerID = 0;
  private minMsgID = 0;
  private loadedCount = 0;
  private foundCount = 0;
  private offsetRate = 0;
  
  private searchPromise: Promise<void> = null;
  private searchTimeout: number = 0;
  
  private query = '';

  public scroll: Scrollable = null;
  
  constructor() {
    this.chatsPreloader = document.createElement('div');
    this.chatsPreloader.classList.add('preloader');
    putPreloader(this.chatsPreloader);
    this.chatsContainer.append(this.chatsPreloader);
    
    this.chatsLoadCount = Math.round(document.body.scrollHeight / 70 * 1.5);
    
    this.scroll = new Scrollable(this.chatsContainer as HTMLDivElement);
    this.scroll.setVirtualContainer(appDialogsManager.chatList);
    appDialogsManager.chatsHidden = this.scroll.hiddenElements;
    
    this.scroll.container.addEventListener('scroll', this.onChatsScroll.bind(this));
    
    this.listsContainer = new Scrollable(this.searchContainer).container;
    this.searchMessagesList = document.createElement('ul');
    
    this.savedBtn.addEventListener('click', (e) => {
      this.log('savedbtn click');
      setTimeout(() => { // menu doesn't close if no timeout (lol)
        appImManager.setPeer(appImManager.myID);
      }, 0);
    });
    
    /* this.listsContainer.insertBefore(this.searchMessagesList, this.listsContainer.lastElementChild);
    for(let i = 0; i < 25; ++i) {
      let li = document.createElement('li');
      li.innerHTML = `<div class="user-avatar is-online" style="font-size: 0px;"><img src="assets/img/camomile.jpg"></div><div class="user-caption"><p><span class="user-title">Влад</span><span><span class="message-status"></span><span class="message-time">14:41</span></span></p><p><span class="user-last-message">это важно</span><span class="tgico-pinnedchat"></span></p></div><div class="c-ripple"><span class="c-ripple__circle" style="top: 65px; left: 338.5px;"></span></div>`;
      this.searchMessagesList.append(li);
    } */
    
    this.listsContainer.addEventListener('scroll', this.onSidebarScroll.bind(this));
    
    //this.searchContainer.append(this.listsContainer);
    
    appDialogsManager.setListClickListener(this.searchMessagesList);
    
    let clickTimeout = 0;
    this.searchInput.addEventListener('focus', (e) => {
      this.toolsBtn.classList.remove('tgico-menu', 'btn-menu-toggle');
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
          

          setTimeout(() => {
            //this.toolsBtn.click();
            this.toolsBtn.classList.add('btn-menu-toggle');
          }, 200);
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
        this.listsContainer.removeChild(this.searchMessagesList);
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
    
    this.toolsBtn.addEventListener('click', (e) => {
      this.log('click', this.toolsBtn.classList.contains('tgico-back'));
      if(this.toolsBtn.classList.contains('tgico-back')) {
        this.searchInput.value = '';
        this.toolsBtn.classList.add('tgico-menu', 'btn-menu-toggle');
        this.toolsBtn.classList.remove('tgico-back');
        this.searchContainer.classList.remove('active');
        this.peerID = 0;
        e.stopPropagation();
        e.cancelBubble = true;
        e.preventDefault();
        return false;
      }

      return true;
    }, true);
    
    window.addEventListener('resize', () => {
      this.chatsLoadCount = Math.round(document.body.scrollHeight / 70 * 1.5);
      
      setTimeout(() => {
        this.onSidebarScroll();
        this.onChatsScroll();
      }, 0);
    });
  }
  
  public async loadDialogs() {
    if(this.loadDialogsPromise/*  || 1 == 1 */) return this.loadDialogsPromise;
    
    this.chatsContainer.append(this.chatsPreloader);
    
    //let offset = appMessagesManager.generateDialogIndex();/* appMessagesManager.dialogsNum */;
    
    try {
      this.loadDialogsPromise = appMessagesManager.getConversations('', this.chatsOffsetIndex, this.chatsLoadCount);
      
      let result = await this.loadDialogsPromise;
      
      if(result && result.dialogs && result.dialogs.length) {
        this.chatsOffsetIndex = result.dialogs[result.dialogs.length - 1].index;
        result.dialogs.forEach((dialog: any) => {
          appDialogsManager.addDialog(dialog);
        });
      }

      this.log('loaded ' + this.chatsLoadCount + ' dialogs by offset:', this.chatsOffsetIndex, result, this.scroll.hiddenElements);
      this.scroll.onScroll();
    } catch(err) {
      this.log.error(err);
    }
    
    this.chatsPreloader.remove();
    this.loadDialogsPromise = undefined;
  }
  
  public onChatsScroll() {
    //this.log(this.scroll);
    if(this.scroll.hiddenElements.down.length > 0/*  || 1 == 1 */) return;
    
    if(!this.loadDialogsPromise) {
      let d = Array.from(appDialogsManager.chatList.childNodes).slice(-5);
      for(let node of d) {
        if(isElementInViewport(node)) {
          this.loadDialogs();
          break;
        }
      }
      
      //console.log('last 5 dialogs:', d);
    }
  }
  
  public onSidebarScroll() {
    if(!this.query.trim()) return;
    
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
    
    if(!query.trim()) return;
    
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
