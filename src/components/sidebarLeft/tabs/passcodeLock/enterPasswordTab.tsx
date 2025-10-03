import {createEffect, createSignal, onCleanup} from 'solid-js';

import {MAX_PASSCODE_LENGTH} from '../../../../lib/passcode/constants';
import {usePasscodeActions} from '../../../../lib/passcode/actions';

import Section from '../../../section';
import {InputFieldTsx} from '../../../inputFieldTsx';
import Space from '../../../space';
import {i18n} from '../../../../lib/langPack';
import ripple from '../../../ripple'; ripple; // keep
import PasswordInputField from '../../../passwordInputField';
import {useSuperTab} from '../../../solidJsTabs/superTabProvider';
import type {AppPasscodeEnterPasswordTab} from '../../../solidJsTabs';

import LottieAnimation from './lottieAnimation';

import commonStyles from './common.module.scss';


type AppPasscodeEnterPasswordTabClass = typeof AppPasscodeEnterPasswordTab;

const EnterPasswordTab = () => {
  const [tab] = useSuperTab<AppPasscodeEnterPasswordTabClass>();
  const actions = usePasscodeActions();

  let inputField: PasswordInputField;

  const [value, setValue] = createSignal('');
  const [isError, setIsError] = createSignal(false);

  createEffect(() => {
    value();
    setIsError(false);
  });

  setTimeout(() => {
    inputField.input.focus();
  }, 400); // Smaller timeout will make the tab animation jerky

  onCleanup(() => {
    // Just in case
    setValue('');
    (inputField.input as HTMLInputElement).value = '';
  });

  const canSubmit = () => value() && value().length <= MAX_PASSCODE_LENGTH;

  let isSubmitting = false;
  async function onSubmit(e: Event) {
    e.preventDefault();

    if(!canSubmit() || isSubmitting) return;
    isSubmitting = true;

    try {
      await tab.payload.onSubmit(value(), tab, actions);
    } catch{
      setIsError(true);
    } finally {
      isSubmitting = false;
    }
  }

  return (
    <Section caption="PasscodeLock.Notice">
      <LottieAnimation name="UtyanPasscode" />

      <Space amount="1.125rem" />

      <form
        action=""
        autocomplete="off"
        onSubmit={onSubmit}
      >
        <div class={commonStyles.AdditionalPadding}>
          <InputFieldTsx
            InputFieldClass={PasswordInputField}
            instanceRef={(ref) => void (inputField = ref)}
            maxLength={MAX_PASSCODE_LENGTH}
            autocomplete="off"
            value={value()}
            errorLabel={isError() ? 'PasscodeLock.PasscodesDontMatch' : undefined}
            label={tab.payload.inputLabel}
            onRawInput={setValue}
          />
        </div>

        <Space amount="1rem" />

        <div class={commonStyles.AdditionalPadding}>
          <button
            use:ripple
            type="submit"
            class="btn-primary btn-color-primary btn-large"
            disabled={!canSubmit()}
          >
            {i18n(tab.payload.buttonText)}
          </button>
        </div>
      </form>

      <Space amount="1rem" />
    </Section>
  );
};

export default EnterPasswordTab;
