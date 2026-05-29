/*
 * TdE2E Call state machine — per-frame encrypt/decrypt over the SFU media,
 * keyed by a `group_shared_key` derived from the latest blockchain block.
 *
 * This file implements 4a (shared-key derivation) and 4b (packet
 * encrypt/decrypt). The emoji commit-reveal protocol (4c) is a follow-up.
 *
 * Spec: src/lib/calls/e2e/notes/call.md + Encryption.md.
 * Reference: tdlib/tde2e/td/e2e/Call.{cpp,h}.
 *
 * Packet wire layout (final bytes emitted to the SFU):
 *   unencrypted_prefix  (variable; per-call decision how much RTP-level
 *                         metadata to expose to the server)
 *   header_a            (int32 head | epoch_hash[0] | ... | epoch_hash[N-1])
 *                       head = (epochs_n & 0xff)  (version=0 in upper bits)
 *   header_b            (encrypted_header[0] (32B) | ... | encrypted_header[N-1])
 *   encrypted_payload   (variable; AES-CBC of {channel_id, seqno, data})
 *   signature           (64B Ed25519 over magic2 || large_msg_id)
 *   trailer             (LE uint32 = unencrypted_prefix length)
 */

import {
  applyBlock,
  buildBlock,
  buildChangesForNewState,
  ClientBlockchainState,
  computeBlockHash,
  createInitialState,
  hydrateStateFromBlock
} from './blockchain';
import {
  concatBytes,
  constantTimeEqual,
  ed25519Verify,
  hmacSha512,
  int32LeToBytes,
  randomBytes
} from './crypto';
import {VerificationChain, VerificationStateSnapshot} from './emoji';
import {decryptData, decryptHeader, encryptData, encryptHeader} from './messageEncryption';
import {PrivateKey, PublicKey} from './keys';
import {localToServer, serverToLocal, TLReader, TLWriter} from './tl';
import {
  decodeBlock,
  decodeGroupBroadcast,
  GroupParticipant,
  GroupState,
  serializeBlock,
  SharedKey
} from './tlTypes';

// Magics for the two pseudo-types `e2e.callPacket` and `e2e.callPacketLargeMsgId`
// — used as 4-byte domain-separation prefixes (NOT as TL constructor tags).
// Computed via CRC32(normalized declaration) like the others; verified
// against the C++ runtime use of `e2e_api::e2e_callPacket::ID`.
const MAGIC_CALL_PACKET = 0x40a6bee9;
const MAGIC_CALL_PACKET_LARGE_MSG_ID = 0x1ce56c2d;

// Per spec: clients should keep at most 15 active epochs and reject packets
// referencing more than this in header_a.
export const MAX_ACTIVE_EPOCHS = 15;

// Replay-protection window per (sender, channel) — sliding set of seen seqnos.
const REPLAY_WINDOW_SIZE = 1024;

// Channel IDs are constrained to a 10-bit range.
function validateChannelId(channelId: number): void {
  if(channelId < 0 || channelId > 1023) {
    throw new Error(`invalid channel_id ${channelId} (must be 0..1023)`);
  }
}

function magicBytes(magic: number): Uint8Array {
  const w = new TLWriter();
  w.uint32(magic >>> 0);
  return w.finish();
}

// ===== Active epoch =====
//
// One entry per blockchain block that introduced a (new or replayed) shared
// key. The receiver uses `epochHash` to look up which epoch the sender used;
// the sender lists all currently-active epochs in header_a so receivers with
// either old or new state can decrypt during the transition.

export interface ActiveEpoch {
  // Block height where this key was introduced.
  height: number;
  // Block hash; used as the epoch's identifier on the wire.
  epochHash: Uint8Array; // 32 bytes
  // The derived 32-byte group_shared_key (post-HMAC for v1).
  groupSharedKey: Uint8Array;
  // Snapshot of participants at this epoch — needed to verify Ed25519
  // signatures on packets that were encrypted with this epoch's key.
  participantKeysByUserId: Map<string, PublicKey>;
}

// ===== Shared key derivation =====
//
// Given a block's SharedKey change (or a SetGroupState that re-derived one)
// and our private key + user id, decrypt the per-participant header and
// extract the raw shared key. v1+ then mixes in the block hash via HMAC.

