import {createMessageSpoilerOverlay} from '@components/messageSpoilerOverlay';
import {AttachedMedia} from '@components/popups/createPoll/storeContext';
import {useIsCleaned} from '@hooks/useIsCleaned';
import {TextWithEntities} from '@layer';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {Accessor, createEffect, onCleanup} from 'solid-js';
import {PollMessageContentProps} from './PollMessageContent';

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
export type LocalTextWithOptionalEntities = Pick<TextWithEntities, 'text'> & Partial<Pick<TextWithEntities, 'entities'>>;

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

export const attachSpoilerOverlay = (descriptionElement: HTMLDivElement, props: PollMessageContentProps) => {
  const {HotReloadGuard} = useHotReloadGuard();

  const isCleaned = useIsCleaned();
  let cleanup: () => void;

  onCleanup(() => {
    cleanup?.();
  });

  (async() => {
    await Promise.all(props.loadPromises || []); // TranslatableMessage delays the moment when content appears in the DOM

    if(isCleaned() || !descriptionElement.querySelector('.spoiler-text')) return;

    const spoilerOverlay = createMessageSpoilerOverlay({
      mid: props.message.mid,
      messageElement: descriptionElement,
      animationGroup: props.animationGroup || 'none'
    }, HotReloadGuard);

    descriptionElement.append(spoilerOverlay.element);
    cleanup = () => {
      spoilerOverlay.dispose();
    };
  })();
};

export const spinnerThickness = 2 / 12;

export function pollOptionToLink(option: Uint8Array): string {
  let binary = '';
  for(let i = 0; i < option.length; i++) binary += String.fromCharCode(option[i]);
  return btoa(binary).replace(/=+$/, '');
}
