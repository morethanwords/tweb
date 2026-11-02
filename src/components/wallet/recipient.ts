/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import rootScope from '@lib/rootScope';
import {parseNanotonFromDecimal} from '@helpers/paymentsWrapCurrencyAmount';
import {walletError} from '@lib/wallet/walletSession';
import type {WalletStore} from '@components/wallet/store';
import {COMMENT_MAX_BYTES, truncateToBytes, type WalletRecipient} from '@components/wallet/send';

/**
 * What the recipient field can hold: a `ton://transfer` link, a wallet address, a `.ton` or `.t.me` name (TON DNS,
 * as iOS resolves them), or else a search for a Telegram user.
 */
export type WalletRecipientInput =
  | {kind: 'link', value: string}
  | {kind: 'address', value: string}
  | {kind: 'domain', value: string}
  | {kind: 'search', value: string};

// * `_` as Android and iOS take it: a `.t.me` name is a Telegram username
const DOMAIN_RE = /^(?:[a-z0-9_-]+\.)+(?:ton|t\.me)$/i;
const MAX_DOMAIN_LENGTH = 126;
// * raw `0:hex` or 48 chars of (url-safe) base64
const ADDRESS_RE = /^(?:-?\d+:[0-9a-f]{64}|[A-Za-z0-9_\-+/]{48})$/i;

