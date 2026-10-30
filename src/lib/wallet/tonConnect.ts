/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {TonConnectRequest, TonConnectSession, WalletTonConnectPending} from '@layer';
import type {WalletStatus} from '@appManagers/appWalletManager';
import type {SendPreview} from '@ton/wallet-engine';
import WalletSession, {isSendOutcomeUnknown, walletError, WalletTonConnectSigner, withTabsLock} from '@lib/wallet/walletSession';
import {
  deriveSessionKeyPair,
  openChallenge,
  openFromPeer,
  sealToPeer,
  signDataDigest,
  signDigest
} from '@lib/wallet/tonConnectCrypto';
import {
  buildConnectErrorEvent,
  buildConnectEvent,
  buildDisconnectEvent,
  buildErrorResponse,
  buildSignDataResult,
  buildSuccessResponse,
  getTonConnectDomain,
  getTonConnectHost,
  isTonConnectProofDomainAllowed,
  parseAppRequest,
  TON_CONNECT_NETWORK,
  TonConnectAppRequest,
  TonConnectErrorCode,
  TonConnectLink,
  toRawTonAddress
} from '@lib/wallet/tonConnectWire';
import pause from '@helpers/schedulers/pause';
import {parseTonAddress} from '@lib/wallet/tonAddress';
import bytesToHex from '@helpers/bytes/bytesToHex';
import bytesFromHex from '@helpers/bytes/bytesFromHex';
import bytesToBase64 from '@helpers/bytes/bytesToBase64';
import base64ToBytes from '@helpers/string/base64ToBytes';
import App from '@config/app';

/**
 * TON Connect through Telegram's server (iOS WalletTonConnect.swift, tdesktop wallet_ton_connect*.cpp): a dApp's
 * link makes a session the server bridges, the user approves it with the wallet's key, and the dApp's requests come
 * as messages in the service chat, each claimed by one device and answered by it. The keys come from the phrase for
 * each step (`WalletSession.withTonConnectSigner`) and are wiped after it; what an answer says is kept, encrypted,
 * until the server took it, so a reload never signs a request twice.
 */

export type TonConnectFailure =
  | 'unavailable'
  | 'invalidLink'
  | 'invalidManifest'
  | 'wrongNetwork'
  | 'keyMismatch'
  | 'keyChanging'
  | 'noKey'
  | 'expired'
  | 'handledElsewhere'
  | 'outcomeUnknown'
  | 'bridgeUnavailable';

export class TonConnectError extends Error {
  public type = 'TONCONNECT_FAILURE';

  constructor(public failure: TonConnectFailure, public cause?: any) {
    super(failure);
  }
}

export function tonConnectFailure(err: any): TonConnectFailure | undefined {
  if(err instanceof TonConnectError) return err.failure;
  switch(err?.type) {
    // * the request or its session is gone, by another tab or the dApp (tdesktop SessionGone, RequestDropped)
    case 'TONCONNECT_REQUEST_ALREADY_CLAIMED':
    case 'TONCONNECT_REQUEST_NOT_FOUND':
    case 'TONCONNECT_BAD_REQUEST_ID':
    case 'TONCONNECT_SESSION_NOT_FOUND':
    case 'TONCONNECT_SESSION_CLOSED':
    case 'TONCONNECT_SESSION_NOT_ACTIVE':
      return 'handledElsewhere';
    case 'TONCONNECT_REQUEST_EXPIRED':
      return 'expired';
    case 'TONCONNECT_DAPP_CLIENT_ID_INVALID':
    case 'TONCONNECT_MANIFEST_URL_INVALID':
      return 'invalidLink';
    case 'TONCONNECT_CLIENT_ID_OCCUPIED':
      return 'keyMismatch';
    case 'WALLET_KEY_MISMATCH':
      return 'keyMismatch';
    case 'WALLET_KEY_MISSING':
      return 'noKey';
    case 'ROTATION_PENDING':
      return 'keyChanging';
  }
}

