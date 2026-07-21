import {isRegularPollMessage} from '@appManagers/utils/polls/pollVoteRestriction';
import {Message} from '@layer';

export function canViewPollStatistics(message?: Message, isRegularSurface = true) {
  return message?._ === 'message' &&
    message.media?._ === 'messageMediaPoll' &&
    !!message.media.results.pFlags.can_view_stats &&
    !message.pFlags.is_outgoing &&
    isRegularPollMessage(message, isRegularSurface);
}
