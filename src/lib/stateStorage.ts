/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { ChatSavedPosition } from './appManagers/appImManager';
import type { State } from './appManagers/appStateManager';
import type { AppDraftsManager } from './appManagers/appDraftsManager';
import { MOUNT_CLASS_TO } from '../config/debug';
import { LangPackDifference } from '../layer';
import AppStorage from './storage';
import DATABASE_STATE from '../config/databases/state';

const stateStorage = new AppStorage<{
  chatPositions: {
    [peerId_threadId: string]: ChatSavedPosition
  },
  langPack: LangPackDifference,
  drafts: AppDraftsManager['drafts'],
  user_auth: any, // support old webk format
} & State, typeof DATABASE_STATE>(DATABASE_STATE, 'session');
MOUNT_CLASS_TO.stateStorage = stateStorage;
export default stateStorage;
