/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import cryptoWorker from './cryptoMessagePort';
import {AccountPassword, InputCheckPasswordSRP, PasswordKdfAlgo} from '../../layer';
import addPadding from '../../helpers/bytes/addPadding';
import bufferConcats from '../../helpers/bytes/bufferConcats';
import bytesXor from '../../helpers/bytes/bytesXor';
import convertToUint8Array from '../../helpers/bytes/convertToUint8Array';
import bigInt from 'big-integer';
import {bigIntFromBytes, bigIntToBytes} from '../../helpers/bigInt/bigIntConversion';
import bytesToHex from '../../helpers/bytes/bytesToHex';

export async function makePasswordHash(password: string, client_salt: Uint8Array, server_salt: Uint8Array) {
  // ! look into crypto_methods.test.ts
  let buffer = await cryptoWorker.invokeCrypto('sha256', bufferConcats(client_salt, new TextEncoder().encode(password), client_salt));
  buffer = bufferConcats(server_salt, buffer, server_salt);
  buffer = await cryptoWorker.invokeCrypto('sha256', buffer);

  let hash = await cryptoWorker.invokeCrypto('pbkdf2', new Uint8Array(buffer), client_salt, 100000);
  hash = bufferConcats(server_salt, hash, server_salt);

  buffer = await cryptoWorker.invokeCrypto('sha256', hash);

  return buffer;
}

export default async function computeSRP(password: string, state: AccountPassword, isNew: boolean) {
  const algo = (isNew ? state.new_algo : state.current_algo) as PasswordKdfAlgo.passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow;

  const p = bigIntFromBytes(algo.p);
  const g = bigInt(algo.g);

  /* if(B.compareTo(BigInteger.ZERO) < 0) {
    console.error('srp_B < 0')
  }

  if(B.compareTo(p) <= 0) {
    console.error('srp_B <= p');
  } */

  /* let check_prime_and_good = (bytes: any, g: number) => {
    let good_prime = 'c71caeb9c6b1c9048e6c522f70f13f73980d40238e3e21c14934d037563d930f48198a0aa7c14058229493d22530f4dbfa336f6e0ac925139543aed44cce7c3720fd51f69458705ac68cd4fe6b6b13abdc9746512969328454f18faf8c595f642477fe96bb2a941d5bcd1d4ac8cc49880708fa9b378e3c4f3a9060bee67cf9a4a4a695811051907e162753b56b0f6b410dba74d8a84b2a14b3144e0ef1284754fd17ed950d5965b4b9dd46582db1178d169c6bc465b0d6ff9ca3928fef5b9ae4e418fc15e83ebea0f87fa9ff5eed70050ded2849f47bf959d956850ce929851f0d8115f635b105ee2e4e15d04b2454bf6f4fadf034b10403119cd8e3b92fcc5b';

    if(bytesToHex(bytes) === good_prime && [3, 4, 5, 7].indexOf(g) !== -1) {
      return true;
    }

    // TO-DO check_prime_and_good_check
  }; */

  // check_prime_and_good(algo.p, g);

  const pw_hash = await makePasswordHash(password, algo.salt1, algo.salt2);
  const x = bigInt(bytesToHex(pw_hash), 16);

  const padArray = function(arr: number[] | Uint8Array, len: number) {
    if(!(arr instanceof Uint8Array)) {
      arr = convertToUint8Array(arr);
    }

    return addPadding(arr, len, true, true, true);
  };

  const v = g.modPow(x, p);

  const flipper = (arr: Uint8Array | number[]) => {
    const out = new Uint8Array(arr.length);
    for(let i = 0; i < arr.length; i += 4) {
      out[i] = arr[i + 3];
      out[i + 1] = arr[i + 2];
      out[i + 2] = arr[i + 1];
      out[i + 3] = arr[i];
    }

    return out;
  };

  // * https://core.telegram.org/api/srp#setting-a-new-2fa-password
  if(isNew) {
    const bytes = bigIntToBytes(v);
    return padArray(/* (isBigEndian ? bytes.reverse() : bytes) */bytes, 256);
  }

  const B = bigIntFromBytes(state.srp_B);

  const pForHash = padArray(bigIntToBytes(p), 256);
  const gForHash = padArray(bigIntToBytes(g), 256);
  const b_for_hash = padArray(bigIntToBytes(B), 256);

  const kHash = await cryptoWorker.invokeCrypto('sha256', bufferConcats(pForHash, gForHash));
  const k = bigIntFromBytes(kHash);

  const k_v = k.multiply(v).mod(p);

  const is_good_mod_exp_first = (modexp: bigInt.BigInteger, prime: bigInt.BigInteger) => {
    const diff = prime.subtract(modexp);
    const min_diff_bits_count = 2048 - 64;
    const max_mod_exp_size = 256;
    if(diff.isNegative() ||
      diff.bitLength().toJSNumber() < min_diff_bits_count ||
      modexp.bitLength().toJSNumber() < min_diff_bits_count ||
      Math.floor((modexp.bitLength().toJSNumber() + 7) / 8) > max_mod_exp_size)
      return false;
    return true;
  };

  const generate_and_check_random = async() => {
    while(true) {
      const a = bigIntFromBytes(flipper(state.secure_random));
      // const a = str2bigInt('9153faef8f2bb6da91f6e5bc96bc00860a530a572a0f45aac0842b4602d711f8bda8d59fb53705e4ae3e31a3c4f0681955425f224297b8e9efd898fec22046debb7ba8a0bcf2be1ada7b100424ea318fdcef6ccfe6d7ab7d978c0eb76a807d4ab200eb767a22de0d828bc53f42c5a35c2df6e6ceeef9a3487aae8e9ef2271f2f6742e83b8211161fb1a0e037491ab2c2c73ad63c8bd1d739de1b523fe8d461270cedcf240de8da75f31be4933576532955041dc5770c18d3e75d0b357df9da4a5c8726d4fced87d15752400883dc57fa1937ac17608c5446c4774dcd123676d683ce3a1ab9f7e020ca52faafc99969822717c8e07ea383d5fb1a007ba0d170cb', 16);

      const A = g.modPow(a, p);
      if(is_good_mod_exp_first(A, p)) {
        const a_for_hash = bigIntToBytes(A);

        const s = await cryptoWorker.invokeCrypto('sha256', bufferConcats(a_for_hash, b_for_hash));
        // const u = bigInt(s.hex, 16);
        const u = bigIntFromBytes(s);
        if(!u.isZero() && !u.isNegative())
          return {a, a_for_hash, u};
      }
    }
  }

  const {a, a_for_hash, u} = await generate_and_check_random();

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
