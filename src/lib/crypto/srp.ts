/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import CryptoWorker from "../crypto/cryptoworker";
import {str2bigInt, isZero,
  bigInt2str, powMod, int2bigInt, mult, mod, sub, bitSize, negative, add, greater} from '../../vendor/leemon';

import {logger, LogTypes} from '../logger';
import { AccountPassword, InputCheckPasswordSRP, PasswordKdfAlgo } from "../../layer";
import { bufferConcats, bytesToHex, bytesFromHex, bytesXor, convertToUint8Array } from "../../helpers/bytes";
import { addPadding } from "../mtproto/bin_utils";
//import { MOUNT_CLASS_TO } from "../../config/debug";

const log = logger('SRP', LogTypes.Error);

//MOUNT_CLASS_TO && Object.assign(MOUNT_CLASS_TO, {str2bigInt, bigInt2str, int2bigInt});

export async function makePasswordHash(password: string, client_salt: Uint8Array, server_salt: Uint8Array) {
  // ! look into crypto_methods.test.ts
  let buffer = await CryptoWorker.invokeCrypto('sha256-hash', bufferConcats(client_salt, new TextEncoder().encode(password), client_salt));
  //log('encoded 1', bytesToHex(new Uint8Array(buffer)));

  buffer = bufferConcats(server_salt, buffer, server_salt);

  buffer = await CryptoWorker.invokeCrypto('sha256-hash', buffer);
  //log('encoded 2', buffer, bytesToHex(new Uint8Array(buffer)));

  let hash = await CryptoWorker.invokeCrypto('pbkdf2', new Uint8Array(buffer), client_salt, 100000);
  //log('encoded 3', hash, bytesToHex(new Uint8Array(hash)));

  hash = bufferConcats(server_salt, hash, server_salt);

  buffer = await CryptoWorker.invokeCrypto('sha256-hash', hash);
  //log('got password hash:', buffer, bytesToHex(new Uint8Array(buffer)));

  return buffer;
}

