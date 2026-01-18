import {batch, createComputed, Show} from 'solid-js';
import {Transition} from 'solid-transition-group';
import {IS_MOBILE} from '@environment/userAgent';
import track from '@helpers/solid/track';
import {FlagFilters} from '@components/sidebarRight/tabs/adminRecentActions/filters/flagFilters';
import styles from '@components/sidebarRight/tabs/adminRecentActions/filters/styles.module.scss';
import {CommittedFilters} from '@components/sidebarRight/tabs/adminRecentActions/filters/types';
import {useFlagFilters} from '@components/sidebarRight/tabs/adminRecentActions/filters/useFlagFilters';


type FiltersProps = {
  channelId: ChatId;
  isBroadcast: boolean;
  open: boolean;
  onClose?: () => void;

  committedFilters?: CommittedFilters | null;
  onCommit?: (filters: CommittedFilters | null) => void;
};

const focusDelay = 100;

export const Filters = (props: FiltersProps) => {
  const filtersControls = useFlagFilters({channelId: () => props.channelId, isBroadcast: () => props.isBroadcast});

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
            <div class={styles.Card}>
              <FlagFilters
                filtersControls={filtersControls}
                inputRef={onInputRef}
                onCommit={onCommit}
                onReset={onReset}
                hasSearch
              />
            </div>
          </div>
        </Show>
      </Transition>
    </>
  );
};

export type {CommittedFilters};
