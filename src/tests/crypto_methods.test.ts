import bytesFromHex from '../helpers/bytes/bytesFromHex';
import bytesToHex from '../helpers/bytes/bytesToHex';
import type {RSAPublicKeyHex} from '../lib/mtproto/rsaKeysManager';
import '../lib/crypto/crypto.worker';
import cryptoWorker from '../lib/crypto/cryptoMessagePort';

test('factorize', async() => {
  const data: {good?: [Uint8Array, Uint8Array], pq: Uint8Array}[] = [{
    good: [new Uint8Array([86, 190, 62, 123]), new Uint8Array([88, 30, 39, 1])],
    pq: new Uint8Array([29, 219, 156, 252, 236, 172, 251, 123])
  }, {
    good: [new Uint8Array([59, 165, 190, 67]), new Uint8Array([88, 86, 117, 215])],
    pq: new Uint8Array([20, 149, 30, 137, 202, 169, 105, 69])
  }, {
    good: [new Uint8Array([75, 215, 20, 103]), new Uint8Array([77, 137, 174, 55])],
    pq: new Uint8Array([22, 248, 122, 217, 97, 50, 100, 33])
  }, { // leemon cannot factorize that
    good: [new Uint8Array([59, 223, 139, 105]), new Uint8Array([62, 179, 202, 59])],
    pq: new Uint8Array([14, 170, 48, 94, 24, 240, 251, 51])
  }, {
    good: [new Uint8Array([11]), new Uint8Array([1, 15, 141])],
    pq: new Uint8Array([11, 171, 15])
  }, {
    good: [new Uint8Array([3]), new Uint8Array([5])],
    pq: new Uint8Array([15])
  }];

  const methods = [
    'factorize' as const
    // 'factorize-tdlib' as const,
    // 'factorize-new-new' as const
  ];

  for(const {good, pq} of data) {
    for(const method of methods) {
      const perf = performance.now();
      await cryptoWorker.invokeCrypto(method, pq).then((pAndQ) => {
        // console.log(method, performance.now() - perf, pAndQ);
        if(good) {
          expect(pAndQ).toEqual(good);
        }
      });
    }

    // break;
  }
});

test('sha1', () => {
  const bytes = new Uint8Array(bytesFromHex('ec5ac983081eeb1da706316227000000044af6cfb1000000046995dd57000000d55105998729349339eb322d86ec13bc0884f6ba0449d8ecbad0ef574837422579a11a88591796cdcc4c05690da0652462489286450179a635924bcc0ab83848'));
  cryptoWorker.invokeCrypto('sha1', bytes)
  .then((bytes) => {
    // console.log(bytesFromArrayBuffer(buffer));

    expect(bytes).toEqual(new Uint8Array([
      55, 160, 249, 190, 133, 135,
      3,  45,  56, 157, 186,  81,
      249,   0,  96, 235,  11,  10,
      173, 197
    ]));
  });
});

