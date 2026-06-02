import {Component, onMount} from 'solid-js';
import Button from '@components/buttonTsx';
import InputField from '@components/inputField';
import {InputFieldTsx} from '@components/inputFieldTsx';
import {putPreloader} from '@components/putPreloader';
import {AppTwoStepVerificationEmailConfirmationTab, AppTwoStepVerificationSetTab} from '@components/solidJsTabs/tabs';
import PopupPeer from '@components/popups/peer';
import cancelEvent from '@helpers/dom/cancelEvent';
import {canFocus} from '@helpers/dom/canFocus';
import matchEmail from '@lib/richTextProcessor/matchEmail';
import Section from '@components/section';
import PopupElement from '@components/popups';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type {AppTwoStepVerificationEmailTab} from '@components/solidJsTabs/tabs';

const TwoStepVerificationEmail: Component = () => {
  const [tab] = useSuperTab<typeof AppTwoStepVerificationEmailTab>();
  const {lottieLoader} = useHotReloadGuard();
  const {state, plainPassword, newPassword, hint} = tab.payload;
  const isFirst = tab.payload.isFirst ?? false;
  const justSetPasssword = tab.payload.justSetPasssword ?? false;

  let inputField!: InputField;
  let btnContinue!: HTMLButtonElement;
  let btnSkip!: HTMLButtonElement;

  const stickerContainer = document.createElement('div');
  stickerContainer.classList.add('media-sticker-wrapper');

  lottieLoader.loadAnimationAsAsset({
    container: stickerContainer,
    width: 160,
    height: 160,
    loop: false,
    autoplay: true
  }, 'LoveLetter');

  const toggleButtons = (freeze: boolean) => {
    if(freeze) {
      btnContinue.setAttribute('disabled', 'true');
      btnSkip.setAttribute('disabled', 'true');
    } else {
      btnContinue.removeAttribute('disabled');
      btnSkip.removeAttribute('disabled');
    }
  };

  const goNext = () => {
    tab.slider.createTab(AppTwoStepVerificationSetTab).open({messageFor: justSetPasssword ? 'password' : 'email'});
  };

  const onContinueClick = () => {
    const email = inputField.value.trim();
    const match = matchEmail(email);
    if(!match || match[0].length !== email.length) {
      inputField.input.classList.add('error');
      return;
    }

    toggleButtons(true);
    const d = putPreloader(btnContinue);

    tab.managers.passwordManager.updateSettings({
      hint: hint,
      currentPassword: plainPassword,
      newPassword: newPassword,
      email
    }).then((value) => {
      goNext();
    }, (err) => {
      if(err.type.includes('EMAIL_UNCONFIRMED')) {
        const symbols = +err.type.match(/^EMAIL_UNCONFIRMED_(\d+)/)[1];

        tab.slider.createTab(AppTwoStepVerificationEmailConfirmationTab).open({
          state,
          email,
          length: symbols,
          justSetPasssword
        });
      } else {
        console.log('password set error', err);
      }

      toggleButtons(false);
      d.remove();
    });
  };

  const onSkipClick = () => {
    const popup = PopupElement.createPopup(PopupPeer, 'popup-skip-email', {
      buttons: [{
        langKey: 'Cancel',
        isCancel: true
      }, {
        langKey: 'YourEmailSkip',
        callback: () => {
          toggleButtons(true);
          putPreloader(btnSkip);
          tab.managers.passwordManager.updateSettings({
            hint: hint,
            currentPassword: plainPassword,
            newPassword: newPassword,
            email: ''
          }).then(() => {
            goNext();
          }, (err) => {
            toggleButtons(false);
          });
        },
        isDanger: true
      }],
      titleLangKey: 'YourEmailSkipWarning',
      descriptionLangKey: 'YourEmailSkipWarningText'
    });

    popup.show();
  };

  onMount(() => {
    tab.container.classList.add('two-step-verification', 'two-step-verification-email');

    inputField.input.addEventListener('keypress', (e) => {
      if(e.key === 'Enter') {
        cancelEvent(e);
        return onContinueClick();
      }
    });
  });

  (tab as any)._onOpenAfterTimeout = () => {
    if(!canFocus(isFirst)) return;
    inputField.input.focus();
  };

  return (
    <Section captionOld noDelimiter>
      {stickerContainer}
      <div class="input-wrapper">
        <InputFieldTsx
          name="recovery-email"
          label="RecoveryEmail"
          plainText
          instanceRef={(ref) => inputField = ref}
          onRawInput={() => inputField.input.classList.remove('error')}
        />
        <Button ref={btnContinue} primaryFilled text="Continue" onClick={onContinueClick} />
        <Button ref={btnSkip} class="btn-primary btn-secondary btn-primary-transparent primary" text="YourEmailSkip" onClick={onSkipClick} />
      </div>
    </Section>
  );
};

export default TwoStepVerificationEmail;
