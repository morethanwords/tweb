/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {Database} from '.';
import {ActiveAccountNumber} from '../../lib/accounts/types';
import {MOUNT_CLASS_TO} from '../debug';

export type AccountDatabase = Database<'session' | 'stickerSets' | 'users' | 'chats' | 'messages' | 'dialogs'>;
export type CommonDatabase = Database<'session'>;

export const getOldDatabaseState = (): AccountDatabase => ({
  name: `tweb`,
  version: 7,
  stores: [
    {
      name: 'session'
    },
    {
      name: 'stickerSets'
    },
    {
      name: 'users'
    },
    {
      name: 'chats'
    },
    {
      name: 'dialogs'
    },
    {
      name: 'messages'
    }
  ]
});

export const getCommonDatabaseState = (): Database<'session'> => ({
  name: `tweb-common`,
  version: 7,
  stores: [
    {
      name: 'session'
    }
  ]
});

export const getDatabaseState = (
  accountNumber: ActiveAccountNumber
): Database<'session' | 'stickerSets' | 'users' | 'chats' | 'messages' | 'dialogs'> => ({
  name: `tweb-account-${accountNumber}`,
  version: 8,
  stores: [
    {
      name: 'session',
      encryptedName: 'session__encrypted'
    },
    {
      name: 'stickerSets',
      encryptedName: 'stickerSets__encrypted'
    },
    {
      name: 'users',
      encryptedName: 'users__encrypted'
    },
    {
      name: 'chats',
      encryptedName: 'chats__encrypted'
    },
    {
      name: 'dialogs',
      encryptedName: 'dialogs__encrypted'
    },
    {
      name: 'messages',
      encryptedName: 'messages__encrypted'
    }
  ]
});

MOUNT_CLASS_TO.getDatabaseState = getDatabaseState;
