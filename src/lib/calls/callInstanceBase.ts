import safePlay from '@helpers/dom/safePlay';
import EventListenerBase, {EventListenerListeners} from '@helpers/eventListenerBase';
import createSerializedQueue, {SerializedQueue} from '@helpers/createSerializedQueue';
import WeakRefSet from '@helpers/weakRefSet';
import {logger} from '@lib/logger';
import getAudioConstraints from '@lib/calls/helpers/getAudioConstraints';
import getScreenConstraints from '@lib/calls/helpers/getScreenConstraints';
import getStream from '@lib/calls/helpers/getStream';
import getStreamCached from '@lib/calls/helpers/getStreamCached';
import getVideoConstraints from '@lib/calls/helpers/getVideoConstraints';
import stopTrack from '@lib/calls/helpers/stopTrack';
import LocalConferenceDescription from '@lib/calls/localConferenceDescription';
import StreamManager, {StreamItem} from '@lib/calls/streamManager';
import shouldMirrorVideoTrack from '@lib/calls/helpers/shouldMirrorVideoTrack';
import {appSettings} from '@stores/appSettings';

export type TryAddTrackOptions = {
  stream: MediaStream,
  track: MediaStreamTrack,
  type: StreamItem['type'],
  source?: string
};

type MediaDeviceChangeKind = 'audio' | 'video' | 'output';

/** How one remote participant is heard locally (element volume, 0..1). */
export type OutputAudioState = {volume: number, muted: boolean};

export const DEFAULT_OUTPUT_AUDIO_STATE: Readonly<OutputAudioState> = {volume: 1, muted: false};

// Remote audio is played by one element per remote track, keyed by its source,
// so a new participant never touches the element anyone else is heard through.
export function getOutputAudioElementKey(source: string | number) {
  return 'audio:' + source;
}

export default abstract class CallInstanceBase<E extends EventListenerListeners> extends EventListenerBase<E> {
  protected log: ReturnType<typeof logger>;
  protected outputDeviceId: string;

  private mediaDeviceChangeGenerations: Record<MediaDeviceChangeKind, number> = {
    audio: 0,
    video: 0,
    output: 0
  };
  private mediaDeviceChangeQueues: Record<MediaDeviceChangeKind, SerializedQueue> = {
    audio: createSerializedQueue(),
    video: createSerializedQueue(),
    output: createSerializedQueue()
  };
  protected pendingInputAudioTracks = new Set<MediaStreamTrack>();

  protected player: HTMLElement;
  protected elements: Map<string, HTMLMediaElement>;

  // Played inside the gesture that starts the call (fixSafariAudio). WebKit
  // lifts its autoplay restriction per element, so a group call hands this
  // element to its first remote audio track instead of creating a fresh one.
  protected audio: HTMLAudioElement;
  // Remote audio elements whose play() the autoplay policy refused; retried on
  // the next user gesture (Safari without an active capture, for example).
  private playbackBlockedElements = new Set<HTMLMediaElement>();
  private observedOutputAudioTracks = new WeakSet<MediaStreamTrack>();
  // Where each remote audio track currently plays; read by the track's single
  // `unmute` listener (see playRemoteAudio).
  private remoteAudioTargets = new WeakMap<MediaStreamTrack, {element: HTMLMediaElement, stream: MediaStream}>();
  // The on-screen tiles are clones of the per-source video elements (see
  // cloneVideoElement); tracked so a new stream for the source reaches them
  // wherever they are rendered, Document PiP included.
  private videoClones = new Map<string, WeakRefSet<HTMLVideoElement>>();

  protected getStream: ReturnType<typeof getStreamCached>;

  constructor() {
    super(false);

    // Keep `outputDeviceId` as the last sink that every owned element actually
    // accepted. A persisted id is only a requested value until setSinkId
    // succeeds; seeding the committed field with it made a rejected startup
    // application roll back to the same unavailable sink and left future
    // elements believing it was live.
    const persistedOutputDeviceId = appSettings.callDevices?.speakerId || '';
    this.outputDeviceId = '';

    const player = this.player = document.createElement('div');
    player.classList.add('call-player');
    player.style.display = 'none';
    document.body.append(player);

    this.elements = new Map();

    // possible Safari fix
    const audio = this.audio = new Audio();
    audio.autoplay = true;
    audio.volume = 1.0;
    this.player.append(audio);
    this.elements.set('audio', audio);

    this.fixSafariAudio();

    this.getStream = getStreamCached();

    if(persistedOutputDeviceId) {
      // Reuse the same generation/serialization path as a live picker change.
      // This makes an immediate user selection supersede a still-pending saved
      // sink instead of the late constructor write winning the race.
      void this.setOutputDeviceId(persistedOutputDeviceId).catch((err) => {
        this.log?.warn?.('applying persisted call speaker failed', err);
      });
    }
  }

