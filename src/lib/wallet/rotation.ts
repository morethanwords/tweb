/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {SendSnapshot} from '@ton/wallet-engine';
import type {WalletToncenterRequest} from '@appManagers/appWalletManager';
import type {WalletCustodyRecord} from '@lib/wallet/vault';
import bigInt from 'big-integer';
import base64ToBytes from '@helpers/string/base64ToBytes';
import bytesToBase64 from '@helpers/bytes/bytesToBase64';
import {crc32c} from '@helpers/number/crc32';

/**
 * "Update Secret Phrase": the wallet's signing key is rotated on chain (Wallet rev00 key rotation), the address and
 * the balance stay. The pieces here hold no state: the disarmed copy a fee is quoted with, the emulation that
 * prices it, and how the engine's journal and the server's served key settle an update this device sent.
 */

// MARK: Disarming

const BOC_MAGIC = 0xb5ee9c72;
const SIGNATURE_BYTES = 64;
/** the signature, then the opcode, the wallet id, the expiration and the seqno, then the new public key */
const REQUEST_BYTES = SIGNATURE_BYTES + 4 + 4 + 4 + 4 + 32;
/**
 * the new key's ownership proof and, since engine 0.0.7, the replaced key encrypted with the new one (so comments to
 * the old key stay readable); an engine before it signed the proof alone
 */
const REQUEST_REFS = [1, 2];
const EXTERNAL_OPCODE = 0xfbba99c8;
const INTERNAL_OPCODE = 0xfbba99c7;
const MAX_CELLS = 64;
const MAX_BYTES = 64 * 1024;

type BocCell = {
  dataFrom: number,
  dataSize: number,
  refs: number,
  wholeBytes: boolean
};

function readNumber(data: Uint8Array, cursor: {offset: number}, size: number) {
  if(size < 1 || size > 8 || data.length - cursor.offset < size) {
    return;
  }

  let result = 0;
  for(let i = 0; i < size; ++i) {
    result = result * 256 + data[cursor.offset + i];
  }

  cursor.offset += size;
  return result;
}

function readOpcode(data: Uint8Array, offset: number) {
  return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
}

/**
 * Every cell is two descriptor bytes, its data, then one index per reference. An exotic cell, one with a level
 * or stored hashes is refused: a rotation message has none.
 */
function parseCells(data: Uint8Array, from: number, till: number, count: number, refSize: number) {
  const cells: BocCell[] = [];
  let offset = from;
  for(let i = 0; i < count; ++i) {
    if(till - offset < 2) {
      return;
    }

    const first = data[offset];
    const second = data[offset + 1];
    offset += 2;
    const refs = first & 0x07;
    const dataSize = (second >> 1) + (second & 0x01);
    if((first & 0xf8) || refs > 4 || till - offset < dataSize) {
      return;
    }

    cells.push({dataFrom: offset, dataSize, refs, wholeBytes: !(second & 0x01)});
    offset += dataSize;
    if(till - offset < refs * refSize) {
      return;
    }

    offset += refs * refSize;
  }

  return offset === till ? cells : undefined;
}

function parseBoc(bocBase64: string) {
  let data: Uint8Array;
  try {
    data = base64ToBytes(bocBase64);
  } catch(err) {
    return;
  }

  if(!data.length || data.length > MAX_BYTES) {
    return;
  }

  const cursor = {offset: 0};
  const magic = readNumber(data, cursor, 4);
  const flags = readNumber(data, cursor, 1);
  if(magic !== BOC_MAGIC || flags === undefined) {
    return;
  }

  const hasIndex = !!(flags & 0x80);
  const hasCrc = !!(flags & 0x40);
  const hasCacheBits = !!(flags & 0x20);
  const refSize = flags & 0x07;
  if(hasCacheBits || refSize < 1 || refSize > 4) {
    return;
  }

  const offsetSize = readNumber(data, cursor, 1);
  if(offsetSize === undefined || offsetSize < 1 || offsetSize > 8) {
    return;
  }

  const count = readNumber(data, cursor, refSize);
  const roots = readNumber(data, cursor, refSize);
  const absent = readNumber(data, cursor, refSize);
  const size = readNumber(data, cursor, offsetSize);
  if(
    count === undefined ||
    size === undefined ||
    absent !== 0 ||
    roots !== 1 ||
    count < 1 ||
    count > MAX_CELLS ||
    size > MAX_BYTES ||
    readNumber(data, cursor, refSize) === undefined // the root
  ) {
    return;
  }

  const listed = hasIndex ? count * offsetSize : 0;
  if(data.length - cursor.offset < listed) {
    return;
  }

  cursor.offset += listed;
  if(data.length - cursor.offset !== size + (hasCrc ? 4 : 0)) {
    return;
  }

  const cells = parseCells(data, cursor.offset, cursor.offset + size, count, refSize);
  return cells && {data, cells, hasCrc};
}

