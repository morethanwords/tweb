import {Component, createEffect, createResource, on, onMount} from 'solid-js';
import {createMutable} from 'solid-js/store';

import {logger} from '../../lib/logger';
import AccountController from '../../lib/accounts/accountController';
import {i18n} from '../../lib/langPack';
import mediaSizes, {ScreenSize} from '../../helpers/mediaSizes';
import {usePasscodeActions} from '../../lib/passcode/actions';
import {MAX_PASSCODE_LENGTH} from '../../lib/passcode/constants';

import ripple from '../ripple'; ripple; // keep
import Space from '../space';
import {InputFieldTsx} from '../inputFieldTsx';
import PasswordInputField from '../passwordInputField';

import Background from './background';
import PasswordMonkeyTsx from './passwordMonkeyTsx';

import styles from './passcodeLockScreen.module.scss';


type StateStore = {
  isMobile: boolean;
  isError: boolean;
  passcode: string;
};

const log = logger('my-debug');


const PasscodeLockScreen: Component<{
  onUnlock: () => void;
}> = (props) => {
  let container: HTMLDivElement;
  let passwordInputField: PasswordInputField;

  const {isMyPasscode, unlockWithPasscode} = usePasscodeActions();

  const store = createMutable<StateStore>({
    isMobile: mediaSizes.activeScreen === ScreenSize.mobile,
    isError: false,
    passcode: ''
  });

  // const [totalAccounts] = createResource(() => AccountController.getTotalAccounts());
  const [totalAccounts] = [() => 1];

  onMount(() => {
    setTimeout(() => {
      passwordInputField.input.focus();
    }, 500);
  });

  createEffect(on(() => store.passcode, () => {
    store.isError = false;
  }));

  const canSubmit = () => !!store.passcode && store.passcode.length <= MAX_PASSCODE_LENGTH;

  const onSubmit = async(e: Event) => {
    e.preventDefault();

    if(canSubmit() && await isMyPasscode(store.passcode)) {
      await unlockWithPasscode(store.passcode);
      store.passcode = '';

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
