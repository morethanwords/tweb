/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { Dialog } from './appMessagesManager';
import { NULL_PEER_ID, UserAuth } from '../mtproto/mtproto_config';
import type { MyTopPeer, TopPeerType, User } from './appUsersManager';
import type { AuthState } from '../../types';
import type FiltersStorage from '../storages/filters';
import type DialogsStorage from '../storages/dialogs';
import EventListenerBase from '../../helpers/eventListenerBase';
import rootScope from '../rootScope';
import stateStorage from '../stateStorage';
import { logger } from '../logger';
import App from '../../config/app';
import DEBUG, { MOUNT_CLASS_TO } from '../../config/debug';
import AppStorage from '../storage';
import { AutoDownloadSettings, Chat, NotifyPeer, PeerNotifySettings } from '../../layer';
import { IS_MOBILE } from '../../environment/userAgent';
import DATABASE_STATE from '../../config/databases/state';
import sessionStorage from '../sessionStorage';
import { nextRandomUint } from '../../helpers/random';
import compareVersion from '../../helpers/compareVersion';
import getTimeFormat from '../../helpers/getTimeFormat';
import copy from '../../helpers/object/copy';
import setDeepProperty from '../../helpers/object/setDeepProperty';
import validateInitObject from '../../helpers/object/validateInitObject';

const REFRESH_EVERY = 24 * 60 * 60 * 1000; // 1 day
// const REFRESH_EVERY = 1e3;
//const REFRESH_EVERY_WEEK = 24 * 60 * 60 * 1000 * 7; // 7 days
const STATE_VERSION = App.version;
const BUILD = App.build;

export type Background = {
  type?: 'color' | 'image' | 'default', // ! DEPRECATED
  blur: boolean,
  highlightningColor?: string,
  color?: string,     
  slug?: string,        // image slug
  intensity?: number,   // pattern intensity
  id: string | number,  // wallpaper id
};

export type Theme = {
  name: 'day' | 'night' | 'system',
  background: Background
};

export type AutoDownloadPeerTypeSettings = {
  contacts: boolean,
  private: boolean,
  groups: boolean,
  channels: boolean
};

export type State = {
  allDialogsLoaded: DialogsStorage['allDialogsLoaded'],
  pinnedOrders: DialogsStorage['pinnedOrders'],
  contactsList: UserId[],
  updates: Partial<{
    seq: number,
    pts: number,
    date: number
  }>,
  filters: FiltersStorage['filters'],
  maxSeenMsgId: number,
  stateCreatedTime: number,
  recentEmoji: string[],
  topPeersCache: {
    [type in TopPeerType]?: {
      peers: MyTopPeer[],
      cachedTime: number
    }
  },
  recentSearch: PeerId[],
  version: typeof STATE_VERSION,
  build: typeof BUILD,
  authState: AuthState,
  hiddenPinnedMessages: {[peerId: PeerId]: number},
  settings: {
    messagesTextSize: number,
    distanceUnit: 'kilometers' | 'miles',
    sendShortcut: 'enter' | 'ctrlEnter',
    animationsEnabled: boolean,
    autoDownload: {
      contacts?: boolean, // ! DEPRECATED
      private?: boolean, // ! DEPRECATED
      groups?: boolean, // ! DEPRECATED
      channels?: boolean, // ! DEPRECATED
      photo: AutoDownloadPeerTypeSettings,
      video: AutoDownloadPeerTypeSettings,
      file: AutoDownloadPeerTypeSettings
    },
    autoDownloadNew: AutoDownloadSettings,
    autoPlay: {
      gifs: boolean,
      videos: boolean
    },
    stickers: {
      suggest: boolean,
      loop: boolean
    },
    emoji: {
      suggest: boolean,
      big: boolean
    },
    background?: Background, // ! DEPRECATED
    themes: Theme[],
    theme: Theme['name'],
    notifications: {
      sound: boolean
    },
    nightTheme?: boolean, // ! DEPRECATED
    timeFormat: 'h12' | 'h23'
  },
  keepSigned: boolean,
  chatContextMenuHintWasShown: boolean,
  stateId: number,
  notifySettings: {[k in Exclude<NotifyPeer['_'], 'notifyPeer'>]?: PeerNotifySettings.peerNotifySettings}
};

