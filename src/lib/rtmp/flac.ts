import {crc16, crc8} from './flac-crc';

function writeUtf8Integer(dv: DataView, pos: number, value: number) {
  while(true) {
    const byte = value & 0x7f;
    value >>= 7;
    if(value === 0) {
      dv.setUint8(pos++, byte);
      break;
    } else {
      dv.setUint8(pos++, byte | 0x80);
    }
  }
  return pos;
}

export interface FlacFrameOptions {
  index: number;
  blockSize: number;
  pcms: Int16Array[][];
}

export function encodeFlacFrame(params: FlacFrameOptions) {
  const buf = new Uint8Array(10000); // todo
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  dv.setUint16(0, 0b1111111111111000); // sync + fixed block size
  // blocksize="get 16 bit (blocksize-1) from end of header" (for simplicity)
  // Sample rate=48khz (opus decoder always uses 48khz)
  dv.setUint8(2, 0b01111010);
  const channelAssignment = params.pcms.length - 1;
  if(channelAssignment > 7) throw new Error('Too many channels');
  const sampleSize = 0b1000; // we ask opus decoder to spit out 16 bit pcm
  dv.setUint8(3, (channelAssignment << 4) | sampleSize);

  let pos = writeUtf8Integer(dv, 4, params.index);
  dv.setUint16(pos, params.blockSize - 1);
  pos += 2;

  const crc = crc8(buf.subarray(0, pos));
  dv.setUint8(pos++, crc);

  // subframes
  for(const channelPcms of params.pcms) {
    // channelPcms is Int16Array[]
    dv.setUint8(pos++, 0b00000010); // verbatim subframe + no wasted bits-per-sample

    let currentBuffer = channelPcms[0];
    let currentBufferIdx = 0;
    let currentBufferPos = 0;
    for(let i = 0; i < params.blockSize; i++) {
      if(currentBufferPos >= currentBuffer.length) {
        currentBuffer = channelPcms[++currentBufferIdx];
        currentBufferPos = 0;
      }
      dv.setInt16(pos, currentBuffer[currentBufferPos++]);
      pos += 2;
    }

    // adjust the pcms array to only be the remaining samples
    if(currentBufferIdx > 0) {
      channelPcms.splice(0, currentBufferIdx);
    }
    if(currentBufferPos > 0) {
      channelPcms[0] = currentBuffer.subarray(currentBufferPos);
    }
  }

  // footer
  const crc2 = crc16(buf.subarray(0, pos));
  dv.setUint16(pos, crc2);
  pos += 2;

  return {
    data: buf.subarray(0, pos),
    duration: params.blockSize / 48000
  };
}

export interface FlacHeaderOptions {
  blockSize: number;
  channelCount: number;
}

export function encodeFlacHeader(params: FlacHeaderOptions) {
  const buf = new Uint8Array(38);
  const dv = new DataView(buf.buffer);

  dv.setUint8(0, 0b10000000);
  dv.setUint8(1, 0);
  dv.setUint16(2, 34); // length

  dv.setUint16(4, params.blockSize); // min == max because we don't support variable block size
  dv.setUint16(6, params.blockSize);

  // min & max frame size (24+24 bit)
  dv.setUint16(8, 0);
  dv.setUint16(10, 0);
  dv.setUint16(12, 0);
  // sample rate = 48khz = 0b00001011 101110000000
  dv.setUint8(14, 0b00001011); // 0-8 bits of sample rate
  dv.setUint8(15, 0b10111000); // 9-16 bits of sample rate
  dv.setUint8(16, (params.channelCount - 1) << 1); // 17-20 bits of sample rate (zeroes) + channel count + bits per sample first bit (0)
  dv.setUint8(17, 0b11110000); // bits per sample (16 - 1)
  dv.setUint32(18, 0); // total samples in stream (0 for simplicity)

  // md5 (0 for simplicity)
  dv.setUint32(22, 0);
  dv.setUint32(26, 0);
  dv.setUint32(30, 0);
  dv.setUint32(34, 0);

  return buf;
}
