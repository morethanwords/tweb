import {Logger, logger} from '@lib/logger';

/**
 * The SFU's data channel carries colibri JSON messages (SenderVideoConstraints,
 * dominant speaker, endpoint stats …). Each one is parsed once here and handed
 * to `onMessage`; anything that is not a JSON object is logged and dropped.
 */
export default function createDataChannel(
  connection: RTCPeerConnection,
  dict?: RTCDataChannelInit,
  log?: Logger,
  onMessage?: (message: Record<string, unknown>) => void
) {
  // return;

  if(!log) {
    log = logger('RTCDataChannel');
  }

  const channel = connection.createDataChannel('data', dict);

  channel.addEventListener('message', (e) => {
    log.debug?.('onmessage', e.data);
    if(!onMessage || typeof e.data !== 'string') {
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(e.data);
    } catch(err) {
      log.warn('data channel message is not JSON', err);
      return;
    }

    if(message && typeof message === 'object' && !Array.isArray(message)) {
      onMessage(message as Record<string, unknown>);
    }
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
