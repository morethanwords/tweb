import {Component, createEffect, createResource, on, onCleanup, onMount, Show} from 'solid-js';
import {createMutable} from 'solid-js/store';

import {useLockScreenHotReloadGuard} from '../../lib/solidjs/hotReloadGuard';
import AccountController from '../../lib/accounts/accountController';
import {MAX_PASSCODE_LENGTH} from '../../lib/passcode/constants';
import {usePasscodeActions} from '../../lib/passcode/actions';
import commonStateStorage from '../../lib/commonStateStorage';
import throttle from '../../helpers/schedulers/throttle';
import focusInput from '../../helpers/dom/focusInput';
import pause from '../../helpers/schedulers/pause';
import {i18n} from '../../lib/langPack';

import ChatBackgroundGradientRenderer from '../chat/gradientRenderer';
import type PasswordInputField from '../passwordInputField';
import {animateValue} from '../mediaEditor/utils';
import ripple from '../ripple'; ripple; // keep
import Space from '../space';

import PasswordMonkeyTsx from './passwordMonkeyTsx';
import SimplePopup from './simplePopup';
import Background from './background';

import styles from './passcodeLockScreen.module.scss';
import {ChatBackground} from '../chat/bubbles/chatBackground';


type StateStore = {
  isMonkeyHidden: boolean;
  isError: boolean;
  tooManyAttempts: boolean;
  passcode: string;
  isLogoutPopupOpen: boolean;
  gradientRenderer?: ChatBackgroundGradientRenderer;
};


const MAX_ATTEMPTS = 5;
const MAX_ATTEMPTS_TIMEOUT_SEC = 60;


