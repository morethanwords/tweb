import {IconTsx} from '@components/iconTsx';
import {ProgressCircleSVG} from '@components/progressCircleSVG';
import ripple from '@components/ripple';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {attachHotClassName} from '@helpers/solid/classname';
import defineSolidElement, {PassedProps} from '@lib/solidjs/defineSolidElement';
import {createEffect, createSignal, onCleanup, Show} from 'solid-js';
import I18n from '@lib/langPack';
import Modes from '@config/modes';
import styles from './attachMenuButton.module.scss';

if(import.meta.hot) import.meta.hot.accept();


type Props = {
  isReplacingMedia?: boolean;
  isLoading?: boolean;
  loadingProgress?: number;
  onCancel?: () => void;
};

const AttachMenuButton = defineSolidElement({
  name: 'attach-menu-button',
  component: (props: PassedProps<Props>) => {
    attachHotClassName(props.element, styles.Container, 'btn-menu-toggle', 'btn-icon');
    ripple(props.element, () => true);

    createEffect(() => {
      const label = props.isLoading ? 'Cancel' : props.isReplacingMedia ? 'Edit' : 'Chat.Input.Attach';
      props.element.setAttribute('aria-label', I18n.format(label, true));
    });

    createEffect(() => {
      if(!props.isLoading) return;

      props.element.classList.add(styles.disabled);
      onCleanup(() => props.element.classList.remove(styles.disabled));
    });

    // The keyboard layer cancels from the whole button, where Enter and Space land; without it only
    // the loader under the pointer does, as before the layer.
    const [loadingContainer, setLoadingContainer] = createSignal<HTMLSpanElement>();
    createEffect(() => {
      if(Modes.a11y || !props.isLoading || !loadingContainer()) return;

      const clean = attachClickEvent(loadingContainer(), (e) => {
        e.stopPropagation();
        props.onCancel?.();
      });

      onCleanup(clean);
    });

    createEffect(() => {
      if(!Modes.a11y || !props.isLoading) return;
      const hasPopup = props.element.getAttribute('aria-haspopup');
      props.element.removeAttribute('aria-haspopup');

      const clean = attachClickEvent(props.element, (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        props.onCancel?.();
      }, {capture: true});

      onCleanup(() => {
        clean();
        if(hasPopup) props.element.setAttribute('aria-haspopup', hasPopup);
      });
    });

    return (
      <>
        {/* <Transition name='fade' mode="outin">*/}
        <Show when={!props.isLoading}>
          <IconTsx
            class={`${styles.Icon} button-icon`}
            classList={{
              [styles.hidden]: props.isLoading
            }}
            icon={props.isReplacingMedia ? 'replace_squares' : 'attach'}
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
        {/* </Transition>*/}
      </>
    );
  }
});

export default AttachMenuButton;
