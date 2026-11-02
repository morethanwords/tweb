/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {Database} from '@config/databases';
import IDBStorage from '@lib/files/idb';
import subtle from '@lib/crypto/subtle';

/**
 * Where the wallet's recovery phrase lives on this device.
 *
 * Every secret is sealed with AES-256-GCM under its own random key K, and K is sealed under the device key D,
 * the way the desktop keyring does it. D never touches the disk in the clear:
 * - `passcode`: D is wrapped by a key derived from the wallet passcode (PBKDF2-SHA256), so reading a secret
 *   needs the passcode; an unwrapped D stays in memory for a while and is dropped on lock;
 * - `device`: D is a non-extractable CryptoKey kept in IndexedDB. Script on this origin can use it but never read
 *   its bytes; the browser still keeps the key material in the profile on disk, so this is no protection against
 *   anyone with the profile or the page — the user is warned when choosing it.
 *
 * Everything is keyed by the Telegram user, so accounts on one device never share a vault.
 */

export type WalletVaultKind = 'passcode' | 'device';

type VaultHeader = {
  version: 1,
  kind: WalletVaultKind,
  /** passcode: PBKDF2 salt */
  salt?: Uint8Array,
  iterations?: number,
  /** passcode: iv || GCM_wrap(D) */
  wrapped?: Uint8Array,
  /** device: D itself, non-extractable */
  key?: CryptoKey,
  /** which D: it changes only when D is replaced (a passcode added later); a tab that holds another one is locked */
  keyId?: string
};

type SealedSecret = {
  version: 1,
  /** iv || GCM_D(K) */
  key: Uint8Array,
  /** iv || GCM_K(secret) */
  data: Uint8Array,
  /** while D is replaced: iv || GCM_D'(K), the key under the next D (`addPasscode`) */
  keyNext?: Uint8Array
};

export type WalletCustodyRecord = {
  recordId: string,
  /** the address the phrase derives, as the server serves it */
  address: string,
  /** words 1-12: fixes the address */
  anchorKey: string,
  /** words 13-24 (or the anchor for a 12-word phrase): the key the server knows as current */
  signingKey: string,
  secretRef: string,
  network: 'mainnet' | 'testnet',
  date: number,
  /** a key update this device sent and the chain has not settled yet */
  pendingRotation?: WalletPendingRotation,
  /** the key was updated and the backup not switched since: a second update waits for that */
  rotatedSinceBackup?: boolean,
  /** the key an update replaced, while the server still serves it after the chain confirmed the update */
  awaitingServerKey?: string
};

/**
 * The new phrase of a key update, kept as its own secret beside the record's until the chain settles the update:
 * then it becomes the record's secret, or it is dropped.
 */
export type WalletPendingRotation = {
  /** the engine record the new phrase is imported under */
  recordId: string,
  secretRef: string,
  /** the engine's journal operation the signed update went out as */
  operationId: string,
  /** the signing key the update installs */
  newSigningKey: string,
  /** unix seconds: the chain refuses the message after it */
  validUntil: number
};

type WalletStoreName = 'vault' | 'secrets' | 'custody';

const DATABASE: Database<WalletStoreName> = {
  name: 'tweb-wallet',
  version: 1,
  stores: [{name: 'vault'}, {name: 'secrets'}, {name: 'custody'}]
};

const PBKDF2_ITERATIONS = 600_000;
const RETENTION = 15 * 60e3;
const AAD_PREFIX = 'tweb-wallet/v1/';

const textEncoder = new TextEncoder();

function randomBytes(length: number) {
  return crypto.getRandomValues(new Uint8Array(length));
}

