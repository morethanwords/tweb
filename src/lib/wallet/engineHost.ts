/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {
  HostFailure,
  HttpRequest,
  HttpRequestId,
  StatuslessHostErrorKind,
  WalletStatuslessHost
} from '@ton/wallet-engine';
import type {WalletSentTransfer} from '@appManagers/appWalletManager';
import type {AppManagers} from '@lib/managers';
import base64ToBytes from '@helpers/string/base64ToBytes';
import {GramTransferDraftContent, isDefiniteTransferRefusal} from '@lib/wallet/transferMessages';

/**
 * The engine talks to the chain provider as if it were plain HTTPS, but the web client reaches it only
 * through MTProto: `toncenter.performApiRequest` carries a path, a query and a body and answers with the
 * provider's body or a failure string. That is the engine's "status-less" host shape.
 *
 * One request is never forwarded: the engine's `sendBoc` while a transfer is being submitted. That one goes
 * to the server as `wallet.sendTransfer`, which broadcasts it (or its fee-free alternative) and answers with
 * the receipt the history is matched by.
 */

export const TONCENTER_BASE_URL = 'https://toncenter.com';

const SEND_BOC_ENDPOINT = '/api/v2/jsonRPC';
const PENDING_LIST_ENDPOINT = '/api/v3/pendingTransactions';
const NFT_ITEMS_ENDPOINT = '/api/v3/nft/items';
/** the server holds a transfer for up to 30 s before answering, plus a margin for the transport */
const SEND_TIMEOUT = 40e3;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type WalletSubmissionAnswer =
  | {outcome: 'accepted', sent: WalletSentTransfer}
  | {outcome: 'rejected', error: string}
  | {outcome: 'uncertain', error: string};

/**
 * What the next `sendBoc` of the engine is part of. Only one transfer can be in flight.
 */
export type WalletSubmission = {
  /** the fee-free alternative signed beside the normal message, if the transfer is gasless */
  gasless?: Uint8Array,
  userId?: UserId,
  randomId: string,
  /** what the recipient's chat shows while a Gram transfer is out; a collectible's transfer has none */
  draft?: GramTransferDraftContent,
  /** `wallet.sendTransfer` was invoked: from then on the server may have the transfer */
  rpcStarted?: boolean,
  /** the signed message handed to the server (base64): what a dApp tracks a transfer by, also one the engine lost */
  signedBoc?: string,
  onAnswer?: (answer: WalletSubmissionAnswer) => void
};

let currentSubmission: WalletSubmission;

export function setWalletSubmission(submission: WalletSubmission) {
  currentSubmission = submission;
}

function hostFailure(kind: StatuslessHostErrorKind, diagnostic: string): HostFailure {
  return {kind, diagnostic};
}

function bodyOf(object: object) {
  return textEncoder.encode(JSON.stringify(object));
}

/**
 * Splits an engine URL into what the MTProto proxy takes. Anything outside the provider's `/api/` tree,
 * or a path that could escape it, is refused before it leaves.
 */
