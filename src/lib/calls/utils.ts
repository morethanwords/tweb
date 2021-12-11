/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 * 
 * Originally from:
 * https://github.com/evgeny-nadymov/telegram-react
 * Copyright (C) 2018 Evgeny Nadymov
 * https://github.com/evgeny-nadymov/telegram-react/blob/master/LICENSE
 */

import { forEachReverse } from "../../helpers/array";
import { copy } from "../../helpers/object";
import { GroupCallParticipantVideoSourceGroup } from "../../layer";
import { ConferenceEntry } from "./localConferenceDescription";
import SDP from "./sdp";
import SDPMediaSection from "./sdp/mediaSection";
import { parseSdp, addSimulcast } from "./sdp/utils";
import { generateMediaFirstLine, SDPBuilder } from "./sdpBuilder";
import { UpdateGroupCallConnectionData } from "./types";

export async function getStream(constraints: MediaStreamConstraints, muted: boolean) {
	const stream = await navigator.mediaDevices.getUserMedia(constraints);
	stream.getTracks().forEach(x => {
		/* x.onmute = x => {
			console.log('track.onmute', x);
		};
		x.onunmute = x => {
			console.log('track.onunmute', x);
		}; */

		x.enabled = !muted;
	});

	// console.log('getStream result', stream);
	return stream;
}

/// NOTE: telegram returns sign source, while webrtc uses unsign source internally
/// unsign => sign
export function toTelegramSource(source: number) {
	return source << 0;
}

/// NOTE: telegram returns sign source, while webrtc uses unsign source internally
/// sign => unsign
export function fromTelegramSource(source: number) {
	return source >>> 0;
}

export function getAmplitude(array: Uint8Array, scale = 3) {
	if(!array) return 0;

	const {length} = array;
	let total = 0;
	for(let i = 0; i < length; ++i) {
		total += array[i] * array[i];
	}
	const rms = Math.sqrt(total / length) / 255;

	return Math.min(1, rms * scale);
}

export function parseSourceGroups(sdpLines: string[]) {
  const telegramSourceGroups = sdpLines.map(str => {
    const [semantics, ...rest] = str.split(' ');

    const sourceGroup: GroupCallParticipantVideoSourceGroup = {
      _: 'groupCallParticipantVideoSourceGroup',
      semantics,
      // sources: rest.map(ssrc => +ssrc)
      sources: rest.map(ssrc => toTelegramSource(+ssrc))
    };

    return sourceGroup;
  });

  /* const simIndex = telegramSourceGroups.findIndex(g => g.semantics === 'SIM');
  if(simIndex !== -1) {
    const sourceGroup = telegramSourceGroups.splice(simIndex, 1)[0];
    telegramSourceGroups.unshift(sourceGroup);
  } */

  return telegramSourceGroups.length ? telegramSourceGroups : undefined;
}

export function parseMediaSectionInfo(sdp: SDP, channel: SDPMediaSection) {
  const clientInfo = channel.lookupAttributeKeys({
    'ice-ufrag': true,
    'ice-pwd': true,
    fingerprint: true,
    setup: true,
    ssrc: true,
    mid: true,
    'ssrc-group': false
  });

  if(!clientInfo.fingerprint) { // support Firefox
    const line = sdp.session.lines.find(line => line.parsed?.key === 'fingerprint');
    clientInfo.fingerprint = line.parsed.value;
  }

  const telegramSourceGroups = parseSourceGroups(clientInfo['ssrc-group']);
  const [hash, fingerprint] = clientInfo.fingerprint.split(' ', 2);
  const ssrc = clientInfo.ssrc && toTelegramSource(+clientInfo.ssrc.split(' ', 1)[0]);
  // ssrc = telegramSourceGroups ? telegramSourceGroups[0].sources[0] : ssrc;

  return {
    raw: clientInfo,
    ufrag: clientInfo['ice-ufrag'],
    pwd: clientInfo['ice-pwd'],
    fingerprint: {
      fingerprint,
      setup: clientInfo.setup,
      hash
    },
    source: ssrc,
    sourceGroups: telegramSourceGroups,
    mid: clientInfo.mid
  };
}

export function fixLocalOffer(options: {
  offer: RTCSessionDescriptionInit, 
  data: UpdateGroupCallConnectionData,
  // mids?: string[]
}) {
  const {offer, data} = options;
  const sdp = parseSdp(offer.sdp);
  let hasMunged = false;
  hasMunged = addSimulcast(sdp) || hasMunged;

  // const bundleLine = parsedSdp.session.lines.find(line => line.Ha?.key === 'group');
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
    const localMLine = mediaLine.toString();
    
    const codec = data[section.mediaType];
    const codecIds = codec['payload-types'].map(payload => '' + payload.id);
    const correctMLine = generateMediaFirstLine(section.mediaType, undefined, codecIds);
    
    if(localMLine !== correctMLine) {
      const sectionInfo = parseMediaSectionInfo(sdp, section);

      let newData = {...data};
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