  public get isSharingAudio() {
    return !!this.streamManager.hasInputTrackKind('audio');
  }

  public get isSharingVideo() {
    return !!this.streamManager.hasInputTrackKind('video');
  }

  public abstract get isMuted(): boolean;
  public abstract get isClosing(): boolean;

  public fixSafariAudio() {
    safePlay(this.audio);
  }

  protected isInputTrackAvailable(track: MediaStreamTrack | undefined): boolean {
    return !!track && track.readyState === 'live' && !track.muted;
  }

  public async requestAudioSource(muted: boolean): Promise<void> {
    const currentTrack = this.streamManager?.inputStream?.getAudioTracks()[0];
    if(currentTrack && !this.isInputTrackAvailable(currentTrack)) {
      // A live-but-muted source is not producing samples. Leaving it enabled
      // made every later unmute reuse the same dead capture forever. Keep the
      // transition fail-closed and reuse the transactional device-swap path so
      // the sender, StreamManager and cleanup bookkeeping change together.
      this.setMuted(true);
      await this.setInputAudioDeviceId(appSettings.callDevices?.microphoneId || '');
    }

    await this.requestInputSource(true, false, muted);

    const activeTrack = this.streamManager?.inputStream?.getAudioTracks()[0];
    if(!this.isInputTrackAvailable(activeTrack)) {
      this.setMuted(true);
      throw new DOMException('Microphone capture is unavailable', 'NotReadableError');
    }
  }

  public requestInputSource(audio: boolean, video: boolean, muted: boolean) {
    const {streamManager} = this;
    if(streamManager) {
      const isAudioGood = !audio || this.isSharingAudio;
      const isVideoGood = !video || this.isSharingVideo;
      if(isAudioGood && isVideoGood) {
        return Promise.resolve();
      }
    }

    const constraints: MediaStreamConstraints = {
      audio: audio && getAudioConstraints(),
      video: video && getVideoConstraints()
    };

    return this.getStream({
      constraints,
      muted
    }).then((stream) => {
      return this.onInputStream(stream);
    });
  }

  public requestScreen() {
    return this.getStream({
      isScreen: true,
      constraints: getScreenConstraints(true)
    }).then((stream) => {
      return this.onInputStream(stream);
    });
  }

  public getElement(endpoint: number | string) {
    return this.elements.get('' + endpoint);
  }

  public abstract get streamManager(): StreamManager;
  public abstract get description(): LocalConferenceDescription;
  public abstract toggleMuted(): Promise<void>;

  public cleanup() {
    // Invalidate getUserMedia / setSinkId work that can still resolve after
    // the call has already released its registered streams and elements.
    for(const kind of ['audio', 'video', 'output'] as const) {
      ++this.mediaDeviceChangeGenerations[kind];
    }
    this.pendingInputAudioTracks.forEach((track) => stopTrack(track));
    this.pendingInputAudioTracks.clear();

    this.stopRetryingBlockedPlayback();
    this.videoClones?.clear();
    this.player.textContent = '';
    this.player.remove();
    this.elements.clear();

    // can have no connectionInstance but streamManager with input stream
    this.streamManager.stop();

    super.cleanup();
  }

  public onTrack(event: RTCTrackEvent) {
    this.tryAddTrack({
      stream: event.streams[0],
      track: event.track,
      type: 'output'
    });
  }

  public saveInputVideoStream(stream: MediaStream, type?: string) {
    const track = stream.getVideoTracks()[0];
    this.tryAddTrack({
      stream,
      track,
      type: 'input',
      source: type || 'main'
    });
  }

