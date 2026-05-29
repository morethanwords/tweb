import safePlay from '@helpers/dom/safePlay';
import EventListenerBase, {EventListenerListeners} from '@helpers/eventListenerBase';
import noop from '@helpers/noop';
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

export default abstract class CallInstanceBase<E extends EventListenerListeners> extends EventListenerBase<E> {
  protected log: ReturnType<typeof logger>;
  protected outputDeviceId: string;

  protected player: HTMLElement;
  protected elements: Map<string, HTMLMediaElement>;

  protected audio: HTMLAudioElement;
  // protected fixedSafariAudio: boolean;

  protected getStream: ReturnType<typeof getStreamCached>;

  constructor() {
    super(false);

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

    // Honour the persisted speaker choice from the Speakers-and-Camera tab.
    // tryAddTrack reads this every time it spawns a new media element, so
    // setting it pre-emptively in the constructor is enough — no need to
    // back-fill existing elements (there are none yet at this point).
    this.outputDeviceId = appSettings.callDevices?.speakerId || '';
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
    // if(this.fixedSafariAudio) return;
    safePlay(this.audio);
    // this.fixedSafariAudio = true;
  }

  public requestAudioSource(muted: boolean) {
    return this.requestInputSource(true, false, muted);
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
      this.onInputStream(stream);
    });
  }

  public requestScreen() {
    return this.getStream({
      isScreen: true,
      constraints: getScreenConstraints(true)
    }).then((stream) => {
      this.onInputStream(stream);
    });
  }

  public getElement(endpoint: number | string) {
    return this.elements.get('' + endpoint);
  }

  public abstract get streamManager(): StreamManager;
  public abstract get description(): LocalConferenceDescription;
  public abstract toggleMuted(): Promise<void>;

  public cleanup() {
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

    const {player, elements, streamManager} = this;

    const tagName = track.kind as StreamItem['kind'];
    const isVideo = tagName === 'video';

    const elementEndpoint = isVideo ? source : tagName;
    let element = elements.get(elementEndpoint);

    if(isVideo) {
      track.addEventListener('ended', () => {
        this.log('[track] onended');
        elements.delete(elementEndpoint);
        // element.remove();
      }, {once: true});
    }

    if(isOutput) {
      streamManager.addTrack(stream, track, type);
    }

    const useStream = isVideo ? stream : streamManager.outputStream;
    if(!element) {
      element = document.createElement(tagName);
      element.autoplay = true;
      element.srcObject = useStream;
      element.volume = 1.0;

      if((element as any).sinkId !== 'undefined') {
        const {outputDeviceId} = this;
        if(outputDeviceId) {
          (element as any).setSinkId(outputDeviceId);
        }
      }

      if(!isVideo) {
        player.appendChild(element);
      } else {
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
      }
      // audio.play();

      elements.set(elementEndpoint, element);
    } else {
      if(element.paused) {
        safePlay(element);
      }

      // ! EVEN IF MEDIASTREAM IS THE SAME NEW TRACK WON'T PLAY WITHOUT REPLACING IT WHEN NEW PARTICIPANT IS ENTERING !
      // if(element.srcObject !== useStream) {
      element.srcObject = useStream;
      // }
    }

    return source;
  }

  public setMuted(muted?: boolean) {
    this.streamManager.inputStream.getAudioTracks().forEach((track) => {
      if(track?.kind === 'audio') {
        track.enabled = muted === undefined ? !track.enabled : !muted;
      }
    });
  }

  // Apply a new audio output device to every <audio> / <video> element we
  // own. Used by the in-call settings popup when the user picks a different
  // speaker — the change must propagate to live elements, not just future
  // ones (those pick up `this.outputDeviceId` in `tryAddTrack`).
  public setOutputDeviceId(deviceId: string) {
    this.outputDeviceId = deviceId || '';
    const apply = deviceId || '';
    for(const [, element] of this.elements) {
      if(typeof (element as any).setSinkId === 'function') {
        // setSinkId rejects on unknown ids / no permission; swallow because
        // the device list itself came from enumerateDevices() and the only
        // failure mode worth surfacing is permission, which would already
        // have been declined for mic/cam.
        (element as any).setSinkId(apply).catch(() => {});
      }
    }
  }

  // Mid-call mic swap: acquire the new device, hand the resulting track
  // over to the streamManager (so the inputStream now carries the new
  // track), and let each subclass hot-swap any RTCRtpSender that was still
  // bound to the old track. The next negotiation cycle picks up the new
  // track via streamManager.appendToConference; sender.replaceTrack avoids
  // a renegotiation for the common case.
  public async setInputAudioDeviceId(deviceId: string) {
    if(!this.isSharingAudio) return; // no active mic yet — settings will be honoured by the next acquisition path
    let newStream: MediaStream;
    try {
      newStream = await getStream({
        audio: getAudioConstraints(deviceId)
      });
    } catch(err) {
      this.log?.error?.('setInputAudioDeviceId getUserMedia failed', err);
      return;
    }

    // The user can end the call during the ~200ms `getUserMedia` window.
    // If that happens, cleanup() already ran and won't run again — releasing
    // the just-acquired stream here is the only way to free the mic / let
    // the OS indicator turn off.
    if(this.isClosing) {
      newStream.getTracks().forEach((t) => stopTrack(t));
      return;
    }

    const newTrack = newStream.getAudioTracks()[0];
    const oldTrack = this.streamManager.inputStream.getAudioTracks()[0];
    if(!newTrack || !oldTrack) {
      newStream.getTracks().forEach((t) => stopTrack(t));
      return;
    }

    this.streamManager.replaceInputAudio(newStream, oldTrack);
    this.replaceSenderTrack?.('audio', oldTrack, newTrack);
    stopTrack(oldTrack);
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
      if(!stream.getVideoTracks().includes(oldTrack)) continue;
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
  public async setInputVideoDeviceId(deviceId: string) {
    if(!this.isSharingVideo) return;
    let newStream: MediaStream;
    try {
      newStream = await getStream({
        video: getVideoConstraints(deviceId)
      });
    } catch(err) {
      this.log?.error?.('setInputVideoDeviceId getUserMedia failed', err);
      return;
    }

    // Hang-up race: the user can end the call during the (~200ms)
    // `getUserMedia` resolution. After that point cleanup has already run,
    // and the freshly-acquired stream would otherwise stay LIVE forever —
    // the macOS camera indicator stays on. Release it here.
    if(this.isClosing) {
      newStream.getTracks().forEach((t) => stopTrack(t));
      return;
    }

    const newTrack = newStream.getVideoTracks()[0];
    const oldTrack = this.streamManager.inputStream.getVideoTracks()[0];
    if(!newTrack || !oldTrack) {
      newStream.getTracks().forEach((t) => stopTrack(t));
      return;
    }

    // Go through streamManager's APIs — they keep `items` and `inputStream`
    // in sync. Direct `inputStream.removeTrack/addTrack` was wrong: it
    // mutated the MediaStream but left the items list untouched, so the
    // subsequent async `ended` listener (fired by `stopTrack(oldTrack)`)
    // removed only the OLD item without anyone pushing a NEW one ⇒ items
    // ended up missing video entirely while inputStream still carried it,
    // and `isSharingVideo` (which reads items) lied with `false`, blocking
    // every follow-up swap with an early return.
    this.streamManager.removeTrack(oldTrack);
    this.streamManager.addTrack(newStream, newTrack, 'input');
    // Swap the track inside the *source* stream the <video> elements are
    // actually pointing at. `streamManager.inputStream` is a SEPARATE
    // MediaStream from the one returned by the original `getUserMedia` —
    // mutating only inputStream leaves the local previews stuck on the
    // dead old track. This is the fix that makes the popup tiles
    // re-render with the new camera.
    this.swapLocalVideoTrack(oldTrack, newTrack);
    this.replaceSenderTrack?.('video', oldTrack, newTrack);
    stopTrack(oldTrack);
  }

  // Subclasses (PopupGroupCall via GroupCallInstance / PopupCall via
  // CallInstance) override to walk their own RTCPeerConnection senders.
  // Optional — base class is happy with just the streamManager swap.
  protected replaceSenderTrack?(
    kind: 'audio' | 'video',
    oldTrack: MediaStreamTrack,
    newTrack: MediaStreamTrack
  ): void;

  protected onInputStream(stream: MediaStream): void {
    if(!this.isClosing) {
      const videoTracks = stream.getVideoTracks();
      if(videoTracks.length) {
        this.saveInputVideoStream(stream, 'main');
      }

      const {streamManager, description} = this;
      streamManager.addStream(stream, 'input');

      if(description) {
        streamManager.appendToConference(description);
      }
    } else { // if call is declined earlier than stream appears
      stream.getTracks().forEach((track) => {
        stopTrack(track);
      });
    }
  }
}
