/*
 * Originally from:
 * https://github.com/evgeny-nadymov/telegram-react
 * Copyright (C) 2018 Evgeny Nadymov
 * https://github.com/evgeny-nadymov/telegram-react/blob/master/LICENSE
 */

import bufferConcats from '@helpers/bytes/bufferConcats';
import subtle from '@lib/crypto/subtle';
import sha256 from '@lib/crypto/utils/sha256';
import {P2P_SIGNALING_INCOMING_COUNTERS_KEPT} from '@lib/calls/constants';

// tgcalls EncryptedConnection.cpp: "don't try decrypting more". Signaling is a
// few KiB of gzipped JSON; the old 128 MiB cap only bounded the tab's memory.
const kMaxIncomingPacketSize = 128 * 1024;

export default class P2PEncryptor {
  private type: 'Signaling';
  private counter: number;
  // The replay window, tgcalls `_largestIncomingCounters`: ascending, at most
  // P2P_SIGNALING_INCOMING_COUNTERS_KEPT entries. A Map of every counter ever
  // seen grew with the call and let the peer fill the tab's memory one packet
  // at a time.
  private largestIncomingCounters: number[];

  constructor(private isOutgoing: boolean, private p2pKey: Uint8Array) {
    this.type = 'Signaling';
    this.counter = 0;
    this.largestIncomingCounters = [];
  }

  // tgcalls EncryptedConnection::registerIncomingCounter: refuse a counter the
  // window already holds, or one that fell out of it (older than the largest
  // seen minus the window), then keep the window trimmed to the largest ones.
  private registerIncomingCounter(counter: number) {
    const list = this.largestIncomingCounters;
    let position = 0;
    while(position < list.length && list[position] < counter) {
      ++position;
    }

    const largest = list.length ? list[list.length - 1] : 0;
    if(position < list.length && list[position] === counter) {
      return false;
    } else if(counter + P2P_SIGNALING_INCOMING_COUNTERS_KEPT <= largest) {
      return false;
    }

    let eraseCount = 0;
    while(eraseCount < list.length && list[eraseCount] + P2P_SIGNALING_INCOMING_COUNTERS_KEPT <= counter) {
      ++eraseCount;
    }

    list.splice(0, eraseCount);
    list.splice(position - eraseCount, 0, counter);
    return true;
  }

  private concatSHA256(parts: Uint8Array[]) {
    return sha256(bufferConcats(...parts));
  }

  private async encryptPrepared(buffer: Uint8Array) {
    const result = {
      counter: 0, // this.counterFromSeq(this.readSeq(buffer)),
      bytes: new Uint8Array(16 + buffer.length)
    };

    const x = (this.isOutgoing ? 0 : 8) + (this.type === 'Signaling' ? 128 : 0);
    const key = this.p2pKey;

    const msgKeyLarge = await this.concatSHA256([key.subarray(x + 88, x + 88 + 32), buffer]);
    const msgKey = result.bytes;
    for(let i = 0; i < 16; ++i) {
      msgKey[i] = msgKeyLarge[i + 8];
    }

    const aesKeyIv = await this.prepareAesKeyIv(key, msgKey, x);

    const bytes = await this.aesProcessCtr(buffer, buffer.length, aesKeyIv, true);

    result.bytes = new Uint8Array([...result.bytes.subarray(0, 16), ...bytes]);

    return result;
  }

  public encryptRawPacket(buffer: Uint8Array) {
    const seq = ++this.counter;
    const arr = new ArrayBuffer(4);
    const view = new DataView(arr);
    view.setUint32(0, seq >>> 0, false); // byteOffset = 0; litteEndian = false

    const result = new Uint8Array([...new Uint8Array(arr), ...buffer]);

    return this.encryptPrepared(result);
  }

  private async prepareAesKeyIv(key: Uint8Array, msgKey: Uint8Array, x: number) {
    const [sha256a, sha256b] = await Promise.all([
      this.concatSHA256([
        msgKey.subarray(0, 16),
        key.subarray(x, x + 36)
      ]),

      this.concatSHA256([
        key.subarray(40 + x, 40 + x + 36),
        msgKey.subarray(0, 16)
      ])
    ]);

    return {
      key: new Uint8Array([
        ...sha256a.subarray(0, 8),
        ...sha256b.subarray(8, 8 + 16),
        ...sha256a.subarray(24, 24 + 8)
      ]),
      iv: new Uint8Array([
        ...sha256b.subarray(0, 4),
        ...sha256a.subarray(8, 8 + 8),
        ...sha256b.subarray(24, 24 + 4)
      ])
    };
  }

  private async aesProcessCtr(encryptedData: Uint8Array, dataSize: number, aesKeyIv: {key: Uint8Array, iv: Uint8Array}, encrypt = true) {
    const cryptoKey = await subtle.importKey(
      'raw',
      aesKeyIv.key as BufferSource,
      {name: 'AES-CTR'},
      false,
      [encrypt ? 'encrypt' : 'decrypt']
    );

    const buffer: ArrayBuffer = await subtle[encrypt ? 'encrypt' : 'decrypt']({
      name: 'AES-CTR',
      counter: aesKeyIv.iv as BufferSource,
      length: aesKeyIv.iv.length * 8
    },
    cryptoKey,
    encryptedData as BufferSource
    );

    return new Uint8Array(buffer);
  }

  private constTimeIsDifferent(a: Uint8Array, b: Uint8Array, count: number) {
    let msgKeyEquals = true;
    for(let i = 0; i < count; ++i) {
      if(a[i] !== b[i]) {
        msgKeyEquals = false;
      }
    }

    return !msgKeyEquals;
  }

  public async decryptRawPacket(buffer: Uint8Array) {
    if(buffer.length < 21 || buffer.length > kMaxIncomingPacketSize) {
      return;
    }

    const {isOutgoing, type} = this;

    const x = (isOutgoing ? 8 : 0) + (type === 'Signaling' ? 128 : 0);
    const key = this.p2pKey;

    const msgKey = buffer.subarray(0, 16);
    const encryptedData = buffer.subarray(16);
    const encryptedDataSize = buffer.length - 16;

    const aesKeyIv = await this.prepareAesKeyIv(key, msgKey, x);

    const decryptionBuffer = await this.aesProcessCtr(encryptedData, encryptedDataSize, aesKeyIv, false);

    const msgKeyLarge = await this.concatSHA256([
      key.subarray(88 + x, 88 + x + 32),
      decryptionBuffer
    ]);

    if(this.constTimeIsDifferent(msgKeyLarge.subarray(8), msgKey, 16)) {
      return;
    }

    const dataView = new DataView(decryptionBuffer.buffer);
    const seq = dataView.getUint32(0);
    if(!this.registerIncomingCounter(seq)) {
      return;
    }

    return decryptionBuffer.slice(4);
  }
}
