/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import App from "../../../../config/app";
import DEBUG from "../../../../config/debug";
import { AutoDownloadPeerTypeSettings, State, STATE_INIT } from "../../../../config/state";
import compareVersion from "../../../../helpers/compareVersion";
import copy from "../../../../helpers/object/copy";
import validateInitObject from "../../../../helpers/object/validateInitObject";
import { UserAuth } from "../../../mtproto/mtproto_config";
import rootScope from "../../../rootScope";
import stateStorage from "../../../stateStorage";
import sessionStorage from "../../../sessionStorage";
import { recordPromiseBound } from "../../../../helpers/recordPromise";
// import RESET_STORAGES_PROMISE from "../storages/resetStoragesPromise";
import { StoragesResults } from "../storages/loadStorages";
import { logger } from "../../../logger";

const REFRESH_EVERY = 24 * 60 * 60 * 1000; // 1 day
// const REFRESH_EVERY = 1e3;
//const REFRESH_EVERY_WEEK = 24 * 60 * 60 * 1000 * 7; // 7 days

const STATE_VERSION = STATE_INIT.version;
const BUILD = STATE_INIT.build;

const ALL_KEYS = Object.keys(STATE_INIT) as any as Array<keyof State>;

const REFRESH_KEYS: Array<keyof State> = [
  'contactsListCachedTime', 
  'stateCreatedTime',
  'maxSeenMsgId', 
  'filters'
];

//const REFRESH_KEYS_WEEK = ['dialogs', 'allDialogsLoaded', 'updates', 'pinnedOrders'] as any as Array<keyof State>;

