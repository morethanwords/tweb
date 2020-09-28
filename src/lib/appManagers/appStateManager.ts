import AppStorage from '../storage';
import appMessagesManager, { Dialog, DialogsStorage, FiltersStorage } from './appMessagesManager';
import appMessagesIDsManager from './appMessagesIDsManager';
import appPeersManager from './appPeersManager';
import appChatsManager from './appChatsManager';
import appUsersManager from './appUsersManager';
import apiUpdatesManager from './apiUpdatesManager';
import { $rootScope, copy } from '../utils';
import { logger } from '../logger';
import type { AppStickersManager } from './appStickersManager';
import { App } from '../mtproto/mtproto_config';

const REFRESH_EVERY = 24 * 60 * 60 * 1000; // 1 day
const STATE_VERSION = App.version;

type State = Partial<{
  dialogs: Dialog[],
  allDialogsLoaded: DialogsStorage['allDialogsLoaded'], 
  peers: {[peerID: string]: any},
  messages: any[],
  contactsList: number[],
  updates: any,
  filters: FiltersStorage['filters'],
  maxSeenMsgID: number,
  stateCreatedTime: number,
  recentEmoji: string[],
  topPeers: number[],
  recentSearch: number[],
  stickerSets: AppStickersManager['stickerSets'],
  version: typeof STATE_VERSION
}>;

const REFRESH_KEYS = ['dialogs', 'allDialogsLoaded', 'messages', 'contactsList', 'stateCreatedTime',
  'updates', 'maxSeenMsgID', 'filters', 'topPeers'] as any as Array<keyof State>;

export class AppStateManager {
  public loaded: Promise<State>;
  private log = logger('STATE'/* , LogLevels.error */);

  private state: State;

  constructor() {
    this.loadSavedState();

    $rootScope.$on('user_auth', (e) => {
      apiUpdatesManager.attach(null);
    });
  }

  public loadSavedState() {
    if(this.loaded) return this.loaded;
    return this.loaded = new Promise((resolve) => {
      AppStorage.get<[State, {id: number}]>('state', 'user_auth').then(([state, auth]) => {
        const time = Date.now();
        if(state) {
          if(state?.version != STATE_VERSION) {
            state = {};
          } else if((state?.stateCreatedTime ?? 0) + REFRESH_EVERY < time) {
            this.log('will refresh state', state.stateCreatedTime, time);
            REFRESH_KEYS.forEach(key => {
              delete state[key];
            });
            //state = {};
          }
        }
        
        // will not throw error because state can be `FALSE`
        const {dialogs, allDialogsLoaded, peers, messages, contactsList, maxSeenMsgID, updates, filters} = state;
        
        this.state = state || {};
        this.state.peers = peers || {};
        this.state.version = STATE_VERSION;

        // ??= doesn't compiles
        if(!this.state.hasOwnProperty('stateCreatedTime')) {
          this.state.stateCreatedTime = Date.now();
        }

        this.log('state res', dialogs, messages);

        if(maxSeenMsgID && !appMessagesIDsManager.getMessageIDInfo(maxSeenMsgID)[1]) {
          appMessagesManager.maxSeenID = maxSeenMsgID;
        }

        //return resolve();

        if(peers) {
          for(let peerID in peers) {
            let peer = peers[peerID];
            if(+peerID < 0) appChatsManager.saveApiChat(peer);
            else appUsersManager.saveApiUser(peer);
          }
        }

        if(contactsList && Array.isArray(contactsList) && contactsList.length) {
          contactsList.forEach(userID => {
            appUsersManager.pushContact(userID);
          });
          appUsersManager.contactsFillPromise = Promise.resolve(appUsersManager.contactsList);
        }

        if(messages) {
          /* let tempID = this.tempID;

          for(let message of messages) {
            if(message.id < tempID) {
              tempID = message.id;
            }
          }

          if(tempID != this.tempID) {
            this.log('Set tempID to:', tempID);
            this.tempID = tempID;
          } */

          appMessagesManager.saveMessages(messages);
        }
        
        if(allDialogsLoaded) {
          appMessagesManager.dialogsStorage.allDialogsLoaded = allDialogsLoaded;
        }

        if(filters) {
          for(const filterID in filters) {
            appMessagesManager.filtersStorage.saveDialogFilter(filters[filterID], false);
          }
        }

        if(dialogs) {
          dialogs.forEachReverse(dialog => {
            appMessagesManager.saveConversation(dialog);
          });
        }

        if(auth?.id) {
          apiUpdatesManager.attach(updates ?? null);
        }
  
        resolve(state);
      }).catch(resolve).finally(() => {
        setInterval(() => this.saveState(), 10000);
      });
    });
  }

  public getState() {
    return this.state === undefined ? this.loadSavedState() : Promise.resolve(this.state);
  }

  public saveState() {
    if(this.state === undefined) return;

    const messages: any[] = [];
    const dialogs: Dialog[] = [];
    const peers = this.state.peers;
    
    for(const folderID in appMessagesManager.dialogsStorage.byFolders) {
      const folder = appMessagesManager.dialogsStorage.getFolder(+folderID);

      for(let dialog of folder) {
        const historyStorage = appMessagesManager.historiesStorage[dialog.peerID];
        const history = [].concat(historyStorage?.pending ?? [], historyStorage?.history ?? []);
  
        dialog = copy(dialog);
        let removeUnread = 0;
        for(const mid of history) {
          const message = appMessagesManager.getMessage(mid);
          if(/* message._ != 'messageEmpty' &&  */message.id > 0) {
            messages.push(message);
    
            if(message.fromID != dialog.peerID) {
              peers[message.fromID] = appPeersManager.getPeer(message.fromID);
            }
  
            dialog.top_message = message.mid;
  
            break;
          } else if(message.pFlags && message.pFlags.unread) {
            ++removeUnread;
          }
        }
  
        if(removeUnread && dialog.unread_count) dialog.unread_count -= removeUnread; 
  
        dialogs.push(dialog);
  
        peers[dialog.peerID] = appPeersManager.getPeer(dialog.peerID);
      }
    }
    

    const us = apiUpdatesManager.updatesState;
    const updates = {
      seq: us.seq,
      pts: us.pts,
      date: us.date
    };

    const contactsList = [...appUsersManager.contactsList];
    for(const userID of contactsList) {
      if(!peers[userID]) {
        peers[userID] = appUsersManager.getUser(userID);
      }
    }

    const filters = appMessagesManager.filtersStorage.filters;
    //const pinnedOrders = appMessagesManager.dialogsStorage.pinnedOrders;

    AppStorage.set({
      state: Object.assign({}, this.state, {
        dialogs, 
        messages, 
        allDialogsLoaded: appMessagesManager.dialogsStorage.allDialogsLoaded, 
        peers, 
        contactsList,
        filters,
        //pinnedOrders,
        updates,
        maxSeenMsgID: appMessagesManager.maxSeenID
      })
    });
  }

  public pushToState<T extends keyof State>(key: T, value: State[T]) {
    this.state[key] = value;
  }

  public pushPeer(peerID: number) {
    this.state.peers[peerID] = appPeersManager.getPeer(peerID);
  }
}

//console.trace('appStateManager include');

const appStateManager = new AppStateManager();
// @ts-ignore
if(process.env.NODE_ENV != 'production') {
  (window as any).appStateManager = appStateManager;
}
export default appStateManager;