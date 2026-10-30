/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {
  BrowserPlatformHost,
  NftTransferIntent,
  ProtectedSecretRead,
  SendIntent,
  SendExpiration,
  SendMessageBody,
  SendPreview,
  SendResult,
  SendSnapshot,
  WalletClient,
  WalletClientConfig,
  WalletDescriptor,
  WalletLifecycle
} from '@ton/wallet-engine';
import type {InputCheckPasswordSRP, WalletOwnershipProof, WalletSecretPhraseParts, WalletTransaction} from '@layer';
import type {WalletStatus} from '@appManagers/appWalletManager';
import rootScope from '@lib/rootScope';
import bindManagersToAccount from '@lib/accounts/bindManagersToAccount';
import {getCurrentAccount} from '@lib/accounts/getCurrentAccount';
import type {AppManagers} from '@lib/managers';
import bytesToHex from '@helpers/bytes/bytesToHex';
import bytesFromHex from '@helpers/bytes/bytesFromHex';
import base64ToBytes from '@helpers/string/base64ToBytes';
import {randomLong} from '@helpers/random';
import {toFriendlyTonAddress} from '@lib/wallet/tonAddress';
import {getGramTransferFailure, GramTransferDraftContent, isDefiniteTransferRefusal} from '@lib/wallet/transferMessages';
import WalletVault, {WalletCustodyRecord, WalletPendingRotation, WalletVaultLockedError} from '@lib/wallet/vault';
import {
  breakRotationSignature,
  emulateTraceRequest,
  isRecordSigningFor,
  isRotationFeeCovered,
  isRotationJournalAuthoritative,
  isRotationSubmissionUnknown,
  makeRotationQuote,
  parseEmulatedTrace,
  promoteRotationRecord,
  rotationErrorType,
  rotationSnapshotVerdict,
  settleAwaitingServerKey,
  WalletRotationQuote,
  WalletRotationVerdict
} from '@lib/wallet/rotation';
import pause from '@helpers/schedulers/pause';
import createSerializedQueue from '@helpers/createSerializedQueue';
import {setWalletSubmission, TONCENTER_BASE_URL, WalletStatuslessHostImpl, WalletSubmission, WalletSubmissionAnswer} from '@lib/wallet/engineHost';
import {encryptedCommentFeeBody, serverCommentBody} from '@lib/wallet/commentBody';
import type {WalletAddressFunds} from '@lib/wallet/addressFunds';
import bigInt from 'big-integer';

type EngineModule = typeof import('@ton/wallet-engine');

let enginePromise: Promise<EngineModule>;

/**
 * The engine is ~3 MB of WebAssembly: it is fetched the first time the wallet needs it, never with the app.
 */
export function loadWalletEngine() {
  // * a failed download or init is not remembered: the next use tries again
  return enginePromise ??= import('@ton/wallet-engine').then(async(engine) => {
    await engine.initializeWalletEngine();
    return engine;
  }).catch((err) => {
    enginePromise = undefined;
    throw err;
  });
}

/**
 * - `full`: this device keeps the phrase and can sign;
 * - `restorable`: it can only view, but the phrase can be fetched from Telegram's backup (2FA password);
 * - `notRestorable`: it can only view, and the only way to sign is to type the phrase.
 */
export type WalletDeviceMode = 'unknown' | 'full' | 'restorable' | 'notRestorable';

export type WalletSecretReason = ProtectedSecretRead['reason'] | 'install';

export interface WalletSessionUi {
  /** asks for the wallet passcode; rejects when the user cancels */
  unlockVault(vault: WalletVault, reason: WalletSecretReason): Promise<void>;
  /** lets the user pick how the key is protected on this device; rejects when cancelled */
  createVault(vault: WalletVault): Promise<void>;
  /**
   * shows the old wallets this device keeps a key of, until the user saved their phrases and dropped them all;
   * rejects when the user leaves first
   */
  resolveConflict?(): Promise<void>;
}

/**
 * The key of a wallet the account no longer uses, still on this device, and what that wallet holds
 */
export type WalletParkedWallet = {
  record: WalletCustodyRecord,
  /** nanograms; unknown when the chain did not answer */
  nanos?: string
};

export type WalletParkedState = {
  wallets: WalletParkedWallet[],
  /** what they hold together; unknown while any of them is */
  nanos?: string
};

export type WalletRestoreError =
  | 'WALLET_PHRASE_INVALID'
  | 'WALLET_PHRASE_FOREIGN'
  | 'WALLET_PHRASE_OTHER_WALLET'
  | 'WALLET_PHRASE_OUTDATED'
  | 'WALLET_NOT_READY';

export type WalletSendParams = {
  /** user-friendly or raw address of the recipient */
  destination: string,
  bounce: boolean,
  /** with `sendAll`, what is expected to arrive (the balance less the quoted fee): the chat's message shows it */
  nanograms: string,
  /** the whole balance goes, the network fee is taken out of it (the contract's "all" mode) */
  sendAll?: boolean,
  comment?: string,
  /** encrypt the comment for the recipient (private) instead of writing it in the clear */
  encryptComment?: boolean,
  /** a link's own message body (BOC, base64): it goes when no comment is written instead (iOS) */
  payload?: string,
  /** the link's deadline (unix seconds): the transfer is not valid on the chain after it */
  expiresAt?: number,
  recipientPublicKey?: Uint8Array,
  userId?: UserId,
  gasless?: boolean,
  /** every answer the server gives for this transfer, also one that comes after `send` returned */
  onAnswer?: (answer: WalletSubmissionAnswer) => void
};

export type WalletNftSendParams = {
  /** the preview's and the send's: the transfer's query id comes from it */
  operationId: string,
  nftAddress: string,
  /** the new owner */
  destination: string,
  bounce: boolean,
  comment?: string,
  userId?: UserId,
  onAnswer?: (answer: WalletSubmissionAnswer) => void
};

/** what goes to the collectible's contract with the transfer; what the transfer leaves comes back */
export const NFT_TRANSFER_ATTACHED_NANOS = '50000000';
/** what the new owner gets with the ownership notice */
const NFT_TRANSFER_FORWARD_NANOS = '1';

/** what an operation of a TON Connect session gets to sign with (`withTonConnectSigner`) */
export type WalletTonConnectSigner = {
  /** the ed25519 seed of the key that signs now: wiped when the operation ends */
  seed: Uint8Array,
  /** its public key, hex */
  signingKey: string,
  account: () => Promise<{address: string, network: string, walletStateInit: string, publicKey: string}>,
  signProof: (domain: string, timestamp: number, payload: string) => Promise<Uint8Array>
};

export type WalletSendOutcome = {
  result: SendResult,
  answer?: WalletSubmissionAnswer,
  /** the chat's "sending" message this transfer made, by its random id: a later verdict fails it */
  draftRandomId?: string
};

/**
 * What the recipient's chat shows while a transfer to a Telegram user is out, in the form it went
 */
function getTransferDraft(params: WalletSendParams): GramTransferDraftContent {
  const address = params.userId && toFriendlyTonAddress(params.destination, params.bounce);
  if(!address) {
    return;
  }

  const comment = params.comment?.trim();
  return {
    amount: params.nanograms,
    address,
    comment,
    commentEncrypted: !!comment && !!params.encryptComment
  };
}

/**
 * Whether a failed send may still have gone out: the engine says its submission outcome is unknown, or the server got
 * the transfer and gave no clear answer to it. Only a refusal the server sent, or a failure before it was asked, is
 * known to have sent nothing.
 */
export function isSendOutcomeUnknown(error: any, submission: Pick<WalletSubmission, 'rpcStarted'>, answer?: WalletSubmissionAnswer) {
  return isRotationSubmissionUnknown(error) || (!!submission.rpcStarted && answer?.outcome !== 'rejected');
}

export function walletError(type: string) {
  const error = new Error(type);
  (error as any).type = type;
  return error;
}

const PREVIEW_RECORD_ID = 'public-key-only';
/** the domain of the challenge a wallet's ownership is proven with (iOS: WalletOperations) */
const OWNERSHIP_PROOF_DOMAIN = 'telegram.org';
const SEND_VALIDITY_SECONDS = 300;
/** the emulation's refusal of an external message whose seqno is stale: exit code 133, however the engine words it */
const PREVIEW_SEQNO_LAG_REGEXP = /(?:not accepted|NotAccepted)[^]*\b133\b(?!\.\d)/i;
const PREVIEW_SEQNO_RETRY_DELAY = 1e3;
const RESOLUTION_MARGIN_SECONDS = 60;
const REQUEST_TIMEOUT = 15e3;
/** the fee quote's throwaway update is never sent: a short window is enough to emulate it */
const ROTATION_QUOTE_VALIDITY_SECONDS = 120;
const ROTATION_POLL_INTERVAL = 3e3;
/** past the window and the engine's own margin, before a sent update is left to settle later */
const ROTATION_WATCH_MARGIN = 60e3;
/** how often a pending update from before a reload is looked at again */
const ROTATION_RESUME_INTERVAL = 30e3;
/** how long a backup change waits for the server to serve the key an update installed */
const SERVED_KEY_WAIT = 30e3;

/**
 * A key update signed and handed out to be written down, not sent yet. It lives in memory only.
 */
