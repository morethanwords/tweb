import type {ChannelParticipant, ChatParticipant} from '@layer';
import {getMemberTagRole} from '@appManagers/utils/chats/memberTag';

// * opens the tag's editor; the popup's module is loaded when it is first wanted
export default function openEditMemberTag(
  chatId: ChatId,
  peerId: PeerId,
  participant?: ChatParticipant | ChannelParticipant
) {
  return import('@components/popups/editMemberTag').then(({default: showEditMemberTagPopup}) => {
    return showEditMemberTagPopup({
      chatId,
      peerId,
      rank: (participant as ChannelParticipant.channelParticipant)?.rank,
      role: participant ? getMemberTagRole(participant) : undefined
    });
  });
}