// Mirror tdlib GroupState::version() (Blockchain.cpp:42-51): the minimum of
// all participants' versions, clamped to [0,255]; an empty group is version 0.
// This gates the v1+ group-shared-key HMAC mixing below so we match every
// other client. NB: this is the GROUP-STATE version, NOT the per-frame packet
// `version` field in decryptPacket — they are unrelated.
export function groupStateVersion(groupState: GroupState): number {
  const {participants} = groupState;
  if(!participants.length) return 0;
  let version = participants[0].version;
  for(const p of participants) version = Math.min(version, p.version);
  return Math.max(0, Math.min(255, version));
}

export async function deriveGroupSharedKey(
  ourUserId: bigint,
  ourPrivateKey: PrivateKey,
  sharedKey: SharedKey,
  blockHash: Uint8Array,
  v1OrLater = true
): Promise<Uint8Array> {
  const myIndex = sharedKey.destUserIds.findIndex((id) => id === ourUserId);
  if(myIndex === -1) {
    throw new Error(`our user_id ${ourUserId} not in shared-key recipients`);
  }
  const ourHeader = sharedKey.destHeaders[myIndex];
  if(ourHeader.length !== 32) {
    throw new Error(`destHeader[${myIndex}] must be 32 bytes, got ${ourHeader.length}`);
  }

  // ECDH: our Ed25519 private × `ek` (also Ed25519 — tdlib stores the
  // sender's ephemeral Ed25519 public key in this field; both sides convert
  // to Curve25519 internally and run X25519 + HMAC mixing).
  const sharedSecret = await ourPrivateKey.ecdh(new PublicKey(sharedKey.ek));

  // decrypt_header(our_header, encryptedSharedKey, sharedSecret) -> one_time_secret
  const oneTimeSecret = await decryptHeader(ourHeader, sharedKey.encryptedSharedKey, sharedSecret);

  // decrypt_data(encryptedSharedKey, one_time_secret) -> raw_group_shared_key
  const {output: rawGroupSharedKey} = await decryptData(sharedKey.encryptedSharedKey, oneTimeSecret);
  if(rawGroupSharedKey.length !== 32) {
    throw new Error(`raw_group_shared_key must be 32 bytes, got ${rawGroupSharedKey.length}`);
  }

  if(!v1OrLater) return rawGroupSharedKey;

  // v1+: group_shared_key = HMAC-SHA512(raw, block_hash)[0:32]
  const mixed = await hmacSha512(rawGroupSharedKey, blockHash);
  return mixed.subarray(0, 32);
}

// ===== Per-frame encrypt =====

export interface EncryptPacketOptions {
  // 0..1023 — must match the receiver's expected channel.
  channelId: number;
  // Full RTP frame data (encrypted payload + optional unencrypted prefix).
  data: Uint8Array;
  // How many leading bytes are kept in the clear (e.g. RTP header). The
  // unencrypted prefix is NOT encrypted but IS authenticated (HMAC input).
  unencryptedPrefixLength: number;
  // Active epochs at send time — sender lists ALL of them, header_b carries
  // a per-epoch encrypted copy of the one-time secret.
  epochs: ActiveEpoch[];
  // Sender's signing key.
  privateKey: PrivateKey;
  // Strictly-increasing sequence number per (this sender, channel_id).
  // Caller is responsible for incrementing.
  seqno: number;
  // RNG override for deterministic tests; defaults to cryptographic random.
  oneTimeSecret?: Uint8Array;
}

