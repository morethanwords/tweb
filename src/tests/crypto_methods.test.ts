import { bytesFromHex, bytesToHex } from '../helpers/bytes';
import CryptoWorker from '../lib/crypto/cryptoworker';
import type { RSAPublicKeyHex } from '../lib/mtproto/rsaKeysManager';
import '../lib/polyfill';

test('factorize', () => {
  for(let i = 0; i < 10; ++i) {
    CryptoWorker.invokeCrypto('factorize', new Uint8Array([20, 149, 30, 137, 202, 169, 105, 69])).then(pAndQ => {
      pAndQ.pop();
      expect(pAndQ).toEqual([new Uint8Array([59, 165, 190, 67]), new Uint8Array([88, 86, 117, 215])]);
    });
  }
});

test('sha1', () => {
  const bytes = new Uint8Array(bytesFromHex('ec5ac983081eeb1da706316227000000044af6cfb1000000046995dd57000000d55105998729349339eb322d86ec13bc0884f6ba0449d8ecbad0ef574837422579a11a88591796cdcc4c05690da0652462489286450179a635924bcc0ab83848'));
  CryptoWorker.invokeCrypto('sha1-hash', bytes)
  .then(bytes => {
    //console.log(bytesFromArrayBuffer(buffer));

    expect(bytes).toEqual(new Uint8Array([
      55, 160, 249, 190, 133, 135,
      3,  45,  56, 157, 186,  81,
      249,   0,  96, 235,  11,  10,
      173, 197
    ]));
  });
});

test('sha256', () => {
  CryptoWorker.invokeCrypto('sha256-hash', new Uint8Array([112, 20, 211, 20, 106, 249, 203, 252, 39, 107, 106, 194, 63, 60, 13, 130, 51, 78, 107, 6, 110, 156, 214, 65, 205, 10, 30, 150, 79, 10, 145, 194, 232, 240, 127, 55, 146, 103, 248, 227, 160, 172, 30, 153, 122, 189, 110, 162, 33, 86, 174, 117]))
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
    CryptoWorker.invokeCrypto('sha256-hash', pair[0]).then(bytes => {
      const hex = bytesToHex(bytes);
      expect(hex).toEqual(pair[1]);
    });
  });
});

test('rsa', () => {
  const publicKey: RSAPublicKeyHex = {
    // "fingerprint": "15032203592031600005",
    "modulus": "e8bb3305c0b52c6cf2afdf7637313489e63e05268e5badb601af417786472e5f93b85438968e20e6729a301c0afc121bf7151f834436f7fda680847a66bf64accec78ee21c0b316f0edafe2f41908da7bd1f4a5107638eeb67040ace472a14f90d9f7c2b7def99688ba3073adb5750bb02964902a359fe745d8170e36876d4fd8a5d41b2a76cbff9a13267eb9580b2d06d10357448d20d9da2191cb5d8c93982961cdfdeda629e37f1fb09a0722027696032fe61ed663db7a37f6f263d370f69db53a0dc0a1748bdaaff6209d5645485e6e001d1953255757e4b8e42813347b11da6ab500fd0ace7e6dfa3736199ccaf9397ed0745a427dcfa6cd67bcb1acff3",
    "exponent": "010001"
  };

  const bytes = new Uint8Array([
    128, 44, 176, 17, 43, 185, 92, 222, 101, 45, 211, 184, 175, 154, 
    124, 57, 15, 214, 164, 165, 113, 127, 147, 133, 5, 140, 185, 174, 
    99, 182, 38, 56, 213, 169, 199, 173, 52, 240, 128, 225, 246, 190, 
    234, 221, 108, 175, 228, 25, 204, 154, 57, 235, 143, 95, 98, 15, 
    8, 100, 65, 117, 58, 91, 110, 200, 76, 207, 234, 44, 21, 138, 99, 
    134, 212, 188, 177, 72, 177, 203, 60, 145, 209, 63, 35, 230, 185, 
    73, 26, 103, 199, 71, 54, 53, 183, 182, 218, 163, 209, 26, 248, 
    231, 170, 70, 224, 204, 137, 177, 9, 228, 176, 212, 231, 137, 
    104, 205, 1, 68, 172, 59, 53, 246, 33, 95, 193, 158, 52, 203, 
    230, 57, 177, 7, 190, 97, 183, 79, 154, 242, 187, 170, 65, 30, 82, 
    102, 10, 1, 188, 191, 69, 156, 174, 208, 173, 141, 58, 190, 46, 
    243, 78, 200, 129, 210, 184, 100, 130, 83, 191, 107, 192, 143, 44, 
    232, 163, 150, 67, 62, 15, 91, 141, 115, 172, 183, 206, 133, 131, 
    239, 149, 133, 39, 15, 187, 200, 239, 75, 209, 102, 27, 185, 223, 
    186, 156, 34, 112, 120, 223, 37, 105, 130, 184, 232, 56, 173, 0, 
    165, 156, 83, 207, 134, 167, 32, 57, 60, 177, 219, 127, 102, 247, 
    76, 60, 248, 16, 0, 232, 215, 5, 235, 79, 237, 181, 229, 216, 97, 
    45, 52, 252, 109, 44, 94, 55, 113, 248, 125, 60, 216, 152, 79, 4, 7
  ]);

  const good = new Uint8Array([
    166, 252, 51, 235, 146, 3, 147, 182, 43, 71, 71, 180, 236, 84, 235, 
    122, 40, 36, 254, 75, 52, 194, 162, 6, 166, 44, 227, 83, 148, 215, 
    72, 75, 80, 32, 100, 106, 172, 59, 220, 231, 233, 39, 122, 167, 255, 
    209, 132, 170, 109, 31, 151, 227, 70, 39, 196, 240, 25, 77, 255, 
    178, 17, 156, 153, 18, 19, 157, 208, 116, 49, 236, 150, 249, 245, 
    149, 226, 176, 101, 20, 201, 198, 177, 75, 166, 62, 151, 119, 64, 
    67, 253, 12, 199, 62, 210, 162, 59, 143, 170, 189, 66, 158, 51, 168, 
    56, 173, 231, 214, 100, 85, 54, 183, 1, 177, 162, 75, 245, 87, 205, 
    199, 245, 109, 60, 144, 78, 114, 38, 38, 71, 36, 34, 240, 40, 119, 
    154, 244, 35, 22, 5, 110, 174, 153, 62, 114, 182, 2, 180, 92, 137, 
    224, 218, 147, 197, 211, 168, 245, 147, 171, 80, 123, 178, 112, 76, 
    24, 104, 236, 117, 191, 60, 219, 25, 205, 128, 19, 59, 46, 67, 30, 
    240, 117, 194, 44, 247, 50, 55, 87, 139, 224, 23, 152, 129, 182, 
    101, 202, 24, 190, 67, 253, 63, 172, 210, 21, 151, 1, 30, 164, 52, 
    77, 75, 128, 86, 80, 177, 202, 69, 67, 65, 120, 217, 164, 251, 29, 
    86, 185, 43, 175, 22, 124, 10, 175, 181, 223, 130, 232, 47, 134, 67, 
    54, 226, 253, 25, 230, 197, 109, 205, 240, 242, 65, 233, 17, 98, 
    120, 106, 17, 142, 143, 9, 233
  ]);

  CryptoWorker.invokeCrypto('rsa-encrypt', bytes, publicKey).then(encrypted => {
    expect(encrypted).toEqual(good);
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
