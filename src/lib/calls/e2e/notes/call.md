# Call State Machine & Protocol Flow

TypeScript reimplementation guide for `tde2e_core::Call`, `CallEncryption`, `CallVerification`, and `CallVerificationChain`.

## 1. Call State Machine

### Call (Root Coordinator)
Holds:
- `user_id: bigint` — calling participant's Telegram ID
- `private_key: PrivateKey` — long-lived ECDH private key (generated at call join)
- `blockchain_: ClientBlockchain` — local copy of blockchain with group participants & shared keys
- `call_encryption_: CallEncryption` — per-epoch packet encryption/decryption
- `call_verification_: CallVerification` — emoji commit-reveal orchestration
- `group_shared_key_: SecureString` — derived from latest block's encrypted shared key
- `status_: Status` — call failure flag (once set, all operations reject)

**Lifecycle:**
1. `Call.create(user_id, private_key, last_block_server)` — hydrate from server's latest block
2. On each new server block: `apply_block(block_server)` → deserialize, validate, apply to blockchain, regenerate `group_shared_key_`, sync encryption epochs
3. On call failure (group state invalid, key decryption fails, signature mismatch): set `status_`, all queries return error

### ClientBlockchain (Blockchain)
Tracks:
- Participant list (user_id → PublicKey)
- Group shared key (encrypted per-participant via ECDH)
- Block height & hash chain (for verification words & emoji hash)
- Version counter (v0 vs v1 → affects group_shared_key_ derivation)

### CallEncryption (Packet Layer)
Tracks per-epoch:
- `epochs_: Map<epoch_id, EpochInfo>` — (epoch_hash → one_time_secret generation parameters)
  - `EpochInfo.epoch_` — block height (used as epoch ID)
  - `EpochInfo.epoch_hash_` — block hash (used as epoch selector in headers)
  - `EpochInfo.secret_` — group shared key for this epoch
  - `EpochInfo.group_state_` — cached participant public keys
- `seqno_: Map<channel_id, uint32>` — incremental counter per channel, validates no replay
- `seen_: Map<(PublicKey, channel_id), Set<seqno>>` — detects replayed packets (keep last 1024)
- `epochs_to_forget_: Queue<(Timestamp, epoch_id)>` — scheduled cleanup (10s delay)

**Constraint:** MAX_ACTIVE_EPOCHS = 15 — if exceeded, oldest queued epochs are flushed immediately.

### CallVerification & CallVerificationChain (Emoji Layer)
Tracks three states:
- **Commit** (initial on new block) — wait for all participants to send `groupBroadcastNonceCommit` with nonce_hash
- **Reveal** (when all commits received) — wait for all to send `groupBroadcastNonceReveal` with nonce plaintext
- **End** (when all reveals received) — compute final emoji_hash and display

State held:
- `height_: int32` — blockchain height when commit phase started
- `last_block_hash_: UInt256` — blockchain hash (used for emoji_hash)
- `state_: Commit | Reveal | End`
- `committed_: Map<user_id, nonce_hash_bytes>` — received hashes
- `revealed_: Map<user_id, nonce_bytes>` — received plaintexts (verified against committed hashes)
- `participant_keys_: Map<user_id, PublicKey>` — from blockchain state
- `users_: Map<user_id, UserState>` — track when each participant sent commit/reveal (for logging)

**Important:** Delayed broadcasts queue — if a broadcast arrives for a future block height (clock skew), buffer it and apply once that block is received.

---

## 2. Per-Frame Encrypt Flow (`call_encrypt`)

### Active Epochs Concept
- **Epoch:** one blockchain block = one shared key. Indexed by block hash, stored by block height.
- **When new epoch starts:** On every `apply_block()`, a new blockchain height → new epoch. Old epochs are scheduled for forgetfulness at T+10s.
- **Validity window:** An epoch remains active in `epochs_` until:
  - 10 seconds have elapsed since `forget_shared_key()` was called, OR
  - More than 15 epochs are active (FIFO eviction of oldest)
- **Multi-epoch packets:** A sender can use multiple active epochs (e.g., if recent blocks arrived in quick succession). Receiver loops through offered epoch hashes to find a match.

### Packet Layout
```
unencrypted_prefix (variable)
  || header_a (4 + 32*N bytes)
  || header_b (32*N bytes)
  || encrypted_payload (variable)
  || signature (64 bytes)
  || trailer (4 bytes)
```

**Header A:** epoch enumeration & hashes
```c
int32: N (number of active epochs)
[for each active epoch i]:
  UInt256: epoch_hash_[i]
```

**Header B:** encrypted one-time keys (32 bytes each)
```c
[for each active epoch i]:
  32 bytes: AES-CBC(one_time_key, epoch.secret_, msg_id)
```

**Encryption Steps:**

1. **Unencrypted prefix**: First N bytes of plaintext (e.g., RTP header). Caller specifies `unencrypted_prefix_size`. Not encrypted, part of MAC input.

