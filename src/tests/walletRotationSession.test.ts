/*
 * "Update Secret Phrase" through the wallet session, against a made-up engine and an in-memory vault: what is kept
 * where while an update is on its way, and how it settles — in this tab, in another one, or after a reload. Also the
 * custody records under one lock, and a transfer whose outcome is unknown. Nothing here talks to a chain or a server.
 */

import type {WalletCustodyRecord} from '@lib/wallet/vault';
import type {WalletStatus} from '@appManagers/appWalletManager';
import bytesToHex from '@helpers/bytes/bytesToHex';
import bytesFromHex from '@helpers/bytes/bytesFromHex';
import base64ToBytes from '@helpers/string/base64ToBytes';

const fake = vi.hoisted(() => {
  const ADDRESS = 'UQA8RRt6mUoTcShtSDlxDvF1SX6Femu9dMCB-ZTK3uQ-aU_k';
  const NOW = 1_800_000_000;
  // * a rotation the engine really produced (tdesktop's gram_boc_tests): only its shape matters here
  const SIGNED_ROTATION = 'te6ccgEBAwEA2wABRYgAZ4xQk4U3opHAuJR05zBkP9ox03AUWUCLZzGptmq5eCIMAQHgb3k9gvcbRTBHo0i1Tf6H7+uEc/sWCnBvso+EvWulcg3Sln/+t8K1TbV3ZY0GMfu9SzGLZbD2mX2i7watvgPTB/u6mch//3/9cQAAAAECAwTCrGFc4SyQlfUmZksQauBUlmtXR6JkHwvHYR18E+fdLQIAgMaXjUHo2b8/kzmLv2VlyZq9CkIyoIsmPjPooy9ulySPlJzma5y5fVXX2hgk+42rJJWOyIv9orOu0TaS7uFk8Ac=';
  const words = (prefix: string) => Array.from({length: 24}, (_, i) => prefix + i);
  const OLD_WORDS = words('old');
  const NEW_WORDS = [...OLD_WORDS.slice(0, 12), ...words('new').slice(12)];

  // * a stand-in key derivation: distinct words give distinct keys
  const key = (list: string[]) => {
    const text = list.join(' ');
    const out = new Array<number>(32);
    for(let i = 0; i < 32; ++i) {
      let value = i * 31;
      for(let j = 0; j < text.length; ++j) value = (value * 33 + text.charCodeAt(j) + i) % 251;
      out[i] = value;
    }

    return out;
  };
  const anchorOf = (list: string[]) => key(list.slice(0, 12));
  const signingOf = (list: string[]) => list.length === 24 ? key(list.slice(12)) : anchorOf(list);

  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  type Secrets = {
    read: (request: any) => Promise<Uint8Array>,
    store: (request: any) => Promise<void>,
    delete: (ref: {value: string}) => Promise<void>
  };

  const engine = {
    sendBoc: vi.fn(),
    send: vi.fn(),
    previewSend: vi.fn(),
    resolvePending: vi.fn(),
    prepared: [] as any[]
  };

  class BrowserPlatformHost {
    public secrets: Secrets;
    constructor(options: {secrets: Secrets}) {
      this.secrets = options.secrets;
    }
  }

  const readWords = async(host: BrowserPlatformHost, secretRef: {value: string}) => {
    const bytes = await host.secrets.read({secretRef, reason: 'signTransfer', prompt: ''});
    return textDecoder.decode(bytes).split(' ');
  };

  const module = {
    initializeWalletEngine: async() => {},
    // * an address the engine cannot read: `bad:` ones
    convertTonAddress: async(address: string) => {
      if(address.startsWith('bad:')) throw new Error('invalid address');
      return address;
    },
    detectMnemonicSchemes: async() => ['rotation'],
    BrowserPlatformHost,
    IndexedDbJournalStore: class {},
    WalletLifecycle: {
      create: async(host: BrowserPlatformHost) => ({
        importWallet: async(request: {recordId: string, network: string, recoveryWords: string[]}) => {
          const secretRef = {value: 'secret:' + request.recordId};
          await host.secrets.store({secretRef, bytes: Array.from(textEncoder.encode(request.recoveryWords.join(' '))), requireUserPresence: false});
          return {recordId: request.recordId, address: ADDRESS, publicKey: anchorOf(request.recoveryWords), network: request.network, secretRef};
        },
        deleteWallet: (descriptor: any) => host.secrets.delete(descriptor.secretRef),
        signTonConnectProof: async(request: any) => ({
          publicKey: signingOf(await readWords(host, request.descriptor.secretRef)),
          signature: new Array(64).fill(1)
        }),
        revealRecoveryPhrase: async(descriptor: any) => ({phrase: (await readWords(host, descriptor.secretRef)).join(' ')}),
        close: () => {}
      })
    },
    WalletClient: {
      createStatusless: async(config: any, options: {platformHost: BrowserPlatformHost}) => ({
        config,
        prepareKeyRotation: async(request: {validUntil: number, messageKind: string}) => {
          // * signing reads the record's phrase, as the real engine does
          await readWords(options.platformHost, config.localSecretRef);
          const prepared = {
            replacementRecoveryPhrase: {phrase: NEW_WORDS.join(' ')},
            newPublicKey: signingOf(NEW_WORDS),
            signedBoc: SIGNED_ROTATION,
            seqno: 7,
            validUntil: request.validUntil,
            messageKind: request.messageKind
          };
          engine.prepared.push(prepared);
          return prepared;
        },
        sendBoc: (request: any) => engine.sendBoc(request, config),
        send: (request: any) => engine.send(request, config),
        previewSend: (request: any) => engine.previewSend(request, config),
        resolvePending: () => engine.resolvePending(config),
        cancelSendPreview: async() => {},
        close: async() => {}
      })
    }
  };

  // * the vault as IndexedDB keeps it: per user, every value a copy
  const disk = {
    secrets: new Map<string, Uint8Array>(),
    custody: undefined as WalletCustodyRecord,
    parked: new Map<string, WalletCustodyRecord>(),
    /** runs once, between a read of the custody record and its answer: what lands meanwhile */
    afterCustodyRead: undefined as () => Promise<void>
  };

  class WalletVaultLockedError extends Error {}

  class WalletVault {
    public isUnlocked() {
      return true;
    }

    public async unlockSilently() {
      return true;
    }

    public async getKind() {
      return 'device';
    }

    public lock() {}

    public async storeSecret(ref: string, bytes: Uint8Array) {
      disk.secrets.set(ref, new Uint8Array(bytes));
    }

    public async readSecret(ref: string) {
      const bytes = disk.secrets.get(ref);
      if(!bytes) throw new Error('WALLET_SECRET_MISSING');
      return new Uint8Array(bytes);
    }

    public async deleteSecret(ref: string) {
      disk.secrets.delete(ref);
    }

    public async hasSecret(ref: string) {
      return disk.secrets.has(ref);
    }

    public async getCustody() {
      const record = disk.custody && structuredClone(disk.custody);
      const afterRead = disk.afterCustodyRead;
      disk.afterCustodyRead = undefined;
      await afterRead?.();
      return record;
    }

    public async saveCustody(record: WalletCustodyRecord) {
      disk.custody = structuredClone(record);
    }

    public async deleteCustody() {
      disk.custody = undefined;
    }

    public async parkCustody(record: WalletCustodyRecord) {
      disk.parked.set(record.recordId, structuredClone(record));
    }

    public async getParkedCustody(): Promise<WalletCustodyRecord[]> {
      return [...disk.parked.values()].map((record) => structuredClone(record));
    }

    public async deleteParkedCustody(recordId: string) {
      disk.parked.delete(recordId);
    }
  }

  const managers = {
    appWalletManager: {
      getStatus: vi.fn(),
      performToncenterRequest: vi.fn(),
      getProofChallenge: vi.fn(async() => ({_: 'wallet.proofChallenge', domain: 'telegram.org', payload: 'challenge', expires: 2e9})),
      disableBackup: vi.fn(),
      enableBackup: vi.fn(),
      getAddressFunds: vi.fn()
    },
    timeManager: {
      getServerTime: vi.fn(async() => NOW)
    }
  };

  return {ADDRESS, NOW, SIGNED_ROTATION, OLD_WORDS, NEW_WORDS, anchorOf, signingOf, engine, module, disk, WalletVault, WalletVaultLockedError, managers};
});

