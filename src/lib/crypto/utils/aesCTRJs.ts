/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import AES from '@cryptography/aes';
import bytesFromWordss from '../../../helpers/bytes/bytesFromWordss';

export class Counter {
  public counter: Uint8Array;

  constructor(initialValue: Uint8Array) {
    this.counter = initialValue;
  }

  public increment() {
    const counter = this.counter;
    for(let i = 15; i >= 0; --i) {
      if(counter[i] === 255) {
        counter[i] = 0;
      } else {
        ++counter[i];
        break;
      }
    }
  }
}

export default class CTR {
  #counter: Counter;
  #remainingCounter: Uint8Array;
  #remainingCounterIndex: number;
  #aes: AES;
  #cryptoKey: CryptoKey;

  constructor(key: Uint8Array, counter: Uint8Array, cryptoKey: CryptoKey) {
    this.#counter = new Counter(counter);
    this.#aes = new AES(key);
    this.#remainingCounterIndex = 16;
    this.#cryptoKey = cryptoKey;
  }

  public get counter() {
    return this.#counter;
  }

  public update(payload: Uint8Array) {
    const encrypted = payload.slice();

    for(let i = 0; i < encrypted.length; ++i) {
      if(this.#remainingCounterIndex === 16) {
        this.#remainingCounter = new Uint8Array(bytesFromWordss(this.#aes.encrypt(this.#counter.counter)));
        this.#remainingCounterIndex = 0;
        this.#counter.increment();
      }

      encrypted[i] ^= this.#remainingCounter[this.#remainingCounterIndex++];
    }

    return encrypted;
  }
}
