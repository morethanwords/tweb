import {Component} from 'solid-js';
import Button from '@components/button';
import CodeInputFieldCompat from '@components/codeInputField';
import {putPreloader} from '@components/putPreloader';
import {i18n, _i18n} from '@lib/langPack';
import {canFocus} from '@helpers/dom/canFocus';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import replaceContent from '@helpers/dom/replaceContent';
import toggleDisability from '@helpers/dom/toggleDisability';
import SettingSection from '@components/settingSection';
import {AppSettingsTab} from '@components/solidJsTabs';
import {AppTwoStepVerificationEmailTab, AppTwoStepVerificationSetTab} from '@components/solidJsTabs/tabs';
import {toastNew} from '@components/toast';
import {ForgotPasswordLink} from '@components/sidebarLeft/tabs/2fa/forgotPasswordLink';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type {AppTwoStepVerificationEmailConfirmationTab} from '@components/solidJsTabs/tabs';

const TwoStepVerificationEmailConfirmation: Component = () => {
  const [tab] = useSuperTab<typeof AppTwoStepVerificationEmailConfirmationTab>();
  const {lottieLoader} = useHotReloadGuard();
  const {state, email, length} = tab.payload;
  const isFirst = tab.payload.isFirst ?? false;
  const forPasswordReset = tab.payload.forPasswordReset ?? false;
  const justSetPasssword = tab.payload.justSetPasssword ?? false;

  let resetLink: ForgotPasswordLink;

  tab.container.classList.add('two-step-verification', 'two-step-verification-email-confirmation');
  tab.title.replaceChildren(i18n('TwoStepAuth.RecoveryTitle'));

  const section = new SettingSection({
    captionOld: true,
    noDelimiter: true
  });

  _i18n(section.caption, 'TwoStepAuth.ConfirmEmailCodeDesc', [email]);

  const stickerContainer = document.createElement('div');
  stickerContainer.classList.add('media-sticker-wrapper');

  lottieLoader.loadAnimationAsAsset({
    container: stickerContainer,
    width: 160,
    height: 160,
    loop: false,
    autoplay: true
  }, 'Mailbox');

  section.content.append(stickerContainer);

  const inputContent = section.generateContentElement();

  const inputWrapper = document.createElement('div');
  inputWrapper.classList.add('input-wrapper');

  const errorLabel = document.createElement('div');
  errorLabel.classList.add('error-label', 'hidden');

  const inputField = new CodeInputFieldCompat({
    length: length,
    onChange: (code) => {
      inputField.error = false;
      errorLabel.classList.add('hidden');
    },
    onFill: (code) => {
      freeze(true);

      const promise = forPasswordReset ?
      tab.managers.passwordManager.confirmPasswordResetEmail('' + code) :
        tab.managers.passwordManager.confirmPasswordEmail('' + code)

      promise.then((value) => {
        goNext();
      })
      .catch((err) => {
        switch(err.type) {
          case 'CODE_INVALID':
            inputField.error = true;
            inputField.value = ''
            errorLabel.classList.remove('hidden');
            replaceContent(errorLabel, i18n('TwoStepAuth.RecoveryCodeInvalid'));
            break;

          case 'EMAIL_HASH_EXPIRED':
            inputField.error = true;
            inputField.value = ''
            errorLabel.classList.remove('hidden');
            replaceContent(errorLabel, i18n('TwoStepAuth.RecoveryCodeExpired'));
            break;

          default:
            console.error('confirm error', err);
            break;
        }

        freeze(false);
      });
    }
  });

  const btnChange = forPasswordReset ? null : Button('btn-primary btn-primary-transparent primary', {text: 'TwoStepAuth.EmailCodeChangeEmail'});
  const btnResend = Button('btn-primary btn-secondary btn-primary-transparent primary', {text: 'ResendCode'});

  if(forPasswordReset) {
    resetLink = new ForgotPasswordLink({
      state: state,
      managers: tab.managers,
      tab: tab,
      allowReset: true,
      forEmail: true
    });
  }

  const goNext = () => {
    if(forPasswordReset) {
      toastNew({langPackKey: 'PasswordDeactivated'});
      tab.slider.sliceTabsUntilTab(AppSettingsTab, tab);
      tab.close();
    } else {
      tab.slider.createTab(AppTwoStepVerificationSetTab).open({messageFor: justSetPasssword ? 'password' : 'email'});
    }
  };

  const freeze = (disable: boolean) => {
    toggleDisability([btnChange, btnResend].filter(Boolean), disable);
    inputField.disabled = disable;
  };

  if(btnChange) {
    attachClickEvent(btnChange, (e) => {
      freeze(true);
      tab.managers.passwordManager.cancelPasswordEmail().then((value) => {
        tab.slider.sliceTabsUntilTab(AppTwoStepVerificationEmailTab, tab);
        tab.close();
      }, () => {
        freeze(false);
      });
    });
  }

  attachClickEvent(btnResend, (e) => {
    freeze(true);
    const d = putPreloader(btnResend);
    const promise = forPasswordReset ?
      tab.managers.passwordManager.requestRecovery() :
      tab.managers.passwordManager.resendPasswordEmail()

    promise.catch((err) => {
      console.error(err)
      toastNew({langPackKey: 'Error.AnError'});
    }).then(() => {
      d.remove();
      freeze(false);
    });
  });

  inputWrapper.append(inputField.container, errorLabel);
  if(btnChange) inputWrapper.append(btnChange);
  inputWrapper.append(btnResend);
  if(resetLink) inputWrapper.append(resetLink.container);

  inputContent.append(inputWrapper);

  tab.scrollable.append(section.container);

  (tab as any)._onOpenAfterTimeout = () => {
    if(!canFocus(isFirst)) return;
    inputField.input.focus();
  };

  (tab as any)._onCloseAfterTimeout = () => {
    inputField.cleanup();
    resetLink?.cleanup();
  };

  return null;
};

export default TwoStepVerificationEmailConfirmation;
