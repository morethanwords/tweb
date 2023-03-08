import {ChannelParticipant, ChatParticipant} from '../../../../layer';

export default function getParticipantRank(participant: ChannelParticipant | ChatParticipant) {
  return (participant as ChannelParticipant.channelParticipantAdmin).rank ||
    (participant._ === 'channelParticipantAdmin' || participant._ === 'chatParticipantAdmin' ? 2 :
      (participant._ === 'chatParticipantCreator' || participant._ === 'channelParticipantCreator' ? 1 : undefined));
}
