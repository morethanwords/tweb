/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {DataJSON} from '../../../layer';
import {JoinGroupCallJsonPayload} from '../../appManagers/appGroupCallsManager';
import SDP from '../sdp';
import {Ssrc} from '../types';
import parseMediaSectionInfo from './parseMediaSectionInfo';

export default function processMediaSection(sdp: SDP, media: SDP['media'][0]) {
  const sectionInfo = parseMediaSectionInfo(sdp, media);

  const mediaType: Exclude<typeof media['mediaType'], 'application'> = media.mediaType as any;
  const entry: Ssrc = {
    source: sectionInfo.source,
    sourceGroups: sectionInfo.sourceGroups,
    type: mediaType
  };

  // do not change this value, otherwise onconnectionstatechange won't fire
  sectionInfo.fingerprint.setup = 'active';
  const payload: JoinGroupCallJsonPayload = {
    'fingerprints': [sectionInfo.fingerprint],
    'pwd': sectionInfo.pwd,
    'ssrc': sectionInfo.source,
    'ssrc-groups': sectionInfo.sourceGroups || [],
    'ufrag': sectionInfo.ufrag
  };
  const paramsDataJson = JSON.stringify(payload);

  const params: DataJSON = {
    _: 'dataJSON',
    data: paramsDataJson
  };

  return {
    params,
    source: sectionInfo.source,
    media,
    sourceGroups: sectionInfo.sourceGroups,
    entry
  };
}
