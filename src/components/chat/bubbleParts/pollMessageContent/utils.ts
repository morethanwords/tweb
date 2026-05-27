import {createMessageSpoilerOverlay} from '@components/messageSpoilerOverlay';
import {AttachedMedia} from '@components/popups/createPoll/storeContext';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {useIsCleaned} from '@hooks/useIsCleaned';
import {Poll, TextWithEntities} from '@layer';
import {ChatRights} from '@lib/appManagers/appChatsManager';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {Accessor, batch, createEffect, createSignal, onCleanup} from 'solid-js';
import {unwrap} from 'solid-js/store';
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
    await Promise.all(unwrap(props.loadPromises) || []); // TranslatableMessage delays the moment when content appears in the DOM

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

type UseRightsArgs<T extends ChatRights = ChatRights> = {
  peerId: Accessor<PeerId>;
  rights: Accessor<T[]>;
  getRight: (key: T) => Promise<boolean>
};

export const useChatRights = <T extends ChatRights = ChatRights>({peerId, rights, getRight}: UseRightsArgs<T>) => {
  const {rootScope} = useHotReloadGuard();

  const [ready, setReady] = createSignal(false);
  const [values, setValues] = createSignal<Partial<Record<T, boolean>>>({});

  createEffect(() => {
    const keys = rights();
    let cancelled = false;

    setReady(false);
    setValues({});

    const refresh = async() => {
      const results = await Promise.all(keys.map((k) => getRight(k)));
      if(cancelled) return;

      const map: Partial<Record<ChatRights, boolean>> = {};
      keys.forEach((k, i) => {
        map[k] = results[i];
      });

      batch(() => {
        setValues(map);
        setReady(true);
      });
    };

    const onChatUpdate = (chatId: ChatId) => {
      if(peerId() !== chatId.toPeerId(true)) return;
      refresh();
    };

    subscribeOn(rootScope)('chat_update', onChatUpdate);

    onCleanup(() => {
      cancelled = true;
    });

    refresh();
  });

  const hasRight = (key: T): boolean => {
    if(!ready()) return false;
    return values()[key] ?? false;
  };

  return {ready, hasRight};
};

export const hasSelectedCorrectAnswers = (poll: Poll.poll): boolean => {
  if(poll.chosenIndexes?.length !== poll.correctIndexes?.length || !poll.chosenIndexes?.length) return false;
  const set = new Set(poll.correctIndexes);
  return poll.chosenIndexes?.every((i) => set.has(i)) ?? false;
};
