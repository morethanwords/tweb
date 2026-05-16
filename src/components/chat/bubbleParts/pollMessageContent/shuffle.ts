import {mergeSeed, seededShuffle} from '@helpers/array/seededShuffle';
import intToUint from '@helpers/number/intToUint';
import {Poll, PollAnswer} from '@layer';

export const shouldShufflePollOptions = (poll: Poll): boolean =>
  !poll.pFlags.creator && !!poll.pFlags.shuffle_answers;

type ShufflePollOptionsArgs = {
  initialOptions: PollAnswer.pollAnswer[];
  seed: number;
  mid: number;
  peerId: number;
};

export const shufflePollOptions = ({initialOptions, seed, mid, peerId}: ShufflePollOptionsArgs) => {
  return seededShuffle(initialOptions, mergeSeed([
    intToUint(seed),
    intToUint(mid),
    intToUint(peerId)
  ]));
}
