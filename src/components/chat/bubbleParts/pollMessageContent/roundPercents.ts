import {PollResults} from '@layer';

export function roundPercents(percents: number[]): number[] {
  const base = percents.map(Math.floor);

  const remainders = percents.map((p, i) => ({
    index: i,
    remainder: p - base[i]
  }));

  const sum = base.reduce((a, b) => a + b, 0);
  const diff = 100 - sum;

  remainders.sort((a, b) => {
    if(a.remainder === b.remainder) return base[b.index] - base[a.index];
    return b.remainder - a.remainder;
  });

  const mxI = Math.min(diff, remainders.length);

  for(let i = 0; i < mxI; i++) {
    base[remainders[i].index]++;
  }

  return base;
}

export const getRoundedPercentsFromResults = (pollResults?: PollResults) => {
  const results = pollResults?.results;
  if(!results) return [];

  const totalVotes = results.reduce((acc, r) => acc + (r.voters ?? 0), 0);
  if(!totalVotes) return new Array(results.length).fill(0);

  return roundPercents(results.map(r => totalVotes ? (r.voters ?? 0) / totalVotes * 100 : 0));
}
