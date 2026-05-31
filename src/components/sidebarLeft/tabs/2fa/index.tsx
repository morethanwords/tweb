import {Component} from 'solid-js';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {_i18n, i18n} from '@lib/langPack';
import Button from '@components/button';
import PopupElement from '@components/popups';
import PopupPeer from '@components/popups/peer';
import SettingSection from '@components/settingSection';
import wrapStickerEmoji from '@components/wrappers/stickerEmoji';
import {AppSettingsTab} from '@components/solidJsTabs';
import {AppTwoStepVerificationEmailTab, AppTwoStepVerificationEnterPasswordTab} from '@components/solidJsTabs/tabs';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppTwoStepVerificationTab} from '@components/solidJsTabs/tabs';

const TwoStepVerification: Component = () => {
  const [tab] = useSuperTab<typeof AppTwoStepVerificationTab>();
  const {state, plainPassword} = tab.payload;

  tab.container.classList.add('two-step-verification', 'two-step-verification-main');
  tab.title.replaceChildren(i18n('TwoStepVerificationTitle'));

  const section = new SettingSection({
    captionOld: true,
    noDelimiter: true
  });

  const emoji = '🔐';
  const stickerContainer = document.createElement('div');

  wrapStickerEmoji({
    div: stickerContainer,
    width: 168,
    height: 168,
    emoji
  });

  section.content.append(stickerContainer);

  const c = section.generateContentElement();
  if(state.pFlags.has_password) {
    _i18n(section.caption, 'TwoStepAuth.GenericHelp');

    const btnChangePassword = Button('btn-primary btn-transparent', {icon: 'edit', text: 'TwoStepAuth.ChangePassword'});
    const btnDisablePassword = Button('btn-primary btn-transparent', {icon: 'passwordoff', text: 'TwoStepAuth.RemovePassword'});
    const btnSetRecoveryEmail = Button('btn-primary btn-transparent', {icon: 'email', text: state.pFlags.has_recovery ? 'TwoStepAuth.ChangeEmail' : 'TwoStepAuth.SetupEmail'});

    attachClickEvent(btnChangePassword, () => {
      tab.slider.createTab(AppTwoStepVerificationEnterPasswordTab).open({
        state,
        plainPassword
      });
    });

    attachClickEvent(btnDisablePassword, () => {
      const popup = PopupElement.createPopup(PopupPeer, 'popup-disable-password', {
        buttons: [{
          langKey: 'Disable',
          callback: () => {
            tab.managers.passwordManager.updateSettings({currentPassword: plainPassword}).then(() => {
              tab.slider.sliceTabsUntilTab(AppSettingsTab, tab);
              tab.close();
            });
          },
          isDanger: true
        }],
        titleLangKey: 'TurnPasswordOffQuestionTitle',
        descriptionLangKey: 'TurnPasswordOffQuestion'
      });

      popup.show();
    });

    attachClickEvent(btnSetRecoveryEmail, () => {
      tab.slider.createTab(AppTwoStepVerificationEmailTab).open({
        state,
        hint: state.hint,
        plainPassword,
        newPassword: plainPassword,
        isFirst: true
      });
    });

    c.append(btnChangePassword, btnDisablePassword, btnSetRecoveryEmail);
  } else {
    _i18n(section.caption, 'TwoStepAuth.SetPasswordHelp');

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    const btnSetPassword = Button('btn-primary btn-color-primary', {text: 'TwoStepVerificationSetPassword'});

    inputWrapper.append(btnSetPassword);
    c.append(inputWrapper);

    attachClickEvent(btnSetPassword, (e) => {
      tab.slider.createTab(AppTwoStepVerificationEnterPasswordTab).open({
        state
      });
    });
  }

  tab.scrollable.append(section.container);

  return null;
};

export default TwoStepVerification;
