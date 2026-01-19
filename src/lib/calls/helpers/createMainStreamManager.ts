/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {GROUP_CALL_AMPLITUDE_ANALYSE_INTERVAL_MS} from '@lib/calls/constants';
import StreamManager from '@lib/calls/streamManager';
import getAudioConstraints from '@lib/calls/helpers/getAudioConstraints';
import getStream from '@lib/calls/helpers/getStream';
import getVideoConstraints from '@lib/calls/helpers/getVideoConstraints';

export default async function createMainStreamManager(muted?: boolean, joinVideo?: boolean) {
  const constraints: MediaStreamConstraints = {
    audio: getAudioConstraints(),
    video: joinVideo && getVideoConstraints()
  };

  const streamManager = new StreamManager(GROUP_CALL_AMPLITUDE_ANALYSE_INTERVAL_MS);

  try {
    const stream = await getStream(constraints, muted);
    streamManager.addStream(stream, 'input');
  } catch(err) {
    console.error('joinGroupCall getStream error', err, constraints);
    streamManager.inputStream = new MediaStream();
  }

  return streamManager;
}
