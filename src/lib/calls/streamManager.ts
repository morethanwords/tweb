/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/evgeny-nadymov/telegram-react
 * Copyright (C) 2018 Evgeny Nadymov
 * https://github.com/evgeny-nadymov/telegram-react/blob/master/LICENSE
 */

import EventListenerBase from '../../helpers/eventListenerBase';
import {logger} from '../logger';
import {GROUP_CALL_AMPLITUDE_ANALYSE_COUNT_MAX} from './constants';
import stopTrack from './helpers/stopTrack';
import LocalConferenceDescription from './localConferenceDescription';
import {fixMediaLineType, WebRTCLineType} from './sdpBuilder';
import {getAmplitude, toTelegramSource} from './utils';

export type StreamItemBase = {
  type: 'input' | 'output',
  track: MediaStreamTrack,
  source: string,
  stream: MediaStream
};

export type StreamItem = StreamAudioItem | StreamVideoItem;

export type StreamAudioItem = StreamItemBase & {kind: 'audio', streamAnalyser: AudioStreamAnalyser};
export type StreamVideoItem = StreamItemBase & {kind: 'video'};

export type StreamAmplitude = {
  type: 'input' | 'output';
  source: string;
  stream: MediaStream;
  track: MediaStreamTrack;
  value: number;
};

class AudioStreamAnalyser {
  public analyser: AnalyserNode;
  public gain: GainNode;
  public streamSource: MediaStreamAudioSourceNode;

  constructor(context: AudioContext, stream: MediaStream) {
    const streamSource = this.streamSource = context.createMediaStreamSource(stream);
    const analyser = this.analyser = context.createAnalyser();
    const gain = this.gain = context.createGain();
    // const streamDestination = context.createMediaStreamDestination();

    analyser.minDecibels = -100;
    analyser.maxDecibels = -30;
    analyser.smoothingTimeConstant = 0.05;
    analyser.fftSize = 1024;

    // connect Web Audio API
    streamSource.connect(analyser);
    // analyser.connect(context.destination);
  }
}

export default class StreamManager {
  public static ANALYSER_LISTENER = new EventListenerBase<{amplitude: (details: {amplitudes: StreamAmplitude[], type: 'all' | 'input'}) => void}>();
  private context: AudioContext;
  public outputStream: MediaStream;
  public inputStream: MediaStream;

  private timer: number;
  private counter: number;

  private items: StreamItem[];

  private log: ReturnType<typeof logger>;

  public direction: RTCRtpTransceiver['direction'];
  public canCreateConferenceEntry: boolean;
  public locked: boolean;
  public types: WebRTCLineType[];

  constructor(private interval?: number) {
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.items = [];
    this.outputStream = new MediaStream();
    this.inputStream = new MediaStream();
    this.counter = 0;
    this.log = logger('SM');
    this.direction = 'sendonly';
    this.canCreateConferenceEntry = true;
    // this.lol = true;
    this.types = ['audio', 'video'];
  }

  public addStream(stream: MediaStream, type: StreamItem['type']) {
    stream.getTracks().forEach((track) => {
      this.addTrack(stream, track, type);
    });
  }

  public addTrack(stream: MediaStream, track: MediaStreamTrack, type: StreamItem['type']) {
    this.log('addTrack', type, track, stream);

    const {context, items, inputStream, outputStream} = this;
    const kind: StreamItem['kind'] = track.kind as any;
    const source = StreamManager.getSource(stream, type);

    // this.removeTrack(track);
    switch(type) {
      case 'input': {
        if(!inputStream) {
          this.inputStream = stream;
        } else {
          inputStream.addTrack(track);
        }

        break;
      }

      case 'output': {
        for(let i = 0; i < items.length; ++i) {
          const {track: t, type, source: itemSource} = items[i];
          if(itemSource === source && type === 'input') {
            items.splice(i, 1);
            outputStream.removeTrack(t);
            break;
          }
        }

        if(kind !== 'video') {
          outputStream.addTrack(track);
        }

        break;
      }
    }

    this.finalizeAddingTrack({
      type,
      source,
      stream,
      track,
      kind,
      streamAnalyser: kind === 'audio' ? new AudioStreamAnalyser(context, stream) : undefined
    });

    if(kind === 'audio' && this.interval) {
      this.changeTimer();
    }
  }

  private finalizeAddingTrack(item: StreamItem) {
    const {track} = item;
    track.addEventListener('ended', () => {
      this.removeTrack(track);
    }, {once: true});

    this.items.push(item);
  }

  public hasInputTrackKind(kind: StreamItem['kind']) {
    return this.items.find((item) => item.type === 'input' && item.kind === kind);
  }

  public static getSource(stream: MediaStream, type: StreamItem['type']) {
    return type === 'input' ? (stream.source || stream.id) : '' + toTelegramSource(+stream.id.substring(6));
  }

