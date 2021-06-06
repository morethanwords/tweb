/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { AppInstance } from './mtproto/singleInstance';
import type { UserAuth } from './mtproto/mtproto_config';
import { MOUNT_CLASS_TO } from '../config/debug';
import AppStorage from './storage';
import DATABASE_SESSION from '../config/databases/session';

const sessionStorage = new AppStorage<{
  dc: number,
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
  server_time_offset: number,
  xt_instance: AppInstance
}, typeof DATABASE_SESSION>(DATABASE_SESSION, 'session');
MOUNT_CLASS_TO.appStorage = sessionStorage;
export default sessionStorage;
