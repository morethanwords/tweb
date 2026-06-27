import type CallInstance from '@lib/calls/callInstance';
import type {MessagesDhConfig} from '@layer';
import bigInt from 'big-integer';
import {bigIntFromBytes} from '@helpers/bigInt/bigIntConversion';
import addPadding from '@helpers/bytes/addPadding';
import bytesFromHex from '@helpers/bytes/bytesFromHex';
import cryptoWorker from '@lib/crypto/cryptoMessagePort';
import {randomBytes} from '@helpers/random';
import {verifyDhPrimeAndGenerator, verifyDhPublicValue} from '@lib/crypto/dhValidation';

export default async function generateDh(dhConfig: MessagesDhConfig.messagesDhConfig) {
  const {p, g} = dhConfig;

  // The server (the E2E adversary) supplies p and g — reject anything but the
  // well-known safe prime with a valid generator before using them.
  verifyDhPrimeAndGenerator(p, g);

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

  const gBytes = bytesFromHex(g.toString(16));

  // Regenerate until g_a falls in the safe range (mirrors tdesktop CreateModExp);
  // with the real prime a good value is found on the first try essentially always.
  for(;;) {
    const a = generateA(p);
    const g_a = addPadding(await cryptoWorker.invokeCrypto('mod-pow', gBytes, a, p), 256, true, true, true);

    try {
      verifyDhPublicValue(g_a, p);
    } catch(err) {
      continue;
    }

    const g_a_hash = await cryptoWorker.invokeCrypto('sha256', g_a);

    const dh: CallInstance['dh'] = {
      a: a,
      g_a: g_a,
      g_a_hash: g_a_hash,
      p
    };

    return dh;
  }
}
