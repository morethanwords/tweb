/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {AccountPassword} from '@layer';
import Button from '@components/button';
import {SliderSuperTab} from '@components/slider';
import AppTwoStepVerificationSetTab from '@components/sidebarLeft/tabs/2fa/passwordSet';
import CodeInputFieldCompat from '@components/codeInputField';
import AppTwoStepVerificationEmailTab from '@components/sidebarLeft/tabs/2fa/email';
import {putPreloader} from '@components/putPreloader';
import {i18n, _i18n, FormatterArgument} from '@lib/langPack';
import {canFocus} from '@helpers/dom/canFocus';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import replaceContent from '@helpers/dom/replaceContent';
import toggleDisability from '@helpers/dom/toggleDisability';
import wrapStickerEmoji from '@components/wrappers/stickerEmoji';
import SettingSection from '@components/settingSection';
import lottieLoader from '@lib/rlottie/lottieLoader';
import AppSettingsTab from '@components/sidebarLeft/tabs/settings';
import {toastNew} from '@components/toast';
import {ForgotPasswordLink} from '@components/sidebarLeft/tabs/2fa/enterPassword';


type ConstructorArgs = {
  forPasswordReset?: boolean;
  justSetPasssword?: boolean;
};

export default class AppTwoStepVerificationEmailConfirmationTab extends SliderSuperTab {
  public codeInputField: CodeInputFieldCompat;
  public errorLabel: HTMLElement;
  public state: AccountPassword;
  public email: FormatterArgument;
  public length: number;
  public isFirst = false;

  private resetLink: ForgotPasswordLink;

  public init({forPasswordReset = false, justSetPasssword = false}: ConstructorArgs = {}) {
    this.container.classList.add('two-step-verification', 'two-step-verification-email-confirmation');
    this.setTitle('TwoStepAuth.RecoveryTitle');

    const section = new SettingSection({
      captionOld: true,
      noDelimiter: true
    });

    _i18n(section.caption, 'TwoStepAuth.ConfirmEmailCodeDesc', [this.email]);

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

    this.errorLabel = document.createElement('div');
    this.errorLabel.classList.add('error-label', 'hidden');

    const inputField = this.codeInputField = new CodeInputFieldCompat({
      length: this.length,
      onChange: (code) => {
        inputField.error = false;
        this.errorLabel.classList.add('hidden');
      },
      onFill: (code) => {
        freeze(true);

        const promise = forPasswordReset ?
        this.managers.passwordManager.confirmPasswordResetEmail('' + code) :
          this.managers.passwordManager.confirmPasswordEmail('' + code)

        promise.then((value) => {
          goNext();
        })
        .catch((err) => {
          switch(err.type) {
            case 'CODE_INVALID':
              inputField.error = true;
              inputField.value = ''
              this.errorLabel.classList.remove('hidden');
              replaceContent(this.errorLabel, i18n('TwoStepAuth.RecoveryCodeInvalid'));
              break;

            case 'EMAIL_HASH_EXPIRED':
              inputField.error = true;
              inputField.value = ''
              this.errorLabel.classList.remove('hidden');
              replaceContent(this.errorLabel, i18n('TwoStepAuth.RecoveryCodeExpired'));
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
      this.resetLink = new ForgotPasswordLink({
        state: this.state,
        managers: this.managers,
        tab: this,
        allowReset: true,
        forEmail: true
      });
    }

    const goNext = () => {
      if(forPasswordReset) {
        toastNew({langPackKey: 'PasswordDeactivated'});
        this.slider.sliceTabsUntilTab(AppSettingsTab, this);
        this.close();
      } else {
        this.slider.createTab(AppTwoStepVerificationSetTab).open({messageFor: justSetPasssword ? 'password' : 'email'});
      }
    };

    const freeze = (disable: boolean) => {
      toggleDisability([btnChange, btnResend].filter(Boolean), disable);
      inputField.disabled = disable;
    };

    if(btnChange) {
      attachClickEvent(btnChange, (e) => {
        freeze(true);
        this.managers.passwordManager.cancelPasswordEmail().then((value) => {
          this.slider.sliceTabsUntilTab(AppTwoStepVerificationEmailTab, this);
          this.close();
        }, () => {
          freeze(false);
        });
      });
    }

    attachClickEvent(btnResend, (e) => {
      freeze(true);
      const d = putPreloader(btnResend);
      const promise = forPasswordReset ?
        this.managers.passwordManager.requestRecovery() :
        this.managers.passwordManager.resendPasswordEmail()

      promise.catch((err) => {
        console.error(err)
        toastNew({langPackKey: 'Error.AnError'});
      }).then(() => {
        d.remove();
        freeze(false);
      });
    });

    inputWrapper.append(inputField.container, this.errorLabel);
    if(btnChange) inputWrapper.append(btnChange);
    inputWrapper.append(btnResend);
    if(this.resetLink) inputWrapper.append(this.resetLink.container);

    inputContent.append(inputWrapper);

    this.scrollable.append(section.container);
  }

  onOpenAfterTimeout() {
    if(!canFocus(this.isFirst)) return;
    this.codeInputField.input.focus();
  }

  onCloseAfterTimeout() {
    super.onCloseAfterTimeout();
    this.codeInputField.cleanup();
    this.resetLink?.cleanup();
  }
}
