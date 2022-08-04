/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import cryptoWorker from '../../crypto/cryptoMessagePort';
import bigInt from 'big-integer';

function readBigIntFromBytesBE(bytes: Uint8Array) {
  const length = bytes.length;
  const bits = length * 8;
  let value = bigInt(bytes[0]).and(0x7F).shiftLeft(bits - 8);
  for(let i = 1; i < length; ++i) {
    const _bits = bits - (i + 1) * 8;
    const b = bigInt(bytes[i]);
    value = value.or(_bits ? b.shiftLeft(_bits) : b);
  }

  return value;
}

// Emojis were taken from tdlib
const emojis = [
  '1f609', '1f60d', '1f61b', '1f62d', '1f631', '1f621', '1f60e',
  '1f634', '1f635', '1f608', '1f62c', '1f607', '1f60f', '1f46e',
  '1f477', '1f482', '1f476', '1f468', '1f469', '1f474', '1f475',
  '1f63b', '1f63d', '1f640', '1f47a', '1f648', '1f649', '1f64a',
  '1f480', '1f47d', '1f4a9', '1f525', '1f4a5', '1f4a4', '1f442',
  '1f440', '1f443', '1f445', '1f444', '1f44d', '1f44e', '1f44c',
  '1f44a', '270c', '270b', '1f450', '1f446', '1f447', '1f449',
  '1f448', '1f64f', '1f44f', '1f4aa', '1f6b6', '1f3c3', '1f483',
  '1f46b', '1f46a', '1f46c', '1f46d', '1f485', '1f3a9', '1f451',
  '1f452', '1f45f', '1f45e', '1f460', '1f455', '1f457', '1f456',
  '1f459', '1f45c', '1f453', '1f380', '1f484', '1f49b', '1f499',
  '1f49c', '1f49a', '1f48d', '1f48e', '1f436', '1f43a', '1f431',
  '1f42d', '1f439', '1f430', '1f438', '1f42f', '1f428', '1f43b',
  '1f437', '1f42e', '1f417', '1f434', '1f411', '1f418', '1f43c',
  '1f427', '1f425', '1f414', '1f40d', '1f422', '1f41b', '1f41d',
  '1f41c', '1f41e', '1f40c', '1f419', '1f41a', '1f41f', '1f42c',
  '1f40b', '1f410', '1f40a', '1f42b', '1f340', '1f339', '1f33b',
  '1f341', '1f33e', '1f344', '1f335', '1f334', '1f333', '1f31e',
  '1f31a', '1f319', '1f30e', '1f30b', '26a1', '2614', '2744', '26c4',
  '1f300', '1f308', '1f30a', '1f393', '1f386', '1f383', '1f47b',
  '1f385', '1f384', '1f381', '1f388', '1f52e', '1f3a5', '1f4f7',
  '1f4bf', '1f4bb', '260e', '1f4e1', '1f4fa', '1f4fb', '1f509',
  '1f514', '23f3', '23f0', '231a', '1f512', '1f511', '1f50e',
  '1f4a1', '1f526', '1f50c', '1f50b', '1f6bf', '1f6bd', '1f527',
  '1f528', '1f6aa', '1f6ac', '1f4a3', '1f52b', '1f52a', '1f48a',
  '1f489', '1f4b0', '1f4b5', '1f4b3', '2709', '1f4eb', '1f4e6',
  '1f4c5', '1f4c1', '2702', '1f4cc', '1f4ce', '2712', '270f',
  '1f4d0', '1f4da', '1f52c', '1f52d', '1f3a8', '1f3ac', '1f3a4',
  '1f3a7', '1f3b5', '1f3b9', '1f3bb', '1f3ba', '1f3b8', '1f47e',
  '1f3ae', '1f0cf', '1f3b2', '1f3af', '1f3c8', '1f3c0', '26bd',
  '26be', '1f3be', '1f3b1', '1f3c9', '1f3b3', '1f3c1', '1f3c7',
  '1f3c6', '1f3ca', '1f3c4', '2615', '1f37c', '1f37a', '1f377',
  '1f374', '1f355', '1f354', '1f35f', '1f357', '1f371', '1f35a',
  '1f35c', '1f361', '1f373', '1f35e', '1f369', '1f366', '1f382',
  '1f370', '1f36a', '1f36b', '1f36d', '1f36f', '1f34e', '1f34f',
  '1f34a', '1f34b', '1f352', '1f347', '1f349', '1f353', '1f351',
  '1f34c', '1f350', '1f34d', '1f346', '1f345', '1f33d', '1f3e1',
  '1f3e5', '1f3e6', '26ea', '1f3f0', '26fa', '1f3ed', '1f5fb',
  '1f5fd', '1f3a0', '1f3a1', '26f2', '1f3a2', '1f6a2', '1f6a4',
  '2693', '1f680', '2708', '1f681', '1f682', '1f68b', '1f68e',
  '1f68c', '1f699', '1f697', '1f695', '1f69b', '1f6a8', '1f694',
  '1f692', '1f691', '1f6b2', '1f6a0', '1f69c', '1f6a6', '26a0',
  '1f6a7', '26fd', '1f3b0', '1f5ff', '1f3aa', '1f3ad',
  '1f1ef-1f1f5', '1f1f0-1f1f7', '1f1e9-1f1ea', '1f1e8-1f1f3',
  '1f1fa-1f1f8', '1f1eb-1f1f7', '1f1ea-1f1f8', '1f1ee-1f1f9',
  '1f1f7-1f1fa', '1f1ec-1f1e7', '0031-20e3', '0032-20e3', '0033-20e3',
  '0034-20e3', '0035-20e3', '0036-20e3', '0037-20e3', '0038-20e3', '0039-20e3',
  '0030-20e3', '1f51f', '2757', '2753', '2665', '2666', '1f4af', '1f517',
  '1f531', '1f534', '1f535', '1f536', '1f537'
];

export default async function getEmojisFingerprint(key: Uint8Array, g_a: Uint8Array) {
  const arr = key.concat(g_a);
  const hash = await cryptoWorker.invokeCrypto('sha256', arr);

  const result: [string, string, string, string] = [] as any;
  const emojisLength = emojis.length;

  const kPartSize = 8;
  for(let partOffset = 0; partOffset != hash.length; partOffset += kPartSize) {
    const bytes = hash.slice(partOffset, partOffset + kPartSize);
    const value = readBigIntFromBytesBE(bytes);
    const index = value.mod(emojisLength).toJSNumber();

    // const emoji = emojiFromCodePoints(emojis[index]);
    const codePoints = emojis[index];
    result.push(codePoints);
  }

  return result;
}
