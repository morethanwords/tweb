/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {BigInteger} from 'big-integer';
import {bigIntFromBytes, bigIntToBytes} from '../../../helpers/bigInt/bigIntConversion';
import addPadding from '../../../helpers/bytes/addPadding';
import subtle from '../subtle';

const COUNTER_LENGTH = 16;

export default class CTR {
  private cryptoKey: CryptoKey;
  // private encLeft: Uint8Array;
  private leftLength: number;
  private mode: 'encrypt' | 'decrypt';
  private counter: BigInteger;
  private queue: {data: Uint8Array, resolve: (data: Uint8Array) => void}[];
  private releasing: boolean;

  constructor(mode: 'encrypt' | 'decrypt', cryptoKey: CryptoKey, counter: Uint8Array) {
    this.mode = mode;
    this.cryptoKey = cryptoKey;
    this.queue = [];
    this.counter = bigIntFromBytes(counter);
  }

  public async update(data: Uint8Array) {
    return new Promise<Uint8Array>((resolve) => {
      this.queue.push({data, resolve});
      this.release();
    });
  }

  private async release() {
    if(this.releasing) {
      return;
    }

    this.releasing = true;
    while(this.queue.length) {
      const {data, resolve} = this.queue.shift();
      resolve(await this._update(data));
    }
    this.releasing = false;
  }

  private async perform(data: Uint8Array) {
    const arrayBuffer: ArrayBuffer = await subtle[this.mode]({
      name: 'AES-CTR',
      counter: addPadding(bigIntToBytes(this.counter), COUNTER_LENGTH, true, true, true),
      length: 128
    },
    this.cryptoKey,
    data
    );

    return arrayBuffer;
  }

  private async _update(data: Uint8Array) {
    let toEncrypt = data;
    let head: Uint8Array/* , tail: Uint8Array */;
    if(this.leftLength) {
      // const leftLength = this.encLeft.byteLength;
      const leftLength = this.leftLength;
      const leftLength2 = COUNTER_LENGTH - leftLength;
      // const left = this.encLeft.concat(toEncrypt.slice(0, leftLength2));
      const left = (new Uint8Array(leftLength)).concat(toEncrypt.slice(0, leftLength2));

      const performed = await this.perform(left);

      head = new Uint8Array(performed.slice(leftLength));

      toEncrypt = toEncrypt.slice(leftLength2);

      this.counter = this.counter.add(1);
    }

    const tail = new Uint8Array(await this.perform(toEncrypt));

    const result = head ? head.concat(tail) : tail;

    let length = toEncrypt.length;
    const leftAfter = length % COUNTER_LENGTH;
    length -= leftAfter;

    const a = length / COUNTER_LENGTH;
    this.counter = this.counter.add(a);

    this.leftLength = leftAfter || undefined;
    // this.encLeft = leftAfter ? toEncrypt.slice(-leftAfter) : undefined;

    return result;
  }
}
