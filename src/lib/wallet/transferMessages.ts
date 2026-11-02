/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {SendResult, SendSnapshot} from '@ton/wallet-engine';
import type {MessageAction} from '@layer';
import bigInt from 'big-integer';
import bytesToHex from '@helpers/bytes/bytesToHex';
import {parseTonAddress} from '@lib/wallet/tonAddress';

/**
 * A Gram transfer to a Telegram user shows up in that user's chat the moment it goes to the server: a local
 * "sending" service message, which the message the server makes for the transfer then replaces. The pairing is
 * the usual one — the random id `wallet.sendTransfer` was given comes back in `updateMessageID` — but when that
 * answer is lost (a timeout, a 5xx) the served message still arrives, through the difference, and is matched to
 * its draft by what it says instead (tdesktop: wallet/wallet_transfer_messages.cpp).
 *
 * Everything here is pure: the registry keeps no messages, the messages manager asks it what to do.
 */

/** the server adds this suggestion with the first incoming transfer and pushes nothing about it */
export const WALLET_FIRST_GRAMS_SUGGESTION = 'WALLET_FIRST_INCOMING_TRANSFER';

/**
 * How long a transfer whose submission is unknown may still turn up: the engine's validity window plus the margin
 * the wallet gives the chain to resolve it. A draft still sending after that leaves the chat — it is never failed on
 * a guess: its served message may still come through the difference.
 */
export const GRAM_TRANSFER_RESOLUTION_TIMEOUT = 360e3;

export type GramTransferDraftContent = {
  /** positive nanograms */
  amount: string,
  /** user-friendly, the way the transfer went */
  address: string,
  /** what the user typed, also when it went out encrypted: the plaintext never leaves this device */
  comment?: string,
  commentEncrypted?: boolean
};

export type GramTransferDraft = GramTransferDraftContent & {
  randomId: string,
  peerId: PeerId,
  /**
   * The newest server message id the chat held when the draft was made. The message the server makes for this
   * transfer is always newer, so the floor can only refuse a message that is not this draft's.
   */
  floor: number
};

/**
 * What `updateMessageID` does with a draft: `pair` it as usual, `keep` it sending (an identical draft took the
 * served message, this one's own is still coming and settles it by content), or `drop` it (its own message is
 * already in the chat, it came by a path that never adopts).
 */
export type GramTransferPairing = 'pair' | 'keep' | 'drop';

/** `workchain:hex` of an address in any form, or '' when the text is no address */
export function canonicalTonAddress(address: string) {
  const parts = parseTonAddress(address);
  return parts ? parts.workchain + ':' + bytesToHex(parts.hash) : '';
}

function isSameAmount(a: string | number, b: string | number) {
  try {
    return bigInt(String(a)).abs().equals(bigInt(String(b)).abs());
  } catch(err) {
    return false;
  }
}

/**
 * Whether a served transfer is the draft's one. A private comment is not compared: the served message carries the
 * encrypted payload, not the text.
 */
export function isSameGramTransfer(
  draft: GramTransferDraftContent,
  action: MessageAction.messageActionGramTransfer,
  servedAddress = canonicalTonAddress(action.peer_address)
) {
  if(
    !servedAddress ||
    !isSameAmount(draft.amount, action.amount) ||
    !!draft.commentEncrypted !== !!action.pFlags?.comment_encrypted ||
    canonicalTonAddress(draft.address) !== servedAddress
  ) {
    return false;
  }

  return !!draft.commentEncrypted || (draft.comment || '') === (action.comment || '');
}

/**
 * Whether `wallet.sendTransfer` was refused for sure: an answer the server sent. A transport's own 4xx
 * (NETWORK_BAD_RESPONSE) says nothing of what the server did, and a 5xx or a timeout may hide a broadcast that went
 * out. Nor does a duplicate (RANDOM_ID_DUPLICATE and the like): it refuses a copy of a request whose first copy
 * reached the server, and that one may have gone out.
 */
export function isDefiniteTransferRefusal(error: ApiError) {
  const type = String(error?.type);
  return error?.code >= 400 && error.code < 500 && !type.startsWith('NETWORK_') && !type.includes('DUPLICATE');
}

/**
 * The reason the engine's final phase gives for a transfer that did not go out, or nothing when it did not fail.
 * A gasless transfer is a pair signed for one seqno: one of them replacing the other is how it succeeds.
 */