export function classifyRecipientInput(text: string): WalletRecipientInput {
  const value = text.trim();
  if(/^ton:\/\//i.test(value)) return {kind: 'link', value};
  if(ADDRESS_RE.test(value)) return {kind: 'address', value};
  if(value.length <= MAX_DOMAIN_LENGTH && DOMAIN_RE.test(value)) return {kind: 'domain', value: value.toLowerCase()};
  return {kind: 'search', value};
}

/**
 * A Telegram user receives on the wallet the server knows for them, always non-bounceable
 */
export async function resolveUserRecipient(store: WalletStore, userId: UserId): Promise<WalletRecipient> {
  const managers = store.managers;
  if(!(await managers.appUsersManager.isRegularUser(userId)) || userId === rootScope.myId.toUserId()) {
    throw walletError('WALLET_USER_UNAVAILABLE');
  }

  // * a send asks the server afresh, never a cached answer: a user who replaced their wallet gets it at the new one
  // * (tdesktop forceResolve)
  const result = await managers.appWalletManager.getUserAddress(userId, true);
  return {
    address: await store.session.friendlyAddress(result.address, false),
    bounce: false,
    userId,
    publicKey: result.public_key
  };
}

/**
 * A pasted address: testnet ones are refused, and if it is a Telegram user's wallet it is sent like one
 */
export async function resolveAddressRecipient(store: WalletStore, address: string, domain?: string): Promise<WalletRecipient> {
  const engine = await store.session.getEngine();
  let info;
  try {
    info = await engine.parseTonAddress(address);
  } catch(err) {
    throw walletError('WALLET_ADDRESS_INVALID');
  }

  if(info.format.kind === 'userFriendly' && info.format.testnet) {
    throw walletError('WALLET_ADDRESS_INVALID');
  }

  // * a raw address says nothing of the contract: send it bounceable, like an unknown contract
  let bounce = info.format.kind === 'userFriendly' ? info.format.bounceable : true;
  let userId: UserId, publicKey: Uint8Array;
  try {
    const owner = await store.managers.appWalletManager.getAddressOwner(info.raw);
    // * one's own address is a plain transfer: it keeps the confirmation screen
    if(owner?.user_id && owner.user_id.toUserId() !== rootScope.myId.toUserId()) {
      userId = owner.user_id.toUserId();
      publicKey = owner.public_key;
      bounce = false;
    }
  } catch(err) {}

  return {
    address: await engine.convertTonAddress(info.raw, {kind: 'userFriendly', bounceable: bounce, testnet: false}),
    bounce,
    userId,
    publicKey,
    domain
  };
}

export async function resolveDomainRecipient(store: WalletStore, name: string): Promise<WalletRecipient> {
  const client = await store.session.getClient(store.status());
  const address = await client.resolveDns(name);
  if(!address) {
    throw walletError('WALLET_NAME_NOT_FOUND');
  }

  return resolveAddressRecipient(store, address, name);
}

export type WalletTransferLink = {
  recipient: WalletRecipient,
  nanograms?: string,
  comment?: string,
  /** a link's comment goes as it is written: an exchange reads its deposit memo, an encrypted one it cannot (iOS,
   * Android) — unless the link asks for it to be private */
  publicComment?: boolean,
  /** the link's own message body (BOC, base64): a comment written instead replaces it (iOS) */
  payload?: string,
  /** the link's deadline, unix seconds: the transfer holds to it on the chain as well */
  expiresAt?: number
};

/**
 * What a typed or pasted link, address or name stands for — a search for people is not resolved here
 */
export async function resolveRecipientInput(store: WalletStore, input: WalletRecipientInput): Promise<WalletTransferLink> {
  switch(input.kind) {
    case 'link': return resolveTransferLink(store, input.value);
    case 'domain': return {recipient: await resolveDomainRecipient(store, input.value)};
    case 'address': return {recipient: await resolveAddressRecipient(store, input.value)};
    default: throw walletError('WALLET_ADDRESS_INVALID');
  }
}

/**
 * `ton://transfer/<address>?amount=&text=|bin=&exp=`: Gram transfers only, with a comment or a body of their own
 */
export async function resolveTransferLink(store: WalletStore, link: string): Promise<WalletTransferLink> {
  const engine = await store.session.getEngine();
  let parsed;
  try {
    parsed = await engine.parseTonTransferLink(link);
  } catch(err) {
    throw walletError('WALLET_ADDRESS_INVALID');
  }

  if(parsed.asset.kind !== 'gram') {
    throw walletError('WALLET_LINK_UNSUPPORTED');
  }

  // * a deadline past any transfer's validity changes nothing: the send keeps to the shorter one
  const expiresAt = parsed.expiration.kind === 'exact' && parsed.expiration.unixTimestamp <= BigInt(Number.MAX_SAFE_INTEGER) ?
    Number(parsed.expiration.unixTimestamp) :
    undefined;
  if(expiresAt !== undefined && expiresAt * 1000 < Date.now()) {
    throw walletError('WALLET_LINK_EXPIRED');
  }

  return {
    recipient: await resolveAddressRecipient(store, parsed.recipient),
    nanograms: parsed.amount,
    ...linkComment(parsed.payload.kind === 'text' ? parsed.payload.text : undefined),
    payload: parsed.payload.kind === 'boc' ? parsed.payload.boc : undefined,
    expiresAt
  };
}

/**
 * Who the user sent to or got from lately, then the people they talk to most
 */
export async function getRecentRecipients(store: WalletStore): Promise<PeerId[]> {
  const managers = store.managers;
  const out: PeerId[] = [];
  const add = (peerId: PeerId) => {
    if(peerId && !out.includes(peerId) && peerId !== rootScope.myId) out.push(peerId);
  };

  const transactions = store.history.transactions();
  transactions.filter((transaction) => !transaction.pFlags.incoming).forEach((transaction) => {
    if(transaction.peer._ === 'walletTransactionPeerUser') add(transaction.peer.user_id.toPeerId(false));
  });
  transactions.forEach((transaction) => {
    if(transaction.peer._ === 'walletTransactionPeerUser') add(transaction.peer.user_id.toPeerId(false));
  });

  try {
    const topPeers = await managers.appUsersManager.getTopPeers('correspondents');
    topPeers.forEach((topPeer) => topPeer.id.isUser() && add(topPeer.id));
  } catch(err) {}

  const regular = await Promise.all(out.map((peerId) => managers.appUsersManager.isRegularUser(peerId.toUserId())));
  return out.filter((_, index) => regular[index]).slice(0, 30);
}


export type WalletSendRequest = {
  /** a Telegram user, straight from a chat */
  userId?: UserId,
  /** `@username`, a username, an address or a .ton name */
  to?: string,
  /** Grams as a decimal (`2.5`), the way t.me/sendgrams writes it */
  amount?: string,
  comment?: string,
  /** the link asks for its comment to go encrypted */
  encrypted?: boolean,
  /** a whole `ton://transfer` link: its amount is in nanograms, the engine reads it */
  tonLink?: string
};

/** Grams as a send link writes them: whole ones with at most 9 decimals, more than none (iOS, Android) */
const LINK_AMOUNT_REGEXP = /^\d+(\.\d{1,9})?$/;

/** A link's comment, cut to what a transfer carries (Android) */
function linkComment(comment: string, encrypted?: boolean): Pick<WalletTransferLink, 'comment' | 'publicComment'> {
  return comment ? {comment: truncateToBytes(comment, COMMENT_MAX_BYTES), publicComment: !encrypted} : {};
}

/**
 * Turns a send link into what the amount screen starts from
 */
export async function resolveSendRequest(store: WalletStore, request: WalletSendRequest): Promise<WalletTransferLink> {
  if(request.tonLink) {
    return resolveTransferLink(store, request.tonLink);
  }

  if(request.userId) {
    return {recipient: await resolveUserRecipient(store, request.userId)};
  }

  const to = request.to?.trim();
  if(!to) {
    throw walletError('WALLET_ADDRESS_INVALID');
  }

  let nanograms: string;
  if(request.amount !== undefined) {
    nanograms = LINK_AMOUNT_REGEXP.test(request.amount) ? parseNanotonFromDecimal(request.amount).toString() : '0';
    if(!(+nanograms > 0)) {
      throw walletError('WALLET_LINK_INVALID');
    }
  }

  const input = classifyRecipientInput(to);
  let recipient: WalletRecipient;
  if(input.kind === 'link') {
    return resolveTransferLink(store, input.value);
  } else if(input.kind !== 'search') {
    recipient = (await resolveRecipientInput(store, input)).recipient;
  } else {
    const user = await store.managers.appUsersManager.resolveUserByUsername(to.replace(/^@/, ''));
    if(!user) {
      throw walletError('WALLET_USER_UNAVAILABLE');
    }

    recipient = await resolveUserRecipient(store, user.id.toUserId());
  }

  return {
    recipient,
    nanograms,
    ...linkComment(request.comment, request.encrypted)
  };
}

