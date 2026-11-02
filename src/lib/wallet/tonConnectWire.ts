/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {SendIntent} from '@ton/wallet-engine';
import type {TonConnectSignDataPayload} from '@lib/wallet/tonConnectCrypto';
import {parseTonAddress, TonAddressParts} from '@lib/wallet/tonAddress';
import base64ToBytes from '@helpers/string/base64ToBytes';
import bigInt from 'big-integer';

/**
 * TON Connect on the wire, without any key: what a link carries, what a dApp asks for once it is connected, and
 * every packet the wallet answers with. Telegram's server is the bridge (wallet.tonConnect*): it relays opaque
 * `nonce || box` bytes, so everything here is the JSON inside them. The rules are the wallet engine's
 * (`ton_connect.rs`, `ton-connect-core`) and the official clients' (iOS WalletTonConnect.swift, tdesktop
 * wallet_ton_connect*.cpp).
 */

/** the mainnet's global id: the only network this wallet is on */
export const TON_CONNECT_NETWORK = '-239';
export const TON_CONNECT_PROTOCOL_VERSION = 2;
export const TON_CONNECT_MAX_MESSAGES = 255;
/** what this wallet signs: a `cell` signData needs a TL-B encoder it does not have */
export const TON_CONNECT_SIGN_DATA_TYPES = ['text', 'binary'] as const;
/** a link longer than this is no link a dApp makes */
const MAX_LINK_LENGTH = 256 * 1024;
const MAX_TRACE_ID_LENGTH = 100;
const MAX_REQUEST_ID_LENGTH = 100;
const MAX_PACKET_LENGTH = 1024 * 1024;
const START_PARAM_PREFIX = 'tonconnect-';
const LINK_FIELDS = ['id', 'v', 'r', 'ret', 'trace_id'];

export enum TonConnectErrorCode {
  UNKNOWN = 0,
  BAD_REQUEST = 1,
  MANIFEST_NOT_FOUND = 2,
  MANIFEST_CONTENT = 3,
  UNKNOWN_APP = 100,
  USER_DECLINED = 300,
  METHOD_NOT_SUPPORTED = 400
}

const ERROR_MESSAGES: {[code in TonConnectErrorCode]: string} = {
  [TonConnectErrorCode.UNKNOWN]: 'Unknown error',
  [TonConnectErrorCode.BAD_REQUEST]: 'Bad request',
  [TonConnectErrorCode.MANIFEST_NOT_FOUND]: 'Manifest not found',
  [TonConnectErrorCode.MANIFEST_CONTENT]: 'Invalid manifest',
  [TonConnectErrorCode.UNKNOWN_APP]: 'Unknown app',
  [TonConnectErrorCode.USER_DECLINED]: 'User declined the request',
  [TonConnectErrorCode.METHOD_NOT_SUPPORTED]: 'Method not supported'
};

export function tonConnectErrorMessage(code: TonConnectErrorCode) {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES[TonConnectErrorCode.UNKNOWN];
}

export class TonConnectWireError extends Error {
  constructor(public code: TonConnectErrorCode, message?: string) {
    super(message || tonConnectErrorMessage(code));
  }
}

function badRequest(message?: string): never {
  throw new TonConnectWireError(TonConnectErrorCode.BAD_REQUEST, message);
}

function isObject(value: unknown): value is {[key: string]: unknown} {
  return !!value && typeof(value) === 'object' && !Array.isArray(value);
}

function optionalString(object: {[key: string]: unknown}, key: string) {
  const value = object[key];
  if(value === undefined || value === null) return;
  if(typeof(value) !== 'string') badRequest(key + ' must be a string');
  return value;
}

// MARK: Links

export type TonConnectConnectRequest = {
  /** where the dApp's manifest is: an https URL */
  manifestUrl: string,
  /** the items asked for, in order: `ton_addr` always, `ton_proof` maybe */
  items: string[],
  /** the network `ton_addr` names, if any */
  network?: string,
  /** `ton_proof`'s challenge, when the dApp wants the wallet to prove itself */
  proofPayload?: string
};

export type TonConnectLink = {
  /** the dApp's client id `A`, 64 lowercase hex characters */
  clientId: string,
  /** a connect link carries its request; a link without one wakes the wallet up for a pending request */
  request?: TonConnectConnectRequest,
  traceId?: string,
  /** where to go back to afterwards: a web client stays where it is */
  ret?: string
};

