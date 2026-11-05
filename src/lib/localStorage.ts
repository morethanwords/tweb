/*
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import {CommonDatabase, getCommonDatabaseState} from '@config/databases/state';
import Modes from '@config/modes';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import {IS_WORKER} from '@helpers/context';
import makeError from '@helpers/makeError';
import deepEqual from '@helpers/object/deepEqual';
import {StringKey, WorkerTaskTemplate} from '@types';
import EncryptedStorageLayer from '@lib/encryptedStorageLayer';
import {logger} from '@lib/logger';
import MTProtoMessagePort from '@lib/mainWorker/mainMessagePort';
import DeferredIsUsingPasscode from '@lib/passcode/deferredIsUsingPasscode';


export class LocalStorage<Storage extends Record<string, any>> {
  private prefix = '';
  private cache: Partial<Storage> = {};
  private useStorage = true;

  constructor() {
    if(Modes.test) {
      this.prefix = 't_';
    }
  }

  public get<T extends keyof Storage>(key: T, useCache = true): Storage[T] {
    if(this.cache.hasOwnProperty(key) && useCache) {
      return this.cache[key];
    } else if(this.useStorage) {
      let value: Storage[T];
      try {
        value = localStorage.getItem(this.prefix + (key as string)) as any;
      } catch(err) {
        this.useStorage = false;
        throw makeError('STORAGE_OFFLINE');
      }

      if(value !== null) {
        try {
          value = JSON.parse(value);
        } catch(err) {
          // console.error(err);
        }
      } else {
        value = undefined;
      }

      return value;
    } else {
      throw makeError('STORAGE_OFFLINE');
    }
  }

  public set(obj: Partial<Storage>, onlyLocal = false) {
    let lastError: any;
    for(const key in obj) {
      if(obj.hasOwnProperty(key)) {
        const value = obj[key];
        this.cache[key] = value;

        if(!onlyLocal) {
          try {
            if(!this.useStorage) {
              throw makeError('STORAGE_OFFLINE');
            }

            const stringified = JSON.stringify(value);
            localStorage.setItem(this.prefix + key, stringified);
          } catch(err) {
            this.useStorage = false;
            lastError = err;
          }
        }
      }
    }

    if(lastError) {
      throw lastError;
    }
  }

  public delete(key: keyof Storage, saveLocal = false) {
    // ! it is needed here
    key = '' + (key as string);

    if(!saveLocal) {
      delete this.cache[key];
    }

    // if(this.useStorage) {
    try {
      localStorage.removeItem(this.prefix + (key as string));
    } catch(err) {

    }
    // }
  }

  /**
   * Removes the value only while it is still `value`, read and removed at once: another client (Web A) may have
   * written the key since it was last read
   */
  public deleteIfEqual(key: keyof Storage, value: Storage[keyof Storage]) {
    if(deepEqual(this.get(key, false), value)) {
      this.delete(key);
    }
  }

  public clear(preserveKeys: (keyof Storage)[] = []) {
    try {
      const obj: Partial<Storage> = {};
      if(preserveKeys?.length) {
        preserveKeys.forEach((key) => {
          const value = this.get(key);
          if(value !== undefined) {
            obj[key] = value;
          }
        });
      }

      localStorage.clear();

      if(preserveKeys?.length) {
        this.set(obj);
      }
    } catch(err) {

    }
  }

  public toggleStorage(enabled: boolean, clearWrite: boolean) {
    this.useStorage = enabled;

    if(!clearWrite) {
      return;
    }

    if(enabled) {
      return this.set(this.cache);
    }
  }
}

export interface LocalStorageProxyTask extends WorkerTaskTemplate {
  type: 'localStorageProxy',
  payload: {
    type: 'set' | 'get' | 'delete' | 'deleteIfEqual' | 'clear' | 'toggleStorage',
    args: any[]
  }
};

type EncryptedLocalStorageProxyTaskType = 'save' | 'get' | 'delete';

export interface LocalStorageEncryptedProxyTaskPayload {
  type: EncryptedLocalStorageProxyTaskType;
  args: Parameters<EncryptedStorageLayer<any>[EncryptedLocalStorageProxyTaskType]>;
};

export default class LocalStorageController<Storage extends Record<string, any>> {
  private static STORAGES: LocalStorageController<any>[] = [];

  private static ENCRYPTION_DB = getCommonDatabaseState();
  private static ENCRYPTION_DB_STORE_NAME = 'localStorage__encrypted' as const;

  private log = logger('[local-storage-controller]');

