/*
 * "Update Secret Phrase" (wallet key rotation): the disarmed copy a fee is quoted with, the emulation that prices
 * it, the fee and top-up decision, how the engine's journal and the served key settle a sent update, the quiz
 * that checks the new phrase was written down, and how long the words stay up before that.
 *
 * The rotation messages are ones the wallet engine really produced (tdesktop's gram_boc_tests fixtures): an
 * external rotation, the same for a wallet not deployed yet (it carries a state init), and the internal one a
 * relayer delivers. The offset is where the request signature starts in the decoded bytes. Engine 0.0.7 adds the
 * replaced key, encrypted with the new one, as a second reference of the request: its four forms (external and
 * internal, deployed and not) are below too, taken from a throwaway wallet.
 */

import {describe, expect, it} from 'vitest';
import base64ToBytes from '@helpers/string/base64ToBytes';
import bytesToBase64 from '@helpers/bytes/bytesToBase64';
import crc32, {crc32c} from '@helpers/number/crc32';
import type {WalletCustodyRecord} from '@lib/wallet/vault';
import {
  backupQuizIndexes,
  BACKUP_WRITE_DOWN_DELAY,
  breakRotationSignature,
  EMULATE_TRACE_ENDPOINT,
  emulateTraceRequest,
  isBackupWriteDownTooQuick,
  isRecordSigningFor,
  isRotationFeeCovered,
  isRotationJournalAuthoritative,
  isRotationSubmissionUnknown,
  makeRotationQuote,
  parseEmulatedTrace,
  promoteRotationRecord,
  rotationErrorType,
  rotationSnapshotVerdict,
  settleAwaitingServerKey
} from '@lib/wallet/rotation';

