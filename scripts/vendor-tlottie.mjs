import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const SOURCE_COMMIT = '8efaf11d2113e5d2d0ef0a8b0b710703d296c153';
const SOURCE_SHA256 = '60f37ce619fac19905b760efce96195c7f4c683b2bca7f85777a8825ab613e19';
const OUTPUT_SHA256 = '1d959e0e5efccd470c1a1ce79bcacc066cfa38499237955b0ec382d00245f8ec';

const sourcePath = process.argv[2];
if(!sourcePath) {
  throw new Error('Usage: node scripts/vendor-tlottie.mjs /path/to/tlottie/examples/web/tlottie.wasm');
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

// Drop only debug/name custom sections from the upstream web artifact;
// executable sections and target metadata remain byte-for-byte.
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
