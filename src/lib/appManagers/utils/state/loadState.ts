/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import App from '../../../../config/app';
import DEBUG from '../../../../config/debug';
import {CommonState as StateCommon, State, COMMON_STATE_INIT, STATE_INIT} from '../../../../config/state';
import compareVersion from '../../../../helpers/compareVersion';
import copy from '../../../../helpers/object/copy';
import validateInitObject from '../../../../helpers/object/validateInitObject';
import {UserAuth} from '../../../mtproto/mtproto_config';
import sessionStorage from '../../../sessionStorage';
import {recordPromiseBound} from '../../../../helpers/recordPromise';
import {StoragesResults} from '../storages/loadStorages';
import {LogTypes, logger} from '../../../logger';
import {AccountSessionData, ActiveAccountNumber} from '../../../accounts/types';
import StateStorage from '../../../stateStorage';
import AccountController from '../../../accounts/accountController';
import commonStateStorage from '../../../commonStateStorage';
import {TrueDcId} from '../../../../types';
import {getOldDatabaseState} from '../../../../config/databases/state';
import {IDB} from '../../../files/idb';
import createStorages from '../storages/createStorages';
import isObject from '../../../../helpers/object/isObject';

export type LoadStateResult = {
  state: State,
  common: StateCommon,
  resetStorages: Map<keyof StoragesResults, (PeerId | UserId | ChatId)[]>,
  newVersion: string,
  oldVersion: string,
  pushedKeys: Set<keyof State>,
  userId: UserId
  refetchStorages?: boolean
};

const TEST_MULTI_MIGRATION = false;

const REFRESH_EVERY = 24 * 60 * 60 * 1000; // 1 day
// const REFRESH_EVERY = 1e3;
// const REFRESH_EVERY_WEEK = 24 * 60 * 60 * 1000 * 7; // 7 days

const STATE_VERSION = STATE_INIT.version;
const BUILD = STATE_INIT.build;

const ALL_KEYS = Object.keys(STATE_INIT) as any as Array<keyof State>;
const COMMON_KEYS = Object.keys(COMMON_STATE_INIT) as any as Array<keyof StateCommon>;

const REFRESH_KEYS: Array<keyof State> = [
  'contactsListCachedTime',
  'stateCreatedTime',
  'maxSeenMsgId',
  'filtersArr'
];

// const REFRESH_KEYS_WEEK = ['dialogs', 'allDialogsLoaded', 'updates', 'pinnedOrders'] as any as Array<keyof State>;

function AnyStateWriter<S>(log: ReturnType<typeof logger>, keys: string[], init: S) {
  const pushedKeys: Set<keyof S> = new Set();
  const pushToState = <T extends keyof S>(key: T, value: S[T]) => {
    state[key] = value;
    pushedKeys.add(key);
  };

  const replaceState = (_state: S) => {
    pushedKeys.clear();
    state = _state;
    (Object.keys(state) as any as Array<keyof S>).forEach((key) => pushedKeys.add(key));
  };

  let state: S = {} as any;

  const readFromArray = (arr: any[]) => {
    // ! then can't store false values
    for(let i = 0, length = keys.length; i < length; ++i) {
      const key = keys[i];
      const value = arr[i];
      if(value !== undefined) {
        // @ts-ignore
        state[key] = value;
      } else {
        // @ts-ignore
        pushToState(key, copy(init[key]));
      }
    }
  };

  return {
    push: pushToState,
    replace: replaceState,
    readFromArray,
    get state() {
      return state;
    },
    set state(_state: S) {
      state = _state;
    },
    pushedKeys,
    log
  };
}

function StateWriter(log: ReturnType<typeof logger>) {
  const w = AnyStateWriter<State>(log, ALL_KEYS, STATE_INIT);

  const resetStorages: Map<keyof StoragesResults, []> = new Map();
  const resetState = ({
    preserveKeys = []
    // preserveCommonKeys = []
  }: Partial<{
    preserveKeys: (keyof State)[]
    // preserveCommonKeys: typeof COMMON_KEYS[number][]
  }> = {}) => {
    preserveKeys.push('authState'/* , 'stateId' */);
    const preserve: Map<keyof State, State[keyof State]> = new Map(
      preserveKeys.map((key) => [key, w.state[key]])
    );

    w.state = copy(STATE_INIT);

    preserve.forEach((value, key) => {
      // @ts-ignore
      w.state[key] = value;
    });

    const r: (keyof StoragesResults)[] = ['chats', 'dialogs', 'users'];
    for(const key of r) {
      resetStorages.set(key, []);
    }

    w.replace(w.state);
  };

  return {
    ...w,
    get state() {
      return w.state;
    },
    set state(_state) {
      w.state = _state;
    },
    resetStorages,
    reset: resetState
  };
}

