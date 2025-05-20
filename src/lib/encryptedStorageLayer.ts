import {Database} from '../config/databases';
import DEBUG from '../config/debug';
import toArray from '../helpers/array/toArray';
import convertToUint8Array from '../helpers/bytes/convertToUint8Array';
import {IS_WORKER} from '../helpers/context';
import formatBytesPure from '../helpers/formatBytesPure';
import asyncThrottle from '../helpers/schedulers/asyncThrottle';

import cryptoMessagePort from './crypto/cryptoMessagePort';
import IDBStorage from './files/idb';
import {logger, Logger} from './logger';
import MTProtoMessagePort from './mtproto/mtprotoMessagePort';
import EncryptionKeyStore from './passcode/keyStore';


export interface StorageLayer
{
  save: (entryName: string | string[], value: any | any[]) => Promise<unknown>;
  get: <T>(entryNames: string[]) => Promise<T[]>;
  getAllEntries: () => Promise<IDBStorage.Entries>;
  getAll: <T>() => Promise<T[]>;
  getAllKeys: () => Promise<IDBValidKey[]>;
  delete: (entryName: string | string[]) => Promise<void>;
  clear: () => Promise<void>;
};

type StoredData = Record<string, any>;

export default class EncryptedStorageLayer<T extends Database<any>> implements StorageLayer
{
  private static STORAGE_KEY = 'data';
  // private static STORAGE_THROTTLE_TIME_MS = 250;
  /**
   * Having a delay here can break the app after logout, due to the fact that some updates might be queued in here before the
   * storages were disabled, and the after timeout it will save the data anyway (that might have been cleared for logout)
   */
  private static STORAGE_THROTTLE_TIME_MS = 0;

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

  private static async encrypt(data: StoredData): Promise<Uint8Array | null> {
    if(!Object.keys(data).length) return null;

    const key = await EncryptionKeyStore.get();
    const dataAsBuffer = convertToUint8Array(JSON.stringify(data));

    const result = await cryptoMessagePort.invokeCryptoNew({
      method: 'aes-local-encrypt',
      args: [{
        key,
        data: dataAsBuffer
      }],
      transfer: [dataAsBuffer.buffer]
    });

    return result;
  }

  private static async decrypt(data: Uint8Array): Promise<StoredData> {
    const key = await EncryptionKeyStore.get();

    const result = await cryptoMessagePort.invokeCryptoNew({
      method: 'aes-local-decrypt',
      args: [{
        key,
        encryptedData: data
      }],
      transfer: [data.buffer]
    });

    const decoded = new TextDecoder().decode(result);
    return JSON.parse(decoded);
  }

  public loadEncrypted() {
    (async() => {
      this.loadingDataPromise = this.loadFromIDB();
      await this.loadingDataPromise;
      this.loadingDataPromise = undefined;
    })();
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

    const startTime = performance.now();


    const encryptedData = await EncryptedStorageLayer.encrypt(this.data);
    const encryptedDataSize = encryptedData.length;

    const encryptionTime = performance.now();

    await this.storage.save(EncryptedStorageLayer.STORAGE_KEY, encryptedData);


    const endTime = performance.now();

    if(DEBUG && IS_WORKER) {
      /**
       * The time it takes is very random, it might be because of the busy-ness of the crypto worker and the indexed DB
       *
       * Can be a log for 5.5 KB in 8ms, and then another for 40 KB in just 3ms
       * Or a whole MegaByte in just 20ms which is not proportional at all
       */
      const f = (n: number) => n.toFixed(2);
      const port = MTProtoMessagePort.getInstance<false>();
      port.invokeVoid('log', `[${this.db.name}-${this.encryptedStoreName}] Encrypted and saved ` +
        `${encryptedDataSize} bytes (${formatBytesPure(encryptedDataSize, 2)}) of data in ${f(endTime - startTime)}ms ` +
        `-- (encrypted in ${f(encryptionTime - startTime)}ms, saved in ${f(endTime - encryptionTime)}ms)`)
    }
  };

  private saveToIDBThrottled = asyncThrottle(
    () => this.saveToIDB(),
    EncryptedStorageLayer.STORAGE_THROTTLE_TIME_MS
  );

  private async loadFromIDB() {
    try
    {
      const storageData = await this.storage.get(EncryptedStorageLayer.STORAGE_KEY);

      if(storageData === null) throw null;
      if(!(storageData instanceof Uint8Array)) throw new Error('Stored data in encrypted store is not a Uint8Array'); // Should not happen but anyway))

      const decrypted = await EncryptedStorageLayer.decrypt(storageData);
      this.data = decrypted;
    }
    catch(error)
    {
      if(error) this.log(error);
      this.data = {};
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

  public async getAllKeys(): Promise<IDBValidKey[]> {
    await this.waitToLoad();

    return Object.keys(this.data);
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
    // await this.waitToLoad();

    this.data = {};
    await this.storage.clear();
  }
}
