// Minimal WAV IO: reads the first channel of PCM 16/24/32-bit or float32
// files (plain or WAVE_FORMAT_EXTENSIBLE), writes mono float32.
import {readFileSync, writeFileSync} from 'node:fs';

const PCM = 1;
const FLOAT = 3;
const EXTENSIBLE = 0xfffe;

export function readWav(path) {
  const buf = readFileSync(path);
  if(buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a WAV file: ' + path);
  }

  let offset = 12, fmt, data;
  while(offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if(id === 'fmt ') {
      let format = buf.readUInt16LE(body);
      if(format === EXTENSIBLE) format = buf.readUInt16LE(body + 24);
      fmt = {format, channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14)};
    }
    if(id === 'data') data = buf.subarray(body, Math.min(buf.length, body + size));
    offset = body + size + (size & 1);
  }

  const {format, channels, rate, bits} = fmt;
  if(format !== PCM && format !== FLOAT) throw new Error(`${path}: format ${format}`);
  const bytes = bits / 8;
  const frames = Math.floor(data.length / (bytes * channels));
  const out = new Float32Array(frames);
  for(let i = 0; i < frames; ++i) {
    const p = i * bytes * channels;
    if(format === FLOAT) out[i] = data.readFloatLE(p);
    else if(bits === 16) out[i] = data.readInt16LE(p) / 32768;
    else if(bits === 24) out[i] = data.readIntLE(p, 3) / 8388608;
    else if(bits === 32) out[i] = data.readInt32LE(p) / 2147483648;
    else throw new Error(`${path}: ${bits}-bit PCM`);
  }
  return {samples: out, rate};
}

export function writeWav(path, samples, rate) {
  const header = Buffer.alloc(44);
  const dataBytes = samples.length * 4;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(FLOAT, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(32, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataBytes, 40);
  writeFileSync(path, Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, dataBytes)]));
}
