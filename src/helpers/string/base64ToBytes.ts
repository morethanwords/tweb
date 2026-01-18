import {MOUNT_CLASS_TO} from '@config/debug';
import fixBase64String from '@helpers/fixBase64String';

export default function base64ToBytes(base64: string) {
  const bytesStr = atob(fixBase64String(base64, false));
  const bytes = new Uint8Array(bytesStr.length);
  for(let i = 0, length = bytes.length; i < length; ++i) {
    bytes[i] = bytesStr[i].charCodeAt(0);
  }

  return bytes;
}

MOUNT_CLASS_TO.base64ToBytes = base64ToBytes;