  public tryAddTrack({stream, track, type, source}: TryAddTrackOptions) {
    if(!source) {
      source = StreamManager.getSource(stream, type);
    }

    this.log('tryAddTrack', stream, track, type, source);

    const isOutput = type === 'output';

    const {elements, streamManager} = this;

    const isVideo = track.kind === 'video';

    if(isOutput) {
      streamManager.addTrack(stream, track, type);
    }

    if(!isVideo) {
      // Our own microphone is never played back.
      if(isOutput) {
        this.attachOutputAudioTrack(stream, track, source);
      }

      return source;
    }

    const elementEndpoint = source;
    let element = elements.get(elementEndpoint);

    track.addEventListener('ended', () => {
      this.log('[track] onended');
      // A late `ended` of a replaced track must not drop the element that
      // already shows its successor.
      const current = elements.get(elementEndpoint);
      if(current && current.srcObject !== stream) {
        return;
      }

      elements.delete(elementEndpoint);
      // element.remove();
    }, {once: true});

    const useStream = stream;
    if(!element) {
      element = document.createElement('video');
      element.autoplay = true;
      element.srcObject = useStream;
      element.volume = 1.0;

      this.applyCurrentOutputDeviceToElement(element);

      element.setAttribute('playsinline', 'true');
      element.muted = true;
      // Mirror ONLY our own self-view (`type === 'input'`), never the remote
      // participant's video (`type === 'output'`). This matches every video
      // client (iOS/tgcalls, FaceTime, Zoom, …): the left/right flip is a
      // local presentation convenience so you see yourself as in a mirror
      // (pat your hair on the correct side). It is NOT a property of the
      // stream — the pixels on the wire are always un-mirrored, so the other
      // side sees us as in real life (text/gestures un-inverted). Mirroring
      // their incoming feed too would flip any text they hold up and reverse
      // their gestures relative to reality. tgcalls enforces this by only
      // flipping frames from the local camera buffer (TGRTCCVPixelBuffer);
      // decoded remote frames are never flipped.
      //
      // Exception: our own rear-facing camera (`facingMode === 'environment'`)
      // stays un-mirrored — flipping it would invert any text or sign the
      // user is pointing the camera at. shouldMirrorVideoTrack handles that.
      if(type === 'input' && shouldMirrorVideoTrack(track)) {
        element.classList.add('call-video-mirror');
      }

      elements.set(elementEndpoint, element);
    } else {
      element.srcObject = useStream;
    }

    // A rebuilt connection delivers the same source on a new stream (into the
    // old element or, if that one was released, a new one); the tiles on
    // screen would keep showing the dead stream's last frame.
    this.retargetVideoClones(elementEndpoint, useStream);

    safePlay(element);
    if(track.muted) {
      track.addEventListener('unmute', () => {
        if(element.srcObject === useStream) {
          safePlay(element);
        }
      }, {once: true});
    }

    return source;
  }

  /**
   * Play one remote audio track through its own element. Each element is
   * created once per source and only ever (re)assigned its own track, so
   * someone joining never interrupts anyone else — the previous single shared
   * element had its srcObject reset for every new track, restarting playback
   * for the whole call. Chromium mixes every element's WebRTC audio in one
   * renderer, so the per-element cost is small, and per-element volume is what
   * makes per-participant volume possible.
   */
  private attachOutputAudioTrack(stream: MediaStream | undefined, track: MediaStreamTrack, source: string) {
    const key = getOutputAudioElementKey(source);
    let element = this.elements.get(key);
    if(!element) {
      element = this.takePrimedAudioElement() ?? document.createElement('audio');
      element.autoplay = true;
      this.applyCurrentOutputDeviceToElement(element);
      this.player.append(element);
      this.elements.set(key, element);
    }

    this.applyOutputAudioState(element, source);
    // Every remote source gets its own single-track stream from the SDP msid.
    this.playRemoteAudio(element, stream ?? new MediaStream([track]), track);

    if(!this.observedOutputAudioTracks.has(track)) {
      this.observedOutputAudioTracks.add(track);
      track.addEventListener('ended', () => {
        this.releaseOutputAudio(source, track);
      }, {once: true});
    }
  }

