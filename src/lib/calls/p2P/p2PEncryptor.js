/*
 *  Copyright (c) 2018-present, Evgeny Nadymov
 *
 * This source code is licensed under the GPL v.3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import CryptoJS from 'crypto-js';

const P2P_ENCRYPTION = true;

const kMaxIncomingPacketSize = 128 * 1024 * 1024;

function uint8ArrayToWordArray(u8arr) {
    let len = u8arr.length;
    let words = [];
    for (let i = 0; i < len; i++) {
        words[i >>> 2] |= (u8arr[i] & 0xff) << (24 - (i % 4) * 8);
    }

    return CryptoJS.lib.WordArray.create(words, len);
}

function wordArrayToUint8Array(wordArray) {
    const l = wordArray.sigBytes;
    const words = wordArray.words;
    const result = new Uint8Array(l);

    let i = 0 /*dst*/, j = 0 /*src*/;
    while(true) {
        // here i is a multiple of 4
        if (i===l)
            break;
        let w = words[j++];
        result[i++] = (w & 0xff000000) >>> 24;
        if (i===l)
            break;
        result[i++] = (w & 0x00ff0000) >>> 16;
        if (i===l)
            break;
        result[i++] = (w & 0x0000ff00) >>> 8;
        if (i===l)
            break;
        result[i++] = (w & 0x000000ff);
    }

    return result;
}

export default class P2PEncryptor {
    constructor(isOutgoing, keyBase64) {
        this.keyBase64 = keyBase64;
        this.isOutgoing = isOutgoing;
        this.type = 'Signaling';
        this.counter = 0;
        this.seqMap = new Map();

        const p2pKeyWA = CryptoJS.enc.Base64.parse(keyBase64);
        this.p2pKey = wordArrayToUint8Array(p2pKeyWA);
        this.mode = CryptoJS.mode.CTR;
        this.padding = CryptoJS.pad.NoPadding;
    }

    encryptToBase64(str) {
        if (P2P_ENCRYPTION) {
            const enc = new TextEncoder();
            const arr = enc.encode(str);

            const packet = this.encryptRawPacket(new Uint8Array(arr));

            const { bytes } = packet;
            const wa = uint8ArrayToWordArray(bytes);

            return CryptoJS.enc.Base64.stringify(wa);
        } else {
            return btoa(str);
        }
    }

    decryptFromBase64(base64) {
        if (P2P_ENCRYPTION) {
            const wa = CryptoJS.enc.Base64.parse(base64);

            const buffer = wordArrayToUint8Array(wa);
            const decrypted = this.decryptRawPacket(buffer);

            const dec = new TextDecoder('utf-8');
            return dec.decode(decrypted);
        } else {
            return atob(base64);
        }
    }

    concatSHA256(parts) {
        const sha256 = CryptoJS.algo.SHA256.create();
        for (let i = 0; i < parts.length; i++) {
            const str = uint8ArrayToWordArray(parts[i]);
            sha256.update(str);
        }

        const result = sha256.finalize();

        return wordArrayToUint8Array(result);
    }

    encryptPrepared(buffer) {
        const result = {
            counter: 0, //this.counterFromSeq(this.readSeq(buffer)),
            bytes: new Uint8Array(16 + buffer.length)
        }

        const x = (this.isOutgoing ? 0 : 8) + (this.type === 'Signaling' ? 128 : 0);
        const key = this.p2pKey;

        const msgKeyLarge = this.concatSHA256([key.subarray(x + 88, x + 88 + 32), buffer]);
        const msgKey = result.bytes;
        for (let i = 0; i < 16; i++) {
            msgKey[i] = msgKeyLarge[i + 8];
        }

        const aesKeyIv = this.prepareAesKeyIv(key, msgKey, x);

        const bytes = this.aesProcessCtr(buffer, buffer.length, aesKeyIv, true);

        result.bytes = new Uint8Array([...result.bytes.subarray(0, 16), ...bytes]);

        return result;
    }

    encryptObjToBase64(obj) {
        const str = JSON.stringify(obj);

        const enc = new TextEncoder();
        const arr = enc.encode(str);

        const packet = this.encryptRawPacket(new Uint8Array(arr));

        const { bytes } = packet;
        const wa = uint8ArrayToWordArray(bytes);

        return CryptoJS.enc.Base64.stringify(wa);
    }

    encryptRawPacket(buffer) {
        const seq = ++this.counter;
        const arr = new ArrayBuffer(4);
        const view = new DataView(arr);
        view.setUint32(0, seq >>> 0, false); // byteOffset = 0; litteEndian = false

        const result = new Uint8Array([...new Uint8Array(arr), ...buffer]);

        return this.encryptPrepared(result);
    }

    prepareAesKeyIv(key, msgKey, x) {
        const sha256a = this.concatSHA256([
            msgKey.subarray(0, 16),
            key.subarray(x, x + 36)
        ]);

        const sha256b = this.concatSHA256([
            key.subarray(40 + x, 40 + x + 36),
            msgKey.subarray(0, 16)
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

    aesProcessCtr(encryptedData, dataSize, aesKeyIv, encrypt = true) {
        const key = uint8ArrayToWordArray(aesKeyIv.key);
        const iv = uint8ArrayToWordArray(aesKeyIv.iv);
        const str = uint8ArrayToWordArray(encryptedData);

        const { mode, padding } = this;

        if (encrypt) {
            const encrypted = CryptoJS.AES.encrypt(str, key, {
                mode,
                iv,
                padding
            });

            return wordArrayToUint8Array(encrypted.ciphertext);
        } else {
            const decrypted = CryptoJS.AES.decrypt({ ciphertext: str }, key, {
                mode,
                iv,
                padding
            });

            return wordArrayToUint8Array(decrypted);
        }
    }

    decryptObjFromBase64(base64) {
        const wa = CryptoJS.enc.Base64.parse(base64);

        const buffer = wordArrayToUint8Array(wa);
        const decrypted = this.decryptRawPacket(buffer);

        const dec = new TextDecoder('utf-8');
        return JSON.parse(dec.decode(decrypted))
    }

    constTimeIsDifferent(a, b, count) {
        let msgKeyEquals = true;
        for (let i = 0; i < count; i++) {
            if (a[i] !== b[i]) {
                msgKeyEquals = false;
            }
        }

        return !msgKeyEquals;
    }

    decryptRawPacket(buffer) {
        if (buffer.length < 21 || buffer.length > kMaxIncomingPacketSize) {
            return null;
        }

        const { isOutgoing, type } = this;

        const x = (isOutgoing ? 8 : 0) + (type === 'Signaling' ? 128 : 0);
        const key = this.p2pKey;

        const msgKey = buffer.subarray(0, 16);
        const encryptedData = buffer.subarray(16);
        const encryptedDataSize = buffer.length - 16;

        const aesKeyIv = this.prepareAesKeyIv(key, msgKey, x);

        const decryptionBuffer = this.aesProcessCtr(encryptedData, encryptedDataSize, aesKeyIv, false);

        const msgKeyLarge = this.concatSHA256([
            key.subarray(88 + x, 88 + x + 32),
            decryptionBuffer
        ]);

        if (this.constTimeIsDifferent(msgKeyLarge.subarray(8), msgKey, 16)) {
            return null;
        }

        const dataView = new DataView(decryptionBuffer.buffer);
        const seq = dataView.getUint32(0);
        if (this.seqMap.has(seq)) {
            return null;
        }
        this.seqMap.set(seq, seq);

        return decryptionBuffer.slice(4);
    }
};