2. **One-time key**: Random 32 bytes. Unique per packet. Used to derive packet encryption key via KDF.

3. **Build payload**:
   ```
   payload = channel_id (4) || seqno (4) || data
   ```

4. **Pad payload**: PKCS7-like — if size % 16 != 0, pad to 16-byte boundary. Padding byte[0] = padding length.

5. **Encrypt payload** with `one_time_key`:
   ```
   encrypted, large_msg_id = encrypt_data(
     payload,
     one_time_key,
     magic1 || header_a || unencrypted_prefix
   )
   ```
   - `magic1` = TL type ID for `e2e.callPacket`
   - `large_msg_id` = HMAC-SHA256 output (16 bytes used, full 32 available for signing)

6. **Seqno derivation**: Incremented per (channel_id) pair. Sender tracks in `seqno_[channel_id]`. Receiver checks via `check_not_seen()` — must not be in recent set, must not be older than oldest-tracked seqno.

7. **Sign**: Over `magic2 || large_msg_id` (magic2 = TL ID for `e2e.callPacketLargeMsgId`):
   ```
   signature = Ed25519_sign(to_sign, private_key)  // 64 bytes
   ```

8. **Encrypt one-time key** for each active epoch (via shared secret):
   ```
   [for each epoch i]:
     encrypted_key[i] = encrypt_header(
       one_time_key,
       encrypted_payload,
       epoch.secret_
     )  // 32 bytes each
   ```

9. **Assemble** and send to network.

---

## 3. Per-Frame Decrypt Flow (`call_decrypt`)

1. **Parse header**: Last 4 bytes = `unencrypted_prefix_size`. Remove it.

2. **Parse header A** (from encrypted data):
   ```
   uint32 head = fetch_int32()
   int epochs_n = head & 0xff
   int version = (head >> 8) & 0xff  // must be 0
   int reserved = head >> 16  // must be 0
   [for i in 0..epochs_n-1]:
     UInt256 epoch_hash[i] = parse()
   ```

3. **Mark end of header A**: All bytes consumed so far = unencrypted_header.

4. **Parse encrypted headers B**:
   ```
   [for i in 0..epochs_n-1]:
     encrypted_header[i] = fetch_raw(32)
   ```

5. **Extract encrypted payload & signature**:
   ```
   encrypted_packet = remaining bytes
   (separate last 64 bytes as signature)
   ```

6. **Loop through offered epochs** to find one we know:
   ```
   for (i in 0..epochs_n-1):
     epoch_hash = epoch_hashes[i]
     if (epoch_by_hash_.has(epoch_hash)):
       epoch_info = epochs_[epoch_by_hash_[epoch_hash]]
       one_time_secret = decrypt_header(
         encrypted_header[i],
         encrypted_packet,
         epoch_info.secret_
       )  // 32 bytes
       [Try decryption with this secret]
   ```
   - If all epochs fail: return `Decrypt_UnknownEpoch`

7. **Decrypt payload** once we have `one_time_secret`:
   ```
   payload = decrypt_data(
     encrypted_packet,
     one_time_secret,
     magic1 || unencrypted_header || unencrypted_prefix,
     &large_msg_id
   )
   ```

8. **Verify signature**:
   ```
   participant = group_state.get_participant(expected_user_id)
   to_verify = magic2 || large_msg_id
   participant.public_key.verify(to_verify, signature)
   ```

9. **Extract channel_id & seqno** from payload:
   ```
   TlParser(payload)
   channel_id = parse_int32()
   seqno = parse_uint32()
   data = rest
   ```

10. **Replay check**: `check_not_seen(participant.public_key, channel_id, seqno)` — rejects if duplicate or older than sliding window (last 1024 unique seqno).

11. **Return** `unencrypted_prefix || data`.

---

## 4. Emoji Commit-Reveal Protocol

### Phases
1. **Commit** — Started automatically by `CallVerification.on_new_main_block()` when blockchain advances.
   - Local action: Generate random 32-byte nonce, compute `nonce_hash = SHA256(nonce)`.
   - Broadcast: Create `groupBroadcastNonceCommit` (signed), add to `pending_outbound_messages_`.

2. **Receive commits** — Participants' `groupBroadcastNonceCommit` arrive via `receive_inbound_message()`.
   - `CallVerificationChain.try_apply_block()` → `process_broadcast()` → `process_broadcast(groupBroadcastNonceCommit)`
   - Verify sender is in participant list.
   - Verify signature (unless `may_skip_signatures_validation_` for testing).
   - Store in `committed_[user_id]`.
   - Once `committed_.size() == participant_keys_.size()`, transition to **Reveal**.

3. **Reveal** — After all commits received, send plaintext nonce.
   - Local action: Check `CallVerificationChain.state_ == Reveal`, then send `groupBroadcastNonceReveal`.
   - Broadcast: Add to `pending_outbound_messages_`.

