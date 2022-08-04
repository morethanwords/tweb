/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import safeAssign from '../../helpers/object/safeAssign';
import {logger} from '../logger';
import createDataChannel from './helpers/createDataChannel';
import createPeerConnection from './helpers/createPeerConnection';
import LocalConferenceDescription from './localConferenceDescription';
import StreamManager from './streamManager';
import {Ssrc} from './types';

export type CallConnectionInstanceOptions = {
  streamManager: StreamManager,
  connection?: RTCPeerConnection,
  log?: ReturnType<typeof logger>
};

export default abstract class CallConnectionInstanceBase {
  public connection: RTCPeerConnection;
  public streamManager: StreamManager;
  public dataChannel: RTCDataChannel;
  public description: LocalConferenceDescription;
  public sources: {
    audio: Ssrc,
    video?: Ssrc,
  };
  protected negotiating: Promise<void>;
  protected log: ReturnType<typeof logger>;

  constructor(options: CallConnectionInstanceOptions) {
    safeAssign(this, options);

    if(!this.log) {
      this.log = this.connection?.log || logger('CALL-CONNECTION-BASE');
    }

    this.sources = {} as any;
  }

  public createPeerConnection(config?: RTCConfiguration) {
    return this.connection || (this.connection = createPeerConnection(config, this.log.bindPrefix('connection')).connection);
  }

  public createDataChannel(dict?: RTCDataChannelInit) {
    return this.dataChannel || (this.dataChannel = createDataChannel(this.connection, dict, this.log.bindPrefix('data')));
  }

  public createDescription() {
    return this.description || (this.description = new LocalConferenceDescription(this.connection));
  }

  public appendStreamToConference() {
    return this.streamManager.appendToConference(this.description);
  }

  public closeConnection() {
    const {connection} = this;
    if(!connection) {
      return;
    }

    try {
      connection.log('close');
      connection.close();
    } catch(e) {
      this.log.error(e);
    }
  }

  public closeConnectionAndStream(stopStream: boolean) {
    this.closeConnection();
    stopStream && this.streamManager.stop();
  }

  protected abstract negotiateInternal(): CallConnectionInstanceBase['negotiating'];

  public negotiate() {
    const promise = this.negotiating;
    if(promise) {
      return promise;
    }

    return this.negotiating = this.negotiateInternal().finally(() => {
      this.negotiating = undefined;
    });
  }

  public sendDataChannelData(data: any) {
    if(this.dataChannel.readyState !== 'open') {
      return;
    }

    this.dataChannel.send(JSON.stringify(data));
  }
}
