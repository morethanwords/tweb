import getParticipantRank from '@appManagers/utils/chats/getParticipantRank';
import type {MemberTagRole} from '@appManagers/utils/chats/memberTag';
import {TEXT_LINK_ATTRIBUTE} from '@helpers/dom/linkPress';
import {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';

export default function wrapParticipantRank(rank: Parameters<typeof getParticipantRank>[0] | ReturnType<typeof getParticipantRank> | 0) {
  if(typeof(rank) === 'object') {
    rank = getParticipantRank(rank);
  }

  return typeof(rank) === 'number' ?
    i18n(!rank ? 'Chat.ChannelBadge' : (rank === 1 ? 'Chat.OwnerBadge' : 'ChatAdmin')) :
    wrapEmojiText(rank);
}

// * a tag: text, or 0 / 1 / 2 for "channel" / "owner" / "admin"; a role makes it a member tag
export type MemberTagBadge = {rank: string | 0 | 1 | 2, role?: MemberTagRole};

// * a tag in its role's colour: an admin's and the owner's stand on a pill of theirs, a member's is
// * plain text in the grey of its place
export function wrapMemberTag({rank, role}: MemberTagBadge) {
  const span = document.createElement('span');
  if(role && role !== 'member') {
    span.classList.add('member-tag-' + role, 'member-tag-pill');
  }

  span.append(wrapParticipantRank(rank));
  return span;
}

// * a tag that opens something when pressed: it is pressed as a link is (linkPress), with a ripple
// * in its own colour over the pill it stands on, or one the size of a pill (desktop)
export function makeMemberTagPressable(element: HTMLElement) {
  element.classList.add('member-tag-pressable');
  element.setAttribute(TEXT_LINK_ATTRIBUTE, '');
}
