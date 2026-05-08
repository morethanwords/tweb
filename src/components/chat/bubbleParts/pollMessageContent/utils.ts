import {TextWithEntities} from '@layer';

export type PollOptionResult = {
  voters: number;
  percent: number;
  peerIds: PeerId[];
  chosen: boolean;
};

export type LocalTextWithEntities = Pick<TextWithEntities, 'text' | 'entities'>;

export function roundPercents(percents: number[]): number[] {
  const base = percents.map(Math.floor);

  const remainders = percents.map((p, i) => ({
    index: i,
    remainder: p - base[i]
  }));

  const sum = base.reduce((a, b) => a + b, 0);
  const diff = 100 - sum;

  remainders.sort((a, b) => b.remainder - a.remainder);

  const mxI = Math.min(diff, remainders.length);

  for(let i = 0; i < mxI; i++) {
    base[remainders[i].index]++;
  }

  return base;
}
