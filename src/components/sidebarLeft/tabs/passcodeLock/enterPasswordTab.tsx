import {createSignal} from 'solid-js';

import Section from '../../../section';
import {InputFieldTsx} from '../../../inputFieldTsx';
import Space from '../../../mediaEditor/space';
import {i18n} from '../../../../lib/langPack';
import ripple from '../../../ripple';
import PasswordInputField from '../../../passwordInputField';

import {useSuperTab} from './superTabProvider';
import {LottieAnimation} from './lottieAnimation';
import type {AppPasscodeEnterPasswordTab} from '.';


import commonStyles from './common.module.scss';

type AppPasscodeEnterPasswordTabClass = typeof AppPasscodeEnterPasswordTab;

const EnterPasswordTab = () => {
  const [value, setValue] = createSignal('');
  const [tab, {AppPasscodeEnterPasswordTab}] = useSuperTab<AppPasscodeEnterPasswordTabClass>();

  const isFirst = !tab.payload || !tab.payload.passcode;

  return (
    <Section caption="PasscodeLock.Notice">
      <LottieAnimation name="UtyanPasscode" />

      <Space amount="1.125rem" />

      <form action="" autocomplete="off" onSubmit={(e) => {
        e.preventDefault();

        if(!value()) return;

        tab.slider.createTab(AppPasscodeEnterPasswordTab)
        .open({passcode: value()});
      }}>
        <div class={commonStyles.LargeButtonWrapper}>
          <InputFieldTsx
            InputFieldClass={PasswordInputField}
            autocomplete="off"
            value={value()}
            label={isFirst ? 'PasscodeLock.EnterAPasscode' : 'PasscodeLock.ReEnterPasscode'}
            onRawInput={setValue}
          />
        </div>

        <Space amount="1rem" />

        <div class={commonStyles.LargeButtonWrapper}>
          <button
            use:ripple
            type="submit"
            class={`btn-primary btn-color-primary ${commonStyles.LargeButton}`}
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