type PreparedRotation = {
  /** the record it was signed for */
  recordId: string,
  words: string[],
  newSigningKey: string,
  signedBoc: string,
  seqno: number,
  validUntil: number,
  /** the quoted fee, nanograms */
  fee: string
};

const sessions: Map<UserId, WalletSession> = new Map();

/**
 * Runs `task` holding the Web Lock `name`, which every tab of the origin shares; a tab that closes lets it go.
 * `ifAvailable`: when another holder has it, `task` does not run and nothing comes back. Without the Locks API the task
 * runs as it is.
 */
export function withTabsLock<T>(name: string, ifAvailable: boolean, task: () => Promise<T>): Promise<T | undefined> {
  const locks = typeof(navigator) !== 'undefined' ? navigator.locks : undefined;
  if(!locks) {
    return task();
  }

  return locks.request(name, {ifAvailable}, (lock) => lock ? task() : undefined);
}

/**
 * The key the server gives for a Telegram recipient, when it still derives their address: it spares the engine the
 * chain lookup. After a key update the server serves the new key while the address stays the anchor key's, and the
 * engine refuses a key that derives another address — then the chain is asked (`get_public_key`). Checked with the
 * lookup that touches no secret, so the step that needs the key is never asked for twice.
 */
async function recipientKeyHint(client: WalletClient, destination: string, publicKey?: Uint8Array): Promise<number[] | null> {
  if(!publicKey) {
    return null;
  }

  const key = Array.from(publicKey);
  try {
    await client.resolveEncryptedCommentRecipient({recipient: destination, recipientPublicKey: key});
    return key;
  } catch(err) {
    return null;
  }
}

/** a client goes, then what it still has out on the network: its own requests only */
function closeClient(client: {promise: Promise<WalletClient>, host: WalletStatuslessHostImpl}) {
  client?.promise.then((client) => client.close()).catch(() => {}).finally(() => client.host.close());
}

export default class WalletSession {
  public static get(userId: UserId = rootScope.myId.toUserId()) {
    let session = sessions.get(userId);
    if(!session) {
      sessions.set(userId, session = new WalletSession(userId));
    }

    return session;
  }

  public vault: WalletVault;
  public ui: WalletSessionUi;
  /** its account's, for good */
  public readonly managers: AppManagers;

  private platformHost: BrowserPlatformHost;
  private lifecycle: Promise<WalletLifecycle>;
  /** its own host: a client numbers its requests from the start, and a closed one's late answers stay its own */
  private client: {key: string, promise: Promise<WalletClient>, host: WalletStatuslessHostImpl};
  private clientQueue: Promise<unknown> = Promise.resolve();
  private sending: boolean;
  /** settles once the transfer `sending` stands for is done, either way */
  private sendSettled: Promise<void>;
  private unlocking: Promise<void>;
  private preparedRotation: PreparedRotation;
  /** a quote or a prepare of a key update runs */
  private rotationBusy: boolean;
  /** this tab sends an update and waits for the chain itself */
  private rotationSubmitting: boolean;
  private rotationResume: Promise<void>;
  private rotationResumedAt = 0;
  private rotationPromotion: Promise<WalletCustodyRecord>;
  /** by address: what each old wallet holds, asked once a window unless refreshed */
  private parkedFunds: Map<string, Promise<WalletAddressFunds | undefined>> = new Map();
  /** tdesktop's custodyBusy(): one change of the custody records at a time */
  private custodyQueue = createSerializedQueue();

  constructor(private userId: UserId) {
    this.vault = new WalletVault(userId);
    // * made for the account the tab shows (`get` asks for its user): what is started on it — a transfer, a key
    // * update, a backup change — is seen through on that account after the tab switched to another
    this.managers = bindManagersToAccount(rootScope.managers, getCurrentAccount());
  }

  /**
   * Every write of the custody records goes through here, in this tab and across the tabs: a write decided on a read
   * must not land on a record another write replaced meanwhile. Not re-entrant: a task never calls another locked
   * method, and holds nothing that waits for the user or the network.
   */
  private withCustody<T>(task: () => Promise<T>): Promise<T> {
    // * waited for, so it always runs
    return this.custodyQueue.enqueue(() => withTabsLock('tweb-wallet-custody:' + this.userId, false, task) as Promise<T>);
  }

  /**
   * A key update's submission and its settling after a reload exclude each other across the tabs: a tab that settles
   * an update must never take one that another tab is still broadcasting for one that never left. Taken before the
   * custody lock, never inside it.
   */
  private withRotationLock<T>(ifAvailable: boolean, task: () => Promise<T>) {
    return withTabsLock('tweb-wallet-rotation:' + this.userId, ifAvailable, task);
  }

  // MARK: Engine

  public getEngine() {
    return loadWalletEngine();
  }

  private async getPlatformHost() {
    if(this.platformHost) {
      return this.platformHost;
    }

    const engine = await this.getEngine();
    return this.platformHost ??= new engine.BrowserPlatformHost({
      secrets: {
        read: async(request) => {
          await this.ensureUnlocked(request.reason);
          return this.vault.readSecret(request.secretRef.value);
        },
        store: async(request) => {
          await this.ensureVault();
          const bytes = new Uint8Array(request.bytes);
          try {
            await this.vault.storeSecret(request.secretRef.value, bytes);
          } finally {
            bytes.fill(0);
          }
        },
        delete: (secretRef) => this.vault.deleteSecret(secretRef.value)
      },
      journal: new engine.IndexedDbJournalStore('tweb-wallet-journal')
    });
  }

  public getLifecycle() {
    if(this.lifecycle) return this.lifecycle;
    const promise = this.lifecycle = Promise.all([this.getEngine(), this.getPlatformHost()]).then(([engine, platformHost]) => {
      return engine.WalletLifecycle.create(platformHost);
    });

    promise.catch(() => {
      if(this.lifecycle === promise) this.lifecycle = undefined;
    });

    return promise;
  }

  /**
   * A client bound to this device's key when it has one, otherwise one that knows only the public key: it reads
   * the chain and quotes fees with a placeholder signature, and cannot send.
   */
  /**
   * One client at a time: calls are queued, so two concurrent ones never build two clients for the same key.
   */
  public getClient(status: WalletStatus): Promise<WalletClient> {
    const promise = this.clientQueue.then(() => this.getClientUnqueued(status));
    this.clientQueue = promise.catch(() => {});
    return promise;
  }

  private async getClientUnqueued(status: WalletStatus): Promise<WalletClient> {
    const state = status.state;
    if(!state) {
      throw walletError('WALLET_NOT_READY');
    }

    const record = await this.getMatchingRecord(status);
    const key = record ? 'record:' + record.recordId : 'preview:' + state.address + ':' + bytesToHex(state.public_key);
    if(this.client?.key === key) {
      return this.client.promise;
    }

    const previous = this.client;
    const engine = await this.getEngine();
    const config: WalletClientConfig = {
      recordId: record ? record.recordId : PREVIEW_RECORD_ID,
      address: record ? record.address : state.address,
      publicKey: Array.from(record ? bytesFromHex(record.anchorKey) : state.public_key),
      localSecretRef: record ? {value: record.secretRef} : undefined,
      network: 'mainnet',
      sendValiditySeconds: SEND_VALIDITY_SECONDS,
      resolutionMarginSeconds: RESOLUTION_MARGIN_SECONDS,
      providers: {
        toncenterBaseUrl: TONCENTER_BASE_URL,
        dnsRootAddress: null,
        requestTimeoutMs: REQUEST_TIMEOUT
      }
    };

    const host = new WalletStatuslessHostImpl(this.managers);
    const promise = this.getPlatformHost().then((platformHost) => {
      return engine.WalletClient.createStatusless(config, {
        platformHost,
        statuslessHost: host
      });
    });

    this.client = {key, promise, host};
    promise.catch(() => {
      if(this.client?.promise === promise) {
        this.client = undefined;
      }
    });

    closeClient(previous);
    return promise;
  }

  public close() {
    closeClient(this.client);
    this.client = undefined;
    this.lifecycle?.then((lifecycle) => lifecycle.close()).catch(() => {});
    this.lifecycle = undefined;
  }

  // MARK: Vault

  private async ensureVault() {
    if(this.vault.isUnlocked()) {
      return;
    }

    const kind = await this.vault.getKind();
    if(!kind) {
      if(!this.ui) {
        throw new WalletVaultLockedError();
      }

      await this.ui.createVault(this.vault);
      // * another tab made the vault meanwhile: the prompt let it be, it is unlocked like any other
      if(this.vault.isUnlocked()) {
        return;
      }
    }

    await this.ensureUnlocked('install');
  }

  public async ensureUnlocked(reason: WalletSecretReason) {
    if(this.vault.isUnlocked() || await this.vault.unlockSilently()) {
      return;
    }

    if(!this.ui) {
      throw new WalletVaultLockedError();
    }

    // * reads that need the key at once share one prompt
    const unlocking = this.unlocking ??= this.ui.unlockVault(this.vault, reason).finally(() => {
      if(this.unlocking === unlocking) this.unlocking = undefined;
    });

    await unlocking;
    if(!this.vault.isUnlocked()) {
      throw new WalletVaultLockedError();
    }
  }

  // MARK: Custody

