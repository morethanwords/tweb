import {Database} from '../config/databases';
import toArray from '../helpers/array/toArray';
import asyncThrottle from '../helpers/schedulers/asyncThrottle';

import cryptoMessagePort from './crypto/cryptoMessagePort';
import IDBStorage from './files/idb';
import {logger, Logger} from './logger';
import EncryptionPasscodeHashStore from './passcode/hashStore';


export interface StorageLayer {
  save: (entryName: string | string[], value: any | any[]) => Promise<unknown>;
  get: <T>(entryNames: string[]) => Promise<T[]>;
  getAllEntries: () => Promise<IDBStorage.Entries>;
  getAll: <T>() => Promise<T[]>;
  delete: (entryName: string | string[]) => Promise<void>;
  clear: () => Promise<void>;
};

type StoredData = Record<string, any>;

export default class EncryptedStorageLayer<T extends Database<any>> implements StorageLayer {
  private static STORAGE_KEY = 'data';
  private static STORAGE_THROTTLE_TIME_MS = 250;

  private static instances = new Map<string, EncryptedStorageLayer<Database<any>>>();

  private storage: IDBStorage<T>;
  private data: StoredData;

  private log: Logger;

  private loadingDataPromise: Promise<unknown>;

  private constructor(private db: T, private encryptedStoreName: T['stores'][number]['encryptedName']) {
    this.storage = new IDBStorage(db, encryptedStoreName);
    this.log = logger(`encrypted-storage-${encryptedStoreName}`)
  }

  public static getInstance<T extends Database<any>>(db: T, encryptedStoreName: T['stores'][number]['encryptedName']): EncryptedStorageLayer<T> {
    const key = this.getStorageKey(db.name, encryptedStoreName);
    if(this.instances.has(key)) return this.instances.get(key) as EncryptedStorageLayer<T>;

    const instance = new EncryptedStorageLayer(db, encryptedStoreName);
    this.instances.set(key, instance);
    return instance;
  }

  private static getStorageKey(dbName: string, storeName: string) {
    return `${dbName}**${storeName}`;
  }

  private static async encrypt(data: StoredData): Promise<Uint8Array> {
    const hash = await EncryptionPasscodeHashStore.getValue();
    const result = await cryptoMessagePort.invokeCryptoNew({
      method: 'aes-local-encrypt',
      args: [hash, JSON.stringify(data)]
    });

    return result;
  }

  private static async decrypt(data: Uint8Array): Promise<StoredData> {
    const hash = await EncryptionPasscodeHashStore.getValue();

    const result = await cryptoMessagePort.invokeCryptoNew({
      method: 'aes-local-decrypt',
      args: [hash, data],
      transfer: [data.buffer]
    });
    // console.timeEnd('loadEncrypted ' + this.db.name + this.encryptedStoreName);

    return JSON.parse(result);
  }

  public loadEncrypted() {
    this.loadingDataPromise = this.loadFromIDB();
    this.loadingDataPromise.then(() => {
      this.loadingDataPromise = undefined;
    });
    // const loadingDataKey = EncryptedStorageLayer.getStorageKey(this.db.name, this.storeName);
    // const promise = this.loadingDataPromise = EncryptedStorageLayer.loadingDataMap.get(loadingDataKey);
    // if(promise) {
    //   promise.then((data) => {
    //     this.data = data;
    //     this.loadingDataPromise = undefined;
    //   }); // instant for already loaded data, we're not clearing anything
    // } else {
    //   EncryptedStorageLayer.loadingDataMap.set(loadingDataKey, this.loadFromIDB());
    // }
  }

  public async loadDecrypted(data: StoredData) {
    this.log('loading decrypted', data);
    this.data = data;
    await this.saveToIDB();
  }

  private waitToLoad() {
    if(this.loadingDataPromise) return this.loadingDataPromise;
  }

  private saveToIDB = async() => {
    await this.waitToLoad();

    // TODO: Check performance;
    const encryptedData = await EncryptedStorageLayer.encrypt(this.data);
    await this.storage.save(EncryptedStorageLayer.STORAGE_KEY, encryptedData);
  };

  private saveToIDBThrottled = asyncThrottle(
    () => this.saveToIDB(),
    EncryptedStorageLayer.STORAGE_THROTTLE_TIME_MS
  );

  private async loadFromIDB() {
    try {
      const storageData = await this.storage.get(EncryptedStorageLayer.STORAGE_KEY);
      if(!(storageData instanceof Uint8Array)) throw new Error('Stored data in encrypted store is not a Uint8Array');

      const decrypted = await EncryptedStorageLayer.decrypt(storageData);
      this.data = decrypted;
    } catch(error) {
      this.log(error);
      this.data = {}; // Should not happen but anyway))
    }

    return this.data;
  }

  public async reEncrypt() {
    await this.saveToIDB();
  }

  public async save(entryName: string | string[], value: any | any[]): Promise<void> {
    await this.waitToLoad();

    const names = toArray(entryName);
    const values = toArray(value);

    names.forEach((name, idx) => {
      this.data[name] = values[idx];
    });

    this.saveToIDBThrottled();
  }

  public async get<T>(entryNames: string[]): Promise<T[]> {
    await this.waitToLoad();

    return entryNames.map((entryName) => this.data[entryName]);
  }

  public async getAllEntries(): Promise<IDBStorage.Entries> {
    await this.waitToLoad();

    return Object.entries(this.data);
  }

  public async getAll<T>(): Promise<T[]> {
    await this.waitToLoad();

    return Object.values(this.data);
  }

  public async delete(entryName: string | string[]): Promise<void> {
    await this.waitToLoad();

    const names = toArray(entryName);
    names.forEach(name => {
      delete this.data[name];
    });

    this.saveToIDBThrottled();
  }

  public async clear(): Promise<void> {
    await this.waitToLoad();

    this.data = {};
    await this.storage.clear();
  }
}