export async function encryptPacket(opts: EncryptPacketOptions): Promise<Uint8Array> {
  validateChannelId(opts.channelId);
  if(opts.epochs.length === 0) throw new Error('encryptPacket: no active epochs');
  if(opts.epochs.length > MAX_ACTIVE_EPOCHS) {
    throw new Error(`encryptPacket: too many epochs (${opts.epochs.length})`);
  }
  if(opts.unencryptedPrefixLength > opts.data.length) {
    throw new Error('encryptPacket: unencrypted prefix exceeds data');
  }
  if(opts.unencryptedPrefixLength >= (1 << 16)) {
    throw new Error('encryptPacket: unencrypted prefix too large for trailer encoding');
  }
  if(opts.seqno < 0 || opts.seqno > 0xffffffff) {
    throw new Error(`encryptPacket: invalid seqno ${opts.seqno}`);
  }

  const unencryptedPrefix = opts.data.subarray(0, opts.unencryptedPrefixLength);
  const plaintext = opts.data.subarray(opts.unencryptedPrefixLength);

  // header_a = int32(epochs_n) || epoch_hash[0] || ... || epoch_hash[N-1]
  const headerAWriter = new TLWriter();
  headerAWriter.int32(opts.epochs.length);
  for(const e of opts.epochs) headerAWriter.raw(e.epochHash);
  const headerA = headerAWriter.finish();

  // payload = LE_int32(channel_id) || LE_uint32(seqno) || plaintext
  const payloadWriter = new TLWriter();
  payloadWriter.int32(opts.channelId);
  payloadWriter.uint32(opts.seqno);
  payloadWriter.raw(plaintext);
  const payload = payloadWriter.finish();

  // One-time secret: random per packet, encrypts the payload, then itself
  // encrypted per-epoch so receivers with any active epoch can recover it.
  const oneTimeSecret = opts.oneTimeSecret || randomBytes(32);

  const extraData = concatBytes(magicBytes(MAGIC_CALL_PACKET), headerA, unencryptedPrefix);
  const {output: encryptedPayload, largeMsgId} = await encryptData(payload, oneTimeSecret, extraData);

  // Sign with our Ed25519 private — over (magic2 || large_msg_id), NOT over
  // the encrypted bytes (see notes/call.md gotcha #3).
  const toSign = concatBytes(magicBytes(MAGIC_CALL_PACKET_LARGE_MSG_ID), largeMsgId);
  const signature = opts.privateKey.sign(toSign);

  const encryptedPacket = concatBytes(encryptedPayload, signature);

  // Per-epoch encrypted_header: encrypt the one-time secret with each
  // epoch's group_shared_key. Receiver finds the matching epoch by hash.
  const headerBParts: Uint8Array[] = [];
  for(const epoch of opts.epochs) {
    const enc = await encryptHeader(oneTimeSecret, encryptedPacket, epoch.groupSharedKey);
    if(enc.length !== 32) throw new Error(`encryptHeader produced ${enc.length} bytes, expected 32`);
    headerBParts.push(enc);
  }
  const headerB = concatBytes(...headerBParts);

  // Trailer: 4-byte LE uint32 of unencrypted_prefix length.
  const trailer = int32LeToBytes(opts.unencryptedPrefixLength);

  return concatBytes(unencryptedPrefix, headerA, headerB, encryptedPacket, trailer);
}

// ===== Per-frame decrypt =====

export interface DecryptedPacket {
  // Original unencrypted prefix + decrypted plaintext.
  data: Uint8Array;
  channelId: number;
  seqno: number;
  // Which epoch was used (by hash).
  epochHash: Uint8Array;
}

export interface DecryptPacketOptions {
  // Wire bytes as received from the SFU.
  packet: Uint8Array;
  // Sender's claimed user id — we look up their public key in the matched
  // epoch's group_state to verify the signature.
  fromUserId: bigint;
  // Active epochs we hold. Searched by hash.
  epochs: ActiveEpoch[];
  // For dropping replays. Mutated on successful decrypt.
  replayState?: ReplayState;
}

export class ReplayState {
  // Map keyed by `${publicKeyHex}:${channelId}` → sorted set of recent seqnos.
  private seen: Map<string, number[]> = new Map();

  public checkAndMark(senderPub: PublicKey, channelId: number, seqno: number): void {
    const key = `${pkHex(senderPub)}:${channelId}`;
    const window = this.seen.get(key);
    if(!window || window.length === 0) {
      this.seen.set(key, [seqno]);
      return;
    }
    const oldest = window[0];
    if(seqno < oldest) throw new Error(`replay: seqno ${seqno} older than oldest ${oldest}`);
    if(window.includes(seqno)) throw new Error(`replay: seqno ${seqno} already seen`);
    window.push(seqno);
    window.sort((a, b) => a - b);
    while(window.length > REPLAY_WINDOW_SIZE ||
      (window.length > 0 && window[0] + REPLAY_WINDOW_SIZE < seqno)) {
      window.shift();
    }
  }
}

