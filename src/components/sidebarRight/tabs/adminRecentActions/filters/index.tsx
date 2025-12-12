import {batch, createComputed, createMemo, createSignal, Show} from 'solid-js';
import {Transition} from 'solid-transition-group';
import {IS_MOBILE} from '../../../../../environment/userAgent';
import track from '../../../../../helpers/solid/track';
import useElementSize from '../../../../../hooks/useElementSize';
import Scrollable from '../../../../scrollable2';
import {FlagFilters} from './flagFilters';
import styles from './styles.module.scss';
import {CommittedFilters} from './types';
import {useFlagFilters} from './useFlagFilters';


type FiltersProps = {
  channelId: ChatId;
  open: boolean;
  onClose?: () => void;

  committedFilters?: CommittedFilters | null;
  onCommit?: (filters: CommittedFilters | null) => void;
};

const focusDelay = 100;

export const Filters = (props: FiltersProps) => {
  const filtersControls = useFlagFilters({channelId: () => props.channelId});

  const [cardElement, setCardElement] = createSignal<HTMLDivElement | null>(null);
  const [contentElement, setContentElement] = createSignal<HTMLDivElement | null>(null);

  const cardSize = useElementSize(cardElement);
  const contentSize = useElementSize(contentElement);


  const isOverflowing = createMemo(() => {
    if(!cardElement() || !contentElement()) return false;
    return cardSize.height < contentSize.height;
  });

  createComputed(() => {
    track(() => props.open);

    filtersControls.setFromCommittedFilters(props.committedFilters);
  });


  const onReset = () => batch(() => {
    props.onCommit(null);
    props.onClose?.();
  });

  const onCommit = (committedFilters?: CommittedFilters | null) => batch(() => {
    props.onCommit(committedFilters);
    props.onClose?.();
  });

  const onInputRef = (el: HTMLInputElement) => {
    if(IS_MOBILE) return;
    setTimeout(() => el.focus(), focusDelay)
  };


  return (
    <>
      <Transition name='fade'>
        <Show when={props.open}>
          <div class={styles.Overlay} onClick={props.onClose} />
        </Show>
      </Transition>

      <Transition
        enterActiveClass={styles.ContainerEnterActive}
        exitActiveClass={styles.ContainerExitActive}
        enterClass={styles.ContainerEnter}
        exitToClass={styles.ContainerExitTo}
      >
        <Show when={props.open}>
          <div class={styles.Container}>
            <div class={styles.ContainerBackdrop}>
              <div class={styles.ContainerBackdropFill} />
              <div class={styles.ContainerBackdropExtension} />
            </div>
            <div class={styles.Card} ref={setCardElement}>
              <Scrollable classList={{[styles.hideThumb]: !isOverflowing()}} relative>
                <div class={styles.Content} ref={setContentElement}>
                  <FlagFilters
                    filtersControls={filtersControls}
                    inputRef={onInputRef}
                    onCommit={onCommit}
                    onReset={onReset}
                    hasSearch
                  />
                </div>
              </Scrollable>
            </div>
          </div>
        </Show>
      </Transition>
    </>
  );
};

export type {CommittedFilters};
