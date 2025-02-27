import {createEffect, createSignal} from 'solid-js';

import Section from '../../../section';
import {InputFieldTsx} from '../../../inputFieldTsx';
import Space from '../../../space';
import {i18n} from '../../../../lib/langPack';
import ripple from '../../../ripple'; // keep
import PasswordInputField from '../../../passwordInputField';

import {useSuperTab} from './superTabProvider';
import LottieAnimation from './lottieAnimation';
import type {AppPasscodeEnterPasswordTab} from '.';

import commonStyles from './common.module.scss';

type AppPasscodeEnterPasswordTabClass = typeof AppPasscodeEnterPasswordTab;

const EnterPasswordTab = () => {
  const [tab, {AppPasscodeEnterPasswordTab}] = useSuperTab<AppPasscodeEnterPasswordTabClass>();

  const [value, setValue] = createSignal('');
  const [isError, setIsError] = createSignal(false);

  const isFirst = !tab.payload || !tab.payload.passcode;

  createEffect(() => {
    value();
    setIsError(false);
  });

  return (
    <Section caption="PasscodeLock.Notice">
      <LottieAnimation name="UtyanPasscode" />

      <Space amount="1.125rem" />

      <form
        action=""
        autocomplete="off"
        onSubmit={(e) => {
          e.preventDefault();

          if(!value()) return;

          if(isFirst) {
            tab.slider.createTab(AppPasscodeEnterPasswordTab)
            .open({passcode: value()});
          } else {
            if(tab.payload && value() !== tab.payload.passcode) {
              setIsError(true);
            } else {
            }
          }
        }}
      >
        <div class={commonStyles.AdditionalPadding}>
          <InputFieldTsx
            InputFieldClass={PasswordInputField}
            autocomplete="off"
            value={value()}
            errorLabel={isError() ? 'PasscodeLock.PasscodesDontMatch' : undefined}
            label={
              isFirst ?
                'PasscodeLock.EnterAPasscode' :
                'PasscodeLock.ReEnterPasscode'
            }
            onRawInput={setValue}
          />
        </div>

        <Space amount="1rem" />

        <div class={commonStyles.AdditionalPadding}>
          <button
            use:ripple
            type="submit"
            class="btn-primary btn-color-primary btn-large"
            disabled={!value()}
          >
            {i18n(isFirst ? 'PasscodeLock.Next' : 'PasscodeLock.SetPasscode')}
          </button>
        </div>
      </form>

      <Space amount="1rem" />
    </Section>
  );
};

export default EnterPasswordTab;
