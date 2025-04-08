/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {Chat} from '../../../../layer';
import type {Dialog} from '../../appMessagesManager';
import type {User} from '../../appUsersManager';
import type {StoragesStorages} from './createStorages';
import type {ResetStoragesPromise} from '../../appStateManager';
import type AppStorage from '../../../storage';
import {recordPromiseBound} from '../../../../helpers/recordPromise';
import {Awaited} from '../../../../types';
import {logger} from '../../../logger';
import noop from '../../../../helpers/noop';

export type StoragesResults = Awaited<ReturnType<typeof loadStorages>>;

/**
 * Will start loading storages before getting the state from the main thread \
 * In case of migration, will refetch the storages, because storages were modified
 */
export default async function loadStorages(accountNumber: number, storages: StoragesStorages, resetStoragesPromise: ResetStoragesPromise, refetching?: boolean) {
  const recordPromise = recordPromiseBound(logger('STORAGES-LOADER-' + accountNumber));
  const storagesKeys = Object.keys(storages) as Array<keyof StoragesStorages>;
  const storagesPromises: Promise<any>[] = storagesKeys.map((key) => {
    const promise = storages[key].getAll();
    return recordPromise(promise, 'storage ' + (key as any as string));
  });

  const storagesResults: {
    users: User[],
    chats: Chat[],
    dialogs: Dialog[]
  } = {} as any;
  const arr = await Promise.all(storagesPromises);
  for(let i = 0, length = storagesKeys.length; i < length; ++i) {
    storagesResults[storagesKeys[i]] = arr[i] as any;
  }

  arr.splice(0, storagesKeys.length);

  // * will reset storages before setting the new state
  const {storages: resetStorages, refetch, callback} = await resetStoragesPromise;
  if(refetch && !refetching) {
    return loadStorages(accountNumber, storages, resetStoragesPromise, true);
  }

  if(resetStorages.size) {
    const preserved: Record<keyof StoragesResults, Promise<any[]>> = {} as any;
    for(const [key, preserve] of resetStorages) {
      const promises = preserve.map((id) => (storages[key] as AppStorage<any, any>).get('' + id)); // important: need string here, not a number
      preserved[key] = Promise.all(promises);
    }

    await Promise.all(Object.values(preserved)).catch(noop);

    const clearPromises: Promise<any>[] = [];
    for(const [key] of resetStorages) {
      storagesResults[key].length = 0;
      clearPromises.push(storages[key].clear());
    }

    await Promise.all(clearPromises).catch(noop);

    const preservePromises: Promise<any>[] = [];
    for(const [key, preserve] of resetStorages) {
      const preservedValues = await preserved[key];
      for(let i = 0; i < preserve.length; ++i) {
        const value = preservedValues[i];
        storagesResults[key].push(value);
        preservePromises.push((storages[key] as AppStorage<any, any>).set({[preserve[i]]: value}));
      }
    }

    await Promise.all(preservePromises).catch(noop);

    resetStorages.clear();
  }

  await callback();

  return storagesResults;
}

// let promise: ReturnType<typeof loadStoragesInner>;
// export default function loadStorages(storages: StoragesStorages, resetStoragesPromise: ResetStoragesPromise) {
//   return promise ??= loadStoragesInner(storages, resetStoragesPromise);
// }