vi.mock('@ton/wallet-engine', () => fake.module);
vi.mock('@lib/wallet/vault', () => ({default: fake.WalletVault, WalletVaultLockedError: fake.WalletVaultLockedError}));
vi.mock('@lib/rootScope', () => ({default: {myId: 1, managers: fake.managers}}));
vi.mock('@lib/wallet/engineHost', () => ({
  setWalletSubmission: vi.fn(),
  TONCENTER_BASE_URL: 'https://toncenter.com',
  WalletStatuslessHostImpl: class {
    public static made: {closed: boolean}[] = [];
    public closed = false;
    constructor(public managers?: unknown) {
      (this.constructor as any).made.push(this);
    }

    public close() {
      this.closed = true;
    }
  }
}));

import WalletSession from '@lib/wallet/walletSession';
import rootScope from '@lib/rootScope';
import {setWalletSubmission, WalletStatuslessHostImpl, WalletSubmission} from '@lib/wallet/engineHost';
import pause from '@helpers/schedulers/pause';

const OLD_KEY = bytesToHex(fake.signingOf(fake.OLD_WORDS));
const NEW_KEY = bytesToHex(fake.signingOf(fake.NEW_WORDS));
const OLD_SECRET = 'secret:record-old';
const textEncoder = new TextEncoder();

function status(key: string, balance = '1720580000000', backup = true): WalletStatus {
  return {
    presence: 'ready',
    date: Date.now(),
    state: {
      _: 'walletState',
      pFlags: backup ? {backup_enabled: true, can_export_phrase: true} : {},
      address: fake.ADDRESS,
      public_key: bytesFromHex(key),
      balance
    }
  };
}

function trace(fee: string, account = fake.ADDRESS) {
  return JSON.stringify({
    trace: {tx_hash: 'root'},
    transactions: {
      root: {
        account,
        total_fees: fee,
        description: {aborted: false, compute_ph: {success: true, exit_code: 0}, action: {success: true, result_code: 0}}
      }
    }
  });
}

