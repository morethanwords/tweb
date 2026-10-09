/*
 * Originally from:
 * https://github.com/evgeny-nadymov/telegram-react
 * Copyright (C) 2018 Evgeny Nadymov
 * https://github.com/evgeny-nadymov/telegram-react/blob/master/LICENSE
 */

import {logger} from '@lib/logger';
import stopTrack from '@lib/calls/helpers/stopTrack';
import LocalConferenceDescription from '@lib/calls/localConferenceDescription';
import {fixMediaLineType, WebRTCLineType} from '@lib/calls/sdpBuilder';
import {toTelegramSource} from '@lib/calls/utils';

export async function waitForMediaTrackReplacements(replacements: Promise<void>[]): Promise<void> {
  const results = await Promise.allSettled(replacements);
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if(rejected) throw rejected.reason;
}

export type StreamItemBase = {
  type: 'input' | 'output',
  track: MediaStreamTrack,
  source: string,
  stream: MediaStream
};

export type StreamItem = StreamAudioItem | StreamVideoItem;

// Only our own microphone is analysed (speaking indicator for "you"); remote
// levels come from the RTP audio-level extension instead, which costs nothing.
export type StreamAudioItem = StreamItemBase & {kind: 'audio', streamAnalyser?: AudioStreamAnalyser};
export type StreamVideoItem = StreamItemBase & {kind: 'video'};

class AudioStreamAnalyser {
  public analyser: AnalyserNode;
  public streamSource: MediaStreamAudioSourceNode;
  private samples: Float32Array<ArrayBuffer>;

  constructor(context: AudioContext, stream: MediaStream) {
    const streamSource = this.streamSource = context.createMediaStreamSource(stream);
    const analyser = this.analyser = context.createAnalyser();

    // ~43 ms of audio at 48 kHz per read.
    analyser.fftSize = 2048;

    // connect Web Audio API
    streamSource.connect(analyser);
  }

  /**
   * RMS of the latest window as a linear 0..1 value — the same scale as the
   * RFC 6464 level RTCRtpSynchronizationSource.audioLevel reports for remote
   * participants, so one threshold serves both.
   */
  public getLevel() {
    const {analyser} = this;
    if(typeof analyser.getFloatTimeDomainData !== 'function') {
      return 0;
    }

    const samples = this.samples ??= new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    let total = 0;
    for(let i = 0, length = samples.length; i < length; ++i) {
      total += samples[i] * samples[i];
    }

    return Math.sqrt(total / samples.length);
  }

  public disconnect() {
    this.streamSource.disconnect();
    this.analyser.disconnect();
  }
}

export default class StreamManager {
  // Created on the first microphone track: a camera/screen-only manager (the
  // presentation connection, a P2P call) needs no audio thread at all.
  private context: AudioContext;
  private stopped = false;
  public inputStream: MediaStream;

  private items: StreamItem[];

  private log: ReturnType<typeof logger>;

  public direction: RTCRtpTransceiver['direction'];
  public canCreateConferenceEntry: boolean;
  public locked: boolean;
  public types: WebRTCLineType[];

  // Audio levels are read on demand (getInputAudioLevel), not polled.
  constructor() {
    this.items = [];
    this.inputStream = new MediaStream();
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

    const {items, inputStream} = this;
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

      // Remote tracks are only registered (stopped with the manager); each
      // plays through its own element (CallInstanceBase.tryAddTrack).
      case 'output': {
        for(let i = 0; i < items.length; ++i) {
          const {type, source: itemSource} = items[i];
          if(itemSource === source && type === 'input') {
            this.discardItem(i);
            break;
          }
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
      streamAnalyser: kind === 'audio' && type === 'input' ? this.createAnalyser(stream) : undefined
    });
  }

  private getContext(): AudioContext | undefined {
    // A stopped manager has closed its context; a source node cannot be created
    // on a closed one, and a new context would leak an audio thread.
    if(this.stopped) return;
    if(!this.context) {
      const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext;
      if(!AudioContextConstructor) return;
      this.context = new AudioContextConstructor();
    }

    return this.context.state === 'closed' ? undefined : this.context;
  }

  private createAnalyser(stream: MediaStream): AudioStreamAnalyser | undefined {
    const context = this.getContext();
    if(!context) return;

    try {
      return new AudioStreamAnalyser(context, stream);
    } catch(err) {
      this.log.warn('creating the microphone analyser failed', err);
    }
  }

  /**
   * Level of the microphone currently being sent (linear RMS, 0..1), or
   * undefined when there is none to measure. Read on demand by the speaking
   * indicator; a disabled (muted) or ended track reads as silence.
   */
  public getInputAudioLevel(): number | undefined {
    for(let i = this.items.length - 1; i >= 0; --i) {
      const item = this.items[i];
      if(item.type !== 'input' || item.kind !== 'audio' || !item.streamAnalyser) {
        continue;
      }

      if(!item.track.enabled || item.track.readyState !== 'live') {
        return 0;
      }

      // Created outside a user gesture the context can start suspended; it
      // resumes once the page is allowed to.
      if(this.context?.state === 'suspended') {
        this.context.resume().catch(() => {});
      }

      return item.streamAnalyser.getLevel();
    }
  }

