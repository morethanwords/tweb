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

function connectSilentSink(context: BaseAudioContext, node: AudioNode) {
  const sink = context.createGain();
  sink.gain.value = 0;
  node.connect(sink);
  sink.connect(context.destination);
  return sink;
}

export default class VoiceWaveformAnalyser {
  private sourceNode: AudioNode;
  private scriptProcessor: ScriptProcessorNode;
  private silentSink: GainNode;
  private peaks: number[];
  private currentPeak: number;
  private currentPeakCount: number;
  private peakCompressionFactor: number;
  private finished: boolean;
  private paused: boolean;

  constructor(sourceNode?: AudioNode) {
    this.peaks = [];
    this.currentPeak = 0;
    this.currentPeakCount = 0;
    this.peakCompressionFactor = 1;
    this.finished = false;
    this.paused = false;

    if(!sourceNode) return;

    this.sourceNode = sourceNode;
    const context = sourceNode.context;
    this.scriptProcessor = context.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_LENGTH, 1, 1);
    this.scriptProcessor.onaudioprocess = this.onAudioProcess;
    sourceNode.connect(this.scriptProcessor);
    this.silentSink = connectSilentSink(context, this.scriptProcessor);
  }

  public setPaused(paused: boolean) {
    this.paused = paused;
  }

  // Snapshot of the current per-bucket peaks (raw int amplitudes ~0..32767).
  // Used by the recording UI to show the full waveform during pause/playback
  // — the visualizer reads this and normalizes it for canvas rendering.
  public getCurrentPeaks(): number[] {
    return this.peaks.slice();
  }

  public feed(samples: Float32Array) {
    if(this.finished || this.paused) return;
    this.processChannel(samples);
  }

  private onAudioProcess = (e: AudioProcessingEvent) => {
    if(this.finished || this.paused) return;
    this.processChannel(e.inputBuffer.getChannelData(0));
  };

  private processChannel(channel: Float32Array) {
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
  }

  public finish(): Uint8Array {
    if(this.finished) return new Uint8Array(WAVEFORM_BYTES_LENGTH);
    this.finished = true;

    try {
      this.sourceNode?.disconnect(this.scriptProcessor);
    } catch(e) {}
    try {
      this.scriptProcessor?.disconnect();
      this.silentSink?.disconnect();
    } catch(e) {}
    if(this.scriptProcessor) this.scriptProcessor.onaudioprocess = null;

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