/** a fresh tab: a new session over the same vault and engine journal */
function newSession() {
  return new WalletSession(1 as UserId);
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.engine.prepared.length = 0;
  fake.disk.secrets.clear();
  fake.disk.parked.clear();
  fake.disk.afterCustodyRead = undefined;
  // * a value one test sets is not the next one's
  fake.engine.resolvePending.mockReset().mockResolvedValue({phase: 'idle'});
  fake.engine.send.mockReset();
  fake.managers.timeManager.getServerTime.mockReset().mockImplementation(async() => fake.NOW);
  fake.managers.appWalletManager.getAddressFunds.mockReset();
  fake.disk.secrets.set(OLD_SECRET, textEncoder.encode(fake.OLD_WORDS.join(' ')));
  fake.disk.custody = {
    recordId: 'record-old',
    address: fake.ADDRESS,
    anchorKey: bytesToHex(fake.anchorOf(fake.OLD_WORDS)),
    signingKey: OLD_KEY,
    secretRef: OLD_SECRET,
    network: 'mainnet',
    date: 1
  };
  fake.managers.appWalletManager.getStatus.mockResolvedValue(status(OLD_KEY));
  fake.managers.appWalletManager.performToncenterRequest.mockResolvedValue(trace('4200000'));
  fake.managers.appWalletManager.disableBackup.mockImplementation(async() => status(NEW_KEY, undefined, false));
});

describe('quoting the update', () => {
  it('emulates a disarmed copy and never sends the signed update', async() => {
    const session = newSession();
    expect(await session.isRotationOffered(status(OLD_KEY))).toBe(true);
    expect(await session.quoteRotationFee(status(OLD_KEY))).toEqual({fee: '4200000', insufficient: false});

    const request = fake.managers.appWalletManager.performToncenterRequest.mock.calls[0][0];
    expect(request.endpoint).toBe('/api/emulate/v1/emulateTrace');
    const payload = JSON.parse(request.payload);
    expect(payload.ignore_chksig).toBe(true);
    // * the same message, but not its signature
    expect(payload.boc).not.toBe(fake.SIGNED_ROTATION);
    expect(base64ToBytes(payload.boc).length).toBe(base64ToBytes(fake.SIGNED_ROTATION).length);
    expect(fake.engine.sendBoc).not.toHaveBeenCalled();
    // * the quote's own update is valid for a short while only
    expect(fake.engine.prepared[0].validUntil).toBe(fake.NOW + 120);
    expect(fake.disk.custody.pendingRotation).toBeUndefined();
  });

  it('asks for a top-up when the balance does not cover the fee', async() => {
    const session = newSession();
    expect(await session.quoteRotationFee(status(OLD_KEY, '4199999'))).toEqual({fee: '4200000', insufficient: true});
  });

  it('refuses an emulation of another account', async() => {
    fake.managers.appWalletManager.performToncenterRequest.mockResolvedValue(trace('4200000', 'UQC5Yw1jHf6s6CTr5kn6XgGcAkCq3lWlDYDYp2Dz4TQYJ_cP'));
    await expect(newSession().quoteRotationFee(status(OLD_KEY))).rejects.toMatchObject({type: 'ROTATION_QUOTE_FAILED'});
  });
});

async function prepare(session: WalletSession) {
  const quote = await session.quoteRotationFee(status(OLD_KEY));
  return session.prepareRotation(status(OLD_KEY), quote);
}

