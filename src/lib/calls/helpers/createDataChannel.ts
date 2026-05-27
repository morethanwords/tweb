import {Logger, logger} from '@lib/logger';

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
