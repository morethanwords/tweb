// Thanks to https://www.geeksforgeeks.org/pollards-rho-algorithm-prime-factorization/

function modPow(base: number, exponent: number, modulus: number) {
  /* initialize result */
  let result = 1;

  while(exponent > 0) {
    /* if y is odd, multiply base with result */
    if(exponent % 2 == 1)
      result = (result * base) % modulus;

    /* exponent = exponent/2 */
    exponent = exponent >> 1;

    /* base = base * base */
    base = (base * base) % modulus;
  }
  return result;
}

/* method to return prime divisor for n */
export default function factorizePollardRhoPQ(n: number): number {
  /* no prime divisor for 1 */
  if(n === 1)
    return n;

  /* even number means one of the divisors is 2 */
  if(n % 2 === 0)
    return 2;

  /* we will pick from the range [2, N) */
  let x = Math.floor(Math.random() * (-n + 1));
  let y = x;

  /* the constant in f(x).
  * Algorithm can be re-run with a different c
  * if it throws failure for a composite. */
  const c = Math.floor(Math.random() * (-n + 1));

  /* Initialize candidate divisor (or result) */
  let d = 1;
  /* until the prime factor isn't obtained.
  If n is prime, return n */
  while(d == 1) {
    /* Tortoise Move: x(i+1) = f(x(i)) */
    x = (modPow(x, 2, n) + c + n) % n;

    /* Hare Move: y(i+1) = f(f(y(i))) */
    y = (modPow(y, 2, n) + c + n) % n;
    y = (modPow(y, 2, n) + c + n) % n;

    /* check gcd of |x-y| and n */
    d = gcd(Math.abs(x - y), n);

    /* retry if the algorithm fails to find prime factor
      * with chosen x and c */
    if(d === n) return factorizePollardRhoPQ(n);
  }

  return d;
}

// Recursive function to return gcd of a and b
function gcd(a: number, b: number): number {
  return b == 0? a : gcd(b, a % b);
}
