/*
 * TL roundtrip tests for the e2e.chain.* types. No C++ byte vectors for
 * these (the extraction agent only got structural descriptions) — so we
 * cover: encode/decode roundtrip for every constructor, and verify the
 * magic-prefix consistency.
 */

import {describe, it, expect} from 'vitest';
import {
  Block,
  Change,
  decodeBlock,
  decodeChange,
  decodeGroupBroadcast,
  decodeGroupParticipant,
  decodeGroupState,
  decodeSharedKey,
  decodeStateProof,
  encodeBlock,
  encodeChange,
  encodeGroupBroadcastNonceCommit,
  encodeGroupBroadcastNonceReveal,
  encodeGroupParticipant,
  encodeGroupState,
  encodeSharedKey,
  encodeStateProof,
  GroupBroadcastNonceCommit,
  GroupBroadcastNonceReveal,
  GroupParticipant,
  GroupState,
  SharedKey,
  StateProof
} from '../tlTypes';
import {TL_MAGIC, TLReader, TLWriter} from '../tl';

function roundTrip<T>(
  value: T,
  encode: (w: TLWriter, v: T) => void,
  decode: (r: TLReader) => T
): T {
  const w = new TLWriter();
  encode(w, value);
  const bytes = w.finish();
  const r = new TLReader(bytes);
  const decoded = decode(r);
  expect(r.eof()).toBe(true);
  return decoded;
}

// Quick helpers to build test bytes.
const b32 = (seed: number) => {
  const out = new Uint8Array(32);
  for(let i = 0; i < 32; i++) out[i] = (seed + i * 7) & 0xff;
  return out;
};
const b64 = (seed: number) => {
  const out = new Uint8Array(64);
  for(let i = 0; i < 64; i++) out[i] = (seed + i * 11) & 0xff;
  return out;
};