function fail(failure: TonConnectFailure): never {
  throw new TonConnectError(failure);
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function getServerTime(wallet: WalletSession) {
  return wallet.managers.timeManager.getServerTime();
}

export function isTonConnectSessionActive(session: TonConnectSession) {
  return !!session && !session.pFlags.pending && !session.pFlags.closing && !session.pFlags.closed;
}

// MARK: Session keys

type SessionKeys = {secretKey: Uint8Array, clientId: string, peer: Uint8Array};

/** the session's key pair from the signing seed; a session another key registered is not this wallet's to answer */
async function getSessionKeys(signer: WalletTonConnectSigner, session: TonConnectSession): Promise<SessionKeys> {
  if(!/^[0-9a-f]{64}$/i.test(session.dapp_client_id) || !session.nonce?.length) {
    fail('unavailable');
  }

  const peer = bytesFromHex(session.dapp_client_id.toLowerCase());
  const pair = await deriveSessionKeyPair(signer.seed, peer, session.nonce);
  const clientId = bytesToHex(pair.publicKey);
  if(session.client_id && session.client_id.toLowerCase() !== clientId) {
    pair.secretKey.fill(0);
    fail('keyMismatch');
  }

  return {secretKey: pair.secretKey, clientId, peer};
}

async function seal(keys: SessionKeys, json: string) {
  return sealToPeer(keys.secretKey, keys.peer, textEncoder.encode(json));
}

/** registers `W` for the session and answers the server's challenge to it */
async function proveSessionKey(wallet: WalletSession, sessionId: TonConnectSession['id'], keys: SessionKeys) {
  const challenge = await wallet.managers.appWalletManager.tonConnectRegisterKey(sessionId, keys.clientId);
  const answer = await openChallenge(keys.secretKey, challenge.challenge);
  return {answer, eventId: challenge.event_id};
}

/** a challenge the server no longer takes: the key is registered again and the step tried once more (tdesktop) */
async function withFreshChallenge<T>(task: () => Promise<T>, retryOn = ['TONCONNECT_CHALLENGE_INVALID']): Promise<T> {
  try {
    return await task();
  } catch(err) {
    if(!retryOn.includes((err as ApiError)?.type)) throw err;
    return task();
  }
}

// MARK: Connect

export type TonConnectManifestInfo = {
  name: string,
  /** the manifest's host, the domain a proof binds */
  domain: string,
  url: string,
  icon?: TonConnectSession['manifest']['icon']
};

/** what the connect sheet shows of a dApp: its manifest's name, falling back to its host */
export function getTonConnectManifestInfo(session: TonConnectSession): TonConnectManifestInfo | undefined {
  const manifest = session?.manifest;
  if(!manifest) {
    return;
  }

  const domain = getTonConnectDomain(manifest.url);
  const name = manifest.name?.replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, '').trim();
  return {name: name || getTonConnectHost(manifest.url), domain, url: manifest.url, icon: manifest.icon};
}

/**
 * Whether the server's manifest can stand for the link: it must be the one the link points at — the same host
 * (tdesktop, Android), and a proof only for a domain that is no wallet-ownership one.
 */
export function checkTonConnectManifest(session: TonConnectSession, link: TonConnectLink, ownershipDomain?: string): TonConnectManifestInfo {
  const info = getTonConnectManifestInfo(session);
  const host = info && getTonConnectHost(info.url);
  if(!info || !host || host !== getTonConnectHost(link.request.manifestUrl)) {
    fail('invalidManifest');
  }

  if(link.request.proofPayload !== undefined && !isTonConnectProofDomainAllowed(host, ownershipDomain)) {
    fail('invalidManifest');
  }

  if(link.request.network !== undefined && link.request.network !== TON_CONNECT_NETWORK) {
    fail('wrongNetwork');
  }

  return info;
}