function urlHost(url: URL) {
  return url.hostname.toLowerCase();
}

/**
 * `startapp=tonconnect-…`: the connect query squeezed into a Mini App start parameter, the way the TON Connect SDK
 * writes it — "--" for "%", "__" for "=", "-" for "&", undone in that order
 */
export function decodeTonConnectStartParam(startapp: string) {
  if(!startapp?.startsWith(START_PARAM_PREFIX)) {
    return;
  }

  return startapp.slice(START_PARAM_PREFIX.length)
  .replace(/--/g, '%')
  .replace(/__/g, '=')
  .replace(/-/g, '&');
}

/**
 * Whether a link is a TON Connect one: `tc://`, `tg://ton-connect`, the wallet's own links with the connect fields
 * (`t.me/sendgrams?id=…`, `tg://sendgrams?…`) or a `tonconnect-` start parameter (also addressed to the wallet by
 * name, `tg://resolve?domain=sendgrams&startapp=…`). A malformed one is still one: it must not fall through to a
 * payment link.
 */
export function isTonConnectUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch(err) {
    return false;
  }

  const scheme = url.protocol.slice(0, -1).toLowerCase();
  const host = urlHost(url);
  const telegramScheme = scheme === 'tg' || scheme === 'telegram';
  if(scheme === 'tc' || (telegramScheme && host === 'ton-connect')) {
    return true;
  }

  const params = url.searchParams;
  const startapp = params.getAll('startapp');
  const carriesStart = startapp.some((value) => value.startsWith(START_PARAM_PREFIX));
  const walletLink = (scheme === 'https' && host === 't.me' && /^\/sendgrams\/?$/i.test(url.pathname)) ||
    (telegramScheme && host === 'sendgrams');
  if(walletLink) {
    return carriesStart || ['id', 'v', 'r'].some((name) => params.has(name));
  }

  return telegramScheme && host === 'resolve' && params.get('domain')?.toLowerCase() === 'sendgrams' && carriesStart;
}

/** `+` is a space in a query; URLSearchParams agrees */
function parseQuery(query: string) {
  const params = new URLSearchParams(query);
  const fields: {[name: string]: string} = {};
  for(const [name, value] of params) {
    if(!LINK_FIELDS.includes(name)) continue;
    // * a field given twice is a link nobody can read the same way twice
    if(fields[name] !== undefined) return;
    fields[name] = value;
  }

  return fields;
}

/**
 * Reads a TON Connect link; nothing when it is malformed. The rules are iOS's (`TonConnectLink`): a 64-hex `id`,
 * `v` 2 when given and required with `r`, a `trace_id` of at most 100 characters, and a `tonconnect-` start
 * parameter that is the only connect field of its link.
 */
export function parseTonConnectUrl(value: string): TonConnectLink | undefined {
  if(!value || value.length > MAX_LINK_LENGTH || !isTonConnectUrl(value)) {
    return;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch(err) {
    return;
  }

  if(url.username || url.password || url.hash) {
    return;
  }

  let query = url.search.slice(1);
  const starts = url.searchParams.getAll('startapp');
  if(starts.some((start) => start.startsWith(START_PARAM_PREFIX))) {
    if(starts.length !== 1 || ['id', 'v', 'r'].some((name) => url.searchParams.has(name))) {
      return;
    }

    query = decodeTonConnectStartParam(starts[0]);
  }

  return parseTonConnectQuery(query);
}

export function parseTonConnectQuery(query: string): TonConnectLink | undefined {
  const fields = parseQuery(query);
  if(!fields) {
    return;
  }

  const id = fields.id;
  if(!id || !/^[0-9a-fA-F]{64}$/.test(id)) {
    return;
  }

  if(fields.v !== undefined && fields.v !== '2') {
    return;
  }

  const traceId = fields.trace_id;
  if(traceId !== undefined && (traceId.length > MAX_TRACE_ID_LENGTH || !isPrintableAscii(traceId))) {
    return;
  }

  const link: TonConnectLink = {clientId: id.toLowerCase(), traceId: traceId || undefined, ret: fields.ret};
  if(fields.r !== undefined) {
    if(!fields.r || fields.v !== '2') {
      return;
    }

    try {
      link.request = parseConnectRequest(fields.r);
    } catch(err) {
      return;
    }
  }

  return link;
}

function isPrintableAscii(value: string) {
  return /^[\x20-\x7e]*$/.test(value);
}

/** an https URL with a host and nothing a manifest URL has no business carrying */
export function isManifestUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password && !url.hash;
  } catch(err) {
    return false;
  }
}