export function parseToncenterUrl(url: string) {
  if(!url.startsWith(TONCENTER_BASE_URL + '/api/')) {
    return;
  }

  // * checked as written: the URL parser would resolve `%2e%2e` and `..` before anyone saw them
  const rawPath = url.slice(TONCENTER_BASE_URL.length).split(/[?#]/, 1)[0];
  if(rawPath.includes('%') || rawPath.includes('..') || rawPath.includes('//')) {
    return;
  }

  const parsed = new URL(url);
  const path = parsed.pathname;

  return {
    endpoint: path,
    query: parsed.search ? parsed.search.slice(1) : ''
  };
}

function isSendBoc(request: HttpRequest, endpoint: string, payload: string) {
  if(request.method !== 'post' || endpoint !== SEND_BOC_ENDPOINT) {
    return false;
  }

  try {
    return JSON.parse(payload)?.method === 'sendBoc';
  } catch(err) {
    return false;
  }
}

function getSendBoc(payload: string): string {
  try {
    const boc = JSON.parse(payload)?.params?.boc;
    return typeof(boc) === 'string' ? boc : undefined;
  } catch(err) {}
}

/**
 * Toncenter sends JSON arrays where the engine expects maps for empty NFT metadata.
 */
function normalizeNftEmptyMaps(body: string) {
  const KEYS = ['metadata', 'content', 'collection_content', 'extra'];
  try {
    const json = JSON.parse(body);
    const visit = (value: any) => {
      if(!value || typeof(value) !== 'object') {
        return;
      }

      for(const key in value) {
        const item = value[key];
        if(KEYS.includes(key) && Array.isArray(item) && !item.length) {
          value[key] = {};
        } else {
          visit(item);
        }
      }
    };

    visit(json);
    return JSON.stringify(json);
  } catch(err) {
    return body;
  }
}

export class WalletStatuslessHostImpl implements WalletStatuslessHost {
  private cancelled: Set<number> = new Set();
  private pending: Map<number, (failure: HostFailure) => void> = new Map();
  private closed: boolean;

  /** `managers`: the wallet's account's, for good — a transfer goes out on the account it was signed for */
  constructor(private managers: AppManagers) {}

  public executeStatusless = async(request: HttpRequest): Promise<Uint8Array> => {
    const id = request.id.value;
    if(this.closed) {
      throw hostFailure('cancelled', 'wallet engine is closing');
    }

    if(this.cancelled.delete(id)) {
      throw hostFailure('cancelled', 'cancelled before start');
    }

    const parsed = parseToncenterUrl(request.url);
    if(!parsed) {
      throw hostFailure('policyViolation', 'request outside the configured provider base');
    }

    const payload = request.body.length ? textDecoder.decode(new Uint8Array(request.body)) : '';
    const submission = currentSubmission;
    if(submission && isSendBoc(request, parsed.endpoint, payload)) {
      return this.wrap(id, SEND_TIMEOUT, this.submit(id, submission, payload));
    }

    return this.wrap(id, request.timeoutMs, this.managers.appWalletManager.performToncenterRequest({
      post: request.method === 'post',
      endpoint: parsed.endpoint,
      query: parsed.query,
      payload
    }).then((body) => {
      if(parsed.endpoint === NFT_ITEMS_ENDPOINT) {
        body = normalizeNftEmptyMaps(body);
      }

      return textEncoder.encode(body);
    }, (err: ApiError) => {
      // * the provider answers "none pending" with a 404 the proxy drops, the engine reads only a list as that
      if(parsed.endpoint === PENDING_LIST_ENDPOINT && err.message === 'emulated traces not found') {
        return bodyOf({transactions: []});
      }

      throw hostFailure(err.type === 'TIMEOUT' ? 'timeout' : 'other', `MTP: ${err.type}${err.message ? ': ' + err.message : ''}`);
    }));
  };

  public cancelStatusless = async(requestId: HttpRequestId) => {
    const reject = this.pending.get(requestId.value);
    if(reject) {
      reject(hostFailure('cancelled', 'cancelled'));
    } else {
      this.cancelled.add(requestId.value);
    }
  };

  public close() {
    this.closed = true;
    this.pending.forEach((reject) => reject(hostFailure('cancelled', 'wallet engine is closing')));
  }

  private wrap<T>(id: number, timeoutMs: number, promise: Promise<T>) {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        finish();
        reject(hostFailure('timeout', 'the request timed out'));
      }, Math.max(1000, timeoutMs || 15e3));

      // * once, and only its own entry: a late answer never takes away a newer request's cancellation
      const finish = () => {
        clearTimeout(timeout);
        if(this.pending.get(id) === cancel) this.pending.delete(id);
      };

      const cancel = (failure: HostFailure) => {
        finish();
        reject(failure);
      };

      this.pending.set(id, cancel);

      promise.then((value) => {
        finish();
        resolve(value);
      }, (err) => {
        finish();
        reject(err);
      });
    });
  }

  /**
   * A definite refusal is answered as a JSON-RPC error object: the engine's status-less transport would read a
   * scalar error or `ok: false` as an ambiguous provider failure, turning a refusal into "submission unknown".
   * A transport failure or a server error is exactly that ambiguity and is reported as a host failure.
   */
  private async submit(id: number, submission: WalletSubmission, payload: string): Promise<Uint8Array> {
    const boc = getSendBoc(payload);
    const normal = boc && base64ToBytes(boc);
    if(!normal?.length) {
      submission.onAnswer?.({outcome: 'rejected', error: 'WALLET_TRANSFER_DATA_INVALID'});
      return bodyOf({jsonrpc: '2.0', id: '' + id, error: {code: -32000, message: 'WALLET_TRANSFER_DATA_INVALID'}});
    }

    try {
      submission.rpcStarted = true;
      submission.signedBoc = boc;
      const sent = await this.managers.appWalletManager.sendTransfer({
        dataNormal: normal,
        dataGasless: submission.gasless,
        userId: submission.userId,
        randomId: submission.randomId,
        draft: submission.draft
      });

      submission.onAnswer?.({outcome: 'accepted', sent});
      return bodyOf({ok: true, result: {'@type': 'ok'}});
    } catch(err) {
      const error = err as ApiError;
      if(isDefiniteTransferRefusal(error)) {
        submission.onAnswer?.({outcome: 'rejected', error: error.type});
        return bodyOf({jsonrpc: '2.0', id: '' + id, error: {code: -32000, message: error.type}});
      }

      submission.onAnswer?.({outcome: 'uncertain', error: error.type});
      throw hostFailure('other', `MTP: ${error.type}`);
    }
  }
}
