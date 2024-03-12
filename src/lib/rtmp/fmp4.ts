import bufferConcats from '../../helpers/bytes/bufferConcats';
import {findIsoBox, isoBoxToBuffer} from './utils';
import ISOBoxer from './isoboxer';
import {encodeFlacHeader} from './flac';
import {parseMp4Samples} from './mp4';
import {OpusDecoderDelegate, reencodeOpusToFlac} from './opus';
import bigInt from 'big-integer';
import type {OpusDecoderInit} from '../../vendor/opus';

export interface Fmp4InitChunkInfo {
  opusTrackId?: number;
  opusInitOptions?: OpusDecoderInit;
  data: Uint8Array;
}

export interface Fmp4InitChunkParams {
  opusToFlac?: boolean;
}

export function generateFmp4Init(iso: any, params: Fmp4InitChunkParams) {
  const {opusToFlac = false} = params;

  let opusTrackId: number | undefined;
  let opusInitOptions: OpusDecoderInit | undefined;

  const data = bufferConcats(
    isoBoxToBuffer(iso.fetch('ftyp')),
    isoBoxToBuffer(iso.fetch('moov'))
  );
  const iso2 = ISOBoxer.parseBuffer(data.buffer);

  const ftyp = iso2.fetch('ftyp');
  if(!ftyp.compatible_brands.includes('iso6')) {
    ftyp.compatible_brands.push('iso6');
  }

  const moov = iso2.fetch('moov');

  let lastTrakIdx = -1;
  const traks = [];
  for(let i = 0; i < moov.boxes.length; i++) {
    const box = moov.boxes[i];
    if(box.type === 'mvhd') {
      // Movie Header Boxes ('mvhd') MUST have durations of zero
      box.duration = 0;
      box.next_track_ID = 2;
    }
    if(box.type !== 'trak') continue;

    const trak = box;
    lastTrakIdx = i;
    traks.push(trak);

    const newTrakBoxes = [];
    let thisTrakId = null;
    for(const trakBox of trak.boxes) {
      if(trakBox.type === 'tkhd') {
        // Track Header Boxes ('tkhd') MUST have durations of zero
        trakBox.duration = 0;
        thisTrakId = trakBox.track_ID;
        newTrakBoxes.push(trakBox);
        continue;
      }

      if(trakBox.type === 'mdia') {
        const mdhd = findIsoBox(trakBox, 'mdhd');
        mdhd.duration = 0;

        const stbl = findIsoBox(trakBox, 'stbl');
        const newStblBoxes = [];

        for(const stblBox of stbl.boxes) {
          // (error if) The tracks in the Movie Box contain samples (i.e., the entry_count in the stts, stsc or stco boxes are not set to zero).
          if(stblBox.type === 'stts') {
            stblBox.entry_count = 0;
            stblBox.entries = [];
            newStblBoxes.push(stblBox);
            continue;
          }

          if(stblBox.type === 'stsc') {
            stblBox.entry_count = 0;
            stblBox.entries = [];
            newStblBoxes.push(stblBox);
            continue;
          }

          if(stblBox.type === 'stsz') {
            stblBox.sample_size = 0;
            stblBox.sample_count = 0;
            stblBox.entry_sizes = [];
            newStblBoxes.push(stblBox);
            continue;
          }

          if(stblBox.type === 'stco') {
            stblBox.entry_count = 0;
            stblBox.chunk_offsets = [];
            newStblBoxes.push(stblBox);
            continue;
          }

          if(stblBox.type === 'stsd') {
            if(opusToFlac && stblBox.entries[0].type === 'Opus') {
              const opusBox = stblBox.entries[0];
              const dopsBox = opusBox.entries[0];
              if(dopsBox.type !== 'dOps') throw new Error('Invalid Opus box');

              // replace Opus box with FLAC. the re-encoding will be done by the muxer
              const flacBox: any = ISOBoxer.createFullBox('fLaC', stblBox, -1);
              flacBox.reserved1 = [0, 0, 0];
              flacBox.reserved2 = [0, 0];
              flacBox.reserved3 = [0, 0];
              flacBox.data_reference_index = opusBox.data_reference_index;
              flacBox.channel_count = dopsBox.output_channel_count; // opus box may contain incorrect channel count
              // libopus decoder result settings
              flacBox.sample_size = 16;
              flacBox.sample_rate = 48000;

              const dfla = ISOBoxer.createFullBox('dfLa', flacBox, -1);
              dfla._data = encodeFlacHeader({
                blockSize: 4096 / dopsBox.output_channel_count,
                channelCount: dopsBox.output_channel_count
              });

              const btrt: any = ISOBoxer.createFullBox('btrt', flacBox, -1);
              btrt.bufferSizeDB = 0;
              btrt.maxBitrate = 48000 * 16 * dopsBox.output_channel_count;
              btrt.avgBitrate = btrt.maxBitrate / 2;
              flacBox.entries = [dfla, btrt];
              stblBox.entries = [flacBox];

              opusTrackId = thisTrakId;
              opusInitOptions = {
                preSkip: dopsBox.pre_skip,
                channels: dopsBox.output_channel_count,
                streamCount: dopsBox.stream_count,
                coupledStreamCount: dopsBox.coupled_count,
                channelMappingTable: dopsBox.channel_mapping
              };
            }
            newStblBoxes.push(stblBox);
            continue;
          }

          // other boxes are ignored
        }

        stbl.boxes = newStblBoxes;
        newTrakBoxes.push(trakBox);
      }
    }

    trak.boxes = newTrakBoxes;
  }

  // The Movie Box MUST contain a Track Box ('trak') for every Track Fragment Box ('traf') in the fMP4 Segment, with matching track_ID
  if(lastTrakIdx === -1) {
    throw new Error('No trak box found');
  }

  // A Movie Extends Box ('mvex') MUST follow the last Track Box
  const mvex = ISOBoxer.createFullBox('mvex', moov, lastTrakIdx + 1);
  for(const trak of traks) {
    const trex: any = ISOBoxer.createFullBox('trex', mvex);
    trex.track_ID = findIsoBox(trak, 'tkhd').track_ID;
    trex.default_sample_description_index = 1;
    trex.default_sample_duration = 0;
    trex.default_sample_size = 0;
    trex.default_sample_flags = 0;
  }

  return {
    opusTrackId,
    opusInitOptions,
    data: new Uint8Array(iso2.write())
  };
}