  public removeTrack(track: MediaStreamTrack) {
    this.log('removeTrack', track);

    const {items} = this;

    let handled = false;
    for(let i = 0, length = items.length; !handled && i < length; ++i) {
      const {track: t, type} = items[i];
      switch(type) {
        case 'output': {
          if(t === track) {
            items.splice(i, 1);
            this.outputStream.removeTrack(track);
            handled = true;
          }

          break;
        }

        case 'input': {
          if(t === track) {
            items.splice(i, 1);
            this.inputStream.removeTrack(track);
            handled = true;
          }

          break;
        }
      }
    }

    if(track.kind === 'audio' && this.interval) {
      this.changeTimer();
    }
  }

  public replaceInputAudio(stream: MediaStream, oldTrack: MediaStreamTrack) {
    this.removeTrack(oldTrack);
    this.addStream(stream, 'input');
  }

  private changeTimer() {
    if(this.timer !== undefined) {
      clearInterval(this.timer);
    }

    if(this.items.length) {
      this.timer = window.setInterval(this.analyse, this.interval);
    }
  }

  public getAmplitude = (item: StreamAudioItem): StreamAmplitude => {
    const {streamAnalyser, stream, track, source, type} = item;
    const analyser = streamAnalyser.analyser;
    if(!analyser) return;

    const array = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(array);
    const value = getAmplitude(array);

    return {
      type,
      source,
      stream,
      track,
      value
    };
  };

  public analyse = () => {
    const all = this.counter % 3 === 0;
    const filteredItems = all ? this.items : this.items.filter((x) => x.type === 'input');
    const audioItems = filteredItems.filter((x) => x.kind === 'audio') as StreamAudioItem[];
    const amplitudes = audioItems.slice(0, GROUP_CALL_AMPLITUDE_ANALYSE_COUNT_MAX).map(this.getAmplitude);
    if(++this.counter >= 1000) {
      this.counter = 0;
    }

    StreamManager.ANALYSER_LISTENER.dispatchEvent('amplitude', {
      amplitudes,
      type: all ? 'all' : 'input'
    });
  };

  /* public appendToConnection(connection: RTCPeerConnection) {
    if(this.inputStream) {
      this.inputStream.getTracks().forEach((track) => {
        connection.log('addTrack', track);
        connection.addTrack(track, this.inputStream);

        if(track.kind === 'video') {
          track.enabled = true;
        }
      });
    }
  } */

  public appendToConference(conference: LocalConferenceDescription) {
    if(this.locked) {
      return;
    }

    const {inputStream, direction, canCreateConferenceEntry} = this;
    const transceiverInit: RTCRtpTransceiverInit = {direction, streams: [inputStream]};
    const types = this.types.map((type) => {
      return [
        type,
        /* type === 'video' || type === 'screencast' ?
          {sendEncodings: [{maxBitrate: 2500000}], ...transceiverInit} :  */
        transceiverInit
      ] as const;
    });

    const tracks = inputStream.getTracks();
    // const transceivers = conference.connection.getTransceivers();
    for(const [type, transceiverInit] of types) {
      let entry = conference.findEntry((entry) => entry.direction === direction && entry.type === type);
      if(!entry) {
        if(!canCreateConferenceEntry) {
          continue;
        }

        entry = conference.createEntry(type);
      }
      /* const entry = conference.findFreeSendRecvEntry(type, true);
      if(!entry.transceiver) {
        entry.transceiver = transceivers.find((transceiver) => transceiver.mid === entry.mid);
      } */

      let {transceiver} = entry;
      if(!transceiver) {
        transceiver = entry.createTransceiver(conference.connection, transceiverInit);

        /* if(this.isScreenSharingManager) {
          transceiver.sender.setParameters({
            ...transceiver.sender.getParameters(),
            degradationPreference: 'maintain-resolution'
          });
        } */
      }

      if(entry.direction !== transceiver.direction) {
        transceiver.direction = entry.direction;
      }

      const mediaTrackType = fixMediaLineType(type);
      const trackIdx = tracks.findIndex((track) => track.kind === mediaTrackType);
      const track = trackIdx !== -1 ? tracks.splice(trackIdx, 1)[0] : undefined;
      const sender = transceiver.sender;
      if(sender.track === track) {
        continue;
      }

      // try { // ! don't use await here. it will wait for adding track and fake one won't be visible in startNegotiation.
      /* await  */sender.replaceTrack(track).catch((err) => {
        this.log.error(err);
      });
      // } catch(err) {

      // }
    }
  }

  public stop() {
    try {
      const tracks = this.inputStream.getTracks().concat(this.outputStream.getTracks());
      tracks.forEach((track) => {
        stopTrack(track);
      });
    } catch(e) {
      this.log.error(e);
    }
  }
}
