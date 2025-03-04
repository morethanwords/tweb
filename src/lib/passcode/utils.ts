import convertToUint8Array from '../../helpers/bytes/convertToUint8Array';
import sha256 from '../crypto/utils/sha256';
import {SALT_LENGTH} from './constants';


export function hashPasscode(passcode: string, salt: Uint8Array) {
  const saltedPasscode = new Uint8Array([...convertToUint8Array(passcode), ...salt]);
  passcode = ''; // forget
  return sha256(saltedPasscode);
}

export async function createPasscodeHashAndSalt(passcode: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const hash = await hashPasscode(passcode, salt);
  passcode = ''; // forget

  return {salt, hash};
}