/**
 * The one cell shaped like a signed rotation request; a message with any other number of them is not the
 * message this was asked to disarm.
 */
function findRequest(data: Uint8Array, cells: BocCell[]) {
  let found = -1;
  for(let i = 0; i < cells.length; ++i) {
    const cell = cells[i];
    if(!cell.wholeBytes || !REQUEST_REFS.includes(cell.refs) || cell.dataSize !== REQUEST_BYTES) {
      continue;
    }

    const opcode = readOpcode(data, cell.dataFrom + SIGNATURE_BYTES);
    if(opcode !== EXTERNAL_OPCODE && opcode !== INTERNAL_OPCODE) {
      continue;
    }

    if(found >= 0) {
      return -1;
    }

    found = i;
  }

  return found;
}

/**
 * The signed rotation with its request signature replaced by random bytes, every other bit kept. The emulator
 * is asked to skip signature checks, so the fee it reports is the fee of the real rotation, while what leaves the
 * device is a message the contract can never execute: a fee quote must never be a rotation anybody could
 * broadcast — it would hand the wallet to a phrase nobody wrote down.
 *
 * Standard padded base64 in and out. Nothing comes back when the message is not the single signed rotation
 * request this expects, and then nothing may be sent at all.
 */
export function breakRotationSignature(bocBase64: string) {
  const parsed = parseBoc(bocBase64);
  if(!parsed) {
    return;
  }

  const {data, cells, hasCrc} = parsed;
  const index = findRequest(data, cells);
  if(index < 0) {
    return;
  }

  data.set(crypto.getRandomValues(new Uint8Array(SIGNATURE_BYTES)), cells[index].dataFrom);
  if(hasCrc) {
    const till = data.length - 4;
    const crc = crc32c(data.subarray(0, till));
    for(let i = 0; i < 4; ++i) {
      data[till + i] = (crc >>> (8 * i)) & 0xff;
    }
  }

  return bytesToBase64(data);
}

// MARK: Fee

export const EMULATE_TRACE_ENDPOINT = '/api/emulate/v1/emulateTrace';

/**
 * The body the engine's own emulation sends: the BOC as the engine serializes it, signature checks off, no
 * code, data, address book or metadata, actions on, the latest masterchain block.
 */
export function emulateTraceRequest(bocBase64: string): WalletToncenterRequest {
  return {
    post: true,
    endpoint: EMULATE_TRACE_ENDPOINT,
    payload: JSON.stringify({
      boc: bocBase64,
      ignore_chksig: true,
      include_code_data: false,
      include_address_book: false,
      include_metadata: false,
      with_actions: true,
      mc_block_seqno: null
    })
  };
}

function isObject(value: any): value is Record<string, any> {
  return !!value && typeof(value) === 'object' && !Array.isArray(value);
}

function phaseSucceeded(description: Record<string, any>, phaseKey: string, codeKey: string, allowed: number[]) {
  const phase = description[phaseKey];
  return isObject(phase) &&
    phase.success === true &&
    typeof(phase[codeKey]) === 'number' &&
    allowed.includes(phase[codeKey]);
}

