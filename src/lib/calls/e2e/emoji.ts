/*
 * TdE2E emoji-verification commit-reveal protocol — port of CallVerification
 * + CallVerificationChain from tdlib/tde2e/td/e2e/Call.{cpp,h}.
 *
 * Spec: src/lib/calls/e2e/notes/call.md §4 + Encryption.md "Emoji Generation".
 *
 * Two-phase protocol that prevents block creators from biasing the emoji
 * hash via brute-force search:
 *   1. Commit: every participant publishes SHA256(nonce) signed.
 *   2. Reveal: once ALL commits collected, every participant publishes
 *      their nonce signed.
 *   3. End:   once ALL reveals collected and validated, emoji_hash is
 *      HMAC-SHA512(sorted_nonces, block_hash)[0:32].
 *
 * Sorting is by RAW BYTES (lexicographic), NOT by user_id — easy to get
 * wrong (notes/call.md gotcha #5).
 */

import {bytesToHex, constantTimeEqual, hmacSha512, randomBytes, sha256} from './crypto';
import {PrivateKey, PublicKey} from './keys';
import {
  encodeGroupBroadcastNonceCommit,
  encodeGroupBroadcastNonceReveal,
  GroupBroadcast,
  GroupBroadcastNonceCommit,
  GroupBroadcastNonceReveal
} from './tlTypes';
import {TLWriter} from './tl';

export type VerificationPhase = 'commit' | 'reveal' | 'end';

export interface VerificationParticipant {
  userId: bigint;
  publicKey: PublicKey;
}

export interface VerificationStateSnapshot {
  phase: VerificationPhase;
  height: number;
  blockHash: Uint8Array;
  // Number of commits seen so far (excluding self).
  commitsSeen: number;
  revealsSeen: number;
  // Defined only when phase === 'end'.
  emojiHash?: Uint8Array;
}

export class VerificationChain {
  private phase: VerificationPhase = 'commit';
  // Our own nonce + its hash — kept until reveal phase.
  private readonly myNonce: Uint8Array;
  private readonly myNonceHash: Uint8Array;
  // Participant → committed nonce_hash (incl. ourselves).
  private readonly commits: Map<string, Uint8Array> = new Map();
  // Participant → revealed nonce.
  private readonly reveals: Map<string, Uint8Array> = new Map();
  // Outbound queue: serialized GroupBroadcast(s) to send on the next pull.
  private outbound: Uint8Array[] = [];
  // Final emoji hash; only set when phase === 'end'.
  private emojiHash: Uint8Array | undefined;

  private constructor(
    public readonly height: number,
    public readonly blockHash: Uint8Array,
    private readonly me: VerificationParticipant,
    private readonly mePrivate: PrivateKey,
    private readonly participants: VerificationParticipant[],
    myNonce: Uint8Array,
    myNonceHash: Uint8Array
  ) {
    this.myNonce = myNonce;
    this.myNonceHash = myNonceHash;
  }

  // Start a fresh verification round on a new block. Generates our own nonce,
  // immediately commits + enqueues the outbound message.
  public static async start(
    height: number,
    blockHash: Uint8Array,
    me: VerificationParticipant,
    mePrivate: PrivateKey,
    participants: VerificationParticipant[]
  ): Promise<VerificationChain> {
    if(blockHash.length !== 32) throw new Error('blockHash must be 32 bytes');
    if(!participants.some((p) => p.userId === me.userId)) {
      throw new Error('start: self not listed in participants');
    }
    const myNonce = randomBytes(32);
    const myNonceHash = await sha256(myNonce);
    const chain = new VerificationChain(
      height,
      blockHash,
      me,
      mePrivate,
      participants,
      myNonce,
      myNonceHash
    );

    // Self-commit immediately + queue outbound for the wire.
    chain.commits.set(chain.keyForUser(me.userId), myNonceHash);
    chain.outbound.push(chain.signAndEncodeCommit());
    return chain;
  }

  public snapshot(): VerificationStateSnapshot {
    return {
      phase: this.phase,
      height: this.height,
      blockHash: new Uint8Array(this.blockHash),
      commitsSeen: this.commits.size,
      revealsSeen: this.reveals.size,
      emojiHash: this.emojiHash ? new Uint8Array(this.emojiHash) : undefined
    };
  }

  // Hand off any queued outbound broadcasts to the caller; clears the queue.
  public pullOutbound(): Uint8Array[] {
    const out = this.outbound;
    this.outbound = [];
    return out;
  }

