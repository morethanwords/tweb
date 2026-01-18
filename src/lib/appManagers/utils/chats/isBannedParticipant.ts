import {ChannelParticipant, ChatParticipant} from '@layer';

export const isBannedParticipant = (participant: ChatParticipant | ChannelParticipant | undefined) =>
  participant?._ === 'channelParticipantBanned' && participant.pFlags?.left;
;
