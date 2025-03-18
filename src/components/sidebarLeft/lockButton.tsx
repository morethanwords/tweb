import {createRoot, createSignal, createEffect, onCleanup} from 'solid-js';

import {i18n} from '../../lib/langPack';
import rootScope from '../../lib/rootScope';

import PasscodeLockScreenController from '../passcodeLock/passcodeLockScreenController';
import showTooltip from '../tooltip';

const LockIcon = () => {
  return (
    <svg width="23" height="22" viewBox="0 0 23 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.5 13.8C1.5 12.1198 1.5 11.2798 1.82698 10.638C2.1146 10.0735 2.57354 9.6146 3.13803 9.32698C3.77976 9 4.61984 9 6.3 9H11.7C13.3802 9 14.2202 9 14.862 9.32698C15.4265 9.6146 15.8854 10.0735 16.173 10.638C16.5 11.2798 16.5 12.1198 16.5 13.8V16.2C16.5 17.8802 16.5 18.7202 16.173 19.362C15.8854 19.9265 15.4265 20.3854 14.862 20.673C14.2202 21 13.3802 21 11.7 21H6.3C4.61984 21 3.77976 21 3.13803 20.673C2.57354 20.3854 2.1146 19.9265 1.82698 19.362C1.5 18.7202 1.5 17.8802 1.5 16.2V13.8Z" stroke="currentColor" stroke-width="2"/>
      <path class="lock-icon-shackle" d="M20.5 8C20.5 8.55228 20.9477 9 21.5 9C22.0523 9 22.5 8.55228 22.5 8H20.5ZM13.5 8V5.5H11.5V8H13.5ZM20.5 5.5V8H22.5V5.5H20.5ZM17 2C18.933 2 20.5 3.567 20.5 5.5H22.5C22.5 2.46243 20.0376 0 17 0V2ZM13.5 5.5C13.5 3.567 15.067 2 17 2V0C13.9624 0 11.5 2.46243 11.5 5.5H13.5Z" fill="currentColor"/>
    </svg>
  )
};

const LockButton = () => {
  let button: HTMLButtonElement;
  let iconWrapper: HTMLSpanElement;

  let tooltipShowTimeout: number;

  const [isTooltipVisible, setIsTooltipVisible] = createSignal(false);

  const clearTooltipVisible = () => {
    setIsTooltipVisible(false);
    window.clearTimeout(tooltipShowTimeout);
    tooltipShowTimeout = undefined;
  };

  createEffect(() => {
    if(!isTooltipVisible()) return;

    const {close} = showTooltip({
      element: button,
      mountOn: button.parentElement,
      vertical: 'bottom',
      textElement: i18n('PasscodeLock.TapToLock'),
      onClose: () => {},
      lighter: true
    });

    onCleanup(() => {
      close();
    });
  });

  <button
    ref={button}
    class="btn-icon sidebar-lock-button"
    onClick={() => {
      PasscodeLockScreenController.lock(iconWrapper, () => {
        rootScope.dispatchEvent('toggle_locked', true);
        clearTooltipVisible();
      });
      // PasscodeLockScreenController.lockOtherTabs();
    }}
    onMouseEnter={() => {
      tooltipShowTimeout = window.setTimeout(() => {
        setIsTooltipVisible(true);
      }, 500);
    }}
    onMouseLeave={() => {
      clearTooltipVisible();
    }}
  >
    <span ref={iconWrapper} class="sidebar-lock-button-icon">
      <LockIcon />
    </span>
  </button>

  return button;
};

const createLockButton = () => {
  let dispose: () => void;

  const element = createRoot((_dispose) => {
    dispose = _dispose;
    return LockButton();
  });

  return {element, dispose};
};

export default createLockButton;
