import appDialogsManager from "../lib/appManagers/appDialogsManager";
import Scrollable from "./scrollable";
import appMessagesIdsManager from "../lib/appManagers/appMessagesIdsManager";
import appUsersManager from "../lib/appManagers/appUsersManager";
import appPeersManager from '../lib/appManagers/appPeersManager';
import appMessagesManager from "../lib/appManagers/appMessagesManager";
import { formatPhoneNumber } from "./misc";
import appChatsManager from "../lib/appManagers/appChatsManager";
import SearchInput from "./searchInput";
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
  private minMsgId = 0;
  private loadedCount = -1;
  private foundCount = -1;
  private offsetRate = 0;
  private loadedContacts = false;

  private searchPromise: Promise<void> = null;
  private searchTimeout: number = 0;

  private query = '';

  public listsContainer: HTMLDivElement = null;

  private peerId = 0; // 0 - means global

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
        //this.peerId = 0;
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
      this.peerId = 0;
    }

    this.minMsgId = 0;
    this.loadedCount = -1;
    this.foundCount = -1;
    this.offsetRate = 0;
    this.loadedContacts = false;

    for(let i in this.searchGroups) {
      this.searchGroups[i as SearchGroupType].clear();
    }
    
    this.searchPromise = null;
  }

  public beginSearch(peerId?: number) {
    if(peerId) {
      this.peerId = peerId;
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
    
    const maxId = appMessagesIdsManager.getMessageIdInfo(this.minMsgId)[0] || 0;

    if(!this.peerId && !maxId && !this.loadedContacts) {
      const renderedPeerIds: Set<number> = new Set();

      const setResults = (results: number[], group: SearchGroup, showMembersCount = false) => {
        results.forEach((peerId) => {
          if(renderedPeerIds.has(peerId)) {
            return;
          }

          renderedPeerIds.add(peerId);

          const peer = appPeersManager.getPeer(peerId);

          //////////this.log('contacts peer', peer);

          const {dom} = appDialogsManager.addDialog(peerId, group.list, false);

          if(showMembersCount && (peer.participants_count || peer.participants)) {
            const regExp = new RegExp(`(${escapeRegExp(query)}|${escapeRegExp(searchIndexManager.cleanSearchText(query))})`, 'gi');
            dom.titleSpan.innerHTML = dom.titleSpan.innerHTML.replace(regExp, '<i>$1</i>');
            dom.lastMessageSpan.innerText = appChatsManager.getChatMembersString(-peerId);
          } else if(peerId == rootScope.myId) {
            dom.lastMessageSpan.innerHTML = 'chat with yourself';
          } else {
            let username = appPeersManager.getPeerUsername(peerId);
            if(!username) {
              const user = appUsersManager.getUser(peerId);
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
          setResults(value.dialogs.map(d => d.peerId), this.searchGroups.contacts, true);
        }
      });
    }
    
    return this.searchPromise = appMessagesManager.getSearch(this.peerId, query, {_: 'inputMessagesFilterEmpty'}, maxId, 20, this.offsetRate).then(res => {
      this.searchPromise = null;
      
      if(this.searchInput.value != query) {
        return;
      }
      
      //console.log('input search result:', this.peerId, query, null, maxId, 20, res);
      
      const {count, history, next_rate} = res;
      
      if(history[0] == this.minMsgId) {
        history.shift();
      }
      
      const searchGroup = this.searchGroups.messages;

      history.forEach((msgId: number) => {
        const message = appMessagesManager.getMessage(msgId);

        const {dialog, dom} = appDialogsManager.addDialog(message.peerId, this.scrollable/* searchGroup.list */, false);
        appDialogsManager.setLastMessage(dialog, message, dom, query);
      });

      searchGroup.toggle();
      
      this.minMsgId = history[history.length - 1];
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
