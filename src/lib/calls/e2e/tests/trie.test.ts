/*
 * Trie tests — round-trip serialization, lookup semantics, and the key
 * merkle-pruning property: replacing a subtree with a Pruned stub holding
 * the same hash must NOT change any ancestor's hash.
 */

import {describe, it, expect} from 'vitest';
import {bytesToHex} from '../crypto';
import {BitString} from '../bitString';
import {get, getByKeyBytes, TrieNode, TrieNodeType} from '../trie';

const enc = (s: string) => new TextEncoder().encode(s);

describe('Trie', () => {
  it('empty trie round-trips', async() => {
    const empty = await TrieNode.empty();
    const bytes = empty.serializeForNetwork();
    const parsed = await TrieNode.fetchFromNetwork(bytes);
    expect(parsed.type()).toBe(TrieNodeType.Empty);
    expect(bytesToHex(parsed.hash)).toBe(bytesToHex(empty.hash));
  });

  it('single-leaf trie round-trips and serves get()', async() => {
    const key = new Uint8Array(32);
    key[0] = 0xab;
    const value = enc('hello');
    const leaf = await TrieNode.leaf(BitString.fromBytes(key), value);

    const bytes = leaf.serializeForNetwork();
    const parsed = await TrieNode.fetchFromNetwork(bytes);
    expect(parsed.type()).toBe(TrieNodeType.Leaf);
    expect(bytesToHex(parsed.hash)).toBe(bytesToHex(leaf.hash));

    const got = getByKeyBytes(parsed, key);
    expect(got).toBeDefined();
    expect(bytesToHex(got!)).toBe(bytesToHex(value));

    const wrongKey = new Uint8Array(32);
    expect(getByKeyBytes(parsed, wrongKey)).toBeUndefined();
  });

  it('two-leaf inner trie: both keys retrievable', async() => {
    // Two keys differing only at bit 0 (one starts 0xxxx, the other 1xxxx).
    const keyA = new Uint8Array(32);
    const keyB = new Uint8Array(32);
    keyB[0] = 0x80; // bit 0 set

    const leafA = await TrieNode.leaf(BitString.fromBytes(keyA).substr(1), enc('alpha'));
    const leafB = await TrieNode.leaf(BitString.fromBytes(keyB).substr(1), enc('beta'));
    // Inner with empty prefix, left = 0-branch, right = 1-branch.
    const root = await TrieNode.inner(BitString.empty(), leafA, leafB);

    const bytes = root.serializeForNetwork();
    const parsed = await TrieNode.fetchFromNetwork(bytes);
    expect(bytesToHex(parsed.hash)).toBe(bytesToHex(root.hash));

    expect(bytesToHex(getByKeyBytes(parsed, keyA)!)).toBe(bytesToHex(enc('alpha')));
    expect(bytesToHex(getByKeyBytes(parsed, keyB)!)).toBe(bytesToHex(enc('beta')));
  });

  it('pruned subtree preserves ancestor hash (the merkle property)', async() => {
    const keyA = new Uint8Array(32);
    const keyB = new Uint8Array(32);
    keyB[0] = 0x80;

    const leafA = await TrieNode.leaf(BitString.fromBytes(keyA).substr(1), enc('alpha'));
    const leafB = await TrieNode.leaf(BitString.fromBytes(keyB).substr(1), enc('beta'));
    const root = await TrieNode.inner(BitString.empty(), leafA, leafB);

    // Replace right subtree with a Pruned stub of the same hash.
    const prunedRight = TrieNode.pruned(leafB.hash);
    const prunedRoot = await TrieNode.inner(BitString.empty(), leafA, prunedRight);
    expect(bytesToHex(prunedRoot.hash)).toBe(bytesToHex(root.hash));

    // The pruned tree still serves keyA but throws on keyB (the path was pruned).
    const bytes = prunedRoot.serializeForNetwork();
    const parsed = await TrieNode.fetchFromNetwork(bytes);
    expect(bytesToHex(parsed.hash)).toBe(bytesToHex(root.hash));

    expect(bytesToHex(getByKeyBytes(parsed, keyA)!)).toBe(bytesToHex(enc('alpha')));
    expect(() => getByKeyBytes(parsed, keyB)).toThrow(/pruned/i);
  });

  it('Inner with shared prefix routes lookups correctly', async() => {
    // Keys share the leading 4 bits (0b1010xxxx...), then split at bit 4.
    const keyA = new Uint8Array(32);
    const keyB = new Uint8Array(32);
    keyA[0] = 0b10100000; // 0xA0 — bit 4 = 0
    keyB[0] = 0b10101000; // 0xA8 — bit 4 = 1

    const sharedPrefix = BitString.fromBytes(keyA).substr(0, 4);

    const leafA = await TrieNode.leaf(BitString.fromBytes(keyA).substr(5), enc('a-side'));
    const leafB = await TrieNode.leaf(BitString.fromBytes(keyB).substr(5), enc('b-side'));
    const root = await TrieNode.inner(sharedPrefix, leafA, leafB);

    const bytes = root.serializeForNetwork();
    const parsed = await TrieNode.fetchFromNetwork(bytes);
    expect(bytesToHex(parsed.hash)).toBe(bytesToHex(root.hash));

    expect(bytesToHex(getByKeyBytes(parsed, keyA)!)).toBe(bytesToHex(enc('a-side')));
    expect(bytesToHex(getByKeyBytes(parsed, keyB)!)).toBe(bytesToHex(enc('b-side')));

    // A key NOT matching the prefix is not present.
    const offBranch = new Uint8Array(32);
    offBranch[0] = 0b11000000;
    expect(getByKeyBytes(parsed, offBranch)).toBeUndefined();
  });
});