async function loadStateInner() {
  const log = logger('STATE-LOADER');

  const totalPerf = performance.now();
  const recordPromise = recordPromiseBound(log);

  const promises = ALL_KEYS.map((key) => recordPromise(stateStorage.get(key), 'state ' + key))
  .concat(
    recordPromise(sessionStorage.get('user_auth'), 'auth'), 
    recordPromise(sessionStorage.get('state_id'), 'auth'),
    recordPromise(sessionStorage.get('k_build'), 'auth')
  )
  .concat(recordPromise(stateStorage.get('user_auth'), 'old auth')); // support old webk format

  const arr = await Promise.all(promises);
  log.warn('promises', performance.now() - totalPerf);
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

  // const pushed: {key: keyof State, value: State[keyof State]}[] = [];
  const pushedKeys: (keyof State)[] = [];
  const pushToState = <T extends keyof State>(key: T, value: State[T]) => {
    // appStateManager.pushToState(key, value);
    state[key] = value;
    // pushed.push({key, value});
    pushedKeys.push(key);
  };

  const replaceState = (_state: State) => {
    // pushed.length = 0;
    pushedKeys.length = 0;
    state = _state;
    pushedKeys.push(...Object.keys(state) as any as typeof pushedKeys);
    // state = appStateManager.setState(_state);
    // appStateManager.storage.set(state);
  };

  // let state: State = appStateManager.setState({} as any);
  let state: State = {} as any;

  // ! then can't store false values
  for(let i = 0, length = ALL_KEYS.length; i < length; ++i) {
    const key = ALL_KEYS[i];
    const value = arr[i];
    if(value !== undefined) {
      // @ts-ignore
      state[key] = value;
    } else {
      pushToState(key, copy(STATE_INIT[key]));
    }
  }

  arr.splice(0, ALL_KEYS.length);

  // * Read auth
  let auth = arr.shift() as UserAuth | number;
  const stateId = arr.shift() as number;
  const sessionBuild = arr.shift() as number;
  const shiftedWebKAuth = arr.shift() as UserAuth | number;
  if(!auth && shiftedWebKAuth) { // support old webk auth
    auth = shiftedWebKAuth;
    const keys: string[] = ['dc', 'server_time_offset', 'xt_instance'];
    for(let i = 1; i <= 5; ++i) {
      keys.push(`dc${i}_server_salt`);
      keys.push(`dc${i}_auth_key`);
    }

    const values = await Promise.all(keys.map((key) => stateStorage.get(key as any)));
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

  const resetStorages: Set<keyof StoragesResults> = new Set();
  if(state.stateId !== stateId) {
    if(stateId !== undefined) {
      const preserve: Map<keyof State, State[keyof State]> = new Map([
        ['authState', undefined],
        ['stateId', undefined]
      ]);

      preserve.forEach((_, key) => {
        preserve.set(key, copy(state[key]));
      });

      state = copy(STATE_INIT);

      preserve.forEach((value, key) => {
        // @ts-ignore
        state[key] = value;
      });

      const r: {[k in keyof StoragesResults]: number} = {
        chats: 1,
        dialogs: 1,
        users: 1
      };
      for(const key in r) {
        resetStorages.add(key as keyof StoragesResults);
        // this.storagesResults[key as keyof AppStateManager['storagesResults']].length = 0;
      }

      replaceState(state);
    }

    await sessionStorage.set({
      state_id: state.stateId
    });
  }

  const time = Date.now();
  if((state.stateCreatedTime + REFRESH_EVERY) < time) {
    if(DEBUG) {
      log('will refresh state', state.stateCreatedTime, time);
    }

    const r = (keys: typeof REFRESH_KEYS) => {
      keys.forEach((key) => {
        pushToState(key, copy(STATE_INIT[key]));

        // const s = appStateManager.storagesResults[key as keyof AppStateManager['storagesResults']];
        // if(s?.length) {
          // appStateManager.resetStorages.add(key as keyof AppStateManager['storagesResults']);
          // s.length = 0;
        // }
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
    pushToState('settings', state.settings);
  }

  // * support old version
  if(!state.settings.hasOwnProperty('themes') && state.settings.background) {
    state.settings.themes = copy(STATE_INIT.settings.themes);
    const theme = state.settings.themes.find((t) => t.name === state.settings.theme);
    if(theme) {
      theme.background = state.settings.background;
      pushToState('settings', state.settings);
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

    mediaTypes.forEach((mediaType) => {
      const peerTypeSettings: AutoDownloadPeerTypeSettings = autoDownloadSettings[mediaType] = {} as any;
      oldTypes.forEach((peerType) => {
        peerTypeSettings[peerType] = autoDownloadSettings[peerType];
      });
    });

    oldTypes.forEach((peerType) => {
      delete autoDownloadSettings[peerType];
    });

    pushToState('settings', state.settings);
  }

  validateInitObject(STATE_INIT, state, (missingKey) => {
    pushToState(missingKey as keyof State, state[missingKey as keyof State]);
  });

  let newVersion: string, oldVersion: string;
  if(state.version !== STATE_VERSION || state.build !== BUILD/*  || true */) {
    // reset filters and dialogs if version is older
    if(compareVersion(state.version, '0.8.7') === -1 || state.build < 179) {
      state.allDialogsLoaded = copy(STATE_INIT.allDialogsLoaded);
      state.filters = copy(STATE_INIT.filters);

      resetStorages.add('dialogs');
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
          const newTheme = STATE_INIT.settings.themes.find((newTheme) => newTheme.name === theme.name);
          if(newTheme) {
            arr[idx] = copy(newTheme);
            migrated = true;
          }
        }
      });

      if(migrated) {
        pushToState('settings', state.settings);
      }
    }
    
    if(compareVersion(state.version, STATE_VERSION) !== 0) {
      newVersion = STATE_VERSION;
      oldVersion = state.version;
    }

    pushToState('version', STATE_VERSION);
    pushToState('build', BUILD);
  }

  if(sessionBuild !== BUILD && (!sessionBuild || sessionBuild < BUILD)) {
    sessionStorage.set({k_build: BUILD});
  }

  // ! probably there is better place for it
  rootScope.settings = state.settings;

  if(DEBUG) {
    log('state res', state, copy(state));
  }
  
  //return resolve();

  log.warn('total', performance.now() - totalPerf);

  // RESET_STORAGES_PROMISE.resolve(appStateManager.resetStorages);

  return {state, resetStorages, newVersion, oldVersion, pushedKeys};
}

let promise: ReturnType<typeof loadStateInner>;
export default function loadState() {
  return promise ??= loadStateInner();
}
