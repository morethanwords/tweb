/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// import aesjs from 'aes-js';
import randomize from '../../../helpers/array/randomize';
import cryptoMessagePort from '../../crypto/cryptoMessagePort';
import {Codec} from './codec';

/*
@cryptography/aes не работает с массивами которые не кратны 4, поэтому использую intermediate а не abridged
*/
export default class Obfuscation {
  /* private enc: aesjs.ModeOfOperation.ModeOfOperationCTR;
  private dec: aesjs.ModeOfOperation.ModeOfOperationCTR; */

  private id: number;
  private idPromise: Promise<Obfuscation['id']>;
  private process: (data: Uint8Array, operation: 'encrypt' | 'decrypt') => ReturnType<Obfuscation['_process']>;

  // private cryptoEncKey: CryptoKey;
  // private cryptoDecKey: CryptoKey;
  // private cryptoKey: CryptoKey;

  // private encIv: Uint8Array;
  // private decIv: Uint8Array;

  // private decIvCounter: Counter;

  public async init(codec: Codec) {
    if(this.idPromise !== undefined) {
      this.release();
    }

    const initPayload = new Uint8Array(64);
    randomize(initPayload);

    while(true) {
      const val = (initPayload[3] << 24) | (initPayload[2] << 16) | (initPayload[1] << 8) | initPayload[0];
      const val2 = (initPayload[7] << 24) | (initPayload[6] << 16) | (initPayload[5] << 8) | initPayload[4];
      if(initPayload[0] !== 0xef &&
          val !== 0x44414548 &&
          val !== 0x54534f50 &&
          val !== 0x20544547 &&
          val !== 0x4954504f &&
          val !== 0xeeeeeeee &&
          val !== 0xdddddddd &&
          val2 !== 0x00000000) {
        // initPayload[56] = initPayload[57] = initPayload[58] = initPayload[59] = transport;
        break;
      }
      randomize(initPayload);
    }

    // //////////////////////initPayload.subarray(60, 62).hex = dcId;
    /* initPayload.set(new Uint8Array([161, 208, 67, 71, 118, 109, 20, 111, 113, 255, 134, 10, 159, 241, 7, 44, 217, 82, 187, 76, 108, 131, 200, 186, 33, 57, 177, 251, 52, 34, 18, 54, 65, 105, 37, 89, 38, 20, 47, 168, 126, 181, 24, 138, 212, 68, 60, 150, 225, 37, 181, 4, 201, 50, 72, 151, 168, 143, 204, 169, 81, 187, 241, 23]));
    console.log('initPayload', initPayload); */

    const reversedPayload = initPayload.slice().reverse();

    const encKey = initPayload.slice(8, 40);
    const encIv = /* this.encIv =  */initPayload.slice(40, 56);
    const decKey = reversedPayload.slice(8, 40);
    const decIv = /* this.decIv =  */reversedPayload.slice(40, 56);

    /* this.enc = new aesjs.ModeOfOperation.ctr(encKey, new aesjs.Counter(encIv as any));
    this.dec = new aesjs.ModeOfOperation.ctr(decKey, new aesjs.Counter(decIv as any)); */

    // console.log('encKey', encKey.hex, encIv.hex);
    // console.log('decKey', decKey.hex, decIv.hex);

    const idPromise = this.idPromise = cryptoMessagePort.invokeCrypto('aes-ctr-prepare', {
      encKey,
      encIv,
      decKey,
      decIv
    });

    this.process = async(data, operation) => {
      await idPromise;
      return this._process(data, operation);
    };

    this.id = await idPromise;

    this.process = this._process;

    // this.decIvCounter = new Counter(this.decIv);
    /* const key = this.cryptoEncKey = await subtle.importKey(
      'raw',
      encKey,
      {name: 'AES-CTR'},
      false,
      ['encrypt']
    ); */

    // this.cryptoDecKey = await subtle.importKey(
    //   'raw',
    //   decKey,
    //   {name: 'AES-CTR'},
    //   false,
    //   ['encrypt']
    // );

    // this.cryptoKey = await subtle.importKey(
    //   'raw',
    //   encKey,
    //   {name: 'AES-CTR'},
    //   false,
    //   ['encrypt', 'decrypt']
    // );

    initPayload.set(codec.obfuscateTag, 56);
    const encrypted = await this.encode(initPayload.slice());

    // console.log('encrypted', encrypted);

    initPayload.set(encrypted.slice(56, 64), 56);

    return initPayload;
  }

  /* public encode(payload: Uint8Array) {
    let startTime = performance.now();
    let res = this.enc.encrypt(payload);
    let time = performance.now() - startTime;

    try {
      startTime = performance.now();
      let arr = this.encNew.encrypt(payload);
      //let resNew = bytesFromWords({words: arr, sigBytes: arr.length});
      let resNew = new Uint8Array(bytesFromWordss(arr));
      let time2 = performance.now() - startTime;
      console.log('Obfuscation: encode comparison:', res, arr, resNew, res.hex === resNew.hex, time2 < time);
    } catch(err) {
      console.error('Obfuscation: error:', err);
    }

    return res;
  }

  public decode(payload: Uint8Array) {
    let res = this.dec.encrypt(payload);

    try {
      let arr = this.decNew.decrypt(payload);
      //let resNew = bytesFromWords({words: arr, sigBytes: arr.length});
      let resNew = new Uint8Array(bytesFromWordss(arr));
      console.log('Obfuscation: decode comparison:', res, arr, resNew, res.hex === resNew.hex);
    } catch(err) {
      console.error('Obfuscation: error:', err);
    }

    return res;
  } */

  private _process = (data: Uint8Array, operation: 'encrypt' | 'decrypt') => {
    return cryptoMessagePort.invokeCryptoNew({
      method: 'aes-ctr-process',
      args: [{id: this.id, data, operation}],
      transfer: [data.buffer]
    }) as Promise<Uint8Array>;
  };

  public encode(payload: Uint8Array) {
    /* return subtle.encrypt({
        name: 'AES-CTR',
        counter: this.encIv,
        length: 64
      },
      this.cryptoEncKey,
      payload
    ); */
    return this.process(payload, 'encrypt');
  }

  public decode(payload: Uint8Array) {
    return this.process(payload, 'decrypt');
  }

  public async release() {
    const idPromise = this.idPromise;
    if(idPromise === undefined) {
      return;
    }

    this.id = undefined;
    this.idPromise = undefined;

    const id = await idPromise;
    cryptoMessagePort.invokeCrypto('aes-ctr-destroy', id);
  }

  public destroy() {
    this.release();
  }

  // public encode(payload: Uint8Array) {
  //   let res = this.encNew.encrypt(payload);
  //   let bytes = new Uint8Array(bytesFromWordss(res));

  //   return bytes;
  // }

  // public async decode(payload: Uint8Array) {
  //   const counter = this.decIvCounter.counter.slice();
  //   this.decIvCounter.increment();

  //   const n: ArrayBuffer = await subtle.encrypt({
  //       name: 'AES-CTR',
  //       counter: counter,
  //       length: 64
  //     },
  //     this.cryptoDecKey,
  //     payload
  //   );

  //   const decoded = this.decNew.update(payload);

  //   console.log('decode', bytesToHex(decoded), 'new', n, bytesToHex(new Uint8Array(n)));

  //   return decoded;
  // }
}
