/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {AccountPassword} from '../../../../layer';
import Button from '../../../button';
import {SliderSuperTab} from '../../../slider';
import AppTwoStepVerificationSetTab from './passwordSet';
import CodeInputFieldCompat from '../../../codeInputField';
import AppTwoStepVerificationEmailTab from './email';
import {putPreloader} from '../../../putPreloader';
import {i18n, _i18n} from '../../../../lib/langPack';
import {canFocus} from '../../../../helpers/dom/canFocus';
import {attachClickEvent} from '../../../../helpers/dom/clickEvent';
import replaceContent from '../../../../helpers/dom/replaceContent';
import toggleDisability from '../../../../helpers/dom/toggleDisability';
import wrapStickerEmoji from '../../../wrappers/stickerEmoji';
import SettingSection from '../../../settingSection';
import lottieLoader from '../../../../lib/rlottie/lottieLoader';


type ConstructorArgs = {
  justSetPasssword?: boolean;
};

export default class AppTwoStepVerificationEmailConfirmationTab extends SliderSuperTab {
  public codeInputField: CodeInputFieldCompat;
  public errorLabel: HTMLElement;
  public state: AccountPassword;
  public email: string;
  public length: number;
  public isFirst = false;

  public init({justSetPasssword = false}: ConstructorArgs = {}) {
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

        this.managers.passwordManager.confirmPasswordEmail('' + code)
        .then((value) => {
          if(!value) {

          }

          goNext();
        })
        .catch((err) => {
          switch(err.type) {
            case 'CODE_INVALID':
              inputField.error = true;
              this.errorLabel.classList.remove('hidden');
              replaceContent(this.errorLabel, i18n('TwoStepAuth.RecoveryCodeInvalid'));
              break;

            case 'EMAIL_HASH_EXPIRED':
              inputField.error = true;
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

    const btnChange = Button('btn-primary btn-primary-transparent primary', {text: 'TwoStepAuth.EmailCodeChangeEmail'});
    const btnResend = Button('btn-primary btn-secondary btn-primary-transparent primary', {text: 'ResendCode'});

    const goNext = () => {
      this.slider.createTab(AppTwoStepVerificationSetTab).open({messageFor: justSetPasssword ? 'password' : 'email'});
    };

    const freeze = (disable: boolean) => {
      toggleDisability([btnChange, btnResend], disable);
      inputField.disabled = disable;
    };

    attachClickEvent(btnChange, (e) => {
      freeze(true);
      this.managers.passwordManager.cancelPasswordEmail().then((value) => {
        this.slider.sliceTabsUntilTab(AppTwoStepVerificationEmailTab, this);
        this.close();
      }, () => {
        freeze(false);
      });
    });

    attachClickEvent(btnResend, (e) => {
      freeze(true);
      const d = putPreloader(btnResend);
      this.managers.passwordManager.resendPasswordEmail().then((value) => {
        d.remove();
        freeze(false);
      });
    });

    inputWrapper.append(inputField.container, this.errorLabel, btnChange, btnResend);

    inputContent.append(inputWrapper);

    this.scrollable.append(section.container);
  }

  onOpenAfterTimeout() {
    if(!canFocus(this.isFirst)) return;
    this.codeInputField.input.focus();
  }

  onCloseAfterTimeout() {
    super.onCloseAfterTimeout();
    this.codeInputField.cleanup()
  }
}
