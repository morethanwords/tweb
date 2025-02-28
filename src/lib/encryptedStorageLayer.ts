import {Database} from '../config/databases';
import toArray from '../helpers/array/toArray';
import convertToUint8Array from '../helpers/bytes/convertToUint8Array';
import asyncThrottle from '../helpers/schedulers/asyncThrottle';

import IDBStorage from './files/idb';


export interface StorageLayer {
  save: (entryName: string | string[], value: any | any[]) => Promise<unknown>;
  get: <T>(entryNames: string[]) => Promise<T[]>;
  getAllEntries: () => Promise<IDBStorage.Entries>;
  getAll: <T>() => Promise<T[]>;
  delete: (entryName: string | string[]) => Promise<void>;
  clear: () => Promise<void>;
  close: () => void;
};

export default class EncryptedStorageLayer<T extends Database<any>> implements StorageLayer {
  private static STORAGE_KEY = 'data';
  private static STORAGE_THROTTLE_TIME_MS = 250;

  /**
   * Sync loading data between the same stores
   * Note that the object reference of data will be also synced across instances with same stores
   */
  private static loadingDataMap = new Map<string, Promise<any>>();

  private storage: IDBStorage<T>;
  private data: Record<string, any>;

  constructor(db: T, storeName: T['stores'][number]['name']) {
    this.storage = new IDBStorage(db, storeName + '__encrypted');

    const loadingDataKey = EncryptedStorageLayer.getLoadingDataKey(db.name, storeName);
    const promise = EncryptedStorageLayer.loadingDataMap.get(loadingDataKey);
    if(promise) {
      promise.then((data) => {
        this.data = data;
      }); // instant for already loaded data, we're not clearing anything
    } else {
      EncryptedStorageLayer.loadingDataMap.set(loadingDataKey, this.loadFromIDB());
    }
  }

  private static getLoadingDataKey(dbName: string, storeName: string) {
    return `${dbName}**${storeName}`;
  }

  private static async encrypt(data: any): Promise<Uint8Array> {
    // Implement encryption logic here
    return convertToUint8Array(JSON.stringify(data));
  }

  private static async decrypt(data: Uint8Array): Promise<any> {
    // Implement decryption logic here
    return JSON.parse(data.toString());
  }

  private saveToIDB = asyncThrottle(async() => {
    // TODO: Check performance;
    const encryptedData = await EncryptedStorageLayer.encrypt(this.data);
    await this.storage.save(EncryptedStorageLayer.STORAGE_KEY, encryptedData);
  }, EncryptedStorageLayer.STORAGE_THROTTLE_TIME_MS);

  private async loadFromIDB() {
    const storageData = await this.storage.get(EncryptedStorageLayer.STORAGE_KEY);
    // TODO: Make sure this is an object, e.g. when freshly creating the db
    this.data = storageData;
  }

  async save(entryName: string | string[], value: any | any[]): Promise<void> {
    const names = toArray(entryName);
    const values = toArray(value);

    names.forEach((name, idx) => {
      this.data[name] = values[idx];
    });

    this.saveToIDB();
  }

  async get<T>(entryNames: string[]): Promise<T[]> {
    return entryNames.map((entryName) => this.data[entryName]);
  }

  async getAllEntries(): Promise<IDBStorage.Entries> {
    return Object.entries(this.data);
  }

  async getAll<T>(): Promise<T[]> {
    return Object.values(this.data);
  }

  async delete(entryName: string | string[]): Promise<void> {
    const names = toArray(entryName);
    names.forEach(name => {
      delete this.data[name];
    });

    this.saveToIDB();
  }

  async clear(): Promise<void> {
    this.data = {};
    this.saveToIDB();
  }

  close(): void {
    this.storage.close();
  }
}
