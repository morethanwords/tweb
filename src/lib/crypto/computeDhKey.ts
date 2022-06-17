/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { bigIntFromBytes } from "../../helpers/bigInt/bigIntConversion";
import cryptoWorker from "./cryptoMessagePort";

export default async function computeDhKey(g_b: Uint8Array, a: Uint8Array, p: Uint8Array) {
  const key = await cryptoWorker.invokeCrypto('mod-pow', g_b, a, p);
  const keySha1Hashed = await cryptoWorker.invokeCrypto('sha1', key);
  const key_fingerprint = keySha1Hashed.slice(-8).reverse(); // key_fingerprint: key_fingerprint as any // ! it doesn't work
  const key_fingerprint_long = bigIntFromBytes(key_fingerprint).toString(10); // bigInt2str(str2bigInt(bytesToHex(key_fingerprint), 16), 10);

  return {key, key_fingerprint: key_fingerprint_long};
}
