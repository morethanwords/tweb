/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import CTR from './utils/aesCTR';
import subtle from './subtle';

const aesCTRs: Map<number, K> = new Map();
let lastCTRId = -1;

type K = {
  enc: CTR,
  dec: CTR,
};

export async function aesCtrPrepare({encKey, encIv, decKey, decIv}: {[k in 'encKey' | 'encIv' | 'decKey' | 'decIv']: Uint8Array}) {
  const id = ++lastCTRId;

  const a = [['encrypt', encKey], ['decrypt', decKey]] as ['encrypt' | 'decrypt', Uint8Array][];
  const promises = a.map(([mode, key]) => {
    return subtle.importKey(
      'raw',
      key,
      {name: 'AES-CTR'},
      false,
      [mode]
    )
  });

  const [encCryptoKey, decCryptoKey] = await Promise.all(promises);
  const enc = new CTR('encrypt', encCryptoKey, encIv.slice());
  const dec = new CTR('decrypt', decCryptoKey, decIv.slice());

  const k: K = {
    enc,
    dec
  };

  aesCTRs.set(id, k);

  return id;
}

export async function aesCtrProcess({id, data, operation}: {id: number, data: Uint8Array, operation: 'encrypt' | 'decrypt'}) {
  const ctrs = aesCTRs.get(id);
  const result = await (operation === 'encrypt' ? ctrs.enc : ctrs.dec).update(data);
  return result;
}

export function aesCtrDestroy(id: number) {
  aesCTRs.delete(id);
}
