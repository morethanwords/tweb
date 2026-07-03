// Live amplitude tap used by the recording UI to draw the in-progress waveform.
// Independent of VoiceWaveformAnalyser (which produces the 63-byte payload sent
// with the message): this one emits a steady stream of unprocessed peaks at a
// fixed window, so the UI can scroll bars without the iOS-style log compression
// the message waveform applies.

const BUFFER_LENGTH = 2048; // ~43ms at 48kHz

function connectSilentSink(context: BaseAudioContext, node: AudioNode) {
  const sink = context.createGain();
  sink.gain.value = 0;
  node.connect(sink);
  sink.connect(context.destination);
  return sink;
}

export default class LiveWaveformAnalyser {
  private sourceNode: AudioNode;
  private scriptProcessor: ScriptProcessorNode;
  private silentSink: GainNode;
  private finished = false;
  private paused = false;

  public onpeak: (peak: number) => void = () => {};

  constructor(sourceNode?: AudioNode) {
    if(!sourceNode) return;

    this.sourceNode = sourceNode;
    const ctx = sourceNode.context;
    this.scriptProcessor = ctx.createScriptProcessor(BUFFER_LENGTH, 1, 1);
    this.scriptProcessor.onaudioprocess = this.onAudioProcess;
    sourceNode.connect(this.scriptProcessor);
    this.silentSink = connectSilentSink(ctx, this.scriptProcessor);
  }

  public setPaused(paused: boolean) {
    this.paused = paused;
  }

  public feed(samples: Float32Array) {
    if(this.finished || this.paused) return;
    this.emitPeak(samples);
  }

  private onAudioProcess = (e: AudioProcessingEvent) => {
    if(this.finished || this.paused) return;
    this.emitPeak(e.inputBuffer.getChannelData(0));
  };

  private emitPeak(channel: Float32Array) {
    let peak = 0;
    for(let i = 0; i < channel.length; ++i) {
      const v = Math.abs(channel[i]);
      if(v > peak) peak = v;
    }
    this.onpeak(peak);
  }

  public destroy() {
    if(this.finished) return;
    this.finished = true;
    try {
      this.sourceNode?.disconnect(this.scriptProcessor);
    } catch(e) {}
    try {
      this.scriptProcessor?.disconnect();
      this.silentSink?.disconnect();
    } catch(e) {}
    if(this.scriptProcessor) this.scriptProcessor.onaudioprocess = null;
  }
}
