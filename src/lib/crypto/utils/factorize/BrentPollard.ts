/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// Thanks to https://xn--2-umb.com/09/12/brent-pollard-rho-factorisation/

import bigInt from 'big-integer';
import {bigIntFromBytes, bigIntToBytes} from '../../../../helpers/bigInt/bigIntConversion';
import bigIntRandom from '../../../../helpers/bigInt/bigIntRandom';

// let test = 0;
function BrentPollardFactor(n: bigInt.BigInteger) {
  const two = bigInt[2];
  if(n.remainder(two).isZero()) {
    return two;
  }

  const m = bigInt(1000);
  let a: bigInt.BigInteger,
    x: bigInt.BigInteger,
    y: bigInt.BigInteger,
    ys: bigInt.BigInteger,
    r: bigInt.BigInteger,
    q: bigInt.BigInteger,
    g: bigInt.BigInteger;
  do
    a = bigIntRandom(bigInt.one, n.minus(1));
  while(a.isZero() || a.eq(n.minus(two)));
  y = bigIntRandom(bigInt.one, n.minus(1));
  r = bigInt.one;
  q = bigInt.one;

  // if(!test++) {
  //   a = bigInt(3);
  //   y = bigInt(3);
  // }

  const bigIntUint64 = bigInt('FFFFFFFFFFFFFFFF', 16);
  const bigIntUint64MinusPqPlusOne = bigIntUint64.minus(n).plus(1);

  const performY = (y: bigInt.BigInteger) => {
    y = y.pow(two).mod(n);
    y = y.add(a);
    if(y.lesser(a)) { // it slows down the script
      y = y.add(bigIntUint64MinusPqPlusOne);
    }
    y = y.mod(n);
    return y;
  };

  do {
    x = y;
    for(let i = 0; bigInt(i).lesser(r); ++i) {
      y = performY(y);
    }

    let k = bigInt.zero;
    do {
      ys = y;
      const condition = bigInt.min(m, r.minus(k));
      for(let i = 0; bigInt(i).lesser(condition); ++i) {
        y = performY(y);
        q = q.multiply(x.greater(y) ? x.minus(y) : y.minus(x)).mod(n);
      }
      g = bigInt.gcd(q, n);
      k = k.add(m);
    } while(k.lesser(r) && g.eq(bigInt.one));

    r = r.shiftLeft(bigInt.one);
  } while(g.eq(bigInt.one));

  if(g.eq(n)) {
    do {
      ys = performY(ys);
      g = bigInt.gcd(x.minus(ys).abs(), n);
    } while(g.eq(bigInt.one));
  }

  return g;
}

function primeFactors(pqBytes: Uint8Array | number[]) {
  const n = bigIntFromBytes(pqBytes);

  const factors: bigInt.BigInteger[] = [];
  const primes: bigInt.BigInteger[] = [];

  let factor = BrentPollardFactor(n);
  factors.push(n.divide(factor));
  factors.push(factor);

  // return [factor];

  do {
    const m = factors.pop();

    if(m.eq(bigInt.one))
      continue;

    if(m.isPrime(true)) {
      primes.push(m);

      // Remove the prime from the other factors
      for(let i = 0; i < factors.length; ++i) {
        let k = factors[i];
        if(k.mod(m).isZero()) {
          do
            k = k.divide(m);
          while(k.mod(m).isZero());
          factors[i] = k;
        }
      }
    } else {
      // factor = m.lesser(100) ? bigInt(PollardRho(m.toJSNumber())) : this.brentPollardFactor(m);
      factor = BrentPollardFactor(m);
      factors.push(m.divide(factor));
      factors.push(factor);
    }
  } while(factors.length);

  return primes;
}

export default function factorizeBrentPollardPQ(pqBytes: Uint8Array | number[]): [Uint8Array, Uint8Array] {
  let factors = primeFactors(pqBytes);
  factors.sort((a, b) => a.compare(b));
  if(factors.length > 2) {
    factors = [
      factors.splice(factors.length - 2, 1)[0],
      factors.reduce((acc, v) => acc.multiply(v), bigInt.one)
    ];
  }

  const p = factors[0], q = factors[factors.length - 1];
  return (p.lesser(q) ? [p, q] : [q, p]).map((b) => bigIntToBytes(b)) as any;
}
