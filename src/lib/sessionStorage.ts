/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {AppInstance} from './mtproto/singleInstance';
import type {UserAuth} from './mtproto/mtproto_config';
import type {DcId} from '../types';
import {MOUNT_CLASS_TO} from '../config/debug';
import LocalStorageController from './localStorage';
import {AccountSessionData} from './accounts/types';

const sessionStorage = new LocalStorageController<{
  state_id: number,

  account1: AccountSessionData,
  account2: AccountSessionData,
  account3: AccountSessionData,
  account4: AccountSessionData,

  // <-- DEPRECATED, use only for going to and from 'A' (a.k.a. 'Z') version
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
  auth_key_fingerprint: string, // = dc${App.baseDcId}_auth_key.slice(0, 8)
  // -->

  server_time_offset: number,
  xt_instance: AppInstance,
  kz_version: 'K' | 'Z',
  tgme_sync: {
    canRedirect: boolean,
    ts: number
  },
  k_build: number
}>(/* ['kz_version'] */);
MOUNT_CLASS_TO.appStorage = sessionStorage;
export default sessionStorage;
