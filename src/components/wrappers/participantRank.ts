import getParticipantRank from '../../lib/appManagers/utils/chats/getParticipantRank';
import {i18n} from '../../lib/langPack';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';

export default function wrapParticipantRank(rank: Parameters<typeof getParticipantRank>[0] | ReturnType<typeof getParticipantRank> | 0) {
  if(typeof(rank) === 'object') {
    rank = getParticipantRank(rank);
  }

  return typeof(rank) === 'number' ?
    i18n(!rank ? 'Chat.ChannelBadge' : (rank === 1 ? 'Chat.OwnerBadge' : 'ChatAdmin')) :
    wrapEmojiText(rank);
}
