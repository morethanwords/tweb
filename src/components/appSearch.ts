import appDialogsManager from "../lib/appManagers/appDialogsManager";
import Scrollable from "./scrollable";
import appMessagesIDsManager from "../lib/appManagers/appMessagesIDsManager";
import appUsersManager from "../lib/appManagers/appUsersManager";
import appPeersManager from '../lib/appManagers/appPeersManager';
import appMessagesManager from "../lib/appManagers/appMessagesManager";
import { formatPhoneNumber } from "./misc";
import appChatsManager from "../lib/appManagers/appChatsManager";
import SearchInput from "./searchInput";
import { Peer } from "../layer";
import rootScope from "../lib/rootScope";
import { escapeRegExp } from "../helpers/string";
import searchIndexManager from "../lib/searchIndexManager";

export class SearchGroup {
  container: HTMLDivElement;
  nameEl: HTMLDivElement;
  list: HTMLUListElement;

  constructor(public name: string, public type: string, private clearable = true, className?: string, clickable = true) {
    this.list = document.createElement('ul');
    this.container = document.createElement('div');
    if(className) this.container.className = className;
    
    if(name) {
      this.nameEl = document.createElement('div');
      this.nameEl.classList.add('search-group__name');
      this.nameEl.innerText = name;
      this.container.append(this.nameEl);
    }
    
    this.container.classList.add('search-group', 'search-group-' + type);
    this.container.append(this.list);
    this.container.style.display = 'none';

    if(clickable) {
      appDialogsManager.setListClickListener(this.list);
    }
  }

  clear() {
    this.container.style.display = 'none';

    if(this.clearable) {
      this.list.innerHTML = '';
    }
  }

  setActive() {
    this.container.style.display = '';
  }

  toggle() {
    if(this.list.childElementCount) {
      this.setActive();
    } else {
      this.clear();
    }
  }
}

/**
 * * Saved будет использована только для вывода одного элемента - избранное
 */
type SearchGroupType = 'saved' | 'contacts' | 'globalContacts' | 'messages' | string;

export default class AppSearch {
  private minMsgID = 0;
  private loadedCount = -1;
  private foundCount = -1;
  private offsetRate = 0;
  private loadedContacts = false;

  private searchPromise: Promise<void> = null;
  private searchTimeout: number = 0;

  private query = '';

  public listsContainer: HTMLDivElement = null;

  private peerID = 0; // 0 - means global

  private scrollable: Scrollable;

