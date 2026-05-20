/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// OGG container muxer for Opus packets, per RFC 7845 (Opus-in-Ogg) and RFC 3533 (Ogg).
// Used to wrap raw Opus packets emitted by WebCodecs AudioEncoder into the
// `audio/ogg;codecs=opus` container that Telegram expects for voice messages.

const OGG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for(let i = 0; i < 256; ++i) {
    let r = i << 24;
    for(let j = 0; j < 8; ++j) {
      r = (r & 0x80000000) ? (((r << 1) >>> 0) ^ 0x04C11DB7) : ((r << 1) >>> 0);
    }
    table[i] = r >>> 0;
  }
  return table;
})();

function oggCrc(bytes: Uint8Array): number {
  let crc = 0;
  for(let i = 0; i < bytes.length; ++i) {
    crc = (((crc << 8) >>> 0) ^ OGG_CRC_TABLE[((crc >>> 24) ^ bytes[i]) & 0xFF]) >>> 0;
  }
  return crc >>> 0;
}

// Default OpusHead used when the encoder did not provide a description.
// Pre-skip 312 samples is the libopus default for a fresh encoder at 48kHz.
function buildOpusHead(channels: number, inputSampleRate: number, preSkip: number): Uint8Array {
  const head = new Uint8Array(19);
  const view = new DataView(head.buffer);
  head.set([0x4F, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0); // 'OpusHead'
  head[8] = 1;
  head[9] = channels;
  view.setUint16(10, preSkip, true);
  view.setUint32(12, inputSampleRate, true);
  view.setInt16(16, 0, true);
  head[18] = 0;
  return head;
}

function buildOpusTags(vendor: string): Uint8Array {
  const enc = new TextEncoder();
  const v = enc.encode(vendor);
  const tags = new Uint8Array(8 + 4 + v.length + 4);
  const view = new DataView(tags.buffer);
  tags.set([0x4F, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0); // 'OpusTags'
  view.setUint32(8, v.length, true);
  tags.set(v, 12);
  view.setUint32(12 + v.length, 0, true); // 0 user comments
  return tags;
}

const OGG_HEADER_TYPE_CONTINUED = 0x01;
const OGG_HEADER_TYPE_BOS = 0x02;
const OGG_HEADER_TYPE_EOS = 0x04;

const MAX_PAGE_SEGMENTS = 255;
const MAX_SEGMENT_LEN = 255;

export interface OggOpusWriterOptions {
  channels: number;
  inputSampleRate: number;
  vendor?: string;
  preSkip?: number;
  serialNumber?: number;
  pageGranularitySamples?: number;
}

export default class OggOpusWriter {
  private channels: number;
  private inputSampleRate: number;
  private vendor: string;
  private preSkip: number;
  private serial: number;
  private pageGranularitySamples: number;

  private pageSequence = 0;
  private granulePosition = 0;
  private pageBuffer: Uint8Array[] = [];
  private samplesInCurrentPage = 0;
  private chunks: Uint8Array[] = [];
  private headersWritten = false;
  private finalized = false;

  constructor(options: OggOpusWriterOptions) {
    this.channels = options.channels;
    this.inputSampleRate = options.inputSampleRate;
    this.vendor = options.vendor ?? 'tweb';
    this.preSkip = options.preSkip ?? 312;
    this.serial = options.serialNumber ?? ((Math.random() * 0xFFFFFFFF) >>> 0);
    this.pageGranularitySamples = options.pageGranularitySamples ?? 48000;
  }

  // Optional: replace the default OpusHead with the one the encoder provided
  // (via EncodedAudioChunkMetadata.decoderConfig.description). Must be called
  // before any writePacket().
  public setOpusHead(opusHead: Uint8Array) {
    if(this.headersWritten) return;
    this.writeHeaderPagesWith(opusHead);
  }

  private ensureHeadersWritten() {
    if(this.headersWritten) return;
    this.writeHeaderPagesWith(buildOpusHead(this.channels, this.inputSampleRate, this.preSkip));
  }

  private writeHeaderPagesWith(opusHead: Uint8Array) {
    this.emitPage([opusHead], 0, OGG_HEADER_TYPE_BOS);
    this.emitPage([buildOpusTags(this.vendor)], 0, 0);
    this.headersWritten = true;
  }

  public writePacket(packet: Uint8Array, durationSamples: number) {
    if(this.finalized) return;
    this.ensureHeadersWritten();

    this.pageBuffer.push(packet);
    this.samplesInCurrentPage += durationSamples;
    this.granulePosition += durationSamples;

    if(this.shouldFlushPage()) {
      this.flushDataPage(false);
    }
  }

  private shouldFlushPage(): boolean {
    if(this.pageBuffer.length >= MAX_PAGE_SEGMENTS) return true;
    if(this.samplesInCurrentPage >= this.pageGranularitySamples) return true;

    let segmentCount = 0;
    for(let i = 0; i < this.pageBuffer.length; ++i) {
      segmentCount += Math.floor(this.pageBuffer[i].length / MAX_SEGMENT_LEN) + 1;
      if(segmentCount >= MAX_PAGE_SEGMENTS) return true;
    }
    return false;
  }

  private flushDataPage(eos: boolean) {
    if(!this.pageBuffer.length) {
      if(eos) this.emitPage([], this.granulePosition, OGG_HEADER_TYPE_EOS);
      return;
    }
    this.emitPage(this.pageBuffer, this.granulePosition, eos ? OGG_HEADER_TYPE_EOS : 0);
    this.pageBuffer = [];
    this.samplesInCurrentPage = 0;
  }

  private emitPage(packets: Uint8Array[], granulePos: number, headerType: number) {
    const segments: number[] = [];
    let payloadLen = 0;
    for(let i = 0; i < packets.length; ++i) {
      const len = packets[i].length;
      const full = Math.floor(len / MAX_SEGMENT_LEN);
      for(let j = 0; j < full; ++j) segments.push(MAX_SEGMENT_LEN);
      segments.push(len % MAX_SEGMENT_LEN);
      payloadLen += len;
    }

    const segCount = segments.length;
    const page = new Uint8Array(27 + segCount + payloadLen);
    const view = new DataView(page.buffer);

    page.set([0x4F, 0x67, 0x67, 0x53], 0); // 'OggS'
    page[4] = 0;
    page[5] = headerType;
    view.setUint32(6, (granulePos >>> 0), true);
    view.setUint32(10, (Math.floor(granulePos / 0x100000000) >>> 0), true);
    view.setUint32(14, this.serial, true);
    view.setUint32(18, this.pageSequence++, true);
    view.setUint32(22, 0, true);
    page[26] = segCount;
    for(let i = 0; i < segCount; ++i) page[27 + i] = segments[i];

    let off = 27 + segCount;
    for(let i = 0; i < packets.length; ++i) {
      page.set(packets[i], off);
      off += packets[i].length;
    }

    view.setUint32(22, oggCrc(page), true);
    this.chunks.push(page);
  }

  public finalize(): Uint8Array {
    if(this.finalized) return this.concat();
    this.ensureHeadersWritten();
    this.flushDataPage(true);
    this.finalized = true;
    return this.concat();
  }

  private concat(): Uint8Array {
    let total = 0;
    for(let i = 0; i < this.chunks.length; ++i) total += this.chunks[i].length;
    const out = new Uint8Array(total);
    let off = 0;
    for(let i = 0; i < this.chunks.length; ++i) {
      out.set(this.chunks[i], off);
      off += this.chunks[i].length;
    }
    return out;
  }
}
