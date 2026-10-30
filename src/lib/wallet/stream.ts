/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {WalletTransaction} from '@layer';
import type {AppManagers} from '@lib/managers';
import bytesToHex from '@helpers/bytes/bytesToHex';
import base64ToBytes from '@helpers/string/base64ToBytes';
import {canonicalTonAddress} from '@lib/wallet/transferMessages';
import {toFriendlyTonAddress} from '@lib/wallet/tonAddress';

/**
 * The chain provider's live stream for the wallet's address, the way the desktop client keeps one: a WebSocket
 * whose URL comes from MTProto (`toncenter.getStreamingUrl`). Its frames are read as far as they are safe to show
 * before the server lists them (iOS WalletStreaming.swift, Android GramWalletStreaming): a finalized balance, plain
 * transfers in from finalized traces, the trace of an outgoing message; everything else only hints that the window
 * should ask the server. Polling stays as the fallback when the stream is down.
 */

/** how sure the provider is: `pending` is an emulation, `confirmed` may still be rolled back, `finalized` cannot */
export type WalletStreamFinality = 'pending' | 'confirmed' | 'finalized';

export type WalletStreamEvent =
  | {type: 'state', finality?: WalletStreamFinality, balance: string}
  | {
    type: 'transactions',
    finality?: WalletStreamFinality,
    /** the normalized hash of the external message the trace started with */
    traceId: string,
    /** plain transfers in, as the history would list them, from a finalized trace only */
    incoming: WalletTransaction[],
    /** the wallet ran an external message: one it sent */
    outgoing: boolean
  }
  | {type: 'invalidated', traceId: string};

/** the id of a transfer read off the stream: the server's own ids never take this form */
export const WALLET_STREAM_ID_PREFIX = 'stream:';

const PING_INTERVAL = 10e3;
const STALL_TIMEOUT = 30e3;
const RENEW_MARGIN = 60e3;
const BACKOFF = [500, 1000, 2000, 4000, 8000, 15000, 30000];
/** a frame bigger than this is no frame of one wallet's (iOS walletStreamingMaximumFrameBytes) */
const MAX_FRAME_LENGTH = 4 * 1024 * 1024;
/**
 * The opcodes of a plain transfer: none (an empty body), a comment, a private comment. Anything else — a token's or a
 * collectible's notification, a bounce — is no transfer of Grams the history would list as one.
 */
const PLAIN_TRANSFER_OPCODES: ReadonlySet<string> = new Set(['', '0x00000000', '0x2167da4b']);

const isString = (value: any): value is string => typeof(value) === 'string';
const isNanos = (value: any): value is string => isString(value) && /^\d{1,30}$/.test(value);

/**
 * A 32-byte hash however it is written — hex, base64 or its URL form — as lowercase hex: the provider and the server
 * may write one hash differently. Anything else stays as it is.
 */
export function normalizeWalletHash(hash: string) {
  if(!isString(hash)) {
    return '';
  }

  const text = hash.trim();
  if(/^[0-9a-fA-F]{64}$/.test(text)) {
    return text.toLowerCase();
  }

  if(/^[A-Za-z0-9+/_-]{43}=?$/.test(text)) {
    try {
      const bytes = base64ToBytes(text);
      if(bytes.length === 32) return bytesToHex(bytes);
    } catch(err) {}
  }

  return text;
}

function parseFinality(value: any): WalletStreamFinality {
  return value === 'pending' || value === 'confirmed' || value === 'finalized' ? value : undefined;
}

/**
 * A transaction of the wallet's that is a plain transfer in (iOS WalletStreamingEventParser.transaction, Android
 * fromStreamTransaction): from another address, with a value, nothing sent out of it, not aborted, not bounced, and a
 * body that is a comment or none. No comment is read off the body: the server's copy brings it.
 */
function parseIncoming(transaction: any, own: string, addressBook: any): WalletTransaction {
  const message = transaction?.in_msg;
  const description = transaction?.description;
  const compute = description?.compute_ph;
  const opcode = message?.opcode === null ? '' : message?.opcode;
  if(
    transaction.emulated === true ||
    !isString(transaction.hash) || !transaction.hash ||
    !isString(transaction.lt) || !/^\d+$/.test(transaction.lt) ||
    !Number.isSafeInteger(transaction.now) || transaction.now <= 0 ||
    !isNanos(transaction.total_fees) ||
    (Array.isArray(transaction.out_msgs) && transaction.out_msgs.length) ||
    description?.aborted === true ||
    (compute && !compute.skipped && compute.success !== true) ||
    !message || message.bounced === true ||
    !isNanos(message.value) || !/[1-9]/.test(message.value) ||
    !isString(opcode) || !PLAIN_TRANSFER_OPCODES.has(opcode.toLowerCase()) ||
    canonicalTonAddress(message.destination) !== own
  ) {
    return;
  }

  const source = canonicalTonAddress(message.source);
  if(!source || source === own) {
    return;
  }

  // * the provider's own way to write the address, when it is that address; the form a wallet shows people otherwise
  const friendly = addressBook?.[message.source]?.user_friendly;
  return {
    _: 'walletTransaction',
    pFlags: {incoming: true},
    id: WALLET_STREAM_ID_PREFIX + transaction.lt + ':' + transaction.hash,
    amount: message.value,
    fee: transaction.total_fees,
    date: transaction.now,
    peer: {
      _: 'walletTransactionPeerAddress',
      address: isString(friendly) && canonicalTonAddress(friendly) === source ? friendly : toFriendlyTonAddress(message.source)
    },
    tx_hash: transaction.hash
  };
}