const BACKGROUND_DAY_DESKTOP: Background = {
  blur: false,
  slug: 'pattern',
  color: '#dbddbb,#6ba587,#d5d88d,#88b884',
  highlightningColor: 'hsla(86.4, 43.846153%, 45.117647%, .4)',
  intensity: 50,
  id: '1'
};

const BACKGROUND_DAY_MOBILE: Background = {
  blur: false,
  slug: '',
  color: '#dbddbb,#6ba587,#d5d88d,#88b884',
  highlightningColor: 'hsla(86.4, 43.846153%, 45.117647%, .4)',
  intensity: 0,
  id: '1'
};

const BACKGROUND_NIGHT_DESKTOP: Background = {
  blur: false,
  slug: 'pattern',
  // color: '#dbddbb,#6ba587,#d5d88d,#88b884',
  color: '#fec496,#dd6cb9,#962fbf,#4f5bd5',
  highlightningColor: 'hsla(299.142857, 44.166666%, 37.470588%, .4)',
  intensity: -50,
  id: '-1'
};

const BACKGROUND_NIGHT_MOBILE: Background = {
  blur: false,
  slug: '',
  color: '#0f0f0f',
  highlightningColor: 'hsla(0, 0%, 3.82353%, 0.4)',
  intensity: 0,
  id: '-1'
};

export const STATE_INIT: State = {
  allDialogsLoaded: {},
  pinnedOrders: {},
  contactsList: [],
  updates: {},
  filters: {},
  maxSeenMsgId: 0,
  stateCreatedTime: Date.now(),
  recentEmoji: [],
  topPeersCache: {},
  recentSearch: [],
  version: STATE_VERSION,
  build: BUILD,
  authState: {
    _: IS_MOBILE ? 'authStateSignIn' : 'authStateSignQr'
  },
  hiddenPinnedMessages: {},
  settings: {
    messagesTextSize: 16,
    distanceUnit: 'kilometers',
    sendShortcut: 'enter',
    animationsEnabled: true,
    autoDownload: {
      photo: {
        contacts: true,
        private: true,
        groups: true,
        channels: true
      },
      video: {
        contacts: true,
        private: true,
        groups: true,
        channels: true
      },
      file: {
        contacts: true,
        private: true,
        groups: true,
        channels: true
      }
    },
    autoDownloadNew: {
      _: 'autoDownloadSettings',
      file_size_max: 3145728,
      pFlags: {
        video_preload_large: true,
        audio_preload_next: true
      },
      photo_size_max: 1048576,
      video_size_max: 15728640,
      video_upload_maxbitrate: 100
    },
    autoPlay: {
      gifs: true,
      videos: true
    },
    stickers: {
      suggest: true,
      loop: true
    },
    emoji: {
      suggest: true,
      big: true
    },
    themes: [{
      name: 'day',
      background: IS_MOBILE ? BACKGROUND_DAY_MOBILE : BACKGROUND_DAY_DESKTOP
    }, {
      name: 'night',
      background: IS_MOBILE ? BACKGROUND_NIGHT_MOBILE : BACKGROUND_NIGHT_DESKTOP
    }],
    theme: 'system',
    notifications: {
      sound: false
    },
    timeFormat: getTimeFormat()
  },
  keepSigned: true,
  chatContextMenuHintWasShown: false,
  stateId: nextRandomUint(32),
  notifySettings: {}
};

const ALL_KEYS = Object.keys(STATE_INIT) as any as Array<keyof State>;

const REFRESH_KEYS = ['contactsList', 'stateCreatedTime',
  'maxSeenMsgId', 'filters', 'topPeers'] as any as Array<keyof State>;

export type StatePeerType = 'recentSearch' | 'topPeer' | 'dialog' | 'contact' | 'topMessage' | 'self';

//const REFRESH_KEYS_WEEK = ['dialogs', 'allDialogsLoaded', 'updates', 'pinnedOrders'] as any as Array<keyof State>;

