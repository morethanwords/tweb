import {ChannelParticipant, ChatParticipant} from '@layer';

export const participantCreatorPredicates: Set<(ChannelParticipant | ChatParticipant)['_']> = new Set([
  'channelParticipantCreator',
  'chatParticipantCreator'
]);

export const participantAdminPredicates: Set<(ChannelParticipant | ChatParticipant)['_']> = new Set([
  ...Array.from(participantCreatorPredicates),
  'channelParticipantAdmin',
  'chatParticipantAdmin'
]);

export const isParticipantCreator = (participant: ChatParticipant | ChannelParticipant | undefined) =>
  participantCreatorPredicates.has(participant?._);

export const isParticipantAdmin = (participant: ChatParticipant | ChannelParticipant | undefined) =>
  participantAdminPredicates.has(participant?._);