  /**
   * The local key, if it is the key of the wallet the server serves now: same address, and the signing key
   * the server knows as current — or the one this device's confirmed key update installed, until the server
   * catches up. A pending update is settled on the way (see `reconcileRotation`).
   */
  public async getMatchingRecord(status: WalletStatus) {
    const state = status.state;
    let record = await this.vault.getCustody();
    if(!state || !record) {
      return;
    }

    if(!(await this.isSameAddress(record.address, state.address))) {
      return;
    }

    record = await this.reconcileRotation(record, status);
    if(!isRecordSigningFor(record, bytesToHex(state.public_key))) {
      return;
    }

    if(!(await this.vault.hasSecret(record.secretRef))) {
      return;
    }

    return record;
  }

  public async getDeviceMode(status: WalletStatus): Promise<WalletDeviceMode> {
    if(status.presence !== 'ready' || !status.state) {
      return 'unknown';
    }

    if(await this.getMatchingRecord(status)) {
      return 'full';
    }

    return status.state.pFlags.can_export_phrase ? 'restorable' : 'notRestorable';
  }

  /**
   * Whether two addresses name one wallet; nothing when either of them could not be read — then neither answer is
   * known, and each caller fails closed its own way.
   */
  private async compareAddresses(a: string, b: string): Promise<boolean | undefined> {
    if(a === b) {
      return true;
    }

    const engine = await this.getEngine();
    try {
      const [rawA, rawB] = await Promise.all([
        engine.convertTonAddress(a, {kind: 'raw'}),
        engine.convertTonAddress(b, {kind: 'raw'})
      ]);
      return rawA === rawB;
    } catch(err) {}
  }

  /** known to be one wallet; an address that could not be read is not */
  public async isSameAddress(a: string, b: string) {
    return await this.compareAddresses(a, b) === true;
  }

  /** known to be another wallet; an address that could not be read is never taken for one */
  public async isOtherAddress(a: string, b: string) {
    return await this.compareAddresses(a, b) === false;
  }

  public async friendlyAddress(address: string, bounceable = false) {
    const engine = await this.getEngine();
    return engine.convertTonAddress(address, {kind: 'userFriendly', bounceable, testnet: false});
  }

  /**
   * Installs the phrase of the served wallet on this device. Nothing is sent to the server: the phrase must
   * derive the served address (else it is another wallet) and the served signing key (else it is a phrase
   * from before a key update).
   */
  public async restoreFromWords(words: string[], status: WalletStatus): Promise<WalletCustodyRecord> {
    const state = status.state;
    if(!state) {
      throw walletError('WALLET_NOT_READY');
    }

    words = words.map((word) => word.trim().toLowerCase()).filter(Boolean);
    if(words.length !== 12 && words.length !== 24) {
      throw walletError('WALLET_PHRASE_INVALID');
    }

    const engine = await this.getEngine();
    const schemes = await engine.detectMnemonicSchemes(words);
    if(!schemes.includes('rotation')) {
      throw walletError(schemes.length ? 'WALLET_PHRASE_FOREIGN' : 'WALLET_PHRASE_INVALID');
    }

    await this.refuseWhileRotating();
    await this.ensureVault();
    const lifecycle = await this.getLifecycle();
    const descriptor = await lifecycle.importWallet({
      recordId: crypto.randomUUID(),
      network: 'mainnet',
      recoveryWords: words
    });

    // * whatever goes wrong from here, the imported secret does not stay behind
    try {
      if(!(await this.isSameAddress(descriptor.address, state.address))) {
        throw walletError('WALLET_PHRASE_OTHER_WALLET');
      }

      // * the proof is signed by the current signing key: that is how the signing half is learnt
      const signingKey = await this.getSigningKey(lifecycle, descriptor);
      if(signingKey !== bytesToHex(state.public_key)) {
        throw walletError('WALLET_PHRASE_OUTDATED');
      }

      const record: WalletCustodyRecord = {
        recordId: descriptor.recordId,
        address: descriptor.address,
        anchorKey: bytesToHex(descriptor.publicKey),
        signingKey,
        secretRef: descriptor.secretRef.value,
        network: 'mainnet',
        date: Date.now()
      };

      // * nothing went to the server: an update that started meanwhile wins, the restore is refused
      await this.installRecord(record, true);
      return record;
    } catch(err) {
      await lifecycle.deleteWallet(descriptor).catch(() => {});
      throw err;
    }
  }

  /**
   * A key update on its way holds the custody: nothing replaces the record under it (tdesktop refuses the same)
   */
  private async refuseWhileRotating() {
    if((await this.vault.getCustody())?.pendingRotation) {
      throw walletError('ROTATION_PENDING');
    }
  }

  /**
   * Makes `record` the device's key and retires the one it replaces, as read under the lock: an older phrase of the
   * same wallet is dropped, the key of another wallet is parked — its phrase is still the only way into that wallet's
   * funds. So is a record with a key update on its way, together with the update: whether the chain took the new
   * phrase is not known here. `refuseRotating`: such an update refuses the install instead.
   *
   * Each step leaves a key reachable if the next one fails: the old record is parked before the new one replaces it,
   * and an old phrase is deleted only once the new record is stored.
   */
  private installRecord(record: WalletCustodyRecord, refuseRotating: boolean) {
    return this.withCustody(async() => {
      const previous = await this.vault.getCustody();
      if(refuseRotating && previous?.pendingRotation) {
        throw walletError('ROTATION_PENDING');
      }

      // * the phrase a confirmed update replaced, while the server still serves its key (a stale status, another
      // * tab): the new phrase stays — it may be its only copy, the backup went off with the update
      if(previous?.awaitingServerKey && record.signingKey === previous.awaitingServerKey && await this.isSameAddress(previous.address, record.address)) {
        throw walletError('WALLET_PHRASE_OUTDATED');
      }

      const retired = previous && previous.secretRef !== record.secretRef ? previous : undefined;
      const park = !!retired && (!!retired.pendingRotation || !(await this.isSameAddress(retired.address, record.address)));
      if(park) {
        await this.vault.parkCustody(retired);
      }

      await this.vault.saveCustody(record);
      if(retired && !park) {
        await this.vault.deleteSecret(retired.secretRef).catch(() => {});
      }
    });
  }

  // MARK: Replace

  /**
   * A new wallet made by the server in place of the account's current one
   */
  public async replaceWithNew(password?: InputCheckPasswordSRP) {
    await this.refuseWhileRotating();
    return this.managers.appWalletManager.replaceWallet({_: 'inputWalletNew'}, password);
  }

  /**
   * Brings a wallet in by its phrase: it is imported here, the server gets the proof that this device holds its
   * current signing key, and only once the server serves that very address is the key kept as the account's.
   */
  public async replaceWithImported(words: string[], askPassword: (replace: (password?: InputCheckPasswordSRP) => Promise<WalletStatus>) => Promise<WalletStatus>) {
    words = words.map((word) => word.trim().toLowerCase()).filter(Boolean);
    if(words.length !== 12 && words.length !== 24) {
      throw walletError('WALLET_PHRASE_INVALID');
    }

    const engine = await this.getEngine();
    const schemes = await engine.detectMnemonicSchemes(words);
    if(!schemes.includes('rotation')) {
      throw walletError(schemes.length ? 'WALLET_PHRASE_FOREIGN' : 'WALLET_PHRASE_INVALID');
    }

    await this.refuseWhileRotating();
    await this.ensureVault();
    const lifecycle = await this.getLifecycle();
    const descriptor = await lifecycle.importWallet({
      recordId: crypto.randomUUID(),
      network: 'mainnet',
      recoveryWords: words
    });

    try {
      const signingKey = await this.getSigningKey(lifecycle, descriptor);
      const anchorKey = bytesToHex(descriptor.publicKey);
      const record: WalletCustodyRecord = {
        recordId: descriptor.recordId,
        address: descriptor.address,
        anchorKey,
        signingKey,
        secretRef: descriptor.secretRef.value,
        network: 'mainnet',
        date: Date.now()
      };

      const status = await askPassword(async(password) => {
        // * the challenge allows one attempt: a fresh proof for every try of the password
        const proof = await this.getOwnershipProof(record);
        try {
          return await this.managers.appWalletManager.replaceWallet({
            _: 'inputWalletImported',
            public_key: bytesFromHex(signingKey),
            anchor_public_key: anchorKey !== signingKey ? bytesFromHex(anchorKey) : undefined,
            proof
          }, password);
        } catch(err) {
          // * an answer lost on the way is never resent: what the server serves now tells whether it took the import
          const served = isDefiniteTransferRefusal(err as ApiError) ? undefined : await this.refetchStatus();
          if(served?.state && bytesToHex(served.state.public_key) === signingKey && await this.isSameAddress(served.state.address, descriptor.address)) {
            return served;
          }

          throw err;
        }
      });

      if(!status.state || !(await this.isSameAddress(status.state.address, descriptor.address))) {
        throw walletError('WALLET_KEY_MISMATCH');
      }

      // * the server serves it already: an update that started meanwhile is parked with its record, not refused
      await this.installRecord(record, false);
      return status;
    } catch(err) {
      await lifecycle.deleteWallet(descriptor).catch(() => {});
      throw err;
    }
  }

