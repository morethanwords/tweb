/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import forEachReverse from '../../../helpers/array/forEachReverse';
import SDPMediaSection from '../sdp/mediaSection';
import {UpdateGroupCallConnectionData, Codec} from '../types';

export default function filterServerCodecs(mainChannels: SDPMediaSection[], data: UpdateGroupCallConnectionData) {
  // ! Need to filter server's extmap for Firefox
  const performExtmap = (channel: typeof mainChannels[0]) => {
    const out: {[id: string]: string} = {};
    const extmap = channel.attributes.get('extmap');
    extmap.forEach((extmap) => {
      const id = extmap.key.split('/', 1)[0];
      out[id] = extmap.value;
    });

    return out;
  };

  const codecsToPerform: [Codec, 'audio' | 'video'][] = /* flatten([data, dataPresentation].filter(Boolean).map((data) => {
    return  */['audio' as const, 'video' as const].filter((type) => data[type]).map((type) => ([data[type], type]));
  // }));

  codecsToPerform.forEach(([codec, type]) => {
    const channel = mainChannels.find((line) => line.mediaType === type);
    if(!channel) {
      return;
    }

    const extmap = performExtmap(channel);
    forEachReverse(codec['rtp-hdrexts'], (value, index, arr) => {
      if(extmap[value.id] !== value.uri) {
        arr.splice(index, 1);
        console.log(`[sdp] filtered extmap:`, value, index, type);
      }
    });
  });
}