  /**
   * The element primed by fixSafariAudio, while no remote track has it yet.
   * Moves it out of the plain `audio` slot so it is owned (and released) like
   * any per-source element.
   */
  private takePrimedAudioElement(): HTMLAudioElement | undefined {
    const {audio} = this;
    if(!audio || this.elements.get('audio') !== audio) {
      return;
    }

    this.elements.delete('audio');
    return audio;
  }

  /**
   * Stop playing a remote audio source and free its element (and the media
   * player behind it — browsers cap those per page). Called when the source's
   * track ends and when its participant leaves (the entry is removed from the
   * SDP). With `track`, only if the element still plays that track: a late
   * signal about a replaced track must not silence its successor.
   */
  protected releaseOutputAudio(source: string | number, track?: MediaStreamTrack): boolean {
    const key = getOutputAudioElementKey(source);
    const element = this.elements.get(key);
    if(!element) {
      return false;
    }

    if(track && !(element.srcObject as MediaStream)?.getTracks?.().includes(track)) {
      return false;
    }

    this.playbackBlockedElements.delete(element);
    element.srcObject = null;
    element.remove();
    this.elements.delete(key);
    return true;
  }

  /**
   * Play a remote audio stream through `element`: now, again whenever the
   * track resumes producing frames (it can start muted until negotiation or
   * decryption completes), and on the next user gesture if the autoplay policy
   * refused. Shared by the group-call elements and the 1-on-1 call's one.
   */
  protected playRemoteAudio(element: HTMLMediaElement, stream: MediaStream, track: MediaStreamTrack) {
    if(element.srcObject !== stream) {
      element.srcObject = stream;
    }

    this.playOutputMedia(element);

    const observed = this.remoteAudioTargets.has(track);
    this.remoteAudioTargets.set(track, {element, stream});
    if(!observed) {
      track.addEventListener('unmute', () => {
        const target = this.remoteAudioTargets?.get(track);
        if(target && target.element.srcObject === target.stream) {
          this.playOutputMedia(target.element);
        }
      });
    }
  }

  /** Per-source playback state; group calls map it to the participant. */
  protected getOutputAudioState(source: string): OutputAudioState {
    return DEFAULT_OUTPUT_AUDIO_STATE;
  }

  protected applyOutputAudioState(element: HTMLMediaElement, source: string) {
    const {volume, muted} = this.getOutputAudioState(source);
    // An element cannot amplify: anything above 100% plays at 100%.
    element.volume = Math.max(0, Math.min(1, volume));
    element.muted = muted;
  }

  /** Re-apply the playback state of every remote audio element of `sources`. */
  protected refreshOutputAudioState(sources: Iterable<number | string>) {
    for(const source of sources) {
      const element = this.elements.get(getOutputAudioElementKey(source));
      if(element) {
        this.applyOutputAudioState(element, '' + source);
      }
    }
  }

  private playOutputMedia(element: HTMLMediaElement) {
    let promise: Promise<void> | undefined;
    try {
      promise = element.play();
    } catch(err) {
      this.log?.warn?.('playing remote audio failed', err);
      return;
    }

    promise?.catch?.((err: unknown) => {
      const name = (err as DOMException)?.name;
      if(name === 'NotAllowedError') {
        this.log?.warn?.('remote audio playback waits for a user gesture');
        this.retryPlaybackOnGesture(element);
      } else if(name !== 'AbortError') { // AbortError: superseded by a newer source
        this.log?.warn?.('playing remote audio failed', err);
      }
    });
  }

  private retryPlaybackOnGesture(element: HTMLMediaElement) {
    const wasEmpty = !this.playbackBlockedElements.size;
    this.playbackBlockedElements.add(element);
    if(wasEmpty) {
      document.addEventListener('pointerdown', this.retryBlockedPlayback, true);
      document.addEventListener('keydown', this.retryBlockedPlayback, true);
    }
  }

  // Released elements leave the set (releaseOutputAudio); the 1-on-1 call's
  // element is never attached to the document, so attachment is no criterion.
  private retryBlockedPlayback = () => {
    const elements = [...this.playbackBlockedElements];
    this.stopRetryingBlockedPlayback();
    elements.forEach((element) => this.playOutputMedia(element));
  };

  private stopRetryingBlockedPlayback() {
    this.playbackBlockedElements?.clear();
    document.removeEventListener('pointerdown', this.retryBlockedPlayback, true);
    document.removeEventListener('keydown', this.retryBlockedPlayback, true);
  }

