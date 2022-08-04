/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Logger, logger} from '../../logger';

export default function createPeerConnection(config: RTCConfiguration, log?: Logger) {
  if(!log) {
    log = logger('RTCPeerConnection');
  }

  log('constructor');

  // @ts-ignore
  const connection = new RTCPeerConnection(config);
  connection.addEventListener('track', (event) => {
    log('ontrack', event);
  });
  connection.addEventListener('signalingstatechange', () => {
    log('onsignalingstatechange', connection.signalingState);
  });
  connection.addEventListener('connectionstatechange', () => {
    log('onconnectionstatechange', connection.connectionState);
  });
  connection.addEventListener('negotiationneeded', () => { // * will be fired every time input device changes
    log('onnegotiationneeded', connection.signalingState);
  });
  connection.addEventListener('icecandidate', (event) => {
    log('onicecandidate', event);
  });
  connection.addEventListener('iceconnectionstatechange', () => {
    log('oniceconnectionstatechange', connection.iceConnectionState);
  });
  connection.addEventListener('datachannel', () => {
    log('ondatachannel');
  });

  connection.log = log;

  return {connection};
}
