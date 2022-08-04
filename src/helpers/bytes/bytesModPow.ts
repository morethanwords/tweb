import {bigIntFromBytes, bigIntToBytes} from '../bigInt/bigIntConversion';

export default function bytesModPow(bytes: number[] | Uint8Array, exp: number[] | Uint8Array, mod: number[] | Uint8Array) {
  const bytesBigInt = bigIntFromBytes(bytes);
  const expBigInt = bigIntFromBytes(exp);
  const modBigInt = bigIntFromBytes(mod);
  const resBigInt = bytesBigInt.modPow(expBigInt, modBigInt);
  return bigIntToBytes(resBigInt);
}
