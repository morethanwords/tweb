import {Component} from 'solid-js';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {i18n} from '@lib/langPack';
import Button from '@components/button';
import SettingSection from '@components/settingSection';
import wrapStickerEmoji from '@components/wrappers/stickerEmoji';
import {AppSettingsTab} from '@components/solidJsTabs';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppTwoStepVerificationSetTab} from '@components/solidJsTabs/tabs';

const TwoStepVerificationSet: Component = () => {
  const [tab] = useSuperTab<typeof AppTwoStepVerificationSetTab>();
  const {messageFor} = tab.payload;

  tab.container.classList.add('two-step-verification', 'two-step-verification-set');
  tab.title.replaceChildren(i18n(messageFor === 'password' ? 'TwoStepVerificationPasswordSet' : 'TwoStepVerificationEmailSet'));

  const section = new SettingSection({
    captionOld: messageFor === 'password' ? 'TwoStepVerificationPasswordSetInfo' : 'TwoStepVerificationEmailSetInfo',
    noDelimiter: true
  });

  const emoji = '🥳';
  const stickerContainer = document.createElement('div');

  wrapStickerEmoji({
    emoji,
    div: stickerContainer,
    width: 160,
    height: 160
  });

  section.content.append(stickerContainer);

  const inputContent = section.generateContentElement();

  const inputWrapper = document.createElement('div');
  inputWrapper.classList.add('input-wrapper');

  const btnReturn = Button('btn-primary btn-color-primary', {text: 'TwoStepVerificationPasswordReturnSettings'});

  attachClickEvent(btnReturn, (e) => {
    tab.close();
  });

  tab.slider.sliceTabsUntilTab(AppSettingsTab, tab);

  inputWrapper.append(btnReturn);

  inputContent.append(inputWrapper);

  tab.scrollable.append(section.container);

  return null;
};

export default TwoStepVerificationSet;
