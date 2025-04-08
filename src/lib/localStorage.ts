/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import {CommonDatabase, getCommonDatabaseState} from '../config/databases/state';
import Modes from '../config/modes';
import deferredPromise, {CancellablePromise} from '../helpers/cancellablePromise';
import {IS_WORKER} from '../helpers/context';
import makeError from '../helpers/makeError';
import {StringKey, WorkerTaskTemplate} from '../types';
import EncryptedStorageLayer from './encryptedStorageLayer';
import {logger} from './logger';
import MTProtoMessagePort from './mtproto/mtprotoMessagePort';
import DeferredIsUsingPasscode from './passcode/deferredIsUsingPasscode';


class LocalStorage<Storage extends Record<string, any>> {
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
    type: 'set' | 'get' | 'delete' | 'clear' | 'toggleStorage',
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

  private encryptableKeys: Set<keyof Storage>;
  private encryptionDeferred: CancellablePromise<void>;

  constructor(encryptableKeys: (keyof Storage)[] = []) {
    LocalStorageController.STORAGES.push(this);
    this.encryptableKeys = new Set(encryptableKeys);

    if(!IS_WORKER) {
      this.storage = new LocalStorage();
    }
  }

  private async getEncryptedStorage() {
    if(this.encryptedStorage) return this.encryptedStorage;

    this.encryptedStorage = EncryptedStorageLayer.getInstance(
      LocalStorageController.ENCRYPTION_DB, LocalStorageController.ENCRYPTION_DB_STORE_NAME
    );

    this.encryptedStorage.loadEncrypted();

    return this.encryptedStorage;
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
      const port = MTProtoMessagePort.getInstance<true>();
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