  private storage: LocalStorage<Storage>;
  private encryptedStorage: EncryptedStorageLayer<CommonDatabase>;
  private encryptedStoragePromise: Promise<EncryptedStorageLayer<CommonDatabase>>;

  private encryptableKeys: Set<keyof Storage>;
  private encryptionDeferred: CancellablePromise<void>;

  constructor(encryptableKeys: (keyof Storage)[] = []) {
    LocalStorageController.STORAGES.push(this);
    this.encryptableKeys = new Set(encryptableKeys);

    if(!IS_WORKER) {
      this.storage = new LocalStorage();
    }
  }

  private getEncryptedStorage() {
    return this.encryptedStoragePromise ??= this.openEncryptedStorage();
  }

  private async openEncryptedStorage() {
    // * made by turning the passcode on in this worker, with everything that was in the clear
    if(this.encryptedStorage) return this.encryptedStorage;

    const encryptedStorage = this.encryptedStorage = EncryptedStorageLayer.getInstance(
      LocalStorageController.ENCRYPTION_DB, LocalStorageController.ENCRYPTION_DB_STORE_NAME
    );

    await encryptedStorage.ensureLoaded();
    await this.encryptLeftovers(encryptedStorage);

    return encryptedStorage;
  }

  /**
   * Turning the passcode on moves the encryptable values out of localStorage into the encrypted store
   * (`encryptEncryptable`). Stopped half way - the tab closed, the worker failed - it left them in the clear, where
   * nothing reads them with the passcode on: all of them, when it stopped before the encrypted store was written, or
   * those it had yet to delete. The first open with the passcode on finishes it: values nothing was encrypted from yet
   * are folded in and written first, then whatever the encrypted store keeps as it is goes from localStorage. A value
   * that differs from the encrypted one - by then, not only when it was read - is not this client's (Web A keeps its
   * accounts in the same keys) and stays
   */
  private async encryptLeftovers(encryptedStorage: EncryptedStorageLayer<CommonDatabase>) {
    // * best effort, like AppStorage's: the store has to open whatever happens here, the leftovers get another try
    try {
      const keys = Array.from(this.encryptableKeys) as StringKey<keyof Storage>[];
      const values = await Promise.all(keys.map((key) => this.localStorageProxy<unknown>('get', key, false)));
      const leftovers = keys
      .map((key, idx) => [key, values[idx]] as const)
      .filter(([, value]) => value !== undefined);
      if(!leftovers.length) return;

      this.log.warn('found unencrypted values, encrypting them', leftovers.map(([key]) => key));

      // * nothing was ever written there, which an empty store that could not be read is not: it is never overwritten
      if(!(await encryptedStorage.hasStored())) {
        await encryptedStorage.mergeDecrypted(Object.fromEntries(leftovers));
      }

      const encrypted = await encryptedStorage.get<Storage[keyof Storage]>(leftovers.map(([key]) => key));
      await Promise.all(leftovers.map(([key], idx) => {
        return encrypted[idx] !== undefined && this.deleteIfEqual(key, encrypted[idx]);
      }));
    } catch(err) {
      this.log.error('encrypt leftovers error', err);
    }
  }

  private async shouldUseEncryptableStorage(key: keyof Storage) {
    const isEncryptable = this.encryptableKeys.has(key);
    if(isEncryptable === false) return false;

    return DeferredIsUsingPasscode.isUsingPasscode();
  }

  public async localStorageProxy<T>(type: LocalStorageProxyTask['payload']['type'], ...args: LocalStorageProxyTask['payload']['args']): Promise<T> {
    if(IS_WORKER) {
      const port = MTProtoMessagePort.getInstance<false>();
      return port.invoke('localStorageProxy', {type, args});
    }

    args = Array.prototype.slice.call(args);

    // @ts-ignore
    return this.storage[type].apply(this.storage, args as any);
  }

  public async encryptedStorageProxy<T extends EncryptedLocalStorageProxyTaskType>(
    type: T,
    ...args: Parameters<EncryptedStorageLayer<any>[T]>
  ): Promise<Awaited<ReturnType<EncryptedStorageLayer<any>[T]>>> {
    if(!IS_WORKER) {
      const port = MTProtoMessagePort.getMasterInstance();
      return port.invoke('localStorageEncryptedProxy', {type, args});
    }

    const encryptedStorage = await this.getEncryptedStorage();
    // @ts-ignore
    return encryptedStorage[type](...args);
  }

  private async waitEncryptionToFinish() {
    if(this.encryptionDeferred) await this.encryptionDeferred;
  }


