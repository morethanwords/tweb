import type { Dialog } from './appMessagesManager';
import type { AppStickersManager } from './appStickersManager';
import { App, MOUNT_CLASS_TO, UserAuth } from '../mtproto/mtproto_config';
import EventListenerBase from '../../helpers/eventListenerBase';
import rootScope from '../rootScope';
import AppStorage from '../storage';
import { logger } from '../logger';
import type { AppUsersManager } from './appUsersManager';
import type { AppChatsManager } from './appChatsManager';
import type { AuthState } from '../../types';
import type FiltersStorage from '../storages/filters';
import type DialogsStorage from '../storages/dialogs';

const REFRESH_EVERY = 24 * 60 * 60 * 1000; // 1 day
const STATE_VERSION = App.version;

type State = Partial<{
  dialogs: Dialog[],
  allDialogsLoaded: DialogsStorage['allDialogsLoaded'],
  chats: {[peerId: string]: ReturnType<AppChatsManager['getChat']>},
  users: {[peerId: string]: ReturnType<AppUsersManager['getUser']>},
  messages: any[],
  contactsList: number[],
  updates: Partial<{
    seq: number,
    pts: number,
    date: number
  }>,
  filters: FiltersStorage['filters'],
  maxSeenMsgId: number,
  stateCreatedTime: number,
  recentEmoji: string[],
  topPeers: number[],
  recentSearch: number[],
  stickerSets: AppStickersManager['stickerSets'],
  version: typeof STATE_VERSION,
  authState: AuthState,
  hiddenPinnedMessages: {[peerId: string]: number}
}>;

/* const STATE_INIT: State = {
  dialogs: [],
  allDialogsLoaded: {},
  chats: {},
  users: {},
  messages: [],
  contactsList: [],
  updates: {},
  filters: {},
  maxSeenMsgId: 0,
  stateCreatedTime: 0,
  recentEmoji: [],
  topPeers: [],
  recentSearch: [],
  stickerSets: {},
  version: '',
  authState: 
}; */

const ALL_KEYS = ['dialogs', 'allDialogsLoaded', 'chats', 
  'users', 'messages', 'contactsList', 
  'updates', 'filters', 'maxSeenMsgId', 
  'stateCreatedTime', 'recentEmoji', 'topPeers', 
  'recentSearch', 'stickerSets', 'version', 
  'authState', 'hiddenPinnedMessages'
] as any as Array<keyof State>;

const REFRESH_KEYS = ['dialogs', 'allDialogsLoaded', 'messages', 'contactsList', 'stateCreatedTime',
  'updates', 'maxSeenMsgId', 'filters', 'topPeers'] as any as Array<keyof State>;

export class AppStateManager extends EventListenerBase<{
  save: (state: State) => Promise<void>
}> {
  public loaded: Promise<State>;
  private log = logger('STATE'/* , LogLevels.error */);

  private state: State;
  private savePromise: Promise<void>;
  private tempId = 0;

  constructor() {
    super();
    this.loadSavedState();
  }

  public loadSavedState() {
    if(this.loaded) return this.loaded;
    //console.time('load state');
    return this.loaded = new Promise((resolve) => {
      AppStorage.get<any>(...ALL_KEYS, 'user_auth').then((arr) => {
        let state: State = {};

        // ! then can't store false values
        ALL_KEYS.forEach((key, idx) => {
          const value = arr[idx];
          if(value !== false) {
            // @ts-ignore
            state[key] = value;
          }
        });

        const time = Date.now();
        if(state) {
          if(state.version != STATE_VERSION) {
            state = {};
          } else if(((state.stateCreatedTime || 0) + REFRESH_EVERY) < time/*  && false */) {
            this.log('will refresh state', state.stateCreatedTime, time);
            REFRESH_KEYS.forEach(key => {
              delete state[key];
            });
            //state = {};
          }
        }

        this.state = state || {};
        this.state.chats = state.chats || {};
        this.state.users = state.users || {};
        this.state.hiddenPinnedMessages = this.state.hiddenPinnedMessages || {};
        this.state.version = STATE_VERSION;
        
        // ??= doesn't compiles
        if(!this.state.hasOwnProperty('stateCreatedTime')) {
          this.state.stateCreatedTime = Date.now();
        }

        this.log('state res', state);
        
        //return resolve();

        const auth: UserAuth = arr[arr.length - 1];
        if(auth) {
          // ! Warning ! DON'T delete this
          this.state.authState = {_: 'authStateSignedIn'};
          rootScope.broadcast('user_auth', typeof(auth) !== 'number' ? (auth as any).id : auth); // * support old version
        } else if(!this.state.authState) {
          this.state.authState = {_: 'authStateSignIn'};
        }
        
        //console.timeEnd('load state');
        resolve(this.state);
      }).catch(resolve).finally(() => {
        setInterval(() => {
          this.tempId++;
          this.saveState();
        }, 10000);
      });
    });
  }

  public getState() {
    return this.state === undefined ? this.loadSavedState() : Promise.resolve(this.state);
  }

  public saveState() {
    if(this.state === undefined || this.savePromise) return;

    const tempId = this.tempId;
    this.savePromise = Promise.all(this.setListenerResult('save', this.state)).then(() => {
      return AppStorage.set(this.state);
    }).then(() => {
      this.savePromise = null;

      if(this.tempId !== tempId) {
        this.saveState();
      }
    });
    //let perf = performance.now();
    
    //this.log('saveState: event time:', performance.now() - perf);

    //const pinnedOrders = appMessagesManager.dialogsStorage.pinnedOrders;

    //perf = performance.now();
    
    //this.log('saveState: storage set time:', performance.now() - perf);
  }

  public pushToState<T extends keyof State>(key: T, value: State[T]) {
    this.state[key] = value;
  }

  public setPeer(peerId: number, peer: any) {
    const container = peerId > 0 ? this.state.users : this.state.chats;
    if(container.hasOwnProperty(peerId)) return;
    container[peerId] = peer;
  }

  public resetState() {
    for(let i in this.state) {
      // @ts-ignore
      this.state[i] = false;
    }
    AppStorage.set(this.state).then(() => {
      location.reload();
    });
  }
}

//console.trace('appStateManager include');

const appStateManager = new AppStateManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appStateManager = appStateManager);
export default appStateManager;