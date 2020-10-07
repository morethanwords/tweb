//import aesjs from 'aes-js';
import { CTR } from "@cryptography/aes";
import { bytesFromWordss } from "../../bin_utils";
import { Codec } from "./codec";

/* 
@cryptography/aes не работает с массивами которые не кратны 4, поэтому использую intermediate а не abridged
*/
export default class Obfuscation {
  /* public enc: aesjs.ModeOfOperation.ModeOfOperationCTR;
  public dec: aesjs.ModeOfOperation.ModeOfOperationCTR; */

  public encNew: CTR;
  public decNew: CTR;

  public init(codec: Codec) {
    const initPayload = new Uint8Array(64);
    initPayload.randomize();
    
    while(true) {
      let val = (initPayload[3] << 24) | (initPayload[2] << 16) | (initPayload[1] << 8) | (initPayload[0]);
      let val2 = (initPayload[7] << 24) | (initPayload[6] << 16) | (initPayload[5] << 8) | (initPayload[4]);
      if(initPayload[0] != 0xef &&
          val != 0x44414548 &&
          val != 0x54534f50 &&
          val != 0x20544547 &&
          val != 0x4954504f &&
          val != 0xeeeeeeee &&
          val != 0xdddddddd &&
          val2 != 0x00000000) {
          //initPayload[56] = initPayload[57] = initPayload[58] = initPayload[59] = transport;
          break;
      }
      initPayload.randomize();
    }

    ////////////////////////initPayload.subarray(60, 62).hex = dcID;

    const reversedPayload = initPayload.slice().reverse();

    let encKey = initPayload.slice(8, 40);
    let encIv = initPayload.slice(40, 56);
    let decKey = reversedPayload.slice(8, 40);
    let decIv = reversedPayload.slice(40, 56);

    /* this.enc = new aesjs.ModeOfOperation.ctr(encKey, new aesjs.Counter(encIv as any));
    this.dec = new aesjs.ModeOfOperation.ctr(decKey, new aesjs.Counter(decIv as any)); */

    this.encNew = new CTR(encKey, encIv);
    this.decNew = new CTR(decKey, decIv);

    initPayload.set(codec.obfuscateTag, 56);
    const encrypted = this.encode(initPayload);

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
      console.log('Obfuscation: encode comparison:', res, arr, resNew, res.hex == resNew.hex, time2 < time);
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
      console.log('Obfuscation: decode comparison:', res, arr, resNew, res.hex == resNew.hex);
    } catch(err) {
      console.error('Obfuscation: error:', err);
    }
    
    return res;
  } */
  public encode(payload: Uint8Array) {
    let res = this.encNew.encrypt(payload);
    let bytes = new Uint8Array(bytesFromWordss(res));
    
    return bytes;
  }

  public decode(payload: Uint8Array) {
    let res = this.decNew.decrypt(payload);
    let bytes = new Uint8Array(bytesFromWordss(res));
    
    return bytes;
  }
}