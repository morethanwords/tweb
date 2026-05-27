import bytesModPow from '@helpers/bytes/bytesModPow';
import gzipUncompress from '@helpers/gzipUncompress';
import getEmojisFingerprint from '@lib/calls/helpers/getEmojisFingerprint';
import computeDhKey from '@lib/crypto/computeDhKey';
import {CryptoMethods} from '@lib/crypto/crypto_methods';
import generateDh from '@lib/crypto/generateDh';
import computeSRP from '@lib/crypto/srp';
import {aesEncryptSync, aesDecryptSync} from '@lib/crypto/utils/aesIGE';
import factorizeBrentPollardPQ from '@lib/crypto/utils/factorize/BrentPollard';
import pbkdf2 from '@lib/crypto/utils/pbkdf2';
import rsaEncrypt from '@lib/crypto/utils/rsa';
import sha1 from '@lib/crypto/utils/sha1';
import sha256 from '@lib/crypto/utils/sha256';
import {aesCtrDestroy, aesCtrPrepare, aesCtrProcess} from '@lib/crypto/aesCtrUtils';
import {decryptLocalData, encryptLocalData} from '@lib/crypto/utils/aesLocal';

export const cryptoMethodsRegistry: CryptoMethods = {
  'sha1': sha1,
  'sha256': sha256,
  'pbkdf2': pbkdf2,
  'aes-encrypt': aesEncryptSync,
  'aes-decrypt': aesDecryptSync,
  'rsa-encrypt': rsaEncrypt,
  'factorize': factorizeBrentPollardPQ,
  'mod-pow': bytesModPow,
  'gzipUncompress': gzipUncompress,
  'computeSRP': computeSRP,
  'generate-dh': generateDh,
  'compute-dh-key': computeDhKey,
  'get-emojis-fingerprint': getEmojisFingerprint,
  'aes-ctr-prepare': aesCtrPrepare,
  'aes-ctr-process': aesCtrProcess,
  'aes-ctr-destroy': aesCtrDestroy,
  'aes-local-encrypt': encryptLocalData,
  'aes-local-decrypt': decryptLocalData
};
