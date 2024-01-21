import {ChatFull, ChatParticipants} from '../../../../layer';

export default function getParticipantsCount(chatFull: ChatFull) {
  return (chatFull as ChatFull.channelFull).participants_count ||
    ((chatFull as ChatFull.chatFull).participants as ChatParticipants.chatParticipants)?.participants?.length ||
    1;
}