/**
 * What a frame says of the wallet at `address`, or nothing: a frame of another account, one that does not parse, one
 * too big to be one wallet's
 */
export function parseWalletStreamFrame(data: unknown, address: string): WalletStreamEvent {
  if(!isString(data) || data.length > MAX_FRAME_LENGTH) {
    return;
  }

  let object: any;
  try {
    object = JSON.parse(data);
  } catch(err) {
    return;
  }

  const own = canonicalTonAddress(address);
  if(!own || !object || typeof(object) !== 'object') {
    return;
  }

  switch(object.type) {
    case 'account_state_change': {
      // * never another account's balance (Android), nor one that is no whole number
      const balance = object.state?.balance;
      if(canonicalTonAddress(object.account) !== own || !isNanos(balance)) return;
      return {type: 'state', finality: parseFinality(object.finality), balance};
    }

    case 'transactions': {
      const traceId = object.trace_external_hash_norm;
      const list: any[] = Array.isArray(object.transactions) ?
        object.transactions.filter((transaction: any) => canonicalTonAddress(transaction?.account) === own) :
        [];
      if(!isString(traceId) || !traceId || !list.length) return;
      const finality = parseFinality(object.finality);
      return {
        type: 'transactions',
        finality,
        traceId,
        incoming: finality === 'finalized' ?
          list.map((transaction) => parseIncoming(transaction, own, object.address_book)).filter(Boolean) :
          [],
        // * an external message in: no internal source, nobody's value
        outgoing: list.some((transaction) => transaction.in_msg && transaction.in_msg.source == null)
      };
    }

    case 'trace_invalidated': {
      const traceId = object.trace_external_hash_norm;
      return isString(traceId) && traceId ? {type: 'invalidated', traceId} : undefined;
    }
  }
}

export default class WalletStream {
  private socket: WebSocket;
  private stopped = true;
  private attempt = 0;
  private pingTimer: number;
  private stallTimer: number;
  private renewTimer: number;
  private reconnectTimer: number;
  private lastFrameAt = 0;
  private pingId = 0;
  private subscriptionId = 0;

  constructor(
    private managers: AppManagers,
    private address: string,
    private onEvent: (event: WalletStreamEvent) => void
  ) {}

  public get healthy() {
    return !!this.socket && this.socket.readyState === WebSocket.OPEN && (Date.now() - this.lastFrameAt) < STALL_TIMEOUT;
  }

  public start() {
    if(!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  public stop() {
    this.stopped = true;
    this.teardown();
    clearTimeout(this.reconnectTimer);
  }

  private teardown() {
    clearInterval(this.pingTimer);
    clearInterval(this.stallTimer);
    clearTimeout(this.renewTimer);
    const socket = this.socket;
    this.socket = undefined;
    if(socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      try {
        socket.close();
      } catch(err) {}
    }
  }

  private async connect() {
    let result;
    try {
      // * the manager falls back on the last URL while it holds, when a fresh one cannot be had (iOS)
      result = await this.managers.appWalletManager.getStreamingUrl();
    } catch(err) {
      this.scheduleReconnect();
      return;
    }

    if(this.stopped) return;
    let url: URL;
    try {
      url = new URL(result.url);
      if(url.protocol !== 'wss:' || url.username || url.password) throw new Error('bad stream url');
    } catch(err) {
      this.scheduleReconnect();
      return;
    }

    const socket = this.socket = new WebSocket(url.toString());
    socket.onopen = () => {
      this.attempt = 0;
      this.lastFrameAt = Date.now();
      socket.send(JSON.stringify({
        operation: 'subscribe',
        id: 'sub-' + ++this.subscriptionId,
        types: ['account_state_change', 'transactions'],
        addresses: [this.address],
        min_finality: 'pending'
      }));
      this.pingTimer = self.setInterval(() => {
        socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({operation: 'ping', id: 'ping-' + ++this.pingId}));
      }, PING_INTERVAL);
      this.stallTimer = self.setInterval(() => {
        if(Date.now() - this.lastFrameAt > STALL_TIMEOUT) this.reconnect();
      }, STALL_TIMEOUT / 3);
    };

    socket.onmessage = (e) => {
      this.lastFrameAt = Date.now();
      const event = parseWalletStreamFrame(e.data, this.address);
      if(event) this.onEvent(event);
    };

    socket.onclose = socket.onerror = () => this.reconnect();

    // * the URL expires: a fresh one a minute before (an absolute time, or seconds from now for a small value)
    const expires = result.expires > 1e9 ? result.expires * 1000 - Date.now() : result.expires * 1000;
    if(expires > 0) {
      this.renewTimer = self.setTimeout(() => this.reconnect(true), Math.max(5e3, expires - RENEW_MARGIN));
    }
  }

  private reconnect(immediately?: boolean) {
    this.teardown();
    if(this.stopped) return;
    if(immediately) {
      this.connect();
    } else {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if(this.stopped) return;
    clearTimeout(this.reconnectTimer);
    // * a little apart, so windows that lost the provider together do not come back all at once
    const delay = BACKOFF[Math.min(this.attempt++, BACKOFF.length - 1)] * (0.8 + Math.random() * 0.4);
    this.reconnectTimer = self.setTimeout(() => this.connect(), delay);
  }
}
