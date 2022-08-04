import bigInt from 'big-integer';
import {nextRandomUint} from '../random';

export default function bigIntRandom(min: bigInt.BigNumber, max: bigInt.BigNumber) {
  return bigInt.randBetween(min, max, () => {
    return nextRandomUint(32) / 0xFFFFFFFF;
    /* const bits = 32;
    const randomBytes = new Uint8Array(bits / 8);
    crypto.getRandomValues(randomBytes);
    const r = bigIntFromBytes(randomBytes).mod(bigInt(2).pow(bits));
    return r.toJSNumber(); */
  });
}
