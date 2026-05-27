# MessageEncryption Porting Brief

## Overview
This document specifies the exact API and byte-level layout for porting `MessageEncryption` from tdlib's C++ implementation to TypeScript using Web Crypto API and libsodium.js. The C++ code is authoritative; the documentation confirms (with minor notation differences) the algorithms.

---

## Public API Functions

### 1. `encryptData(data: Uint8Array, secret: Uint8Array, additionalData?: Uint8Array): { output: Uint8Array; largeMsgId: Uint8Array }`

**Purpose:** Encrypt plaintext message with random padding.

**Inputs:**
- `data`: Message payload (any size, will be padded to 16-byte boundary)
- `secret`: Shared encryption secret
- `additionalData`: Optional extra data included in HMAC (default: empty)

**Output:**
- `output`: Encrypted data (16 bytes msg_id + encrypted ciphertext)
- `largeMsgId`: 32-byte HMAC-SHA256 digest (save for replay protection)

**Algorithm:**
```
prefix = gen_random_prefix(data.size(), 16)
padded_data = prefix || data
large_secret = kdf_expand(secret, "tde2e_encrypt_data")  // 64 bytes
encrypt_secret = large_secret[0:32]
hmac_secret = large_secret[32:64]
tail = padded_data || additional_data || extra_size_as_int32(additional_data.length)
large_msg_id = HMAC-SHA256(hmac_secret, tail)  // 32 bytes
msg_id = large_msg_id[0:16]
cbc_state = calc_aes_cbc_state_from_hash(HMAC-SHA512(encrypt_secret, msg_id))  // key + IV
encrypted = AES-CBC.encrypt(padded_data, cbc_state)
return { output: msg_id || encrypted, largeMsgId: large_msg_id }
```

**Byte Layout of Output:**
```
[16 bytes msg_id] || [encrypted_data]
```

---

### 2. `decryptData(encryptedData: Uint8Array, secret: Uint8Array, additionalData?: Uint8Array): { output: Uint8Array; largeMsgId: Uint8Array }`

**Purpose:** Decrypt and verify message integrity.

**Inputs:**
- `encryptedData`: Result from `encryptData.output` (must be ≥16 bytes, divisible by 16)
- `secret`: Same shared secret used in encryption
- `additionalData`: Optional extra data (must match encrypt call)

**Output:**
- `output`: Decrypted plaintext (padding removed)
- `largeMsgId`: 32-byte verification hash

**Algorithm:**
```
if (encryptedData.size() < 16 || encryptedData.size() % 16 != 0) error()
msg_id = encryptedData[0:16]
ciphertext = encryptedData[16:]
large_secret = kdf_expand(secret, "tde2e_encrypt_data")
encrypt_secret = large_secret[0:32]
hmac_secret = large_secret[32:64]
cbc_state = calc_aes_cbc_state_from_hash(HMAC-SHA512(encrypt_secret, msg_id))
decrypted = AES-CBC.decrypt(ciphertext, cbc_state)
// Reconstruct tail for verification
tail = decrypted || additional_data || extra_size_as_int32(additional_data.length)
expected_large_msg_id = HMAC-SHA256(hmac_secret, tail)
expected_msg_id = expected_large_msg_id[0:16]
// Constant-time comparison
if (msg_id != expected_msg_id) error()
prefix_size = decrypted[0] as uint8
if (prefix_size > decrypted.size() || prefix_size < 16) error()
return { output: decrypted[prefix_size:], largeMsgId: expected_large_msg_id }
```

