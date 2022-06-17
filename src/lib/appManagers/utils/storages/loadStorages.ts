/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type{ Chat } from "../../../../layer";
import type{ Dialog } from "../../appMessagesManager";
import type{ User } from "../../appUsersManager";
import type { StoragesStorages } from "./createStorages";
import { recordPromiseBound } from "../../../../helpers/recordPromise";
import { Awaited } from "../../../../types";
import { logger } from "../../../logger";
import RESET_STORAGES_PROMISE from "./resetStoragesPromise";

export type StoragesResults = Awaited<ReturnType<typeof loadStoragesInner>>;

async function loadStoragesInner(storages: StoragesStorages) {
  const recordPromise = recordPromiseBound(logger('STORAGES-LOADER'));
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

  const resetStorages = await RESET_STORAGES_PROMISE;
  if(resetStorages.size) {
    for(const key of resetStorages) {
      storagesResults[key].length = 0;
    }

    resetStorages.clear();
  }

  return storagesResults;
}

let promise: ReturnType<typeof loadStoragesInner>;
export default function loadStorages(storages: StoragesStorages) {
  return promise ??= loadStoragesInner(storages);
}
