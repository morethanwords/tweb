/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {DcId} from '../types';
import {MOUNT_CLASS_TO} from '../config/debug';

import type {AppInstance} from './mtproto/singleInstance';
import type {UserAuth} from './mtproto/mtproto_config';
import LocalStorageController from './localStorage';
import {AccountSessionData} from './accounts/types';


type StorageValues = {
  state_id: number,

  account1: AccountSessionData,
  account2: AccountSessionData,
  account3: AccountSessionData,
  account4: AccountSessionData,

  encryption_key?: string, // Will be quickly set and removed when switching between accounts

  server_time_offset: number,
  xt_instance: AppInstance,
  kz_version: 'K' | 'Z',
  tgme_sync: {
    canRedirect: boolean,
    ts: number
  },
  k_build: number,

  // auth options
  number_of_accounts?: number, // When the storage is encrypted
  previous_account?: number, // only for back button when logging in to another account
  current_account?: number, // 1 if not set
  should_animate_auth?: number,
  should_animate_main?: number
}

/**
 * @deprecated use these keys only for going to and from 'A' (a.k.a. 'Z') version
 */
type DeprecatedStorageValues = {
  dc: DcId,
  user_auth: UserAuth,

  dc1_auth_key: string,
  dc2_auth_key: string,
  dc3_auth_key: string,
  dc4_auth_key: string,
  dc5_auth_key: string,

  dc1_server_salt: string,
  dc2_server_salt: string,
  dc3_server_salt: string,
  dc4_server_salt: string,
  dc5_server_salt: string,

  dc1_hash: string, // WebA only
  dc2_hash: string, // WebA only
  dc3_hash: string, // WebA only
  dc4_hash: string, // WebA only
  dc5_hash: string, // WebA only

  auth_key_fingerprint: string // = dc${App.baseDcId}_auth_key.slice(0, 8)
};

const sessionStorage = new LocalStorageController<StorageValues & DeprecatedStorageValues>([
  'account1',
  'account2',
  'account3',
  'account4',
  'auth_key_fingerprint',
  'user_auth',
  'dc'
]);

MOUNT_CLASS_TO.appStorage = sessionStorage;
export default sessionStorage;