export class AppStateManager extends EventListenerBase<{
  save: (state: State) => Promise<void>,
  peerNeeded: (peerId: PeerId) => void,
  peerUnneeded: (peerId: PeerId) => void
}> {
  public static STATE_INIT = STATE_INIT;
  private loaded: Promise<State>;
  private log = logger('STATE'/* , LogLevels.error */);

  private state: State;

  private neededPeers: Map<PeerId, Set<string>> = new Map();
  private singlePeerMap: Map<string, PeerId> = new Map();

  public storages = {
    users: new AppStorage<Record<UserId, User>, typeof DATABASE_STATE>(DATABASE_STATE, 'users'),
    chats: new AppStorage<Record<ChatId, Chat>, typeof DATABASE_STATE>(DATABASE_STATE, 'chats'),
    dialogs: new AppStorage<Record<PeerId, Dialog>, typeof DATABASE_STATE>(DATABASE_STATE, 'dialogs')
  };

  public storagesResults: {
    users: User[],
    chats: Chat[],
    dialogs: Dialog[]
  } = {} as any;

  public storage = stateStorage;

  public newVersion: string;

  constructor() {
    super();
    this.loadSavedState();

    rootScope.addEventListener('user_auth', () => {
      this.requestPeerSingle(rootScope.myId, 'self');
    });
  }

  public loadSavedState(): Promise<State> {
    if(this.loaded) return this.loaded;
    console.time('load state');
    this.loaded = new Promise((resolve) => {
      const storagesKeys = Object.keys(this.storages) as Array<keyof AppStateManager['storages']>;
      const storagesPromises: Promise<any>[] = storagesKeys.map(key => this.storages[key].getAll());

      const promises/* : Promise<any>[] */ = ALL_KEYS.map(key => stateStorage.get(key))
      .concat(sessionStorage.get('user_auth'), sessionStorage.get('state_id'))
      .concat(stateStorage.get('user_auth')) // support old webk format
      .concat(storagesPromises);

      Promise.all(promises).then(async(arr) => {
        // await new Promise((resolve) => setTimeout(resolve, 3e3));
        /* const self = this;
        const skipHandleKeys = new Set(['isProxy', 'filters', 'drafts']);
        const getHandler = (path?: string) => {
          return {
            get(target: any, key: any) {
              if(key === 'isProxy') {
                return true;
              }

              const prop = target[key];

              if(prop !== undefined && !skipHandleKeys.has(key) && !prop.isProxy && typeof(prop) === 'object') {
                target[key] = new Proxy(prop, getHandler(path || key));
                return target[key];
              }
              
              return prop;
            },
            set(target: any, key: any, value: any) {
              console.log('Setting', target, `.${key} to equal`, value, path);
          
              target[key] = value;

              // @ts-ignore
              self.pushToState(path || key, path ? self.state[path] : value, false);

              return true;
            }
          };
        }; */

        let state: State = this.state = {} as any;

        // ! then can't store false values
        for(let i = 0, length = ALL_KEYS.length; i < length; ++i) {
          const key = ALL_KEYS[i];
          const value = arr[i];
          if(value !== undefined) {
            // @ts-ignore
            state[key] = value;
          } else {
            this.pushToState(key, copy(STATE_INIT[key]));
          }
        }

        arr.splice(0, ALL_KEYS.length);

        // * Read auth
        let auth = arr.shift() as UserAuth | number;
        const stateId = arr.shift() as number;
        const shiftedWebKAuth = arr.shift() as UserAuth | number;
        if(!auth && shiftedWebKAuth) { // support old webk auth
          auth = shiftedWebKAuth;
          const keys: string[] = ['dc', 'server_time_offset', 'xt_instance'];
          for(let i = 1; i <= 5; ++i) {
            keys.push(`dc${i}_server_salt`);
            keys.push(`dc${i}_auth_key`);
          }

          const values = await Promise.all(keys.map(key => stateStorage.get(key as any)));
          keys.push('user_auth');
          values.push(typeof(auth) === 'number' || typeof(auth) === 'string' ? {dcID: values[0] || App.baseDcId, date: Date.now() / 1000 | 0, id: auth.toPeerId(false)} as UserAuth : auth);

          let obj: any = {};
          keys.forEach((key, idx) => {
            obj[key] = values[idx];
          });

          await sessionStorage.set(obj);
        }
        
        /* if(!auth) { // try to read Webogram's session from localStorage
          try {
            const keys = Object.keys(localStorage);
            for(let i = 0; i < keys.length; ++i) {
              const key = keys[i];
              let value: any;
              try {
                value = localStorage.getItem(key);
                value = JSON.parse(value);
              } catch(err) {
                //console.error(err);
              }

              sessionStorage.set({
                [key as any]: value
              });
            }

            auth = sessionStorage.getFromCache('user_auth');
          } catch(err) {
            this.log.error('localStorage import error', err);
          }
        } */

        if(auth) {
          // ! Warning ! DON'T delete this
          state.authState = {_: 'authStateSignedIn'};
          rootScope.dispatchEvent('user_auth', typeof(auth) === 'number' || typeof(auth) === 'string' ? 
            {dcID: 0, date: Date.now() / 1000 | 0, id: auth.toPeerId(false)} : 
            auth); // * support old version
        }

        // * Read storages
        for(let i = 0, length = storagesKeys.length; i < length; ++i) {
          this.storagesResults[storagesKeys[i]] = arr[i] as any;
        }

        arr.splice(0, storagesKeys.length);

        if(state.stateId !== stateId) {
          if(stateId !== undefined) {
            const preserve: Map<keyof State, State[keyof State]> = new Map([
              ['authState', undefined],
              ['stateId', undefined]
            ]);
  
            preserve.forEach((_, key) => {
              preserve.set(key, copy(state[key]));
            });
  
            state = this.state = copy(STATE_INIT);
  
            preserve.forEach((value, key) => {
              // @ts-ignore
              state[key] = value;
            });

            for(const key in this.storagesResults) {
              this.storagesResults[key as keyof AppStateManager['storagesResults']].length = 0;
            }

            this.storage.set(state);
          }

          await sessionStorage.set({
            state_id: state.stateId
          });
        }

        const time = Date.now();
        if((state.stateCreatedTime + REFRESH_EVERY) < time) {
          if(DEBUG) {
            this.log('will refresh state', state.stateCreatedTime, time);
          }

          const r = (keys: typeof REFRESH_KEYS) => {
            keys.forEach(key => {
              this.pushToState(key, copy(STATE_INIT[key]));
  
              // @ts-ignore
              const s = this.storagesResults[key];
              if(s && s.length) {
                s.length = 0;
              }
            });
          };
          
          r(REFRESH_KEYS);

          /* if((state.stateCreatedTime + REFRESH_EVERY_WEEK) < time) {
            if(DEBUG) {
              this.log('will refresh updates');
            }

            r(REFRESH_KEYS_WEEK);
          } */
        }
        
        //state = this.state = new Proxy(state, getHandler());

        // * support old version
        if(!state.settings.hasOwnProperty('theme') && state.settings.hasOwnProperty('nightTheme')) {
          state.settings.theme = state.settings.nightTheme ? 'night' : 'day';
          this.pushToState('settings', state.settings);
        }

        // * support old version
        if(!state.settings.hasOwnProperty('themes') && state.settings.background) {
          state.settings.themes = copy(STATE_INIT.settings.themes);
          const theme = state.settings.themes.find(t => t.name === state.settings.theme);
          if(theme) {
            theme.background = state.settings.background;
            this.pushToState('settings', state.settings);
          }
        }

        // * migrate auto download settings
        const autoDownloadSettings = state.settings.autoDownload;
        if(autoDownloadSettings?.private !== undefined) {
          const oldTypes = [
            'contacts' as const, 
            'private' as const, 
            'groups' as const, 
            'channels' as const
          ];

          const mediaTypes = [
            'photo' as const,
            'video' as const,
            'file' as const
          ];

          mediaTypes.forEach(mediaType => {
            const peerTypeSettings: AutoDownloadPeerTypeSettings = autoDownloadSettings[mediaType] = {} as any;
            oldTypes.forEach(peerType => {
              peerTypeSettings[peerType] = autoDownloadSettings[peerType];
            });
          });

          oldTypes.forEach(peerType => {
            delete autoDownloadSettings[peerType];
          });

          this.pushToState('settings', state.settings);
        }

        validateInitObject(STATE_INIT, state, (missingKey) => {
          // @ts-ignore
          this.pushToState(missingKey, state[missingKey]);
        });

        if(state.version !== STATE_VERSION || state.build !== BUILD/*  || true */) {
          // reset filters and dialogs if version is older
          if(compareVersion(state.version, '0.8.7') === -1) {
            this.state.allDialogsLoaded = copy(STATE_INIT.allDialogsLoaded);
            this.state.filters = copy(STATE_INIT.filters);
            const result = this.storagesResults.dialogs;
            if(result?.length) {
              result.length = 0;
            }
          }

          // * migrate backgrounds (March 13, 2022; to version 1.3.0)
          if(compareVersion(state.version, '1.3.0') === -1) {
            let migrated = false;
            state.settings.themes.forEach((theme, idx, arr) => {
              if((
                theme.name === 'day' && 
                theme.background.slug === 'ByxGo2lrMFAIAAAAmkJxZabh8eM' && 
                theme.background.type === 'image' 
              ) || (
                theme.name === 'night' && 
                theme.background.color === '#0f0f0f' && 
                theme.background.type === 'color' 
              )) {
                const newTheme = STATE_INIT.settings.themes.find(newTheme => newTheme.name === theme.name);
                if(newTheme) {
                  arr[idx] = copy(newTheme);
                  migrated = true;
                }
              }
            });

            if(migrated) {
              this.pushToState('settings', state.settings);
            }
          }
          
          if(compareVersion(state.version, STATE_VERSION) !== 0) {
            this.newVersion = STATE_VERSION;
          }

          this.pushToState('version', STATE_VERSION);
          this.pushToState('build', BUILD);
        }

        // ! probably there is better place for it
        rootScope.settings = state.settings;

        if(DEBUG) {
          this.log('state res', state, copy(state));
        }
        
        //return resolve();

        console.timeEnd('load state');
        resolve(state);
      }).catch(resolve);
    });

    return this.loaded;
  }

  public getState() {
    return this.state === undefined ? this.loadSavedState() : Promise.resolve(this.state);
  }

  public setByKey(key: string, value: any) {
    setDeepProperty(this.state, key, value);
    rootScope.dispatchEvent('settings_updated', {key, value});

    const first = key.split('.')[0];
    // @ts-ignore
    this.pushToState(first, this.state[first]);
  }

  public pushToState<T extends keyof State>(key: T, value: State[T], direct = true) {
    if(direct) {
      this.state[key] = value;
    }

    this.setKeyValueToStorage(key, value);
  }

  public setKeyValueToStorage<T extends keyof State>(key: T, value: State[T] = this.state[key]) {
    this.storage.set({
      [key]: value
    });
  }

  public requestPeer(peerId: PeerId, type: StatePeerType, limit?: number) {
    let set = this.neededPeers.get(peerId);
    if(set && set.has(type)) {
      return;
    }

    if(!set) {
      set = new Set();
      this.neededPeers.set(peerId, set);
    }

    set.add(type);

    this.dispatchEvent('peerNeeded', peerId);

    if(limit !== undefined) {
      this.keepPeerSingle(peerId, type);
    }
  }

  public requestPeerSingle(peerId: PeerId, type: StatePeerType, keepPeerIdSingle: PeerId = peerId) {
    return this.requestPeer(peerId, type + '_' + keepPeerIdSingle as any, 1);
  }

  public releaseSinglePeer(peerId: PeerId, type: StatePeerType) {
    return this.keepPeerSingle(NULL_PEER_ID, type + '_' + peerId as any);
  }

  public isPeerNeeded(peerId: PeerId) {
    return this.neededPeers.has(peerId);
  }

  public keepPeerSingle(peerId: PeerId, type: StatePeerType) {
    const existsPeerId = this.singlePeerMap.get(type);
    if(existsPeerId && existsPeerId !== peerId && this.neededPeers.has(existsPeerId)) {
      const set = this.neededPeers.get(existsPeerId);
      set.delete(type);

      if(!set.size) {
        this.neededPeers.delete(existsPeerId);
        this.dispatchEvent('peerUnneeded', existsPeerId);
      }
    }

    if(peerId) {
      this.singlePeerMap.set(type, peerId);
    } else {
      this.singlePeerMap.delete(type);
    }
  }

  /* public resetState() {
    for(let i in this.state) {
      // @ts-ignore
      this.state[i] = false;
    }
    sessionStorage.set(this.state).then(() => {
      location.reload();
    });
  } */
}

//console.trace('appStateManager include');

const appStateManager = new AppStateManager();
MOUNT_CLASS_TO.appStateManager = appStateManager;
export default appStateManager;
