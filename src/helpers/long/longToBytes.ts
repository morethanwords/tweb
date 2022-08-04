import addPadding from '../bytes/addPadding';
import bigInt from 'big-integer';
import {bigIntToBytes} from '../bigInt/bigIntConversion';

export default function longToBytes(sLong: string) {
  const bigIntBytes = bigIntToBytes(bigInt(sLong)).reverse();
  const bytes = addPadding(bigIntBytes, 8, true, false, false);
  // console.log('longToBytes', bytes, bigIntBytes);

  return bytes;
}
