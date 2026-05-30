// Infer the media kind of a freshly-created RTCRtpSender from its transceiver's
// receiver track. Used by the onSenderCreated hooks that attach e2e script
// transforms in the createTransceiver→replaceTrack gap: there `sender.track`
// isn't bound yet, but a sendonly transceiver's receiver still exposes a track
// of the correct kind. Replaces a duplicated inline inference in
// groupCallsController + groupCallConnectionInstance; the previous `_kindHint`
// fallback was dead code (that property is never assigned anywhere).
export default function senderKind(connection: RTCPeerConnection, sender: RTCRtpSender): 'audio' | 'video' {
  const transceiver = connection.getTransceivers().find((t) => t.sender === sender);
  return transceiver?.receiver?.track?.kind === 'video' ? 'video' : 'audio';
}