/**
 * The root transaction's own fee: `trace.tx_hash` names the root, `transactions[hash]` is it, `total_fees` the fee.
 * The root must not be aborted, its compute phase must end with exit code 0 or 1 and its action phase with 0.
 * Anything else is a failed emulation. The account comes back as written, for the caller's identity check.
 */
export function parseEmulatedTrace(json: string): {fee: string, account: string} | undefined {
  let object: any;
  try {
    object = JSON.parse(json);
  } catch(err) {
    return;
  }

  const hash = isObject(object) && isObject(object.trace) ? object.trace.tx_hash : undefined;
  if(typeof(hash) !== 'string' || !hash || !isObject(object.transactions)) {
    return;
  }

  const root = object.transactions[hash];
  if(!isObject(root)) {
    return;
  }

  const {account, total_fees: fees, description} = root;
  if(typeof(account) !== 'string' || !account || typeof(fees) !== 'string' || !/^\d{1,30}$/.test(fees)) {
    return;
  }

  if(
    !isObject(description) ||
    description.aborted !== false ||
    !phaseSucceeded(description, 'compute_ph', 'exit_code', [0, 1]) ||
    !phaseSucceeded(description, 'action', 'result_code', [0])
  ) {
    return;
  }

  return {fee: bigInt(fees).toString(), account};
}

export type WalletRotationQuote = {
  /** nanograms */
  fee: string,
  /** the balance does not cover the fee: the update waits for a top-up */
  insufficient: boolean
};

export function isRotationFeeCovered(fee: string, balance: string | number) {
  return balance !== undefined && balance !== '' && bigInt(String(balance)).compare(bigInt(fee)) >= 0;
}

export function makeRotationQuote(fee: string, balance: string | number): WalletRotationQuote {
  return {fee, insufficient: !isRotationFeeCovered(fee, balance)};
}

// MARK: Settling

export type WalletRotationVerdict =
  | 'confirmed'
  | 'wait'
  | 'ROTATION_REPLACED'
  | 'ROTATION_EXPIRED'
  | 'ROTATION_FAILED';

/**
 * What the engine's journal says of the update sent as `operationId`. A journal that names another operation (or
 * none) settles it only when it is authoritative: nobody submits it any more (see `isRotationJournalAuthoritative`) —
 * the journal is written before the message leaves, so then the broadcast never happened. While a submission may
 * still be on its way, the answer of that submission speaks for it instead.
 */
export function rotationSnapshotVerdict(
  operationId: string,
  snapshot: Pick<SendSnapshot, 'operationId' | 'phase'>,
  journalAuthoritative: boolean
): WalletRotationVerdict {
  if(snapshot.operationId !== operationId) {
    return journalAuthoritative ? 'ROTATION_FAILED' : 'wait';
  }

  switch(snapshot.phase) {
    case 'confirmed':
      return 'confirmed';
    case 'replaced':
      return 'ROTATION_REPLACED';
    case 'expired':
      return 'ROTATION_EXPIRED';
    case 'failed':
    case 'cancelled':
    case 'superseded':
    case 'sequenceNumberConsumed':
      return 'ROTATION_FAILED';
    default:
      return 'wait';
  }
}

/**
 * Whether a journal that does not name a pending update proves it never left. Another tab writes the pending update
 * before its engine journals the message, so in between the journal names nothing while the broadcast is still to
 * come; only once the message's window and the resolution margin have passed (unix seconds, server time) can no copy
 * of it land any more.
 */
export function isRotationJournalAuthoritative(validUntil: number, now: number, marginSeconds: number) {
  return now >= validUntil + marginSeconds;
}

function errorText(error: any) {
  return String(typeof(error) === 'string' ? error : error?.type || error?.message || '');
}

/**
 * The engine gave up waiting for the provider's answer: the update may be on its way, only the chain can tell
 */
export function isRotationSubmissionUnknown(error: any) {
  return /submission outcome is unknown/i.test(errorText(error));
}

/**
 * A failed update step as one `ROTATION_*` reason; the engine's own refusals come as their error text
 */
