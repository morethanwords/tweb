import {IconTsx} from '@components/iconTsx';
import {ProgressCircleSVG} from '@components/progressCircleSVG';
import ripple from '@components/ripple';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {attachHotClassName} from '@helpers/solid/classname';
import defineSolidElement, {PassedProps} from '@lib/solidjs/defineSolidElement';
import {createEffect, createSignal, onCleanup, Show} from 'solid-js';
import {Transition} from 'solid-transition-group';
import styles from './attachMenuButton.module.scss';

if(import.meta.hot) import.meta.hot.accept();


type Props = {
  isEditing?: boolean;
  isLoading?: boolean;
  loadingProgress?: number;
  onCancel?: () => void;
};

const AttachMenuButton = defineSolidElement({
  name: 'attach-menu-button',
  component: (props: PassedProps<Props>) => {
    attachHotClassName(props.element, styles.Container, 'btn-menu-toggle', 'btn-icon');
    ripple(props.element, () => true);

    const [loadingContainer, setLoadingContainer] = createSignal<HTMLDivElement>();

    createEffect(() => {
      if(!props.isLoading) return;

      props.element.classList.add(styles.disabled);
      onCleanup(() => props.element.classList.remove(styles.disabled));
    });

    // Workaround around a workaround
    createEffect(() => {
      if(!loadingContainer()) return;

      const clean = attachClickEvent(loadingContainer(), (e) => {
        e.stopPropagation();
        props.onCancel?.();
      });

      onCleanup(clean);
    });

    return (
      <>
        <Transition name='fade' mode="outin">
          <Show when={!props.isLoading}>
            <IconTsx
              class={`${styles.Icon} button-icon`}
              classList={{
                [styles.hidden]: props.isLoading
              }}
              icon={props.isEditing ? 'attach_edit' : 'attach'}
            />
          </Show>
          <Show when={props.isLoading}>
            <span ref={setLoadingContainer} class={styles.LoadingContainer}>
              <IconTsx
                class={`${styles.Icon} ${styles.close} button-icon`}
                icon='close'
              />
              <ProgressCircleSVG
                class={styles.Loader}
                progress={props.loadingProgress}
                strokeThickness={1 / 10}
                stroke='currentColor'
                animate
              />
            </span>
          </Show>
        </Transition>
      </>
    );
  }
});

export default AttachMenuButton;
