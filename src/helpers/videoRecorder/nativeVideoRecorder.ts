// Native round-video-note recorder.
//
//   getUserMedia(video + audio) → center-cropped square <canvas> (drawn per
//   camera frame) → canvas.captureStream() + the mic track → MediaRecorder
//   (mp4/avc1+aac, or webm/vp9|vp8+opus fallback) → Blob.
//
// Why the canvas: round notes are SQUARE (iOS/Desktop 400×400, Android 384×384;
// we use the larger, 400). Cameras only output rectangular feeds (640×480,
// 1280×720…), and MediaRecorder would otherwise encode that rectangle — so the
// sent file would neither be square nor match the documentAttributeVideo w/h.
// Drawing a centre-cropped square onto a fixed-size canvas guarantees the
// encoded video is exactly `width`×`height`, matching the official clients.
//
// `stream` stays the RAW camera+mic stream (the chat input shows it in the
// preview circle and taps its audio for the waveform); the MediaRecorder
// records the canvas stream instead.
//
// Paused preview: round notes are sent as mp4 (the only container every
// recipient — incl. iOS/macOS — can play), but Chrome's mp4 MediaRecorder emits
// data ONLY at stop(), so the mid-recording snapshot the paused preview plays
// would be empty. To keep preview working "like voice" we run a SECOND, webm
// recorder on the same stream purely for getSnapshot() (webm timeslice chunks
// are independently playable). The sent file is always the mp4 one.
//
// Mirrors the parts of the NativeVoiceRecorder API that input.ts uses (state,
// onstart/onstop/onpause/onresume/ondataavailable, getSnapshot).

import {IS_APPLE_MOBILE, IS_SAFARI} from '@environment/userAgent';
import acquireStream, {StreamAcquisition} from '@lib/calls/helpers/acquireStream';

export interface NativeVideoRecorderConfig {
  // Square output dimensions written to the encoded file. 400 = the larger of
  // iOS (400) and Android (384), matching what other clients send.
  width?: number;
  height?: number;
  videoBitsPerSecond?: number;
  audioBitsPerSecond?: number;
  frameRate?: number;
  facingMode?: 'user' | 'environment';
  videoDeviceId?: string;
  audioDeviceId?: string;
}

type State = 'inactive' | 'recording' | 'paused';

// Codec preferences, ordered most → least preferred. mp4/h264 matches what
// official clients send; webm is the universal fallback in browsers without
// MP4 in MediaRecorder (older Chrome/Firefox).
const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm'
];

function pickMimeType(): string | undefined {
  if(typeof MediaRecorder === 'undefined') return undefined;
  for(const mime of MIME_CANDIDATES) {
    try {
      if(MediaRecorder.isTypeSupported(mime)) return mime;
    } catch(e) {}
  }
  // No candidate matched — return undefined (not '') so isNativeVideoRecorderSupported
  // correctly reports unsupported on a UA with MediaRecorder but no usable codec.
  return undefined;
}

// Streamable container for the paused-preview snapshot. Chrome's mp4
// MediaRecorder emits a playable file ONLY at stop() (no mid-stream chunks), so
// when the sent file is mp4 we run a SECOND, parallel recorder in webm — whose
// timeslice chunks ARE independently decodable — purely to back the "play what
// you've recorded so far" preview. Nothing here is sent.
const PREVIEW_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm'
];

function pickPreviewMimeType(): string | undefined {
  if(typeof MediaRecorder === 'undefined') return undefined;
  for(const mime of PREVIEW_MIME_CANDIDATES) {
    try {
      if(MediaRecorder.isTypeSupported(mime)) return mime;
    } catch(e) {}
  }
  return undefined;
}

