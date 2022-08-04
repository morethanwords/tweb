/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {GroupCallParticipantVideoSourceGroup} from '../../../layer';
import {toTelegramSource} from '../utils';

export function parseSourceGroups(sdpLines: string[]) {
  const telegramSourceGroups = sdpLines.map((str) => {
    const [semantics, ...rest] = str.split(' ');

    const sourceGroup: GroupCallParticipantVideoSourceGroup = {
      _: 'groupCallParticipantVideoSourceGroup',
      semantics,
      // sources: rest.map((ssrc) => +ssrc)
      sources: rest.map((ssrc) => toTelegramSource(+ssrc))
    };

    return sourceGroup;
  });

  /* const simIndex = telegramSourceGroups.findIndex((g) => g.semantics === 'SIM');
  if(simIndex !== -1) {
    const sourceGroup = telegramSourceGroups.splice(simIndex, 1)[0];
    telegramSourceGroups.unshift(sourceGroup);
  } */

  return telegramSourceGroups.length ? telegramSourceGroups : undefined;
}
