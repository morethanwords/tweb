import type {RSAPublicKeyHex} from '@lib/mtproto/rsaKeysManager';
import bytesModPow from '@helpers/bytes/bytesModPow';
import bytesFromHex from '@helpers/bytes/bytesFromHex';

export default function rsaEncrypt(bytes: Uint8Array, publicKey: RSAPublicKeyHex) {
  return bytesModPow(bytes, bytesFromHex(publicKey.exponent), bytesFromHex(publicKey.modulus));
}
