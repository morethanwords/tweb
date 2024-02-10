/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appDialogsManager from '../lib/appManagers/appDialogsManager';
import Scrollable from './scrollable';
import InputSearch from './inputSearch';
import replaceContent from '../helpers/dom/replaceContent';
import {i18n, LangPackKey} from '../lib/langPack';
import rootScope from '../lib/rootScope';
import {getMiddleware, Middleware, MiddlewareHelper} from '../helpers/middleware';
import getPeerId from '../lib/appManagers/utils/peers/getPeerId';
import {Message} from '../layer';
import apiManagerProxy from '../lib/mtproto/mtprotoworker';

export class SearchGroup {
  container: HTMLDivElement;
  nameEl: HTMLDivElement;
  list: HTMLUListElement;

  constructor(
    public name: LangPackKey | boolean,
    public type: string,
    private clearable = true,
    className?: string,
    clickable = true,
    public autonomous = true,
    public onFound?: () => void,
    public noIcons?: boolean
  ) {
    this.list = appDialogsManager.createChatList();
    this.container = document.createElement('div');
    if(className) this.container.className = className;

    if(name) {
      this.nameEl = document.createElement('div');
      this.nameEl.classList.add('search-group__name');
      if(typeof(name) === 'string') {
        this.nameEl.append(i18n(name));
      }
      this.container.append(this.nameEl);
    }

    this.container.classList.add('search-group', 'search-group-' + type);
    this.container.append(this.list);
    this.container.style.display = 'none';

    if(clickable) {
      appDialogsManager.setListClickListener({list: this.list, onFound, withContext: undefined, autonomous});
    }
  }

  clear() {
    this.container.style.display = 'none';

    if(this.clearable) {
      Array.from(this.list.children).forEach((el) => {
        const dialogElement = (el as any).dialogElement;
        if(dialogElement) dialogElement?.remove();
        else el.remove();
      });
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

export type SearchGroupType = 'contacts' | 'globalContacts' | 'messages' | string;

export default class AppSearch {
  private minMsgId = 0;
  private loadedCount = -1;
  private foundCount = -1;

  private searchPromise: Promise<void> = null;
  private searchTimeout: number = 0;

  private query = '';

  private listsContainer: HTMLDivElement = null;

  private peerId: PeerId; // 0 - means global
  private threadId = 0;

  private scrollable: Scrollable;

  private middlewareHelper: MiddlewareHelper;

  constructor(
    public container: HTMLElement,
    public searchInput: InputSearch,
    public searchGroups: {[group in SearchGroupType]: SearchGroup},
    middleware: Middleware,
    public onSearch?: (count: number) => void,
    public noIcons?: boolean,
    private fromSavedDialog?: boolean
  ) {
    this.middlewareHelper = middleware.create();
    this.scrollable = new Scrollable(this.container);
    this.listsContainer = this.scrollable.container as HTMLDivElement;
    for(const i in this.searchGroups) {
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
      this.peerId = undefined;
      this.threadId = 0;
    }

    this.middlewareHelper.clean();
    this.minMsgId = 0;
    this.loadedCount = -1;
    this.foundCount = -1;

    for(const i in this.searchGroups) {
      this.searchGroups[i as SearchGroupType].clear();
    }

    this.searchPromise = null;
  }

  public beginSearch(peerId?: PeerId, threadId = 0, query = '') {
    this.peerId = peerId;
    this.threadId = threadId;

    if(this.query !== query) {
      this.searchInput.inputField.value = query;
    }

    this.searchInput.input.focus();
  }

  public searchMore() {
    if(this.searchPromise) return this.searchPromise;

    const query = this.query;

    if(!query.trim()) {
      this.onSearch?.(0);
      return;
    }

    if(this.foundCount !== -1 && this.loadedCount >= this.foundCount) {
      return Promise.resolve();
    }

    const offsetId = this.minMsgId || 0;

    const middleware = this.middlewareHelper.get();

    return this.searchPromise = rootScope.managers.appMessagesManager.getHistory({
      peerId: this.peerId,
      query,
      inputFilter: {_: 'inputMessagesFilterEmpty'},
      offsetId,
      limit: 20,
      threadId: this.threadId
    }).then((res) => {
      if(!middleware()) {
        return;
      }

      this.searchPromise = null;

      if(this.searchInput.value !== query) {
        return;
      }

      // console.log('input search result:', this.peerId, query, null, maxId, 20, res);

      let {count, messages, history} = res;

      if(!messages) {
        messages = res.messages = history.map((mid) => apiManagerProxy.getMessageByPeer(this.peerId, mid));
      }

      if(messages.length && messages[0].mid === this.minMsgId) {
        messages.shift();
      }

      const searchGroup = this.searchGroups.messages;

      messages.forEach((message) => {
        try {
          const peerId = this.peerId ? message.fromId : message.peerId;
          appDialogsManager.addDialogAndSetLastMessage({
            peerId: this.fromSavedDialog ? rootScope.myId : peerId,
            container: this.scrollable/* searchGroup.list */,
            avatarSize: 'bigger',
            meAsSaved: false,
            message,
            query,
            noIcons: this.noIcons,
            wrapOptions: {
              middleware
            },
            threadId: this.fromSavedDialog ? ((message as Message.message).saved_peer_id ? getPeerId((message as Message.message).saved_peer_id) : rootScope.myId) : undefined
          });
        } catch(err) {
          console.error('[appSearch] render search result', err);
        }
      });

      searchGroup.toggle();

      this.minMsgId = messages.length && messages[messages.length - 1].mid;

      if(this.loadedCount === -1) {
        this.loadedCount = 0;
      }
      this.loadedCount += messages.length;

      if(this.foundCount === -1) {
        this.foundCount = count;

        if(searchGroup.nameEl) {
          replaceContent(searchGroup.nameEl, i18n(count ? 'Chat.Search.MessagesFound' : 'Chat.Search.NoMessagesFound', [count]));
        }

        this.onSearch?.(this.foundCount);
      }
    }).catch((err) => {
      if(!middleware()) {
        return;
      }

      console.error('search error', err);
      this.searchPromise = null;
    });
  }
}
