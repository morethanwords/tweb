import type { Dialog } from './appMessagesManager';
import type { UserAuth } from '../mtproto/mtproto_config';
import type { AppUsersManager } from './appUsersManager';
import type { AppChatsManager } from './appChatsManager';
import type { AuthState } from '../../types';
import type FiltersStorage from '../storages/filters';
import type DialogsStorage from '../storages/dialogs';
import type { AppDraftsManager } from './appDraftsManager';
import EventListenerBase from '../../helpers/eventListenerBase';
import rootScope from '../rootScope';
import sessionStorage from '../sessionStorage';
import { logger } from '../logger';
import { copy, setDeepProperty, validateInitObject } from '../../helpers/object';
import { getHeavyAnimationPromise } from '../../hooks/useHeavyAnimationCheck';
import App from '../../config/app';
import DEBUG, { MOUNT_CLASS_TO } from '../../config/debug';

const REFRESH_EVERY = 24 * 60 * 60 * 1000; // 1 day
const STATE_VERSION = App.version;

export type State = Partial<{
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
  version: typeof STATE_VERSION,
  authState: AuthState,
  hiddenPinnedMessages: {[peerId: string]: number},
  settings: {
    messagesTextSize: number,
    sendShortcut: 'enter' | 'ctrlEnter',
    animationsEnabled: boolean,
    autoDownload: {
      contacts: boolean
      private: boolean
      groups: boolean
      channels: boolean
    },
    autoPlay: {
      gifs: boolean,
      videos: boolean
    },
    stickers: {
      suggest: boolean,
      loop: boolean
    },
    background: {
      type: 'color' | 'image' | 'default',
      blur: boolean,
      highlightningColor?: string,
      color?: string,
      slug?: string,
    },
    notifications: {
      sound: boolean
    }
  },
  drafts: AppDraftsManager['drafts']
}>;

export const STATE_INIT: State = {
  dialogs: [],
  allDialogsLoaded: {},
  chats: {},
  users: {},
  messages: [],
  contactsList: [],
  updates: {},
  filters: {},
  maxSeenMsgId: 0,
  stateCreatedTime: Date.now(),
  recentEmoji: [],
  topPeers: [],
  recentSearch: [],
  version: STATE_VERSION,
  authState: {
    _: 'authStateSignIn'
  },
  hiddenPinnedMessages: {},
  settings: {
    messagesTextSize: 16,
    sendShortcut: 'enter',
    animationsEnabled: true,
    autoDownload: {
      contacts: true,
      private: true,
      groups: true,
      channels: true
    },
    autoPlay: {
      gifs: true,
      videos: true
    },
    stickers: {
      suggest: true,
      loop: true
    },
    background: {
      type: 'image',
      blur: false,
      slug: 'ByxGo2lrMFAIAAAAmkJxZabh8eM', // * new blurred camomile
    },
    notifications: {
      sound: false
    }
  },
  drafts: {}
};

const ALL_KEYS = Object.keys(STATE_INIT) as any as Array<keyof State>;

const REFRESH_KEYS = ['dialogs', 'allDialogsLoaded', 'messages', 'contactsList', 'stateCreatedTime',
  'updates', 'maxSeenMsgId', 'filters', 'topPeers'] as any as Array<keyof State>;

export class AppStateManager extends EventListenerBase<{
  save: (state: State) => Promise<void>
}> {
  public static STATE_INIT = STATE_INIT;
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
      Promise.all(ALL_KEYS.concat('user_auth' as any).map(key => sessionStorage.get(key))).then((arr) => {
        let state: State = {};

        // ! then can't store false values
        ALL_KEYS.forEach((key, idx) => {
          const value = arr[idx];
          if(value !== undefined) {
            // @ts-ignore
            state[key] = value;
          } else {
            // @ts-ignore
            state[key] = copy(STATE_INIT[key]);
          }
        });

        const time = Date.now();
        if(state) {
          if(state.version !== STATE_VERSION) {
            state = copy(STATE_INIT);
          } else if((state.stateCreatedTime + REFRESH_EVERY) < time/*  || true *//*  && false */) {
            if(DEBUG) {
              this.log('will refresh state', state.stateCreatedTime, time);
            }
            
            REFRESH_KEYS.forEach(key => {
              // @ts-ignore
              state[key] = copy(STATE_INIT[key]);
            });

            const users: typeof state['users'] = {}, chats: typeof state['chats'] = {};
            if(state.recentSearch?.length) {
              state.recentSearch.forEach(peerId => {
                if(peerId < 0) chats[peerId] = state.chats[peerId];
                else users[peerId] = state.users[peerId];
              });
            }

            state.users = users;
            state.chats = chats;
          }
        }

        validateInitObject(STATE_INIT, state);

        this.state = state;
        this.state.version = STATE_VERSION;

        // ! probably there is better place for it
        rootScope.settings = this.state.settings;

        if(DEBUG) {
          this.log('state res', state, copy(state));
        }
        
        //return resolve();

        const auth: UserAuth = arr[arr.length - 1] as any;
        if(auth) {
          // ! Warning ! DON'T delete this
          this.state.authState = {_: 'authStateSignedIn'};
          rootScope.broadcast('user_auth', typeof(auth) !== 'number' ? (auth as any).id : auth); // * support old version
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

    //return;

    const tempId = this.tempId;
    this.savePromise = getHeavyAnimationPromise().then(() => {
      return Promise.all(this.dispatchEvent('save', this.state))
      .then(() => getHeavyAnimationPromise())
      .then(() => sessionStorage.set(this.state))
      .then(() => {
        this.savePromise = null;
  
        if(this.tempId !== tempId) {
          this.saveState();
        }
      });
    });
    //let perf = performance.now();
    
    //this.log('saveState: event time:', performance.now() - perf);

    //const pinnedOrders = appMessagesManager.dialogsStorage.pinnedOrders;

    //perf = performance.now();
    
    //this.log('saveState: storage set time:', performance.now() - perf);
  }

  public setByKey(key: string, value: any) {
    setDeepProperty(this.state, key, value);
    rootScope.broadcast('settings_updated', {key, value});
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
    sessionStorage.set(this.state).then(() => {
      location.reload();
    });
  }
}

//console.trace('appStateManager include');

const appStateManager = new AppStateManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appStateManager = appStateManager);
export default appStateManager;