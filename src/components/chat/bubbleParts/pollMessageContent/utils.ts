import {AttachedMedia} from '@components/popups/createPoll/storeContext';
import {TextWithEntities} from '@layer';
import {Accessor, createEffect, createSignal, onCleanup} from 'solid-js';

export type PollOptionResult = {
  voters: number;
  percent: number;
  peerIds: PeerId[];
  chosen: boolean;
  correct: boolean;
};

export type NewOptionValues = LocalTextWithEntities & {
  attachment?: AttachedMedia;
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

export type DataPollViewerIdxDirectivePayload = [number | undefined, Map<number, HTMLElement>];

declare module 'solid-js' {
  namespace JSX {
    interface Directives {
      dataPollViewerIdx: DataPollViewerIdxDirectivePayload;
    }
  }
}

export const dataPollViewerIdx = (el: HTMLElement, payload: Accessor<DataPollViewerIdxDirectivePayload>) => {
  createEffect(() => {
    const [idx, map] = payload();
    if(idx === undefined) return;

    el.dataset.pollViewerIdx = idx.toString();
    map.set(idx, el);

    onCleanup(() => {
      map.delete(idx);
    });
  });
};

export const spinnerThickness = 2 / 12;
