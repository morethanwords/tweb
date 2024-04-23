import {Message} from '../../../../layer';

export default function getUnreadReactions(message: Message) {
  const reactions = (message as Message.message)?.reactions;
  const recentReactions = reactions?.recent_reactions;
  if(!recentReactions) {
    return;
  }

  const arr = recentReactions.filter((reaction) => reaction.pFlags.unread);
  if(!arr.length) {
    return;
  }

  return arr;
}
