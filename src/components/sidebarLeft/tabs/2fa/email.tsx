import {Component} from 'solid-js';
import Button from '@components/button';
import InputField from '@components/inputField';
import {putPreloader} from '@components/putPreloader';
import {AppTwoStepVerificationEmailConfirmationTab, AppTwoStepVerificationSetTab} from '@components/solidJsTabs/tabs';
import PopupPeer from '@components/popups/peer';
import cancelEvent from '@helpers/dom/cancelEvent';
import {canFocus} from '@helpers/dom/canFocus';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import matchEmail from '@lib/richTextProcessor/matchEmail';
import {i18n} from '@lib/langPack';
import SettingSection from '@components/settingSection';
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

  tab.container.classList.add('two-step-verification', 'two-step-verification-email');
  tab.title.replaceChildren(i18n('RecoveryEmailTitle'));

  const section = new SettingSection({
    captionOld: true,
    noDelimiter: true
  });

  const stickerContainer = document.createElement('div');
  stickerContainer.classList.add('media-sticker-wrapper');

  lottieLoader.loadAnimationAsAsset({
    container: stickerContainer,
    width: 160,
    height: 160,
    loop: false,
    autoplay: true
  }, 'LoveLetter');

  section.content.append(stickerContainer);

  const inputContent = section.generateContentElement();

  const inputWrapper = document.createElement('div');
  inputWrapper.classList.add('input-wrapper');

  const inputField = new InputField({
    name: 'recovery-email',
    label: 'RecoveryEmail',
    plainText: true
  });

  inputField.input.addEventListener('keypress', (e) => {
    if(e.key === 'Enter') {
      cancelEvent(e);
      return onContinueClick();
    }
  });

  inputField.input.addEventListener('input', (e) => {
    inputField.input.classList.remove('error');
  });

  const btnContinue = Button('btn-primary btn-color-primary', {text: 'Continue'});
  const btnSkip = Button('btn-primary btn-secondary btn-primary-transparent primary', {text: 'YourEmailSkip'});

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
  attachClickEvent(btnContinue, onContinueClick);

  const toggleButtons = (freeze: boolean) => {
    if(freeze) {
      btnContinue.setAttribute('disabled', 'true');
      btnSkip.setAttribute('disabled', 'true');
    } else {
      btnContinue.removeAttribute('disabled');
      btnSkip.removeAttribute('disabled');
    }
  };

  attachClickEvent(btnSkip, (e) => {
    const popup = PopupElement.createPopup(PopupPeer, 'popup-skip-email', {
      buttons: [{
        langKey: 'Cancel',
        isCancel: true
      }, {
        langKey: 'YourEmailSkip',
        callback: () => {
          // inputContent.classList.add('sidebar-left-section-disabled');
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
  });

  inputWrapper.append(inputField.container, btnContinue, btnSkip);

  inputContent.append(inputWrapper);

  tab.scrollable.append(section.container);

  (tab as any)._onOpenAfterTimeout = () => {
    if(!canFocus(isFirst)) return;
    inputField.input.focus();
  };

  return null;
};

export default TwoStepVerificationEmail;
