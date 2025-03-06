import {Component, createEffect, createResource, on, onCleanup, onMount} from 'solid-js';
import {createMutable} from 'solid-js/store';

import {logger} from '../../lib/logger';
import AccountController from '../../lib/accounts/accountController';
import {i18n} from '../../lib/langPack';
import {usePasscodeActions} from '../../lib/passcode/actions';
import {MAX_PASSCODE_LENGTH} from '../../lib/passcode/constants';
import pause from '../../helpers/schedulers/pause';

import ripple from '../ripple'; ripple; // keep
import Space from '../space';
import {InputFieldTsx} from '../inputFieldTsx';
import PasswordInputField from '../passwordInputField';

import Background from './background';
import PasswordMonkeyTsx from './passwordMonkeyTsx';

import styles from './passcodeLockScreen.module.scss';


type StateStore = {
  isMonkeyHidden: boolean;
  isError: boolean;
  passcode: string;
};

const log = logger('my-debug');


const PasscodeLockScreen: Component<{
  onUnlock: () => void;
  fromLockIcon?: HTMLElement;
}> = (props) => {
  let container: HTMLDivElement;
  let passwordInputField: PasswordInputField;
  let passwordMonkeyContainer: HTMLDivElement;

  const {isMyPasscode, unlockWithPasscode} = usePasscodeActions();

  const store = createMutable<StateStore>({
    isMonkeyHidden: !!props.fromLockIcon,
    isError: false,
    passcode: ''
  });

  const [totalAccounts] = createResource(() => AccountController.getUnencryptedTotalAccounts());

  onMount(() => {
    setTimeout(() => {
      passwordInputField.input.focus();
    }, 500);

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
    })();
  });

  createEffect(on(() => store.passcode, () => {
    store.isError = false;
  }));

  onCleanup(() => {
    store.passcode = '';
    (passwordInputField.input as HTMLInputElement).value = '';
  });

  const canSubmit = () => !!store.passcode && store.passcode.length <= MAX_PASSCODE_LENGTH;

  const onSubmit = async(e: Event) => {
    e.preventDefault();

    if(canSubmit() && await isMyPasscode(store.passcode)) {
      await unlockWithPasscode(store.passcode);

      props.onUnlock();
    } else {
      store.isError = true;
    }
  };

  const input = (
    <InputFieldTsx
      InputFieldClass={PasswordInputField}
      instanceRef={(value) => void (passwordInputField = value)}

      value={store.passcode}
      onRawInput={value => void (store.passcode = value)}
      label="PasscodeLock.EnterYourPasscode"
      errorLabel={store.isError ? 'PasscodeLock.WrongPasscode' : undefined}
      maxLength={MAX_PASSCODE_LENGTH}
    />
  );

  return (
    <div ref={container} class={styles.Container}>
      <Background />
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
            use:ripple
            type="submit"
            class="btn-primary btn-color-primary btn-large"
            disabled={!store.passcode}
          >
            {i18n('DeleteProceedBtn')}
          </button>
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
                /> as HTMLButtonElement
              ]
            )
          }
        </div>
      </div>
    </div>
  );
};

export default PasscodeLockScreen;
