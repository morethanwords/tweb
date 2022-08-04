export default function bufferConcats(...args: (ArrayBuffer | Uint8Array | number[])[]) {
  const length = args.reduce((acc, v) => acc + ((v as ArrayBuffer).byteLength || (v as Uint8Array).length), 0);

  const tmp = new Uint8Array(length);

  let lastLength = 0;
  args.forEach((b) => {
    tmp.set(b instanceof ArrayBuffer ? new Uint8Array(b) : b, lastLength);
    lastLength += (b as ArrayBuffer).byteLength || (b as Uint8Array).length;
  });

  return tmp/* .buffer */;
}