function CommonStateWriter(log: ReturnType<typeof logger>) {
  const w = AnyStateWriter<StateCommon>(log, COMMON_KEYS, COMMON_STATE_INIT);
  return w;
}

const STATE_STEPS = {
  REFRESH: (writer: ReturnType<typeof StateWriter>) => {
    const time = Date.now();
    if((writer.state.stateCreatedTime + REFRESH_EVERY) < time) {
      if(DEBUG) {
        writer.log('will refresh state', writer.state.stateCreatedTime, time);
      }

      REFRESH_KEYS.forEach((key) => {
        writer.push(key, copy(STATE_INIT[key]));
      });
    }
  },
  VALIDATE: <T>(writer: ReturnType<typeof AnyStateWriter<T>>, init: T) => {
    const SKIP_VALIDATING_PATHS: Set<string> = new Set([
      'settings.themes'
    ]);
    validateInitObject(init, writer.state, (missingKey) => {
      writer.push(missingKey as keyof typeof init, writer.state[missingKey as keyof typeof init]);
    }, undefined, SKIP_VALIDATING_PATHS);
  },
  VERSION: (writer: ReturnType<typeof StateWriter>) => {
    let newVersion: string, oldVersion: string;
    if(writer.state.version !== STATE_VERSION || writer.state.build !== BUILD/*  || true */) {
      if(writer.state.build < 526) { // * drop all previous migrations
        writer.reset();
      } else if(writer.state.build < 562) { // * drop filtersArr
        writer.push('filtersArr', copy(STATE_INIT.filtersArr));
      }

      if(compareVersion(writer.state.version, STATE_VERSION) !== 0) {
        newVersion = STATE_VERSION;
        oldVersion = writer.state.version;
      }

      writer.push('appConfig', copy(STATE_INIT.appConfig));
      writer.push('version', STATE_VERSION);
      writer.push('build', BUILD);
    }

    return {newVersion, oldVersion};
  },
  CHANGED_AUTH: async(writer: ReturnType<typeof StateWriter>) => {
    const [authKeyFingerprint, baseDcAuthKey] = await Promise.all([
      sessionStorage.get('auth_key_fingerprint'),
      sessionStorage.get(`dc${App.baseDcId}_auth_key`)
    ]);

    if(!baseDcAuthKey) {
      return;
    }

    const _authKeyFingerprint = baseDcAuthKey.slice(0, 8);
    if(!authKeyFingerprint) { // * migration, preserve settings
      writer.reset(/* {preserveCommonKeys: ['settings']} */);
    } else if(authKeyFingerprint !== _authKeyFingerprint) {
      writer.reset();
    }

    if(authKeyFingerprint !== _authKeyFingerprint) {
      await sessionStorage.set({
        auth_key_fingerprint: _authKeyFingerprint
      });
    }
  }
  // STATE_ID: async(writer: ReturnType<typeof StateWriter>) => {
  //   const stateId = await sessionStorage.get('state_id');
  //   if(writer.state.stateId !== stateId) {
  //     if(stateId !== undefined) {
  //       writer.reset([]);
  //     }

  //     await sessionStorage.set({
  //       state_id: writer.state.stateId
  //     });
  //   }
  // }
};

