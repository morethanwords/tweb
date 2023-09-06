/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import safePlay from '../../helpers/dom/safePlay';
import EventListenerBase, {EventListenerListeners} from '../../helpers/eventListenerBase';
import noop from '../../helpers/noop';
import {logger} from '../logger';
import getAudioConstraints from './helpers/getAudioConstraints';
import getScreenConstraints from './helpers/getScreenConstraints';
import getStreamCached from './helpers/getStreamCached';
import getVideoConstraints from './helpers/getVideoConstraints';
import stopTrack from './helpers/stopTrack';
import LocalConferenceDescription from './localConferenceDescription';
import StreamManager, {StreamItem} from './streamManager';

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
