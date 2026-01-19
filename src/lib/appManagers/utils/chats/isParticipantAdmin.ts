import {ChannelParticipant, ChatParticipant} from '@layer';

export const isParticipantAdmin = (participant: ChatParticipant | ChannelParticipant | undefined) =>
  participant?._ === 'channelParticipantCreator' ||
  participant?._ === 'channelParticipantAdmin' ||
  participant?._ === 'chatParticipantAdmin' ||
  participant?._ === 'chatParticipantCreator'
;
