import {Component, JSX, onCleanup, onMount} from 'solid-js';
import {Transition} from 'solid-transition-group';
import {Portal} from 'solid-js/web';

import pause from '../../helpers/schedulers/pause';
import {i18n} from '../../lib/langPack';

import ripple from '../ripple'; ripple; // keep

import styles from './simplePopup.module.scss';

const SimplePopup: Component<{
  visible?: boolean;

  title: JSX.Element;
  description: JSX.Element;
  confirmButtonContent: JSX.Element;

  onClose?: () => void;
  onConfirm: () => void;
}> = (props) => {
  onMount(() => {
    const listener = (e: KeyboardEvent) => {
      if(e.key === 'Escape') props.onClose?.();
    }
    document.addEventListener('keydown', listener);

    onCleanup(() => {
      document.removeEventListener('keydown', listener);
    });
  });

  return (
    <Portal>
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
          <div class='popup-container'>
            <div class='popup-header'>
              <div class='popup-title'>
                {props.title}
              </div>
            </div>

            <div class='popup-description'>
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