function pkHex(pk: PublicKey): string {
  let s = '';
  for(let i = 0; i < pk.bytes.length; i++) s += pk.bytes[i].toString(16).padStart(2, '0');
  return s;
}

// ===== High-level Call wrapper =====
//
// Composes the blockchain state, active-epoch table, replay protection, and
// verification chain into a single stateful object that mirrors tdlib's
// `tde2e_core::Call` (~Call.cpp:581-736). Public boundary speaks SERVER wire
// format on both sides — server-to-local conversion happens internally.

// Old epochs remain usable for this long after a new block arrives — covers
// the inter-block transition window where participants haven't all synced.
const FORGET_EPOCH_DELAY_MS = 10_000;

interface EpochCleanupEntry {
  epochHash: Uint8Array;
  forgetAt: number;
}

export class CallError extends Error {
  constructor(public readonly code: CallErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'CallError';
  }
}

export type CallErrorCode =
  | 'CALL_FAILED'
  | 'NOT_PARTICIPANT'
  | 'WRONG_USER_ID'
  | 'NO_SHARED_KEY'
  | 'NO_EPOCHS'
  | 'SEQNO_OVERFLOW'
  | 'SELF_PACKET';

export class E2eCall {
  private status: Error | null = null;
  private state: ClientBlockchainState;
  private epochs: ActiveEpoch[] = [];
  private epochsToForget: EpochCleanupEntry[] = [];
  private seqnoByChannel: Map<number, number> = new Map();
  private readonly replayState = new ReplayState();
  private verification: VerificationChain | undefined;
  private readonly now: () => number;

  private constructor(
    public readonly userId: bigint,
    private readonly privateKey: PrivateKey,
    initialState: ClientBlockchainState,
    now: () => number
  ) {
    this.state = initialState;
    this.now = now;
  }

  // ===== Factories =====

  // Build a signed zero block from scratch. Returns LOCAL-format bytes
  // (magic 0x639a3db6, not server-bumped). Client→server requests carry the
  // local form; server→client `updateGroupCallChainBlocks` deliveries use the
  // +1 server form. Caller (controller/worker) uses these bytes as-is for the
  // `phone.joinGroupCall.block` / `phone.createConferenceCall.block` fields,
  // and applies `serverToLocal` only on chain updates coming back from the
  // server. Confirmed via tdesktop MTP log capture: outbound `block` starts
  // with `B6 3D 9A 63` (local), not `B7 3D 9A 63` (server).
  public static async createZeroBlock(
    privateKey: PrivateKey,
    groupState: GroupState
  ): Promise<Uint8Array> {
    const {changes} = await buildChangesForNewState(groupState);
    const block = await buildBlock(createInitialState(), changes, privateKey);
    return serializeBlock(block);
  }

  // Build a self-add block referencing a server-relayed previous block.
  // Used when joining an existing call: hydrate the prior state from the
  // server's last block, then emit a new block that adds `self` to the group.
  // Returns LOCAL-format bytes (see createZeroBlock).
  public static async createSelfAddBlock(
    privateKey: PrivateKey,
    previousBlockServer: Uint8Array,
    self: GroupParticipant
  ): Promise<Uint8Array> {
    const previousBlock = decodeBlock(new TLReader(serverToLocal(previousBlockServer)));
    const priorState = await hydrateStateFromBlock(previousBlock);

    const remaining = priorState.groupState.participants.filter((p) => p.userId !== self.userId);
    const newGroupState: GroupState = {
      participants: [...remaining, self],
      externalPermissions: priorState.groupState.externalPermissions
    };
    const {changes} = await buildChangesForNewState(newGroupState);
    const block = await buildBlock(priorState, changes, privateKey);
    return serializeBlock(block);
  }

