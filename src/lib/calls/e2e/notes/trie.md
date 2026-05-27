# Trie & BitString Porting Brief

## Scope Decision: CLIENT IS READ-ONLY FROM PRUNED TREES

**Critical finding:** The client **never calls `set(...)` on the trie**. Client usage is strictly:
- `fetch_from_network(proof)` — deserialize pruned tree received from server
- `get(key)` — read values from the pruned tree
- Hash verification — check that deserialized tree hash matches expected value

The server-side operations (`set()`, full trie management, `serialize_for_snapshot()`) are **out of scope** for the client port. This drastically reduces complexity.

### Client Usage (from Blockchain.cpp)
```cpp
// Line 250: Generate proof (server-side, client receives it)
TRY_RESULT(pruned_tree, generate_pruned_tree(node_, keys, snapshot_.value()));
return TrieNode::serialize_for_network(pruned_tree);  // Server sends this

// Line 797: Client receives and deserializes
TRY_RESULT(state, TrieNode::fetch_from_network(proof));

// Client merges received tree into local state
blockchain_.state_.key_value_state_.node_ = state;
```

The client never writes to the trie; it only receives pruned trees from the server and reads values.

---

## 1. Data Structure & Merkle Hashing

### TrieNode Types (4 variants)

1. **Empty**: Null node (hash = SHA256 of type byte)
2. **Leaf**: Terminal node with key suffix and value
   - Fields: `key_suffix: BitString`, `value: string`
3. **Inner**: Branch node with common prefix and left/right children
   - Fields: `prefix: BitString`, `left: TrieRef`, `right: TrieRef`
4. **Pruned**: Stub node (hash-only, used in partial trees)
   - Fields: `hash: UInt256`, `offset: int64` (for snapshot loading), `base_bit_string: BitString`

### Hash Computation (Merkle)

Hash is **SHA256** computed over a deterministic serialization:

```
store_for_hash(node):
  if type == Leaf:
    store(type)                    // 1 byte: TrieNodeType::Leaf (2)
    store(key_suffix)              // BitString
    store(value)                   // string
  if type == Inner:
    store(type)                    // 1 byte: TrieNodeType::Inner (3)
    store(prefix)                  // BitString
    store(left->hash)              // UInt256 (32 bytes)
    store(right->hash)             // UInt256 (32 bytes)
  if type == Empty:
    store(type)                    // 1 byte: TrieNodeType::Empty (0)
```

**Key insight:** Inner nodes hash their children's **hashes**, not the children themselves. This enables pruning — the client can verify the tree's integrity without having the full tree.

---

## 2. BitString — Bit-Level Manipulation

BitString is a compact, bit-addressable byte array with views/slices.

### Structure
```cpp
data_: shared_ptr<char>    // Backing buffer (shared ownership)
bits_size_: size_t         // Total bits in this view
bytes_size_: int32         // Full bytes in middle (may be -1 if single byte)
begin_bit_: uint8          // Start bit offset in first byte (0-7)
end_bit_: uint8            // End bit offset in last byte (0-7)
```

### Operations Used by Client

1. **`get_bit(pos) -> uint8`** — Read bit at position (big-endian bit order)
2. **`common_prefix_length(other) -> size_t`** — Count matching prefix bits (optimized with byte-by-byte comparison)
3. **`substr(pos, length) -> BitString`** — Create a view into a subsection (shallow copy, shared buffer)
4. **`operator==(other) -> bool`** — Full bit-by-bit comparison
5. **`bit_length() -> size_t`** — Total bits in this BitString

**Client never uses:** Construction from raw data (except during deserialization). No mutation methods.

### Serialization Format (TL)

```cpp
store(bs):
  store(uint32):  (begin_bit << 16) | (begin_bit + bit_length)
  // Then store masked bytes covering [begin_bit, end_bit)
  if single_byte (bytes_size == -1):
    store_binary(byte & create_mask(begin_bit, end_bit))
  else:
    if begin_bit != 0:
      store_binary(first_byte & begin_mask(begin_bit))
    store_slice(middle_bytes)
    if end_bit != 0:
      store_binary(last_byte & end_mask(end_bit))
  // Pad to 4-byte alignment with zeros
```

The format encodes the bit range and masks out irrelevant bits. Deserialization uses the bit range to recreate the correct view.

---

## 3. Operations Actually Called by Client

**Only these three operations are used on the client side:**

### `TrieNode::fetch_from_network(data: Slice) -> TrieRef`

Deserializes a pruned tree from the network wire format. This is the **main entry point**.

**Wire format:**
```
parse_from_network(parser, BitString(256)):  // 256-bit context for key paths
  type = fetch(TrieNodeType)
  if type == Leaf:
    key_suffix = fetch_bit_string(parser)
    value = fetch(string)
    create Leaf node
  if type == Inner:
    prefix = fetch_bit_string(parser)
    left = recursively parse_from_network
    right = recursively parse_from_network
    create Inner node
  if type == Pruned:
    hash = fetch(UInt256)
    create Pruned node (hash-only)
  if type == Empty:
    return empty_node()
```

**Processing:** Depth-first recursive descent. BitString context is maintained for relative bit range encoding (the 256-bit context is the full key space; prefixes/suffixes are ranges within it).

### `get(trie: TrieRef, key: BitString, snapshot?: Slice) -> string`

Traverse the trie to retrieve a value.

```
get(node, key):
  if type == Pruned:
    error: cannot get from pruned node (snapshot required, not used in client)
  if type == Empty:
    return ""
  if type == Leaf:
    if key == leaf.key_suffix: return leaf.value
    else: return ""
  if type == Inner:
    if key doesn't match prefix: return ""
    extract bit at prefix.bit_length() to choose left (0) or right (1)
    recurse into chosen child with key.substr(prefix.bit_length() + 1)
```

