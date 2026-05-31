import {Component} from 'solid-js';
import Button from '@components/button';
import InputField from '@components/inputField';
import {AppTwoStepVerificationEmailTab} from '@components/solidJsTabs/tabs';
import {i18n} from '@lib/langPack';
import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import wrapStickerEmoji from '@components/wrappers/stickerEmoji';
import SettingSection from '@components/settingSection';
import {toastNew} from '@components/toast';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppTwoStepVerificationHintTab} from '@components/solidJsTabs/tabs';

const TwoStepVerificationHint: Component = () => {
  const [tab] = useSuperTab<typeof AppTwoStepVerificationHintTab>();
  const {state, plainPassword, newPassword} = tab.payload;

  tab.container.classList.add('two-step-verification', 'two-step-verification-hint');
  tab.title.replaceChildren(i18n('TwoStepAuth.SetupHintTitle'));

  const section = new SettingSection({
    noDelimiter: true
  });

  const emoji = '💡';
  const stickerContainer = document.createElement('div');
  wrapStickerEmoji({
    div: stickerContainer,
    width: 160,
    height: 160,
    emoji
  });

  section.content.append(stickerContainer);

  const inputWrapper = document.createElement('div');
  inputWrapper.classList.add('input-wrapper');

  const inputField = new InputField({
    name: 'hint',
    label: 'TwoStepAuth.SetupHintPlaceholder'
  });

  inputField.input.addEventListener('keypress', (e) => {
    if(e.key === 'Enter') {
      cancelEvent(e);
      return inputField.value ? onContinueClick() : onSkipClick();
    }
  });

  const goNext = (e?: Event, saveHint?: boolean) => {
    if(e) {
      cancelEvent(e);
    }

    const hint = saveHint ? inputField.value : undefined;
    if(hint && newPassword === hint) {
      toastNew({langPackKey: 'PasswordAsHintError'});
      return;
    }

    tab.slider.createTab(AppTwoStepVerificationEmailTab).open({
      state,
      plainPassword,
      newPassword,
      hint,
      justSetPasssword: true
    });
  };

  const btnContinue = Button('btn-primary btn-color-primary', {text: 'Continue'});
  const btnSkip = Button('btn-primary btn-secondary btn-primary-transparent primary', {text: 'YourEmailSkip'});

  const onContinueClick = (e?: Event) => goNext(e, true);
  const onSkipClick = (e?: Event) => goNext(e, false);
  attachClickEvent(btnContinue, onContinueClick);
  attachClickEvent(btnSkip, onSkipClick);

  inputWrapper.append(inputField.container, btnContinue, btnSkip);

  section.content.append(inputWrapper);

  tab.scrollable.append(section.container);

  (tab as any)._onOpenAfterTimeout = () => {
    inputField.input.focus();
  };

  return null;
};

export default TwoStepVerificationHint;