export function rotationErrorType(error: any) {
  const text = errorText(error);
  if(text.startsWith('ROTATION_')) return text;
  if(/previous submission outcome is unresolved|already in progress|does not match current wallet seqno/i.test(text)) return 'ROTATION_ALREADY_SENDING';
  if(/insufficient/i.test(text)) return 'ROTATION_FEES';
  if(/^send failed/i.test(text)) return 'ROTATION_REFUSED';
  if(/key rotation is unavailable|key-rotation|protected mnemonic|rotated recovery phrase/i.test(text)) return 'ROTATION_PREPARE_FAILED';
  return 'ROTATION_FAILED';
}

/**
 * Whether the record signs for the wallet whose key the server serves: its own signing key, or — right after
 * this device's update was confirmed on chain — the key it replaced, until the server catches up.
 */
export function isRecordSigningFor(record: WalletCustodyRecord, servedKey: string) {
  return record.signingKey === servedKey || (!!record.awaitingServerKey && record.awaitingServerKey === servedKey);
}

/**
 * The record once the server's key is seen: the wait for the server ends when it serves the new key, or when it
 * serves a third one — the key moved on elsewhere. Nothing comes back when nothing changes.
 */
export function settleAwaitingServerKey(record: WalletCustodyRecord, servedKey: string): WalletCustodyRecord | undefined {
  if(!record.awaitingServerKey || (record.awaitingServerKey === servedKey && record.signingKey !== servedKey)) {
    return;
  }

  return {...record, awaitingServerKey: undefined};
}

/**
 * The record after the chain confirmed its pending update: the new phrase becomes its secret and the new key its
 * signing key, in one write with the pending's removal. The key it replaced is still answered for while the
 * server serves it.
 */
export function promoteRotationRecord(record: WalletCustodyRecord, servedKey: string): WalletCustodyRecord {
  const pending = record.pendingRotation;
  if(!pending) {
    return record;
  }

  return {
    ...record,
    recordId: pending.recordId,
    secretRef: pending.secretRef,
    signingKey: pending.newSigningKey,
    awaitingServerKey: servedKey !== pending.newSigningKey ? record.signingKey : undefined,
    rotatedSinceBackup: true,
    pendingRotation: undefined,
    date: Date.now()
  };
}

// MARK: Write-down

/** how long the words to write down stay up before Continue takes them as written (iOS: 10 s) */
export const BACKUP_WRITE_DOWN_DELAY = 10e3;

/**
 * Whether Continue came too soon after the words appeared (both in ms) to have written them down: then it is
 * "Sure done?" and the words stay
 */
export function isBackupWriteDownTooQuick(shownAt: number, now: number) {
  return now - shownAt < BACKUP_WRITE_DOWN_DELAY;
}

// MARK: Quiz

const QUIZ_WORDS = 3;
const SHORT_PHRASE = 12;

function secureRandomIndex(max: number) {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] % max;
}

/**
 * The three words the "Test Time" asks back, in order. The new phrase of a key update (`rotation`) carries two
 * independent keys — words 1-12 the anchor, 13-24 the signing key — so one word comes from the first half and two
 * from the second: both halves have to be written down, not three words of whichever half. Any other phrase gets
 * three words of all of it (iOS).
 */
export function backupQuizIndexes(count: number, rotation: boolean, randomIndex: (max: number) => number = secureRandomIndex) {
  const result: number[] = [];
  if(rotation && count > SHORT_PHRASE) {
    const signing = count - SHORT_PHRASE;
    const first = randomIndex(signing);
    const second = randomIndex(signing - 1);
    result.push(
      randomIndex(SHORT_PHRASE),
      SHORT_PHRASE + first,
      SHORT_PHRASE + second + (second >= first ? 1 : 0)
    );
  } else {
    while(result.length < Math.min(QUIZ_WORDS, count)) {
      const index = randomIndex(count);
      if(!result.includes(index)) {
        result.push(index);
      }
    }
  }

  return result.sort((a, b) => a - b);
}
