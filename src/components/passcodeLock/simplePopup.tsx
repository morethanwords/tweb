import {Component, createEffect, createSignal, createUniqueId, JSX, onCleanup} from 'solid-js';
import {Transition} from 'solid-transition-group';
import {Portal} from 'solid-js/web';

import pause from '@helpers/schedulers/pause';
import {bindActiveWindowListener, getOverlayRoot} from '@helpers/appWindow';
import createFocusTrap from '@helpers/dom/focusTrap';
import {i18n} from '@lib/langPack';

import ripple from '@components/ripple'; ripple; // keep

import styles from '@components/passcodeLock/simplePopup.module.scss';

const SimplePopup: Component<{
  visible?: boolean;

  title: JSX.Element;
  description: JSX.Element;
  confirmButtonContent: JSX.Element;

  onClose?: () => void;
  onConfirm: () => void;
}> = (props) => {
  const [container, setContainer] = createSignal<HTMLDivElement>();
  const titleId = createUniqueId();
  const descriptionId = createUniqueId();
  const root = getOverlayRoot();
  createEffect(() => {
    const element = container();
    if(!props.visible || !element) return;
    const trap = createFocusTrap(element);
    trap.activate(undefined, element.querySelector('[autofocus]'));
    const listener = (e: KeyboardEvent) => {
      if(e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        props.onClose?.();
      }
    }
    const detach = bindActiveWindowListener((win) => win.document, 'keydown', listener);

    onCleanup(() => {
      detach();
      trap.deactivate();
    });
  });

  return (
    <Portal mount={root}>
      <Transition
        onEnter={async(el, done) => {
          await pause(0);
          el.classList.add('active');
          await pause(0);
          done();
        }}
        onExit={async(el, done) => {
          el.classList.remove('active');
          await pause(200);
          done();
        }}
      >
        {props.visible && <div
          class={'popup popup-peer popup-confirmation ' + styles.Popup}
          onClick={(e) => {
            if(e.target === e.currentTarget) {
              props.onClose?.();
            }
          }}
        >
          <div ref={setContainer} class='popup-container' role='dialog' aria-modal='true' aria-labelledby={titleId} aria-describedby={descriptionId} tabindex={-1}>
            <div class='popup-header'>
              <div class='popup-title' id={titleId}>
                {props.title}
              </div>
            </div>

            <div class='popup-description' id={descriptionId}>
              {props.description}
            </div>

            <div class='popup-buttons'>
              <button class='popup-button btn danger' use:ripple onClick={props.onConfirm}>
                {props.confirmButtonContent}
              </button>
              <button class='popup-button btn primary' use:ripple onClick={props.onClose} autofocus>
                {i18n('Cancel')}
              </button>
            </div>
          </div>
        </div>}
      </Transition>
    </Portal>
  );
};

export default SimplePopup;