/** a network id is a canonical decimal int32 */
function isNetworkId(value: string) {
  const number = Number(value);
  return /^-?\d+$/.test(value) && String(number) === value && number >= -0x80000000 && number <= 0x7fffffff;
}

/**
 * The `r` of a connect link: `{manifestUrl, items: [{name: 'ton_addr', network?}, {name: 'ton_proof', payload}]}`.
 * `ton_addr` is required, every item once; an item this wallet does not know refuses the link (iOS).
 */
export function parseConnectRequest(json: string): TonConnectConnectRequest {
  const object = parseJsonObject(json);
  if(Object.keys(object).some((key) => key !== 'manifestUrl' && key !== 'items')) {
    badRequest('unknown connect request field');
  }

  const manifestUrl = object.manifestUrl;
  const items = object.items;
  if(typeof(manifestUrl) !== 'string' || !isManifestUrl(manifestUrl) || !Array.isArray(items) || !items.length) {
    badRequest('connect request');
  }

  const request: TonConnectConnectRequest = {manifestUrl, items: []};
  for(const item of items) {
    const name = isObject(item) ? item.name : undefined;
    if(typeof(name) !== 'string' || !name || request.items.includes(name)) {
      badRequest('connect item');
    }

    request.items.push(name);
    const keys = Object.keys(item as object);
    if(name === 'ton_addr') {
      if(keys.some((key) => key !== 'name' && key !== 'network')) badRequest('ton_addr');
      const network = optionalString(item as {[key: string]: unknown}, 'network');
      if(network !== undefined && !isNetworkId(network)) badRequest('network');
      request.network = network;
    } else if(name === 'ton_proof') {
      if(keys.some((key) => key !== 'name' && key !== 'payload')) badRequest('ton_proof');
      const payload = (item as {[key: string]: unknown}).payload;
      if(typeof(payload) !== 'string') badRequest('ton_proof payload');
      request.proofPayload = payload;
    } else {
      badRequest('unknown connect item');
    }
  }

  if(!request.items.includes('ton_addr')) {
    badRequest('ton_addr is required');
  }

  return request;
}

/** JSON that is an object, with no key given twice (a parser would quietly keep one of them) */
export function parseJsonObject(json: string): {[key: string]: unknown} {
  if(!json || json.length > MAX_PACKET_LENGTH || hasDuplicateKeys(json)) {
    badRequest('JSON');
  }

  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch(err) {
    badRequest('JSON');
  }

  if(!isObject(value)) {
    badRequest('JSON object expected');
  }

  return value;
}

/** iOS's TonConnectJSONStructure: duplicate keys, escaped spellings included, refuse the packet */
function hasDuplicateKeys(json: string) {
  const stack: Set<string>[] = [];
  let expectKey = false;
  for(let i = 0; i < json.length; ++i) {
    const char = json[i];
    if(char === '"') {
      let end = i + 1;
      for(; end < json.length && json[end] !== '"'; ++end) {
        if(json[end] === '\\') ++end;
      }

      if(expectKey && stack.length) {
        let key: string;
        try {
          key = JSON.parse(json.slice(i, end + 1));
        } catch(err) {
          return true;
        }

        const keys = stack[stack.length - 1];
        if(keys.has(key)) return true;
        keys.add(key);
      }

      expectKey = false;
      i = end;
    } else if(char === '{') {
      stack.push(new Set());
      expectKey = true;
    } else if(char === '[') {
      stack.push(undefined);
      expectKey = false;
    } else if(char === '}' || char === ']') {
      stack.pop();
      expectKey = false;
    } else if(char === ',') {
      expectKey = !!stack[stack.length - 1];
    }
  }

  return false;
}

// MARK: Domains

/** a manifest's host, lowercase, without the trailing dots of an absolute name */
export function getTonConnectHost(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.+$/, '');
  } catch(err) {
    return '';
  }
}

/**
 * The domain a signature binds: the manifest's host, with its port when it is not the scheme's own (iOS
 * TonConnectManifestInfo). URL drops a default port by itself.
 */
export function getTonConnectDomain(url: string) {
  const host = getTonConnectHost(url);
  if(!host) {
    return '';
  }

  try {
    const port = new URL(url).port;
    return port ? host + ':' + port : host;
  } catch(err) {
    return '';
  }
}

