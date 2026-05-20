/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// Live waveform extractor for voice messages.
// Taps the same MediaStream the Opus encoder is reading from and computes peaks
// from raw Float32 PCM, mirroring the algorithm used by iOS / Android / tdesktop:
//   * per-chunk amplitude = peak (max abs)
//   * adaptive log-step downsampling (iOS-style) to keep ≤ 200 buckets in memory
//   * final pass: peak = max(sum*1.8/N, 2500); value = min(31, min(s, peak)*31/peak)
//   * 5-bit LSB-first packing across byte boundaries

export const WAVEFORM_SAMPLES_COUNT = 100;
export const WAVEFORM_BYTES_LENGTH = Math.ceil(WAVEFORM_SAMPLES_COUNT * 5 / 8); // 63
const DOWNSAMPLE_THRESHOLD = WAVEFORM_SAMPLES_COUNT * 2; // 200

// ScriptProcessorNode is deprecated but present in every browser Telegram Web
// targets — opus-recorder uses it too, so this adds no compatibility risk.
// Migrating both to AudioWorkletNode would be a separate, larger change.
const SCRIPT_PROCESSOR_BUFFER_LENGTH = 4096;

export default class VoiceWaveformAnalyser {
  private sourceNode: AudioNode;
  private scriptProcessor: ScriptProcessorNode;
  private peaks: number[];
  private currentPeak: number;
  private currentPeakCount: number;
  private peakCompressionFactor: number;
  private finished: boolean;

  constructor(sourceNode: AudioNode) {
    this.sourceNode = sourceNode;
    this.peaks = [];
    this.currentPeak = 0;
    this.currentPeakCount = 0;
    this.peakCompressionFactor = 1;
    this.finished = false;

    const context = sourceNode.context;
    this.scriptProcessor = context.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_LENGTH, 1, 1);
    this.scriptProcessor.onaudioprocess = this.onAudioProcess;
    sourceNode.connect(this.scriptProcessor);
    // ScriptProcessor only fires onaudioprocess while plugged into the graph.
    // Output buffer is left untouched, so destination receives silence.
    this.scriptProcessor.connect(context.destination);
  }

  private onAudioProcess = (e: AudioProcessingEvent) => {
    if(this.finished) return;

    const channel = e.inputBuffer.getChannelData(0);
    const len = channel.length;
    let peak = this.currentPeak;
    let count = this.currentPeakCount;

    for(let i = 0; i < len; ++i) {
      const sample = Math.abs(channel[i]) * 32767;
      if(sample > peak) peak = sample;
      if(++count === this.peakCompressionFactor) {
        this.peaks.push(peak);
        peak = 0;
        count = 0;

        if(this.peaks.length >= DOWNSAMPLE_THRESHOLD) {
          for(let j = 0; j < WAVEFORM_SAMPLES_COUNT; ++j) {
            const a = this.peaks[j * 2];
            const b = this.peaks[j * 2 + 1];
            this.peaks[j] = a > b ? a : b;
          }
          this.peaks.length = WAVEFORM_SAMPLES_COUNT;
          this.peakCompressionFactor *= 2;
        }
      }
    }

    this.currentPeak = peak;
    this.currentPeakCount = count;
  };

  public finish(): Uint8Array {
    if(this.finished) return new Uint8Array(WAVEFORM_BYTES_LENGTH);
    this.finished = true;

    try {
      this.sourceNode.disconnect(this.scriptProcessor);
    } catch(e) {}
    this.scriptProcessor.disconnect();
    this.scriptProcessor.onaudioprocess = null;

    const peaks = this.peaks.slice(0, WAVEFORM_SAMPLES_COUNT);
    while(peaks.length < WAVEFORM_SAMPLES_COUNT) peaks.push(0);

    let sum = 0;
    for(let i = 0; i < peaks.length; ++i) sum += peaks[i];
    let normPeak = sum * 1.8 / peaks.length;
    if(normPeak < 2500) normPeak = 2500;

    const result = new Uint8Array(WAVEFORM_BYTES_LENGTH);
    for(let i = 0; i < peaks.length; ++i) {
      const clamped = peaks[i] < normPeak ? peaks[i] : normPeak;
      const v = Math.min(31, (clamped * 31 / normPeak) | 0);
      const bitOffset = i * 5;
      const byteIndex = bitOffset >> 3;
      const bitShift = bitOffset & 7;
      result[byteIndex] |= (v << bitShift) & 0xFF;
      if(bitShift > 3 && byteIndex + 1 < result.length) {
        result[byteIndex + 1] |= (v >> (8 - bitShift)) & 0xFF;
      }
    }

    return result;
  }
}