test('sha256', () => {
  cryptoWorker.invokeCrypto('sha256', new Uint8Array([112, 20, 211, 20, 106, 249, 203, 252, 39, 107, 106, 194, 63, 60, 13, 130, 51, 78, 107, 6, 110, 156, 214, 65, 205, 10, 30, 150, 79, 10, 145, 194, 232, 240, 127, 55, 146, 103, 248, 227, 160, 172, 30, 153, 122, 189, 110, 162, 33, 86, 174, 117]))
  .then((bytes) => {
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
    // [clientSaltString + '😂😘❤️😍😊😁👁👍🏿' + clientSaltString, 'c2ac294f00e8ac4db6b94099f2014d763315cb2127b1e1ea178cfc3f302680d0'],
    [new Uint8Array(Array.from(client_salt).concat(Array.from(new TextEncoder().encode('😂😘❤️😍😊😁👁👍🏿')), Array.from(client_salt))), 'f11950fb40baf391b06a57e7490c8ad4d99ec0c1516c2bc7e529895296616ea7']
  ];

  payload.forEach((pair) => {
    // const uint8 = new TextEncoder().encode(pair[0]);
    // CryptoWorker.sha256Hash(new Uint8Array(pair[0].split('').map((c) => c.charCodeAt(0)))).then((bytes) => {
    cryptoWorker.invokeCrypto('sha256', pair[0]).then((bytes) => {
      const hex = bytesToHex(bytes);
      expect(hex).toEqual(pair[1]);
    });
  });
});

test('rsa', () => {
  const publicKey: RSAPublicKeyHex = {
    // "fingerprint": "15032203592031600005",
    'modulus': 'e8bb3305c0b52c6cf2afdf7637313489e63e05268e5badb601af417786472e5f93b85438968e20e6729a301c0afc121bf7151f834436f7fda680847a66bf64accec78ee21c0b316f0edafe2f41908da7bd1f4a5107638eeb67040ace472a14f90d9f7c2b7def99688ba3073adb5750bb02964902a359fe745d8170e36876d4fd8a5d41b2a76cbff9a13267eb9580b2d06d10357448d20d9da2191cb5d8c93982961cdfdeda629e37f1fb09a0722027696032fe61ed663db7a37f6f263d370f69db53a0dc0a1748bdaaff6209d5645485e6e001d1953255757e4b8e42813347b11da6ab500fd0ace7e6dfa3736199ccaf9397ed0745a427dcfa6cd67bcb1acff3',
    'exponent': '010001'
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

  cryptoWorker.invokeCrypto('rsa-encrypt', bytes, publicKey).then((encrypted) => {
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

test('mod-pow', () => {
  const g_a = new Uint8Array([
    0xa8, 0x8b, 0xf9, 0xeb, 0xf9, 0x15, 0x19, 0x11, 0xdf, 0x3b, 0x1, 0x82, 0x52,
    0x9c, 0x8f, 0xe1, 0xcd, 0x6, 0xf0, 0x46, 0xf7, 0x50, 0x34, 0x53, 0xe, 0xb9,
    0x51, 0x21, 0x6d, 0xab, 0x1a, 0x36, 0x9d, 0x45, 0x3a, 0x7c, 0x62, 0x4a, 0x41,
    0x4e, 0x0, 0x15, 0x42, 0x87, 0xfc, 0xef, 0x51, 0x2d, 0xfa, 0x6f, 0x5b, 0xde,
    0xfb, 0x74, 0x62, 0xc3, 0x19, 0x20, 0x74, 0x91, 0x75, 0x84, 0xf2, 0xa8, 0x4b,
    0xd8, 0x62, 0xb0, 0xb4, 0x19, 0xfe, 0x9, 0x65, 0x8, 0x94, 0xae, 0x27, 0xd2,
    0x82, 0xd9, 0x96, 0xd9, 0xad, 0x1f, 0xbd, 0xef, 0xce, 0x77, 0x62, 0x6c, 0x7f,
    0x79, 0xf5, 0x62, 0xbc, 0xd6, 0x4c, 0xf3, 0x6, 0x31, 0xf4, 0xf7, 0x3f, 0xc1,
    0xde, 0x99, 0x41, 0x15, 0xec, 0x5d, 0xea, 0x98, 0x4f, 0x2b, 0x71, 0x70, 0x6d,
    0xc3, 0x39, 0x44, 0x7a, 0x37, 0x25, 0xa2, 0x25, 0x46, 0xdd, 0xd9, 0x4, 0x6b,
    0xf0, 0xe5, 0xd7, 0x3f, 0x1, 0x32, 0x20, 0x2f, 0xfa, 0xc5, 0xbd, 0x69, 0xc0,
    0xa5, 0x26, 0xb0, 0x2d, 0xa7, 0x7d, 0xa7, 0x39, 0xe4, 0x2d, 0xb6, 0x32, 0x95,
    0xdf, 0x56, 0x88, 0x8c, 0x82, 0xe7, 0xc6, 0x89, 0x78, 0xfd, 0xe3, 0xb2, 0xc1,
    0xd7, 0x3f, 0x95, 0x33, 0xb9, 0x9d, 0xbe, 0x4c, 0x95, 0x6b, 0x24, 0x21, 0xda,
    0xa1, 0xa3, 0xab, 0xcd, 0x88, 0x45, 0xd5, 0x49, 0x92, 0xc5, 0x46, 0x21, 0xca,
    0x8b, 0x51, 0xc7, 0x61, 0x7e, 0x68, 0x75, 0xf7, 0x4e, 0x53, 0x55, 0xce, 0xc6,
    0xa1, 0x8d, 0x99, 0x2d, 0x50, 0x50, 0x2b, 0x51, 0x8c, 0x9, 0x8f, 0x49, 0xdd,
    0x33, 0x98, 0xa9, 0x70, 0x1a, 0x8f, 0xc2, 0xf4, 0x4d, 0x2b, 0xab, 0x9b, 0x90,
    0x8e, 0x1e, 0xfe, 0x1a, 0xe2, 0xfb, 0xe, 0x44, 0x58, 0x43, 0xc3, 0x94, 0x65,
    0x92, 0x90, 0xa0, 0xd, 0x30, 0xdf, 0x9b, 0x1c, 0x45
  ]);

  const randomPower = new Uint8Array([
    0xbc, 0x52, 0x41, 0x6a, 0x18, 0x8b, 0x7a, 0x51, 0x99, 0xc2, 0x3d, 0x1a, 0xaa, 0xda,
    0xda, 0x8a, 0xb4, 0x4d, 0x77, 0x1b, 0x3a, 0x54, 0xaf, 0x1c, 0x48, 0xdc, 0x9b, 0x6b,
    0x59, 0x85, 0xbf, 0xa, 0xd6, 0x52, 0x92, 0x6f, 0xf3, 0xc2, 0xbd, 0x46, 0xb6, 0x13,
    0xf7, 0xe0, 0x39, 0xcc, 0x6a, 0x9d, 0xee, 0x5d, 0xa4, 0x49, 0x94, 0x7b, 0xa6, 0xa3,
    0x53, 0xa4, 0x38, 0xfd, 0x7a, 0xf9, 0xbf, 0xc0, 0xa8, 0x46, 0x1a, 0xb8, 0x3e, 0x49,
    0xb7, 0xf7, 0xbf, 0x5d, 0xf4, 0x9, 0x95, 0x41, 0x23, 0x3d, 0x35, 0x50, 0x49, 0x4,
    0xce, 0x5f, 0x26, 0xc9, 0x2b, 0x54, 0x78, 0x66, 0x1a, 0x9e, 0xd9, 0x2d, 0xb1, 0x79,
    0x7c, 0xb4, 0xd0, 0x1d, 0xe3, 0x62, 0x81, 0x12, 0x98, 0xf5, 0x90, 0xf3, 0xd5, 0x71,
    0xee, 0x48, 0xb6, 0xae, 0xd6, 0x5f, 0x85, 0x59, 0xce, 0x36, 0x96, 0xa3, 0xa5, 0xa3,
    0x96, 0x64, 0xe, 0x7e, 0xa4, 0xa1, 0x3c, 0x9b, 0x68, 0x33, 0x67, 0xd7, 0xf3, 0x3f,
    0x85, 0x15, 0x34, 0x6c, 0xd0, 0x7a, 0x94, 0x75, 0x12, 0xf2, 0x1, 0x98, 0x1, 0x90,
    0x11, 0xbd, 0xa1, 0xa0, 0xda, 0x79, 0x3, 0xce, 0x22, 0x21, 0x69, 0xdf, 0x5d, 0x9a,
    0xee, 0xd7, 0x98, 0xae, 0x1e, 0x74, 0x96, 0xb3, 0xda, 0xbd, 0x31, 0x4b, 0xb4, 0x71,
    0x14, 0xba, 0xfa, 0xa9, 0x1, 0x62, 0x46, 0x7d, 0x35, 0x1c, 0xbf, 0x88, 0xa4, 0x46,
    0x45, 0xb1, 0x91, 0x89, 0x69, 0xfb, 0x9f, 0xf, 0x9a, 0x8b, 0xe, 0xc0, 0xfc, 0xa,
    0x7b, 0x78, 0x16, 0xe5, 0xce, 0x90, 0x4e, 0xb2, 0xf0, 0x39, 0x2c, 0xbd, 0x1e, 0xa9,
    0xdc, 0x5c, 0xc1, 0x35, 0x29, 0xe2, 0xc4, 0x1a, 0x9a, 0xd7, 0xb5, 0x69, 0x30, 0xf2,
    0x72, 0xc2, 0x6d, 0x90, 0x49, 0x48, 0x49, 0xc5, 0x87, 0x96, 0xa5, 0xf3, 0xb6, 0xa6,
    0xc, 0xe5, 0xf8, 0x8e
  ]);

  const p = new Uint8Array([
    0xc7, 0x1c, 0xae, 0xb9, 0xc6, 0xb1, 0xc9, 0x4, 0x8e, 0x6c, 0x52, 0x2f, 0x70, 0xf1,
    0x3f, 0x73, 0x98, 0xd, 0x40, 0x23, 0x8e, 0x3e, 0x21, 0xc1, 0x49, 0x34, 0xd0, 0x37,
    0x56, 0x3d, 0x93, 0xf, 0x48, 0x19, 0x8a, 0xa, 0xa7, 0xc1, 0x40, 0x58, 0x22, 0x94,
    0x93, 0xd2, 0x25, 0x30, 0xf4, 0xdb, 0xfa, 0x33, 0x6f, 0x6e, 0xa, 0xc9, 0x25, 0x13,
    0x95, 0x43, 0xae, 0xd4, 0x4c, 0xce, 0x7c, 0x37, 0x20, 0xfd, 0x51, 0xf6, 0x94, 0x58,
    0x70, 0x5a, 0xc6, 0x8c, 0xd4, 0xfe, 0x6b, 0x6b, 0x13, 0xab, 0xdc, 0x97, 0x46, 0x51,
    0x29, 0x69, 0x32, 0x84, 0x54, 0xf1, 0x8f, 0xaf, 0x8c, 0x59, 0x5f, 0x64, 0x24, 0x77,
    0xfe, 0x96, 0xbb, 0x2a, 0x94, 0x1d, 0x5b, 0xcd, 0x1d, 0x4a, 0xc8, 0xcc, 0x49, 0x88,
    0x7, 0x8, 0xfa, 0x9b, 0x37, 0x8e, 0x3c, 0x4f, 0x3a, 0x90, 0x60, 0xbe, 0xe6, 0x7c,
    0xf9, 0xa4, 0xa4, 0xa6, 0x95, 0x81, 0x10, 0x51, 0x90, 0x7e, 0x16, 0x27, 0x53, 0xb5,
    0x6b, 0xf, 0x6b, 0x41, 0xd, 0xba, 0x74, 0xd8, 0xa8, 0x4b, 0x2a, 0x14, 0xb3, 0x14,
    0x4e, 0xe, 0xf1, 0x28, 0x47, 0x54, 0xfd, 0x17, 0xed, 0x95, 0xd, 0x59, 0x65, 0xb4,
    0xb9, 0xdd, 0x46, 0x58, 0x2d, 0xb1, 0x17, 0x8d, 0x16, 0x9c, 0x6b, 0xc4, 0x65, 0xb0,
    0xd6, 0xff, 0x9c, 0xa3, 0x92, 0x8f, 0xef, 0x5b, 0x9a, 0xe4, 0xe4, 0x18, 0xfc, 0x15,
    0xe8, 0x3e, 0xbe, 0xa0, 0xf8, 0x7f, 0xa9, 0xff, 0x5e, 0xed, 0x70, 0x5, 0xd, 0xed,
    0x28, 0x49, 0xf4, 0x7b, 0xf9, 0x59, 0xd9, 0x56, 0x85, 0xc, 0xe9, 0x29, 0x85, 0x1f,
    0xd, 0x81, 0x15, 0xf6, 0x35, 0xb1, 0x5, 0xee, 0x2e, 0x4e, 0x15, 0xd0, 0x4b, 0x24,
    0x54, 0xbf, 0x6f, 0x4f, 0xad, 0xf0, 0x34, 0xb1, 0x4, 0x3, 0x11, 0x9c, 0xd8, 0xe3,
    0xb9, 0x2f, 0xcc, 0x5b
  ]);

  cryptoWorker.invokeCrypto('mod-pow', g_a, randomPower, p).then((encrypted) => {
    const good = new Uint8Array([
      0x2c, 0xb2, 0x4, 0xe7, 0xa8, 0x63, 0x5f, 0x3e, 0xd0, 0x67, 0x5f, 0x76, 0x87, 0x37, 0x56, 0xc2,
      0x2d, 0xe7, 0xd, 0xe3, 0x9b, 0xbd, 0x9d, 0xf6, 0x3b, 0x1f, 0xc, 0xb4, 0x37, 0xc6, 0xf, 0x75,
      0x83, 0x1a, 0x8b, 0x65, 0x73, 0xf6, 0x83, 0x64, 0x16, 0x7e, 0xb3, 0xd8, 0xc1, 0xd, 0x1d, 0x69,
      0xf4, 0x4, 0x25, 0x80, 0x6, 0x3b, 0xc7, 0x70, 0x55, 0xdb, 0x7d, 0x99, 0x39, 0x18, 0x6e, 0xcb,
      0x35, 0x98, 0x9f, 0xa2, 0x47, 0x63, 0x2c, 0x1b, 0xaf, 0x13, 0xdc, 0x1e, 0x52, 0xf5, 0x36, 0x5e,
      0xc5, 0x41, 0xd5, 0x4, 0x2b, 0x9c, 0x28, 0xee, 0xcf, 0x89, 0xa8, 0xcb, 0x6e, 0x43, 0xda, 0xbc,
      0xbf, 0xcd, 0x12, 0xa8, 0x32, 0xe8, 0x3d, 0x27, 0x5f, 0xfb, 0xa9, 0x5, 0xa, 0x29, 0xfa, 0x70,
      0x5e, 0x96, 0x8b, 0xd1, 0xe5, 0xdf, 0x4d, 0xfe, 0xed, 0xfc, 0xc1, 0xd9, 0x67, 0x25, 0x1b, 0x5a,
      0x5b, 0x26, 0x41, 0x83, 0x52, 0x89, 0xf9, 0xb3, 0xed, 0x9d, 0xfd, 0xa3, 0xce, 0xbc, 0x5, 0x27,
      0xd8, 0x54, 0xef, 0x4f, 0x4e, 0x73, 0xa1, 0xd5, 0x7d, 0x92, 0xdc, 0xe5, 0x64, 0xcd, 0x83, 0x87,
      0x31, 0x98, 0xf5, 0x3f, 0x27, 0xd0, 0x78, 0x4b, 0x47, 0x58, 0x8b, 0x4f, 0x77, 0x8a, 0x1a, 0x85,
      0x37, 0xc2, 0x68, 0xe9, 0xbc, 0xbe, 0x38, 0x2d, 0x51, 0xd3, 0x68, 0x89, 0xa1, 0x41, 0x38, 0x9c,
      0xd6, 0x1c, 0x30, 0xf4, 0x83, 0x85, 0xba, 0x43, 0x12, 0xc, 0xff, 0xb3, 0x35, 0x43, 0xf7, 0x8f,
      0x26, 0xb3, 0xcb, 0xfd, 0xa0, 0x27, 0xfc, 0xe2, 0xbd, 0x9d, 0xa9, 0xbf, 0x8e, 0xe, 0xf6, 0x88,
      0x83, 0xc3, 0x4d, 0xae, 0x7c, 0x2, 0x7e, 0xcc, 0x9d, 0xb1, 0x4f, 0x28, 0x20, 0xed, 0x13, 0x32,
      0x5b, 0x36, 0x1b, 0x50, 0x5a, 0xf2, 0x86, 0x35, 0xb2, 0x9f, 0x24, 0xf5, 0x64, 0xb3, 0x11, 0x75
    ]);
    expect(encrypted).toEqual(good);
  });
});

describe('AES-CTR', () => {
  let id: number;

  const update = (data: Uint8Array, operation: 'encrypt' | 'decrypt') => {
    return cryptoWorker.invokeCrypto('aes-ctr-process', {
      id,
      operation,
      data
    });
  };

  const encrypt = (data: Uint8Array) => update(data, 'encrypt');
  const decrypt = (data: Uint8Array) => update(data, 'decrypt');

  beforeAll(async() => {
    id = await cryptoWorker.invokeCrypto('aes-ctr-prepare', {
      encKey: bytesFromHex('903547a2e1ebb870f90c44bcf2d221b33fe8e28130e7995a3cf7840ff37758ae'),
      encIv: new Uint8Array([125, 161, 46, 206, 12, 22, 182, 3, 245, 28, 86, 210, 27, 124, 142, 9]),
      decKey: bytesFromHex('f8b5c86802a2a15484818e857be700cc2c3ddf711e5eb421085d629f0c73eec0'),
      decIv: bytesFromHex('04baf6934a65f5521e1f806e573c0ca0')
    });
  });

  test('encrypt', async() => {
    const data = bytesFromHex('456136662b69f651903547a2e1ebb870f90c44bcf2d221b33fe8e28130e7995a3cf7840ff37758ae7da12ece0c16b603f51c56d21b7c8e09eeeeeeeeb412c889');
    const good = bytesFromHex('fb27fdb80eccf756fb9db6d9f017f9cbaacef72ba72e114949c7cb91bad86379e66185a9c31e572b89974dbac5b7e65b9f9e16c8ef025b94f749505daa4b44a8');

    const encryptedHead = await encrypt(data.slice(0, data.length / 2));
    const encryptedTail = await encrypt(data.slice(data.length / 2));

    const encrypted = encryptedHead.concat(encryptedTail);

    expect(encrypted).toEqual(good);

    // expect(encrypted).toEqual(good);
  });

  test('decrypt', async() => {
    type Encrypted = string;
    type Result = string;

    const d: [Encrypted, Result][] = [
      [
        '936b3c355acf7ba813458bcb3140e61563cc2482fd7f4361934f5f05d89f96dd538138228d287a03b78b29359371d3da4a113a6f9994fe21f8bd9211b8fa381a7ecd4b62eed9fcaa67e811420ed5118f47ee643f756d9ff4260d1d464b3fe77abd213be525cab67e4b13e8b02d3636dc0521de5e6aee0519a8ea341737a5ef7d02754f92e65a00e14f637b034bdb72e39f87ede8564a993ab4e094f3b8c72cc4d593b34bc3164f32e3c0d79a',
        'a8000000e6d7e7ea201eb5b6ce82273d0014ddd51fd934b9680755dc93822a171d13119f93a50abccefa26d4f7c5c14c61ab41e6e86194572c031b5bfd3ed19cd157c9e85cb3ac1c39cc0214ed3046cf1223afe31a5a7a575a18d8b40f23231467e0a39cc0d2210c09d84064b1136213079142b8d9670b3832b4182d4a447fb1eddfe092997ef8ee6d18d5b6b418d7ef4795ed0331757151c0776721bfa3af61ddc8d9e37c226d171c458bf8'
      ],
      [
        'c88edd6fcb36feddaf6aef8c620fce7c30a18680088eeba58bc34c121a2d0ac21a4b03ee4a2f85f776748044646145cc1d41a3c3d5d8864c62db0872bd11a752658c179da5137bf195f05cba6fe8e6fe764568db30814eb6115d4147f9af3f5ca20be85330cf7ffef77c38f2b43f1daab8bf52ad8e54d53dbe731931b18ec37f98efe892f0ff1ba1ca9979340352199959369b74dc3fbbe9985eb09fc6779ec02b98042ca2f3dd4a142fc30615506b82bb315ea8754f5eea3211a09648ddfeeca70fbc6be6a4f2cec3c2d747fb3a358610b4ee2b3b5aa7d61687221d128ca1327c7dca54eaeecbf2f58da038',
        'e8000000e6d7e7ea201eb5b62219b0df13aa2b0857f4a2a0eefc0993c14668a4ea14a31fb0729dc0127d932872a5c4e85d2719877a84c3a8a9130ff1039ee76299519821e70db62285b8e76f4d98a9adf59fed3de86a0570efabb3b954cdfe7121875a4cb4e58b645ea0b087b9c2460f17692a90b40c4c493b37eb640c3055dd90591555d4231e0e0c969459641a1584a85bd6077addf8b0e59e895cd349e3a6e4cfa21f3b20f04351d68d76c09e9e65e1e63efa3dde1e1c35c4079b65374dd953c0d6acc350481e3579cdf70f4842e826d4d94c0856add9b25f33667f2f91d16a896d02a3e3842d9ff958db'
      ],
      [
        '572b8ecfc55f4def8851060b1d735d3bcf7a6eb44151d706bad2433def1328871a44b92c91c6db6212ccd00edb7ba12b0a513b8fd9a2b5825d9a4f8eff4fad16efa1698831e1b50e073b9a6018b748232f62948e0fee362f2838dc93',
        '58000000e6d7e7ea201eb5b6194960d91337596e719b06fbcde881657af37f8a589cf857f18a7de39494f00b3b91b744e7ed85fb9f2d9a94bbce8df2cb394714087ea5cabfce30b0c5f2de76949345fcec4490f4d47a31251b3b165a'
      ],
      [
        '238240e4b9747a8bb205a01433ecbc386958c3078ec6367cf1ad72f8c9797b44f343f7b9e096bbdcbc0c1f6d9bd702b2932d59c8217eb3b8cd07c65bf035bce687b0fefcc3cbc7cbef1e88636cff3166a6a6cf8b5e066ab117c1e6bb0aca03ce8040723e55e8557b04ff7bb1527c9e20a993024cf7fc68c79d402d268213ad4bfa7c6f36097f02df6481693eaed8dca524b9e1252f6c43449d45ba2a0f4bd51f5ad4be237212b5a2134a9f68c50629ab378b269904fd278db36e47c52e9215a01c98aea9a32dac058dcdd872c82c1b94e6da57c81ed321f25fa1466f0e45a88b2b2cb94617c0ee1f73a89d5b929c6f8123cadb7d7d2bb278338544aab16b3adefeb67c75e2c9aa8f1bc44175708f9c1d20e795128f6da6cb8194dc40',
        '18010000e6d7e7ea201eb5b69ef2cc509668070a62fa127127ae832e0be123b883a1a2d4b6bcf6ad74bb17db2deaa5a5159e27fa1bcea9604f0d263e0f0e51a0534f7a8ca56df96d64c1a48858d8e609e176c1909c361d34d2f67ef562b05082761d68d16aef488909c551d4c32fb6ca886429e72f020d988aec9fe6b82664e509572eceb66be95af218cc3770dbe630c0ab6bef3068bf948fb402b3f76850d303e8251aa0187f86ab1931fdbcbfecf16e10c14d94b6084a0921e948649fc42e6768f7baaccf98c9952293a1a27e3a137a66909807d4b0c26775624c2bf139ce6fae00f0a2c88e2a3f2230c55115f52cee1ea879029d09dca785fad336b3448f46bb652a3ec0152e05b32a183c06797a1ade4ee2044578a9241a1736'
      ],
      [
        '59ce1962c20e4cc53090be98852906c8e946d4493afe8e75134535b0da711d1b5fea782b721e4901b75525e398474c6745c63261d9c8710e92b79c4fa6389f9c7ee23fa1feb486f0ae8760fa2484a75d862c165d9bf7752af28391dd',
        '58000000e6d7e7ea201eb5b6a990ec5577912dcdc7d3222584d905f6da3bef5129f0ee3cf8fb1fa769ec19d41a8f11ec95ea9ebefc29023d936185119833dec04a77ef1727f094f077ee1bc9459ffb31cc2e38f9728bab8c9560b28f'
      ],
      [
        '380806b1e89cb996a074e33e6977afd0f87c744ce083e50c689f151502be49197bcd274a553271087011ee4ed58a4c1251c791b15c42bd1fe40dc65cd9b33e96b23afa767a898120ae428d587b8cd50c80bdf45b622aea2a511203ad891a9b4274f17d70d283d017592a3449bc9ed46448dd34de0939e97ec6de00133997d488e2de533fc2ecd9039e15276f0ec5277d776cb3174fe994449ff4d9fafeeee22384d2234ebe30e8ddcbd4be6095a0aa50b3f58a8e35392ebc950fd3f8bde6b4d0a9788c711581a67e2828030cf04b59193b145f66da3461f2dc198cb3e391f87d23e9b71e807a39e9cc09398c085b9d788cc549cfe305a9f60a43d7c1a1fa91f69c52ea18450e2ae7637adc18907838a65678b74c60925986a5c9ed19f43dee5ddb75a675edea95c80cb1350a7595fd046d4b2d3df7551745df339be40cd00915c7b5ce0d0ccc66f2e9165a84a3b954f6b6386e8fe2d2b420d5cadb29460bbcb461b872704013769a6e599f10c98118dd5789761a9b4aeb65c18f80a2e5cf1cc3b91cc08998141dcd6eb886aa633eb9c7f006380823aa748361f1e4a30e43e3c03191850413cbbc62361c5be5a397366f49a1a70286c6782f3d52666467c1a0fc104e076399d1827190f96b37a9a82833a5a07068b6dee7aab637d9d9a7837f12f28ac962c7b13c371d81040361a2d495e86373c350f50ade9fca3d24053d9dfdf5f5685be2e31b29d063ae98738260a170cd6ef5dd8b932c2bef6eb45ccb67033b5d8adee39a798d2ede6c75736cc72fe2c850f7407787614988c748de99dacf35890dd2957f5c4f0099e4606e1742ea5c2453c99c8e1a5bd4aef9f467796cbe63c61a9679653478b2df4e236f38205525ec7e959450401447cc3b7444e6a1550d47e9317e5946382fe34b08cce159afbe567d26330b49b1d617a087',
        '98020000e6d7e7ea201eb5b6e83e886240034bdb2ae8f8016646029ae079744001fd886d33b867d9167847a13255d0555c25dde380dc16cf2574629a9218887feb45aa74a3b2cb85ac5be473ee38df529a9eca950cde2bc7b9623e314107fdc0da0a52336b762dad71bc949444bf86ca6072e57ffb3a5039a79c37a477d14a2e31ba462fbab280e0a09a204d4faf145578dabb217e47b4963647b9d2765863b2923d778f12dc1625995c409a112c7b196eebdf4b4975e31b46e8f00b0066530da243710961fa4b152a6c37a600fabaf23007843f54c59d337f63352c2feb58be2ae7f90a10cb265ff07a43fef6cfd01ffd7abbec2a04e6815f15815ab77ae7c94eb4bb4bab0a4073a57bf224e7e6ea03600985e04229f635298ec7cfce97720a0cb1eb32d2e60dfe740ce6ee3cc5e969fa27a87e49ed1a36c27f790ed276f78f9e48d776442fce96a037aeff007f7383f22ce2f85328dd39f49eb0ad487203febf22ea21eef6b70eabef38317bf96ef8f9217e199c31cabe17ff7a287d5cee494c7ef4b4d8cf3351c038787a57b3a633f7af7ecdbd096f8ca925d54c209c8d9e88f7762b678f7aacfeddbf04acf35e407e9d7924f8c447e108c991f1807763afe961cc754a96343ee908986cfa508daaf7ed0f34eebcf3dcd503ccbcc9bcaa3418c0f50c37f419bca218fc2e79520ffa36a8c42cbcf9b409d44d6e29e56106336d2a9c7adebe7db7170afdf9195bc3a5d8f4fe656dec15d058d091106dd791107199f8d40c1ab69056c616a02a5156858ebfff210360aa85c5228e1ecbde92ffc464f6829cf028e8d6a67fe05ce8776fa1daf2d57059822dd1c9782b0217dc896eafcbadcf14eccd776c6b78cf662370a72f45c083b8b984a873bce4885662dd552e4408134963549f8fa922914880669337e37f03122fc11cbeb362'
      ]
    ];

    for(const [encryptedHex, resultHex] of d) {
      const encrypted = bytesFromHex(encryptedHex);
      const promise = decrypt(encrypted);
      promise.then((decrypted) => {
        expect(bytesToHex(decrypted)).toEqual(resultHex);
      });
    }
  });
});
