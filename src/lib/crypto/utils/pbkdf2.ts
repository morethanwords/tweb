import subtle from '../subtle';

export default async function pbkdf2(buffer: Parameters<SubtleCrypto['importKey']>[1], salt: HkdfParams['salt'], iterations: number) {
  const importKey = await subtle.importKey(
    'raw',
    buffer,
    {name: 'PBKDF2'},
    false,
    [/* 'deriveKey',  */'deriveBits']
  );

  /* await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: {name: 'SHA-512'}
    },
    importKey,
    {
      name: 'AES-CTR',
      length: 256
    },
    false,
    ['encrypt', 'decrypt']
  ); */

  const bits = subtle.deriveBits({
    name: 'PBKDF2',
    salt,
    iterations,
    hash: {name: 'SHA-512'}
  },
  importKey,
  512
  );

  return bits.then((buffer) => new Uint8Array(buffer));
}
