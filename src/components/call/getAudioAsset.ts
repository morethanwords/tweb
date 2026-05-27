import AudioAssetPlayer from '@helpers/audioAssetPlayer';

let assetPlayer: AudioAssetPlayer<Record<'busy' | 'connect' | 'end' | 'incoming' | 'outgoing' | 'failed', string>>;
export default function getCallAudioAsset() {
  return assetPlayer ??= new AudioAssetPlayer({
    busy: 'call_busy.mp3',
    connect: 'call_connect.mp3',
    end: 'call_end.mp3',
    incoming: 'call_incoming.mp3',
    outgoing: 'call_outgoing.mp3',
    failed: 'voip_failed.mp3'
  });
}
