import {findIsoBox} from './utils';

export interface Mp4Sample {
  idx: number;
  size: number;
  chunkIdx: number;
  chunkRunIdx: number;
  descriptionIndex: number;
  offset: number;
  dts: number;
  cts: number;
  duration: number;
  isSync: boolean;
}

export function parseMp4Samples(trak: any) {
  const stbl = findIsoBox(trak, 'stbl');
  const mdhd = findIsoBox(trak, 'mdhd');

  let stts, stsc, stco, ctts, stsz, stsd, stss;
  for(const box of stbl.boxes) {
    if(box.type === 'stts') stts = box;
    if(box.type === 'stsc') stsc = box;
    if(box.type === 'stco') stco = box;
    if(box.type === 'ctts') ctts = box;
    if(box.type === 'stsz') stsz = box;
    if(box.type === 'stsd') stsd = box;
    if(box.type === 'stss') stss = box;
  }
  if(!stts || !stsc || !stco || !stsz || !stsd) {
    throw new Error('Missing required box');
  }

  const samples = [];
  let hasSyncSamples = false;
  let totalDuration = 0;
  let totalSize = 0;

  let chunkIdx, chunkRunIdx, lastSampleInChunk, offsetInChunk, lastChunkInRun;

  let lastSampleInSttsRun = -1;
  let sttsRunIdx = -1;
  let lastSampleInCttsRun = -1;
  let cttsRunIdx = -1;
  let lastStssIndex = 0;

  for(let i = 0; i < stsz.sample_count; i++) {
    const sample = {
      idx: i,
      size: stsz.sample_size || stsz.entry_sizes[i]
    } as Mp4Sample;
    totalSize += sample.size;
    samples.push(sample);

    // computing chunk-based properties (offset, sample description index)
    if(i === 0) {
      chunkIdx = 1; // chunks are 1-indexed
      chunkRunIdx = 0; // the first chunk is the first entry in the first_chunk table
      lastSampleInChunk = stsc.entries[chunkRunIdx].samples_per_chunk;
      offsetInChunk = 0;

      sample.chunkIdx = chunkIdx;
      sample.chunkRunIdx = chunkRunIdx;

      if(chunkRunIdx + 1 < stsc.entry_count) {
        /* The last chunk in the run is the chunk before the next first chunk */
        lastChunkInRun = stsc.entries[chunkRunIdx + 1].first_chunk - 1;
      } else {
        /* There is only one entry in the table, it is valid for all future chunks*/
        lastChunkInRun = Infinity;
      }
    } else if(i < lastSampleInChunk) {
      /* the sample is still in the current chunk */
      sample.chunkIdx = chunkIdx;
      sample.chunkRunIdx = chunkRunIdx;
    } else {
      /* the sample is in the next chunk */
      chunkIdx++;
      sample.chunkIdx = chunkIdx;
      offsetInChunk = 0;
      if(chunkIdx <= lastChunkInRun) {
        /* stay in the same entry of the first_chunk table */
        /* chunk_run_index unmodified */
      } else {
        chunkRunIdx++;
        /* Is there another entry in the first_chunk table ? */
        if(chunkRunIdx + 1 < stsc.entry_count) {
          /* The last chunk in the run is the chunk before the next first chunk */
          lastChunkInRun = stsc.entries[chunkRunIdx + 1].first_chunk - 1;
        } else {
          /* There is only one entry in the table, it is valid for all future chunks*/
          lastChunkInRun = Infinity;
        }
      }

      sample.chunkRunIdx = chunkRunIdx;
      lastSampleInChunk += stsc.entries[chunkRunIdx].samples_per_chunk;
    }

    sample.descriptionIndex = stsc.entries[chunkRunIdx].sample_description_index - 1;
    sample.offset = stco.chunk_offsets[sample.chunkIdx - 1] + offsetInChunk;
    offsetInChunk += sample.size;

    /* setting dts, cts, duration and rap flags */
    if(i > lastSampleInSttsRun) {
      sttsRunIdx += 1;
      if(lastSampleInSttsRun < 0) {
        lastSampleInSttsRun = 0;
      }
      lastSampleInSttsRun += stts.entries[sttsRunIdx].sample_count;
    }

    if(i > 0) {
      const prevSample = samples[i - 1];
      prevSample.duration = stts.entries[sttsRunIdx].sample_delta;
      totalDuration += prevSample.duration;
      sample.dts = prevSample.dts + prevSample.duration;
    } else {
      sample.dts = 0;
    }

    if(ctts) {
      if(i >= lastSampleInCttsRun) {
        cttsRunIdx += 1;
        if(lastSampleInCttsRun < 0) {
          lastSampleInCttsRun = 0;
        }
        lastSampleInCttsRun += ctts.entries[cttsRunIdx].sample_count;
      }
      sample.cts = sample.dts + ctts.entries[cttsRunIdx].sample_offset;
    } else {
      sample.cts = sample.dts;
    }

    if(stss) {
      if(i === stss.sample_numbers[lastStssIndex] - 1) {
        sample.isSync = true;
        hasSyncSamples = true;
        lastStssIndex++;
      } else {
        sample.isSync = false;
      }
    } else {
      sample.isSync = true;
      hasSyncSamples = true;
    }
  }

  if(samples.length) {
    const lastSample = samples[samples.length - 1];
    lastSample.duration = Math.max(0, mdhd.duration - lastSample.dts);
    totalDuration += lastSample.duration;
  }

  return {
    mdhd,
    totalSize,
    samples,
    hasSyncSamples
  };
}