  // Apply an incoming GroupBroadcast (commit or reveal) from a peer.
  // Returns true if the broadcast caused a phase transition.
  public async receive(b: GroupBroadcast): Promise<boolean> {
    const sender = this.findParticipant(b.userId);
    if(!sender) {
      // Unknown sender — silently drop per spec ("errors logged not propagated").
      return false;
    }
    if(b.chainHeight !== this.height) return false;
    if(!constantTimeEqual(b.chainHash, this.blockHash)) return false;

    // Signature verify. The broadcast is signed over its own TL encoding with
    // the signature field replaced by 64 zero bytes — same trick as Block.
    const w = new TLWriter();
    if(b.kind === 'commit') {
      const stub: GroupBroadcastNonceCommit = {...b, signature: new Uint8Array(64)};
      encodeGroupBroadcastNonceCommit(w, stub);
    } else {
      const stub: GroupBroadcastNonceReveal = {...b, signature: new Uint8Array(64)};
      encodeGroupBroadcastNonceReveal(w, stub);
    }
    if(!sender.publicKey.verify(w.finish(), b.signature)) {
      return false; // bad signature
    }

    const senderKey = this.keyForUser(sender.userId);

    if(b.kind === 'commit') {
      if(this.phase !== 'commit') return false;
      if(this.commits.has(senderKey)) return false; // duplicate
      this.commits.set(senderKey, new Uint8Array(b.nonceHash));
      // If all participants have committed, advance to reveal + enqueue our reveal.
      if(this.commits.size === this.participants.length) {
        this.phase = 'reveal';
        this.reveals.set(this.keyForUser(this.me.userId), this.myNonce);
        this.outbound.push(this.signAndEncodeReveal());
        return true;
      }
      return false;
    }

    // reveal
    if(this.phase !== 'reveal') return false;
    if(this.reveals.has(senderKey)) return false;
    const expectedHash = this.commits.get(senderKey);
    if(!expectedHash) return false; // they reveal without ever committing
    const actualHash = await sha256(b.nonce);
    if(!constantTimeEqual(expectedHash, actualHash)) return false;
    this.reveals.set(senderKey, new Uint8Array(b.nonce));
    if(this.reveals.size === this.participants.length) {
      await this.finalize();
      return true;
    }
    return false;
  }

  // ===== Internal =====

  private findParticipant(userId: bigint): VerificationParticipant | undefined {
    for(const p of this.participants) if(p.userId === userId) return p;
    return undefined;
  }

  private keyForUser(userId: bigint): string {
    return userId.toString();
  }

  private signAndEncodeCommit(): Uint8Array {
    const stub: GroupBroadcastNonceCommit = {
      signature: new Uint8Array(64),
      userId: this.me.userId,
      chainHeight: this.height,
      chainHash: this.blockHash,
      nonceHash: this.myNonceHash
    };
    const toSignWriter = new TLWriter();
    encodeGroupBroadcastNonceCommit(toSignWriter, stub);
    const signature = this.mePrivate.sign(toSignWriter.finish());
    const signed: GroupBroadcastNonceCommit = {...stub, signature};
    const finalWriter = new TLWriter();
    encodeGroupBroadcastNonceCommit(finalWriter, signed);
    return finalWriter.finish();
  }

  private signAndEncodeReveal(): Uint8Array {
    const stub: GroupBroadcastNonceReveal = {
      signature: new Uint8Array(64),
      userId: this.me.userId,
      chainHeight: this.height,
      chainHash: this.blockHash,
      nonce: this.myNonce
    };
    const toSignWriter = new TLWriter();
    encodeGroupBroadcastNonceReveal(toSignWriter, stub);
    const signature = this.mePrivate.sign(toSignWriter.finish());
    const signed: GroupBroadcastNonceReveal = {...stub, signature};
    const finalWriter = new TLWriter();
    encodeGroupBroadcastNonceReveal(finalWriter, signed);
    return finalWriter.finish();
  }

  private async finalize(): Promise<void> {
    // Concat nonces sorted by RAW BYTES (NOT user_id).
    const nonceList = Array.from(this.reveals.values()).map((n) => new Uint8Array(n));
    nonceList.sort((a, b) => compareBytes(a, b));
    let total = 0;
    for(const n of nonceList) total += n.length;
    const concat = new Uint8Array(total);
    let offset = 0;
    for(const n of nonceList) {
      concat.set(n, offset);
      offset += n.length;
    }
    const mac = await hmacSha512(concat, this.blockHash);
    this.emojiHash = mac.subarray(0, 32);
    this.phase = 'end';
  }
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const cap = Math.min(a.length, b.length);
  for(let i = 0; i < cap; i++) {
    if(a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

// Convenience: format an emoji_hash into a stable hex string for UI / logs.
export function emojiHashToHex(hash: Uint8Array): string {
  return bytesToHex(hash);
}
