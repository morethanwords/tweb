/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type bytesModPow from '../../helpers/bytes/bytesModPow';
import type gzipUncompress from '../../helpers/gzipUncompress';
import type getEmojisFingerprint from '../calls/helpers/getEmojisFingerprint';
import type {aesCtrDestroy, aesCtrPrepare, aesCtrProcess} from './aesCtrUtils';
import type computeDhKey from './computeDhKey';
import type generateDh from './generateDh';
import type computeSRP from './srp';
import type {aesEncryptSync, aesDecryptSync} from './utils/aesIGE';
import type {encryptLocalData, decryptLocalData} from './utils/aesLocal';
import type factorizeBrentPollardPQ from './utils/factorize/BrentPollard';
import type pbkdf2 from './utils/pbkdf2';
import type rsaEncrypt from './utils/rsa';
import type sha1 from './utils/sha1';
import type sha256 from './utils/sha256';

export type CryptoMethods = {
  'sha1': typeof sha1,
  'sha256': typeof sha256,
  'pbkdf2': typeof pbkdf2,
  'aes-encrypt': typeof aesEncryptSync,
  'aes-decrypt': typeof aesDecryptSync,
  'rsa-encrypt': typeof rsaEncrypt,
  'factorize': typeof factorizeBrentPollardPQ,
  // 'factorize-tdlib': typeof factorizeTdlibPQ,
  'mod-pow': typeof bytesModPow,
  'gzipUncompress': typeof gzipUncompress,
  'computeSRP': typeof computeSRP,
  'generate-dh': typeof generateDh,
  'compute-dh-key': typeof computeDhKey,
  'get-emojis-fingerprint': typeof getEmojisFingerprint,
  'aes-ctr-prepare': typeof aesCtrPrepare,
  'aes-ctr-process': typeof aesCtrProcess,
  'aes-ctr-destroy': typeof aesCtrDestroy,
  'aes-local-encrypt': typeof encryptLocalData,
  'aes-local-decrypt': typeof decryptLocalData
};
