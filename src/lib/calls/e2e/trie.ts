/*
 * TdE2E Trie — port of tdlib/tde2e/td/e2e/Trie.{cpp,h}, client read-only scope.
 *
 * The trie is a binary Patricia merkle trie indexed by 256-bit keys. The
 * client never mutates it (no `set()`); it receives PRUNED trees from the
 * server via `fetch_from_network`, verifies the root hash against the
 * blockchain state proof, then performs `get()` lookups.
 *
 * Two wire formats per node:
 *  - "for network": full tree (recursive) used when shipping pruned proofs.
 *  - "for hash":    each node hashes itself using its children's HASHES (not
 *                   their subtrees). This is what makes Pruned nodes work —
 *                   a Pruned stub with the right hash is indistinguishable
 *                   from the expanded subtree it stands in for.
 */

import {sha256} from './crypto';
import {BitString} from './bitString';
import {TLReader, TLWriter} from './tl';

export enum TrieNodeType {
  Empty = 0,
  Leaf = 1,
  Inner = 2,
  Pruned = 3
}

export type TrieNodeData =
  | {type: TrieNodeType.Empty}
  | {type: TrieNodeType.Leaf; keySuffix: BitString; value: Uint8Array}
  | {type: TrieNodeType.Inner; prefix: BitString; left: TrieNode; right: TrieNode}
  | {type: TrieNodeType.Pruned};

export class TrieNode {
  // 32-byte SHA-256 of the "for hash" serialization of this node (or
  // verbatim from wire if Pruned).
  readonly hash: Uint8Array;
  readonly data: TrieNodeData;

  private constructor(hash: Uint8Array, data: TrieNodeData) {
    if(hash.length !== 32) throw new Error(`TrieNode: hash must be 32 bytes, got ${hash.length}`);
    this.hash = hash;
    this.data = data;
  }

  public type(): TrieNodeType {
    return this.data.type;
  }

  // ===== Factories =====

  public static async empty(): Promise<TrieNode> {
    return new TrieNode(await computeHash({type: TrieNodeType.Empty}), {type: TrieNodeType.Empty});
  }

  public static async leaf(keySuffix: BitString, value: Uint8Array): Promise<TrieNode> {
    const data: TrieNodeData = {type: TrieNodeType.Leaf, keySuffix, value};
    return new TrieNode(await computeHash(data), data);
  }

  public static async inner(prefix: BitString, left: TrieNode, right: TrieNode): Promise<TrieNode> {
    const data: TrieNodeData = {type: TrieNodeType.Inner, prefix, left, right};
    return new TrieNode(await computeHash(data), data);
  }

  public static pruned(hash: Uint8Array): TrieNode {
    return new TrieNode(new Uint8Array(hash), {type: TrieNodeType.Pruned});
  }

  // ===== Wire format (network) =====

  // Recursively deserialize a (possibly pruned) tree.
  public static async fetchFromNetwork(data: Uint8Array): Promise<TrieNode> {
    const reader = new TLReader(data);
    const node = await parseNetwork(reader);
    if(!reader.eof()) {
      throw new Error(`TrieNode.fetchFromNetwork: trailing bytes (${reader.remaining()})`);
    }
    return node;
  }

  public storeNetwork(writer: TLWriter): void {
    writer.int32(this.data.type);
    if(this.data.type === TrieNodeType.Leaf) {
      this.data.keySuffix.store(writer);
      writer.bytes(this.data.value);
    } else if(this.data.type === TrieNodeType.Inner) {
      this.data.prefix.store(writer);
      this.data.left.storeNetwork(writer);
      this.data.right.storeNetwork(writer);
    } else if(this.data.type === TrieNodeType.Pruned) {
      writer.raw(this.hash);
    }
    // Empty: type byte only
  }

  public serializeForNetwork(): Uint8Array {
    const writer = new TLWriter();
    this.storeNetwork(writer);
    return writer.finish();
  }
}

async function parseNetwork(reader: TLReader): Promise<TrieNode> {
  const type = reader.int32() as TrieNodeType;
  if(type === TrieNodeType.Empty) {
    return TrieNode.empty();
  }
  if(type === TrieNodeType.Leaf) {
    const keySuffix = BitString.parse(reader);
    const value = reader.bytes();
    // Copy: bytes() returns a subarray view of the reader buffer.
    return TrieNode.leaf(keySuffix, new Uint8Array(value));
  }
  if(type === TrieNodeType.Inner) {
    const prefix = BitString.parse(reader);
    const left = await parseNetwork(reader);
    const right = await parseNetwork(reader);
    return TrieNode.inner(prefix, left, right);
  }
  if(type === TrieNodeType.Pruned) {
    return TrieNode.pruned(reader.int256());
  }
  throw new Error(`TrieNode.fetchFromNetwork: unknown type ${type}`);
}

// "Hash" serialization — inner nodes substitute children for their hashes.
// SHA-256 of this byte sequence == node.hash.
async function computeHash(data: TrieNodeData): Promise<Uint8Array> {
  const writer = new TLWriter();
  writer.int32(data.type);
  if(data.type === TrieNodeType.Leaf) {
    data.keySuffix.store(writer);
    writer.bytes(data.value);
  } else if(data.type === TrieNodeType.Inner) {
    data.prefix.store(writer);
    writer.raw(data.left.hash);
    writer.raw(data.right.hash);
  } else if(data.type === TrieNodeType.Pruned) {
    // Should never happen — Pruned nodes copy their hash verbatim from the
    // wire and never recompute via this path.
    throw new Error('computeHash: Pruned node has no canonical hash input');
  }
  // Empty hashes just the type bytes.
  return sha256(writer.finish());
}

// ===== Lookup =====
//
// Returns the leaf value for `key`, or `undefined` if not present.
// Throws if the lookup hits a Pruned node (client can't expand them — server
// should have included the path in the proof).

export function get(node: TrieNode, key: BitString): Uint8Array | undefined {
  const d = node.data;
  if(d.type === TrieNodeType.Pruned) {
    throw new Error('get: encountered pruned node — proof does not cover this key');
  }
  if(d.type === TrieNodeType.Empty) return undefined;

  if(d.type === TrieNodeType.Leaf) {
    return d.keySuffix.equals(key) ? d.value : undefined;
  }

  // Inner: the prefix must equal the first prefix.bitLength() bits of key,
  // then the next bit selects left (0) / right (1).
  const prefixLen = d.prefix.bitLength();
  if(key.bitLength() < prefixLen) return undefined;
  if(!d.prefix.equals(key.substr(0, prefixLen))) return undefined;

  if(key.bitLength() === prefixLen) return undefined;

  const branch = key.getBit(prefixLen);
  const next = branch === 0 ? d.left : d.right;
  return get(next, key.substr(prefixLen + 1));
}

// Convenience wrapper for byte-array keys (treated as 256-bit big-endian).
export function getByKeyBytes(node: TrieNode, key: Uint8Array): Uint8Array | undefined {
  return get(node, BitString.fromBytes(key));
}
