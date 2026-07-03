import cryptoWorker from '@lib/crypto/cryptoMessagePort';
import {AccountPassword, InputCheckPasswordSRP, PasswordKdfAlgo} from '@layer';
import addPadding from '@helpers/bytes/addPadding';
import bufferConcats from '@helpers/bytes/bufferConcats';
import bytesXor from '@helpers/bytes/bytesXor';
import convertToUint8Array from '@helpers/bytes/convertToUint8Array';
import bigInt from 'big-integer';
import {bigIntFromBytes, bigIntToBytes} from '@helpers/bigInt/bigIntConversion';
import bytesToHex from '@helpers/bytes/bytesToHex';
import {randomBytes} from '@helpers/random';
import {verifyDhPrimeAndGenerator} from '@lib/crypto/dhValidation';

export async function makePasswordHash(password: string, client_salt: Uint8Array, server_salt: Uint8Array) {
  // ! look into crypto_methods.test.ts
  let buffer = await cryptoWorker.invokeCrypto('sha256', bufferConcats(client_salt, new TextEncoder().encode(password), client_salt));
  buffer = bufferConcats(server_salt, buffer, server_salt);
  buffer = await cryptoWorker.invokeCrypto('sha256', buffer);

  let hash = await cryptoWorker.invokeCrypto('pbkdf2', new Uint8Array(buffer), client_salt as BufferSource, 100000);
  hash = bufferConcats(server_salt, hash, server_salt);

  buffer = await cryptoWorker.invokeCrypto('sha256', hash);

  return buffer;
}

export default async function computeSRP(password: string, state: AccountPassword, isNew: boolean) {
  const algo = (isNew ? state.new_algo : state.current_algo) as PasswordKdfAlgo.passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow;

  const p = bigIntFromBytes(algo.p);
  const g = bigInt(algo.g);

  // * Validate the server-supplied {p, g} exactly like tdlib's
  // * DhHandshake::check_config — PasswordManager runs it in BOTH
  // * get_input_check_password (checking a password) and calc_password_srp_hash
  // * (setting a new one). p must be the known 2048-bit safe prime and g a valid
  // * generator for it; otherwise a malicious server could weaken the exchange.
  verifyDhPrimeAndGenerator(algo.p, algo.g);

  const pw_hash = await makePasswordHash(password, algo.salt1, algo.salt2);
  const x = bigInt(bytesToHex(pw_hash), 16);

  const padArray = function(arr: number[] | Uint8Array, len: number) {
    if(!(arr instanceof Uint8Array)) {
      arr = convertToUint8Array(arr);
    }

    return addPadding(arr, len, true, true, true);
  };

  const v = g.modPow(x, p);

  // * https://core.telegram.org/api/srp#setting-a-new-2fa-password
  if(isNew) {
    const bytes = bigIntToBytes(v);
    return padArray(bytes, 256);
  }

  // * Validate srp_B exactly like tdlib get_input_check_password: 0 < B < p and
  // * 248 <= len(B) <= 256. A degenerate B (0, p, or wildly sized) from a
  // * compromised server would otherwise be used blindly.
  if(state.srp_B.length < 248 || state.srp_B.length > 256) {
    throw new Error('[SRP] invalid srp_B length: ' + state.srp_B.length);
  }

  const B = bigIntFromBytes(state.srp_B);
  if(!B.greater(bigInt.zero) || !B.lesser(p)) {
    throw new Error('[SRP] srp_B out of range');
  }

  const pForHash = padArray(bigIntToBytes(p), 256);
  const gForHash = padArray(bigIntToBytes(g), 256);
  const b_for_hash = padArray(bigIntToBytes(B), 256);

  const kHash = await cryptoWorker.invokeCrypto('sha256', bufferConcats(pForHash, gForHash));
  const k = bigIntFromBytes(kHash);

  const k_v = k.multiply(v).mod(p);

  // * Generate the ephemeral secret a from fresh LOCAL CSPRNG bytes (256 bytes =
  // * 2048 bits), exactly like tdlib's Random::secure_bytes(2048 / 8). The old
  // * code derived a from the SERVER-provided state.secure_random, which both
  // * leaked our secret exponent to the server and was constant across the
  // * (now-removed) retry loop, so the loop could never pick a different a.
  const a = bigIntFromBytes(randomBytes(256));
  const A = g.modPow(a, p);

  // * A must be zero-padded to 256 bytes (big-endian), exactly like tdlib's
  // * `A_bn.to_binary(256)`. The server normalizes A to 256 bytes before hashing
  // * u and M1, so an unpadded A (whenever g^a mod p happens to have a leading
  // * zero byte, ~1/256 of the time) made the M1 we send mismatch the server's —
  // * a correct password was then rejected at random.
  const a_for_hash = padArray(bigIntToBytes(A), 256);

  const s = await cryptoWorker.invokeCrypto('sha256', bufferConcats(a_for_hash, b_for_hash));
  const u = bigIntFromBytes(s);

  // * g_b = (B - k*v) mod p, kept non-negative by adding p first when B <= k*v.
  // * big-integer's .mod() can return a negative remainder, so this explicit
  // * pre-add is load-bearing — it mirrors tdlib's `if (t < 0) t += p`.
  let g_b: bigInt.BigInteger;
  if(!B.greater(k_v)) {
    g_b = B.add(p);
  } else g_b = B;
  g_b = g_b.subtract(k_v).mod(p);

  const ux = u.multiply(x);
  const a_ux = a.add(ux);
  const S = g_b.modPow(a_ux, p);

  const K = await cryptoWorker.invokeCrypto('sha256', padArray(bigIntToBytes(S), 256));

  let h1 = await cryptoWorker.invokeCrypto('sha256', pForHash);
  const h2 = await cryptoWorker.invokeCrypto('sha256', gForHash);
  h1 = bytesXor(h1, h2);

  const buff = bufferConcats(
    h1,
    await cryptoWorker.invokeCrypto('sha256', algo.salt1),
    await cryptoWorker.invokeCrypto('sha256', algo.salt2),
    a_for_hash,
    b_for_hash,
    K
  );

  const M1 = await cryptoWorker.invokeCrypto('sha256', buff);

  const out: InputCheckPasswordSRP.inputCheckPasswordSRP = {
    _: 'inputCheckPasswordSRP',
    srp_id: state.srp_id,
    A: new Uint8Array(a_for_hash),
    M1
  };

  return out;
}