/**
 * Whether a dApp may have a `ton_proof` for `domain` (tdesktop TonConnectProofDomainAllowed). A proof for
 * telegram.org, or for the domain of the server's wallet-ownership challenge, is byte for byte the proof the server
 * takes as the wallet's own (wallet.replaceWallet, wallet.enableBackup): only the domain tells the two apart.
 */
export function isTonConnectProofDomainAllowed(domain: string, ownershipDomain?: string) {
  const normalize = (value: string) => (value || '').toLowerCase().replace(/\.+$/, '');
  const normalized = normalize(domain);
  const ownership = normalize(ownershipDomain);
  return !!normalized && normalized !== 'telegram.org' && (!ownership || normalized !== ownership);
}

// MARK: dApp requests

export type TonConnectMessage = {
  /** the destination as the dApp wrote it: a user-friendly address */
  address: string,
  /** nanograms, canonical decimal */
  amount: string,
  /** a one-cell BoC, base64 */
  payload?: string,
  stateInit?: string,
  /** the destination's own flag: a bounceable address bounces */
  bounce: boolean
};

export type TonConnectSignDataJson = {
  type: 'text' | 'binary',
  text?: string,
  bytes?: string,
  network?: string,
  from?: string
};

export type TonConnectAppRequest = {
  /** the dApp's id of the request, echoed in the answer */
  id: string,
  method: string
} & (
  | {
    kind: 'sendTransaction',
    messages: TonConnectMessage[],
    /** unix seconds: the transfer is no good after it */
    validUntil?: number,
    intent: SendIntent
  }
  | {
    kind: 'signData',
    /** what is echoed in the answer, as the dApp sent it */
    json: TonConnectSignDataJson,
    payload: TonConnectSignDataPayload
  }
  | {kind: 'disconnect'}
  /** a request that is answered with an error, never shown */
  | {kind: 'invalid', code: TonConnectErrorCode, message: string}
);

export type TonConnectRequestContext = {
  /** the wallet's address, any form */
  address: string,
  /** unix seconds now */
  now: number
};

export function isTonConnectRequestId(id: unknown): id is string {
  return typeof(id) === 'string' && id.length >= 1 && id.length <= MAX_REQUEST_ID_LENGTH && isPrintableAscii(id);
}

function sameAccount(a: TonAddressParts, b: TonAddressParts) {
  return !!a && !!b && a.workchain === b.workchain && a.hash.length === b.hash.length && a.hash.every((byte, i) => byte === b.hash[i]);
}

/** `network` and `from` must name this wallet, when given */
function checkSigningContext(object: {[key: string]: unknown}, context: TonConnectRequestContext) {
  const network = optionalString(object, 'network');
  if(network !== undefined && network !== TON_CONNECT_NETWORK) {
    badRequest('TON Connect request network differs from the active network');
  }

  const from = optionalString(object, 'from');
  if(from !== undefined && !sameAccount(parseTonAddress(from), parseTonAddress(context.address))) {
    badRequest('TON Connect request signer differs from the connected account');
  }

  return {network, from};
}

function isBase64(value: string) {
  return /^[A-Za-z0-9+/_-]+={0,2}$/.test(value);
}

function decodeBase64(value: string) {
  if(!isBase64(value) && value !== '') {
    badRequest('base64');
  }

  try {
    return base64ToBytes(value.replace(/-/g, '+').replace(/_/g, '/'));
  } catch(err) {
    badRequest('base64');
  }
}

function canonicalAmount(value: unknown) {
  if(typeof(value) !== 'string' || !/^\d{1,40}$/.test(value)) {
    badRequest('amount');
  }

  return value.replace(/^0+(?=\d)/, '');
}

function parseMessage(value: unknown): TonConnectMessage {
  if(!isObject(value)) {
    badRequest('message');
  }

  const address = value.address;
  // * a user-friendly address: its tag says whether the destination bounces
  const parts = typeof(address) === 'string' && !address.includes(':') ? parseTonAddress(address) : undefined;
  if(!parts || parts.testnet) {
    badRequest('Expected a friendly destination address');
  }

  const extra = value.extra_currency;
  if(extra !== undefined && extra !== null && (!isObject(extra) || Object.keys(extra).length)) {
    throw new TonConnectWireError(TonConnectErrorCode.METHOD_NOT_SUPPORTED, 'Extra currencies are not supported');
  }

  const payload = optionalString(value, 'payload');
  const stateInit = optionalString(value, 'stateInit');
  for(const boc of [payload, stateInit]) {
    if(boc !== undefined && (!boc || !isBase64(boc))) badRequest('Invalid transaction cell');
  }

  return {
    address: address as string,
    amount: canonicalAmount(value.amount),
    payload,
    stateInit,
    bounce: parts.bounceable
  };
}

