import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const SOURCE_COMMIT = 'cbfaf4fa180a74aec826ac2662e83d3ae0bbc560';

// Upstream builds the same sources twice: with and without `-C target-feature=simd128`.
// Both variants are vendored so browsers without WebAssembly SIMD still get a renderer.
const VARIANTS = [{
  name: 'tlottie.wasm',
  sourceSha256: '48e7ad6025cdae153214ea32ec4393c446475df7a3d5939d8cc286f7b9979248',
  outputSha256: '0cb9c73e2e184d3c3d2762d4f7c23ed1c993a76a9f0c10f1ea84883a4dc41801',
  simd: true
}, {
  name: 'tlottie.nosimd.wasm',
  sourceSha256: '17bebc9128dcc3351a405a47192af7ee2c5d4653869fd76ef504c75681d242d7',
  outputSha256: '01e0d8359073259cb6aed1a61e97ceee964419cdfecb2c8849a8deae6b6b934c',
  simd: false
}];

const sourceDir = process.argv[2];
if(!sourceDir) {
  throw new Error('Usage: node scripts/vendor-tlottie.mjs /path/to/tlottie/examples/web');
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

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

const readSections = (bytes) => {
  const sections = [];
  let offset = 8;
  while(offset < bytes.length) {
    const sectionStart = offset;
    const sectionId = bytes[offset++];
    const length = readVarUint32(bytes, offset);
    const payloadStart = length.offset;
    const sectionEnd = payloadStart + length.value;
    if(sectionEnd > bytes.length) {
      throw new Error('Invalid WebAssembly section length');
    }

    let name;
    if(sectionId === 0) {
      const nameLength = readVarUint32(bytes, payloadStart);
      const nameEnd = nameLength.offset + nameLength.value;
      if(nameEnd > sectionEnd) {
        throw new Error('Invalid WebAssembly custom section name');
      }

      name = bytes.subarray(nameLength.offset, nameEnd).toString();
    }

    sections.push({sectionId, name, payloadStart, sectionStart, sectionEnd});
    offset = sectionEnd;
  }

  return sections;
};

// rustc records the enabled target features; it is the only place the two variants
// are told apart, so the vendored binary has to keep it and match the requested build.
const readTargetFeatures = (bytes, section) => {
  const features = [];
  let offset = section.payloadStart;
  const name = readVarUint32(bytes, offset);
  offset = name.offset + name.value;

  const count = readVarUint32(bytes, offset);
  offset = count.offset;
  for(let i = 0; i < count.value; ++i) {
    const prefix = String.fromCharCode(bytes[offset++]);
    const length = readVarUint32(bytes, offset);
    features.push(prefix + bytes.subarray(length.offset, length.offset + length.value).toString());
    offset = length.offset + length.value;
  }

  return features;
};

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

for(const variant of VARIANTS) {
  const sourcePath = resolve(sourceDir, variant.name);
  const source = readFileSync(sourcePath);
  const sourceHash = sha256(source);
  if(sourceHash !== variant.sourceSha256) {
    throw new Error(`Expected ${variant.name} of tlottie ${SOURCE_COMMIT} (${variant.sourceSha256}), got ${sourceHash}`);
  }

  const sections = readSections(source);
  const targetFeatures = sections.find((section) => section.name === 'target_features');
  if(!targetFeatures) {
    throw new Error(`${variant.name} has no target_features section`);
  }

  const hasSimd = readTargetFeatures(source, targetFeatures).includes('+simd128');
  if(hasSimd !== variant.simd) {
    throw new Error(`${variant.name} ${hasSimd ? 'requires' : 'does not require'} simd128, which contradicts the expected variant`);
  }

  // Drop only debug/name custom sections from the upstream web artifact;
  // executable sections and target metadata remain byte-for-byte.
  const chunks = [source.subarray(0, 8)];
  for(const section of sections) {
    const keep = section.sectionId !== 0 ||
      (!section.name.startsWith('.debug_') && section.name !== 'name');
    if(keep) {
      chunks.push(source.subarray(section.sectionStart, section.sectionEnd));
    }
  }

  const output = Buffer.concat(chunks);
  new WebAssembly.Module(output);
  const outputHash = sha256(output);
  if(outputHash !== variant.outputSha256) {
    throw new Error(`Expected vendored ${variant.name} ${variant.outputSha256}, got ${outputHash}`);
  }

  writeFileSync(resolve(rootDir, 'src/vendor/tlottie', variant.name), output);

  console.log(`Vendored ${variant.name} of tlottie ${SOURCE_COMMIT}`);
  console.log(`source: ${source.length} bytes, ${sourceHash}`);
  console.log(`output: ${output.length} bytes, ${outputHash}`);
}