  private async getSigningKey(lifecycle: WalletLifecycle, descriptor: WalletDescriptor) {
    const signature = await lifecycle.signTonConnectProof({
      descriptor,
      domain: 'web.telegram.org',
      timestamp: Math.floor(Date.now() / 1000),
      payload: 'wallet-key-check'
    });

    return bytesToHex(signature.publicKey);
  }

  /**
   * Reassembles the phrase from Telegram's backup: the export is started (with the 2FA check when the server
   * wants it, through `askPassword`, which retries a wrong password itself), each holder DC returns its share
   * sealed to a one-time key, and the shares XOR back into the seed.
   */
  public async fetchPhraseFromBackup(
    askPassword: (exportWith: (password: InputCheckPasswordSRP) => Promise<WalletSecretPhraseParts>) => Promise<WalletSecretPhraseParts>
  ): Promise<string[]> {
    const managers = this.managers;
    let parts: WalletSecretPhraseParts;
    try {
      parts = await managers.appWalletManager.exportSecretPhrase();
    } catch(err) {
      if((err as ApiError).type !== 'PASSWORD_MISSING') {
        throw err;
      }

      parts = await askPassword((password) => managers.appWalletManager.exportSecretPhrase(password));
    }

    const {generateShareKeyPair, decryptShare, combineShares, wordsFromSeed} = await import('@lib/wallet/phraseShares');
    const keyPair = await generateShareKeyPair();
    try {
      const encrypted = await Promise.all(parts.dcs.map((dcId) => {
        return managers.appWalletManager.fetchEncryptedSecretPhrasePart(dcId, parts.token, keyPair.publicKey);
      }));

      const shares = await Promise.all(encrypted.map((data) => decryptShare(keyPair, data)));
      const seed = combineShares(shares);
      const words = wordsFromSeed(seed);
      seed.fill(0);
      shares.forEach((share) => share.fill(0));
      return words;
    } finally {
      keyPair.secretKey.fill(0);
    }
  }

  public async revealPhrase(status: WalletStatus): Promise<string[]> {
    const record = await this.getMatchingRecord(status);
    if(!record) {
      throw walletError('WALLET_KEY_MISSING');
    }

    // * the record's phrase may be replaced the next moment: written down now, it would be the outdated one (tdesktop)
    if(record.pendingRotation) {
      throw walletError('ROTATION_PENDING');
    }

    return this.revealRecord(record);
  }

  private async revealRecord(record: WalletCustodyRecord) {
    const lifecycle = await this.getLifecycle();
    const phrase = await lifecycle.revealRecoveryPhrase(this.descriptorOf(record));
    return phrase.phrase.trim().split(/\s+/);
  }

  // MARK: Parked

  /**
   * Keys of other wallets this device still holds: one parked when the account's wallet was replaced or restored
   * to another address, or the device's key of a wallet the server no longer serves. The phrase is the only way
   * into what they hold, so until it is saved and the key dropped ("Switch now") tdesktop calls it a conflict,
   * and key-requiring actions stop at it.
   */
  private async getParkedRecords(status: WalletStatus): Promise<WalletCustodyRecord[]> {
    const state = status.state;
    if(!state) {
      return [];
    }

    const [current, parked] = await Promise.all([this.vault.getCustody(), this.vault.getParkedCustody()]);
    const out: WalletCustodyRecord[] = [];
    for(const record of [current, ...parked]) {
      if(!record || out.some((item) => item.recordId === record.recordId)) continue;
      // * an older key of the served wallet is no other wallet, nor is one whose address could not be read: a
      // * wallet taken for another one could be dropped as an empty old one
      if(!(await this.isOtherAddress(record.address, state.address))) continue;
      // * a record without its secret has no phrase to save
      if(!(await this.vault.hasSecret(record.secretRef))) continue;
      out.push(record);
    }

    return out;
  }

  private getParkedFunds(record: WalletCustodyRecord, refresh?: boolean) {
    let promise = this.parkedFunds.get(record.address);
    if(!promise || refresh) {
      promise = this.friendlyAddress(record.address)
      .then((address) => this.managers.appWalletManager.getAddressFunds(address))
      .catch((): WalletAddressFunds => undefined);
      this.parkedFunds.set(record.address, promise);
    }

    return promise;
  }

  /**
   * The old wallets with what they hold. One that is empty and was never used holds nothing worth its phrase:
   * its key goes quietly, the way tdesktop drops it. `refresh` asks the chain again (a window opening).
   */
  public async getParkedState(status: WalletStatus, refresh?: boolean): Promise<WalletParkedState> {
    const records = await this.getParkedRecords(status);
    const funds = await Promise.all(records.map((record) => this.getParkedFunds(record, refresh)));
    const wallets: WalletParkedWallet[] = [];
    let total = bigInt.zero, unknown = false;
    for(let index = 0; index < records.length; ++index) {
      const record = records[index];
      const held = funds[index];
      // * waited for: the next look must not find it again, and a dropped key is gone before anyone reads the list
      if(held?.neverUsed && held.nanos === '0' && await this.dropParked(record, true).then(() => true, () => false)) {
        continue;
      }

      if(held) total = total.add(bigInt(held.nanos));
      else unknown = true;
      wallets.push({record, nanos: held?.nanos});
    }

    return {wallets, nanos: unknown ? undefined : total.toString()};
  }

  /**
   * An old wallet's phrase. One parked with a key update on its way is settled first: the phrase shown is the one
   * that signs, and while that is not known none is (`ROTATION_PENDING`).
   */
  public async revealParked(record: WalletCustodyRecord) {
    const settled = await this.settleParkedRotation(record);
    if(!settled) {
      throw walletError('ROTATION_PENDING');
    }

    return this.revealRecord(settled);
  }

  /**
   * An old wallet parked with a key update on its way: which phrase signs is settled by the key its contract holds
   * now (`get_public_key`, as Android asks it). The record comes back with the phrase that signs — the update's,
   * promoted, or the old one, the update dropped once it can no longer land — or nothing while that is not known.
   */
  private async settleParkedRotation(record: WalletCustodyRecord): Promise<WalletCustodyRecord | undefined> {
    const pending = record.pendingRotation;
    if(!pending) {
      return record;
    }

    let chainKey: string, now: number;
    try {
      [chainKey, now] = await Promise.all([
        this.friendlyAddress(record.address).then((address) => this.managers.appWalletManager.getAddressSigningKey(address)),
        this.managers.timeManager.getServerTime()
      ]);
    } catch(err) {
      return;
    }

    const landed = chainKey === pending.newSigningKey;
    // * the old key still signs: the update is over only once the chain can no longer take it
    const failed = !landed && chainKey === record.signingKey && now > pending.validUntil + RESOLUTION_MARGIN_SECONDS;
    if(!landed && !failed) {
      return;
    }

    return this.withCustody(async() => {
      // * the device's own record of a wallet the server no longer serves is one of these too
      const current = await this.vault.getCustody();
      const isCurrent = current?.recordId === record.recordId;
      const stored = isCurrent ? current : (await this.vault.getParkedCustody()).find((item) => item.recordId === record.recordId);
      // * changed meanwhile (settled by another tab, dropped): read again next time
      if(stored?.pendingRotation?.operationId !== pending.operationId) {
        return;
      }

      // * the old record is replaced before the phrase it no longer needs goes: a failure in between keeps both
      const settled = landed ? promoteRotationRecord(stored, pending.newSigningKey) : {...stored, pendingRotation: undefined as WalletPendingRotation};
      if(isCurrent) {
        await this.vault.saveCustody(settled);
      } else {
        await this.vault.parkCustody(settled);
        if(settled.recordId !== stored.recordId) {
          await this.vault.deleteParkedCustody(stored.recordId);
        }
      }

      await this.vault.deleteSecret(landed ? stored.secretRef : pending.secretRef).catch(() => {});
      return settled;
    });
  }

  /**
   * Forgets an old wallet's key on this device. Whoever has its phrase still has what it holds. One parked with a key
   * update on its way is settled first, and while that is not known nothing is dropped (`ROTATION_PENDING`): the
   * update's phrase may be the only one that signs. `unused`: the wallet never had a transaction and holds nothing —
   * no update of it can land, both phrases go. Decided on a read of the records, it drops only the record that is
   * still there.
   */
  public async dropParked(record: WalletCustodyRecord, unused?: boolean) {
    const settled = unused ? record : await this.settleParkedRotation(record);
    if(!settled) {
      throw walletError('ROTATION_PENDING');
    }

    return this.withCustody(async() => {
      const current = await this.vault.getCustody();
      const isCurrent = current?.recordId === settled.recordId;
      const stored = isCurrent ? current : (await this.vault.getParkedCustody()).find((item) => item.recordId === settled.recordId);
      if(stored?.pendingRotation && !unused) {
        throw walletError('ROTATION_PENDING');
      }

      if(stored) {
        if(stored.pendingRotation) {
          await this.vault.deleteSecret(stored.pendingRotation.secretRef);
        }

        await this.vault.deleteSecret(stored.secretRef);
        if(isCurrent) {
          await this.vault.deleteCustody();
        } else {
          await this.vault.deleteParkedCustody(stored.recordId);
        }
      }

      this.parkedFunds.delete(record.address);
    });
  }

  // MARK: Backup

  private descriptorOf(record: WalletCustodyRecord): WalletDescriptor {
    return {
      recordId: record.recordId,
      address: record.address,
      publicKey: Array.from(bytesFromHex(record.anchorKey)),
      network: record.network,
      secretRef: {value: record.secretRef}
    };
  }

