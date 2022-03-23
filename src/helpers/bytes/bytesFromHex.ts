export default function bytesFromHex(hexString: string) {
  const len = hexString.length;
  const bytes = new Uint8Array(Math.ceil(len / 2));
  let start = 0;

  if(len % 2) { // read 0x581 as 0x0581
    bytes[start++] = parseInt(hexString.charAt(0), 16);
  }

  for(let i = start; i < len; i += 2) {
    bytes[start++] = parseInt(hexString.substr(i, 2), 16);
  }

  return bytes;
}
