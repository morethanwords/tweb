import {DataJSON} from '@layer';
import {JoinGroupCallJsonPayload} from '@appManagers/appGroupCallsManager';
import SDP from '@lib/calls/sdp';
import {Ssrc} from '@lib/calls/types';
import parseMediaSectionInfo from '@lib/calls/helpers/parseMediaSectionInfo';

export default function processMediaSection(sdp: SDP, media: SDP['media'][0], opts?: {forE2eConference?: boolean}) {
  const sectionInfo = parseMediaSectionInfo(sdp, media);

  const mediaType: Exclude<typeof media['mediaType'], 'application'> = media.mediaType as any;
  const entry: Ssrc = {
    source: sectionInfo.source,
    sourceGroups: sectionInfo.sourceGroups,
    type: mediaType
  };

  // Legacy SFU: client is active (initiates DTLS). Conference SFU: client is
  // passive (server initiates) — verified against tdesktop's captured
  // phone_joinGroupCall params for a working conference. Getting this wrong
  // hangs the DTLS handshake forever; ICE goes to connected but no RTP
  // packets ever flow.
  // The legacy comment ("do not change this value, otherwise
  // onconnectionstatechange won't fire") still applies to non-conference.
  sectionInfo.fingerprint.setup = opts?.forE2eConference ? 'passive' : 'active';
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
