/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {Chat} from '../../../../layer';
import type {Dialog} from '../../appMessagesManager';
import type {User} from '../../appUsersManager';
import {AccountDatabase, getDatabaseState, getOldDatabaseState} from '../../../../config/databases/state';
import AppStorage from '../../../storage';
import {ActiveAccountNumber} from '../../../accounts/types';

export type StoragesStorages = {
  users: AppStorage<Record<UserId, User>, AccountDatabase>,
  chats: AppStorage<Record<ChatId, Chat>, AccountDatabase>,
  dialogs: AppStorage<Record<PeerId, Dialog>, AccountDatabase>
};

export default function createStorages(accountNumber: ActiveAccountNumber) {
  const names: (keyof StoragesStorages)[] = ['users', 'chats', 'dialogs'];
  const storages: StoragesStorages = {} as any;
  for(const name of names) {
    // @ts-ignore
    storages[name] = new AppStorage(accountNumber === undefined ? getOldDatabaseState() : getDatabaseState(accountNumber), name);
  }

  return storages;
}