  private finalizeAddingTrack(item: StreamItem) {
    const {track} = item;
    track.addEventListener('ended', () => {
      this.removeTrack(track);
    }, {once: true});

    this.items.push(item);
  }

  // Drops an item and releases its Web Audio nodes. A source node keeps the
  // context graph (and the track it reads) referenced until it is disconnected.
  private discardItem(index: number) {
    const [item] = this.items.splice(index, 1);
    if(item.kind === 'audio') {
      item.streamAnalyser?.disconnect();
    }
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
            this.discardItem(i);
            handled = true;
          }

          break;
        }

        case 'input': {
          if(t === track) {
            this.discardItem(i);
            this.inputStream.removeTrack(track);
            handled = true;
          }

          break;
        }
      }
    }
  }

  public replaceInputAudio(stream: MediaStream, oldTrack: MediaStreamTrack) {
    this.removeTrack(oldTrack);
    this.addStream(stream, 'input');
  }

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

  // `onSenderCreated` fires the moment a new transceiver is born, BEFORE
  // `replaceTrack` wires its first frame into the encoder. The conference
  // path uses this to attach `RTCRtpScriptTransform` early enough that
  // Chrome doesn't reject it as "Too late to create encoded streams" — see
  // memory tde2e-port.md K-2 for the timing details.
  public async appendToConference(
    conference: LocalConferenceDescription,
    onSenderCreated?: (sender: RTCRtpSender) => void,
    throwOnReplaceError = false
  ): Promise<void> {
    if(this.locked) {
      return Promise.resolve();
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
    const replacements: {
      sender: RTCRtpSender,
      previousTrack: MediaStreamTrack | null,
      promise: Promise<void>
    }[] = [];
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
      let newlyCreated = false;
      if(!transceiver) {
        transceiver = entry.createTransceiver(conference.connection, transceiverInit);
        newlyCreated = true;

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

      // Critical: attach the e2e script transform IN BETWEEN createTransceiver
      // and replaceTrack — the only window Chrome's script-transform machinery
      // accepts. Once `replaceTrack` wires a real track into the sender, the
      // encoder produces its first frame and Chrome silently rejects any
      // transform assigned after that (the parallel createEncodedStreams API
      // surfaces this as an explicit "Too late to create encoded streams").
      //
      // Fire the hook BEFORE the `sender.track === track` skip below — when
      // both sides are undefined (e.g. preview without mic / mic denied) the
      // skip would otherwise hide the hook entirely, and no transform would
      // ever attach.
      if(newlyCreated && onSenderCreated) {
        onSenderCreated(sender);
      }

      if(sender.track === track) {
        continue;
      }

      // Start replacement synchronously so a following createOffer sees the
      // sender immediately. Runtime media transactions may still await the
      // returned promise and roll back if the browser rejects replacement;
      // legacy fire-and-forget callers retain the old logged-error behaviour.
      const previousTrack = sender.track;
      let replacement: Promise<void>;
      try {
        replacement = sender.replaceTrack(track);
      } catch(err) {
        replacement = Promise.reject(err);
      }
      replacements.push({
        sender,
        previousTrack,
        promise: throwOnReplaceError ? replacement : replacement.catch((err) => {
          this.log.error(err);
        })
      });
    }

    try {
      await waitForMediaTrackReplacements(replacements.map(({promise}) => promise));
    } catch(err) {
      // A conference can own several senders. Promise.allSettled tells us only
      // after every replace completed, so a rejection may coexist with other
      // senders already carrying the new stream. Restore the complete previous
      // sender set before the caller removes/stops the rejected local tracks.
      const rollbackResults = await Promise.allSettled(replacements.map(({sender, previousTrack}) => {
        return sender.replaceTrack(previousTrack);
      }));
      rollbackResults.forEach((result) => {
        if(result.status === 'rejected') this.log.error('replaceTrack rollback failed', result.reason);
      });
      throw err;
    }
  }

  public stop() {
    try {
      const tracks = this.inputStream.getTracks().concat(this.items.filter((item) => {
        return item.type === 'output' && item.kind === 'audio';
      }).map((item) => item.track));
      tracks.forEach((track) => {
        stopTrack(track);
      });
    } catch(e) {
      this.log.error(e);
    }

    // stopTrack's synthetic `ended` removed the listed tracks above; sweep the
    // rest (remote video is left to its connection) so no analyser stays
    // wired.
    while(this.items.length) {
      this.discardItem(this.items.length - 1);
    }

    // Only the tracks used to be stopped, so each call leaked a running
    // context — an audio thread per leftover manager. Close it; `state` and
    // `close` are guarded for environments without Web Audio.
    this.stopped = true;
    const {context} = this;
    if(context && context.state !== 'closed' && typeof context.close === 'function') {
      context.close().catch((err) => {
        this.log.error('closing the audio context failed', err);
      });
    }
  }
}
