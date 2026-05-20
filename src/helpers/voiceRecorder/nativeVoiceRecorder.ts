/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// Native voice recorder built on the standard web platform — no WASM:
//   getUserMedia → AudioContext(48k) → AudioWorklet (PCM tap) →
//     WebCodecs AudioEncoder (opus) → OGG/Opus muxer.
//
// Mirrors the parts of the opus-recorder API that input.ts uses, so the
// caller can swap implementations without conditionals at the use site.

import OggOpusWriter from './oggOpusWriter';
import isNativeVoiceRecorderSupported from './isNativeSupported';

export {isNativeVoiceRecorderSupported};

const WORKLET_SOURCE = `
class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.bufferSize = opts.bufferSize || 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if(!input || !input[0] || input[0].length === 0) return true;
    const channel = input[0];
    let i = 0;
    while(i < channel.length) {
      const remaining = this.bufferSize - this.bufferIndex;
      const toCopy = remaining < (channel.length - i) ? remaining : (channel.length - i);
      this.buffer.set(channel.subarray(i, i + toCopy), this.bufferIndex);
      this.bufferIndex += toCopy;
      i += toCopy;
      if(this.bufferIndex === this.bufferSize) {
        this.port.postMessage(this.buffer.slice(0));
        this.bufferIndex = 0;
      }
    }
    return true;
  }
}
registerProcessor('voice-capture-processor', VoiceCaptureProcessor);
`;

const WORKLET_PROCESSOR_NAME = 'voice-capture-processor';
const WORKLET_BUFFER_SIZE = 2048;
const ENCODER_SAMPLE_RATE = 48000;
const DEFAULT_BITRATE = 32000;
const DEFAULT_FRAME_DURATION_US = 20000;
const DEFAULT_OPUS_FRAME_SAMPLES = (DEFAULT_FRAME_DURATION_US * ENCODER_SAMPLE_RATE) / 1_000_000;

export interface NativeVoiceRecorderConfig {
  encoderSampleRate?: number;
  numberOfChannels?: number;
  encoderBitRate?: number;
  mediaTrackConstraints?: boolean | MediaTrackConstraints;
}

type State = 'inactive' | 'recording';

export default class NativeVoiceRecorder {
  public sourceNode: MediaStreamAudioSourceNode;
  public state: State = 'inactive';

  public onstart: () => void = () => {};
  public onstop: () => void = () => {};
  public ondataavailable: (data: Uint8Array) => void = () => {};

  private config: Required<Pick<NativeVoiceRecorderConfig, 'encoderSampleRate' | 'numberOfChannels' | 'encoderBitRate'>> & {
    mediaTrackConstraints: boolean | MediaTrackConstraints
  };

  private stream: MediaStream;
  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode;
  private encoder: AudioEncoder;
  private writer: OggOpusWriter;
  private workletUrl: string;
  private encoderTimestampUs = 0;
  private opusHeadCaptured = false;

  static isSupported = isNativeVoiceRecorderSupported;

  constructor(config: NativeVoiceRecorderConfig = {}) {
    this.config = {
      encoderSampleRate: config.encoderSampleRate ?? ENCODER_SAMPLE_RATE,
      numberOfChannels: config.numberOfChannels ?? 1,
      encoderBitRate: config.encoderBitRate ?? DEFAULT_BITRATE,
      mediaTrackConstraints: config.mediaTrackConstraints ?? true
    };
  }

  public async start(): Promise<void> {
    if(this.state !== 'inactive') return;

    this.stream = await navigator.mediaDevices.getUserMedia({audio: this.config.mediaTrackConstraints});

    this.audioContext = new AudioContext({sampleRate: this.config.encoderSampleRate});
    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

    const blob = new Blob([WORKLET_SOURCE], {type: 'application/javascript'});
    this.workletUrl = URL.createObjectURL(blob);
    await this.audioContext.audioWorklet.addModule(this.workletUrl);

    this.workletNode = new AudioWorkletNode(this.audioContext, WORKLET_PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [this.config.numberOfChannels],
      processorOptions: {bufferSize: WORKLET_BUFFER_SIZE}
    });

