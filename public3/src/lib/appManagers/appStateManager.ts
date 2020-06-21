import AppStorage from '../storage';
import appMessagesManager, { Dialog, DialogsStorage, FiltersStorage } from './appMessagesManager';
import appMessagesIDsManager from './appMessagesIDsManager';
import appPeersManager from './appPeersManager';
import appChatsManager from './appChatsManager';
import appUsersManager from './appUsersManager';
import apiUpdatesManager from './apiUpdatesManager';
import { copy } from '../utils';
import { logger } from '../logger';

export class AppStateManager {
  public loaded: Promise<any>;
  private log = logger('STATE'/* , LogLevels.error */);

  private state: any = {};
  private peers: {[peerID: number]: any} = {};

  constructor() {
    this.loadSavedState();
  }

  public loadSavedState() {
    if(this.loaded) return this.loaded;
    return this.loaded = new Promise((resolve, reject) => {
      AppStorage.get<{
        dialogs: Dialog[],
        allDialogsLoaded: DialogsStorage['allDialogsLoaded'], 
        peers: any[],
        messages: any[],
        contactsList: number[],
        updates: any,
        filters: FiltersStorage['filters'],
        maxSeenMsgID: number
      }>('state').then((state) => {
        const {dialogs, allDialogsLoaded, peers, messages, contactsList, maxSeenMsgID, updates, filters} = state;
        
        this.state = state || {};
        this.state.peers = peers || {};

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

          // FIX FILE_REFERENCE_EXPIRED KOSTIL'1999
          for(let message of messages) {
            if(message.media) {
              appMessagesManager.wrapSingleMessage(message.mid, true);
            }
          }
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

        apiUpdatesManager.attach(updates ?? null);
  
        resolve(state);
      }).catch(resolve).finally(() => {
        setInterval(() => this.saveState(), 10000);
      });
    });
  }

  public getState() {
    return this.loadSavedState();
  }

  public saveState() {
    const messages: any[] = [];
    const dialogs: Dialog[] = [];
    const peers: {[peerID: number]: any} = this.peers;
    
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

  public pushToState(key: string, value: any) {
    this.state[key] = value;
  }

  public pushPeer(peerID: number) {
    this.peers[peerID] = appPeersManager.getPeer(peerID);
  }
}

const appStateManager = new AppStateManager();
export default appStateManager;