const EXTERNAL = 'te6ccgEBAwEA2wABRYgAZ4xQk4U3opHAuJR05zBkP9ox03AUWUCLZzGptmq5eCIMAQHgb3k9gvcbRTBHo0i1Tf6H7+uEc/sWCnBvso+EvWulcg3Sln/+t8K1TbV3ZY0GMfu9SzGLZbD2mX2i7watvgPTB/u6mch//3/9cQAAAAECAwTCrGFc4SyQlfUmZksQauBUlmtXR6JkHwvHYR18E+fdLQIAgMaXjUHo2b8/kzmLv2VlyZq9CkIyoIsmPjPooy9ulySPlJzma5y5fVXX2hgk+42rJJWOyIv9orOu0TaS7uFk8Ac=';
const EXTERNAL_SIGNATURE_AT = 51;
const STATE_INIT = 'te6ccgECBQEAASMAA0eIAGeMUJOFN6KRwLiUdOcwZD/aMdNwFFlAi2cxqbZquXgiEbABAgMAMP8AIJgh10mDCLnyQN+Ahfgz0O0eIO1T2QBSAAAAAAB//3/9sVgYwu51mjANtmKYj5sLSE5BNQcQddZ7R4cEAwsqFRQB4IJOhqLIPT6ZAVSqau5TiNrwViO18a5BfcbDaD7kwgRBs9qp20QMmdor2Eq49U+WG51zil92UuLZeqEeur18hwj7upnIf/9//XEAAAAAAAAADZsMkWTuztpaoK5jxR0a4idQWpWkORvJ/mlZTNwu4yoEAIBibQcxgA3vUtUu9Z0gckIggtUepLQeyuRyq8CwTKsH+YviQW5yhCnSUky2x7ssTWQ8FztE7UtBqc6G6SSvQJMH';
const STATE_INIT_SIGNATURE_AT = 124;
const INTERNAL = 'te6ccgEBAwEA6AABYEIAGeMUJOFN6KRwLiUdOcwZD/aMdNwFFlAi2cxqbZquXgiAAAAAAAAAAAAAAAAAAQEB4GjrM3YMvhbU9Hg0G1vQpJVrg5iC886zd6ZNwSAmZRCh2fClR/+rNimR/GY/gmH80A5VJ+8DDRO9q+CrtyIitA77upnHf/9//XEAAAABAgMEk6mZyJrraLyLwzObhObSS7c/VCofehNrPY77xbJQoDUCAIBWCljSrxoHWqV8hxqGgA1c/Ns5vGKNvWAKMFPRbs91WEA37cX7cP9JJc8cEsjbVg5Ue4we4AJjn4VCaU01HWQE';
const INTERNAL_SIGNATURE_AT = 64;
const ENGINE_EXTERNAL_UNDEPLOYED = 'te6ccgECBgEAAUYAA0eIAMMp/ynw+mHLiUODkjQjNN/tYYBxYr/mYj8g35GYMxdMEbABAgMAMP8AIJgh10mDCLnyQN+Ahfgz0O0eIO1T2QBSAAAAAAB//38ROkdcC+7ziB8fVfHz5Z6pMCT1qGCk8RhyPDwQ1hFfz6EC4ARSvbk9iPYke0aQ58rfVakfS+8oh+efEk19bA0OCKWezSRLcjksBk7qXS0nKCr0r9XGRS/0cA4yuPbEd/hidAX7upnIf/9/EWrTYHkAAAAA/jKWVJ6UZHyfievKkPqzDf+2yAwJxzwfFIGiW4bn8WMEBQCAPfhKpJKXP0EfwXKRWSFVsHtT/u8rLaUAY1g1QOkd6uQm93k3Uo3ysbatCMi3GMcGcrcFYdRsypJB1N0FDyBoCgBAZAgFFl20+sikIksyivQeQc1io+4OvgiLygx26MyWX3I=';
const ENGINE_EXTERNAL_UNDEPLOYED_SIGNATURE_AT = 124;
const ENGINE_INTERNAL_UNDEPLOYED = 'te6ccgECBgEAAVMAA2FCADDKf8p8Pphy4lDg5I0IzTf7WGAcWK/5mI/IN+RmDMXTAAAAAAAAAAAAAAAAAAI2AQIDADD/ACCYIddJgwi58kDfgIX4M9DtHiDtU9kAUgAAAAAAf/9/ETpHXAvu84gfH1Xx8+WeqTAk9ahgpPEYcjw8ENYRX8+hAuBYnudR73M+cT+8pEqO5WVrNk0XXhDp3VJx39VgWHZjqaBIIJfQ/Dri9Tk8zVqru8uz9g8NW/caPEorQyx5he0I+7qZx3//fxFq02B5AAAAAM5X/WvjffBZ+0EyOvVWy7oEUPDKm9YRifJTUBBENmcABAUAgG6gL4RSyDnaKEnKp/xnF56AE3klSKprmXH39D0L4FUIkCXRc5xklQBCdDZrTLGKDA+xLa/fAit34NwRBBLxrw0AQPVwnLw2aFoaziBMicyyhpvmrHJFzS61+niu6/Bz1wEg';
const ENGINE_INTERNAL_UNDEPLOYED_SIGNATURE_AT = 137;
const ENGINE_EXTERNAL = 'te6ccgEBBAEA/gABRYgA9x/mpmYca9JHlq5SW8juVt/rIiJHcKm1Mu2pNQmO8fwMAQLg7mYuf9OdCVO7zsg2e7mRcdfqgXgfnqT8hgJ+1LtlrRVPvAqx06FRphHgZbpFyO61uJ3i+yKQZx6tnG6jIbQeBPu6mch//38RatNhZwAAAAd/L1jSu6Im7ZoLplVC3qudr9M3PBZh3UXZ8EJgkIaHhAIDAIB0WeEOtS3S3UFZqqRl8MGck4CcddLBvqg+uiMlyPJ8VAWFsn1SVxYmZh+NuukR7xVAbVvNbSbJEc+1Xa8jk4kCAEClf9uLs6TMPVLMgbKJvJA6dzP5sLVHiniQmi4Jpm9Zeg==';
const ENGINE_EXTERNAL_SIGNATURE_AT = 51;
const ENGINE_INTERNAL = 'te6ccgECBAEAAQsAAWBCAD3H+amZhxr0keWrlJbyO5W3+siIkdwqbUy7ak1CY7x/AAAAAAAAAAAAAAAAAAEBAuDfIcKm5pewHFitK9zCZKnullvywtBDeBcDN+RVNELBcyXjCOoaN+LgtgZHJDqHIGtOkPxPHAvvpx4LVCDGO/cA+7qZx3//fxFq02FnAAAABzITUMsZ+B7zVWqhZowiSfbTnrVMYUguVeRGcvZ992HZAgMAgCWqAD6UTT3vVyWJ6ioFZxhbzBSDxFYnPJtxwPgvkO3lo7zBl0Vm60YqudTAxUCAi6Cr7G4U4FGzr5npwv973AQAQKvoZGnMX27zLomFQosXzbMWWA2KjEnw9r1PzDjvdFgo';
const ENGINE_INTERNAL_SIGNATURE_AT = 65;
const SIGNATURE_BYTES = 64;
/** a comment payload with a checksum: a bag of cells that is no rotation */
const COMMENT = 'te6cckEBAQEADAAAFAAAAABIZWxsbyGVgYQo';