export async function computeSRP(password: string, state: AccountPassword, isNew: boolean) {
  const algo = (isNew ? state.new_algo : state.current_algo) as PasswordKdfAlgo.passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow;
  //console.log('computeSRP:', password, state, isNew, algo);

  const p = str2bigInt(bytesToHex(algo.p), 16);
  const g = int2bigInt(algo.g, 32, 256);
  
  //log('p', bigInt2str(p, 16));
  
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
  
  //check_prime_and_good(algo.p, g);
  
  const pw_hash = await makePasswordHash(password, algo.salt1, algo.salt2);
  const x = str2bigInt(bytesToHex(pw_hash), 16);
  
  //log('computed pw_hash:', pw_hash, x, bytesToHex(new Uint8Array(pw_hash)));
  
  const padArray = function(arr: number[] | Uint8Array, len: number) {
    if(!(arr instanceof Uint8Array)) {
      arr = convertToUint8Array(arr);
    }
    
    return addPadding(arr, len, true, true, true);
  };
  
  const v = powMod(g, x, p);
  
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
    const bytes = bytesFromHex(bigInt2str(v, 16));
    return padArray(/* (isBigEndian ? bytes.reverse() : bytes) */bytes, 256);
  }
  
  const B = str2bigInt(bytesToHex(state.srp_B), 16);
  //log('B', bigInt2str(B, 16));
  
  const pForHash = padArray(bytesFromHex(bigInt2str(p, 16)), 256);
  const gForHash = padArray(bytesFromHex(bigInt2str(g, 16)), 256); // like uint8array
  const b_for_hash = padArray(bytesFromHex(bigInt2str(B, 16)), 256);
  /* log(bytesToHex(pForHash));
  log(bytesToHex(gForHash));
  log(bytesToHex(b_for_hash)); */

  //log('g_x', bigInt2str(g_x, 16));

  const kHash = await CryptoWorker.invokeCrypto('sha256-hash', bufferConcats(pForHash, gForHash));
  const k = str2bigInt(bytesToHex(kHash), 16);

  //log('k', bigInt2str(k, 16));

  // kg_x = (k * g_x) % p
  const k_v = mod(mult(k, v), p);

  // good

  //log('kg_x', bigInt2str(kg_x, 16));

  const is_good_mod_exp_first = (modexp: any, prime: any) => {
    const diff = sub(prime, modexp);
    const min_diff_bits_count = 2048 - 64;
    const max_mod_exp_size = 256;
    if(negative(diff) ||
      bitSize(diff) < min_diff_bits_count || 
      bitSize(modexp) < min_diff_bits_count || 
      Math.floor((bitSize(modexp) + 7) / 8) > max_mod_exp_size)
        return false;
    return true;
  };

  const generate_and_check_random = async() => {
    while(true) {
      const a = str2bigInt(bytesToHex(flipper(state.secure_random)), 16);
      //const a = str2bigInt('9153faef8f2bb6da91f6e5bc96bc00860a530a572a0f45aac0842b4602d711f8bda8d59fb53705e4ae3e31a3c4f0681955425f224297b8e9efd898fec22046debb7ba8a0bcf2be1ada7b100424ea318fdcef6ccfe6d7ab7d978c0eb76a807d4ab200eb767a22de0d828bc53f42c5a35c2df6e6ceeef9a3487aae8e9ef2271f2f6742e83b8211161fb1a0e037491ab2c2c73ad63c8bd1d739de1b523fe8d461270cedcf240de8da75f31be4933576532955041dc5770c18d3e75d0b357df9da4a5c8726d4fced87d15752400883dc57fa1937ac17608c5446c4774dcd123676d683ce3a1ab9f7e020ca52faafc99969822717c8e07ea383d5fb1a007ba0d170cb', 16);

      //console.log('ITERATION');

      //log('g a p', bigInt2str(g, 16), bigInt2str(a, 16), bigInt2str(p, 16));

      const A = powMod(g, a, p);
      //log('A MODPOW', bigInt2str(A, 16));
      if(is_good_mod_exp_first(A, p)) {
        const a_for_hash = bytesFromHex(bigInt2str(A, 16));

        const s = await CryptoWorker.invokeCrypto('sha256-hash', bufferConcats(a_for_hash, b_for_hash));
        const u = str2bigInt(s.hex, 16);
        if(!isZero(u) && !negative(u))
          return {a, a_for_hash, u};
      } 
    }
  }
    

  const {a, a_for_hash, u} = await generate_and_check_random();

  /* log('a', bigInt2str(a, 16));
  log('a_for_hash', bytesToHex(a_for_hash));
  log('u', bigInt2str(u, 16)); */

  // g_b = (B - kg_x) % p
  /* log('B - kg_x', bigInt2str(sub(B, kg_x), 16));
  log('subtract', bigInt2str(B, 16), bigInt2str(kg_x, 16));
  log('B - kg_x', bigInt2str(sub(B, kg_x), 16)); */

  let g_b: number[];
  if(!greater(B, k_v)) {
    //log('negative');
    g_b = add(B, p);
  } else g_b = B;
  g_b = mod(sub(g_b, k_v), p);
  /* let g_b = sub(B, kg_x);
  if(negative(g_b)) g_b = add(g_b, p); */
  
  //log('g_b', bigInt2str(g_b, 16));

  /* if(!is_good_mod_exp_first(g_b, p))
    throw new Error('bad g_b'); */

  const ux = mult(u, x);
  //log('u and x multiply', bigInt2str(u, 16), bigInt2str(x, 16), bigInt2str(ux, 16));
  const a_ux = add(a, ux);
  const S = powMod(g_b, a_ux, p);

  const K = await CryptoWorker.invokeCrypto('sha256-hash', padArray(bytesFromHex(bigInt2str(S, 16)), 256));

  //log('K', bytesToHex(K), new Uint32Array(new Uint8Array(K).buffer));

  let h1 = await CryptoWorker.invokeCrypto('sha256-hash', pForHash);
  const h2 = await CryptoWorker.invokeCrypto('sha256-hash', gForHash);
  h1 = bytesXor(h1, h2);

  const buff = bufferConcats(h1, 
    await CryptoWorker.invokeCrypto('sha256-hash', algo.salt1),
    await CryptoWorker.invokeCrypto('sha256-hash', algo.salt2),
    a_for_hash,
    b_for_hash,
    K
  );

  const M1 = await CryptoWorker.invokeCrypto('sha256-hash', buff);

  const out = {
    _: 'inputCheckPasswordSRP', 
    srp_id: state.srp_id, 
    A: new Uint8Array(a_for_hash), 
    M1
  } as InputCheckPasswordSRP.inputCheckPasswordSRP;


  //log('out', bytesToHex(out.A), bytesToHex(out.M1));
  return out;
}
