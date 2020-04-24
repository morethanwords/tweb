import appDialogsManager from "../lib/appManagers/appDialogsManager";
import Scrollable from "./scrollable";
import appMessagesIDsManager from "../lib/appManagers/appMessagesIDsManager";
import appUsersManager from "../lib/appManagers/appUsersManager";
import appPeersManager from '../lib/appManagers/appPeersManager';
import appMessagesManager from "../lib/appManagers/appMessagesManager";
import { numberWithCommas, escapeRegExp } from "../lib/utils";
import { formatPhoneNumber } from "./misc";

export class SearchGroup {
  container: HTMLDivElement;
  nameEl: HTMLDivElement;
  list: HTMLUListElement;

  constructor(public name: string, public type: string) {
    this.list = document.createElement('ul');
    this.container = document.createElement('div');
    this.nameEl = document.createElement('div');
    this.nameEl.classList.add('search-group__name');
    this.nameEl.innerText = name;

    this.container.classList.add('search-group');
    this.container.append(this.nameEl, this.list);
    this.container.style.display = 'none';

    appDialogsManager.setListClickListener(this.list);
  }

  clear() {
    this.container.style.display = 'none';
    this.list.innerHTML = '';
  }

  setActive() {
    this.container.style.display = '';
  }
}

export default class AppSearch {
  private minMsgID = 0;
  private loadedCount = 0;
  private foundCount = 0;
  private offsetRate = 0;

  private searchPromise: Promise<void> = null;
  private searchTimeout: number = 0;

  private query = '';

  private listsContainer: HTMLDivElement = null;

  private peerID = 0; // 0 - means global

  private scrollable: Scrollable;

  constructor(public container: HTMLDivElement, public searchInput: HTMLInputElement, public searchGroups: {[group: string]: SearchGroup}) {
    this.scrollable = new Scrollable(this.container);
    this.listsContainer = this.scrollable.container;
    for(let i in this.searchGroups) {
      this.listsContainer.append(this.searchGroups[i].container);
    }

    this.searchInput.addEventListener('input', (e) => {
      let value = this.searchInput.value;
      if(!value.trim()) {
        //this.peerID = 0;
        return;
      }
      
      this.query = value;
      this.reset(false);
      this.searchMore();
    });

    this.scrollable.onScrolledBottom = () => {
      if(!this.query.trim()) return;
    
      if(!this.searchTimeout) {
        this.searchTimeout = setTimeout(() => {
          this.searchMore();
          this.searchTimeout = 0;
        }, 0);
      }
    };
  }

  public reset(all = true) {
    if(all) {
      this.searchInput.value = '';
      this.query = '';
      this.peerID = 0;
    }

    this.minMsgID = 0;
    this.loadedCount = 0;
    this.foundCount = 0;
    this.offsetRate = 0;

    for(let i in this.searchGroups) {
      this.searchGroups[i].clear();
    }
    
    this.searchPromise = null;
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

    if(!this.peerID && !maxID) {
      appUsersManager.searchContacts(query, 20).then((contacts: any) => {
        if(this.searchInput.value != query) {
          return;
        }

        ///////this.log('input search contacts result:', contacts);

        let setResults = (results: any, group: SearchGroup, showMembersCount = false) => {
          results.forEach((inputPeer: any) => {
            let peerID = appPeersManager.getPeerID(inputPeer);
            let peer = appPeersManager.getPeer(peerID);
            let originalDialog = appMessagesManager.getDialogByPeerID(peerID)[0];

            //////////this.log('contacts peer', peer);
          
            if(!originalDialog) {
              /////////this.log('no original dialog by peerID:', peerID);
              
              originalDialog = {
                peerID: peerID,
                pFlags: {},
                peer: peer
              };
            }
            
            let {dialog, dom} = appDialogsManager.addDialog(originalDialog, group.list, false);

            if(showMembersCount && (peer.participants_count || peer.participants)) {
              let regExp = new RegExp(`(${escapeRegExp(query)})`, 'gi');
              dom.titleSpan.innerHTML = dom.titleSpan.innerHTML.replace(regExp, '<i>$1</i>');

              let isChannel = appPeersManager.isChannel(peerID) && !appPeersManager.isMegagroup(peerID);
              let participants_count = peer.participants_count || peer.participants.participants.length;
              let subtitle = numberWithCommas(participants_count) + ' ' + (isChannel ? 'subscribers' : 'members');
              dom.lastMessageSpan.innerText = subtitle;
            } else {
              let username = appPeersManager.getPeerUsername(peerID);
              if(!username) {
                let user = appUsersManager.getUser(peerID);
                if(user && user.phone) {
                  username = '+' + formatPhoneNumber(user.phone).formatted;
                }
              } else {
                username = '@' + username;
              }

              dom.lastMessageSpan.innerHTML = '<i>' + username + '</i>';
            }
          });

          if(results.length) {
            group.setActive();
          }
        };

        setResults(contacts.my_results, this.searchGroups.contacts, true);
        setResults(contacts.results, this.searchGroups.globalContacts);
      });
    }
    
    return this.searchPromise = appMessagesManager.getSearch(this.peerID, query, null, maxID, 20, this.offsetRate).then(res => {
      this.searchPromise = null;
      
      if(this.searchInput.value != query) {
        return;
      }
      
      /////////this.log('input search result:', this.peerID, query, null, maxID, 20, res);
      
      let {count, history, next_rate} = res;
      
      if(history[0] == this.minMsgID) {
        history.shift();
      }
      
      let searchGroup = this.searchGroups['messages'];
      searchGroup.setActive();

      history.forEach((msgID: number) => {
        let message = appMessagesManager.getMessage(msgID);
        let originalDialog = appMessagesManager.getDialogByPeerID(message.peerID)[0];
        
        if(!originalDialog) {
          ////////this.log('no original dialog by message:', message);
          
          originalDialog = {
            peerID: message.peerID,
            pFlags: {},
            peer: message.to_id
          };
        }
        
        let {dialog, dom} = appDialogsManager.addDialog(originalDialog, searchGroup.list, false);
        appDialogsManager.setLastMessage(dialog, message, dom, query);
      });
      
      this.minMsgID = history[history.length - 1];
      this.offsetRate = next_rate;
      this.loadedCount += history.length;
      
      if(!this.foundCount) {
        this.foundCount = count;
      }
    }).catch(err => {
      console.error('search error', err);
      this.searchPromise = null;
    });
  }
}