function concat(a: Uint8Array, b: Uint8Array) {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

async function seal(key: CryptoKey, data: Uint8Array, aad: string) {
  const iv = randomBytes(12);
  const encrypted = await subtle.encrypt({name: 'AES-GCM', iv, additionalData: textEncoder.encode(AAD_PREFIX + aad)}, key, data as BufferSource);
  return concat(iv, new Uint8Array(encrypted));
}

async function open(key: CryptoKey, sealed: Uint8Array, aad: string) {
  const decrypted = await subtle.decrypt({
    name: 'AES-GCM',
    iv: sealed.subarray(0, 12) as BufferSource,
    additionalData: textEncoder.encode(AAD_PREFIX + aad)
  }, key, sealed.subarray(12) as BufferSource);
  return new Uint8Array(decrypted);
}

/**
 * A secret's own key, under D: from its sealing, or from the one under the next D when an earlier `addPasscode`
 * switched to that D and stopped before it tidied this secret
 */
async function openSecretKey(deviceKey: CryptoKey, sealed: SealedSecret, aad: string) {
  try {
    return await open(deviceKey, sealed.key, 'key/' + aad);
  } catch(err) {
    if(!sealed.keyNext) throw err;
    return await open(deviceKey, sealed.keyNext, 'key/' + aad).catch(() => {
      throw err;
    });
  }
}

function importAesKey(raw: Uint8Array, extractable = false) {
  return subtle.importKey('raw', raw as BufferSource, {name: 'AES-GCM'}, extractable, ['encrypt', 'decrypt']);
}

async function derivePasscodeKey(passcode: string, salt: Uint8Array, iterations: number) {
  const material = await subtle.importKey('raw', textEncoder.encode(passcode), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    {name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256'},
    material,
    {name: 'AES-GCM', length: 256},
    false,
    ['encrypt', 'decrypt']
  );
}

function makeKeyId() {
  return Array.from(randomBytes(8), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Asks the browser to keep the wallet's storage: without it a key that only this device holds may be cleared when
 * the disk runs short. The browser decides; nothing to do when it says no.
 */
export function requestPersistentStorage() {
  if(typeof(navigator) !== 'undefined' && navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {});
  }
}

export class WalletVaultLockedError extends Error {
  constructor() {
    super('WALLET_VAULT_LOCKED');
  }
}

/** `create` found a vault another tab made meanwhile: it is unlocked, never made again */
export class WalletVaultExistsError extends Error {
  constructor() {
    super('WALLET_VAULT_EXISTS');
  }
}

export default class WalletVault {
  private storage: IDBStorage<typeof DATABASE>;
  private deviceKey: CryptoKey;
  /** the header's `keyId` of the D held */
  private deviceKeyId: string;
  private retentionTimeout: number;
  /** bumped on every lock: work that started before it must not store what it unwrapped */
  private epoch = 0;

  constructor(private userId: UserId) {
    this.storage = new IDBStorage(DATABASE, 'vault');
  }

  private get vaultKey() {
    return '' + this.userId;
  }

  public get ownerId() {
    return this.userId;
  }

  private secretKey(secretRef: string) {
    return this.userId + ':' + secretRef;
  }

  /** every write of the header, in this tab and across the tabs, one at a time */
  private withHeaderLock<T>(task: () => Promise<T>): Promise<T> {
    const locks = typeof(navigator) !== 'undefined' ? navigator.locks : undefined;
    return locks ? locks.request('tweb-wallet-vault:' + this.userId, task) as Promise<T> : task();
  }

  // * a missing entry reads as undefined; a failing database is an error, never "no vault" — that would
  // * overwrite the header or call a right passcode wrong
  private getHeader() {
    return this.storage.get<VaultHeader>(this.vaultKey, 'vault');
  }

  public async getKind(): Promise<WalletVaultKind | undefined> {
    return (await this.getHeader())?.kind;
  }

  public isUnlocked() {
    return !!this.deviceKey;
  }

  /**
   * Makes the device key and protects it, once: a vault that is there already (another tab made it) is refused
   * with `WalletVaultExistsError` and unlocked instead — replaced, the secrets sealed under its key would be lost.
   */
  public create(protection: {kind: 'passcode', passcode: string} | {kind: 'device'}) {
    // * two tabs that both found no vault would each make a device key, and the secrets the first stored under its
    // * key would be unreadable once the second replaced it: the header is checked again under the tabs' lock
    return this.withHeaderLock(async() => {
      if(await this.getHeader()) {
        throw new WalletVaultExistsError();
      }

      await this.createLocked(protection);
    });
  }

  private async createLocked(protection: {kind: 'passcode', passcode: string} | {kind: 'device'}) {
    let header: VaultHeader, deviceKey: CryptoKey;
    if(protection.kind === 'device') {
      deviceKey = await subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
      header = {version: 1, kind: 'device', key: deviceKey, keyId: makeKeyId()};
    } else {
      const raw = randomBytes(32);
      const salt = randomBytes(16);
      const wrapKey = await derivePasscodeKey(protection.passcode, salt, PBKDF2_ITERATIONS);
      const wrapped = await seal(wrapKey, raw, 'wrap/' + this.vaultKey);
      deviceKey = await importAesKey(raw);
      raw.fill(0);
      header = {version: 1, kind: 'passcode', salt, iterations: PBKDF2_ITERATIONS, wrapped, keyId: makeKeyId()};
    }

    await this.storage.save(this.vaultKey, header, 'vault');
    this.setDeviceKey(deviceKey, header.keyId);
    requestPersistentStorage();
  }

  /**
   * `device` vaults open by themselves; a `passcode` vault needs the passcode and answers whether it was right.
   */
  public async unlock(passcode?: string): Promise<boolean> {
    const header = await this.getHeader();
    if(!header) {
      return false;
    }

    const epoch = this.epoch;
    let deviceKey: CryptoKey;
    if(header.kind === 'device') {
      deviceKey = header.key;
    } else {
      if(passcode === undefined) {
        return false;
      }

      const wrapKey = await derivePasscodeKey(passcode, header.salt, header.iterations);
      try {
        const raw = await open(wrapKey, header.wrapped, 'wrap/' + this.vaultKey);
        deviceKey = await importAesKey(raw);
        raw.fill(0);
      } catch(err) {
        return false;
      }
    }

    if(epoch !== this.epoch) {
      return false;
    }

    this.setDeviceKey(deviceKey, header.keyId);
    return true;
  }

  /**
   * Another passcode for a `passcode` vault, or none (`next` left out: the vault becomes a `device` one). Only the
   * device key's wrapping changes, in one write of the header: the secrets sealed under that key stay as they are.
   * Answers whether `current` was right.
   */
  public changePasscode(current: string, next?: string): Promise<boolean> {
    return this.withHeaderLock(() => this.changePasscodeLocked(current, next));
  }

  private async changePasscodeLocked(current: string, next?: string): Promise<boolean> {
    const header = await this.getHeader();
    if(header?.kind !== 'passcode') {
      return false;
    }

    const wrapKey = await derivePasscodeKey(current, header.salt, header.iterations);
    let raw: Uint8Array;
    try {
      raw = await open(wrapKey, header.wrapped, 'wrap/' + this.vaultKey);
    } catch(err) {
      return false;
    }

    try {
      let updated: VaultHeader;
      // * the same D, only wrapped another way: its id stays
      if(next === undefined) {
        updated = {version: 1, kind: 'device', key: await importAesKey(raw), keyId: header.keyId};
      } else {
        const salt = randomBytes(16);
        const nextWrapKey = await derivePasscodeKey(next, salt, PBKDF2_ITERATIONS);
        updated = {version: 1, kind: 'passcode', salt, iterations: PBKDF2_ITERATIONS, wrapped: await seal(nextWrapKey, raw, 'wrap/' + this.vaultKey), keyId: header.keyId};
      }

      const deviceKey = updated.key || await importAesKey(raw);
      await this.storage.save(this.vaultKey, updated, 'vault');
      this.setDeviceKey(deviceKey, updated.keyId);
      return true;
    } finally {
      raw.fill(0);
    }
  }

  /**
   * A passcode for a `device` vault, whose D cannot be wrapped (it is non-extractable): D is replaced by a new one.
   * Each step leaves every secret readable if the next fails: first each secret's key is sealed under the new D too,
   * then the header switches in one write, then the new sealing becomes the only one. Answers whether it was done.
   */
  public addPasscode(passcode: string): Promise<boolean> {
    return this.withHeaderLock(async() => {
      const header = await this.getHeader();
      if(header?.kind !== 'device') {
        return false;
      }

      const prefix = this.userId + ':';
      const own = async() => (await this.storage.getAllEntries('secrets')).filter(([key]) => typeof(key) === 'string' && key.startsWith(prefix)) as [string, SealedSecret][];
      const raw = randomBytes(32);
      try {
        const nextKey = await importAesKey(raw);
        for(const [aad, sealed] of await own()) {
          const secretKey = await openSecretKey(header.key, sealed, aad);
          try {
            // * sealed under the current D as well: one an earlier move left readable through keyNext alone keeps a
            // * sealing the header still opens if this move stops too
            await this.storage.save(aad, {
              ...sealed,
              key: await seal(header.key, secretKey, 'key/' + aad),
              keyNext: await seal(nextKey, secretKey, 'key/' + aad)
            }, 'secrets');
          } finally {
            secretKey.fill(0);
          }
        }

        const salt = randomBytes(16);
        const wrapKey = await derivePasscodeKey(passcode, salt, PBKDF2_ITERATIONS);
        const updated: VaultHeader = {
          version: 1,
          kind: 'passcode',
          salt,
          iterations: PBKDF2_ITERATIONS,
          wrapped: await seal(wrapKey, raw, 'wrap/' + this.vaultKey),
          keyId: makeKeyId()
        };
        await this.storage.save(this.vaultKey, updated, 'vault');
        this.setDeviceKey(nextKey, updated.keyId);

        for(const [aad, sealed] of await own()) {
          if(!sealed.keyNext) continue;
          const {keyNext, ...rest} = sealed;
          await this.storage.save(aad, {...rest, key: keyNext}, 'secrets').catch(() => {});
        }

        return true;
      } finally {
        raw.fill(0);
      }
    });
  }

  public async checkPasscode(passcode: string) {
    const header = await this.getHeader();
    if(header?.kind !== 'passcode') {
      return false;
    }

    const wrapKey = await derivePasscodeKey(passcode, header.salt, header.iterations);
    return open(wrapKey, header.wrapped, 'wrap/' + this.vaultKey).then((raw) => {
      raw.fill(0);
      return true;
    }, () => false);
  }

  /**
   * Opens a `device` vault without asking. A `passcode` vault stays locked until `unlock`.
   */
  public async unlockSilently() {
    if(this.deviceKey) {
      return true;
    }

    const kind = await this.getKind();
    return kind === 'device' ? this.unlock() : false;
  }

  private setDeviceKey(key: CryptoKey, keyId: string) {
    this.deviceKey = key;
    this.deviceKeyId = keyId;
    clearTimeout(this.retentionTimeout);
    this.retentionTimeout = self.setTimeout(() => this.lock(), RETENTION);
  }

  public lock() {
    clearTimeout(this.retentionTimeout);
    this.deviceKey = undefined;
    this.deviceKeyId = undefined;
    ++this.epoch;
  }

  // MARK: Secrets

  /**
   * Seals a secret under D and checks it reads back as it was before anything relies on it. Under the header's lock:
   * D replaced by another tab meanwhile (`addPasscode`) locks this one, a secret sealed under the old D would be lost.
   */
  public async storeSecret(secretRef: string, bytes: Uint8Array) {
    this.requireKey();
    return this.withHeaderLock(async() => {
      const deviceKey = await this.requireCurrentKey();
      const raw = randomBytes(32);
      const key = await importAesKey(raw);
      const aad = this.secretKey(secretRef);
      const sealed: SealedSecret = {
        version: 1,
        key: await seal(deviceKey, raw, 'key/' + aad),
        data: await seal(key, bytes, 'secret/' + aad)
      };
      raw.fill(0);
      await this.storage.save(aad, sealed, 'secrets');

      const stored = await this.readSecret(secretRef);
      const same = stored.length === bytes.length && stored.every((byte, index) => byte === bytes[index]);
      stored.fill(0);
      if(!same) {
        throw new Error('WALLET_SECRET_WRITE_FAILED');
      }
    });
  }

  public async readSecret(secretRef: string): Promise<Uint8Array> {
    const deviceKey = this.requireKey();
    const aad = this.secretKey(secretRef);
    const sealed = await this.storage.get<SealedSecret>(aad, 'secrets');
    if(!sealed) {
      throw new Error('WALLET_SECRET_MISSING');
    }

    let raw: Uint8Array;
    try {
      raw = await openSecretKey(deviceKey, sealed, aad);
    } catch(err) {
      // * another tab replaced D: the one held here is no longer the vault's
      if((await this.getHeader())?.keyId !== this.deviceKeyId) {
        this.lock();
        throw new WalletVaultLockedError();
      }

      throw err;
    }

    const key = await importAesKey(raw);
    raw.fill(0);
    return open(key, sealed.data, 'secret/' + aad);
  }

  public deleteSecret(secretRef: string) {
    return this.storage.delete(this.secretKey(secretRef), 'secrets');
  }

  public async hasSecret(secretRef: string) {
    const sealed = await this.storage.get<SealedSecret>(this.secretKey(secretRef), 'secrets');
    return !!sealed;
  }

  private requireKey() {
    if(!this.deviceKey) {
      throw new WalletVaultLockedError();
    }

    return this.deviceKey;
  }

  /** the D held, once the header says it is still the vault's; otherwise this tab locks */
  private async requireCurrentKey() {
    const deviceKey = this.requireKey();
    if((await this.getHeader())?.keyId !== this.deviceKeyId) {
      this.lock();
      throw new WalletVaultLockedError();
    }

    return deviceKey;
  }

  // MARK: Custody

  public getCustody() {
    return this.storage.get<WalletCustodyRecord>(this.vaultKey, 'custody');
  }

  public saveCustody(record: WalletCustodyRecord) {
    return this.storage.save(this.vaultKey, record, 'custody');
  }

  public deleteCustody() {
    return this.storage.delete(this.vaultKey, 'custody');
  }

  /**
   * A key of a wallet this account no longer uses: kept, since its phrase still opens whatever that wallet holds
   */
  public parkCustody(record: WalletCustodyRecord) {
    return this.storage.save(this.vaultKey + ':parked:' + record.recordId, record, 'custody');
  }

  public deleteParkedCustody(recordId: string) {
    return this.storage.delete(this.vaultKey + ':parked:' + recordId, 'custody');
  }

  public async getParkedCustody(): Promise<WalletCustodyRecord[]> {
    const prefix = this.vaultKey + ':parked:';
    const entries = await this.storage.getAllEntries('custody');
    return entries.filter(([key]) => typeof(key) === 'string' && key.startsWith(prefix)).map(([, value]) => value as WalletCustodyRecord);
  }

  /**
   * Forgets everything this user's wallet kept on the device
   */
  /** every account's keys on this device: the logout of all of them at once (the passcode lock's "forgot") */
  public static async wipeAll() {
    const storage = new IDBStorage(DATABASE, 'vault');
    await Promise.all((['vault', 'secrets', 'custody'] as WalletStoreName[]).map((name) => storage.clear(name)));
  }

  public async wipe() {
    this.lock();
    const prefix = this.userId + ':';
    const keys = await this.storage.getAllKeys('secrets').catch((): IDBValidKey[] => []);
    const own = keys.filter((key) => typeof(key) === 'string' && key.startsWith(prefix)) as string[];
    if(own.length) {
      await this.storage.delete(own, 'secrets');
    }

    const custodyKeys = await this.storage.getAllKeys('custody').catch((): IDBValidKey[] => []);
    const ownCustody = custodyKeys.filter((key) => key === this.vaultKey || (typeof(key) === 'string' && key.startsWith(this.vaultKey + ':parked:'))) as string[];
    await Promise.all([
      ownCustody.length ? this.storage.delete(ownCustody, 'custody') : undefined,
      this.storage.delete(this.vaultKey, 'vault')
    ]);
  }
}
