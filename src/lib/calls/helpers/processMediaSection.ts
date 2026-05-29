import {DataJSON} from '@layer';
import {JoinGroupCallJsonPayload} from '@appManagers/appGroupCallsManager';
import SDP from '@lib/calls/sdp';
import {Ssrc} from '@lib/calls/types';
import parseMediaSectionInfo from '@lib/calls/helpers/parseMediaSectionInfo';

export default function processMediaSection(sdp: SDP, media: SDP['media'][0]) {
  const sectionInfo = parseMediaSectionInfo(sdp, media);

  const mediaType: Exclude<typeof media['mediaType'], 'application'> = media.mediaType as any;
  const entry: Ssrc = {
    source: sectionInfo.source,
    sourceGroups: sectionInfo.sourceGroups,
    type: mediaType
  };

  // DTLS role advertised to the SFU in the phone.joinGroupCall params: we are
  // `passive` (the DTLS *server*), so the Telegram SFU is the DTLS *client*
  // (active) and sends the ClientHello. The server echoes this by answering
  // with setup:active, which makes Chrome (offering actpass) take the passive
  // role. This matches tdesktop/libtgcalls and Telegram Web A, and holds for
  // BOTH legacy voice chats and e2e conferences.
  //
  // This used to be `active` for legacy calls (client drives DTLS). That
  // worked on older Chrome, but a Chrome DTLS-stack change (~M124) broke the
  // "Chrome is the DTLS client against this SFU" direction: ICE still reaches
  // `connected` and a candidate pair is nominated, but the DTLS handshake then
  // hangs at `connecting` forever — no SRTP keys are derived, so not a single
  // RTP packet flows and audio + video are both silently dead. Letting the SFU
  // drive the handshake (it is `active`) makes DTLS complete again. Verified
  // live: dtlsState connecting→connected, inbound-rtp packets start arriving.
  sectionInfo.fingerprint.setup = 'passive';
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
