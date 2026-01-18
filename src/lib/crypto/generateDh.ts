/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type CallInstance from '@lib/calls/callInstance';
import type {MessagesDhConfig} from '@layer';
import bigInt from 'big-integer';
import {bigIntFromBytes} from '@helpers/bigInt/bigIntConversion';
import addPadding from '@helpers/bytes/addPadding';
import bytesFromHex from '@helpers/bytes/bytesFromHex';
import cryptoWorker from '@lib/crypto/cryptoMessagePort';
import {randomBytes} from '@helpers/random';

export default async function generateDh(dhConfig: MessagesDhConfig.messagesDhConfig) {
  const {p, g} = dhConfig;

  const generateA = (p: Uint8Array) => {
    for(;;) {
      const a = randomBytes(p.length);

      const aBigInt = bigIntFromBytes(a);
      if(!aBigInt.greater(bigInt.one)) {
        continue;
      }

      const pBigInt = bigIntFromBytes(p);
      if(!aBigInt.lesser(pBigInt.subtract(bigInt.one))) {
        continue;
      }

      return a;
    }
  };

  const a = generateA(p);

  const gBytes = bytesFromHex(g.toString(16));
  const g_a = addPadding(await cryptoWorker.invokeCrypto('mod-pow', gBytes, a, p), 256, true, true, true);
  const g_a_hash = await cryptoWorker.invokeCrypto('sha256', g_a);

  const dh: CallInstance['dh'] = {
    a: a,
    g_a: g_a,
    g_a_hash: g_a_hash,
    p
  };

  return dh;
}
