import getParticipantRank from '../../lib/appManagers/utils/chats/getParticipantRank';
import {i18n} from '../../lib/langPack';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';

export default function wrapParticipantRank(rank: ReturnType<typeof getParticipantRank> | 0) {
  return typeof(rank) === 'number' ?
    i18n(!rank ? 'Chat.ChannelBadge' : (rank === 1 ? 'Chat.OwnerBadge' : 'ChatAdmin')) :
    wrapEmojiText(rank);
}