describe('sending the update', () => {
  it('keeps the new phrase pending until the chain confirms it, then makes it the record\'s', async() => {
    const session = newSession();
    expect(await prepare(session)).toEqual(fake.NEW_WORDS);

    let atBroadcast: WalletCustodyRecord;
    fake.engine.sendBoc.mockImplementation(async(request: any, config: any) => {
      atBroadcast = structuredClone(fake.disk.custody);
      // * the update goes out on the old record's client, whose journal will hold it
      expect(config.recordId).toBe('record-old');
      expect(request.signedBoc).toBe(fake.SIGNED_ROTATION);
      expect(request.validUntil).toBe(fake.NOW + 300);
      return {operationId: request.operationId, phase: 'submitted'};
    });
    fake.engine.resolvePending.mockImplementation(async() => ({operationId: atBroadcast.pendingRotation.operationId, phase: 'confirmed'}));

    await session.submitRotation(status(OLD_KEY));

    // * before the broadcast: the old phrase signs, the new one waits beside it
    expect(atBroadcast.secretRef).toBe(OLD_SECRET);
    expect(atBroadcast.signingKey).toBe(OLD_KEY);
    expect(atBroadcast.pendingRotation).toMatchObject({newSigningKey: NEW_KEY, validUntil: fake.NOW + 300});
    expect(fake.engine.sendBoc.mock.calls[0][0].operationId).toBe(atBroadcast.pendingRotation.operationId);
    // * an update is no transfer: nothing is routed to wallet.sendTransfer
    expect(vi.mocked(setWalletSubmission)).toHaveBeenLastCalledWith(undefined);

    // * after: one record, the new phrase and key, the old key answered for until the server catches up
    const record = fake.disk.custody;
    expect(record).toMatchObject({
      recordId: atBroadcast.pendingRotation.recordId,
      secretRef: atBroadcast.pendingRotation.secretRef,
      signingKey: NEW_KEY,
      awaitingServerKey: OLD_KEY,
      rotatedSinceBackup: true
    });
    expect(record.pendingRotation).toBeUndefined();
    expect(fake.disk.secrets.has(OLD_SECRET)).toBe(false);
    expect(fake.disk.secrets.has(record.secretRef)).toBe(true);
    expect((await session.getMatchingRecord(status(OLD_KEY)))?.recordId).toBe(record.recordId);
    // * no second update until the backup was switched
    expect(await session.isRotationOffered(status(OLD_KEY))).toBe(false);

    // * the backup goes off with the new key's proof; the server serves the new key by then
    await session.disableBackup(status(NEW_KEY));
    const args = fake.managers.appWalletManager.disableBackup.mock.calls[0][0];
    expect(bytesToHex(args.newPublicKey)).toBe(NEW_KEY);
    expect(args.proof._).toBe('walletOwnershipProof');
    expect(fake.disk.custody.rotatedSinceBackup).toBeUndefined();
    expect(fake.disk.custody.awaitingServerKey).toBeUndefined();
  });

  it('drops the new phrase when the provider refuses the update', async() => {
    const session = newSession();
    await prepare(session);
    fake.engine.sendBoc.mockRejectedValue(new Error('send failed: external message was not accepted'));

    await expect(session.submitRotation(status(OLD_KEY))).rejects.toMatchObject({type: 'ROTATION_REFUSED'});
    expect(fake.disk.custody).toMatchObject({recordId: 'record-old', secretRef: OLD_SECRET, signingKey: OLD_KEY});
    expect(fake.disk.custody.pendingRotation).toBeUndefined();
    expect([...fake.disk.secrets.keys()]).toEqual([OLD_SECRET]);
  });

  it('drops the new phrase when the chain lets the update expire', async() => {
    const session = newSession();
    await prepare(session);
    fake.engine.sendBoc.mockImplementation(async(request: any) => ({operationId: request.operationId, phase: 'submitted'}));
    fake.engine.resolvePending.mockImplementation(async() => ({operationId: fake.disk.custody.pendingRotation.operationId, phase: 'expired'}));

    await expect(session.submitRotation(status(OLD_KEY))).rejects.toMatchObject({type: 'ROTATION_EXPIRED'});
    expect(fake.disk.custody.pendingRotation).toBeUndefined();
    expect([...fake.disk.secrets.keys()]).toEqual([OLD_SECRET]);
  });

  it('refuses an update whose window has closed, and one the balance cannot pay for', async() => {
    const session = newSession();
    await prepare(session);
    fake.managers.timeManager.getServerTime.mockResolvedValueOnce(fake.NOW + 300);
    await expect(session.submitRotation(status(OLD_KEY))).rejects.toMatchObject({type: 'ROTATION_EXPIRED'});

    await prepare(session);
    await expect(session.submitRotation(status(OLD_KEY, '1'))).rejects.toMatchObject({type: 'ROTATION_FEES'});
    expect(fake.engine.sendBoc).not.toHaveBeenCalled();
    expect(fake.disk.custody.pendingRotation).toBeUndefined();
  });

  it('forgets a prepared update that is abandoned', async() => {
    const session = newSession();
    await prepare(session);
    session.abandonRotation();
    await expect(session.submitRotation(status(OLD_KEY))).rejects.toMatchObject({type: 'ROTATION_NOT_PREPARED'});
  });
});

const NEW_SECRET = 'secret:record-new';

/** a key update sent before: its new phrase beside the record's, its window closing in 100 s (and 60 more after) */
function addPendingRotation() {
  fake.disk.secrets.set(NEW_SECRET, textEncoder.encode(fake.NEW_WORDS.join(' ')));
  fake.disk.custody.pendingRotation = {
    recordId: 'record-new',
    secretRef: NEW_SECRET,
    operationId: 'op-rotation',
    newSigningKey: NEW_KEY,
    validUntil: fake.NOW + 100
  };
}