describe('TL roundtrip — e2e.chain.* types', () => {
  it('GroupParticipant: full permission set', () => {
    const original: GroupParticipant = {
      userId: BigInt('123456789012345'),
      publicKey: b32(1),
      canAddUsers: true,
      canRemoveUsers: true,
      version: 7
    };
    const back = roundTrip(original, encodeGroupParticipant, decodeGroupParticipant);
    expect(back).toEqual(original);
  });

  it('GroupParticipant: no permissions', () => {
    const original: GroupParticipant = {
      userId: BigInt('1'),
      publicKey: b32(99),
      canAddUsers: false,
      canRemoveUsers: false,
      version: 0
    };
    const back = roundTrip(original, encodeGroupParticipant, decodeGroupParticipant);
    expect(back).toEqual(original);
  });

  it('GroupState: multi-participant', () => {
    const original: GroupState = {
      participants: [
        {
          userId: BigInt('10'),
          publicKey: b32(10),
          canAddUsers: true,
          canRemoveUsers: false,
          version: 1
        },
        {
          userId: BigInt('20'),
          publicKey: b32(20),
          canAddUsers: false,
          canRemoveUsers: true,
          version: 2
        }
      ],
      externalPermissions: 3
    };
    const back = roundTrip(original, encodeGroupState, decodeGroupState);
    expect(back).toEqual(original);
  });

  it('SharedKey: encrypted-for-many shape', () => {
    const original: SharedKey = {
      ek: b32(5),
      encryptedSharedKey: new Uint8Array([1, 2, 3, 4, 5, 6]),
      destUserIds: [BigInt('100'), BigInt('200'), BigInt('300')],
      destHeaders: [new Uint8Array(32), new Uint8Array([0xaa, 0xbb]), new Uint8Array([0x01])]
    };
    const back = roundTrip(original, encodeSharedKey, decodeSharedKey);
    expect(back).toEqual(original);
  });

  it('Change: all variants', () => {
    const variants: Change[] = [
      {kind: 'noop', nonce: b32(42)},
      {kind: 'setValue', key: new Uint8Array([0x01, 0x02]), value: new Uint8Array([0x03])},
      {
        kind: 'setGroupState',
        groupState: {
          participants: [
            {
              userId: BigInt('7'),
              publicKey: b32(70),
              canAddUsers: true,
              canRemoveUsers: true,
              version: 0
            }
          ],
          externalPermissions: 0
        }
      },
      {
        kind: 'setSharedKey',
        sharedKey: {
          ek: b32(8),
          encryptedSharedKey: new Uint8Array([9, 9, 9]),
          destUserIds: [BigInt('1')],
          destHeaders: [new Uint8Array([0xcc])]
        }
      }
    ];
    for(const v of variants) {
      const back = roundTrip(v, encodeChange, decodeChange);
      expect(back).toEqual(v);
    }
  });

  it('StateProof: all-fields-present and all-omitted', () => {
    const minimal: StateProof = {kvHash: b32(0xff)};
    const back1 = roundTrip(minimal, encodeStateProof, decodeStateProof);
    expect(back1).toEqual(minimal);

    const full: StateProof = {
      kvHash: b32(0xaa),
      groupState: {participants: [], externalPermissions: 1},
      sharedKey: {
        ek: b32(0xbb),
        encryptedSharedKey: new Uint8Array([0x01]),
        destUserIds: [],
        destHeaders: []
      }
    };
    const back2 = roundTrip(full, encodeStateProof, decodeStateProof);
    expect(back2).toEqual(full);
  });

  it('Block: with signature_public_key', () => {
    const original: Block = {
      signature: b64(50),
      prevBlockHash: b32(60),
      changes: [{kind: 'noop', nonce: b32(70)}],
      height: 42,
      stateProof: {kvHash: b32(80)},
      signaturePublicKey: b32(90)
    };
    const back = roundTrip(original, encodeBlock, decodeBlock);
    expect(back).toEqual(original);
  });

  it('Block: without signature_public_key (signer = first participant)', () => {
    const original: Block = {
      signature: b64(0),
      prevBlockHash: new Uint8Array(32),
      changes: [
        {
          kind: 'setGroupState',
          groupState: {
            participants: [
              {
                userId: BigInt('1'),
                publicKey: b32(1),
                canAddUsers: true,
                canRemoveUsers: true,
                version: 0
              }
            ],
            externalPermissions: 0
          }
        }
      ],
      height: 0,
      stateProof: {kvHash: new Uint8Array(32)}
    };
    const back = roundTrip(original, encodeBlock, decodeBlock);
    expect(back).toEqual(original);
  });

  it('GroupBroadcastNonceCommit roundtrip', () => {
    const commit: GroupBroadcastNonceCommit = {
      signature: b64(0xaa),
      userId: BigInt('123456789'),
      chainHeight: 5,
      chainHash: b32(0xbb),
      nonceHash: b32(0xcc)
    };
    const w = new TLWriter();
    encodeGroupBroadcastNonceCommit(w, commit);
    const r = new TLReader(w.finish());
    const decoded = decodeGroupBroadcast(r);
    expect(decoded.kind).toBe('commit');
    if(decoded.kind === 'commit') {
      expect(decoded.signature).toEqual(commit.signature);
      expect(decoded.userId).toBe(commit.userId);
      expect(decoded.chainHeight).toBe(commit.chainHeight);
      expect(decoded.chainHash).toEqual(commit.chainHash);
      expect(decoded.nonceHash).toEqual(commit.nonceHash);
    }
  });

  it('GroupBroadcastNonceReveal roundtrip', () => {
    const reveal: GroupBroadcastNonceReveal = {
      signature: b64(0xdd),
      userId: BigInt('987654321'),
      chainHeight: 8,
      chainHash: b32(0xee),
      nonce: b32(0xff)
    };
    const w = new TLWriter();
    encodeGroupBroadcastNonceReveal(w, reveal);
    const r = new TLReader(w.finish());
    const decoded = decodeGroupBroadcast(r);
    expect(decoded.kind).toBe('reveal');
    if(decoded.kind === 'reveal') {
      expect(decoded.signature).toEqual(reveal.signature);
      expect(decoded.userId).toBe(reveal.userId);
      expect(decoded.chainHeight).toBe(reveal.chainHeight);
      expect(decoded.chainHash).toEqual(reveal.chainHash);
      expect(decoded.nonce).toEqual(reveal.nonce);
    }
  });

  it('decodeChange rejects unknown magic', () => {
    const w = new TLWriter();
    w.uint32(0xdeadbeef);
    const r = new TLReader(w.finish());
    expect(() => decodeChange(r)).toThrow(/unknown magic/);
  });

  it('all magics are distinct', () => {
    const values = Object.values(TL_MAGIC);
    expect(new Set(values).size).toBe(values.length);
  });
});
