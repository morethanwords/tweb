import type CallInstance from '@lib/calls/callInstance';
import type {MessagesDhConfig} from '@layer';
import bigInt from 'big-integer';
import {bigIntFromBytes} from '@helpers/bigInt/bigIntConversion';
import addPadding from '@helpers/bytes/addPadding';
import bytesFromHex from '@helpers/bytes/bytesFromHex';
import cryptoWorker from '@lib/crypto/cryptoMessagePort';
import {randomBytes} from '@helpers/random';
import {verifyDhPrimeAndGenerator, verifyDhPublicValue} from '@lib/crypto/dhValidation';

// tdesktop's ModExpFirst::kRandomPowerSize. The secret exponent's size is ours to pick;
// deriving it from the server-supplied prime's byte length is what let a padded p make
// the rejection loop below unterminating.
const RANDOM_POWER_SIZE = 256;

// With a well-formed 2048-bit prime a candidate is accepted on the first draw with
// overwhelming probability; this only exists so no future input can spin forever.
const MAX_ATTEMPTS = 1000;

export default async function generateDh(dhConfig: MessagesDhConfig.messagesDhConfig) {
  const {p, g} = dhConfig;

  // The server (the E2E adversary) supplies p and g — reject anything but the
  // well-known safe prime with a valid generator before using them. It validates the
  // prime's VALUE only, so nothing below may depend on p.length.
  verifyDhPrimeAndGenerator(p, g);

  const generateA = (p: Uint8Array) => {
    const pBigInt = bigIntFromBytes(p);

    for(let attempt = 0; attempt < MAX_ATTEMPTS; ++attempt) {
      const a = randomBytes(RANDOM_POWER_SIZE);

      const aBigInt = bigIntFromBytes(a);
      if(!aBigInt.greater(bigInt.one)) {
        continue;
      }

      if(!aBigInt.lesser(pBigInt.subtract(bigInt.one))) {
        continue;
      }

      return a;
    }

    throw new Error('[DH] could not generate a suitable secret exponent');
  };

  const gBytes = bytesFromHex(g.toString(16));

  // Regenerate until g_a falls in the safe range (mirrors tdesktop CreateModExp);
  // with the real prime a good value is found on the first try essentially always.
  for(let attempt = 0; attempt < MAX_ATTEMPTS; ++attempt) {
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

  throw new Error('[DH] could not generate a suitable g_a');
}
