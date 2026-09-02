import {bigIntFromBytes, bigIntToSigned} from '@helpers/bigInt/bigIntConversion';
import addPadding from '@helpers/bytes/addPadding';
import cryptoWorker from '@lib/crypto/cryptoMessagePort';
import {verifyDhPublicValue} from '@lib/crypto/dhValidation';

export default async function computeDhKey(g_b: Uint8Array, a: Uint8Array, p: Uint8Array) {
  // g_b is the peer public value relayed by the server — reject a degenerate or
  // out-of-range value (0, 1, p-1, …) before it forces the key to a known one.
  verifyDhPublicValue(g_b, p);

  // mod-pow yields the minimal big-endian encoding. Native clients use the
  // shared secret as a fixed 256-byte key (tdesktop mtproto_auth_key.cpp
  // FillData left-pads it), and the fingerprint plus every key-derivation
  // offset in P2PEncryptor assume that width — a secret with a zero top byte
  // (about one call in two hundred) must be padded the same way, or the
  // fingerprint check fails against a native peer.
  const key = addPadding(await cryptoWorker.invokeCrypto('mod-pow', g_b, a, p), 256, true, true, true);
  const keySha1Hashed = await cryptoWorker.invokeCrypto('sha1', key);
  const key_fingerprint = keySha1Hashed.slice(-8).reverse();
  const key_fingerprint_long = bigIntToSigned(bigIntFromBytes(key_fingerprint)).toString(10);

  return {key, key_fingerprint: key_fingerprint_long};
}
