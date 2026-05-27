import {ChannelParticipant, ChatParticipant} from '@layer';
import getPeerId from '@appManagers/utils/peers/getPeerId';

export default function getParticipantPeerId(participant: PeerId | ChannelParticipant | ChatParticipant): PeerId {
  if(typeof(participant) !== 'object') {
    return participant;
  }

  const peerId = (participant as ChannelParticipant.channelParticipantBanned).peer ?
    getPeerId((participant as ChannelParticipant.channelParticipantBanned).peer) :
    (participant as ChatParticipant.chatParticipant).user_id?.toPeerId();
  return peerId;
}
