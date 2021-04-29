import { bytesFromArrayBuffer, bytesFromHex, bytesToHex } from '../helpers/bytes';
import CryptoWorker from '../lib/crypto/cryptoworker';

test('factorize', () => {
  for(let i = 0; i < 10; ++i) {
    CryptoWorker.factorize(new Uint8Array([20, 149, 30, 137, 202, 169, 105, 69])).then(pAndQ => {
      pAndQ.pop();
      expect(pAndQ).toEqual([[59, 165, 190, 67], [88, 86, 117, 215]]);
    });
  }
});

test('sha1', () => {
  const bytes = new Uint8Array(bytesFromHex('ec5ac983081eeb1da706316227000000044af6cfb1000000046995dd57000000d55105998729349339eb322d86ec13bc0884f6ba0449d8ecbad0ef574837422579a11a88591796cdcc4c05690da0652462489286450179a635924bcc0ab83848'));
  CryptoWorker.sha1Hash(bytes)
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

test('sha256', () => {
  CryptoWorker.sha256Hash(new Uint8Array([112, 20, 211, 20, 106, 249, 203, 252, 39, 107, 106, 194, 63, 60, 13, 130, 51, 78, 107, 6, 110, 156, 214, 65, 205, 10, 30, 150, 79, 10, 145, 194, 232, 240, 127, 55, 146, 103, 248, 227, 160, 172, 30, 153, 122, 189, 110, 162, 33, 86, 174, 117]))
  .then(bytes => {  
    expect(bytes).toEqual(new Uint8Array([158, 59, 39, 247, 130, 244, 235, 160, 16, 249, 34, 114, 67, 171, 203, 208, 187, 72, 217, 106, 253, 62, 195, 242, 52, 118, 99, 72, 221, 29, 203, 95]));
  });

  const client_salt = new Uint8Array([58, 45, 208, 42, 210, 96, 229, 224, 220, 241, 61, 180, 91, 93, 132, 127, 29, 81, 244, 35, 114, 240, 134, 109, 60, 129, 157, 117, 214, 173, 161, 93, 61, 215, 199, 129, 184, 20, 247, 52]);
  
  // ! ! ! ! ! ! ! ! ! ! THIS IS WRONG WAY TO ENCODE AND CONCAT THEM AFTER ! ! ! ! ! ! ! ! ! ! ! ! !
  /* let clientSaltString = '';
  for(let i = 0; i < client_salt.length; i++) clientSaltString += String.fromCharCode(client_salt[i]); */

  const payload = [
    ['£', 'b4fe151e413445357b1c0935e7cf04a429492ebd23dc62bfadb2f898c431c1fd'],
    ['haha', '090b235e9eb8f197f2dd927937222c570396d971222d9009a9189e2b6cc0a2c1'],
    ['😂😘❤️😍😊😁👁👍🏿', 'f3cd34d2345934e10d95d01c7eae9040a6f3c4e20a02a392078b762d876ece8a'],
    ['$', '09fc96082d34c2dfc1295d92073b5ea1dc8ef8da95f14dfded011ffb96d3e54b'],
    //[clientSaltString + '😂😘❤️😍😊😁👁👍🏿' + clientSaltString, 'c2ac294f00e8ac4db6b94099f2014d763315cb2127b1e1ea178cfc3f302680d0'],
    [new Uint8Array(Array.from(client_salt).concat(Array.from(new TextEncoder().encode('😂😘❤️😍😊😁👁👍🏿')), Array.from(client_salt))), 'f11950fb40baf391b06a57e7490c8ad4d99ec0c1516c2bc7e529895296616ea7']
  ];

  payload.forEach(pair => {
    //const uint8 = new TextEncoder().encode(pair[0]);
    //CryptoWorker.sha256Hash(new Uint8Array(pair[0].split('').map(c => c.charCodeAt(0)))).then(bytes => {
    CryptoWorker.sha256Hash(pair[0]).then(bytes => {
      const hex = bytesToHex(bytes);
      expect(hex).toEqual(pair[1]);
    });
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
