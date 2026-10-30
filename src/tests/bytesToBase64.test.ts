/*
 * The padding of a base64 string is what the length leaves over. It used to be guessed from trailing 'A's,
 * which also ate real zero bits at the end of data whose length divides by three.
 */

import {describe, expect, it} from 'vitest';
import bytesToBase64 from '@helpers/bytes/bytesToBase64';

const reference = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

describe('bytesToBase64', () => {
  it('matches btoa for every length and for zero tails', () => {
    for(let length = 0; length < 64; ++length) {
      const random = crypto.getRandomValues(new Uint8Array(length));
      expect(bytesToBase64(random)).toBe(reference(random));
      const zeros = new Uint8Array(length);
      expect(bytesToBase64(zeros)).toBe(reference(zeros));
      if(length) {
        const zeroTail = random.slice();
        zeroTail[length - 1] = 0;
        expect(bytesToBase64(zeroTail)).toBe(reference(zeroTail));
      }
    }
  });

  it('takes plain arrays too', () => {
    expect(bytesToBase64([1, 2, 0])).toBe('AQIA');
  });
});
