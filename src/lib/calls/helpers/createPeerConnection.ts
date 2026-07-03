import {Logger, logger} from '@lib/logger';

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
    // Also surface the DTLS transport state + ICE state: the common "ICE connected
    // but connectionState stuck at connecting" failure is a stalled DTLS handshake,
    // and this is the single signal that pins it in an exported log.
    const dtlsTransport = connection.sctp?.transport ||
      connection.getSenders().find((s) => s.transport)?.transport ||
      connection.getReceivers().find((r) => r.transport)?.transport;
    log('onconnectionstatechange', connection.connectionState, 'dtls:', dtlsTransport?.state, 'ice:', connection.iceConnectionState);
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
  connection.addEventListener('icegatheringstatechange', () => {
    log('onicegatheringstatechange', connection.iceGatheringState);
  });
  connection.addEventListener('datachannel', () => {
    log('ondatachannel');
  });

  connection.log = log;

  return {connection};
}