const PasscodeLockScreen: Component<{
  onUnlock: () => void;
  fromLockIcon?: HTMLElement;
  onAnimationEnd?: () => void;
}> = (props) => {
  let container: HTMLDivElement;
  let passwordInputField: PasswordInputField;
  let passwordMonkeyContainer: HTMLDivElement;

  let attempts = 0;

  const {isMyPasscode, unlockWithPasscode} = usePasscodeActions();
  const {InputFieldTsx, PasswordInputField, apiManagerProxy} = useLockScreenHotReloadGuard();

  const store = createMutable<StateStore>({
    isMonkeyHidden: !!props.fromLockIcon,
    isError: false,
    tooManyAttempts: false,
    passcode: '',
    isLogoutPopupOpen: false
  });

  const [totalAccounts] = createResource(() => AccountController.getUnencryptedTotalAccounts());

  onMount(() => {
    attempts = 0;

    const lockIcon = props.fromLockIcon;
    if(lockIcon) (async() => {
      const lockIconRect = lockIcon.getBoundingClientRect();
      const rect = passwordMonkeyContainer.getBoundingClientRect();

      lockIcon.style.setProperty('--x', (rect.left + (rect.width / 2)) + 'px');
      lockIcon.style.setProperty('--y', (rect.top + (rect.height / 2)) + 'px');
      lockIcon.style.setProperty('--scale', (rect.width / lockIconRect.width) + '');
      lockIcon.classList.add('passcode-lock-screen__animated-lock-icon--shift-body')

      await pause(500);

      lockIcon.classList.add('passcode-lock-screen__animated-lock-icon--disappear')
      store.isMonkeyHidden = false;

      await pause(400);
      lockIcon.remove();
      props.onAnimationEnd?.();
    })();

    const listener = (e: KeyboardEvent) => {
      if(document.activeElement && document.activeElement.tagName === 'INPUT') return;
      focusInput(passwordInputField.input, e);
    };
    document.addEventListener('keydown', listener);
    onCleanup(() => {
      document.removeEventListener('keydown', listener);
    });
  });

  let cancelAnimation: () => void;

  function rotateBackgroundGradient() {
    cancelAnimation?.();

    if(store.gradientRenderer) {
      let progress = 0;
      cancelAnimation = animateValue(0, 1, 200, (p) => progress = p);
      store.gradientRenderer.toNextPosition(() => progress);
    }
  }

  const rotateBackgroundGradientThrottled = throttle(rotateBackgroundGradient, 100, true);

  createEffect(on(() => store.passcode, () => {
    rotateBackgroundGradientThrottled();

    store.isError = false;
    store.tooManyAttempts = false;
  }));

  onCleanup(() => {
    store.passcode = '';
    (passwordInputField.input as HTMLInputElement).value = '';
  });

  const canSubmit = () => !!store.passcode && store.passcode.length <= MAX_PASSCODE_LENGTH;

  const canAttempt = async() => {
    const settings = structuredClone(await commonStateStorage.get('settings', false));
    const canAttemptAgainOn = settings?.passcode?.canAttemptAgainOn;
    if(!canAttemptAgainOn) return true;

    if(canAttemptAgainOn > Date.now()) return false;

    store.tooManyAttempts = false;
    attempts = 0;
    settings.passcode.canAttemptAgainOn = null;
    commonStateStorage.set({settings});
    return true;
  };

  let isSubmiting = false;
  const onSubmit = async(e?: Event) => {
    e?.preventDefault();
    if(isSubmiting) return;

    isSubmiting = true;

    try {
      if(!(await canAttempt())) {
        store.tooManyAttempts = true;
      } else if(canSubmit() && await isMyPasscode(store.passcode)) {
        await unlockWithPasscode(store.passcode);
        props.onUnlock();
      } else {
        attempts ++;
        store.isError = true;
        if(attempts > MAX_ATTEMPTS) {
          store.tooManyAttempts = true;
          const settings = structuredClone(await commonStateStorage.get('settings', false));
          settings.passcode.canAttemptAgainOn = Date.now() + MAX_ATTEMPTS_TIMEOUT_SEC * 1000;
          await commonStateStorage.set({settings});
        }
      }
    } catch{
      store.isError = true;
    } finally {
      isSubmiting = false;
    }
  };

  const input = (
    <InputFieldTsx
      InputFieldClass={PasswordInputField}
      instanceRef={(value) => void (passwordInputField = value)}
      class={styles.Input}
      value={store.passcode}
      onRawInput={(value) => void (store.passcode = value)}
      label="PasscodeLock.EnterYourPasscode"
      errorLabel={
        store.tooManyAttempts ?
          'PasscodeLock.TooManyAttempts' :
          store.isError ?
            'PasscodeLock.WrongPasscode' :
            undefined
      }
      maxLength={MAX_PASSCODE_LENGTH}
    />
  );


  return (
    <div ref={container} class={styles.Container}>
      <Background gradientRendererRef={(value) => void(store.gradientRenderer = value)} />
      <div class={styles.Card}>
        <PasswordMonkeyTsx
          hidden={store.isMonkeyHidden}
          ref={passwordMonkeyContainer}
          passwordInputField={passwordInputField}
        />
        <Space amount="1.125rem" />
        <form action="" onSubmit={onSubmit}>
          {input}
          <Space amount="1rem" />
          <button
            type='button'
            onMouseDown={() => {
              onSubmit();
            }}
            class={`btn-primary btn-color-primary btn-large ${styles.SubmitButton}`}
            disabled={!store.passcode}
          >
            {i18n('PasscodeLock.Proceed')}
          </button>
          <button hidden style={{visibility: 'hidden', height: '0', width: '0'}} type='submit' />
        </form>
        <Space amount="1.625rem" />
        <div class={styles.Description}>
          {
            i18n(
              totalAccounts() > 1 ? // Gonna be `false` when undefined
                'PasscodeLock.ForgotPasscode.MultipleAccounts' :
                'PasscodeLock.ForgotPasscode.OneAccount',
              [
                <button
                  class={styles.LogoutButton}
                  onClick={() => {
                    store.isLogoutPopupOpen = true;
                  }}
                /> as HTMLButtonElement
              ]
            )
          }
        </div>
      </div>

      <SimplePopup
        visible={store.isLogoutPopupOpen}
        title={i18n('LogOut')}
        description={i18n('PasscodeLock.LogoutPopup.Description')}
        confirmButtonContent={i18n('LogOut')}
        onConfirm={() => {
          apiManagerProxy.invokeVoid('forceLogout', undefined);
          // store.isLogoutPopupOpen = false
        }}
        onClose={() => void(store.isLogoutPopupOpen = false)}
      />
    </div>
  );
};

export default PasscodeLockScreen;