  /** A tile for `source`: a clone of its video element, kept in sync with it. */
  protected cloneVideoElement(source: string, element: HTMLVideoElement): HTMLVideoElement {
    const clone = element.cloneNode() as HTMLVideoElement;
    clone.srcObject = element.srcObject;
    let clones = this.videoClones.get(source);
    if(!clones) {
      this.videoClones.set(source, clones = new WeakRefSet());
    }

    clones.track(clone);
    return clone;
  }

  private retargetVideoClones(source: string, stream: MediaStream) {
    this.videoClones.get(source)?.forEachLive((clone) => {
      if(clone.srcObject !== stream) {
        clone.srcObject = stream;
        safePlay(clone);
      }
    });
  }

  /**
   * Free the video element of a remote source whose entry is gone (its
   * participant stopped the video or left, or the connection was replaced):
   * it holds a media player and would keep receiving the speaker selection
   * until hang-up. With `track`, only if the element still shows it. Unless
   * `keepTiles`, the source's tile registry goes too; a replaced connection
   * keeps it so its next stream reaches the tiles still on screen.
   */
  protected releaseOutputVideo(source: string | number, track?: MediaStreamTrack, keepTiles?: boolean): boolean {
    const key = '' + source;
    const element = this.elements.get(key);
    if(!element || (track && !(element.srcObject as MediaStream)?.getTracks?.().includes(track))) {
      return false;
    }

    element.srcObject = null;
    this.elements.delete(key);
    if(!keepTiles) {
      this.videoClones.delete(key);
    }

    return true;
  }

  public setMuted(muted?: boolean) {
    const tracks = new Set<MediaStreamTrack>(this.streamManager.inputStream.getAudioTracks());
    this.pendingInputAudioTracks.forEach((track) => tracks.add(track));
    tracks.forEach((track) => {
      if(track?.kind === 'audio') {
        track.enabled = muted === undefined ? !track.enabled : !muted;
      }
    });
  }

  /**
   * Every live media element whose output sink belongs to this call.
   *
   * Most call types render through `elements`. P2P owns one additional audio
   * element in its engine state, so subclasses can extend this iterable while
   * the base class keeps generation, serialization and rollback in one place.
   */
  protected getOutputDeviceElements(): Iterable<HTMLMediaElement> {
    return this.elements.values();
  }

  protected applyCurrentOutputDeviceToElement(element: HTMLMediaElement): void {
    if(typeof((element as any).setSinkId) !== 'function') return;

    // The element can appear while a picker transaction is in flight. Queue
    // behind it and read the committed id only when this operation runs; an
    // eager read could apply the old sink after the newer selection committed.
    void this.serializeMediaDeviceChange('output', async() => {
      const deviceId = this.outputDeviceId;
      if(!deviceId) return;
      try {
        await (element as any).setSinkId(deviceId);
      } catch(err) {
        // A single newly-created media element failing its saved sink must not
        // reject an unrelated track attachment or become unhandled.
        this.log?.warn?.('applying call speaker to a new media element failed', err);
      }
    });
  }

  // Apply a new audio output device to every <audio> / <video> element we
  // own. Used by the in-call settings popup when the user picks a different
  // speaker — the change must propagate to live elements, not just future
  // ones (those pick up `this.outputDeviceId` in `tryAddTrack`).
  public async setOutputDeviceId(deviceId: string): Promise<boolean> {
    const generation = this.beginMediaDeviceChange('output');
    const nextDeviceId = deviceId || '';

    return this.serializeMediaDeviceChange('output', async() => {
      if(!this.isMediaDeviceChangeCurrent('output', generation)) return false;

      const previousDeviceId = this.outputDeviceId;
      const elements = [...new Set(this.getOutputDeviceElements())].filter((element) => {
        return typeof (element as any).setSinkId === 'function';
      });
      const results = await Promise.allSettled(elements.map((element) => {
        return Promise.resolve().then(() => (element as any).setSinkId(nextDeviceId) as Promise<void>);
      }));
      const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');

      if(rejected || !this.isMediaDeviceChangeCurrent('output', generation)) {
        // setSinkId is per-element, so a later element may reject after an
        // earlier one already switched. Restore the last committed sink before
        // allowing the next queued selection to run.
        await Promise.allSettled(elements.map((element) => {
          return Promise.resolve().then(() => (element as any).setSinkId(previousDeviceId) as Promise<void>);
        }));
        if(rejected) throw rejected.reason;
        return false;
      }

      this.outputDeviceId = nextDeviceId;
      return true;
    });
  }