  // Hydrate a Call instance from the server's latest block. The caller must
  // already be a participant in that block's group_state.
  public static async create(
    userId: bigint,
    privateKey: PrivateKey,
    lastBlockServer: Uint8Array,
    now: () => number = () => Date.now()
  ): Promise<E2eCall> {
    const lastBlock = decodeBlock(new TLReader(serverToLocal(lastBlockServer)));
    const state = await hydrateStateFromBlock(lastBlock);

    const participant = state.groupState.participants.find((p) =>
      constantTimeEqual(p.publicKey, privateKey.publicKeyBytes)
    );
    if(!participant) {
      throw new CallError('NOT_PARTICIPANT', 'our public key is not in group_state');
    }
    if(participant.userId !== userId) {
      throw new CallError(
        'WRONG_USER_ID',
        `participant user_id ${participant.userId} != our ${userId}`
      );
    }

    const call = new E2eCall(userId, privateKey, state, now);
    await call.updateGroupSharedKey();
    await call.startVerification();
    return call;
  }

  // ===== State queries =====

  public getHeight(): number {
    this.checkStatus();
    return this.state.height;
  }

  public getGroupState(): GroupState {
    this.checkStatus();
    return this.state.groupState;
  }

  public getLastBlockHash(): Uint8Array {
    this.checkStatus();
    return new Uint8Array(this.state.lastBlockHash);
  }

  public getStatus(): Error | null {
    return this.status;
  }

  // ===== Block ops =====

  // Apply an incoming block (server-format). On failure, fails the call.
  //
  // Idempotency: the server echoes back blocks WE submitted (the chain-update
  // stream is the canonical event source — we initialise from our submitted
  // block to spin up encryption, then the server tells us "here's that block"
  // shortly after). Skip blocks whose hash matches our current chain tip
  // instead of treating the height mismatch as a failure.
  public async applyBlockBytes(serverBlock: Uint8Array): Promise<void> {
    this.checkStatus();
    try {
      const block = decodeBlock(new TLReader(serverToLocal(serverBlock)));
      const blockHash = await computeBlockHash(block);
      if(constantTimeEqual(blockHash, this.state.lastBlockHash)) {
        // We've already integrated this block (it's our chain tip). No-op.
        return;
      }
      this.state = await applyBlock(this.state, block);
      await this.updateGroupSharedKey();
      await this.startVerification();
    } catch(e) {
      this.status = e as Error;
      throw e;
    }
  }

  // Build a LOCAL-format block that swaps the group_state. Caller relays
  // the bytes to the server, which then echoes back to all participants
  // (including us) via applyBlockBytes.
  public async buildChangeStateBlock(newGroupState: GroupState): Promise<Uint8Array> {
    this.checkStatus();
    const {changes} = await buildChangesForNewState(newGroupState);
    const block = await buildBlock(this.state, changes, this.privateKey);
    return serializeBlock(block);
  }

  // ===== Packet ops =====

  public async encrypt(
    channelId: number,
    data: Uint8Array,
    unencryptedPrefixLength: number
  ): Promise<Uint8Array> {
    this.checkStatus();
    this.sync();
    if(this.epochs.length === 0) {
      throw new CallError('NO_EPOCHS', 'no active epochs');
    }
    const prev = this.seqnoByChannel.get(channelId) ?? 0;
    if(prev === 0xffffffff) {
      throw new CallError('SEQNO_OVERFLOW', `seqno overflow on channel ${channelId}`);
    }
    const seqno = prev + 1;
    this.seqnoByChannel.set(channelId, seqno);

    return encryptPacket({
      channelId,
      data,
      unencryptedPrefixLength,
      epochs: this.epochs,
      privateKey: this.privateKey,
      seqno
    });
  }

  public async decrypt(
    fromUserId: bigint,
    channelId: number,
    packet: Uint8Array
  ): Promise<Uint8Array> {
    this.checkStatus();
    this.sync();
    if(fromUserId === this.userId) {
      throw new CallError('SELF_PACKET', 'packet encrypted by us');
    }
    void channelId; // currently informational; sender's channel_id wins
    const decoded = await decryptPacket({
      packet,
      fromUserId,
      epochs: this.epochs,
      replayState: this.replayState
    });
    return decoded.data;
  }

  // ===== Verification ops =====

  public getVerificationState(): VerificationStateSnapshot | undefined {
    this.checkStatus();
    return this.verification?.snapshot();
  }

  // Returns LOCAL-format bytes of any queued emoji broadcasts. Caller relays
  // them as `phone.sendConferenceCallBroadcast.block` (which expects local
  // form — server adds +1 magic only when echoing back via
  // `updateGroupCallChainBlocks`).
  public pullOutbound(): Uint8Array[] {
    if(!this.verification) return [];
    return this.verification.pullOutbound();
  }