async function loadStateForAccount(accountNumber: ActiveAccountNumber): Promise<LoadStateResult> {
  const log = logger(`STATE-LOADER-ACCOUNT-${accountNumber}`);
  const stateStorage = new StateStorage(accountNumber);

  const [accountData, ...arr] = await Promise.all([
    AccountController.get(accountNumber),
    ...COMMON_KEYS.map((key) => commonStateStorage.get(key)),
    ...ALL_KEYS.map((key) => stateStorage.get(key))
  ]);

  const commonWriter = CommonStateWriter(log);
  commonWriter.readFromArray(arr.splice(0, COMMON_KEYS.length));

  const writer = StateWriter(log);
  writer.readFromArray(arr);

  if(accountData?.userId) {
    writer.state.authState = {_: 'authStateSignedIn'};
  }

  // await STATE_STEPS.STATE_ID(writer);
  if(accountNumber === 1) await STATE_STEPS.CHANGED_AUTH(writer);
  STATE_STEPS.REFRESH(writer);
  STATE_STEPS.VALIDATE(writer, STATE_INIT);
  STATE_STEPS.VALIDATE(commonWriter, COMMON_STATE_INIT);
  const {newVersion, oldVersion} = STATE_STEPS.VERSION(writer);

  return {
    state: writer.state,
    pushedKeys: writer.pushedKeys,
    newVersion,
    oldVersion,
    resetStorages: writer.resetStorages,
    common: commonWriter.state,
    userId: accountData?.userId
  };
}

async function loadOldState(): Promise<LoadStateResult> {
  const log = logger('STATE-LOADER');
  const stateStorage = new StateStorage('old');

  const totalPerf = performance.now();
  const recordPromise = recordPromiseBound(log);

  const migrateToStateKeys = [
    'playbackParams',
    'chatContextMenuHintWasShown',
    'seenTooltips',
    'translations'
  ];
  const commonKeys = migrateToStateKeys.concat(COMMON_KEYS);

  const arr = await Promise.all([
    ...commonKeys.map((key) => (stateStorage as typeof commonStateStorage).get(key as any)),
    ...ALL_KEYS.map((key) => recordPromise(stateStorage.get(key), 'state ' + key)),
    (stateStorage as typeof commonStateStorage).get('langPack'),
    recordPromise(sessionStorage.get('user_auth'), 'auth')
  ]);

  log.warn('promises', performance.now() - totalPerf);

  const commonWriter = CommonStateWriter(log);
  const migrateToStateSettingsValues = arr.splice(0, migrateToStateKeys.length);
  const settingsKeyIndex = COMMON_KEYS.indexOf('settings');
  if(isObject(arr[settingsKeyIndex])) { // * migrate values to settings
    migrateToStateSettingsValues.forEach((value, i) => {
      arr[settingsKeyIndex][migrateToStateKeys[i]] = value;
    });
  }
  commonWriter.readFromArray(arr.splice(0, COMMON_KEYS.length));

  const writer = StateWriter(log);
  writer.readFromArray(arr.splice(0, ALL_KEYS.length));

  const langPack = arr.shift();
  const auth = arr.shift() as UserAuth | number;
  if(auth) {
    // ! Warning ! DON'T delete this
    writer.state.authState = {_: 'authStateSignedIn'};
  }

  // await STATE_STEPS.STATE_ID(writer);
  await STATE_STEPS.CHANGED_AUTH(writer);
  STATE_STEPS.REFRESH(writer);
  STATE_STEPS.VALIDATE(writer, STATE_INIT);
  STATE_STEPS.VALIDATE(commonWriter, COMMON_STATE_INIT);
  const {newVersion, oldVersion} = STATE_STEPS.VERSION(writer);

  if(DEBUG) {
    log('state res', writer.state, copy(writer.state));
  }

  log.warn('total', performance.now() - totalPerf);

  // * set to pushed keys so it'll migrate to new state
  for(const key in writer.state) {
    writer.push(key as keyof State, writer.state[key as keyof State]);
  }

  // * migrate langPack
  if(langPack) {
    await commonStateStorage.set({langPack});
  }

  return {
    state: writer.state,
    pushedKeys: writer.pushedKeys,
    newVersion,
    oldVersion,
    resetStorages: writer.resetStorages,
    common: commonWriter.state,
    userId: typeof(auth) === 'number' ? auth : (auth?.id ? +auth.id : undefined)
  };
}

