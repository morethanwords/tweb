/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/evgeny-nadymov/telegram-react
 * Copyright (C) 2018 Evgeny Nadymov
 * https://github.com/evgeny-nadymov/telegram-react/blob/master/LICENSE
 */

import bufferConcats from '../../../helpers/bytes/bufferConcats';
import subtle from '../../crypto/subtle';
import sha256 from '../../crypto/utils/sha256';

const kMaxIncomingPacketSize = 128 * 1024 * 1024;

export default class P2PEncryptor {
  private type: 'Signaling';
  private counter: number;
  private seqMap: Map<number, number>;

  constructor(private isOutgoing: boolean, private p2pKey: Uint8Array) {
    this.type = 'Signaling';
    this.counter = 0;
    this.seqMap = new Map();
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
      aesKeyIv.key,
      {name: 'AES-CTR'},
      false,
      [encrypt ? 'encrypt' : 'decrypt']
    );

    const buffer: ArrayBuffer = await subtle[encrypt ? 'encrypt' : 'decrypt']({
      name: 'AES-CTR',
      counter: aesKeyIv.iv,
      length: aesKeyIv.iv.length * 8
    },
    cryptoKey,
    encryptedData
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
    if(this.seqMap.has(seq)) {
      return;
    }
    this.seqMap.set(seq, seq);

    return decryptionBuffer.slice(4);
  }
}
