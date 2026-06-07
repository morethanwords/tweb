import {Component, onMount, Show} from 'solid-js';
import Button from '@components/buttonTsx';
import PopupElement from '@components/popups';
import PopupPeer from '@components/popups/peer';
import Section from '@components/section';
import wrapStickerEmoji from '@components/wrappers/stickerEmoji';
import {AppSettingsTab} from '@components/solidJsTabs';
import {AppTwoStepVerificationEmailTab, AppTwoStepVerificationEnterPasswordTab} from '@components/solidJsTabs/tabs';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppTwoStepVerificationTab} from '@components/solidJsTabs/tabs';

const TwoStepVerification: Component = () => {
  const [tab] = useSuperTab<typeof AppTwoStepVerificationTab>();
  const {state, plainPassword} = tab.payload;

  const stickerContainer = document.createElement('div');
  wrapStickerEmoji({
    div: stickerContainer,
    width: 168,
    height: 168,
    emoji: '🔐'
  });

  onMount(() => {
    tab.container.classList.add('two-step-verification', 'two-step-verification-main');
  });

  const onDisablePassword = () => {
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
  };

  return (
    <Section
      caption={state.pFlags.has_password ? 'TwoStepAuth.GenericHelp' : 'TwoStepAuth.SetPasswordHelp'}
      captionOld
      noDelimiter
    >
      {stickerContainer}
      <Show
        when={state.pFlags.has_password}
        fallback={
          <div class="input-wrapper">
            <Button
              primaryFilled
              text="TwoStepVerificationSetPassword"
              onClick={() => tab.slider.createTab(AppTwoStepVerificationEnterPasswordTab).open({state})}
            />
          </div>
        }
      >
        <Button
          class="btn-primary btn-transparent"
          icon="edit"
          text="TwoStepAuth.ChangePassword"
          onClick={() => tab.slider.createTab(AppTwoStepVerificationEnterPasswordTab).open({state, plainPassword})}
        />
        <Button
          class="btn-primary btn-transparent"
          icon="passwordoff"
          text="TwoStepAuth.RemovePassword"
          onClick={onDisablePassword}
        />
        <Button
          class="btn-primary btn-transparent"
          icon="email"
          text={state.pFlags.has_recovery ? 'TwoStepAuth.ChangeEmail' : 'TwoStepAuth.SetupEmail'}
          onClick={() => tab.slider.createTab(AppTwoStepVerificationEmailTab).open({
            state,
            hint: state.hint,
            plainPassword,
            newPassword: plainPassword,
            isFirst: true
          })}
        />
      </Show>
    </Section>
  );
};

export default TwoStepVerification;