  /**
   * Proves to the server that this device holds the wallet's current signing key: the server's one-time challenge
   * (300 s, one attempt — so it is asked for last) signed like a TON Connect proof.
   */
  private async getOwnershipProof(record: WalletCustodyRecord): Promise<WalletOwnershipProof> {
    const lifecycle = await this.getLifecycle();
    const [challenge, timestamp] = await Promise.all([
      this.managers.appWalletManager.getProofChallenge(),
      // * the server checks it against its own clock, and the challenge allows one attempt
      this.managers.timeManager.getServerTime()
    ]);
    // * only Telegram's own challenge, still alive: a proof for another domain would let it sign in as this wallet (iOS)
    if(challenge.domain?.toLowerCase() !== OWNERSHIP_PROOF_DOMAIN || !(timestamp < challenge.expires)) {
      throw walletError('WALLET_PROOF_INVALID');
    }

    const signed = await lifecycle.signTonConnectProof({
      descriptor: this.descriptorOf(record),
      domain: challenge.domain,
      timestamp,
      payload: challenge.payload
    });

    if(bytesToHex(signed.publicKey) !== record.signingKey) {
      throw walletError('WALLET_KEY_MISMATCH');
    }

    if(signed.signature.length !== 64) {
      throw walletError('WALLET_PROOF_INVALID');
    }

    return {_: 'walletOwnershipProof', timestamp, signature: new Uint8Array(signed.signature)};
  }

  /**
   * Puts the phrase into Telegram's backup: split into XOR shares, one sealed to each holder DC's key, and
   * handed over with the proof that this device holds the key.
   */
  public async enableBackup(status: WalletStatus) {
    const record = await this.getBackupRecord(status);
    const holders = await this.managers.appWalletManager.getBackupHolderDcs();
    const dcs = new Set(holders.map((holder) => holder.dc));
    if(holders.length < 2 || dcs.size !== holders.length || holders.some((holder) => holder.public_key.length !== 32)) {
      throw walletError('WALLET_BACKUP_NOT_AVAILABLE');
    }

    const words = await this.revealPhrase(status);
    const {seedFromWords, splitSeed, encryptShare} = await import('@lib/wallet/phraseShares');
    const seed = seedFromWords(words);
    words.fill('');
    const shares = splitSeed(seed, holders.length);
    seed.fill(0);
    const parts = await Promise.all(shares.map((share, index) => encryptShare(holders[index].public_key, share)));
    shares.forEach((share) => share.fill(0));

    const proof = await this.getOwnershipProof(record);
    let result: WalletStatus;
    try {
      result = await this.managers.appWalletManager.enableBackup(parts, bytesFromHex(record.signingKey), proof);
    } catch(err) {
      // * a resend after a lost answer is refused for its used proof: the backup the server keeps then tells
      const served = await this.refetchStatus();
      const state = served?.state;
      if(!state?.pFlags.backup_enabled || bytesToHex(state.public_key) !== record.signingKey) {
        throw err;
      }

      result = served;
    }

    await this.patchCustody(record.recordId, {rotatedSinceBackup: undefined});
    return result;
  }

  /**
   * Takes the phrase out of Telegram's backup. From then on only the written-down phrase recovers the wallet.
   * The proof is signed by the record's key — right after an update, by the new one, so the server first gets a
   * moment to serve it. A refusal is checked against what the server serves then: a disable it applied anyway
   * (its answer lost, say) is still the outcome asked for.
   */
  public async disableBackup(status: WalletStatus) {
    let record = await this.getBackupRecord(status);
    if(record.awaitingServerKey) {
      record = await this.getBackupRecord(await this.waitForServedKey(record.signingKey, status));
    }

    const proof = await this.getOwnershipProof(record);
    try {
      const result = await this.managers.appWalletManager.disableBackup({
        newPublicKey: bytesFromHex(record.signingKey),
        proof
      });
      await this.patchCustody(record.recordId, {rotatedSinceBackup: undefined});
      return result;
    } catch(err) {
      const served = await this.refetchStatus();
      const state = served?.state;
      if(!state || state.pFlags.backup_enabled || bytesToHex(state.public_key) !== record.signingKey) {
        throw err;
      }

      await this.patchCustody(record.recordId, {rotatedSinceBackup: undefined});
      return served;
    }
  }

  /**
   * The record a backup change is signed with. Not while a key update is on its way: the key it proves may be
   * replaced the next moment.
   */
  private async getBackupRecord(status: WalletStatus) {
    const record = await this.getMatchingRecord(status);
    if(!record) {
      throw walletError('WALLET_KEY_MISSING');
    }

    if(record.pendingRotation) {
      throw walletError('ROTATION_PENDING');
    }

    return record;
  }

  /**
   * The server's word on the wallet now, not the cached one; nothing when it does not answer. After a request whose
   * answer was lost, it tells what the request did.
   */
  private refetchStatus() {
    return this.managers.appWalletManager.getStatus(true).catch((): WalletStatus => undefined);
  }

  /**
   * Polls the server until it serves `key`, for a while; the last status either way
   */
  private async waitForServedKey(key: string, status: WalletStatus) {
    const deadline = Date.now() + SERVED_KEY_WAIT;
    while(status.state && bytesToHex(status.state.public_key) !== key && Date.now() < deadline) {
      await pause(ROTATION_POLL_INTERVAL);
      status = await this.managers.appWalletManager.getStatus(true).catch(() => status);
    }

    return status;
  }

  /**
   * Drops the device's key: the record `recordId` names, the one whose loss the user was told of — another one,
   * installed meanwhile (another tab), stays, and the answer is false
   */
  public async forgetKey(recordId: string) {
    const forgotten = await this.withCustody(async() => {
      const record = await this.vault.getCustody();
      if(record?.recordId !== recordId) {
        return false;
      }

      // * while an update is on its way either key may be the one the chain ends up with: neither goes yet
      if(record.pendingRotation) {
        throw walletError('ROTATION_PENDING');
      }

      await this.vault.deleteSecret(record.secretRef).catch(() => {});
      await this.vault.deleteCustody();
      return true;
    });

    if(forgotten) this.close();
    return forgotten;
  }

  // MARK: Key rotation

  /**
   * Whether Disable Backup can offer a new phrase: this device signs for the wallet, no update is on its way, and
   * the key has not been updated since the backup was last switched — a second update waits for that.
   */
  public async isRotationOffered(status: WalletStatus) {
    if(this.sending || this.rotationBusy) {
      return false;
    }

    const record = await this.getMatchingRecord(status);
    return !!record && !record.pendingRotation && !record.rotatedSinceBackup;
  }

  /**
   * The network fee of a key update. The engine signs a real one; its signature is replaced with random bytes before
   * anything else sees it, and that disarmed copy is emulated with signature checks off. Its new phrase is never
   * shown: it dies with the copy.
   */
  public quoteRotationFee(status: WalletStatus): Promise<WalletRotationQuote> {
    return this.runRotationStep(async() => {
      const record = await this.getRotatableRecord(status);
      const client = await this.getClient(status);
      const validUntil = await this.managers.timeManager.getServerTime() + ROTATION_QUOTE_VALIDITY_SECONDS;
      const prepared = await client.prepareKeyRotation({validUntil, messageKind: 'external'});
      const disarmed = breakRotationSignature(prepared.signedBoc);
      if(!disarmed) {
        throw walletError('ROTATION_QUOTE_FAILED');
      }

      const body = await this.managers.appWalletManager.performToncenterRequest(emulateTraceRequest(disarmed));
      const trace = parseEmulatedTrace(body);
      if(!trace || !(await this.isSameAddress(trace.account, record.address))) {
        throw walletError('ROTATION_QUOTE_FAILED');
      }

      return makeRotationQuote(trace.fee, status.state.balance);
    });
  }

  /**
   * Signs the real update and hands its new phrase out to be written down. Nothing leaves the device: the update
   * waits in memory for `submitRotation`, or `abandonRotation` drops it.
   */
  public prepareRotation(status: WalletStatus, quote: WalletRotationQuote): Promise<string[]> {
    return this.runRotationStep(async() => {
      const record = await this.getRotatableRecord(status);
      const client = await this.getClient(status);
      const validUntil = await this.managers.timeManager.getServerTime() + SEND_VALIDITY_SECONDS;
      const prepared = await client.prepareKeyRotation({validUntil, messageKind: 'external'});
      const words = prepared.replacementRecoveryPhrase.phrase.trim().split(/\s+/);
      if(words.length < 12 || prepared.newPublicKey.length !== 32) {
        throw walletError('ROTATION_PREPARE_FAILED');
      }

      this.abandonRotation();
      this.preparedRotation = {
        recordId: record.recordId,
        words,
        newSigningKey: bytesToHex(prepared.newPublicKey),
        signedBoc: prepared.signedBoc,
        seqno: prepared.seqno,
        validUntil: prepared.validUntil,
        fee: quote.fee
      };

      return words.slice();
    });
  }

  /**
   * Drops a prepared update that was never sent; its signature expires with its window anyway
   */
  public abandonRotation() {
    if(this.rotationSubmitting) {
      return;
    }

    this.preparedRotation?.words.fill('');
    this.preparedRotation = undefined;
  }