  // Accept an inbound emoji broadcast (server-format). Failure is non-fatal
  // (we log + swallow per tdlib semantics).
  public async receiveInbound(serverMessage: Uint8Array): Promise<void> {
    this.checkStatus();
    if(!this.verification) return;
    try {
      const broadcast = decodeGroupBroadcast(new TLReader(serverToLocal(serverMessage)));
      await this.verification.receive(broadcast);
    } catch{
      // Per spec: log + don't fail the call. tdlib logs to its standard log
      // channel; in the browser we drop silently — surfaces via verification
      // state never advancing if the bug is in our own code.
    }
  }

  // ===== Internal =====

  private checkStatus(): void {
    if(this.status) throw this.status;
  }

  private async startVerification(): Promise<void> {
    const participants = this.state.groupState.participants.map((p) => ({
      userId: p.userId,
      publicKey: new PublicKey(p.publicKey)
    }));
    this.verification = await VerificationChain.start(
      this.state.height,
      this.state.lastBlockHash,
      {userId: this.userId, publicKey: new PublicKey(this.privateKey.publicKeyBytes)},
      this.privateKey,
      participants
    );
  }

  // Refresh the shared key after a state change. Adds a new epoch, schedules
  // any previously-active epoch for delayed eviction, and runs sync().
  private async updateGroupSharedKey(): Promise<void> {
    if(!this.state.sharedKey) {
      throw new CallError('NO_SHARED_KEY', 'state has no shared_key after applyBlock');
    }

    if(this.epochs.length > 0) {
      const last = this.epochs[this.epochs.length - 1];
      if(this.state.height > last.height) {
        this.epochsToForget.push({
          epochHash: last.epochHash,
          forgetAt: this.now() + FORGET_EPOCH_DELAY_MS
        });
      }
    }

    // Gate the v1+ HMAC mixing on the group-state version, exactly like tdlib
    // (Call.cpp:727 `if (group_state->version() >= 1)`). Every real call runs
    // at group-state version 0 — official clients build participants with
    // version 0 (e2e_api.cpp), and so do we (groupCallsController) — so the mix
    // must be SKIPPED or our epoch secret diverges from the other clients' and
    // every inbound frame fails its MAC. Hardcoding `true` here was the bug: it
    // was self-consistent for tweb↔tweb (both mixed) but incompatible with the
    // official iOS/Desktop/Android clients (which don't mix at version 0).
    const v1OrLater = groupStateVersion(this.state.groupState) >= 1;
    const groupSharedKey = await deriveGroupSharedKey(
      this.userId,
      this.privateKey,
      this.state.sharedKey,
      this.state.lastBlockHash,
      v1OrLater
    );

    const participantKeys = new Map<string, PublicKey>();
    for(const p of this.state.groupState.participants) {
      participantKeys.set(p.userId.toString(), new PublicKey(p.publicKey));
    }

    this.epochs.push({
      height: this.state.height,
      epochHash: new Uint8Array(this.state.lastBlockHash),
      groupSharedKey,
      participantKeysByUserId: participantKeys
    });

    this.sync();
  }

  // Garbage-collect expired/excess epochs. Called before every encrypt or
  // decrypt (mirrors `CallEncryption::sync` in tdlib).
  private sync(): void {
    const now = this.now();
    while(this.epochsToForget.length > 0 &&
      (this.epochsToForget[0].forgetAt <= now || this.epochs.length > MAX_ACTIVE_EPOCHS)) {
      const {epochHash} = this.epochsToForget.shift()!;
      this.epochs = this.epochs.filter((e) => !constantTimeEqual(e.epochHash, epochHash));
    }
  }
}

// `computeBlockHash` is re-exported so consumers can verify what they got
// back from `createZeroBlock` (e.g. for test assertions).
export {computeBlockHash};