/** a pending session for a connect link; one already connected was connected elsewhere */
export async function createTonConnectSession(link: TonConnectLink) {
  const session = await WalletSession.get().managers.appWalletManager.tonConnectCreateSession(link.clientId, link.request.manifestUrl);
  if(isTonConnectSessionActive(session)) {
    fail('handledElsewhere');
  }

  if(session.pFlags.closed || session.pFlags.closing) {
    fail('unavailable');
  }

  return session;
}

/**
 * Approves a connection (the address, and a proof when asked for) or declines it with `connect_error`; either way
 * the key is registered first, since only an event under it reaches the dApp.
 */
export async function answerTonConnectConnect(options: {
  status: WalletStatus,
  session: TonConnectSession,
  link: TonConnectLink,
  approve: boolean,
  /** the manifest's failure to send instead of a decline */
  errorCode?: TonConnectErrorCode
}) {
  const {session, link, approve} = options;
  const wallet = WalletSession.get();
  const proofPayload = approve ? link.request.proofPayload : undefined;
  let info: TonConnectManifestInfo;
  if(approve) {
    const ownershipDomain = proofPayload !== undefined ? await wallet.managers.appWalletManager.getTonConnectOwnershipDomain() : undefined;
    info = checkTonConnectManifest(session, link, ownershipDomain);
  }

  await wallet.withTonConnectSigner(options.status, async(signer) => {
    const keys = await getSessionKeys(signer, session);
    // * a session not active yet is one the server is still setting up: asked again once, as a stale challenge is
    try {
      await withFreshChallenge(async() => {
        const {answer, eventId} = await proveSessionKey(wallet, session.id, keys);
        let json: string;
        if(approve) {
          const account = await signer.account();
          // * the engine's account must be the served wallet on this network: a dApp checks nothing else
          if(toRawTonAddress(account.address) !== toRawTonAddress(options.status.state.address) || account.network !== TON_CONNECT_NETWORK) {
            fail('keyMismatch');
          }

          let proof: Parameters<typeof buildConnectEvent>[0]['proof'];
          if(proofPayload !== undefined) {
            const timestamp = await getServerTime(wallet);
            const domain = getTonConnectHost(info.url);
            const signature = await signer.signProof(domain, timestamp, proofPayload);
            proof = {timestamp, domain, payload: proofPayload, signature: bytesToBase64(signature)};
          }

          json = buildConnectEvent({eventId, account, proof, appVersion: App.version || '1'});
        } else {
          json = buildConnectErrorEvent(eventId, options.errorCode ?? TonConnectErrorCode.USER_DECLINED);
        }

        const body = await seal(keys, json);
        const accepted = await wallet.managers.appWalletManager.tonConnectSubmitConnectResult({
          sessionId: session.id,
          challengeAnswer: answer,
          body,
          error: !approve,
          traceId: link.traceId
        });
        answer.fill(0);
        if(!accepted) {
          fail('bridgeUnavailable');
        }
      }, ['TONCONNECT_CHALLENGE_INVALID', 'TONCONNECT_SESSION_NOT_ACTIVE']);
    } finally {
      keys.secretKey.fill(0);
    }
  });

  // * the session is connected now: the list has it at once, the server's update follows
  wallet.managers.appWalletManager.getTonConnectSessions(true).catch(() => {});
}

// MARK: Requests

export type TonConnectLoadedRequest = {
  session: TonConnectSession,
  envelope: TonConnectRequest,
  request: TonConnectAppRequest,
  info?: TonConnectManifestInfo,
  /** the wallet's address, as the server serves it */
  address: string,
  /** sendTransaction: the engine's operation, the same for the preview and the send */
  operationId: string
};

export function getTonConnectRequestKey(sessionId: TonConnectSession['id'], msgId: number) {
  return String(sessionId) + ':' + msgId;
}

