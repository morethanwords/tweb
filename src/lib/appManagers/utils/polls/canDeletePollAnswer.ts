import type {Poll, PollAnswer} from '@layer';
import getPeerId from '@appManagers/utils/peers/getPeerId';

/** How long the one who added an option may take it back, when the app config does not say (desktop's) */
export const POLL_ANSWER_DELETE_PERIOD_DEFAULT = 300;

/**
 * Whether an option someone added to an open-answers poll can be deleted (`messages.deletePollAnswer`),
 * as desktop decides it: only an added one (it has a date), by the poll's creator at any time, or by
 * the one who added it for `poll_answer_delete_period` seconds after
 */
export default function canDeletePollAnswer(options: {
  poll: Poll,
  answer: PollAnswer.pollAnswer,
  myId: PeerId,
  /** the server's time now, in seconds */
  now: number,
  deletePeriod?: number
}) {
  const {poll, answer, myId, now, deletePeriod = POLL_ANSWER_DELETE_PERIOD_DEFAULT} = options;
  if(!answer?.date) {
    return false;
  }

  if(poll.pFlags.creator) {
    return true;
  }

  return !!answer.added_by &&
    getPeerId(answer.added_by) === myId &&
    (now - answer.date) < deletePeriod;
}