describe('an update from before a reload', () => {
  beforeEach(addPendingRotation);

  it('is promoted as soon as the server serves its key', async() => {
    const record = await newSession().getMatchingRecord(status(NEW_KEY));
    expect(record).toMatchObject({recordId: 'record-new', secretRef: NEW_SECRET, signingKey: NEW_KEY, rotatedSinceBackup: true});
    expect(record.awaitingServerKey).toBeUndefined();
    expect(fake.disk.custody.pendingRotation).toBeUndefined();
    expect([...fake.disk.secrets.keys()]).toEqual([NEW_SECRET]);
  });

  it('is promoted when the journal says the chain confirmed it', async() => {
    fake.engine.resolvePending.mockResolvedValue({operationId: 'op-rotation', phase: 'confirmed'});
    const session = newSession();
    // * the old key still signs meanwhile
    expect((await session.getMatchingRecord(status(OLD_KEY)))?.secretRef).toBe(OLD_SECRET);
    await (session as any).rotationResume;
    expect(fake.disk.custody).toMatchObject({secretRef: NEW_SECRET, signingKey: NEW_KEY, awaitingServerKey: OLD_KEY});
    expect(fake.disk.secrets.has(OLD_SECRET)).toBe(false);
  });

  it('is dropped when the journal never had it once its window closed: it was never broadcast', async() => {
    fake.engine.resolvePending.mockResolvedValue({phase: 'idle'});
    fake.managers.timeManager.getServerTime.mockResolvedValue(fake.NOW + 100 + 60);
    const session = newSession();
    await session.getMatchingRecord(status(OLD_KEY));
    await (session as any).rotationResume;
    expect(fake.disk.custody).toMatchObject({recordId: 'record-old', secretRef: OLD_SECRET, signingKey: OLD_KEY});
    expect(fake.disk.custody.pendingRotation).toBeUndefined();
    expect([...fake.disk.secrets.keys()]).toEqual([OLD_SECRET]);
  });

  it('holds transfers and backup changes back while it is unsettled', async() => {
    // * the journal does not answer: the update stays pending
    fake.engine.resolvePending.mockReturnValue(new Promise(() => {}));
    const session = newSession();
    await expect(session.send(status(OLD_KEY), {destination: fake.ADDRESS, bounce: false, nanograms: '1'})).rejects.toMatchObject({type: 'WALLET_SEND_IN_PROGRESS'});
    await expect(session.disableBackup(status(OLD_KEY))).rejects.toMatchObject({type: 'ROTATION_PENDING'});
    expect(await session.isRotationOffered(status(OLD_KEY))).toBe(false);
    expect(fake.disk.custody.pendingRotation).toBeDefined();
  });
});

describe('an update another tab is sending', () => {
  /** the Web Locks every tab of the origin shares, in one process */
  function installLocks() {
    const held = new Map<string, Promise<void>>();
    const locks = {
      request: async(name: string, options: {ifAvailable?: boolean}, callback: (lock: {name: string} | null) => Promise<any>) => {
        if(options.ifAvailable && held.has(name)) {
          return callback(null);
        }

        while(held.has(name)) {
          await held.get(name);
        }

        let release: () => void;
        held.set(name, new Promise<void>((resolve) => release = resolve));
        try {
          return await callback({name});
        } finally {
          held.delete(name);
          release();
        }
      }
    };

    Object.defineProperty(navigator, 'locks', {value: locks, configurable: true});
    return () => {
      delete (navigator as any).locks;
    };
  }

  it('is not dropped by a tab that looks before the journal names it', async() => {
    const tabA = newSession();
    const tabB = newSession();
    await prepare(tabA);

    let journaled: string, seenByB: WalletCustodyRecord, newPhraseKept: boolean;
    fake.engine.sendBoc.mockImplementation(async(request: any) => {
      // * B's status poll lands after A stored the update and before A's engine journaled it
      await tabB.getMatchingRecord(status(OLD_KEY));
      await (tabB as any).rotationResume;
      seenByB = structuredClone(fake.disk.custody);
      newPhraseKept = !!seenByB.pendingRotation && fake.disk.secrets.has(seenByB.pendingRotation.secretRef);
      journaled = request.operationId;
      return {operationId: request.operationId, phase: 'submitted'};
    });
    fake.engine.resolvePending.mockImplementation(async() => journaled ? {operationId: journaled, phase: 'confirmed'} : {phase: 'idle'});

    await tabA.submitRotation(status(OLD_KEY));
    expect(seenByB.pendingRotation?.operationId).toBe(journaled);
    expect(newPhraseKept).toBe(true);
    // * and the chain's confirmation makes the new phrase the record's
    expect(fake.disk.custody).toMatchObject({signingKey: NEW_KEY, secretRef: seenByB.pendingRotation.secretRef});
  });

  it('is left alone by the other tabs while one holds it', async() => {
    const uninstall = installLocks();
    try {
      const tabA = newSession();
      const tabB = newSession();
      await prepare(tabA);
      let resolvesByB = -1;
      fake.engine.sendBoc.mockImplementation(async(request: any) => {
        const before = fake.engine.resolvePending.mock.calls.length;
        await tabB.getMatchingRecord(status(OLD_KEY));
        await (tabB as any).rotationResume;
        resolvesByB = fake.engine.resolvePending.mock.calls.length - before;
        return {operationId: request.operationId, phase: 'submitted'};
      });
      fake.engine.resolvePending.mockImplementation(async() => ({operationId: fake.disk.custody.pendingRotation?.operationId, phase: 'confirmed'}));

      await tabA.submitRotation(status(OLD_KEY));
      expect(resolvesByB).toBe(0);
      expect(fake.disk.custody.signingKey).toBe(NEW_KEY);
    } finally {
      uninstall();
    }
  });

  it('refuses a second update while another tab sends one', async() => {
    const uninstall = installLocks();
    try {
      const tabA = newSession();
      const tabB = newSession();
      await prepare(tabA);
      await prepare(tabB);
      let refusal: any;
      fake.engine.sendBoc.mockImplementation(async(request: any) => {
        refusal = await tabB.submitRotation(status(OLD_KEY)).catch((err) => err);
        return {operationId: request.operationId, phase: 'submitted'};
      });
      fake.engine.resolvePending.mockImplementation(async() => ({operationId: fake.disk.custody.pendingRotation?.operationId, phase: 'confirmed'}));

      await tabA.submitRotation(status(OLD_KEY));
      expect(refusal).toMatchObject({type: 'ROTATION_ALREADY_SENDING'});
      expect(fake.engine.sendBoc).toHaveBeenCalledTimes(1);
    } finally {
      uninstall();
    }
  });
});

