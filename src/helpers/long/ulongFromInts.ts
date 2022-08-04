import bigInt from 'big-integer';
import intToUint from '../number/intToUint';

export default function ulongFromInts(high: number, low: number) {
  high = intToUint(high), low = intToUint(low);
  return bigInt(high).shiftLeft(32).add(bigInt(low));
}