  protected beginMediaDeviceChange(kind: MediaDeviceChangeKind): number {
    return ++this.mediaDeviceChangeGenerations[kind];
  }

  protected isMediaDeviceChangeCurrent(kind: MediaDeviceChangeKind, generation: number): boolean {
    return this.mediaDeviceChangeGenerations[kind] === generation;
  }

  protected serializeMediaDeviceChange<T>(kind: MediaDeviceChangeKind, callback: () => Promise<T>): Promise<T> {
    return this.mediaDeviceChangeQueues[kind].enqueue(callback);
  }

  /**
   * The ONE mid-call input-device swap transaction: acquire the replacement
   * stream, serialize the sender commit per kind, keep a pending audio track
   * registered while the swap is in flight, and unwind on every stale/closing
   * detection. Both the streamManager-backed calls (this class) and P2P (which
   * keeps its local streams outside StreamManager) run THIS method — they
   * differ only in the hooks below, never in the transaction shape.
   */
  protected async runInputDeviceSwap(opts: {
    kind: 'audio' | 'video',
    constraints: MediaStreamConstraints,
    /**
     * undefined → proceed; boolean → abandon the swap (the fresh stream is
     * released) with that result. Sites: 'acquired' (right after getUserMedia),
     * 'queued' (entering the per-kind serialization queue), 'swapped' (after a
     * successful sender swap — `false` additionally triggers `rollback`) and
     * 'failed' (after a rejected swap; undefined rethrows the swap error).
     * Each caller encodes its own staleness predicates AND their per-site
     * precedence, which is why this is a function of the site.
     */
    shouldAbandon: (site: 'acquired' | 'queued' | 'swapped' | 'failed', generation: number) => boolean | undefined,
    /**
     * Resolve the live swap targets once inside the queue. undefined → no
     * usable sender/track pair (throws the common could-not-replace error).
     * `rollback` carries its own applicability guards.
     */
    resolveSwap: (newTrack: MediaStreamTrack) => {
      oldTrack: MediaStreamTrack,
      swap: () => MaybePromise<void>,
      rollback: () => MaybePromise<void>
    } | undefined,
    /**
     * A multi-sender swap can fail half-applied and must be compensated; a
     * single-sender replaceTrack that rejects leaves the old track in place
     * per spec, so compensating would only double the churn.
     */
    rollbackOnSwapFailure: boolean,
    getPendingAudioEnabled: (oldTrack: MediaStreamTrack) => boolean,
    release?: (stream: MediaStream) => void,
    commit: (newStream: MediaStream, newTrack: MediaStreamTrack, oldTrack: MediaStreamTrack) => void,
    acquisitionFailureLogLevel?: 'error' | 'warn'
  }): Promise<boolean> {
    const {kind} = opts;
    const label = `setInput${kind === 'audio' ? 'Audio' : 'Video'}DeviceId`;
    const release = opts.release ?? ((stream: MediaStream) => stream.getTracks().forEach((t) => stopTrack(t)));
    const generation = this.beginMediaDeviceChange(kind);
    let newStream: MediaStream;
    try {
      newStream = await getStream(opts.constraints);
    } catch(err) {
      if(!this.isMediaDeviceChangeCurrent(kind, generation)) return false;
      this.log?.[opts.acquisitionFailureLogLevel ?? 'error']?.(`${label} getUserMedia failed`, err);
      throw err;
    }

    {
      const abandon = opts.shouldAbandon('acquired', generation);
      if(abandon !== undefined) {
        release(newStream);
        return abandon;
      }
    }

    return this.serializeMediaDeviceChange(kind, async() => {
      const abandon = opts.shouldAbandon('queued', generation);
      if(abandon !== undefined) {
        release(newStream);
        return abandon;
      }

      const newTrack = newStream.getTracks().find((track) => track.kind === kind);
      const resolved = newTrack && opts.resolveSwap(newTrack);
      if(!resolved) {
        release(newStream);
        throw new Error(`Could not replace input ${kind} track`);
      }
      const {oldTrack, swap, rollback} = resolved;

      const pendingAudioTrack = kind === 'audio' ? newTrack : undefined;
      if(pendingAudioTrack) {
        // getUserMedia returns enabled tracks. Preserve the logical microphone
        // state before exposing the replacement to a sender. Keep tracking it
        // until commit/rollback as setMuted can run while replaceTrack waits.
        pendingAudioTrack.enabled = opts.getPendingAudioEnabled(oldTrack);
        this.pendingInputAudioTracks.add(pendingAudioTrack);
      }

      try {
        try {
          await swap();
        } catch(err) {
          if(opts.rollbackOnSwapFailure && !this.isClosing) {
            try {
              await rollback();
            } catch(rollbackErr) {
              this.log?.error?.(`${label} rollback failed`, rollbackErr);
            }
          }
          release(newStream);
          const abandonFailed = opts.shouldAbandon('failed', generation);
          if(abandonFailed !== undefined) return abandonFailed;
          throw err;
        }

        // The swap may finish after hangup or after a newer A→B selection
        // started. Do not publish that orphan stream after cleanup. A stale but
        // live call (`false`) is restored to its last committed track before B
        // proceeds.
        const abandonSwapped = opts.shouldAbandon('swapped', generation);
        if(abandonSwapped !== undefined) {
          if(abandonSwapped === false) {
            try {
              await rollback();
            } catch(rollbackErr) {
              this.log?.error?.(`${label} stale rollback failed`, rollbackErr);
            }
          }
          release(newStream);
          return abandonSwapped;
        }

        opts.commit(newStream, newTrack, oldTrack);
        return true;
      } finally {
        if(pendingAudioTrack) this.pendingInputAudioTracks.delete(pendingAudioTrack);
      }
    });
  }

