// Thanks to https://github.com/tdlib/td/blob/3f54c301ead1bbe6529df4ecfb63c7f645dd181c/tdutils/td/utils/crypto.cpp#L234

import bigInt from 'big-integer';
import {bigIntFromBytes, bigIntToBytes} from '../../../../helpers/bigInt/bigIntConversion';
import bigIntRandom from '../../../../helpers/bigInt/bigIntRandom';
import {nextRandomUint} from '../../../../helpers/random';

export function factorizeSmallPQ(pq: bigInt.BigInteger) {
  if(pq.lesser(2) || pq.greater(bigInt.one.shiftLeft(63))) {
    return bigInt.one;
  }

  let a: bigInt.BigInteger,
    b: bigInt.BigInteger,
    c: bigInt.BigInteger,
    q: bigInt.BigInteger,
    x: bigInt.BigInteger,
    y: bigInt.BigInteger,
    z: bigInt.BigInteger,
    i: number,
    iter: number,
    lim: number,
    j: number;

  let g = bigInt.zero;
  for(i = 0, iter = 0; i < 3 || iter < 1000; ++i) {
    q = bigIntRandom(15, 17).mod(pq.subtract(1)); // Random::fast(17, 32) % (pq - 1);
    x = bigIntRandom(0, bigInt[2].pow(64)).mod(pq.subtract(1)).add(1);
    y = bigInt(x);
    lim = 1 << (Math.min(5, i) + 18);
    for(j = 1; j < lim; ++j) {
      ++iter;
      a = bigInt(x);
      b = bigInt(x);
      c = bigInt(q);

      c = c.add(a).multiply(b).mod(pq);
      // while(!b.isZero()) {
      //   if(!b.and(1).isZero()) {
      //     c = c.add(a);
      //     if(c.greaterOrEquals(pq)) {
      //       c = c.subtract(pq);
      //     }
      //   }
      //   a = a.add(a);
      //   if(a.greaterOrEquals(pq)) {
      //     a = a.subtract(pq);
      //   }
      //   b = b.shiftRight(1);
      // }

      x = bigInt(c);
      z = x.lesser(y) ? pq.add(x).subtract(y) : x.subtract(y);
      g = bigInt.gcd(z, pq);
      if(g.notEquals(bigInt.one)) {
        break;
      }

      if(!(j & (j - 1))) {
        y = bigInt(x);
      }
    }
    if(g.greater(bigInt.one) && g.lesser(pq)) {
      break;
    }
  }
  if(!g.isZero()) {
    const other = pq.divide(g);
    if(other.lesser(g)) {
      g = other;
    }
  }
  return g;
}

export function factorizeBiqPQ(pqBytes: Uint8Array | number[]): [Uint8Array, Uint8Array] {
  let q: bigInt.BigInteger,
    p: bigInt.BigInteger,
    b: bigInt.BigInteger;

  const pq = bigIntFromBytes(pqBytes);

  let found = false;
  for(let i = 0, iter = 0; !found && (i < 3 || iter < 1000); i++) {
    const t = bigIntRandom(17, 32);
    let a = bigInt(nextRandomUint(32));
    let b = bigInt(a);

    const lim = 1 << (i + 23);
    for(let j = 1; j < lim; j++) {
      iter++;
      a = a.mod(a).multiply(pq); // BigNum::mod_mul(a, a, a, pq, context);

      a = a.add(t);
      if(a.compare(pq) >= 0) {
        a = a.subtract(pq);
      }
      if(a.compare(b) > 0) {
        q = a.subtract(b);
      } else {
        q = b.subtract(a);
      }
      p = bigInt.gcd(q, pq);
      if(p.compare(bigInt.one) != 0) {
        found = true;
        break;
      }
      if((j & (j - 1)) == 0) {
        b = bigInt(a);
      }
    }
  }

  if(found) {
    q = pq.divide(p);
    if(p.compare(q) > 0) {
      [p, q] = [q, p];
    }

    return [bigIntToBytes(p), bigIntToBytes(q)];
  }
}

export default function factorizeTdlibPQ(pqBytes: Uint8Array | number[]): [Uint8Array, Uint8Array] {
  const size = pqBytes.length;
  if(size > 8 || (size === 8 && (pqBytes[0] & 128) != 0)) {
    return factorizeBiqPQ(pqBytes);
  }

  let pq = bigInt.zero;
  for(let i = 0; i < size; i++) {
    pq = pq.shiftLeft(8).or(pqBytes[i]);
  }

  const p = factorizeSmallPQ(pq);
  if(p.isZero() || pq.mod(p).notEquals(bigInt.zero)) {
    return;
  }

  return [bigIntToBytes(p), bigIntToBytes(pq.divide(p))];
}
