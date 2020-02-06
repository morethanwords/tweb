import CryptoWorker from '../lib/crypto/cryptoworker';
import { bytesFromHex, bytesFromArrayBuffer } from '../lib/bin_utils';

test('factorize', () => {
  for(let i = 0; i < 10; ++i) {
    CryptoWorker.factorize(new Uint8Array([20, 149, 30, 137, 202, 169, 105, 69])).then((pAndQ: any) => {
      pAndQ.pop();
      expect(pAndQ).toEqual([[59, 165, 190, 67], [88, 86, 117, 215]]);
    });
  }
});

test('sha1', () => {
  CryptoWorker.sha1Hash(bytesFromHex('ec5ac983081eeb1da706316227000000044af6cfb1000000046995dd57000000d55105998729349339eb322d86ec13bc0884f6ba0449d8ecbad0ef574837422579a11a88591796cdcc4c05690da0652462489286450179a635924bcc0ab83848'))
  .then(buffer => {
    //console.log(bytesFromArrayBuffer(buffer));

    let bytes = bytesFromArrayBuffer(buffer);
    expect(bytes).toEqual([
      55, 160, 249, 190, 133, 135,
      3,  45,  56, 157, 186,  81,
      249,   0,  96, 235,  11,  10,
      173, 197
    ]);
  });
});

test('pbkdf2', () => {
  /* const crypto = require('crypto');

  Object.defineProperty(global.self, 'crypto', {
    value: {
      getRandomValues: arr => crypto.randomBytes(arr.length),
    },
  }); */

  /* let buffer = new Uint8Array([
    166, 101, 158, 215, 174, 249, 101, 150, 109, 155, 243, 
    250, 221, 227, 251, 39, 34, 108, 230, 63, 198, 98, 9, 
    95, 20, 66, 186, 1, 245, 240, 185, 238
  ]);

  let salt = new Uint8Array([
    40, 95, 205, 123, 107, 81, 255, 138, 0, 0, 0, 0, 0, 0, 0, 0
  ]);

  let iterations = 100000; */


});
