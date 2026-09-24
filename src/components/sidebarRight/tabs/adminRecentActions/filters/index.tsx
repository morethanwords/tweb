import {batch, createComputed, createEffect, on, onCleanup, Show} from 'solid-js';
import {Transition} from 'solid-transition-group';
import {IS_MOBILE} from '@environment/userAgent';
import createFocusTrap from '@helpers/dom/focusTrap';
import track from '@helpers/solid/track';
import I18n from '@lib/langPack';
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

  let inputEl: HTMLInputElement;
  const onInputRef = (el: HTMLInputElement) => {
    inputEl = el;
    if(IS_MOBILE) return;
    setTimeout(() => el.focus(), focusDelay)
  };

  let cardEl: HTMLDivElement;
  createEffect(on(() => props.open, (open) => {
    if(!open || !cardEl) return;

    const focusTrap = createFocusTrap(cardEl);
    focusTrap.activate(undefined, inputEl);
    onCleanup(() => focusTrap.deactivate());
  }));

  const onKeyDown = (e: KeyboardEvent) => {
    if(e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      props.onClose?.();
    }
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
            <div>
              <div class={styles.ContainerBackdropFill} />
              <div class={styles.ContainerBackdropExtension} />
            </div>
            <div
              ref={cardEl}
              class={styles.Card}
              role='dialog'
              aria-modal='true'
              aria-label={I18n.format('AdminRecentActionsFilters.ByType', true)}
              onKeyDown={onKeyDown}
            >
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
