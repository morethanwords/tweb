import {ChannelParticipant, Chat} from '../../../../layer';

export default function canEditAdmin(chat: Chat, participant: ChannelParticipant, myId: PeerId) {
  const isCreator = participant?._ === 'channelParticipantCreator';
  const promotedBy = (participant as ChannelParticipant.channelParticipantAdmin)?.promoted_by;
  return !!(chat as Chat.channel).pFlags.creator ||
    (!isCreator && (!promotedBy || promotedBy === myId));
}
