import type {RSAPublicKeyHex} from '../../mtproto/rsaKeysManager';
import bytesModPow from '../../../helpers/bytes/bytesModPow';
import bytesFromHex from '../../../helpers/bytes/bytesFromHex';

export default function rsaEncrypt(bytes: Uint8Array, publicKey: RSAPublicKeyHex) {
  return bytesModPow(bytes, bytesFromHex(publicKey.exponent), bytesFromHex(publicKey.modulus));
}
