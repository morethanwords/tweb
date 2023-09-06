/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {ChannelParticipant, ChatParticipant} from '../../../../layer';
import getPeerId from '../peers/getPeerId';

export default function getParticipantPeerId(participant: PeerId | ChannelParticipant | ChatParticipant): PeerId {
  if(typeof(participant) !== 'object') {
    return participant;
  }

  const peerId = (participant as ChannelParticipant.channelParticipantBanned).peer ?
    getPeerId((participant as ChannelParticipant.channelParticipantBanned).peer) :
    (participant as ChatParticipant.chatParticipant).user_id.toPeerId();
  return peerId;
}
