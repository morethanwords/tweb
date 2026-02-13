import {ChannelParticipant, Chat, ChatParticipant} from '@layer';
import {isParticipantCreator} from '@lib/appManagers/utils/chats/isParticipantAdmin';

export default function canEditAdmin(chat: Chat, participant: ChatParticipant | ChannelParticipant, myId: PeerId) {
  const isCreator = isParticipantCreator(participant);
  const myUserId = myId.toUserId();
  const promotedBy = (participant as ChannelParticipant.channelParticipantAdmin)?.promoted_by ||
    (participant as ChatParticipant.chatParticipant)?.inviter_id;
  return !!(chat as Chat.channel).pFlags.creator ||
    (!isCreator && (!promotedBy || promotedBy === myUserId));
}
