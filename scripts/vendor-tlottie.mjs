import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const SOURCE_COMMIT = '44520df07af83396cbea5e85c4c268ec34ad5b06';
const SOURCE_SHA256 = '6f0257f8b59afc1399e0697c160ff2cc2a136e8776447f6c0abd5c240f56c646';
const OUTPUT_SHA256 = '877b8c8c36156710842241101dec5f2f74ba40660ffcfab8f2858deabd7e3523';

const sourcePath = process.argv[2];
if(!sourcePath) {
  throw new Error('Usage: node scripts/vendor-tlottie.mjs /path/to/tlottie/demo/tlottie.wasm');
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const source = readFileSync(sourcePath);
const sourceHash = sha256(source);
if(sourceHash !== SOURCE_SHA256) {
  throw new Error(`Expected tlottie ${SOURCE_COMMIT} (${SOURCE_SHA256}), got ${sourceHash}`);
}

const readVarUint32 = (bytes, start) => {
  let offset = start;
  let value = 0;
  let shift = 0;

  while(offset < bytes.length && shift < 35) {
    const byte = bytes[offset++];
    value |= (byte & 0x7f) << shift;
    if(!(byte & 0x80)) {
      return {offset, value: value >>> 0};
    }

    shift += 7;
  }

  throw new Error('Invalid WebAssembly varuint32');
};

// The demo artifact is built with release debug info. Drop only debug/name
// custom sections; executable sections and target metadata remain byte-for-byte.
const chunks = [source.subarray(0, 8)];
let offset = 8;
while(offset < source.length) {
  const sectionStart = offset;
  const sectionId = source[offset++];
  const length = readVarUint32(source, offset);
  const payloadStart = length.offset;
  const sectionEnd = payloadStart + length.value;
  if(sectionEnd > source.length) {
    throw new Error('Invalid WebAssembly section length');
  }

  let keep = true;
  if(sectionId === 0) {
    const nameLength = readVarUint32(source, payloadStart);
    const nameEnd = nameLength.offset + nameLength.value;
    if(nameEnd > sectionEnd) {
      throw new Error('Invalid WebAssembly custom section name');
    }

    const name = source.subarray(nameLength.offset, nameEnd).toString();
    keep = !name.startsWith('.debug_') && name !== 'name';
  }

  if(keep) {
    chunks.push(source.subarray(sectionStart, sectionEnd));
  }

  offset = sectionEnd;
}

const output = Buffer.concat(chunks);
new WebAssembly.Module(output);
const outputHash = sha256(output);
if(outputHash !== OUTPUT_SHA256) {
  throw new Error(`Expected vendored tlottie ${OUTPUT_SHA256}, got ${outputHash}`);
}

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const outputPath = resolve(rootDir, 'src/vendor/tlottie/tlottie.wasm');
writeFileSync(outputPath, output);

console.log(`Vendored tlottie ${SOURCE_COMMIT}`);
console.log(`source: ${source.length} bytes, ${sourceHash}`);
console.log(`output: ${output.length} bytes, ${outputHash}`);