export function getTonConnectOperationId(sessionId: TonConnectSession['id'], msgId: number) {
  return 'ton-connect:' + String(sessionId) + ':' + msgId;
}

/**
 * The request `msgId` of a session, or — for a dApp's wake-up link — the one `traceId` names (the link may come
 * before the bridge delivered the request: tried again a few times, as Android does). Nothing when it is gone.
 */
export async function findTonConnectRequest(lookup: {sessionId: string, msgId: number} | {dappClientId: string, traceId?: string}) {
  const wallet = WalletSession.get();
  const attempts = 'dappClientId' in lookup ? 10 : 1;
  for(let attempt = 0; attempt < attempts; ++attempt) {
    let pending: WalletTonConnectPending;
    try {
      pending = await wallet.managers.appWalletManager.tonConnectGetPending('sessionId' in lookup ?
        {sessionId: lookup.sessionId} :
        {dappClientId: lookup.dappClientId});
    } catch(err) {
      // * a wake-up may name a session the server has not made yet: it is asked again
      if(attempt + 1 >= attempts) throw err;
      await pause(500);
      continue;
    }

    const now = await getServerTime(wallet);
    const requests = pending.requests.filter((request) => String(request.session_id) === String(pending.session.id) && request.expires > now);
    const found = 'msgId' in lookup ?
      requests.find((request) => request.msg_id === lookup.msgId) :
      requests.find((request) => !lookup.traceId || request.trace_id === lookup.traceId);
    if(found) {
      return {session: pending.session, envelope: found};
    }

    if(attempt + 1 < attempts) {
      await pause(500);
    }
  }
}

/** opens a request with the session's key and reads it against the wallet; one with no usable id cannot be answered */
export async function openTonConnectRequest(status: WalletStatus, session: TonConnectSession, envelope: TonConnectRequest): Promise<TonConnectLoadedRequest> {
  const wallet = WalletSession.get();
  const now = await getServerTime(wallet);
  if(envelope.expires <= now) {
    fail('expired');
  }

  const request = await wallet.withTonConnectSigner(status, async(signer) => {
    if(!session.client_id) {
      fail('unavailable');
    }

    const keys = await getSessionKeys(signer, session);
    try {
      const plaintext = await openFromPeer(keys.secretKey, keys.peer, envelope.body);
      return parseAppRequest(textDecoder.decode(plaintext), {address: status.state.address, now});
    } finally {
      keys.secretKey.fill(0);
    }
  });

  return {
    session,
    envelope,
    request,
    info: getTonConnectManifestInfo(session),
    address: status.state.address,
    operationId: getTonConnectOperationId(session.id, envelope.msg_id)
  };
}

/** what the request popup shows of a transfer: the engine's emulation of exactly what would be signed */
export function previewTonConnectRequest(status: WalletStatus, loaded: TonConnectLoadedRequest): Promise<SendPreview> {
  if(loaded.request.kind !== 'sendTransaction') {
    throw walletError('TONCONNECT_NOT_A_TRANSFER');
  }

  return WalletSession.get().previewTonConnect(status, loaded.operationId, loaded.request.intent);
}

/** a request the user never sees: an invalid one, a disconnect, one of a session that is not connected */
export function isTonConnectRequestSilent(loaded: TonConnectLoadedRequest) {
  return loaded.request.kind === 'invalid' || loaded.request.kind === 'disconnect' || !isTonConnectSessionActive(loaded.session);
}

// MARK: Replies kept until the server took them

type StoredReply = {
  sessionId: string,
  msgId: number,
  /**
   * `executing`: the transfer is being signed and sent; `prepared`: the encrypted answer, ready to go; `closing`: the
   * answer to a dApp's disconnect went, the session's close has not yet
   */
  phase: 'executing' | 'prepared' | 'closing',
  body?: string,
  traceId?: string,
  /** a dApp's disconnect: the session is closed once the answer went */
  close?: boolean,
  approved?: boolean,
  /** what to tell the user once the answer went, kept with it: a transfer whose outcome is not known yet */
  failure?: TonConnectAnswer['failure'],
  expires: number
};