export function getGramTransferFailure(phase: SendResult['phase'], paired?: boolean) {
  switch(phase) {
    case 'failed': return 'WALLET_TRANSFER_FAILED';
    case 'cancelled': return 'WALLET_TRANSFER_CANCELLED';
    case 'expired': return 'WALLET_TRANSFER_EXPIRED';
    case 'replaced': return paired ? undefined : 'WALLET_TRANSFER_REPLACED';
  }
}

/**
 * What the engine's journal says of a transfer whose outcome was unknown (`operationId`): `failed` — it never went
 * out; `done` — it ended otherwise (confirmed, or its seqno went to the fee-free twin or to another message), and the
 * history tells the rest; nothing — still open, or the journal names another transfer and says nothing of this one.
 */
export function getUnknownTransferVerdict(
  operationId: string,
  snapshot: Pick<SendSnapshot, 'operationId' | 'phase'> | undefined,
  paired?: boolean
): 'failed' | 'done' | undefined {
  if(!snapshot || snapshot.operationId !== operationId) {
    return;
  }

  if(getGramTransferFailure(snapshot.phase, paired)) {
    return 'failed';
  }

  switch(snapshot.phase) {
    case 'confirmed':
    case 'replaced':
    case 'sequenceNumberConsumed':
    case 'superseded':
      return 'done';
  }
}

export default class GramTransferDrafts {
  /** oldest first: of several drafts that match a served message by content, the oldest takes it */
  private drafts: GramTransferDraft[] = [];
  /**
   * `peerId_mid` of the served messages settled from these drafts. They tell a draft's own message from a twin's,
   * so they matter exactly while a draft is still sending.
   */
  private settled: Set<string> = new Set();

  public get size() {
    return this.drafts.length;
  }

  public add(draft: GramTransferDraft) {
    // * cleared here and not when the last draft goes: settling forgets a draft before it records the served id
    if(!this.drafts.length) {
      this.settled.clear();
    }

    this.drafts.push(draft);
  }

  public get(randomId: Long) {
    return this.drafts.find((draft) => draft.randomId === String(randomId));
  }

  public forget(randomId: Long) {
    const index = this.drafts.findIndex((draft) => draft.randomId === String(randomId));
    if(index !== -1) {
      return this.drafts.splice(index, 1)[0];
    }
  }

  /** the served message `mid` replaced the draft */
  public settle(randomId: Long, mid: number) {
    const draft = this.forget(randomId);
    if(draft) {
      this.settled.add(draft.peerId + '_' + mid);
    }

    return draft;
  }

  public clear() {
    this.drafts = [];
    this.settled.clear();
  }

  /**
   * `updateMessageID` promises the draft the served id `mid`. Nothing at that id yet is the usual case. A message
   * these drafts settled there means an identical draft took this one's message by content. Anything else there is
   * this draft's own message, which came by a path that never adopts.
   */
  public getPairing(randomId: Long, mid: number, occupied: boolean): GramTransferPairing {
    const draft = this.get(randomId);
    if(!draft || !occupied) {
      return 'pair';
    }

    return this.settled.has(draft.peerId + '_' + mid) ? 'keep' : 'drop';
  }

  /**
   * The draft a served transfer belongs to when no `updateMessageID` claimed it: the oldest one still sending in
   * the same chat with the same transfer, made when the chat held only older messages. Drafts no longer sending
   * (deleted meanwhile) are pruned on the way. The draft stays registered until the caller settles it.
   */
  public adopt(options: {
    peerId: PeerId,
    mid: number,
    out: boolean,
    action: MessageAction,
    /** the chat held this message already: then it is no draft's */
    held: boolean,
    isSending: (draft: GramTransferDraft) => boolean
  }): GramTransferDraft {
    const {action} = options;
    if(!this.drafts.length || action._ !== 'messageActionGramTransfer' || !options.out) {
      return;
    }

    this.drafts = this.drafts.filter(options.isSending);
    // * an address that parses to nothing would match a draft whose own address failed to parse too
    const servedAddress = canonicalTonAddress(action.peer_address);
    if(options.held || !servedAddress) {
      return;
    }

    // * `mid > floor`, not `>=`: an id the chat already held is that same message served again
    return this.drafts.find((draft) => {
      return draft.peerId === options.peerId &&
        options.mid > draft.floor &&
        isSameGramTransfer(draft, action, servedAddress);
    });
  }
}