const ACCOUNT = '0:' + '1'.repeat(64);

function expectDisarmed(original: string, signatureAt: number) {
  const disarmed = breakRotationSignature(original);
  expect(disarmed).toBeTruthy();
  const was = base64ToBytes(original);
  const now = base64ToBytes(disarmed);
  expect(now.length).toBe(was.length);
  let changed = 0;
  for(let i = 0; i < was.length; ++i) {
    if(was[i] === now[i]) continue;
    expect(i >= signatureAt && i < signatureAt + SIGNATURE_BYTES, `byte ${i} changed outside the signature`).toBe(true);
    ++changed;
  }

  expect(changed).toBeGreaterThanOrEqual(SIGNATURE_BYTES / 2);
}

function withChecksum(boc: string) {
  const bytes = base64ToBytes(boc);
  bytes[4] |= 0x40;
  const crc = crc32c(bytes);
  return bytesToBase64([...bytes, crc & 0xff, (crc >>> 8) & 0xff, (crc >>> 16) & 0xff, (crc >>> 24) & 0xff]);
}

describe('crc32 helpers', () => {
  it('computes both polynomials on the standard check input', () => {
    const input = new TextEncoder().encode('123456789');
    expect(crc32(input)).toBe(0xcbf43926);
    expect(crc32c(input)).toBe(0xe3069283);
  });
});

describe('disarming the fee quote', () => {
  it('replaces only the request signature of an external rotation', () => {
    expectDisarmed(EXTERNAL, EXTERNAL_SIGNATURE_AT);
  });

  it('replaces only the request signature of a rotation that carries a state init', () => {
    expectDisarmed(STATE_INIT, STATE_INIT_SIGNATURE_AT);
  });

  it('replaces only the request signature of an internal rotation', () => {
    expectDisarmed(INTERNAL, INTERNAL_SIGNATURE_AT);
  });

  it('disarms the rotations engine 0.0.7 signs, with the old key encrypted beside the proof', () => {
    expectDisarmed(ENGINE_EXTERNAL, ENGINE_EXTERNAL_SIGNATURE_AT);
    expectDisarmed(ENGINE_INTERNAL, ENGINE_INTERNAL_SIGNATURE_AT);
    expectDisarmed(ENGINE_EXTERNAL_UNDEPLOYED, ENGINE_EXTERNAL_UNDEPLOYED_SIGNATURE_AT);
    expectDisarmed(ENGINE_INTERNAL_UNDEPLOYED, ENGINE_INTERNAL_UNDEPLOYED_SIGNATURE_AT);
  });

  it('gives every quote its own random signature', () => {
    const first = breakRotationSignature(EXTERNAL);
    const second = breakRotationSignature(EXTERNAL);
    expect(first).toBeTruthy();
    expect(first).not.toBe(second);
  });

  it('keeps the checksum of a checksummed message valid', () => {
    const disarmed = base64ToBytes(breakRotationSignature(withChecksum(EXTERNAL)));
    const till = disarmed.length - 4;
    const found = (disarmed[till] | (disarmed[till + 1] << 8) | (disarmed[till + 2] << 16) | (disarmed[till + 3] << 24)) >>> 0;
    expect(found).toBe(crc32c(disarmed.subarray(0, till)));
  });

  it('refuses anything but one signed rotation request', () => {
    const foreign = base64ToBytes(EXTERNAL);
    foreign[EXTERNAL_SIGNATURE_AT + SIGNATURE_BYTES] = 0;
    const cases: [string, string][] = [
      ['an empty message', ''],
      ['text that is not base64', 'not base64 at all'],
      ['a truncated message', bytesToBase64(base64ToBytes(EXTERNAL).subarray(0, 80))],
      ['a message with a trailing byte', bytesToBase64([...base64ToBytes(EXTERNAL), 0x20])],
      ['a message that is not a rotation', bytesToBase64(foreign)],
      ['a comment', COMMENT]
    ];

    for(const [name, boc] of cases) {
      expect(breakRotationSignature(boc), name).toBeUndefined();
    }
  });
});

