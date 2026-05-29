import crc32 from '@helpers/number/crc32';
import {Poll, PollAnswer} from '@layer';

export const shouldShufflePollOptions = (poll: Poll): boolean =>
  !poll.pFlags.creator && !!poll.pFlags.shuffle_answers;

/**
 * Port of tdesktop's `HashPollShuffleValue`:
 *
 *   hash = decimal(userId) + option bytes + decimal(pollId)
 *   return uint32(base::crc32(hash))
 *
 * Keeps the resulting per-option order identical to tdesktop's poll shuffling.
 */
const hashPollShuffleValue = (
  userId: PeerId,
  pollId: Poll.poll['id'],
  option: Uint8Array
): number => {
  const textEncoder = new TextEncoder();

  const userIdBytes = textEncoder.encode(String(userId));
  const pollIdBytes = textEncoder.encode(String(pollId));
  const buffer = new Uint8Array(userIdBytes.length + option.length + pollIdBytes.length);
  buffer.set(userIdBytes, 0);
  buffer.set(option, userIdBytes.length);
  buffer.set(pollIdBytes, userIdBytes.length + option.length);
  return crc32(buffer);
};

/**
 * Lexicographic byte comparison, mirroring QByteArray's `operator<` used by
 * tdesktop's tie-breaker.
 */
const compareOptionBytes = (a: Uint8Array, b: Uint8Array): number => {
  const len = Math.min(a.length, b.length);
  for(let i = 0; i < len; i++) {
    if(a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
};

type ShufflePollOptionsArgs = {
  options: PollAnswer.pollAnswer[];
  userId: PeerId;
  pollId: Poll.poll['id'];
};

export const shufflePollOptions = ({options, userId, pollId}: ShufflePollOptionsArgs) => {
  return options.slice().sort((a, b) => {
    const hashA = hashPollShuffleValue(userId, pollId, a.option);
    const hashB = hashPollShuffleValue(userId, pollId, b.option);
    if(hashA !== hashB) return hashA - hashB;
    return compareOptionBytes(a.option, b.option);
  });
};
