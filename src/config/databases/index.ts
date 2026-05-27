import {IDBStore} from '@lib/files/idb';

export type DatabaseStore<StoreName extends string> = IDBStore & {
  name: StoreName,
  encryptedName?: `${StoreName}__encrypted`
};

export type Database<StoreName extends string> = {
  name: string,
  version: number,
  stores: DatabaseStore<StoreName>[]
};