describe('pricing the update', () => {
  it('asks the emulator exactly what the engine asks, with signature checks off', () => {
    const request = emulateTraceRequest('AAAA');
    expect(request.post).toBe(true);
    expect(request.endpoint).toBe(EMULATE_TRACE_ENDPOINT);
    expect(request.endpoint).toBe('/api/emulate/v1/emulateTrace');
    expect(JSON.parse(request.payload)).toEqual({
      boc: 'AAAA',
      ignore_chksig: true,
      include_code_data: false,
      include_address_book: false,
      include_metadata: false,
      with_actions: true,
      mc_block_seqno: null
    });
  });

  const trace = (root: Record<string, any>, hash = 'root') => JSON.stringify({
    mc_block_seqno: 17,
    trace: {tx_hash: hash},
    transactions: {root},
    is_incomplete: false
  });

  const transaction = (patch: {fees?: any, aborted?: any, compute?: any, action?: any, account?: any} = {}) => ({
    account: 'account' in patch ? patch.account : ACCOUNT,
    total_fees: 'fees' in patch ? patch.fees : '11',
    description: {
      type: 'ord',
      aborted: 'aborted' in patch ? patch.aborted : false,
      compute_ph: {success: true, exit_code: 0, ...patch.compute},
      action: {success: true, result_code: 0, ...patch.action}
    }
  });

  it('reads the root transaction\'s own fee', () => {
    expect(parseEmulatedTrace(trace(transaction()))).toEqual({fee: '11', account: ACCOUNT});
    expect(parseEmulatedTrace(trace(transaction({fees: '0'})))).toEqual({fee: '0', account: ACCOUNT});
    expect(parseEmulatedTrace(trace(transaction({fees: '0004200000'})))?.fee).toBe('4200000');
  });

  it('takes exit code 1 for the success it is', () => {
    expect(parseEmulatedTrace(trace(transaction({compute: {exit_code: 1}})))?.fee).toBe('11');
  });

  it('refuses a failed, aborted or malformed emulation', () => {
    const cases: [string, string][] = [
      ['compute exit code 33', trace(transaction({compute: {exit_code: 33}}))],
      ['compute exit code 2', trace(transaction({compute: {exit_code: 2}}))],
      ['action result code 34', trace(transaction({action: {result_code: 34}}))],
      ['compute not successful', trace(transaction({compute: {success: false}}))],
      ['action not successful', trace(transaction({action: {success: false}}))],
      ['aborted', trace(transaction({aborted: true}))],
      ['no aborted flag', trace(transaction({aborted: undefined}))],
      ['a negative fee', trace(transaction({fees: '-1'}))],
      ['a numeric fee', trace(transaction({fees: 11}))],
      ['no account', trace(transaction({account: ''}))],
      ['a root that is not listed', trace(transaction(), 'other')],
      ['not JSON', '{'],
      ['an error body', JSON.stringify({error: 'failed'})]
    ];

    for(const [name, json] of cases) {
      expect(parseEmulatedTrace(json), name).toBeUndefined();
    }
  });

  it('offers the update when the balance covers the fee, a top-up otherwise', () => {
    expect(makeRotationQuote('4200000', '1720580000000')).toEqual({fee: '4200000', insufficient: false});
    expect(makeRotationQuote('4200000', '4200000')).toEqual({fee: '4200000', insufficient: false});
    expect(makeRotationQuote('4200000', '4199999')).toEqual({fee: '4200000', insufficient: true});
    expect(makeRotationQuote('4200000', 0)).toEqual({fee: '4200000', insufficient: true});
    expect(isRotationFeeCovered('1', undefined)).toBe(false);
    expect(isRotationFeeCovered('99999999999999999999', '100000000000000000000')).toBe(true);
  });
});

