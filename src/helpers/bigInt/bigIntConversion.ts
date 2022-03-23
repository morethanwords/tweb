import bigInt from 'big-integer';

export function bigIntFromBytes(bytes: Uint8Array | number[], base = 256) {
  return bigInt.fromArray(bytes instanceof Uint8Array ? [...bytes] : bytes, base);
}

export function bigIntToBytes(bigInt: bigInt.BigInteger) {
  return new Uint8Array(bigInt.toArray(256).value);
}
