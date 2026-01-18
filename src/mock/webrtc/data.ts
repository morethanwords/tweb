import {UpdateGroupCallConnectionData} from '@lib/calls/types';
import audioCodec from '@/mock/webrtc/audioCodec';
import transport from '@/mock/webrtc/transport';
import videoCodec from '@/mock/webrtc/videoCodec';

const data: UpdateGroupCallConnectionData = {
  audio: audioCodec,
  transport: transport,
  video: videoCodec
};

export default data;
