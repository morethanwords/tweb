/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type CallInstance from '../calls/callInstance';
import type {MessagesDhConfig} from '../../layer';
import bigInt from 'big-integer';
import randomize from '../../helpers/array/randomize';
import {bigIntFromBytes} from '../../helpers/bigInt/bigIntConversion';
import addPadding from '../../helpers/bytes/addPadding';
import bytesFromHex from '../../helpers/bytes/bytesFromHex';
import cryptoWorker from './cryptoMessagePort';

export default async function generateDh(dhConfig: MessagesDhConfig.messagesDhConfig) {
  const {p, g} = dhConfig;

  const generateA = (p: Uint8Array) => {
    for(;;) {
      const a = randomize(new Uint8Array(p.length));
      // const a = new Uint8Array(4).randomize();

      const aBigInt = bigIntFromBytes(a); // str2bigInt(bytesToHex(a), 16);
      if(!aBigInt.greater(bigInt.one)) {
        continue;
      }

      const pBigInt = bigIntFromBytes(p); // str2bigInt(bytesToHex(p), 16);
      if(!aBigInt.lesser(pBigInt.subtract(bigInt.one))) {
        continue;
      }

      return a;
    }
  };

  const a = generateA(p);
  // const a = new Uint8Array([0]);

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