  private async replaceInputDevice(opts: {
    kind: 'audio' | 'video',
    constraints: MediaStreamConstraints,
    getOldTrack: () => MediaStreamTrack | undefined,
    commit: (newStream: MediaStream, newTrack: MediaStreamTrack, oldTrack: MediaStreamTrack) => void
  }): Promise<boolean> {
    const {kind} = opts;
    return this.runInputDeviceSwap({
      kind,
      constraints: opts.constraints,
      shouldAbandon: (site, generation) => {
        if(site === 'acquired') {
          return this.isClosing ? true : undefined;
        }
        if(site === 'swapped') {
          // Closing wins over staleness here: a closed call must not roll the
          // sender back (there is nothing to restore into).
          if(this.isClosing) return true;
          if(!this.isMediaDeviceChangeCurrent(kind, generation)) return false;
          return undefined;
        }
        if(!this.isMediaDeviceChangeCurrent(kind, generation)) return false;
        if(this.isClosing) return true;
        return undefined;
      },
      resolveSwap: (newTrack) => {
        const oldTrack = opts.getOldTrack();
        if(!oldTrack) return undefined;
        return {
          oldTrack,
          swap: () => this.replaceSenderTrack?.(kind, oldTrack, newTrack) ?? Promise.resolve(),
          rollback: () => this.replaceSenderTrack?.(kind, newTrack, oldTrack) ?? Promise.resolve()
        };
      },
      // The group override walks multiple senders and can fail half-swapped.
      rollbackOnSwapFailure: true,
      getPendingAudioEnabled: (oldTrack) => oldTrack.enabled,
      commit: opts.commit
    });
  }

  // Mid-call mic swap: acquire the new device, hand the resulting track
  // over to the streamManager, and hot-swap every sender still bound to the
  // old track. Sender commit is serialized by replaceInputDevice.
  public setInputAudioDeviceId(deviceId: string): Promise<boolean> {
    if(!this.isSharingAudio) return Promise.resolve(true);
    return this.replaceInputDevice({
      kind: 'audio',
      constraints: {audio: getAudioConstraints(deviceId)},
      getOldTrack: () => this.streamManager.inputStream.getAudioTracks()[0],
      commit: (newStream, _newTrack, oldTrack) => {
        this.streamManager.replaceInputAudio(newStream, oldTrack);
        stopTrack(oldTrack);
      }
    });
  }