**Validation Gotchas:**
- MAC comparison **must be constant-time** (use XOR over all 16 bytes, don't short-circuit)
- `prefix_size` is stored in first byte of decrypted data; must be ≥ MIN_PADDING (16)
- Additional data size stored as **little-endian int32** at end of HMAC input

---

### 3. `encryptHeader(decryptedHeader: Uint8Array, encryptedMessage: Uint8Array, secret: Uint8Array): Uint8Array`

**Purpose:** Encrypt a 32-byte header using msg_id from encrypted message.

**Inputs:**
- `decryptedHeader`: 32-byte plaintext header (must be exactly 32 bytes)
- `encryptedMessage`: Result from `encryptData.output` (extract msg_id from first 16 bytes)
- `secret`: Shared secret

**Output:**
- 32-byte encrypted header

**Algorithm:**
```
if (decryptedHeader.size() != 32) error()
msg_id = encryptedMessage[0:16]
large_key = kdf_expand(secret, "tde2e_encrypt_header")
encryption_key = large_key[0:32]
cbc_state = calc_aes_cbc_state_from_hash(kdf_expand(encryption_key, msg_id))
return AES-CBC.encrypt(decryptedHeader, cbc_state)
```

---

### 4. `decryptHeader(encryptedHeader: Uint8Array, encryptedMessage: Uint8Array, secret: Uint8Array): Uint8Array`

**Purpose:** Decrypt a 32-byte header.

**Inputs:**
- `encryptedHeader`: 32-byte ciphertext (must be exactly 32 bytes)
- `encryptedMessage`: Result from `encryptData.output` (extract msg_id from first 16 bytes)
- `secret`: Shared secret

**Output:**
- 32-byte decrypted header

**Algorithm:**
```
if (encryptedHeader.size() != 32) error()
msg_id = encryptedMessage[0:16]
large_key = kdf_expand(secret, "tde2e_encrypt_header")
encryption_key = large_key[0:32]
cbc_state = calc_aes_cbc_state_from_hash(HMAC-SHA512(encryption_key, msg_id))
return AES-CBC.decrypt(encryptedHeader, cbc_state)
```

**Note:** Line 189 of .cpp uses `hmac_sha512(encryption_key, msg_id)` (not `kdf_expand`), unlike encrypt_header's line 169. Both expand to the same operation, but the decrypt is the source of truth.

---

## Utility Functions

### `kdfExpand(secret: Uint8Array, label: string): Uint8Array`
```
return HMAC-SHA512(secret, label)
```
Returns 64 bytes. Labels are UTF-8 strings: `"tde2e_encrypt_data"`, `"tde2e_encrypt_header"`.

### `calcAesCbcStateFromHash(hash: Uint8Array): { key: Uint8Array; iv: Uint8Array }`
```
if (hash.size() < 48) error()
key = hash[0:32]
iv = hash[32:48]
return { key, iv }
```

### `genRandomPrefix(dataSize: number, minPadding: number): Uint8Array`
```
paddedSize = ((minPadding + 15 + dataSize) & ~15) - dataSize
prefix = random_bytes(paddedSize)
prefix[0] = paddedSize  // First byte stores padding size
return prefix
```
- Generates **random** padding with size encoded in first byte
- MIN_PADDING constant = 16 bytes
- Ensures (prefix.size() + dataSize) % 16 == 0

### `genDeterministicPrefix(dataSize: number, minPadding: number): Uint8Array`
```
paddedSize = ((minPadding + 15 + dataSize) & ~15) - dataSize
prefix = new Uint8Array(paddedSize)  // All zeros
prefix[0] = paddedSize  // First byte stores padding size
return prefix
```
- For testing/deterministic scenarios (not used in main `encryptData`)

### `hmacSha512(key: Uint8Array, message: Uint8Array): Uint8Array`
Returns 64-byte HMAC-SHA512 digest.

### `hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array`
Returns 32-byte HMAC-SHA256 digest.

---

## Critical Implementation Details

### Padding Calculation
The padding size formula:
```
paddedSize = ((MIN_PADDING + 15 + dataSize) & ~15) - dataSize
```
This is equivalent to:
```
roundUp = (MIN_PADDING + 15 + dataSize) rounded up to nearest 16
paddedSize = roundUp - dataSize
```
Result: `(paddedSize + dataSize) % 16 == 0` is guaranteed.

### AES-CBC State Extraction
```
key = hash[0:32]    // 32 bytes for AES-256
iv = hash[32:48]    // 16 bytes
```
Derived from HMAC-SHA512 output (64 bytes); uses first 48 bytes only.

### Extra Data Encoding in HMAC
When computing HMAC-SHA256 for msg_id:
```
tail = plaintext_data || additional_data || int32_le(additional_data.length)
large_msg_id = HMAC-SHA256(hmac_secret, tail)
```
The **int32 is little-endian**. Total additional data contributes to authentication.

### Constant-Time MAC Verification
During decryption, compare msg_id bytes without short-circuiting:
```
int is_mac_bad = 0;
for (i = 0; i < 16; i++) {
  is_mac_bad |= expected_msg_id[i] ^ msg_id[i];
}
if (is_mac_bad != 0) error();
```
This prevents timing attacks on MAC verification.

### Label Format in KDF
Labels are UTF-8 strings passed directly to HMAC:
- `"tde2e_encrypt_data"` (19 chars)
- `"tde2e_encrypt_header"` (20 chars)

No null termination, no length prefix—just the literal string bytes.

---

## Endianness Notes

- **Prefix size byte:** Stored in first byte as unsigned 8-bit (value 16–31 typical)
- **Extra data length:** Stored as **little-endian int32** at tail of HMAC input
- **msg_id & large_msg_id:** Treated as opaque byte sequences; no numeric interpretation
- **AES key/IV:** Byte sequences; no endianness concern

---

## Gotchas and Edge Cases

1. **MIN_PADDING is 16**, not 0. Decryption rejects `prefix_size < 16`.
2. **encryptData always uses random padding** (not deterministic). Use `genDeterministicPrefix` only if explicitly needed elsewhere.
3. **Encrypted message size must be divisible by 16** bytes. Decryption explicitly checks this.
4. **Header encryption uses msg_id from the encrypted message**, not the plaintext. Extract first 16 bytes of encrypted output.
5. **MAC comparison must be constant-time** to prevent timing leaks.
6. **Additional data participates in HMAC** but is not included in ciphertext. Sender and receiver must agree on its value.
7. **Large msg_id (32 bytes) should be saved for replay protection** at higher protocol layers. The 16-byte msg_id is deterministic; the 32-byte digest is the full MAC.

---

## Functions to Implement

| Function | Purpose | Returns |
|----------|---------|---------|
| `encryptData` | Public: encrypt with random padding | `{ output, largeMsgId }` |
| `decryptData` | Public: decrypt and verify | `{ output, largeMsgId }` |
| `encryptHeader` | Public: encrypt 32-byte header | 32-byte ciphertext |
| `decryptHeader` | Public: decrypt 32-byte header | 32-byte plaintext |
| `kdfExpand` | Utility: HMAC-SHA512(secret, label) | 64 bytes |
| `calcAesCbcStateFromHash` | Utility: extract key + IV | `{ key, iv }` |
| `genRandomPrefix` | Utility: random padding | Uint8Array |
| `genDeterministicPrefix` | Utility: zero-filled padding | Uint8Array |
| `hmacSha512` | Utility: HMAC-SHA512 | 64 bytes |
| `hmacSha256` | Utility: HMAC-SHA256 | 32 bytes |
