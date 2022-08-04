/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Logger, logger} from '../../logger';

export default function createDataChannel(connection: RTCPeerConnection, dict?: RTCDataChannelInit, log?: Logger) {
  // return;

  if(!log) {
    log = logger('RTCDataChannel');
  }

  const channel = connection.createDataChannel('data', dict);

  channel.addEventListener('message', (e) => {
    log('onmessage', e);
  });
  channel.addEventListener('open', () => {
    log('onopen');
  });
  channel.addEventListener('close', () => {
    log('onclose');
  });

  channel.log = log;

  return channel;
}
