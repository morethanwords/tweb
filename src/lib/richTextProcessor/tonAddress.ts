/** A user-friendly TON address: 36 bytes in base64 (`UQ…`, `EQ…`, on the testnet `0Q…`, `kQ…`) */
export const TON_ADDRESS_REG_EXP = /(?<![\w+/-])[UEk0]Q[\w+/-]{46}(?![\w+/-])/g;

const TON_ADDRESS_BYTES = 36;
const GRAM_EXPLORER_URL = 'https://gram.org/address/';

function crc16(bytes: Uint8Array, length: number) {
  let crc = 0;
  for(let i = 0; i < length; ++i) {
    crc ^= bytes[i] << 8;
    for(let bit = 0; bit < 8; ++bit) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }

  return crc & 0xFFFF;
}

/** Its last two bytes are a checksum of the others, so a word that only looks like one does not pass (`WalletEngine2.isValidAddress`) */
export function isValidTonAddress(address: string) {
  let binary: string;
  try {
    binary = atob(address.replace(/-/g, '+').replace(/_/g, '/'));
  } catch{
    return false;
  }

  if(binary.length !== TON_ADDRESS_BYTES) return false;
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const end = TON_ADDRESS_BYTES - 2;
  return crc16(bytes, end) === ((bytes[end] << 8) | bytes[end + 1]);
}

/** The same wallet whichever way it is spelled: `UQ…` and `EQ…` differ in the flags and the checksum, not in the account */
export function isSameTonAddress(a: string, b: string) {
  const account = (address: string) => atob(address.replace(/-/g, '+').replace(/_/g, '/')).slice(1, TON_ADDRESS_BYTES - 2);
  try {
    return account(a) === account(b);
  } catch{
    return false;
  }
}

export function getTonAddressExplorerUrl(address: string) {
  return GRAM_EXPLORER_URL + address;
}
