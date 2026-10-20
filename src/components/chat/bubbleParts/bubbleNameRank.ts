import {MemberTagBadge, makeMemberTagPressable, wrapMemberTag} from '@components/wrappers/participantRank';

export type BubbleNameRank = MemberTagBadge;

/**
 * The tag at the end of a sender's name line. A member tag (one with a role) explains itself on a
 * click; "channel" and a signature do not
 */
export default function createBubbleNameRank(rank: BubbleNameRank) {
  const span = wrapMemberTag(rank);
  span.classList.add('bubble-name-rank');
  if(rank.role) {
    span.classList.add('is-member-tag');
    makeMemberTagPressable(span);
  }

  return span;
}