  // Find every locally-owned <video> whose `srcObject` is the *source*
  // stream that originally carried `oldTrack` and: (1) splice the new track
  // in / remove the old one so the MediaStream still represents reality,
  // (2) re-assign `srcObject` so Chromium re-evaluates the track list —
  // Chrome silently keeps showing the old (frozen) frame if you only
  // `addTrack` to an already-attached MediaStream.
  //
  // Walks `document.querySelectorAll('video')` (not just `this.elements`)
  // because group-call participant tiles are *clones* of the main element
  // created in `groupCallInstance.getVideoElementFromParticipantByType` —
  // those clones live outside the elements map but share the same
  // MediaStream reference, so we need to find them all and refresh each.
  //
  // Two-pass: identify matching streams first, THEN mutate. A single pass
  // would race — the first iteration removes oldTrack from the shared
  // stream, then the `includes(oldTrack)` check fails for every subsequent
  // clone that points at the same stream, and only one element refreshes.
  private swapLocalVideoTrack(oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack): void {
    const allVideos = Array.from(document.querySelectorAll('video'));
    const targetStreams = new Set<MediaStream>();
    const targetVideos: HTMLVideoElement[] = [];
    for(const video of allVideos) {
      const stream = video.srcObject;
      if(!(stream instanceof MediaStream)) continue;
      if(!(stream.getVideoTracks() as MediaStreamTrack[]).includes(oldTrack)) continue;
      targetStreams.add(stream);
      targetVideos.push(video);
    }
    for(const stream of targetStreams) {
      stream.removeTrack(oldTrack);
      stream.addTrack(newTrack);
    }
    for(const video of targetVideos) {
      // Re-assigning `srcObject` (even to the same stream) forces Chrome to
      // pick up the new track. Setting to null first guarantees a clean
      // repaint cycle even when the browser is mid-frame.
      const stream = video.srcObject;
      video.srcObject = null;
      video.srcObject = stream;
    }
  }

  // Mid-call camera swap. Mirrors setInputAudioDeviceId, sans the
  // streamManager.replaceInputAudio (which is audio-only) — for video we
  // mutate the inputStream directly.
  public setInputVideoDeviceId(deviceId: string): Promise<boolean> {
    if(!this.isSharingVideo) return Promise.resolve(true);
    return this.replaceInputDevice({
      kind: 'video',
      constraints: {video: getVideoConstraints(deviceId)},
      getOldTrack: () => this.streamManager.inputStream.getVideoTracks()[0],
      commit: (newStream, newTrack, oldTrack) => {
        // Keep items, inputStream, and every cloned local preview in sync.
        this.streamManager.removeTrack(oldTrack);
        this.streamManager.addTrack(newStream, newTrack, 'input');
        this.swapLocalVideoTrack(oldTrack, newTrack);
        stopTrack(oldTrack);
      }
    });
  }

  // Subclasses (the group-call panel via GroupCallInstance / the call panel via
  // CallInstance) override to walk their own RTCPeerConnection senders.
  // Optional — base class is happy with just the streamManager swap.
  protected replaceSenderTrack?(
    kind: 'audio' | 'video',
    oldTrack: MediaStreamTrack,
    newTrack: MediaStreamTrack
  ): MaybePromise<void>;

  protected async onInputStream(stream: MediaStream): Promise<void> {
    if(!this.isClosing) {
      const videoTracks = stream.getVideoTracks();
      if(videoTracks.length) {
        this.saveInputVideoStream(stream, 'main');
      }

      const {streamManager, description} = this;
      streamManager.addStream(stream, 'input');

      try {
        if(description) {
          await streamManager.appendToConference(description, undefined, true);
        }
      } catch(err) {
        stream.getTracks().forEach((track) => {
          streamManager.removeTrack(track);
          stopTrack(track);
        });
        throw err;
      }

      // cleanup() may have run while sender.replaceTrack was pending. Its
      // first stop pass cannot cover a stream registered after that pass, so
      // release explicitly before this async continuation returns.
      if(this.isClosing) {
        stream.getTracks().forEach((track) => stopTrack(track));
      }
    } else { // if call is declined earlier than stream appears
      stream.getTracks().forEach((track) => {
        stopTrack(track);
      });
    }
  }
}
