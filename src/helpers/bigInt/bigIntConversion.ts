import bigInt from 'big-integer';
import {longBigInt, ulongBigInt} from './bigIntConstants';

export function bigIntFromBytes(bytes: Uint8Array | number[], base = 256) {
  return bigInt.fromArray(bytes instanceof Uint8Array ? [...bytes] : bytes, base);
}

export function bigIntToBytes(bigInt: bigInt.BigInteger) {
  return new Uint8Array(bigInt.toArray(256).value);
}

export function bigIntToSigned(bigInt: bigInt.BigInteger) {
  return bigInt.greater(longBigInt) ? bigInt.minus(ulongBigInt) : bigInt;
}

export function bigIntToUnsigned(bigInt: bigInt.BigInteger) {
  return bigInt.isNegative() ? ulongBigInt.add(bigInt) : bigInt;
}