// * one entry per request: tabs answering different requests never write over each other's
function getRepliesPrefix(wallet: WalletSession) {
  return 'tweb-wallet-tonconnect:' + wallet.vault.ownerId + ':';
}

function readReplies(wallet: WalletSession): {[key: string]: StoredReply} {
  const prefix = getRepliesPrefix(wallet), replies: {[key: string]: StoredReply} = {};
  try {
    for(let i = 0; i < localStorage.length; ++i) {
      const storageKey = localStorage.key(i);
      if(storageKey?.startsWith(prefix)) {
        const reply = JSON.parse(localStorage.getItem(storageKey));
        if(reply) replies[storageKey.slice(prefix.length)] = reply;
      }
    }
  } catch(err) {}

  return replies;
}

function readReply(wallet: WalletSession, key: string): StoredReply {
  try {
    return JSON.parse(localStorage.getItem(getRepliesPrefix(wallet) + key)) || undefined;
  } catch(err) {}
}

function writeReply(wallet: WalletSession, key: string, reply?: StoredReply) {
  try {
    if(reply) localStorage.setItem(getRepliesPrefix(wallet) + key, JSON.stringify(reply));
    else localStorage.removeItem(getRepliesPrefix(wallet) + key);
  } catch(err) {
    // * nothing kept: an answer lost now is the dApp's timeout, never a second signature
    if(reply?.phase === 'executing') throw err;
  }
}

/** the reply this device already prepared for a request, if any */
export function getStoredTonConnectReply(sessionId: TonConnectSession['id'], msgId: number) {
  return readReply(WalletSession.get(), getTonConnectRequestKey(sessionId, msgId));
}

/** one device, one tab answers a request: the others find it taken */
function withRequestLock<T>(wallet: WalletSession, sessionId: TonConnectSession['id'], msgId: number, task: () => Promise<T>) {
  return withTabsLock(getRepliesPrefix(wallet) + getTonConnectRequestKey(sessionId, msgId), true, task).then((result) => {
    return result === undefined ? fail('handledElsewhere') : result;
  });
}

async function submitReply(wallet: WalletSession, key: string, reply: StoredReply) {
  const managers = wallet.managers;
  if(reply.phase === 'prepared') {
    try {
      const accepted = await managers.appWalletManager.tonConnectSubmitResponse({
        sessionId: reply.sessionId,
        msgId: reply.msgId,
        body: base64ToBytes(reply.body),
        traceId: reply.traceId
      });

      if(!accepted) {
        fail('bridgeUnavailable');
      }
    } catch(err) {
      const failure = tonConnectFailure(err);
      // * the server will never take it: nothing is kept for it
      if(failure === 'expired' || failure === 'handledElsewhere') {
        writeReply(wallet, key);
      }

      throw failure ? new TonConnectError(failure, err) : err;
    }

    // * the answer went: the session's close is what is left, kept until the server confirms it
    if(reply.close) {
      reply = {...reply, phase: 'closing', body: undefined};
      writeReply(wallet, key, reply);
    }
  }

  if(reply.phase === 'closing') {
    const closed = await managers.appWalletManager.tonConnectCloseSession(reply.sessionId).catch((err) => {
      // * closed already: by another tab, or by the dApp
      if(tonConnectFailure(err) === 'handledElsewhere') return true;
      throw err;
    });

    if(!closed) {
      fail('bridgeUnavailable');
    }
  }

  writeReply(wallet, key);
}