  /**
   * Sends the prepared update and waits for the chain. The new phrase is imported first, as the pending half of the
   * custody record: the record's own secret stays the old phrase until the chain confirms the new key, so a reload
   * in between finds the old key still signing and the update settled later by the engine's journal.
   * Resolves once the record signs with the new key, with that key (hex). Rejects with a `ROTATION_*` reason, and
   * then nothing changed — except for `ROTATION_PENDING`: the chain has not answered in time, the update settles by
   * itself later.
   */
  public async submitRotation(status: WalletStatus): Promise<string> {
    const prepared = this.preparedRotation;
    if(!prepared) {
      throw walletError('ROTATION_NOT_PREPARED');
    }

    if(this.sending || this.rotationBusy) {
      throw walletError('ROTATION_ALREADY_SENDING');
    }

    // * taken before the first await and held to the end: no transfer may take the update's seqno
    this.sending = this.rotationSubmitting = true;
    try {
      // * held to the end too: no other tab may settle this update while it is broadcast, nor send one of its own
      const submitted = await this.withRotationLock(true, async() => {
        await this.submitRotationLocked(status, prepared);
        return true;
      });

      if(!submitted) {
        throw walletError('ROTATION_ALREADY_SENDING');
      }

      return prepared.newSigningKey;
    } catch(err) {
      throw this.toRotationError(err);
    } finally {
      this.sending = this.rotationSubmitting = false;
      prepared.words.fill('');
      if(this.preparedRotation === prepared) {
        this.preparedRotation = undefined;
      }
    }
  }

  private async submitRotationLocked(status: WalletStatus, prepared: PreparedRotation) {
    if(await this.managers.timeManager.getServerTime() >= prepared.validUntil) {
      throw walletError('ROTATION_EXPIRED');
    }

    if(!isRotationFeeCovered(prepared.fee, status.state?.balance)) {
      throw walletError('ROTATION_FEES');
    }

    const record = await this.getMatchingRecord(status);
    if(!record || record.recordId !== prepared.recordId || record.pendingRotation) {
      throw walletError('ROTATION_STATE_UNKNOWN');
    }

    const client = await this.getClient(status);
    const pending = await this.storePendingRotation(record, prepared);
    let verdict: WalletRotationVerdict | 'pending' = 'wait';
    try {
      // * an update is no transfer: it reaches the chain through the provider proxy, never `wallet.sendTransfer`
      setWalletSubmission(undefined);
      const result = await client.sendBoc({
        operationId: pending.operationId,
        signedBoc: prepared.signedBoc,
        seqno: prepared.seqno,
        validUntil: prepared.validUntil
      });
      verdict = rotationSnapshotVerdict(pending.operationId, result, false);
    } catch(err) {
      // * it may have gone out all the same: only the chain can tell now
      if(!isRotationSubmissionUnknown(err)) {
        await this.discardPendingRotation(pending.operationId);
        throw err;
      }
    }

    let servedKey = bytesToHex(status.state.public_key);
    if(verdict === 'wait') {
      const watched = await this.watchRotation(client, pending, false);
      verdict = watched.verdict;
      servedKey = watched.servedKey || servedKey;
    }

    await this.settleRotation(pending, verdict, servedKey);
  }

  private async getRotatableRecord(status: WalletStatus) {
    const record = await this.getMatchingRecord(status);
    if(!record) {
      throw walletError('ROTATION_NO_CUSTODY');
    }

    if(record.pendingRotation || record.rotatedSinceBackup) {
      throw walletError('ROTATION_BUSY');
    }

    return record;
  }

  private async runRotationStep<T>(step: () => Promise<T>): Promise<T> {
    if(this.sending || this.rotationBusy) {
      throw walletError('ROTATION_ALREADY_SENDING');
    }

    this.rotationBusy = true;
    try {
      return await step();
    } catch(err) {
      throw this.toRotationError(err);
    } finally {
      this.rotationBusy = false;
    }
  }

  /**
   * Engine and wallet failures as one `ROTATION_*` reason; a passcode prompt the user left stays what it is
   */
  private toRotationError(err: any) {
    if(err instanceof WalletVaultLockedError || (!(err instanceof Error) && typeof(err) !== 'string')) {
      return err;
    }

    return walletError(rotationErrorType(err));
  }

  /**
   * Imports the new phrase beside the record's own and notes it as the record's pending update — before anything
   * is broadcast, so the phrase survives whatever comes next. It must derive the same wallet and the new key.
   */
  private async storePendingRotation(record: WalletCustodyRecord, prepared: PreparedRotation): Promise<WalletPendingRotation> {
    await this.ensureVault();
    const lifecycle = await this.getLifecycle();
    const descriptor = await lifecycle.importWallet({
      recordId: crypto.randomUUID(),
      network: record.network,
      recoveryWords: prepared.words
    });

    try {
      if(bytesToHex(descriptor.publicKey) !== record.anchorKey || !(await this.isSameAddress(descriptor.address, record.address))) {
        throw walletError('ROTATION_KEY_MISMATCH');
      }

      if(await this.getSigningKey(lifecycle, descriptor) !== prepared.newSigningKey) {
        throw walletError('ROTATION_KEY_MISMATCH');
      }

      const pending: WalletPendingRotation = {
        recordId: descriptor.recordId,
        secretRef: descriptor.secretRef.value,
        operationId: crypto.randomUUID(),
        newSigningKey: prepared.newSigningKey,
        validUntil: prepared.validUntil
      };

      // * only on the record it was signed for, and never over another update
      const stored = await this.withCustody(async() => {
        const current = await this.vault.getCustody();
        if(current?.recordId !== record.recordId || current.pendingRotation) {
          return false;
        }

        await this.vault.saveCustody({...current, pendingRotation: pending});
        return true;
      });

      if(!stored) {
        throw walletError('ROTATION_STATE_UNKNOWN');
      }

      return pending;
    } catch(err) {
      await lifecycle.deleteWallet(descriptor).catch(() => {});
      throw err;
    }
  }

  /**
   * Waits for the chain's word on a sent update: the server serving its key, or the engine's journal naming its
   * end. `pending` when neither came a while after the message's window closed.
   *
   * `resumed`: nobody in this tab submits it (one from before a reload, or another tab's). A journal that names no
   * such update then settles it as never sent — but only once its window has closed: until then it may be another
   * tab that stored the update and has not journaled it yet, and the update is looked at again later instead.
   */
  private async watchRotation(client: WalletClient, pending: WalletPendingRotation, resumed: boolean) {
    const now = await this.managers.timeManager.getServerTime();
    const startedAt = Date.now();
    const serverNow = () => now + (Date.now() - startedAt) / 1000;
    const deadline = startedAt + (Math.max(0, pending.validUntil - now) + RESOLUTION_MARGIN_SECONDS) * 1000 + ROTATION_WATCH_MARGIN;
    let servedKey: string;
    for(let round = 0; ; ++round) {
      // * settled meanwhile by another path: promoted once the server served the new key, or dropped
      const record = await this.vault.getCustody();
      if(record?.pendingRotation?.operationId !== pending.operationId) {
        return {verdict: record?.signingKey === pending.newSigningKey ? 'confirmed' as const : 'ROTATION_FAILED' as const, servedKey};
      }

      // * the server is asked every other round, the journal every round
      if(!(round % 2)) {
        const status = await this.refetchStatus();
        if(status?.state) {
          servedKey = bytesToHex(status.state.public_key);
        }

        if(servedKey === pending.newSigningKey) {
          return {verdict: 'confirmed' as const, servedKey};
        }
      }

      const snapshot = await client.resolvePending().catch((): SendSnapshot => undefined);
      if(snapshot) {
        const authoritative = resumed && isRotationJournalAuthoritative(pending.validUntil, serverNow(), RESOLUTION_MARGIN_SECONDS);
        const verdict = rotationSnapshotVerdict(pending.operationId, snapshot, authoritative);
        if(verdict !== 'wait') {
          return {verdict, servedKey};
        }

        if(resumed && snapshot.operationId !== pending.operationId) {
          return {verdict: 'pending' as const, servedKey};
        }
      }

      if(Date.now() >= deadline) {
        return {verdict: 'pending' as const, servedKey};
      }

      await pause(ROTATION_POLL_INTERVAL);
    }
  }

  /**
   * Confirmed: the record takes the new phrase. Ended otherwise: the new phrase goes. Unknown: it stays pending.
   */
  private async settleRotation(pending: WalletPendingRotation, verdict: WalletRotationVerdict | 'pending', servedKey: string) {
    if(verdict === 'confirmed') {
      await this.promotePendingRotation(servedKey);
      return;
    }

    if(verdict === 'pending' || verdict === 'wait') {
      throw walletError('ROTATION_PENDING');
    }

    await this.discardPendingRotation(pending.operationId);
    throw walletError(verdict);
  }