  public async get<Key extends keyof Storage>(key: StringKey<Key>, useCache?: boolean) {
    await this.waitEncryptionToFinish();

    if(await this.shouldUseEncryptableStorage(key)) {
      const result = await this.encryptedStorageProxy('get', [key]); // uses cache by default
      return result[0] as Storage[Key];
    }

    return this.localStorageProxy<Storage[Key]>('get', key, useCache);
  }

  public async set(obj: Partial<Storage>) {
    await this.waitEncryptionToFinish();

    obj = {...obj};

    const encryptableKeys = Object.keys(obj).filter(key => this.encryptableKeys.has(key));

    if(encryptableKeys.length && await this.shouldUseEncryptableStorage(encryptableKeys[0])) {
      const values = encryptableKeys.map((key) => obj[key]);
      await this.encryptedStorageProxy('save', encryptableKeys, values);
      encryptableKeys.forEach((key) => {
        delete obj[key];
      });
    }

    if(Object.keys(obj).length) {
      return this.localStorageProxy<void>('set', obj);
    }
  }

  public async delete(key: StringKey<keyof Storage>) {
    await this.waitEncryptionToFinish();

    if(await this.shouldUseEncryptableStorage(key)) {
      return this.encryptedStorageProxy('delete', key);
    }

    return this.localStorageProxy<void>('delete', key);
  }

  /**
   * Removes the value from localStorage only while it is still `value` (`LocalStorage.deleteIfEqual`): for the keys
   * another client (Web A) writes as well
   */
  public deleteIfEqual<Key extends keyof Storage>(key: StringKey<Key>, value: Storage[Key]) {
    return this.localStorageProxy<void>('deleteIfEqual', key, value);
  }

  public toggleStorage(enabled: boolean, clearWrite: boolean) {
    return this.localStorageProxy<void>('toggleStorage', enabled, clearWrite);
  }

  private warnAboutEncrypting(methodName: string) {
    if(IS_WORKER) return false;

    this.log.warn(`${methodName} should not be called in a window client, call it only in the MTProto worker`);
    return true;
  }

  public async encryptEncryptable() {
    if(this.warnAboutEncrypting('encryptEncryptable')) return;

    this.encryptionDeferred = deferredPromise();

    const encryptableKeys = Array.from(this.encryptableKeys.values());
    const values = await Promise.all(encryptableKeys.map((key) => this.localStorageProxy('get', key)));

    const filteredEntries = encryptableKeys
    /*                    */.map((key, idx) => [key, values[idx]])
    /*                    */.filter((entry) => entry[1]);

    const data = Object.fromEntries(filteredEntries);

    this.encryptedStorage = EncryptedStorageLayer.getInstance(
      LocalStorageController.ENCRYPTION_DB, LocalStorageController.ENCRYPTION_DB_STORE_NAME
    );
    await this.encryptedStorage.loadDecrypted(data);

    // Let window clients have the values in cache while we delete them, they might not have the values yet tho
    await Promise.all(filteredEntries.map(([key]) => this.localStorageProxy('set', key, /* onlyLocal = */true)));

    await Promise.all(filteredEntries.map(([key]) => this.localStorageProxy('delete', key)));

    this.encryptionDeferred?.resolve();
    this.encryptionDeferred = undefined;
  }

  /**
   * Reads the encrypted store into memory with the current key, to be awaited before that key is replaced
   */
  public async loadEncryptable() {
    if(this.warnAboutEncrypting('loadEncryptable')) return;

    const encryptedStorage = await this.getEncryptedStorage();
    await encryptedStorage.ensureLoaded();
  }

  public async reEncryptEncryptable() {
    if(this.warnAboutEncrypting('reEncryptEncryptable')) return;

    this.encryptionDeferred = deferredPromise();

    const encryptedStorage = await this.getEncryptedStorage();
    await encryptedStorage.reEncrypt();

    this.encryptionDeferred?.resolve();
    this.encryptionDeferred = undefined;
  }

  public async decryptEncryptable() {
    if(this.warnAboutEncrypting('decryptEncryptable')) return;

    this.encryptionDeferred = deferredPromise();

    const encryptedStorage = await this.getEncryptedStorage();

    const entries = await encryptedStorage.getAllEntries();
    const filteredEntries = entries.filter((entry) => this.encryptableKeys.has(entry[0] as any)); // just in case

    const data = Object.fromEntries(filteredEntries);

    await this.localStorageProxy('set', data);
    await encryptedStorage.clear();

    this.encryptionDeferred?.resolve();
    this.encryptionDeferred = undefined;
  }
}
