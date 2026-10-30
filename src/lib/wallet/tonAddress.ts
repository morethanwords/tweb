/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import bytesToBase64 from '@helpers/bytes/bytesToBase64';
import bytesFromHex from '@helpers/bytes/bytesFromHex';
import base64ToBytes from '@helpers/string/base64ToBytes';
import fixBase64String from '@helpers/fixBase64String';

/**
 * TON addresses without the engine: a chat card shows the counterparty as a user-friendly address and must not
 * load three megabytes of WebAssembly for it. A friendly address is 36 bytes in URL-safe base64 — a tag, the
 * workchain, the 32-byte account id and a CRC16 of those 34 bytes; the tag says whether the address bounces and
 * whether it is a testnet one.
 */

const TAG_BOUNCEABLE = 0x11;
const TAG_NON_BOUNCEABLE = 0x51;
const TAG_TESTNET = 0x80;

export type TonAddressParts = {
  workchain: number,
  hash: Uint8Array,
  bounceable: boolean,
  testnet: boolean
};

/** CRC-16/XMODEM, the checksum of a friendly address */
function crc16(bytes: Uint8Array) {
  let crc = 0;
  for(const byte of bytes) {
    crc ^= byte << 8;
    for(let i = 0; i < 8; ++i) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }

  return crc;
}

export function parseTonAddress(address: string): TonAddressParts {
  address = address?.trim();
  if(!address) {
    return;
  }

  const raw = address.match(/^(-?\d+):([0-9a-fA-F]{64})$/);
  if(raw) {
    return {workchain: +raw[1], hash: bytesFromHex(raw[2]), bounceable: true, testnet: false};
  }

  if(address.length !== 48) {
    return;
  }

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(address);
  } catch(err) {
    return;
  }

  if(bytes.length !== 36) {
    return;
  }

  const checksum = (bytes[34] << 8) | bytes[35];
  if(crc16(bytes.subarray(0, 34)) !== checksum) {
    return;
  }

  const tag = bytes[0];
  const testnet = !!(tag & TAG_TESTNET);
  const kind = tag & ~TAG_TESTNET;
  if(kind !== TAG_BOUNCEABLE && kind !== TAG_NON_BOUNCEABLE) {
    return;
  }

  return {
    workchain: bytes[1] > 127 ? bytes[1] - 256 : bytes[1],
    hash: bytes.slice(2, 34),
    bounceable: kind === TAG_BOUNCEABLE,
    testnet
  };
}

export function formatTonAddress(parts: Omit<TonAddressParts, 'bounceable' | 'testnet'> & Partial<TonAddressParts>) {
  const bytes = new Uint8Array(36);
  bytes[0] = (parts.bounceable ? TAG_BOUNCEABLE : TAG_NON_BOUNCEABLE) | (parts.testnet ? TAG_TESTNET : 0);
  bytes[1] = parts.workchain & 0xff;
  bytes.set(parts.hash, 2);
  const checksum = crc16(bytes.subarray(0, 34));
  bytes[34] = checksum >> 8;
  bytes[35] = checksum & 0xff;
  return fixBase64String(bytesToBase64(bytes), true);
}

/**
 * The non-bounceable form a wallet shows to people (UQ… on the mainnet), or nothing when the text is no address
 */
export function toFriendlyTonAddress(address: string, bounceable = false) {
  const parts = parseTonAddress(address);
  return parts && formatTonAddress({...parts, bounceable});
}
