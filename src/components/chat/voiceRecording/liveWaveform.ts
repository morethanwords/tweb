// Canvas renderer for the in-input voice recording waveform.
//   * During recording: bars push in from the right and scroll left once the
//     visible window fills. Each bar is one normalized peak.
//   * During pause/playback: peaks are frozen and a vertical playhead overlay
//     splits "played" (dim) from "remaining" (bright) bars.

const BAR_WIDTH = 3;
const BAR_GAP = 3;
const BAR_RADIUS = 1.5;
const MIN_BAR_HEIGHT = 3;

export interface LiveWaveformOptions {
  height?: number;
  width?: number;
  // CSS custom property names to read colors from the canvas element. Falls back
  // to the resolved `color` if the var is empty.
  activeColorVar?: string;
  inactiveColorVar?: string;
}

export default class LiveWaveform {
  public element: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private peaks: number[] = [];
  // Lifetime peak — used as the normalization reference. Speech of the same
  // loudness renders at the same height because the reference doesn't shrink
  // between syllables. A new louder peak rescales the reference upward; old
  // bars already rendered keep their drawn height (we don't repaint them).
  private maxPeak = 0.05;
  private capacity = 0;
  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;
  private progress: number | undefined;
  private activeColorVar: string;
  private inactiveColorVar: string;
  private rafScheduled = false;
  private resizeObserver?: ResizeObserver;
  // Called when the user clicks on the waveform. Argument is a 0..1 position
  // along the bars (left edge = 0, right edge = 1). Only invoked while
  // setSeekable(true) has been called — by convention the panel only enables
  // seeking during playback.
  public onSeek?: (progress: number) => void;
  private seekable = false;

  constructor(opts: LiveWaveformOptions = {}) {
    this.element = document.createElement('canvas');
    this.element.classList.add('voice-recording-waveform');
    this.ctx = this.element.getContext('2d');
    this.activeColorVar = opts.activeColorVar || '--primary-color';
    this.inactiveColorVar = opts.inactiveColorVar || '--secondary-color';

    this.cssHeight = opts.height ?? 36;
    if(opts.width) this.cssWidth = opts.width;

    this.resizeObserver = new ResizeObserver(() => {
      this.measureAndResize();
      this.draw();
    });
    this.resizeObserver.observe(this.element);

    this.element.addEventListener('click', this.onClick);
  }

  private onClick = (e: MouseEvent) => {
    if(!this.seekable || !this.onSeek) return;
    const rect = this.element.getBoundingClientRect();
    if(rect.width <= 0) return;
    const x = e.clientX - rect.left;
    const progress = Math.max(0, Math.min(1, x / rect.width));
    this.onSeek(progress);
  };

  public setSeekable(seekable: boolean) {
    this.seekable = seekable;
    this.element.style.cursor = seekable ? 'pointer' : '';
  }

  private measureAndResize() {
    const rect = this.element.getBoundingClientRect();
    if(rect.width <= 0) return;

    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    this.dpr = window.devicePixelRatio || 1;
    this.element.width = Math.round(this.cssWidth * this.dpr);
    this.element.height = Math.round(this.cssHeight * this.dpr);
    this.capacity = Math.max(1, Math.floor((this.cssWidth + BAR_GAP) / (BAR_WIDTH + BAR_GAP)));

    // Trim oldest peaks if window shrinks below current buffer.
    if(this.peaks.length > this.capacity) {
      this.peaks.splice(0, this.peaks.length - this.capacity);
    }
  }

  public pushPeak(value: number) {
    if(value > this.maxPeak) this.maxPeak = value;
    const denom = Math.max(this.maxPeak, 0.02);
    const normalized = Math.min(1, value / denom);
    this.peaks.push(normalized);
    if(this.peaks.length > this.capacity) {
      this.peaks.splice(0, this.peaks.length - this.capacity);
    }
    this.scheduleDraw();
  }

  // Replace the entire peak buffer (used when computing the full waveform from
  // recorded audio for the pause/playback view).
  public setPeaks(peaks: ArrayLike<number>) {
    const fitted: number[] = [];
    if(this.capacity <= 0) this.measureAndResize();
    const cap = this.capacity || 1;
    if(peaks.length <= cap) {
      for(let i = 0; i < peaks.length; ++i) fitted.push(peaks[i]);
    } else {
      const ratio = peaks.length / cap;
      for(let i = 0; i < cap; ++i) {
        const start = Math.floor(i * ratio);
        const end = Math.floor((i + 1) * ratio);
        let peak = 0;
        for(let j = start; j < end && j < peaks.length; ++j) {
          if(peaks[j] > peak) peak = peaks[j];
        }
        fitted.push(peak);
      }
    }
    let max = 0.001;
    for(let i = 0; i < fitted.length; ++i) if(fitted[i] > max) max = fitted[i];
    for(let i = 0; i < fitted.length; ++i) fitted[i] = Math.min(1, fitted[i] / max);

    this.peaks = fitted;
    this.scheduleDraw();
  }

  public setProgress(progress: number | undefined) {
    this.progress = progress;
    this.scheduleDraw();
  }

  public clear() {
    this.peaks = [];
    this.maxPeak = 0.05;
    this.progress = undefined;
    this.scheduleDraw();
  }

  private scheduleDraw() {
    if(this.rafScheduled) return;
    this.rafScheduled = true;
    requestAnimationFrame(() => {
      this.rafScheduled = false;
      this.draw();
    });
  }

  private draw() {
    if(!this.cssWidth) this.measureAndResize();
    const w = this.cssWidth;
    const h = this.cssHeight;
    if(!w || !h) return;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if(!this.peaks.length) return;

    const stride = BAR_WIDTH + BAR_GAP;
    const totalWidth = this.peaks.length * stride - BAR_GAP;
    // Align bars to the right edge so live recording grows from the right.
    const startX = Math.max(0, w - totalWidth);
    const midY = h / 2;

    const computed = getComputedStyle(this.element);
    const activeColor = computed.getPropertyValue(this.activeColorVar).trim() || computed.color;
    ctx.fillStyle = activeColor;

    // Progress overlay is only used during playback. Without progress every
    // bar is primary (recording / paused-preview look). With progress set,
    // bars left of the playhead stay primary and bars to the right fade to
    // 30% (matches how the standard voice-message bubble draws unplayed bars).
    const hasProgress = this.progress != null;
    const progressPx = hasProgress ?
      startX + Math.max(0, Math.min(1, this.progress)) * totalWidth :
      Infinity;

    for(let i = 0; i < this.peaks.length; ++i) {
      const x = startX + i * stride;
      if(x + BAR_WIDTH < 0) continue;
      const peak = this.peaks[i];
      const barH = Math.max(MIN_BAR_HEIGHT, Math.min(h, peak * h));
      const y = midY - barH / 2;

      ctx.globalAlpha = !hasProgress || x + BAR_WIDTH / 2 <= progressPx ? 1 : 0.3;

      if((ctx as any).roundRect) {
        ctx.beginPath();
        (ctx as any).roundRect(x, y, BAR_WIDTH, barH, BAR_RADIUS);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, BAR_WIDTH, barH);
      }
    }

    ctx.globalAlpha = 1;
  }

  public destroy() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.element.removeEventListener('click', this.onClick);
    this.peaks = [];
  }
}