async function moveAccessKeysToMultiAccountFormat() {
  const data: Partial<AccountSessionData> = {};

  const resetKeysPromise = (async() => {
    const callbacks: (() => Promise<any>)[] = [];
    for(let i = 1; i <= 5; i++) {
      const authKeyKey = `dc${i as TrueDcId}_auth_key` as const;
      const serverSaltKey = `dc${i as TrueDcId}_server_salt` as const;

      [data[authKeyKey], data[serverSaltKey]] = await Promise.all([
        sessionStorage.get(authKeyKey),
        sessionStorage.get(serverSaltKey)
      ]);

      callbacks.push(() => {
        return Promise.all([
          sessionStorage.delete(authKeyKey),
          sessionStorage.delete(serverSaltKey)
        ]);
      });
    }

    return () => {
      return Promise.all(callbacks.map((cb) => cb()));
    };
  })();

  const [userAuth, fingerprint, resetKeys] = await Promise.all([
    sessionStorage.get(`user_auth`),
    sessionStorage.get(`auth_key_fingerprint`),
    resetKeysPromise
  ]);

  // ! not clearing old keys for legacy
  // * clear old keys
  // await Promise.all([
  //   sessionStorage.delete('user_auth'),
  //   sessionStorage.delete('auth_key_fingerprint'),
  //   resetKeys()
  // ]);

  data['auth_key_fingerprint'] = fingerprint;
  data['userId'] = typeof(userAuth) === 'string' || typeof(userAuth) === 'number' ? +userAuth : (userAuth?.id ? +userAuth.id : undefined);

  await AccountController.update(1, data, true);
}

async function moveStoragesToMultiAccountFormat() {
  const storages = createStorages(undefined);
  const storagesNew = createStorages(1);
  const [users, chats, dialogs] = await Promise.all([
    storages.users.getAll(),
    storages.chats.getAll(),
    storages.dialogs.getAll()
  ]);

  const toObject = (arr: any[], prop: string) => {
    return arr.reduce((acc, item) => {
      acc[item[prop]] = item;
      return acc;
    }, {});
  };

  await Promise.all([
    storagesNew.users.set(toObject(users, 'id')),
    storagesNew.chats.set(toObject(chats, 'id')),
    storagesNew.dialogs.set(toObject(dialogs, 'peerId'))
  ]);
}

async function checkIfHasMultiAccount() {
  return !!(await AccountController.get(1));
}

function deleteOldDatabase() {
  return IDB.deleteDatabaseByName(getOldDatabaseState().name);
}

async function applyBuildVersionToStorage() {
  const sessionBuild = await sessionStorage.get('k_build');
  if(sessionBuild !== BUILD && (!sessionBuild || sessionBuild < BUILD)) {
    await sessionStorage.set({k_build: BUILD});
  }
}

async function loadStateForAllAccounts() {
  if(TEST_MULTI_MIGRATION) {
    // * clear all storages to test migration
    await Promise.all([1, 2, 3, 4].map(async(i) => {
      const storages = createStorages(i as ActiveAccountNumber);
      for(const key in storages) {
        await storages[key as keyof typeof storages].clear();
      }
      await new StateStorage(i as ActiveAccountNumber).clear();
    }));
    await commonStateStorage.clear();
  }

  const perf = performance.now();
  const hasMultiAccount = await checkIfHasMultiAccount() && !TEST_MULTI_MIGRATION;

  // await pause(15000);

  let stateForFirstAccount: LoadStateResult;

  const restPromise = Promise.all([
    loadStateForAccount(2),
    loadStateForAccount(3),
    loadStateForAccount(4)
  ]);

  if(!hasMultiAccount) {
    stateForFirstAccount = await loadOldState();
    await Promise.all([
      moveAccessKeysToMultiAccountFormat(),
      moveStoragesToMultiAccountFormat()
    ]);
    stateForFirstAccount.refetchStorages = true;

    if(!TEST_MULTI_MIGRATION) {
      deleteOldDatabase(); // * don't wait for the result
    }
  } else {
    stateForFirstAccount = await loadStateForAccount(1);
  }

  applyBuildVersionToStorage();

  const [...rest] = await restPromise;

  if(DEBUG) {
    console.log('loadStateForAllAccounts time', performance.now() - perf);
  }

  return {
    1: stateForFirstAccount,
    2: rest[0],
    3: rest[1],
    4: rest[2]
  };
}

let promise: ReturnType<typeof loadStateForAllAccounts>;
export default function loadStateForAllAccountsOnce() {
  return promise ??= loadStateForAllAccounts();
}
