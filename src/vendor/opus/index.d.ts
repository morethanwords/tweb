export interface DecodeError {
  message: string;
  frameLength: number;
  frameNumber: number;
  inputBytes: number;
  outputSamples: number;
}

export interface OpusDecodedAudio {
  channelData: Float32Array[];
  samplesDecoded: number;
  sampleRate: 48000;
  errors: DecodeError[];
}

export interface OpusDecoderInit {
  forceStereo?: boolean;
  preSkip?: number;
  channels?: number;
  streamCount?: number;
  coupledStreamCount?: number;
  channelMappingTable?: number[];
}

export class OpusDecoder {
  constructor(options?: OpusDecoderInit);
  ready: Promise<void>;
  reset: () => Promise<void>;
  free: () => void;
  decodeFrame: (opusFrame: Uint8Array) => OpusDecodedAudio;
  decodeFrames: (opusFrames: Uint8Array[]) => OpusDecodedAudio;
}