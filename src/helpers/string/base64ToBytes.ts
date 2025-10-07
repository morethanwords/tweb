import fixBase64String from '../fixBase64String';

export default function base64ToBytes(base64: string) {
  const bytesStr = atob(fixBase64String(base64, false));
  const bytes = new Uint8Array(bytesStr.length);
  for(let i = 0, length = bytes.length; i < length; ++i) {
    bytes[i] = bytesStr[i].charCodeAt(0);
  }

  return bytes;
}