**Client usage:** Only called after `fetch_from_network()`, so no Pruned nodes are encountered.

### Hash Verification (implicit)

After `fetch_from_network()`, the client compares the tree's root hash:
```cpp
if (state->hash != expected_kv_hash)
  return Error("Invalid proof")
```

The hash is automatically computed by the TrieNode constructor during deserialization.

---

## 4. Serialization Format: `serialize_for_network`

**This is what the server sends over the wire; the client deserializes it.**

```cpp
store_for_network(node):
  store(type)                  // TrieNodeType (1 byte)
  if type == Leaf:
    store(key_suffix)          // BitString (with serialization format above)
    store(value)               // string (4-byte length prefix + data)
  if type == Inner:
    store(prefix)              // BitString
    store_for_network(*left)   // Recursive
    store_for_network(*right)  // Recursive
  if type == Pruned:
    store(hash)                // UInt256 (32 bytes)
  if type == Empty:
    // Nothing (just the type byte)
```

This is used by both server (to generate proofs) and client (to deserialize them). It's **not** the same as the snapshot format (which is server-only internal persistence).

---

## 5. Pruned Tree Semantics

A pruned tree is a partial trie where:
- **Nodes on paths to requested keys** are fully expanded (Leaf or Inner)
- **Other subtrees** are replaced with Pruned nodes (hash-only stubs)
- All hashes are correct (the Pruned nodes' hashes match what a full expansion would produce)

This lets the client:
1. **Read any requested key** from the full path
2. **Verify integrity** without receiving the full tree
3. **Merge proofs** — the server sends only the changed keys, and the client can merge the pruned tree by replacing the old tree's root with the new one

**Client-side merge (from Blockchain.cpp line 797-800):**
```cpp
TRY_RESULT(state, TrieNode::fetch_from_network(proof));
if (state->hash != blockchain_.state_.key_value_state_.get_hash())
  return Error("Invalid proof");
blockchain_.state_.key_value_state_.node_ = state;
```

The client simply replaces its root with the deserialized tree. If hashes match, the merge is valid.

---

## 6. Hash Function & Granularity

- **Algorithm:** SHA256 (via tdlib's `sha256()` function)
- **Granularity:** Per-node (each Inner/Leaf/Empty gets its own hash)
- **Data hashed:** The TL-serialized node (type + fields), not including Pruned nodes' hashes
- **Input to hash:** Pre-calculated TL serialization length, then unsafe storer to buffer, then SHA256

```cpp
compute_hash():
  calc_length = TlStorerCalcLength()
  store_for_hash(this, calc_length)
  buf = allocate(calc_length.get_length())
  storer = TlStorerUnsafe(buf)
  store_for_hash(this, storer)
  return sha256(buf)
```

---

## Server-Side Scope (DO NOT PORT)

The following are **server-only** and should be skipped:
- `set(trie, key, value, snapshot)` — Trie mutation (server builds blocks)
- `generate_pruned_tree(trie, keys, snapshot)` — Proof generation (server creates)
- `serialize_for_snapshot(...)` / `fetch_from_snapshot(...)` — Persistent storage format (server persistence)
- `try_load(snapshot)` — Lazy loading from snapshot (server-side optimization)

---

## TypeScript Port: Minimal Scope

For the client (tweb):

1. **BitString class**
   - Constructor from Slice (byte array)
   - Methods: `get_bit()`, `bit_length()`, `common_prefix_length()`, `substr()`, `operator==`
   - Serialization: `store()` template specialization for TL (byte-packing with bit masks)
   - Deserialization: `fetch_bit_string()` — inverse of `store()`

2. **TrieNode class**
   - Fields: `hash: UInt256`, `data: Empty | Leaf | Inner | Pruned`
   - Constructor: Accept a hash (for creating Pruned nodes from deserialization)
   - Methods: `get_type()`, `get_leaf()`, `get_inner()`, `get_pruned()`
   - **Main entry:** `static fetch_from_network(data: Slice): TrieRef` — deserializes a pruned tree
   - **Helper:** `compute_hash()` — SHA256 of the node's TL serialization
   - Utility: `get(trie, key, snapshot?)` — traverse and read

3. **TL Serialization (for BitString and TrieNode)**
   - Custom `store()` and `parse()` routines following tdlib's TL storer/parser pattern
   - For BitString: bit-level packing with byte masks and 4-byte padding
   - For TrieNode: recursive encoding of tree structure, hashes for Pruned nodes

---

## Gotchas & Subtle Points

1. **BitString bit order is big-endian** — bit 0 is the MSB of the first byte. Verify bit indexing matches `(data[byte_index] >> bit_index) & 1` where `bit_index = 7 - (absolute_pos % 8)`.

2. **Pruned nodes store only the hash** — They are deserialized but never expanded on the client. They're only useful for verification; the client never reads through them.

3. **BitString views are shallow** — A `substr()` creates a new BitString with a shared buffer. Modification is not possible (no setters), so this is safe.

4. **TL serialization padding** — BitStrings are padded to 4-byte boundaries after bit data. Account for this in the parser.

5. **Key paths use 256-bit context** — Keys are always 32 bytes (256 bits) in this system. The BitString context passed to `parse_from_network()` is the full 256-bit space, and relative bit ranges within it define prefixes/suffixes.

6. **Hash verification is mandatory** — Always compare the tree's root hash against the expected KV hash from the block's state proof. This is the client's only way to verify the proof's integrity.