describe('an update from before a reload, while its window is open', () => {
  it('stays pending when the journal names nothing yet', async() => {
    addPendingRotation();
    const session = newSession();
    await session.getMatchingRecord(status(OLD_KEY));
    await (session as any).rotationResume;
    expect(fake.disk.custody.pendingRotation?.operationId).toBe('op-rotation');
    expect(fake.disk.secrets.has(NEW_SECRET)).toBe(true);
  });
});

describe('the custody records', () => {
  const OTHER_ADDRESS = 'UQ-another-wallet';

  it('keep a key restored while an old one is being dropped', async() => {
    // * the device's key is of another wallet now: the account's wallet was replaced elsewhere
    fake.disk.custody.address = OTHER_ADDRESS;
    const old = structuredClone(fake.disk.custody);
    const session = newSession();
    let restoring: Promise<WalletCustodyRecord>;
    // * the restore lands between the drop's read of the record and its delete
    fake.disk.afterCustodyRead = async() => {
      restoring = session.restoreFromWords(fake.NEW_WORDS, status(NEW_KEY));
      for(let i = 0; i < 20; ++i) await pause(0);
    };

    await session.dropParked(old);
    const restored = await restoring;
    expect(fake.disk.custody?.recordId).toBe(restored.recordId);
    expect(fake.disk.secrets.has(restored.secretRef)).toBe(true);
    expect(fake.disk.secrets.has(old.secretRef)).toBe(false);
    expect(fake.disk.parked.size).toBe(0);
  });

  it('never take a wallet whose address could not be read for an old one', async() => {
    fake.disk.custody.address = 'bad:' + fake.ADDRESS;
    fake.managers.appWalletManager.getAddressFunds.mockResolvedValue({nanos: '0', neverUsed: true});
    const state = await newSession().getParkedState(status(OLD_KEY));
    expect(state.wallets).toEqual([]);
    expect(fake.disk.custody).toBeDefined();
    expect(fake.disk.secrets.has(OLD_SECRET)).toBe(true);
  });

  it('drop an old wallet\'s key with the new phrase of its update', async() => {
    addPendingRotation();
    fake.disk.custody.address = OTHER_ADDRESS;
    fake.managers.appWalletManager.getAddressFunds.mockResolvedValue({nanos: '0', neverUsed: true});

    const state = await newSession().getParkedState(status(OLD_KEY));
    expect(state.wallets).toEqual([]);
    expect(fake.disk.custody).toBeUndefined();
    expect(fake.disk.secrets.size).toBe(0);
  });

  it('keep the new phrase of a confirmed update when the old one is restored against a stale status', async() => {
    // * the chain took the update, the server still serves the old key
    fake.disk.secrets.set(NEW_SECRET, textEncoder.encode(fake.NEW_WORDS.join(' ')));
    Object.assign(fake.disk.custody, {secretRef: NEW_SECRET, signingKey: NEW_KEY, awaitingServerKey: OLD_KEY, rotatedSinceBackup: true});
    fake.disk.secrets.delete(OLD_SECRET);

    await expect(newSession().restoreFromWords(fake.OLD_WORDS, status(OLD_KEY))).rejects.toMatchObject({type: 'WALLET_PHRASE_OUTDATED'});
    expect(fake.disk.custody).toMatchObject({secretRef: NEW_SECRET, signingKey: NEW_KEY});
    expect([...fake.disk.secrets.keys()]).toEqual([NEW_SECRET]);
  });

  it('drop only the key the user was asked about', async() => {
    const session = newSession();
    // * another tab put another key in its place while the question was open
    expect(await session.forgetKey('record-asked-about')).toBe(false);
    expect(fake.disk.custody?.recordId).toBe('record-old');
    expect(fake.disk.secrets.has(OLD_SECRET)).toBe(true);

    expect(await session.forgetKey('record-old')).toBe(true);
    expect(fake.disk.custody).toBeUndefined();
    expect(fake.disk.secrets.has(OLD_SECRET)).toBe(false);
  });

  it('are not replaced, nor the phrase shown, while a key update is on its way', async() => {
    addPendingRotation();
    // * the journal does not answer: the update stays pending
    fake.engine.resolvePending.mockReturnValue(new Promise(() => {}));
    const session = newSession();
    const askPassword = vi.fn();

    await expect(session.restoreFromWords(fake.OLD_WORDS, status(OLD_KEY))).rejects.toMatchObject({type: 'ROTATION_PENDING'});
    await expect(session.replaceWithImported(fake.OLD_WORDS, askPassword)).rejects.toMatchObject({type: 'ROTATION_PENDING'});
    await expect(session.revealPhrase(status(OLD_KEY))).rejects.toMatchObject({type: 'ROTATION_PENDING'});
    expect(askPassword).not.toHaveBeenCalled();
    expect([...fake.disk.secrets.keys()].sort()).toEqual([NEW_SECRET, OLD_SECRET].sort());
    expect(fake.disk.custody.pendingRotation.secretRef).toBe(NEW_SECRET);
  });
});