    this.writer = new OggOpusWriter({
      channels: this.config.numberOfChannels,
      inputSampleRate: this.config.encoderSampleRate
    });

    this.encoder = new AudioEncoder({
      output: (chunk, metadata) => this.onEncoderChunk(chunk, metadata),
      error: (err) => console.error('[NativeVoiceRecorder] encoder error:', err)
    });

    this.encoder.configure({
      codec: 'opus',
      sampleRate: this.config.encoderSampleRate,
      numberOfChannels: this.config.numberOfChannels,
      bitrate: this.config.encoderBitRate
    });

    this.workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => this.onWorkletMessage(e.data);

    this.sourceNode.connect(this.workletNode);
    // AudioWorkletNode needs a downstream consumer for process() to be called;
    // outputs are silent (we never write to them).
    this.workletNode.connect(this.audioContext.destination);

    this.state = 'recording';
    this.encoderTimestampUs = 0;
    this.opusHeadCaptured = false;
    this.onstart();
  }

  private onWorkletMessage(samples: Float32Array) {
    if(this.state !== 'recording') return;
    const numberOfFrames = samples.length / this.config.numberOfChannels;
    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate: this.config.encoderSampleRate,
      numberOfFrames,
      numberOfChannels: this.config.numberOfChannels,
      timestamp: this.encoderTimestampUs,
      data: samples.slice()
    });
    this.encoderTimestampUs += (numberOfFrames * 1_000_000) / this.config.encoderSampleRate;
    try {
      this.encoder.encode(audioData);
    } catch(err) {
      console.error('[NativeVoiceRecorder] encode error:', err);
    }
    audioData.close();
  }

  private onEncoderChunk(chunk: EncodedAudioChunk, metadata?: EncodedAudioChunkMetadata) {
    if(!this.opusHeadCaptured && metadata?.decoderConfig?.description) {
      const desc = metadata.decoderConfig.description;
      let bytes: Uint8Array;
      if(desc instanceof ArrayBuffer) {
        bytes = new Uint8Array(desc);
      } else {
        const view = desc as ArrayBufferView;
        bytes = new Uint8Array(view.buffer as ArrayBuffer, view.byteOffset, view.byteLength);
      }
      this.writer.setOpusHead(bytes);
      this.opusHeadCaptured = true;
    }

    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);

    const durationUs = chunk.duration ?? DEFAULT_FRAME_DURATION_US;
    const durationSamples = Math.round((durationUs * ENCODER_SAMPLE_RATE) / 1_000_000) || DEFAULT_OPUS_FRAME_SAMPLES;
    this.writer.writePacket(data, durationSamples);
  }

  public async stop(): Promise<void> {
    if(this.state !== 'recording') return;
    this.state = 'inactive';

    try {
      this.sourceNode?.disconnect();
    } catch(e) {}
    if(this.workletNode) {
      try {
        this.workletNode.disconnect();
      } catch(e) {}
      this.workletNode.port.onmessage = null;
    }

    if(this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
    }

    if(this.encoder && this.encoder.state !== 'closed') {
      try {
        await this.encoder.flush();
      } catch(e) {
        console.error('[NativeVoiceRecorder] flush error:', e);
      }
      try {
        this.encoder.close();
      } catch(e) {}
    }

    const ogg = this.writer ? this.writer.finalize() : new Uint8Array(0);

    if(this.workletUrl) {
      URL.revokeObjectURL(this.workletUrl);
      this.workletUrl = undefined;
    }

    if(this.audioContext && this.audioContext.state !== 'closed') {
      try {
        await this.audioContext.close();
      } catch(e) {}
    }

    this.ondataavailable(ogg);
    this.onstop();
  }
}