  constructor(public container: HTMLElement, public searchInput: SearchInput, public searchGroups: {[group in SearchGroupType]: SearchGroup}, public onSearch?: (count: number) => void) {
    this.scrollable = new Scrollable(this.container);
    this.listsContainer = this.scrollable.container as HTMLDivElement;
    for(let i in this.searchGroups) {
      this.listsContainer.append(this.searchGroups[i as SearchGroupType].container);
    }

    if(this.searchGroups.messages) {
      this.scrollable.setVirtualContainer(this.searchGroups.messages.list);
    }

    this.searchInput.onChange = (value) => {
      /* if(!value.trim()) {
        //this.peerID = 0;
        return;
      } */
      
      this.query = value;
      this.reset(false);
      this.searchMore();
    };

    this.scrollable.onScrolledBottom = () => {
      if(!this.query.trim()) return;
    
      if(!this.searchTimeout) {
        this.searchTimeout = window.setTimeout(() => {
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
    this.loadedCount = -1;
    this.foundCount = -1;
    this.offsetRate = 0;
    this.loadedContacts = false;

    for(let i in this.searchGroups) {
      this.searchGroups[i as SearchGroupType].clear();
    }
    
    this.searchPromise = null;
  }

  public beginSearch(peerID?: number) {
    if(peerID) {
      this.peerID = peerID;
    }
    
    this.searchInput.input.focus();
  }

  public searchMore() {
    if(this.searchPromise) return this.searchPromise;
    
    const query = this.query;
    
    if(!query.trim()) {
      this.onSearch && this.onSearch(0);
      return;
    }
    
    if(this.foundCount != -1 && this.loadedCount >= this.foundCount) {
      return Promise.resolve();
    }
    
    const maxID = appMessagesIDsManager.getMessageIDInfo(this.minMsgID)[0] || 0;

    if(!this.peerID && !maxID && !this.loadedContacts) {
      const renderedPeerIDs: Set<number> = new Set();

      const setResults = (results: number[], group: SearchGroup, showMembersCount = false) => {
        results.forEach((peerID) => {
          if(renderedPeerIDs.has(peerID)) {
            return;
          }

          renderedPeerIDs.add(peerID);

          const peer = appPeersManager.getPeer(peerID);

          //////////this.log('contacts peer', peer);

          const {dom} = appDialogsManager.addDialog(peerID, group.list, false);

          if(showMembersCount && (peer.participants_count || peer.participants)) {
            const regExp = new RegExp(`(${escapeRegExp(query)}|${escapeRegExp(searchIndexManager.cleanSearchText(query))})`, 'gi');
            dom.titleSpan.innerHTML = dom.titleSpan.innerHTML.replace(regExp, '<i>$1</i>');
            dom.lastMessageSpan.innerText = appChatsManager.getChatMembersString(-peerID);
          } else if(peerID == rootScope.myID) {
            dom.lastMessageSpan.innerHTML = 'chat with yourself';
          } else {
            let username = appPeersManager.getPeerUsername(peerID);
            if(!username) {
              const user = appUsersManager.getUser(peerID);
              if(user && user.phone) {
                username = '+' + formatPhoneNumber(user.phone).formatted;
              }
            } else {
              username = '@' + username;
            }

            dom.lastMessageSpan.innerHTML = '<i>' + username + '</i>';
          }
        });

        group.toggle();
      };

      const onLoad = <T>(arg: T) => {
        if(this.searchInput.value != query) {
          return;
        }

        this.loadedContacts = true;

        return arg;
      };

      appUsersManager.getContacts(query, true)
      .then(onLoad)
      .then((contacts) => {
        if(contacts) {
          setResults(contacts, this.searchGroups.contacts, true);
        }
      });

      appUsersManager.searchContacts(query, 20)
      .then(onLoad)
      .then((contacts) => {
        if(contacts) {
          setResults(contacts.my_results, this.searchGroups.contacts, true);
          setResults(contacts.results, this.searchGroups.globalContacts);
        }
      });

      appMessagesManager.getConversations(query, 0, 20, 0)
      .then(onLoad)
      .then(value => {
        if(value) {
          setResults(value.dialogs.map(d => d.peerID), this.searchGroups.contacts, true);
        }
      });
    }
    
    return this.searchPromise = appMessagesManager.getSearch(this.peerID, query, null, maxID, 20, this.offsetRate).then(res => {
      this.searchPromise = null;
      
      if(this.searchInput.value != query) {
        return;
      }
      
      //console.log('input search result:', this.peerID, query, null, maxID, 20, res);
      
      const {count, history, next_rate} = res;
      
      if(history[0] == this.minMsgID) {
        history.shift();
      }
      
      const searchGroup = this.searchGroups.messages;

      history.forEach((msgID: number) => {
        const message = appMessagesManager.getMessage(msgID);

        const {dialog, dom} = appDialogsManager.addDialog(message.peerID, this.scrollable/* searchGroup.list */, false);
        appDialogsManager.setLastMessage(dialog, message, dom, query);
      });

      searchGroup.toggle();
      
      this.minMsgID = history[history.length - 1];
      this.offsetRate = next_rate;
      
      if(this.loadedCount == -1) {
        this.loadedCount = 0;
      }
      this.loadedCount += history.length;
      
      if(this.foundCount == -1) {
        this.foundCount = count;
        this.onSearch && this.onSearch(this.foundCount);
      }
    }).catch(err => {
      console.error('search error', err);
      this.searchPromise = null;
    });
  }
}
