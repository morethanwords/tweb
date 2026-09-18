import AudioAssetPlayer from '@helpers/audioAssetPlayer';

export const CALL_AUDIO_ASSETS: Record<'busy' | 'connect' | 'connecting' | 'end' | 'incoming' | 'outgoing' | 'failed', string> = {
  busy: 'call_busy.mp3',
  connect: 'call_connect.mp3',
  // The looping reconnect tone the other clients play while an established call
  // is down (Android `STATE_RECONNECTING`, iOS `PresentationCallTone.connecting`).
  connecting: 'voip_connecting.mp3',
  end: 'call_end.mp3',
  incoming: 'call_incoming.mp3',
  outgoing: 'call_outgoing.mp3',
  failed: 'voip_failed.mp3'
};

let assetPlayer: AudioAssetPlayer<typeof CALL_AUDIO_ASSETS>;
export default function getCallAudioAsset() {
  return assetPlayer ??= new AudioAssetPlayer(CALL_AUDIO_ASSETS);
}
