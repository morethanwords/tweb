/**
 * Fetching file parts are implemented based on these restrictions:
 * https://core.telegram.org/cdn#restrictions-on-uploadgetfile-and-uploadgetcdnfile-parameters
 */

const STREAM_CHUNK_MULTIPLIER = 4096;
const STREAM_FRAGMENT_SIZE = 1024 * 1024; // 1048576 (1MB)

export type StreamFetchingRange = {
  offset: number;
  limit: number;
};

export function splitRangeForGettingFileParts(lowerBound: number, upperBound: number) {
  const lowerBoundChunkStart = Math.floor(lowerBound / STREAM_CHUNK_MULTIPLIER) * STREAM_CHUNK_MULTIPLIER;
  const upperBoundNextChunkStart = (Math.floor(upperBound / STREAM_CHUNK_MULTIPLIER) + 1) * STREAM_CHUNK_MULTIPLIER;

  const lowerBoundFragmentStart = Math.floor(lowerBound / STREAM_FRAGMENT_SIZE) * STREAM_FRAGMENT_SIZE;
  const lowerBoundNextFragmentStart = (Math.floor(lowerBound / STREAM_FRAGMENT_SIZE) + 1) * STREAM_FRAGMENT_SIZE;

  const upperBoundInThisFragment = Math.min(lowerBoundNextFragmentStart, upperBoundNextChunkStart);
  const diff = upperBoundInThisFragment - lowerBoundChunkStart;
  const limitForFirstPart = snapLimit(diff);

  const alignedLowerBound = Math.max(upperBoundInThisFragment - limitForFirstPart, lowerBoundFragmentStart);

  const ranges: StreamFetchingRange[] = [
    {
      offset: alignedLowerBound,
      limit: limitForFirstPart
    }
  ];

  // Most likely this `while` will never happen unless the data from the quality file is crazy
  let currentOffset = lowerBoundNextFragmentStart;
  while(currentOffset < upperBound) {
    //
    const nextFragmentStart = (Math.floor(currentOffset / STREAM_FRAGMENT_SIZE) + 1) * STREAM_FRAGMENT_SIZE;
    if(nextFragmentStart > upperBound) break;

    ranges.push({
      offset: currentOffset,
      limit: STREAM_FRAGMENT_SIZE
    });
    currentOffset += STREAM_FRAGMENT_SIZE;
  }

  if(currentOffset <= upperBound) {
    const diff = upperBound - currentOffset + 1;
    const limitForLastPart = snapLimit(diff);

    ranges.push({
      offset: currentOffset,
      limit: limitForLastPart
    });
  }

  const lastRange = ranges[ranges.length - 1];
  const alignedUpperBound = lastRange.offset + lastRange.limit - 1;

  return {
    alignedLowerBound,
    alignedUpperBound,
    ranges
  };
}

function snapLimit(limit: number) {
  return Math.max(2 ** Math.ceil(Math.log2(limit)), STREAM_CHUNK_MULTIPLIER); // limit must be power of 2, minimum 4096
}

/*
// If you make changes in this function, use this snippet to analyze the output
import {logger} from '../logger';
(() => {
  const log = logger('test-splitRangeForGettingFileParts');
  const cases = [
    [0, 4], // [offset, limit]
    [0, 4095],
    [0, 4096],
    [0, 4097],
    [4095, 90],
    [4095, 1024 * 200],
    [4096, 70000],
    [0, 5 * 4096],
    [2 * 4096, 5 * 4096],
    [0, 1024 * 1024 * 3],
    [0, 1024 * 1024 * 3 + 1], // should be 3 chunks of 1MB and one of 4096 for 1 Byte
    [1024 * 1024 - 3 * 4096 - 7, 1024 * 1024 * 3 + 3 * 4096 + 7 + 1], // should be 3 chunks of 1MB and last one of 4096 for 1 Byte
    [0, 1024 * 1024 + 349],
    [1024 * 1024 - 5 * 4096, 12 * 4096],
    [1024 * 1024 - 5 * 4096, 1024 * 1024 * 3 + 12 * 4096],
    [2287329, 2815347 - 2287329 + 1]
  ];

  for(const c of cases) {
    const start = c[0];
    const end = c[0] + c[1] - 1;
    log(
      'start, limit, end, splitRangeForGettingFileParts(start, end)',
      start,
      c[1],
      end,
      splitRangeForGettingFileParts(start, end).ranges.map((c) => ({
        ...c,
        offset_div_4096: c.offset / 4096,
        limit_div_4096: c.limit / 4096,
        log2_limit: Math.log2(c.limit)
      }))
    );
  }
})();
*/
