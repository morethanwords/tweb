/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import AudioAssetPlayer from '../../helpers/audioAssetPlayer';

export type GroupCallAudioAssetName = 'group_call_connect.mp3' | 'group_call_end.mp3' | 'group_call_start.mp3' | 'voip_onallowtalk.mp3';

let audioAsset: AudioAssetPlayer<GroupCallAudioAssetName>;
export default function getGroupCallAudioAsset() {
  return audioAsset ??= new AudioAssetPlayer([
    'group_call_connect.mp3',
    'group_call_end.mp3',
    'group_call_start.mp3',
    'voip_onallowtalk.mp3'
  ]);
}
