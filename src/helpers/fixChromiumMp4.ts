import bytesFromHex from './bytes/bytesFromHex';
import bytesCmp from './bytes/bytesCmp';

function readLengthField(buf: Uint8Array, offset: number) {
  let length = 0;
  let size = 0;

  for(let i = 0; i < 4; i++) {
    const byte = buf[offset + i];
    length = (length << 7) + (byte & 0x7f);
    size++;
    if((byte & 0x80) === 0) {
      break;
    }
  }

  return [size, length];
}

function parseDecoderSpecificInfo(buf: Uint8Array) {
  if(buf[0] !== 0x05) {
    throw new Error('Invalid DecoderSpecificInfo tag');
  }

  const [lenSz, len] = readLengthField(buf, 1);
  const offset = 1 + lenSz;

  return buf.subarray(offset, offset + len);
}

function parseDecoderConfigDescriptor(buf: Uint8Array) {
  if(buf[0] !== 0x04) {
    throw new Error('Invalid DecoderConfigDescriptor tag');
  }

  const [lenSz, len] = readLengthField(buf, 1);
  let offset = 1 + lenSz;

  offset += 1 + // oti
        1 + // flags
        3 + // bufferSizeDB
        4 + // maxBitRate
        4;  // avgBitRate

  const decoderSpecificInfo = parseDecoderSpecificInfo(buf.subarray(offset));

  return decoderSpecificInfo;
}

function parseES_Descriptor(buf: Uint8Array) {
  if(buf[0] !== 0x03) {
    throw new Error('Invalid ES_Descriptor tag');
  }

  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const [lenSz, len] = readLengthField(buf, 1);
  let offset = 1 + lenSz;
  offset += 2; // ES_ID
  const flags = dv.getUint8(offset);
  offset += 1;

  const streamDependenceFlag = flags & 0x80;
  const URL_Flag = flags & 0x40;

  if(streamDependenceFlag) {
    offset += 2;
  }
  if(URL_Flag) {
    const URLlength = readLengthField(buf, offset);
    offset += 1 + URLlength[0] + URLlength[1];
  }

  const decoderConfigDescriptor = parseDecoderConfigDescriptor(buf.subarray(offset));

  return {decoderConfigDescriptor};
}

// function isoMakePath(box: any) {
//   const path = []
//   let cur = box
//   while(cur._parent) {
//     path.unshift(cur.type)
//     cur = cur._parent
//   }
//   return path.join('.')
// }

const BROKEN_DSCI = [0x13, 0x88];
// a proper working esds, containing:
// - profile = AAC_LC, sample rate = 22050, channels = MONO
// - sync extension with profile = AAC_SBR, sample rate = 44100
const FIXED_ESDS = bytesFromHex('0327000100041940150000000001f4000000bb750507138856e5a5');
const ESDS = new TextEncoder().encode('esds');
const MP4A = new TextEncoder().encode('mp4a');

function findUint8ArrayBack(buf: Uint8Array, needle: Uint8Array, start = buf.length) {
  for(let i = start - needle.length; i >= 0; i--) {
    let found = true;
    for(let j = 0; j < needle.length; j++) {
      if(buf[i + j] !== needle[j]) {
        found = false;
        break;
      }
    }
    if(found) return i;
  }

  return -1;
}

function fixMp4ForChromium(u8: Uint8Array) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

  // starting from end is more efficient because mdat is usually at the start
  let pos = u8.length;
  let found = null;
  while(true) {
    const esdsOffset = findUint8ArrayBack(u8, ESDS, pos);
    if(esdsOffset === -1) break;
    pos = esdsOffset;

    // validate size
    const esdsSize = dv.getUint32(esdsOffset - 4); // mp4 box
    if(esdsSize < 0 || esdsOffset + esdsSize > u8.length) {
      // invalid esds
      continue;
    }

    // esds can only be inside mp4a
    const mp4aOffset = findUint8ArrayBack(u8, MP4A, esdsOffset);
    if(mp4aOffset === -1 || esdsOffset - mp4aOffset > 100) continue;

    found = {offset: esdsOffset + 8, size: esdsSize - 12};
  }

  if(!found) throw new Error('No ESDS found');

  const esds = u8.subarray(found.offset, found.offset + found.size);

  const parsed = parseES_Descriptor(esds);
  if(!parsed) throw new Error('Invalid ESDS');
  if(!bytesCmp(parsed.decoderConfigDescriptor, BROKEN_DSCI)) {
    throw new Error('Not a broken DSCI');
  }

  if(found.size < FIXED_ESDS.length) {
    throw new Error(`ESDS Size not enough (expected at least ${FIXED_ESDS.length}, got ${found.size})`);
  }

  u8.set(FIXED_ESDS, found.offset);
}

export default function tryPatchMp4(u8: Uint8Array) {
  // since we are patching chunks and not the entire file, only the chunk
  // containing the ESDS will succeed, so we can safely ignore errors
  //
  // there's an edge case where the ESDS is split between two chunks, but
  // that's quite unlikely to happen, so we ignore it for now

  try {
    fixMp4ForChromium(u8);
    return true;
  } catch(e) {
    return false;
  }
}