describe('settling a sent update', () => {
  const OPERATION = 'op-1';

  it('follows the journal for the update\'s own operation', () => {
    expect(rotationSnapshotVerdict(OPERATION, {operationId: OPERATION, phase: 'confirmed'}, false)).toBe('confirmed');
    expect(rotationSnapshotVerdict(OPERATION, {operationId: OPERATION, phase: 'replaced'}, false)).toBe('ROTATION_REPLACED');
    expect(rotationSnapshotVerdict(OPERATION, {operationId: OPERATION, phase: 'expired'}, false)).toBe('ROTATION_EXPIRED');
    for(const phase of ['failed', 'cancelled', 'superseded', 'sequenceNumberConsumed'] as const) {
      expect(rotationSnapshotVerdict(OPERATION, {operationId: OPERATION, phase}, true), phase).toBe('ROTATION_FAILED');
    }

    for(const phase of ['idle', 'persisting', 'readyToSubmit', 'submitting', 'submissionUnknown', 'submitted', 'handedOff'] as const) {
      expect(rotationSnapshotVerdict(OPERATION, {operationId: OPERATION, phase}, true), phase).toBe('wait');
    }
  });

  it('drops an update the journal does not name only when the journal is authoritative', () => {
    // * after a reload: the journal is written before a message leaves, so the update never went out
    expect(rotationSnapshotVerdict(OPERATION, {operationId: 'op-0', phase: 'confirmed'}, true)).toBe('ROTATION_FAILED');
    expect(rotationSnapshotVerdict(OPERATION, {phase: 'idle'}, true)).toBe('ROTATION_FAILED');
    // * while this tab still waits on its own submission, that submission speaks for it
    expect(rotationSnapshotVerdict(OPERATION, {operationId: 'op-0', phase: 'confirmed'}, false)).toBe('wait');
    expect(rotationSnapshotVerdict(OPERATION, {phase: 'idle'}, false)).toBe('wait');
  });

  it('takes the journal\'s silence for an answer only once no copy of the update can land', () => {
    // * another tab may have stored the update and not journaled it yet: until the window and the margin are over
    expect(isRotationJournalAuthoritative(1000, 999, 60)).toBe(false);
    expect(isRotationJournalAuthoritative(1000, 1059, 60)).toBe(false);
    expect(isRotationJournalAuthoritative(1000, 1060, 60)).toBe(true);
  });

  it('names engine failures by what the user is told', () => {
    expect(rotationErrorType(new Error('previous submission outcome is unresolved'))).toBe('ROTATION_ALREADY_SENDING');
    expect(rotationErrorType(new Error('prepared BOC seqno 7 does not match current wallet seqno 8'))).toBe('ROTATION_ALREADY_SENDING');
    expect(rotationErrorType(new Error('insufficient wallet balance including fees: requested 5'))).toBe('ROTATION_FEES');
    expect(rotationErrorType('send failed: refused')).toBe('ROTATION_REFUSED');
    expect(rotationErrorType(new Error('wallet key rotation is unavailable: not deployed'))).toBe('ROTATION_PREPARE_FAILED');
    expect(rotationErrorType({type: 'ROTATION_EXPIRED'})).toBe('ROTATION_EXPIRED');
    expect(rotationErrorType(new Error('something else'))).toBe('ROTATION_FAILED');
    expect(isRotationSubmissionUnknown(new Error('submission outcome is unknown: timeout'))).toBe(true);
    expect(isRotationSubmissionUnknown(new Error('send failed: refused'))).toBe(false);
  });

  const OLD_KEY = 'aa'.repeat(32);
  const NEW_KEY = 'bb'.repeat(32);
  const THIRD_KEY = 'cc'.repeat(32);
  const record: WalletCustodyRecord = {
    recordId: 'record-old',
    address: 'UQA8RRt6mUoTcShtSDlxDvF1SX6Femu9dMCB-ZTK3uQ-aU_k',
    anchorKey: '11'.repeat(32),
    signingKey: OLD_KEY,
    secretRef: 'secret-old',
    network: 'mainnet',
    date: 1,
    pendingRotation: {
      recordId: 'record-new',
      secretRef: 'secret-new',
      operationId: OPERATION,
      newSigningKey: NEW_KEY,
      validUntil: 1000
    }
  };

  it('promotes a confirmed update in one record: new phrase, new key, the old key answered for meanwhile', () => {
    const promoted = promoteRotationRecord(record, OLD_KEY);
    expect(promoted).toMatchObject({
      recordId: 'record-new',
      secretRef: 'secret-new',
      anchorKey: record.anchorKey,
      address: record.address,
      signingKey: NEW_KEY,
      awaitingServerKey: OLD_KEY,
      rotatedSinceBackup: true,
      pendingRotation: undefined
    });

    // * the server already serves the new key: nothing to wait for
    expect(promoteRotationRecord(record, NEW_KEY).awaitingServerKey).toBeUndefined();
    // * nothing pending: nothing to promote
    const settled = {...record, pendingRotation: undefined as WalletCustodyRecord['pendingRotation']};
    expect(promoteRotationRecord(settled, OLD_KEY)).toBe(settled);
  });

  it('signs for the served key, and for the replaced one only until the server catches up', () => {
    const promoted = promoteRotationRecord(record, OLD_KEY);
    expect(isRecordSigningFor(record, OLD_KEY)).toBe(true);
    expect(isRecordSigningFor(record, NEW_KEY)).toBe(false);
    expect(isRecordSigningFor(promoted, OLD_KEY)).toBe(true);
    expect(isRecordSigningFor(promoted, NEW_KEY)).toBe(true);
    expect(isRecordSigningFor(promoted, THIRD_KEY)).toBe(false);

    // * still the old key served: the wait goes on
    expect(settleAwaitingServerKey(promoted, OLD_KEY)).toBeUndefined();
    // * the new key served, or a third one (the key moved on elsewhere): the wait ends
    const caughtUp = settleAwaitingServerKey(promoted, NEW_KEY);
    expect(caughtUp.awaitingServerKey).toBeUndefined();
    expect(isRecordSigningFor(caughtUp, NEW_KEY)).toBe(true);
    const movedOn = settleAwaitingServerKey(promoted, THIRD_KEY);
    expect(movedOn.awaitingServerKey).toBeUndefined();
    expect(isRecordSigningFor(movedOn, OLD_KEY)).toBe(false);
    // * nothing awaited: nothing changes
    expect(settleAwaitingServerKey(caughtUp, NEW_KEY)).toBeUndefined();
  });
});

