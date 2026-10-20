import {Chat, ChannelParticipant, ChatParticipant, ChatParticipants} from '@layer';
import emojiRegExp from '@vendor/emoji/regex';
import {isParticipantAdmin, isParticipantCreator} from '@appManagers/utils/chats/isParticipantAdmin';
import hasRights from '@appManagers/utils/chats/hasRights';
import canEditAdmin from '@appManagers/utils/chats/canEditAdmin';

// * the clients hard-code it: there is no app config key for it
export const MEMBER_TAG_MAX_LENGTH = 16;

// * says which colour a tag wears: grey for a member, green for an admin, violet for the owner
export type MemberTagRole = 'member' | 'admin' | 'owner';

const EMOJI_REG_EXP = new RegExp(emojiRegExp, 'g');

export function getMemberTagRole(participant: ChatParticipant | ChannelParticipant | undefined): MemberTagRole {
  return isParticipantCreator(participant) ? 'owner' : (isParticipantAdmin(participant) ? 'admin' : 'member');
}

// * a tag takes no emoji: the field drops them as they are typed
export function removeMemberTagEmoji(text: string) {
  return text.replace(EMOJI_REG_EXP, '');
}

// * a tag is one line of text: no emoji, no line breaks, no padding
export function cleanMemberTag(text: string) {
  return removeMemberTagEmoji(text)
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, MEMBER_TAG_MAX_LENGTH);
}

// * groups only: neither channels, nor their direct messages, nor communities
export function canHaveMemberTags(chat: Chat) {
  return chat?._ === 'chat' || (chat?._ === 'channel' && !!chat.pFlags.megagroup && !chat.pFlags.monoforum);
}

/**
 * Whether I may set `peerId`'s tag (desktop's rules): mine when the group lets me, anyone else's
 * with the right to — an admin's or the owner's only when I may edit that admin too
 */
export function canEditMemberTag(
  chat: Chat,
  peerId: PeerId,
  myId: PeerId,
  participant?: ChatParticipant | ChannelParticipant
) {
  if(!canHaveMemberTags(chat)) {
    return false;
  }

  const group = chat as Chat.chat | Chat.channel;
  if(peerId === myId) {
    return hasRights(group, 'edit_rank');
  }

  return hasRights(group, 'manage_ranks') &&
    (!isParticipantAdmin(participant) || canEditAdmin(chat, participant, myId));
}

/**
 * Puts a basic group's member tag into its participants, by the version they carry (desktop's
 * applyUpdateVersion): an older state is dropped, and so is one past a change never received —
 * 'gap' asks for the whole list again. Without a version (my own change) it just applies
 */
export function applyChatParticipantRank(
  chatParticipants: ChatParticipants.chatParticipants,
  userId: UserId,
  rank: string,
  version?: number
): 'applied' | 'old' | 'gap' | 'missing' {
  if(version !== undefined) {
    if(version < chatParticipants.version) {
      return 'old';
    } else if(version > chatParticipants.version + 1) {
      return 'gap';
    }
  }

  const participant = chatParticipants.participants.find((participant) => participant.user_id === userId);
  if(!participant) {
    return 'missing';
  }

  if(version !== undefined) {
    chatParticipants.version = version;
  }

  if(rank) {
    participant.rank = rank;
  } else {
    delete participant.rank;
  }

  return 'applied';
}