function parseTransaction(object: {[key: string]: unknown}, context: TonConnectRequestContext) {
  checkSigningContext(object, context);
  // * the SDK's own spelling never reaches the wire: a request carrying it is malformed, and its deadline must not be
  // * dropped for a fresh one
  if(object.validUntil !== undefined) {
    badRequest('validUntil');
  }

  const validUntil = object.valid_until;
  if(validUntil !== undefined && validUntil !== null) {
    if(typeof(validUntil) !== 'number' || !Number.isInteger(validUntil) || validUntil < 0 || validUntil > 0xffffffff) {
      badRequest('valid_until');
    }

    if(context.now > validUntil) {
      badRequest('TON Connect request has expired');
    }
  }

  if(object.items !== undefined) {
    throw new TonConnectWireError(TonConnectErrorCode.METHOD_NOT_SUPPORTED, 'Structured transactions are not supported');
  }

  const list = object.messages;
  if(!Array.isArray(list) || !list.length) {
    badRequest('messages');
  }

  if(list.length > TON_CONNECT_MAX_MESSAGES) {
    throw new TonConnectWireError(TonConnectErrorCode.METHOD_NOT_SUPPORTED, 'Outgoing message batch exceeds wallet capability');
  }

  const messages = list.map(parseMessage);
  const intent: SendIntent = {
    expiration: typeof(validUntil) === 'number' ? {kind: 'exact', unixTimestamp: validUntil} : {kind: 'engineDefault'},
    messages: messages.map((message) => ({
      destination: message.address,
      amount: {kind: 'exact', nanograms: message.amount},
      body: message.payload ? {kind: 'rawPayload', boc: message.payload} : {kind: 'empty'},
      bounce: message.bounce,
      stateInit: message.stateInit ?? null
    }))
  };

  return {messages, validUntil: typeof(validUntil) === 'number' ? validUntil : undefined, intent};
}

function parseSignData(object: {[key: string]: unknown}, context: TonConnectRequestContext): {json: TonConnectSignDataJson, payload: TonConnectSignDataPayload} {
  const {network, from} = checkSigningContext(object, context);
  const type = object.type;
  if(type === 'text') {
    const text = object.text;
    if(typeof(text) !== 'string') badRequest('text');
    return {json: {type, text, network, from}, payload: {type, text}};
  }

  if(type === 'binary') {
    const bytes = object.bytes;
    if(typeof(bytes) !== 'string') badRequest('bytes');
    return {json: {type, bytes, network, from}, payload: {type, bytes: decodeBase64(bytes)}};
  }

  if(type === 'cell') {
    throw new TonConnectWireError(TonConnectErrorCode.METHOD_NOT_SUPPORTED, 'Cell data is not supported');
  }

  badRequest('Unknown signing data type');
}

/**
 * A dApp's request as it came out of its box: `{method, params: [json], id}`. One this wallet cannot do, or that
 * names another network or account, comes back as `invalid`, to be answered with its error; one with no usable id
 * cannot be answered at all and throws.
 */
export function parseAppRequest(plaintext: string, context: TonConnectRequestContext): TonConnectAppRequest {
  const object = parseJsonObject(plaintext);
  const id = object.id;
  if(!isTonConnectRequestId(id)) {
    badRequest('Request ID must contain 1-100 printable ASCII characters');
  }

  const method = typeof(object.method) === 'string' ? object.method : '';
  const params = object.params;
  try {
    const param = () => {
      if(!Array.isArray(params) || params.length !== 1 || typeof(params[0]) !== 'string') {
        badRequest('Expected one JSON parameter');
      }

      return parseJsonObject(params[0]);
    };

    switch(method) {
      case 'sendTransaction':
        return {id, method, kind: 'sendTransaction', ...parseTransaction(param(), context)};
      case 'signData':
        return {id, method, kind: 'signData', ...parseSignData(param(), context)};
      case 'disconnect':
        return {id, method, kind: 'disconnect'};
      default:
        throw new TonConnectWireError(TonConnectErrorCode.METHOD_NOT_SUPPORTED, 'Method is not supported');
    }
  } catch(err) {
    if(!(err instanceof TonConnectWireError)) throw err;
    return {id, method, kind: 'invalid', code: err.code, message: err.message};
  }
}