describe('the backup quiz', () => {
  it('asks one word of the anchor half and two of the signing half of an update\'s new phrase', () => {
    for(let i = 0; i < 200; ++i) {
      const indexes = backupQuizIndexes(24, true);
      expect(indexes).toHaveLength(3);
      expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
      expect(indexes[0]).toBeLessThan(12);
      expect(indexes[1]).toBeGreaterThanOrEqual(12);
      expect(indexes[2]).toBeGreaterThan(indexes[1]);
      expect(indexes[2]).toBeLessThan(24);
    }
  });

  it('never asks the same signing word twice, whatever the draws', () => {
    // * both draws land on the same spot: the second one moves past the first
    expect(backupQuizIndexes(24, true, () => 0)).toEqual([0, 12, 13]);
    expect(backupQuizIndexes(24, true, (max) => max - 1)).toEqual([11, 22, 23]);
  });

  it('asks three distinct words of any other phrase, from all of it', () => {
    for(const count of [12, 24]) {
      for(let i = 0; i < 200; ++i) {
        const indexes = backupQuizIndexes(count, false);
        expect(new Set(indexes).size).toBe(3);
        expect(indexes.every((index) => index >= 0 && index < count)).toBe(true);
        expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
      }
    }

    // * the same draws: anywhere in a phrase that is no update's, split across the halves of one that is
    const draws = () => {
      let next = 0;
      return () => next++;
    };
    expect(backupQuizIndexes(24, false, draws())).toEqual([0, 1, 2]);
    expect(backupQuizIndexes(24, true, draws())).toEqual([2, 12, 14]);
  });
});

describe('the write-down', () => {
  it('takes the words as written only once they have been up for 10 seconds', () => {
    const shownAt = 1_000_000;
    expect(BACKUP_WRITE_DOWN_DELAY).toBe(10_000);
    expect(isBackupWriteDownTooQuick(shownAt, shownAt)).toBe(true);
    expect(isBackupWriteDownTooQuick(shownAt, shownAt + 9_999)).toBe(true);
    expect(isBackupWriteDownTooQuick(shownAt, shownAt + 10_000)).toBe(false);
    expect(isBackupWriteDownTooQuick(shownAt, shownAt + 120_000)).toBe(false);
  });
});