export async function decryptPacket(opts: DecryptPacketOptions): Promise<DecryptedPacket> {
  if(opts.packet.length < 4) throw new Error('decryptPacket: too short');

  // Trailer (last 4 bytes) tells us the unencrypted prefix length.
  const trailerReader = new TLReader(opts.packet.subarray(opts.packet.length - 4));
  const unencryptedPrefixLength = trailerReader.uint32();
  if(unencryptedPrefixLength >= (1 << 16)) {
    throw new Error('decryptPacket: invalid unencrypted prefix length');
  }
  const bodyEnd = opts.packet.length - 4;
  if(unencryptedPrefixLength > bodyEnd) {
    throw new Error('decryptPacket: prefix length exceeds body');
  }

  const unencryptedPrefix = opts.packet.subarray(0, unencryptedPrefixLength);
  const encryptedDataStart = unencryptedPrefixLength;
  const encryptedData = opts.packet.subarray(encryptedDataStart, bodyEnd);

  const r = new TLReader(encryptedData);
  const head = r.uint32();
  const epochsN = head & 0xff;
  const version = (head >>> 8) & 0xff;
  const reserved = head >>> 16;
  if(version !== 0) throw new Error(`decryptPacket: unsupported version ${version}`);
  if(reserved !== 0) throw new Error('decryptPacket: head reserved bits non-zero');
  if(epochsN > MAX_ACTIVE_EPOCHS) throw new Error('decryptPacket: too many epochs');

  const epochHashes: Uint8Array[] = [];
  for(let i = 0; i < epochsN; i++) epochHashes.push(new Uint8Array(r.raw(32)));

  // Everything before header_b (i.e. the head + epoch_hashes) participates
  // in the encrypt_data extra-data.
  const headerA = encryptedData.subarray(0, 4 + epochsN * 32);

  const encryptedHeaders: Uint8Array[] = [];
  for(let i = 0; i < epochsN; i++) encryptedHeaders.push(new Uint8Array(r.raw(32)));

  // encrypted_packet = encrypted_payload || signature (signature = last 64B)
  const remaining = encryptedData.subarray(r.position());
  if(remaining.length < 64) throw new Error('decryptPacket: not enough bytes for signature');
  const encryptedPacket = remaining; // includes signature

  // Find an epoch we know.
  let chosenEpoch: ActiveEpoch | undefined;
  let oneTimeSecret: Uint8Array | undefined;
  for(let i = 0; i < epochsN; i++) {
    const epoch = opts.epochs.find((e) => constantTimeEqual(e.epochHash, epochHashes[i]));
    if(!epoch) continue;
    try {
      oneTimeSecret = await decryptHeader(encryptedHeaders[i], encryptedPacket, epoch.groupSharedKey);
      chosenEpoch = epoch;
      break;
    } catch{
      continue;
    }
  }
  if(!chosenEpoch || !oneTimeSecret) {
    throw new Error('decryptPacket: no matching active epoch');
  }

  // Strip signature, decrypt body.
  const encryptedPayload = encryptedPacket.subarray(0, encryptedPacket.length - 64);
  const signature = encryptedPacket.subarray(encryptedPacket.length - 64);

  const extraData = concatBytes(
    magicBytes(MAGIC_CALL_PACKET),
    headerA,
    unencryptedPrefix
  );
  const {output: payload, largeMsgId} = await decryptData(encryptedPayload, oneTimeSecret, extraData);

  // Verify Ed25519 signature against the sender's public key.
  const senderPub = chosenEpoch.participantKeysByUserId.get(opts.fromUserId.toString());
  if(!senderPub) throw new Error(`decryptPacket: unknown sender user_id ${opts.fromUserId}`);
  const toVerify = concatBytes(magicBytes(MAGIC_CALL_PACKET_LARGE_MSG_ID), largeMsgId);
  if(!ed25519Verify(senderPub.bytes, toVerify, signature)) {
    throw new Error('decryptPacket: signature verification failed');
  }

  // Parse channel_id + seqno + plaintext from the decrypted payload.
  const pr = new TLReader(payload);
  const channelId = pr.int32();
  const seqno = pr.uint32();
  validateChannelId(channelId);
  const plaintext = payload.subarray(pr.position());

  if(opts.replayState) opts.replayState.checkAndMark(senderPub, channelId, seqno);

  return {
    data: concatBytes(unencryptedPrefix, plaintext),
    channelId,
    seqno,
    epochHash: chosenEpoch.epochHash
  };
}