4. **Receive reveals** — Participants' `groupBroadcastNonceReveal` arrive.
   - `process_broadcast(groupBroadcastNonceReveal)`:
     - Verify `state_ == Reveal`.
     - Verify `SHA256(nonce_reveal.nonce_) == committed_[user_id]`.
     - Store in `revealed_[user_id]`.
     - Once `revealed_.size() == participant_keys_.size()`, compute emoji_hash and transition to **End**.

### Emoji Hash Computation
```
sorted_nonces = sort(revealed_.values() by lexicographic byte order)
concat = concatenate(sorted_nonces)
emoji_hash = HMAC-SHA512(concat, blockchain_hash)
```
- **Sorting:** By raw bytes (lexicographic), **not** by user_id order.
- Result: 64 bytes, first 32 displayed as emojis (or 64 for extended set).

### Broadcast Structure (TL)
```
groupBroadcastNonceCommit {
  signature: int512 (64 bytes, Ed25519 signature)
  user_id: int64
  chain_height: int32
  chain_hash: int256 (UInt256)
  nonce_hash: int256 (UInt256)
}
```
```
groupBroadcastNonceReveal {
  signature: int512
  user_id: int64
  chain_height: int32
  chain_hash: int256
  nonce: int256 (UInt256)
}
```

Signature computed over the TL serialization with `signature = 0`.

### Blockchain Integration
- **Block hash** used in emoji_hash must be the block at which Commit phase started.
- **Delayed broadcasts:** If a broadcast's `chain_height` is in the future, queue it in `delayed_broadcasts_[height]` and apply when that block is received.
- **Height validation:** Must match current `height_` (commit started at this height).

---

## 5. `call_pull_outbound_messages()`

Returns a vector of **serialized TL objects** to transmit to the server:

- **From CallVerification:**
  - `groupBroadcastNonceCommit` (once, when new block arrives → on_new_main_block)
  - `groupBroadcastNonceReveal` (once, when all commits received → state == Reveal)

**Behavior:**
- Append message to `pending_outbound_messages_`.
- On `pull_outbound_messages()`, swap out the vector and return it.
- Server broadcasts to all participants & returns the same messages to everyone (including sender).

---

## 6. `call_receive_inbound_message()`

**Input:** Serialized `e2e.e2e_chain.GroupBroadcast` (one of: `groupBroadcastNonceCommit`, `groupBroadcastNonceReveal`).

**Steps:**
1. Deserialize from TL.
2. Convert from server format to local format (if needed).
3. Call `CallVerificationChain.try_apply_block(message)`.
4. If state transitioned to Reveal → auto-send reveal message via `pending_outbound_messages_`.

**Errors:** Logged but do **not** fail the call. Errors include:
- Unknown user_id (not a participant).
- Duplicate commit/reveal from same user.
- Hash mismatch (reveal nonce doesn't match committed hash).
- Out-of-order height (delayed handling).

---

## 7. Error & Failure Handling

### Call Failure Triggers
- `CallFailed` — Any fatal status set in `status_`.
- Examples:
  - Group state missing self (user_id not in blockchain).
  - Group state user_id mismatch (public key says different user).
  - Shared key decryption fails (ECDH or AES-CBC error).
  - Encryption/decryption without active epochs.

### Error Propagation
- All public methods check `get_status()` first. If error, return it immediately.
- Block application: on error, set `status_` and log, but don't crash the call object.
- Emoji layer: errors in `process_broadcast()` are logged, not propagated (call continues).

### Graceful Degradation
- If group_shared_key decryption fails → participant must exit immediately (cannot participate in emoji or encryption).
- If seqno overflows (2^32 - 1) → reject further packets on that channel.
- Packet replay → silently dropped (not logged, just rejected).

---

## Key Correctness Gotchas

1. **Seqno global or per-channel?** Per-channel (channel_id in payload). Each channel has independent counter.

2. **One-time key generation:** Must be random per packet, not per epoch. Sender generates fresh, receiver decrypts from encrypted_header.

3. **Signature over what exactly?** Over `magic2 || large_msg_id`, NOT over the encrypted packet or signature itself.

4. **Epoch lifecycle:** Old epoch remains valid for 10s even after new block arrives. Receiver may receive packets from multiple recent epochs. Don't discard old epochs immediately.

5. **Emoji sorting:** By **raw bytes**, not user_id. Use standard lexicographic comparison.

6. **Group shared key derivation (v1+):** `group_shared_key = HMAC-SHA512(decrypted_key, block_hash)[0:32]`. Version field in blockchain state determines whether to apply HMAC.

7. **Delayed broadcasts:** Must queue messages from future blocks until those blocks arrive. Critical for clock-skew resilience.

8. **Signature verification:** Must fetch participant's public key from blockchain **at the time the broadcast arrived**, not current state.

9. **Replay window:** Keep last 1024 seqno values per (PublicKey, channel_id). Older packets are rejected as "too old."

10. **Max epochs limit:** At 15 active epochs, new epochs trigger immediate old-epoch cleanup, not lazy forgetting.
