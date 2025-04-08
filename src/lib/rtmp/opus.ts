import type {OpusDecodedAudio} from '../../vendor/opus';
import {Mp4Sample} from './mp4';
import {encodeFlacFrame} from './flac';

export type OpusDecoderDelegate = (data: Uint8Array) => MaybePromise<OpusDecodedAudio>;

export interface OpusReencodeOptions {
  decodeOpus: OpusDecoderDelegate;
  chunk: Uint8Array;
  samples: Mp4Sample[];
}

export interface FlacFrame {
  data: Uint8Array;
  duration: number;
}

export async function reencodeOpusToFlac(params: OpusReencodeOptions) {
  const {decodeOpus, chunk, samples} = params;
  const samplesPerFrame = 2048;

  let pcms: Int16Array[][] = null;
  let pendingPcmsCount = 0;
  let totalPcmCount = 0;

  const flacFrames: FlacFrame[] = [];
  function encodePendingPcms(force = false) {
    if(!force && pendingPcmsCount < samplesPerFrame) return;

    const blockSize = force ? pendingPcmsCount : samplesPerFrame;
    const frame = encodeFlacFrame({
      index: flacFrames.length,
      blockSize,
      pcms
    });
    pendingPcmsCount -= blockSize;

    flacFrames.push(frame);
  }

  for(const sample of samples) {
    const {channelData, samplesDecoded} = await decodeOpus(chunk.subarray(sample.offset, sample.offset + sample.size));

    pendingPcmsCount += samplesDecoded;
    totalPcmCount += samplesDecoded;

    if(pcms === null) pcms = Array.from({length: channelData.length}, () => [] as any);
    for(let i = 0; i < channelData.length; i++) {
      pcms[i].push(floatPcmTo16BitPcm(channelData[i]));
    }

    encodePendingPcms();
  }

  encodePendingPcms(true);

  return flacFrames;
}

function floatPcmTo16BitPcm(floatPcm: Float32Array) {
  const intPcm = new Int16Array(floatPcm.length);
  for(let i = 0; i < floatPcm.length; i++) {
    const sample = Math.max(-1, Math.min(1, floatPcm[i]));

    intPcm[i] = sample * 32767.5 - 0.5;
  }
  return intPcm;
}