  /**
   * A pending update meets the served key: the server serving the new key means the chain confirmed it; otherwise
   * an update this tab is not waiting for itself (one from before a reload) is looked at in the background. With
   * no update pending, the wait for the server to catch up with a confirmed one ends once it does.
   */
  private async reconcileRotation(record: WalletCustodyRecord, status: WalletStatus) {
    const servedKey = bytesToHex(status.state.public_key);
    if(record.pendingRotation) {
      if(record.pendingRotation.newSigningKey === servedKey) {
        return await this.promotePendingRotation(servedKey) || record;
      }

      if(!this.rotationSubmitting) {
        this.resumeRotation(status);
      }

      return record;
    }

    const settled = settleAwaitingServerKey(record, servedKey);
    if(!settled) {
      return record;
    }

    return await this.patchCustody(record.recordId, {awaitingServerKey: undefined}) || settled;
  }

  /**
   * Settles an update sent before a reload, or by another tab. The client is the record's, whose journal holds the
   * update; that journal becomes authoritative once the update's window closed (see `watchRotation`). Skipped while
   * another tab holds the update: that one is submitting it.
   */
  private resumeRotation(status: WalletStatus) {
    if(this.rotationResume || Date.now() - this.rotationResumedAt < ROTATION_RESUME_INTERVAL) {
      return this.rotationResume;
    }

    return this.rotationResume = (async() => {
      try {
        await this.withRotationLock(true, async() => {
          const pending = (await this.vault.getCustody())?.pendingRotation;
          if(!pending || this.rotationSubmitting) {
            return;
          }

          const client = await this.getClient(status);
          const {verdict, servedKey} = await this.watchRotation(client, pending, true);
          if(verdict !== 'pending' && !this.rotationSubmitting) {
            await this.settleRotation(pending, verdict, servedKey || bytesToHex(status.state.public_key)).catch(() => {});
          }
        });
      } catch(err) {
        // * the next look tries again
      } finally {
        this.rotationResumedAt = Date.now();
        this.rotationResume = undefined;
      }
    })();
  }

  /**
   * The chain confirmed the pending update: the new phrase becomes the record's secret and the new key its signing
   * key, in one write, and the replaced phrase is deleted. One promotion at a time.
   */
  private promotePendingRotation(servedKey: string) {
    const promotion = this.rotationPromotion ??= this.withCustody(async() => {
      const record = await this.vault.getCustody();
      if(!record?.pendingRotation) {
        return record;
      }

      const promoted = promoteRotationRecord(record, servedKey);
      await this.vault.saveCustody(promoted);
      const lifecycle = await this.getLifecycle();
      await lifecycle.deleteWallet(this.descriptorOf(record))
      .catch(() => this.vault.deleteSecret(record.secretRef))
      .catch(() => {});
      return promoted;
    }).finally(() => {
      if(this.rotationPromotion === promotion) this.rotationPromotion = undefined;
    });

    return promotion;
  }

  /**
   * The pending update `operationId` ended without taking effect: the record keeps its phrase, the new one is
   * deleted. Another update pending by then is not this one's to drop.
   */
  private discardPendingRotation(operationId: string) {
    return this.withCustody(async() => {
      const record = await this.vault.getCustody();
      const pending = record?.pendingRotation;
      if(pending?.operationId !== operationId) {
        return;
      }

      await this.patchCustodyLocked(record.recordId, {pendingRotation: undefined});
      const lifecycle = await this.getLifecycle();
      await lifecycle.deleteWallet({...this.descriptorOf(record), recordId: pending.recordId, secretRef: {value: pending.secretRef}})
      .catch(() => this.vault.deleteSecret(pending.secretRef))
      .catch(() => {});
    });
  }

  /**
   * Rewrites the custody record, if it is still the one with `recordId`
   */
  private patchCustody(recordId: string, patch: Partial<WalletCustodyRecord>) {
    return this.withCustody(() => this.patchCustodyLocked(recordId, patch));
  }

  private async patchCustodyLocked(recordId: string, patch: Partial<WalletCustodyRecord>) {
    const record = await this.vault.getCustody();
    if(record?.recordId !== recordId) {
      return record;
    }

    const next = {...record, ...patch};
    await this.vault.saveCustody(next);
    return next;
  }

  // MARK: Sending

  private async buildIntent(status: WalletStatus, params: WalletSendParams, forFee: boolean): Promise<SendIntent> {
    const engine = await this.getEngine();
    const destination = await engine.convertTonAddress(params.destination, {
      kind: 'userFriendly',
      bounceable: params.bounce,
      testnet: false
    });

    let body: SendMessageBody = params.payload ? {kind: 'rawPayload', boc: params.payload} : {kind: 'empty'};
    const comment = params.comment?.trim();
    if(comment) {
      if(!params.encryptComment) {
        body = {kind: 'comment', text: comment};
      } else if(forFee) {
        body = {kind: 'rawPayload', boc: encryptedCommentFeeBody(comment)};
      } else {
        const client = await this.getClient(status);
        const boc = await client.createEncryptedComment({
          recipient: destination,
          comment,
          recipientPublicKey: await recipientKeyHint(client, destination, params.recipientPublicKey)
        });
        body = {kind: 'rawPayload', boc};
      }
    }

    // * a link's deadline holds on the chain too, never longer than any transfer is valid
    let expiration: SendExpiration = {kind: 'engineDefault'};
    if(params.expiresAt) {
      const now = await this.managers.timeManager.getServerTime();
      if(now >= params.expiresAt) {
        throw walletError('WALLET_LINK_EXPIRED');
      }

      expiration = {kind: 'exact', unixTimestamp: Math.min(params.expiresAt, now + SEND_VALIDITY_SECONDS)};
    }

    return {
      expiration,
      messages: [{
        destination,
        amount: params.sendAll ? {kind: 'all'} : {kind: 'exact', nanograms: params.nanograms},
        body,
        bounce: params.bounce
      }]
    };
  }

  /**
   * Whether a private comment can reach this recipient, without asking for the key
   */
  public async canEncryptCommentFor(status: WalletStatus, destination: string, recipientPublicKey?: Uint8Array) {
    const client = await this.getClient(status);
    try {
      await client.resolveEncryptedCommentRecipient({
        recipient: destination,
        recipientPublicKey: await recipientKeyHint(client, destination, recipientPublicKey)
      });
      return true;
    } catch(err) {
      if(String((err as Error)?.message).startsWith('encrypted comment is unavailable')) {
        return false;
      }

      throw err;
    }
  }

  public async previewSend(status: WalletStatus, params: WalletSendParams): Promise<SendPreview> {
    const client = await this.getClient(status);
    const intent = await this.buildIntent(status, params, true);
    let preview: SendPreview;
    try {
      preview = await client.previewSend({intent});
    } catch(err) {
      // * a seqno the provider has not caught up with yet (a transfer just went): once more, a moment later (iOS)
      if(!PREVIEW_SEQNO_LAG_REGEXP.test(String((err as Error)?.message ?? err))) throw err;
      await pause(PREVIEW_SEQNO_RETRY_DELAY);
      preview = await client.previewSend({intent});
    }

    // * a fee read off a trace the provider did not finish is no fee (iOS)
    if(preview.emulation.isIncomplete) {
      throw walletError('WALLET_PREVIEW_INCOMPLETE');
    }

    return preview;
  }

  public cancelPreview(status: WalletStatus) {
    return this.getClient(status).then((client) => client.cancelSendPreview()).catch(() => {});
  }

  /**
   * Signs and hands the transfer to the server. A gasless transfer is signed twice for the same seqno: the normal
   * external message, and the internal one a relayer can pay for; the server picks one.
   */
  public send(status: WalletStatus, params: WalletSendParams): Promise<WalletSendOutcome> {
    const operationId = crypto.randomUUID();
    return this.submit(status, operationId, {...params, draft: getTransferDraft(params)}, async(client, submission) => {
      const intent = await this.buildIntent(status, params, false);
      if(!params.gasless) {
        return client.send({operationId, intent});
      }

      const prepared = await client.prepareTransfer({operationId, intent});
      submission.gasless = base64ToBytes(prepared.internalBoc);
      return client.sendBoc({
        operationId,
        signedBoc: prepared.externalBoc,
        seqno: prepared.seqno,
        validUntil: prepared.validUntil
      });
    });
  }