export interface Fmp4SegmentOptions {
  chunk: any;
  seq?: number;
  timestamp?: bigInt.BigInteger;
  decodeOpus?: OpusDecoderDelegate;
  opusTrackId?: number;
}

export async function generateFmp4Segment(params: Fmp4SegmentOptions) {
  const {
    chunk,
    seq = 0,
    timestamp = bigInt.zero,
    decodeOpus,
    opusTrackId
  } = params;
  const chunkU8 = isoBoxToBuffer(chunk);
  const moov = chunk.fetch('moov');

  const file = ISOBoxer.createFile();

  const moof = ISOBoxer.createFullBox('moof');
  const mfhd: any = ISOBoxer.createFullBox('mfhd', moof);
  mfhd.sequence_number = seq;

  const truns = [];
  let totalSamplesSize = 0;

  for(const moovBox of moov.boxes) {
    if(moovBox.type !== 'trak') continue;
    const trak = moovBox;

    const {mdhd, samples, totalSize, hasSyncSamples} = parseMp4Samples(trak);

    const traf = ISOBoxer.createFullBox('traf', moof);

    const tfhd: any = ISOBoxer.createFullBox('tfhd', traf);
    tfhd.flags = 0x020000; // default‐base‐is‐moof
    tfhd.track_ID = findIsoBox(trak, 'tkhd').track_ID;

    const tfdt: any = ISOBoxer.createFullBox('tfdt', traf);
    tfdt.version = 1;
    tfdt.baseMediaDecodeTime = timestamp.multiply(mdhd.timescale).divide(1000);

    const trun: any = ISOBoxer.createFullBox('trun', traf);
    trun.flags = 0x1 | 0x100 | 0x200 | 0x400 | 0x800; // data‐offset‐present + chunk related flags
    trun.data_offset = 0; // will be set later

    if(opusTrackId === tfhd.track_ID) {
      const flacFrames = await reencodeOpusToFlac({
        decodeOpus,
        samples,
        chunk: chunkU8
      });
      trun.sample_count = flacFrames.length;
      trun.samples = flacFrames.map((frame) => {
        totalSamplesSize += frame.data.byteLength;
        return {
          __data: frame.data,
          sample_duration: Math.round(frame.duration * mdhd.timescale),
          sample_size: frame.data.byteLength,
          sample_flags: (2 << 24), // sync
          sample_composition_time_offset: 0
        };
      });
    } else {
      totalSamplesSize += totalSize;
      trun.sample_count = samples.length;
      trun.samples = samples.map((it) => {
        let flags = 0;

        if(hasSyncSamples) {
          if(it.isSync) {
            flags |= (2 << 24);
          } else {
            flags |= (1 << 16) | (1 << 24);
          }
        }

        return {
          __data: chunkU8.subarray(it.offset, it.offset + it.size),
          sample_duration: it.duration,
          sample_size: it.size,
          sample_flags: flags,
          sample_composition_time_offset: it.cts - it.dts
        };
      });
    }
    truns.push(trun);
  }

  const myMdat: any = ISOBoxer.createFullBox('mdat');
  myMdat.data = new Uint8Array(totalSamplesSize);
  let myMdatOffset = 0;

  const moofSize = moof.getLength();

  for(const trun of truns) {
    trun.data_offset = moofSize + myMdatOffset + 8; // mp4 box header
    for(const sample of trun.samples) {
      myMdat.data.set(sample.__data, myMdatOffset);
      myMdatOffset += sample.sample_size;
    }
  }

  file.append(moof);
  file.append(myMdat);

  return new Uint8Array(file.write());
}
