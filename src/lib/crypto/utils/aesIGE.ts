import {IGE} from '@cryptography/aes';
import addPadding from '../../../helpers/bytes/addPadding';
import bytesFromWordss from '../../../helpers/bytes/bytesFromWordss';
import bytesToWordss from '../../../helpers/bytes/bytesToWordss';

export default function aesSync(bytes: Uint8Array, keyBytes: Uint8Array, ivBytes: Uint8Array, encrypt = true) {
  // console.log(dT(), 'AES start', bytes, keyBytes, ivBytes);

  const cipher = new IGE(bytesToWordss(keyBytes), bytesToWordss(ivBytes));
  const performedBytes = cipher[encrypt ? 'encrypt' : 'decrypt'](bytesToWordss(bytes));
  // console.log(dT(), 'AES finish');

  return bytesFromWordss(performedBytes);
}

export function aesEncryptSync(bytes: Uint8Array, keyBytes: Uint8Array, ivBytes: Uint8Array) {
  return aesSync(addPadding(bytes), keyBytes, ivBytes, true);
}

export function aesDecryptSync(bytes: Uint8Array, keyBytes: Uint8Array, ivBytes: Uint8Array) {
  return aesSync(bytes, keyBytes, ivBytes, false);
}
