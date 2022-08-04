import {UpdateGroupCallConnectionData} from '../../lib/calls/types';
import audioCodec from './audioCodec';
import transport from './transport';
import videoCodec from './videoCodec';

const data: UpdateGroupCallConnectionData = {
  audio: audioCodec,
  transport: transport,
  video: videoCodec
};

export default data;
