/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import forEachReverse from '../../../helpers/array/forEachReverse';
import copy from '../../../helpers/object/copy';
import {ConferenceEntry} from '../localConferenceDescription';
import {parseSdp, addSimulcast} from '../sdp/utils';
import {generateMediaFirstLine, SDPBuilder} from '../sdpBuilder';
import {UpdateGroupCallConnectionData} from '../types';
import parseMediaSectionInfo from './parseMediaSectionInfo';

export default function fixLocalOffer(options: {
  offer: RTCSessionDescriptionInit,
  data: UpdateGroupCallConnectionData,
  skipAddingMulticast?: boolean
  // mids?: string[]
}) {
  const {offer, data} = options;
  const sdp = parseSdp(offer.sdp);
  let hasMunged = false;

  if(!options.skipAddingMulticast) {
    hasMunged = addSimulcast(sdp) || hasMunged;
  }

  // const bundleLine = parsedSdp.session.lines.find((line) => line.Ha?.key === 'group');
  // const bundleMids = bundleLine.value.split(' ').slice(1);

  forEachReverse(sdp.media, (section, idx, arr) => {
    // const mid = section.oa.get('mid').oa;

    // это может случиться при выключении и включении видео. почему-то появится секция уже удалённая
    // ! нельзя тут модифицировать локальное описание, будет критовать
    /* if(mids && !mids.includes(mid) && !bundleMids.includes(mid)) {
      console.error('wtf');
      hasMunged = true;
      arr.splice(idx, 1);
      return;
    } */

    if(/* section.mediaType !== 'video' ||  */section.isSending) {
      return;
    }

    if(section.mediaType === 'application') {
      return;
    }

    const mediaLine = section.mediaLine;
    const mediaLineParts = mediaLine.mediaLineParts;
    const mediaCodecIds = mediaLineParts.ids;
    const localMLine = mediaLine.toString();

    const codec = data[section.mediaType];
    const payloadTypes = codec['payload-types'];

    /* forEachReverse(payloadTypes, (payloadType, idx, arr) => {
      if(!mediaCodecIds.includes('' + payloadType.id) && section.mediaType === 'video') {
      // if(payloadType.name === 'H265') {
        console.warn('[sdp] filtered unsupported codec', payloadType, mediaCodecIds, section.mediaType);
        arr.splice(idx, 1);
      }
    }); */

    const codecIds = payloadTypes.map((payload) => '' + payload.id);
    const correctMLine = generateMediaFirstLine(section.mediaType, undefined, codecIds);

    if(localMLine !== correctMLine) {
      const sectionInfo = parseMediaSectionInfo(sdp, section);

      const newData = {...data};
      newData.transport = copy(newData.transport);
      newData.transport.ufrag = sectionInfo.ufrag;
      newData.transport.pwd = sectionInfo.pwd;
      newData.transport.fingerprints = [sectionInfo.fingerprint];
      newData.transport.candidates = [];

      const entry = new ConferenceEntry(sectionInfo.mid, mediaLineParts.type);
      entry.setPort(mediaLineParts.port);
      sectionInfo.source && entry.setSource(sectionInfo.sourceGroups || sectionInfo.source);
      entry.setDirection(section.direction);

      const newSdp = new SDPBuilder().addSsrcEntry(entry, newData).finalize();

      const newChannel = parseSdp(newSdp).media[0];
      arr[idx] = newChannel;

      hasMunged = true;
    }
  });

  if(hasMunged) {
    const mungedSdp = sdp.toString();
    offer.sdp = mungedSdp;
  }

  return {offer, sdp/* , bundleMids */};
}
