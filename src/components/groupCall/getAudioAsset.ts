/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import AudioAssetPlayer from '@helpers/audioAssetPlayer';

let audioAsset: AudioAssetPlayer<Record<'connect' | 'end' | 'start' | 'allowtalk', string>>;
export default function getGroupCallAudioAsset() {
  return audioAsset ??= new AudioAssetPlayer({
    connect: 'group_call_connect.mp3',
    end: 'group_call_end.mp3',
    start: 'group_call_start.mp3',
    allowtalk: 'voip_onallowtalk.mp3'
  });
}