// MARK: Wallet packets

export type TonConnectAccount = {
  /** raw, `0:<hex>` */
  address: string,
  network: string,
  walletStateInit: string,
  /** the key that signs now, hex: dApps check proofs and signed data with it */
  publicKey: string
};

export type TonConnectProof = {
  timestamp: number,
  domain: string,
  payload: string,
  /** base64 */
  signature: string
};

/** the `id` of an event is a number: the server's 64-bit one goes in as its digits */
function eventJson(event: string, eventId: string | number, payload: string) {
  const id = String(eventId);
  if(!/^\d{1,20}$/.test(id)) {
    throw new Error('TONCONNECT_EVENT_ID_INVALID');
  }

  return '{"event":' + JSON.stringify(event) + ',"id":' + id + ',"payload":' + payload + '}';
}

export function tonConnectFeatures() {
  return [
    {name: 'SendTransaction', maxMessages: TON_CONNECT_MAX_MESSAGES, extraCurrencySupported: false},
    {name: 'SignData', types: [...TON_CONNECT_SIGN_DATA_TYPES]}
  ];
}

export function buildConnectEvent(options: {
  eventId: string | number,
  account: TonConnectAccount,
  proof?: TonConnectProof,
  appVersion: string
}) {
  const items: object[] = [{
    name: 'ton_addr',
    address: options.account.address,
    network: options.account.network,
    walletStateInit: options.account.walletStateInit,
    publicKey: options.account.publicKey
  }];

  const proof = options.proof;
  if(proof) {
    items.push({
      name: 'ton_proof',
      proof: {
        timestamp: proof.timestamp,
        domain: {lengthBytes: new TextEncoder().encode(proof.domain).length, value: proof.domain},
        payload: proof.payload,
        signature: proof.signature
      }
    });
  }

  return eventJson('connect', options.eventId, JSON.stringify({
    items,
    device: {
      platform: 'browser',
      appName: 'Telegram',
      appVersion: options.appVersion,
      maxProtocolVersion: TON_CONNECT_PROTOCOL_VERSION,
      features: tonConnectFeatures()
    }
  }));
}

export function buildConnectErrorEvent(eventId: string | number, code: TonConnectErrorCode, message = tonConnectErrorMessage(code)) {
  return eventJson('connect_error', eventId, JSON.stringify({code, message}));
}

export function buildDisconnectEvent(eventId: string | number) {
  return eventJson('disconnect', eventId, '{}');
}

export function buildSuccessResponse(id: string, result: unknown) {
  return JSON.stringify({result, id});
}

export function buildErrorResponse(id: string, code: TonConnectErrorCode, message = tonConnectErrorMessage(code)) {
  return JSON.stringify({error: {code, message}, id});
}

/** the answer to a signed `signData`: the payload goes back as the dApp sent it, with what the signature binds */
export function buildSignDataResult(options: {
  signature: string,
  /** raw */
  address: string,
  timestamp: number,
  domain: string,
  json: TonConnectSignDataJson
}) {
  const payload: TonConnectSignDataJson = {type: options.json.type};
  if(options.json.type === 'text') payload.text = options.json.text;
  else payload.bytes = options.json.bytes;
  if(options.json.network !== undefined) payload.network = options.json.network;
  if(options.json.from !== undefined) payload.from = options.json.from;
  return {
    signature: options.signature,
    address: options.address,
    timestamp: options.timestamp,
    domain: options.domain,
    payload
  };
}

/** the raw form of an address, `workchain:hex` */
export function toRawTonAddress(address: string) {
  const parts = parseTonAddress(address);
  if(!parts) return;
  let hex = '';
  parts.hash.forEach((byte) => hex += byte.toString(16).padStart(2, '0'));
  return parts.workchain + ':' + hex;
}

/** the sum of what the messages send, nanograms */
export function sumTonConnectAmounts(messages: Pick<TonConnectMessage, 'amount'>[]) {
  return messages.reduce((total, message) => total.add(bigInt(message.amount)), bigInt.zero).toString();
}
