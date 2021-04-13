/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { ChatSavedPosition } from './appManagers/appImManager';
import type { State } from './appManagers/appStateManager';
import { MOUNT_CLASS_TO } from '../config/debug';
import { LangPackDifference } from '../layer';
import AppStorage from './storage';

const sessionStorage = new AppStorage<{
  dc: number,
  user_auth: number,
  dc1_auth_key: any,
  dc2_auth_key: any,
  dc3_auth_key: any,
  dc4_auth_key: any,
  dc5_auth_key: any,
  max_seen_msg: number,
  server_time_offset: number,

  chatPositions: {
    [peerId_threadId: string]: ChatSavedPosition
  },
  langPack: LangPackDifference
} & State>({
  storeName: 'session'
});
MOUNT_CLASS_TO.appStorage = sessionStorage;
export default sessionStorage;