  /**
   * One transfer at a time, Grams or a collectible: `sign` has the engine sign it, and the engine's broadcast goes
   * to the server as `wallet.sendTransfer` (engineHost) with this transfer's recipient and answer.
   */
  private async submit(
    status: WalletStatus,
    operationId: string,
    params: Pick<WalletSubmission, 'userId' | 'draft' | 'onAnswer'>,
    sign: (client: WalletClient, submission: WalletSubmission) => Promise<SendResult>
  ): Promise<WalletSendOutcome> {
    // * taken before the first await: two quick presses must not both get through
    if(this.sending) {
      throw walletError('WALLET_SEND_IN_PROGRESS');
    }

    this.sending = true;
    let settle: () => void;
    this.sendSettled = new Promise<void>((resolve) => settle = resolve);
    let answer: WalletSubmissionAnswer;
    try {
      const record = await this.getMatchingRecord(status);
      if(!record) {
        throw walletError('WALLET_KEY_MISSING');
      }

      // * a key update on its way holds the seqno: nothing else goes out until the chain settled it
      if(record.pendingRotation) {
        throw walletError('WALLET_SEND_IN_PROGRESS');
      }

      const client = await this.getClient(status);
      // * a fee preview still running would hold the engine's slot
      await client.cancelSendPreview().catch(() => {});
      // * a transfer an earlier tab or session left with no known outcome is settled first, if the chain can tell by
      // * now: the engine would refuse this one while it stands (Android resolves before signing)
      await client.resolvePending().catch(() => {});
      const submission: WalletSubmission = {
        userId: params.userId,
        randomId: randomLong(),
        draft: params.draft,
        // * the server may answer after the engine stopped waiting: that answer still belongs to this transfer
        onAnswer: (value: WalletSubmissionAnswer) => {
          answer = value;
          params.onAnswer?.(value);
        }
      };

      let result: SendResult;
      // * the draft exists once the broadcast started (appWalletManager.sendTransfer makes it there)
      const draftRandomId = () => submission.rpcStarted && submission.draft ? submission.randomId : undefined;
      try {
        // * only the broadcast is routed by it, and the engine signs everything before that
        setWalletSubmission(submission);
        result = await sign(client, submission);
      } catch(err) {
        // * the server took it: whatever the engine thinks afterwards, the money moved
        if(answer?.outcome === 'accepted') {
          return {result: {operationId, messageHash: undefined, signedBoc: submission.signedBoc, phase: 'submitted'}, answer, draftRandomId: draftRandomId()};
        }

        // * the server may have it (tdesktop's recordUnknown): no error, a transfer still sending that the engine's
        // * journal settles — the engine refuses a new one meanwhile, and a resend could pay twice
        if(isSendOutcomeUnknown(err, submission, answer)) {
          return {result: {operationId, messageHash: undefined, signedBoc: submission.signedBoc, phase: 'submissionUnknown'}, answer, draftRandomId: draftRandomId()};
        }

        throw err;
      }

      // * the engine's last word on a broadcast the server gave no clear answer to: the chat's draft fails with it
      const failure = submission.rpcStarted && answer?.outcome !== 'accepted' && getGramTransferFailure(result.phase, !!submission.gasless);
      if(failure && submission.draft) {
        this.managers.appMessagesManager.failGramTransferDraft(submission.randomId, failure);
      }

      return {result, answer, draftRandomId: draftRandomId()};
    } finally {
      setWalletSubmission(undefined);
      this.sending = false;
      settle();
    }
  }

  /**
   * What the chain says now of the last transfer this device signed, by the engine's journal: nothing is signed, and
   * what it finds is written down, so a conclusion frees the engine for the next transfer. Nothing while this tab is
   * sending, or when this device cannot sign for the served wallet.
   */
  public async resolvePendingSend(status: WalletStatus): Promise<SendSnapshot | undefined> {
    if(this.sending || !(await this.getMatchingRecord(status))) {
      return;
    }

    const client = await this.getClient(status);
    return this.sending ? undefined : client.resolvePending();
  }

  // MARK: Collectibles

  private async buildNftIntent(params: WalletNftSendParams): Promise<NftTransferIntent> {
    const engine = await this.getEngine();
    const [nftAddress, recipient] = await Promise.all([
      engine.convertTonAddress(params.nftAddress, {kind: 'userFriendly', bounceable: true, testnet: false}),
      engine.convertTonAddress(params.destination, {kind: 'userFriendly', bounceable: params.bounce, testnet: false})
    ]);

    const comment = params.comment?.trim();
    return {
      nftAddress,
      recipient,
      funding: {kind: 'exact', attachedNanograms: NFT_TRANSFER_ATTACHED_NANOS, forwardNanograms: NFT_TRANSFER_FORWARD_NANOS},
      // * a collectible's comment rides in the clear, to the new owner
      payload: comment ? {kind: 'comment', text: comment} : {kind: 'empty'},
      expiration: {kind: 'engineDefault'}
    };
  }

  /**
   * Checks afresh that the wallet still owns the collectible and emulates the whole transfer; what the trace
   * burns is its fee. No key is needed.
   */
  public async previewNftTransfer(status: WalletStatus, params: WalletNftSendParams): Promise<SendPreview> {
    const client = await this.getClient(status);
    const intent = await this.buildNftIntent(params);
    return client.previewNftTransfer({operationId: params.operationId, intent});
  }

  /**
   * Signs a TEP-62 transfer of a collectible and hands it to the server like a Gram transfer, never fee-free.
   */
  public sendNft(status: WalletStatus, params: WalletNftSendParams): Promise<WalletSendOutcome> {
    return this.submit(status, params.operationId, params, async(client) => {
      const intent = await this.buildNftIntent(params);
      return client.sendNftTransfer({operationId: params.operationId, intent});
    });
  }

  // MARK: Comments

  /**
   * Opens a comment the server returned encrypted. Needs the key, so it may ask for the passcode.
   */
  public async decryptComment(status: WalletStatus, transaction: WalletTransaction, ownAddress: string) {
    if(!transaction.comment || !transaction.pFlags.comment_encrypted) {
      return transaction.comment;
    }

    const body = serverCommentBody(base64ToBytes(transaction.comment));
    if(!body) {
      throw walletError('WALLET_COMMENT_INVALID');
    }

    const peer = transaction.peer;
    const counterparty = peer._ !== 'walletTransactionPeerUnsupported' ? peer.address : undefined;
    const sender = transaction.pFlags.incoming ? counterparty : ownAddress;
    if(!sender) {
      throw walletError('WALLET_COMMENT_INVALID');
    }

    const client = await this.getClient(status);
    return client.decryptComment({sender, body});
  }

  // MARK: TON Connect

  /**
   * Runs `task` with the key that signs for the served wallet now, derived from this device's phrase for this one
   * operation and wiped when the task settles. It must be the key the server serves and the record names: a phrase
   * from before a key update, or one of another wallet, would derive session keys the dApp never saw. Not while a key
   * update is on its way: the key may change under the session the next moment.
   */
  public async withTonConnectSigner<T>(status: WalletStatus, task: (signer: WalletTonConnectSigner) => Promise<T>): Promise<T> {
    const state = status.state;
    if(!state) {
      throw walletError('WALLET_NOT_READY');
    }

    const record = await this.getMatchingRecord(status);
    if(!record) {
      throw walletError('WALLET_KEY_MISSING');
    }

    if(record.pendingRotation || record.awaitingServerKey) {
      throw walletError('ROTATION_PENDING');
    }

    await this.ensureUnlocked('deriveTonConnectSessionKey');
    const {deriveSigningSeed, signingPublicKey} = await import('@lib/wallet/tonConnectCrypto');
    const phrase = await this.vault.readSecret(record.secretRef);
    let seed: Uint8Array;
    try {
      seed = await deriveSigningSeed(phrase);
    } finally {
      phrase.fill(0);
    }

    try {
      const publicKey = bytesToHex(await signingPublicKey(seed));
      if(publicKey !== record.signingKey || publicKey !== bytesToHex(state.public_key)) {
        throw walletError('WALLET_KEY_MISMATCH');
      }

      return await task({
        seed,
        signingKey: publicKey,
        account: () => this.tonConnectAccount(record),
        signProof: (domain, timestamp, payload) => this.signTonConnectProof(record, domain, timestamp, payload)
      });
    } finally {
      seed.fill(0);
    }
  }

  /** `ton_addr`: the address and state of the anchor key, advertised with the key that signs now */
  private async tonConnectAccount(record: WalletCustodyRecord) {
    const lifecycle = await this.getLifecycle();
    const account = lifecycle.tonConnectAccount(this.descriptorOf(record));
    return {
      address: account.address,
      network: account.network,
      walletStateInit: account.walletStateInit,
      publicKey: record.signingKey
    };
  }

  /** a dApp's `ton_proof`, signed by the engine with the key that signs now; a proof under any other key is refused */
  private async signTonConnectProof(record: WalletCustodyRecord, domain: string, timestamp: number, payload: string) {
    const lifecycle = await this.getLifecycle();
    const signed = await lifecycle.signTonConnectProof({descriptor: this.descriptorOf(record), domain, timestamp, payload});
    if(bytesToHex(signed.publicKey) !== record.signingKey || signed.signature.length !== 64) {
      throw walletError('WALLET_KEY_MISMATCH');
    }

    return new Uint8Array(signed.signature);
  }

  /** a dApp's transfer, emulated as it would go: its exact messages, expiration and StateInit. No key is needed */
  public async previewTonConnect(status: WalletStatus, operationId: string, intent: SendIntent): Promise<SendPreview> {
    const client = await this.getClient(status);
    return client.previewTonConnect({operationId, intent});
  }

  /**
   * Signs a dApp's transfer and hands it to the server like any other (`submit`), to nobody in particular. Its
   * operation id names the request, so the engine's journal never signs it twice.
   */
  public async sendTonConnect(status: WalletStatus, operationId: string, intent: SendIntent): Promise<WalletSendOutcome> {
    // * one approved while this tab sends another transfer waits for it, as long as the request lasts, rather than
    // * failing (iOS waitForPreviousWalletTransfer)
    const deadline = intent.expiration.kind === 'exact' ?
      intent.expiration.unixTimestamp :
      await this.managers.timeManager.getServerTime() + SEND_VALIDITY_SECONDS;
    while(this.sending) {
      const left = deadline - await this.managers.timeManager.getServerTime();
      if(left <= 0) {
        throw walletError('WALLET_LINK_EXPIRED');
      }

      await Promise.race([this.sendSettled, pause(left * 1000)]);
    }

    return this.submit(status, operationId, {}, (client) => client.send({operationId, intent}));
  }
}