export function isNativeVideoRecorderSupported(): boolean {
  if(typeof MediaRecorder === 'undefined') return false;
  if(!navigator?.mediaDevices?.getUserMedia) return false;
  if(typeof HTMLCanvasElement === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return false;
  // WebKit (Safari + all iOS browsers) exposes canvas.captureStream and an mp4
  // MediaRecorder, but the canvas-captured video track is broken — invalid
  // frames and a possible hang on stop() (WebKit bug #181663). Disable video
  // notes there; getActiveRecordingMediaType() falls back to voice.
  if(IS_SAFARI || IS_APPLE_MOBILE) return false;
  return pickMimeType() !== undefined;
}

export default class NativeVideoRecorder {
  // Raw camera+mic stream — the chat input renders this in the preview circle
  // and taps its audio for the waveform. NOT what gets recorded (see canvas).
  public stream: MediaStream;
  public state: State = 'inactive';
  public mimeType: string;

  public onstart: () => void = () => {};
  public onstop: () => void = () => {};
  public onpause: () => void = () => {};
  public onresume: () => void = () => {};
  public ondataavailable: (blob: Blob) => void = () => {};

  private config: Required<Omit<NativeVideoRecorderConfig, 'videoDeviceId' | 'audioDeviceId' | 'facingMode'>> & {
    videoDeviceId?: string;
    audioDeviceId?: string;
    facingMode: 'user' | 'environment';
  };

  private mediaRecorder: MediaRecorder;
  private chunks: Blob[] = [];
  // Guards emitResult() so the blob is sent once — onstop and the stop()-error
  // fallback can otherwise both fire.
  private finished = false;

  // Parallel webm recorder backing the paused-preview snapshot (see
  // PREVIEW_MIME_CANDIDATES). Only created when the sent container (mp4) can't
  // produce mid-stream playable data; when the sent file is already a
  // streamable webm we timeslice the main recorder and read its chunks instead.
  private previewRecorder: MediaRecorder;
  private previewChunks: Blob[] = [];
  private previewMimeType: string;
  private snapshotContainer: string; // container of getSnapshot()'s blobs

  // Square-crop pipeline.
  private drawVideo: HTMLVideoElement;     // plays `stream`, source for the canvas
  private canvas: HTMLCanvasElement;       // width×height square, encoded as-is
  private canvasCtx: CanvasRenderingContext2D;
  private canvasStream: MediaStream;       // canvas.captureStream() — video only
  private drawing = false;
  // Holds the in-flight / active camera+mic acquire. dispose() (called from
  // releaseStream()) stops its tracks even if getUserMedia resolves DURING the
  // up-to-1.5s warm-up, after a cancel / ChatRecording.destroy() — getUserMedia
  // can't be cancelled, so without this the camera LED would stay on forever.
  // See acquireStream.
  private acquisition: StreamAcquisition | undefined;

  static isSupported = isNativeVideoRecorderSupported;

  constructor(config: NativeVideoRecorderConfig = {}) {
    this.config = {
      width: config.width ?? 400,
      height: config.height ?? 400,
      videoBitsPerSecond: config.videoBitsPerSecond ?? 1_200_000,
      audioBitsPerSecond: config.audioBitsPerSecond ?? 64_000,
      frameRate: config.frameRate ?? 30,
      facingMode: config.facingMode ?? 'user',
      videoDeviceId: config.videoDeviceId,
      audioDeviceId: config.audioDeviceId
    };
  }

  // Choose the camera/microphone to record with (empty/undefined = OS default).
  // The caller passes the user's picks from Settings → Speakers and Camera
  // (appSettings.callDevices.cameraId/microphoneId), same source as calls.
  // Applied on the next start().
  public setDeviceIds(videoDeviceId?: string, audioDeviceId?: string) {
    this.config.videoDeviceId = videoDeviceId || undefined;
    this.config.audioDeviceId = audioDeviceId || undefined;
  }

  public async start(): Promise<void> {
    if(this.state !== 'inactive') return;

    // The recorder is reused across recordings — drop prior chunks and release
    // a stream the caller may have left alive for the stop animation.
    this.chunks = [];
    this.previewChunks = [];
    this.finished = false;
    this.releaseStream();

    // Source a bit larger than the square output so the centre-crop stays sharp
    // (`ideal`, never `min` — a hard min paired with `deviceId:{exact}` becomes
    // OverconstrainedError). Honour the camera/mic the caller selected (Settings
    // → Speakers and Camera) via videoDeviceId/audioDeviceId.
    const video: MediaTrackConstraints = {
      width: {ideal: 720},
      height: {ideal: 720},
      frameRate: {ideal: this.config.frameRate}
    };
    if(this.config.videoDeviceId) {
      video.deviceId = {exact: this.config.videoDeviceId};
    } else {
      video.facingMode = this.config.facingMode;
    }

    const audio: MediaTrackConstraints = {};
    if(this.config.audioDeviceId) {
      audio.deviceId = {exact: this.config.audioDeviceId};
    }

    // Reuse the call stack's getUserMedia chokepoint: if a selected device is
    // gone it strips the deviceId, clears the stale appSettings.callDevices.*
    // entry and retries on the OS default — round notes get the exact same
    // self-healing device fallback as calls.
    const acquisition = this.acquisition = acquireStream({video, audio: Object.keys(audio).length ? audio : true});
    const stream = await acquisition.promise;
    // Released (cancel / ChatRecording.destroy()) while getUserMedia was
    // resolving — dispose() already stopped the orphaned stream; bail so the
    // camera doesn't go live with no owner.
    if(!stream) return;
    this.stream = stream;

    // Off-DOM <video> that decodes the raw camera feed for the canvas.
    this.drawVideo = document.createElement('video');
    this.drawVideo.muted = true;
    this.drawVideo.playsInline = true;
    this.drawVideo.srcObject = this.stream;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.config.width;
    this.canvas.height = this.config.height;
    this.canvasCtx = this.canvas.getContext('2d', {willReadFrequently: true}) as CanvasRenderingContext2D;

    await this.drawVideo.play().catch(() => {});

    // Don't begin recording on the camera's black warm-up frames — wait until
    // it outputs a visible (non-black) frame, so the clip doesn't start black.
    await this.waitForVisibleFrame();
    if(!this.stream) return; // released (cancel/destroy) while we waited

    // Prime the canvas with the first real frame, then keep it fed.
    this.drawCroppedFrame();
    this.startDrawLoop();

    this.mimeType = pickMimeType();
    try {
      this.canvasStream = this.canvas.captureStream(this.config.frameRate);
      const videoTrack = this.canvasStream.getVideoTracks()[0];
      if(!videoTrack || videoTrack.readyState !== 'live') {
        // e.g. a broken canvas.captureStream — bail rather than record a black/empty clip.
        throw new Error('canvas.captureStream produced no live video track');
      }
      const recordStream = new MediaStream([
        videoTrack,
        ...this.stream.getAudioTracks()
      ]);

      const options: MediaRecorderOptions = {
        videoBitsPerSecond: this.config.videoBitsPerSecond,
        audioBitsPerSecond: this.config.audioBitsPerSecond
      };
      if(this.mimeType) options.mimeType = this.mimeType;

      this.mediaRecorder = new MediaRecorder(recordStream, options);
      // Prefer the container WE requested (and verified) over the recorder's
      // possibly-empty reported mimeType; drop `;codecs=…` so appMessagesManager's
      // exact-string VIDEO_MIME_TYPES_SUPPORTED lookup matches.
      const fullMime = this.mimeType || this.mediaRecorder.mimeType || 'video/webm';
      this.mimeType = fullMime.split(';')[0].trim();

      this.mediaRecorder.ondataavailable = (e) => {
        if(e.data && e.data.size > 0) this.chunks.push(e.data);
      };
      // The stream is intentionally NOT released in emitResult — the caller keeps
      // the preview alive through the fade-out and calls releaseStream() after.
      this.mediaRecorder.onstop = () => this.emitResult();

      // Paused-preview snapshot source. If the sent container is already a
      // streamable webm, timeslice the main recorder and read its own chunks.
      // Otherwise (mp4 — no mid-stream data) spin up a parallel webm recorder on
      // the same stream whose timeslice chunks are independently playable.
      const mainIsStreamable = this.mimeType.startsWith('video/webm');
      if(mainIsStreamable) {
        this.snapshotContainer = this.mimeType;
      } else {
        this.previewMimeType = pickPreviewMimeType();
        if(this.previewMimeType) {
          this.previewRecorder = new MediaRecorder(recordStream, {
            mimeType: this.previewMimeType,
            videoBitsPerSecond: this.config.videoBitsPerSecond,
            audioBitsPerSecond: this.config.audioBitsPerSecond
          });
          this.snapshotContainer = (this.previewRecorder.mimeType || this.previewMimeType).split(';')[0].trim();
          this.previewRecorder.ondataavailable = (e) => {
            if(e.data && e.data.size > 0) this.previewChunks.push(e.data);
          };
        }
      }

      // mp4: one final chunk at stop() (no timeslice). Streamable webm: periodic
      // chunks so getSnapshot() has playable data mid-recording.
      this.mediaRecorder.start(mainIsStreamable ? 250 : undefined);
      this.previewRecorder?.start(250);
    } catch(err) {
      this.releaseStream(); // tear down the half-initialised pipeline + camera
      throw err;
    }

    this.state = 'recording';
    this.onstart();
  }

  // Centre-crop the camera feed to a square and scale it into the output canvas.
  private drawCroppedFrame() {
    const v = this.drawVideo;
    const ctx = this.canvasCtx;
    if(!v || !ctx) return;
    const vw = v.videoWidth, vh = v.videoHeight;
    if(!vw || !vh) return;
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;
    ctx.drawImage(v, sx, sy, side, side, 0, 0, this.config.width, this.config.height);
  }

  private startDrawLoop() {
    if(this.drawing) return;
    this.drawing = true;
    // Drive draws with requestAnimationFrame, NOT requestVideoFrameCallback:
    // rVFC only fires while the source <video> is actually being rendered, and
    // ours is off-DOM (never appended) — and the tab may be unfocused — so rVFC
    // can stay silent forever, freezing the canvas and yielding a ~1-frame clip.
    // rAF keeps ticking regardless.
    //
    // Throttle to the capture frame rate: rAF fires at the display rate (~60fps)
    // but canvas.captureStream(frameRate) only samples at config.frameRate (30),
    // so drawing every tick just burns CPU on a redundant 720→400 drawImage and
    // steals main-thread time from the encoder / live preview / waveform — which
    // can drop the *captured* rate under load. Drawing at the capture rate keeps
    // output fps identical while ~halving the crop work; under heavy load the
    // gate is a no-op (ticks already arrive slower than the interval).
    const minIntervalMs = 1000 / this.config.frameRate;
    let lastDraw = 0;
    const tick = (now: number) => {
      if(!this.drawing) return;
      if(now - lastDraw >= minIntervalMs - 1) {
        lastDraw = now;
        this.drawCroppedFrame();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Resolves once the camera produces a non-black frame (or after a safety
  // timeout / a few frames in a genuinely dark room). Samples the centre-crop
  // canvas so the very first recorded frame is the visible one.
  private waitForVisibleFrame(): Promise<void> {
    return new Promise((resolve) => {
      const v = this.drawVideo;
      if(!v || !this.canvasCtx) {
        resolve();
        return;
      }

      let done = false;
      let frames = 0;
      const finish = () => {
        if(done) return;
        done = true;
        clearTimeout(safety);
        resolve();
      };
      const safety = setTimeout(finish, 1500);

      // rAF, not rVFC — see startDrawLoop: rVFC never fires for our off-DOM /
      // unfocused video, which would stall first-frame detection until the
      // safety timeout and then start recording on a frozen canvas.
      const schedule = () => requestAnimationFrame(check);

      const check = () => {
        if(done || !this.stream) {
          finish();
          return;
        }
        frames++;
        let bright = false;
        try {
          this.drawCroppedFrame();
          const sw = Math.min(16, this.canvas.width);
          const data = this.canvasCtx.getImageData(0, 0, sw, sw).data;
          let sum = 0;
          for(let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
          bright = sum / (sw * sw * 3) > 10; // 0..255 avg luminance
        } catch(e) {
          bright = true; // can't sample — don't block recording
        }
        // Give up after ~25 frames so a genuinely dark scene still records.
        if(bright || frames >= 25) finish();
        else schedule();
      };

      schedule();
    });
  }

  public async pause(): Promise<void> {
    if(this.state !== 'recording' || !this.mediaRecorder) return;
    // Flush a pending chunk on whichever recorder backs getSnapshot() so the
    // paused preview includes everything captured so far.
    const snapshotRecorder = this.previewRecorder || this.mediaRecorder;
    try {
      snapshotRecorder.requestData?.();
    } catch(e) {}
    try {
      this.previewRecorder?.pause();
    } catch(e) {}
    this.mediaRecorder.pause();
    // Stop feeding the canvas while paused — no recorder is consuming it, so the
    // rAF crop loop would just burn CPU/GPU for the whole (possibly long) pause.
    this.drawing = false;
    this.state = 'paused';
    this.onpause();
  }

  public resume(): void {
    if(this.state !== 'paused' || !this.mediaRecorder) return;
    // Refresh the canvas and restart the crop loop before the recorders resume,
    // so they don't capture a stale frozen frame.
    this.drawCroppedFrame();
    this.startDrawLoop();
    try {
      this.previewRecorder?.resume();
    } catch(e) {}
    this.mediaRecorder.resume();
    this.state = 'recording';
    this.onresume();
  }

  // A playable Blob of everything captured so far — for the paused preview.
  // Sourced from the streamable (webm) chunks; mp4's own chunks aren't
  // mid-stream playable. Undefined when no streamable source exists (e.g.
  // mp4-only browsers) — the caller then just shows the frozen last frame.
  public getSnapshot(): Blob | undefined {
    const chunks = this.previewRecorder ? this.previewChunks : this.chunks;
    if(!chunks.length || !this.snapshotContainer) return undefined;
    return new Blob(chunks, {type: this.snapshotContainer});
  }

  public stop(): void {
    if(this.state === 'inactive' || !this.mediaRecorder) return;
    this.state = 'inactive';
    try {
      this.previewRecorder?.stop();
    } catch(e) {}
    try {
      this.mediaRecorder.stop(); // → onstop → emitResult()
    } catch(e) {
      this.emitResult(); // stop() threw and onstop won't fire — emit directly
    }
  }

  // Emit the recorded blob + fire onstop exactly once, whether triggered by the
  // recorder's onstop or the stop()-error fallback. The camera stream is NOT
  // released here — the caller fades the preview out and calls releaseStream().
  private emitResult() {
    if(this.finished) return;
    this.finished = true;
    const blob = new Blob(this.chunks, {type: this.mimeType});
    this.ondataavailable(blob);
    this.onstop();
  }

  // Stop the camera/mic + canvas pipeline. Public so the caller can keep the
  // preview visible during the stop animation and release afterwards.
  // Idempotent.
  public releaseStream() {
    this.drawing = false;
    // Stops the camera+mic stream — including one still awaiting getUserMedia
    // (see start()), which dispose() stops the instant it resolves.
    this.acquisition?.dispose();
    this.acquisition = undefined;

    if(this.previewRecorder) {
      try {
        if(this.previewRecorder.state !== 'inactive') this.previewRecorder.stop();
      } catch(e) {}
      this.previewRecorder.ondataavailable = null;
      this.previewRecorder = undefined;
    }
    this.previewChunks = [];

    if(this.mediaRecorder) {
      try {
        if(this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
      } catch(e) {}
      this.mediaRecorder.ondataavailable = null;
      this.mediaRecorder.onstop = null;
      this.mediaRecorder = undefined;
    }
    // Free the recorded blob array (can be several MB) instead of holding it
    // until the next start(). The sent Blob was already built in emitResult().
    this.chunks = [];

    if(this.canvasStream) {
      this.canvasStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch(e) {}
      });
      this.canvasStream = undefined;
    }

    if(this.drawVideo) {
      try {
        this.drawVideo.pause();
      } catch(e) {}
      this.drawVideo.srcObject = null;
      this.drawVideo = undefined;
    }
    this.canvas = undefined;
    this.canvasCtx = undefined;

    // `this.stream` is the acquisition's stream; dispose() above stopped its
    // tracks.
    this.stream = undefined;
  }
}