describe('a transfer whose outcome is unknown', () => {
  const params = {destination: fake.ADDRESS, bounce: false, nanograms: '1000000000'};
  // * what the engine host does with the transfer's broadcast: the server is asked, and answers as it answers
  const broadcast = (answer?: Parameters<WalletSubmission['onAnswer']>[0]) => {
    const submission = vi.mocked(setWalletSubmission).mock.calls.map(([value]) => value).filter(Boolean).pop();
    submission.rpcStarted = true;
    if(answer) submission.onAnswer(answer);
  };

  it('is a transfer still sending, not an error, when the engine cannot tell', async() => {
    fake.engine.send.mockImplementation(async() => {
      broadcast({outcome: 'uncertain', error: 'INTERNAL'});
      throw new Error('submission outcome is unknown: MTP: INTERNAL');
    });

    const outcome = await newSession().send(status(OLD_KEY), params);
    expect(outcome.result.phase).toBe('submissionUnknown');
    expect(outcome.result.operationId).toBe(fake.engine.send.mock.calls[0][0].operationId);
    expect(outcome.answer).toMatchObject({outcome: 'uncertain'});
  });

  it('is one too when the server got it and the engine failed otherwise', async() => {
    fake.engine.send.mockImplementation(async() => {
      broadcast();
      throw new Error('the request timed out');
    });

    expect((await newSession().send(status(OLD_KEY), params)).result.phase).toBe('submissionUnknown');
  });

  it('is an error when the server refused it, or it never reached the server', async() => {
    fake.engine.send.mockImplementation(async() => {
      broadcast({outcome: 'rejected', error: 'WALLET_TRANSFER_SEND_FAILED'});
      throw new Error('send failed: WALLET_TRANSFER_SEND_FAILED');
    });
    await expect(newSession().send(status(OLD_KEY), params)).rejects.toThrow('send failed');

    fake.engine.send.mockRejectedValue(new Error('insufficient wallet balance'));
    await expect(newSession().send(status(OLD_KEY), params)).rejects.toThrow('insufficient');
  });

  it('names the chat message it made, so a later verdict can fail it', async() => {
    fake.engine.send.mockImplementation(async() => {
      broadcast({outcome: 'uncertain', error: 'INTERNAL'});
      throw new Error('submission outcome is unknown: MTP: INTERNAL');
    });

    const toUser = await newSession().send(status(OLD_KEY), {...params, userId: 5 as UserId});
    const submission = vi.mocked(setWalletSubmission).mock.calls.map(([value]) => value).filter(Boolean).pop();
    expect(submission.draft).toBeTruthy();
    expect(toUser.draftRandomId).toBe(submission.randomId);

    // * a transfer to a bare address leaves nothing in a chat
    expect((await newSession().send(status(OLD_KEY), params)).draftRandomId).toBeUndefined();
  });

  it('holds a link\'s deadline on the chain, never past a transfer\'s own, and refuses one that has passed', async() => {
    fake.engine.send.mockImplementation(async() => ({operationId: 'op', phase: 'submitted'}));
    const session = newSession();
    await session.send(status(OLD_KEY), {...params, payload: 'te6cc', expiresAt: fake.NOW + 60});
    await session.send(status(OLD_KEY), {...params, expiresAt: fake.NOW + 86400});
    const [near, far] = fake.engine.send.mock.calls.map(([request]) => request.intent);
    expect(near.expiration).toEqual({kind: 'exact', unixTimestamp: fake.NOW + 60});
    expect(near.messages[0].body).toEqual({kind: 'rawPayload', boc: 'te6cc'});
    expect(far.expiration).toEqual({kind: 'exact', unixTimestamp: fake.NOW + 300});

    await expect(session.send(status(OLD_KEY), {...params, expiresAt: fake.NOW})).rejects.toMatchObject({type: 'WALLET_LINK_EXPIRED'});
    expect(fake.engine.send).toHaveBeenCalledTimes(2);
  });

  it('quotes once more a moment after a stale seqno, and never off an unfinished trace', async() => {
    vi.useFakeTimers({toFake: ['setTimeout']});
    try {
      const emulation = (isIncomplete: boolean) => ({emulation: {walletFeesNanograms: '5', isIncomplete}});
      fake.engine.previewSend.mockReset()
      .mockRejectedValueOnce(new Error('emulation message was not accepted: EmulationExternalNotAccepted: 133'))
      .mockResolvedValueOnce(emulation(false))
      .mockRejectedValueOnce(new Error('emulation message was not accepted: exit code 37'))
      .mockResolvedValueOnce(emulation(true));
      const session = newSession();

      const quoted = session.previewSend(status(OLD_KEY), params);
      await vi.advanceTimersByTimeAsync(1000);
      expect((await quoted).emulation.walletFeesNanograms).toBe('5');
      // * any other refusal is the answer
      await expect(session.previewSend(status(OLD_KEY), params)).rejects.toThrow('exit code 37');
      await expect(session.previewSend(status(OLD_KEY), params)).rejects.toMatchObject({type: 'WALLET_PREVIEW_INCOMPLETE'});
      expect(fake.engine.previewSend).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives each engine client a host of its own, and closes it with its client', async() => {
    const made = (WalletStatuslessHostImpl as any).made as {closed: boolean}[];
    made.length = 0;
    const session = newSession();
    await session.getClient(status(OLD_KEY));
    // * the key is gone: a client that only reads takes the place of the one that signed
    fake.disk.custody = undefined;
    await session.getClient(status(OLD_KEY));
    for(let i = 0; i < 5; ++i) await pause(0);
    expect(made.map((host) => host.closed)).toEqual([true, false]);
  });

  it('lets a dApp\'s transfer approved while another one sends wait its turn, as long as the request lasts', async() => {
    let release: () => void;
    fake.engine.send
    .mockImplementationOnce(() => new Promise((resolve) => release = () => resolve({operationId: 'op-first', phase: 'submitted'})))
    .mockImplementation(async(request: any) => ({operationId: request.operationId, phase: 'submitted'}));
    const session = newSession();
    const first = session.send(status(OLD_KEY), params);
    await vi.waitFor(() => expect(fake.engine.send).toHaveBeenCalledTimes(1));

    const intent = (unixTimestamp: number) => ({messages: [], expiration: {kind: 'exact', unixTimestamp}}) as any;
    const dApp = session.sendTonConnect(status(OLD_KEY), 'ton-connect:77:3', intent(fake.NOW + 60));
    // * one whose time is up fails at once instead
    await expect(session.sendTonConnect(status(OLD_KEY), 'ton-connect:77:4', intent(fake.NOW))).rejects.toMatchObject({type: 'WALLET_LINK_EXPIRED'});
    for(let i = 0; i < 10; ++i) await pause(0);
    expect(fake.engine.send).toHaveBeenCalledTimes(1);

    release();
    await first;
    expect((await dApp).result.operationId).toBe('ton-connect:77:3');
    expect(fake.engine.send).toHaveBeenCalledTimes(2);
  });

  it('goes out on the account it was started on, after the tab switched to another', async() => {
    fake.engine.send.mockImplementation(async() => ({operationId: 'op', phase: 'submitted'}));
    const made = (WalletStatuslessHostImpl as any).made as {managers: unknown}[];
    made.length = 0;
    const session = newSession();
    const tabManagers = rootScope.managers;
    // * the tab now shows another account, whose managers this one's transfer must never reach
    (rootScope as any).managers = {timeManager: {getServerTime: () => Promise.reject(new Error('another account'))}};
    try {
      await session.send(status(OLD_KEY), {...params, expiresAt: fake.NOW + 60});
      expect(fake.engine.send).toHaveBeenCalledTimes(1);
      // * the broadcast goes through the engine host made with the session's own managers
      expect(made.map((host) => host.managers)).toEqual([tabManagers]);
    } finally {
      (rootScope as any).managers = tabManagers;
    }
  });

  it('settles what an earlier tab left unresolved before it signs', async() => {
    fake.engine.send.mockImplementation(async() => ({operationId: 'op', phase: 'submitted'}));
    await newSession().send(status(OLD_KEY), params);
    expect(fake.engine.resolvePending).toHaveBeenCalledTimes(1);
    expect(fake.engine.resolvePending.mock.invocationCallOrder[0]).toBeLessThan(fake.engine.send.mock.invocationCallOrder[0]);
  });

  it('is settled by the engine\'s journal, which is never asked mid-send', async() => {
    fake.engine.resolvePending.mockResolvedValue({operationId: 'op-transfer', phase: 'confirmed'});
    const session = newSession();
    expect(await session.resolvePendingSend(status(OLD_KEY))).toEqual({operationId: 'op-transfer', phase: 'confirmed'});

    let midSend: any = 'not asked';
    fake.engine.send.mockImplementation(async() => {
      midSend = await session.resolvePendingSend(status(OLD_KEY));
      return {operationId: 'op', phase: 'submitted'};
    });
    await session.send(status(OLD_KEY), params);
    expect(midSend).toBeUndefined();
  });
});

describe('proving the wallet is this device\'s', () => {
  it('signs Telegram\'s own challenge only, and only while it lives', async() => {
    const challenge = fake.managers.appWalletManager.getProofChallenge;
    for(const refused of [
      {domain: 'example.com', expires: 2e9},
      {domain: 'telegram.org', expires: fake.NOW}
    ]) {
      challenge.mockResolvedValueOnce({_: 'wallet.proofChallenge', payload: 'challenge', ...refused});
      await expect(newSession().disableBackup(status(OLD_KEY))).rejects.toMatchObject({type: 'WALLET_PROOF_INVALID'});
    }

    expect(fake.managers.appWalletManager.disableBackup).not.toHaveBeenCalled();
    await newSession().disableBackup(status(OLD_KEY));
    expect(fake.managers.appWalletManager.disableBackup).toHaveBeenCalledTimes(1);
  });
});
