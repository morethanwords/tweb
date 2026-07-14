// Constant-time byte comparison.
//
// Unlike bytesCmp, this never short-circuits on the first differing byte, so
// its running time does not depend on how many leading bytes matched. Use it
// for integrity/MAC checks (e.g. the MTProto msg_key) where an early return
// would leak the prefix-match length of a secret-derived value. Matches the
// constant-time compares already used on the call paths (p2PEncryptor
// constTimeIsDifferent, calls/e2e/crypto constantTimeEqual) and in the
// reference clients (TDLib, iOS, tdesktop).
export default function bytesCmpConstTime(bytes1: number[] | Uint8Array, bytes2: number[] | Uint8Array) {
  const len = bytes1.length;
  if(len !== bytes2.length) {
    return false;
  }

  let diff = 0;
  for(let i = 0; i < len; ++i) {
    diff |= bytes1[i] ^ bytes2[i];
  }

  return diff === 0;
}