/** sends what earlier tabs prepared and could not deliver; a transfer caught mid-way is left to the engine's journal */
export async function retryTonConnectReplies() {
  const wallet = WalletSession.get();
  // * the server's clock: a request lives by it, a device's may be ahead
  const now = await getServerTime(wallet);
  const replies = readReplies(wallet);
  for(const key in replies) {
    const reply = replies[key];
    if(reply.expires <= now && !reply.close) {
      writeReply(wallet, key);
      continue;
    }

    if(reply.phase === 'executing') {
      continue;
    }

    // * read again under the lock: another tab may have sent it meanwhile
    await withTabsLock(getRepliesPrefix(wallet) + key, true, async() => {
      const current = readReply(wallet, key);
      if(current && current.phase !== 'executing') await submitReply(wallet, key, current);
    }).catch(() => {});
  }
}

export type TonConnectAnswer = {
  approved: boolean,
  /** what the user should hear of: a transfer that may have gone out, one that failed */
  failure?: TonConnectFailure | 'failed'
};

/**
 * Answers a request: the server is asked for it first (claimed, declined or not), then it is carried out and the
 * encrypted answer kept until the server took it. A decline, an invalid request and one of a session that is not
 * connected are claimed as declined and answered with their error.
 */
export function answerTonConnectRequest(status: WalletStatus, loaded: TonConnectLoadedRequest, approve: boolean): Promise<TonConnectAnswer> {
  const {session, envelope, request} = loaded;
  const wallet = WalletSession.get();
  const key = getTonConnectRequestKey(session.id, envelope.msg_id);
  return withRequestLock(wallet, session.id, envelope.msg_id, async() => {
    const stored = readReply(wallet, key);
    if(stored && stored.phase !== 'executing') {
      await submitReply(wallet, key, stored);
      return {approved: !!stored.approved, failure: stored.failure};
    } else if(stored) {
      fail('outcomeUnknown');
    }

    const now = await getServerTime(wallet);
    if(envelope.expires <= now || (request.kind === 'sendTransaction' && request.validUntil !== undefined && request.validUntil <= now)) {
      fail('expired');
    }

    const inactive = !isTonConnectSessionActive(session);
    const declined = !approve || request.kind === 'invalid' || inactive;
    // * what a signature binds is checked before the request is taken: a request taken is a request answered
    const signedAddress = parseTonAddress(loaded.address);
    const signedDomain = loaded.info?.domain;
    if(!declined && request.kind === 'signData' && (!signedAddress || !signedDomain)) {
      fail('invalidManifest');
    }

    return wallet.withTonConnectSigner(status, async(signer) => {
      const keys = await getSessionKeys(signer, session);
      try {
        let claimed: boolean;
        try {
          claimed = await withFreshChallenge(async() => {
            let answer: Uint8Array;
            if(!session.pFlags.closed && !session.pFlags.closing) {
              answer = (await proveSessionKey(wallet, session.id, keys)).answer;
            }

            try {
              return await wallet.managers.appWalletManager.tonConnectClaimRequest({
                sessionId: session.id,
                msgId: envelope.msg_id,
                appRequestId: request.id,
                challengeAnswer: answer,
                declined
              });
            } finally {
              answer?.fill(0);
            }
          });
        } catch(err) {
          throw err instanceof TonConnectError ? err : new TonConnectError(tonConnectFailure(err) || 'unavailable', err);
        }

        if(!claimed) {
          fail('handledElsewhere');
        }

        let json: string, close = false, failure: TonConnectAnswer['failure'];
        if(!approve) {
          json = buildErrorResponse(request.id, TonConnectErrorCode.USER_DECLINED);
        } else if(request.kind === 'invalid') {
          json = buildErrorResponse(request.id, request.code, request.message);
        } else if(inactive) {
          json = buildErrorResponse(request.id, TonConnectErrorCode.UNKNOWN_APP);
        } else if(request.kind === 'disconnect') {
          json = buildSuccessResponse(request.id, {});
          close = true;
        } else if(request.kind === 'sendTransaction') {
          // * from here a reload must not sign it again: the engine's journal settles what went
          writeReply(wallet, key, {sessionId: String(session.id), msgId: envelope.msg_id, phase: 'executing', expires: envelope.expires});
          try {
            const outcome = await wallet.sendTonConnect(status, loaded.operationId, request.intent);
            const phase = outcome.result.phase;
            if(outcome.result.signedBoc && (phase === 'submitted' || phase === 'handedOff' || phase === 'confirmed' || phase === 'submissionUnknown')) {
              // * one that may have gone is answered with what was signed, never an error a dApp would ask to pay
              // * again on; the user hears that it is not known yet
              json = buildSuccessResponse(request.id, outcome.result.signedBoc);
              if(phase === 'submissionUnknown') failure = 'outcomeUnknown';
            } else {
              failure = phase === 'submissionUnknown' || phase === 'submitted' ? 'outcomeUnknown' : 'failed';
              json = buildErrorResponse(request.id, TonConnectErrorCode.UNKNOWN);
            }
          } catch(err) {
            failure = isSendOutcomeUnknown(err, {rpcStarted: false}) ? 'outcomeUnknown' : 'failed';
            json = buildErrorResponse(request.id, TonConnectErrorCode.UNKNOWN);
          }
        } else {
          // * taken is answered: a failure to sign is the dApp's error, never its timeout
          try {
            const timestamp = await getServerTime(wallet);
            const digest = await signDataDigest(signedAddress, signedDomain, timestamp, request.payload);
            const signature = await signDigest(signer.seed, digest);
            json = buildSuccessResponse(request.id, buildSignDataResult({
              signature: bytesToBase64(signature),
              address: signedAddress.workchain + ':' + bytesToHex(signedAddress.hash),
              timestamp,
              domain: signedDomain,
              json: request.json
            }));
          } catch(err) {
            failure = 'failed';
            json = buildErrorResponse(request.id, TonConnectErrorCode.UNKNOWN);
          }
        }

        const reply: StoredReply = {
          sessionId: String(session.id),
          msgId: envelope.msg_id,
          phase: 'prepared',
          body: bytesToBase64(await seal(keys, json)),
          traceId: envelope.trace_id,
          close,
          approved: approve && !declined && !failure,
          failure,
          expires: envelope.expires
        };
        writeReply(wallet, key, reply);
        await submitReply(wallet, key, reply);
        return {approved: reply.approved, failure};
      } finally {
        keys.secretKey.fill(0);
      }
    });
  });
}

// MARK: Disconnect

/**
 * The wallet leaves: each session gets the wallet's own `disconnect` event under its key, then closes. A session a
 * key from before an update registered closes without one — the dApp could not open it.
 */
export async function disconnectTonConnectSessions(status: WalletStatus, sessions: TonConnectSession[]) {
  const wallet = WalletSession.get();
  const managers = wallet.managers;
  const open = sessions.filter((session) => !session.pFlags.closed);
  if(!open.length) {
    return;
  }

  let failed: any;
  await wallet.withTonConnectSigner(status, async(signer) => {
    for(const session of open) {
      try {
        let body: Uint8Array;
        const keys = await getSessionKeys(signer, session).catch((err): SessionKeys => {
          if(tonConnectFailure(err) === 'keyMismatch') return;
          throw err;
        });

        if(keys && session.client_id) {
          try {
            const eventId = await managers.appWalletManager.tonConnectNextEventId(session.id);
            body = await seal(keys, buildDisconnectEvent(eventId));
          } finally {
            keys.secretKey.fill(0);
          }
        }

        const closed = await managers.appWalletManager.tonConnectCloseSession(session.id, body).catch((err) => {
          if(tonConnectFailure(err) === 'handledElsewhere') return true;
          throw err;
        });

        if(!closed) {
          fail('bridgeUnavailable');
        }
      } catch(err) {
        failed ??= err;
      }
    }
  });

  if(failed) {
    throw failed;
  }
}
