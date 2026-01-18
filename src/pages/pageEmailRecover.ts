/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {AccountSentEmailCode} from '@layer';
import Page from '@/pages/page';
import CodeInputFieldCompat from '@components/codeInputField';
import I18n, {i18n} from '@lib/langPack';
import replaceContent from '@helpers/dom/replaceContent';
import rootScope from '@lib/rootScope';
import lottieLoader from '@lib/rlottie/lottieLoader';
import RLottiePlayer from '@lib/rlottie/rlottiePlayer';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {fastRaf} from '@helpers/schedulers';
import {wrapEmailPattern} from '@components/popups/emailSetup';
import mediaSizes from '@helpers/mediaSizes';
import LoginPage from '@/pages/loginPage';
import Button from '@components/button';
import pagePassword from '@/pages/pagePassword';

let subtitleElement: I18n.IntlElement;
let codeInputField: CodeInputFieldCompat;
let codeInputErrorLabel: HTMLElement;
let player: RLottiePlayer;

const cleanup = () => {
  setTimeout(() => {
    player?.remove();
    codeInputField?.cleanup()
  }, 300);
};

const onFirstMount = () => {
  const page = new LoginPage({
    className: 'page-emailRecover',
    withInputWrapper: true,
    titleLangKey: 'Login.ResetPassword.Title'
  });

  const size = mediaSizes.isMobile ? 100 : 166;
  lottieLoader.loadAnimationAsAsset({
    container: page.imageDiv,
    loop: false,
    autoplay: true,
    width: size,
    height: size
  }, 'Mailbox').then((animation) => {
    player = animation;
    return lottieLoader.waitForFirstFrame(animation);
  })

  subtitleElement ??= new I18n.IntlElement();
  page.subtitle.appendChild(subtitleElement.element);

  codeInputField = new CodeInputFieldCompat({
    length: 6,
    onChange: () => {
      codeInputField.error = false;
      replaceContent(codeInputErrorLabel, '');
    },
    onFill: (code) => {
      rootScope.managers.passwordManager.confirmPasswordResetEmail(code).then((res) => {
        import('./pageIm').then((m) => {
          m.default.mount();
        });
        cleanup();
      }).catch((err: ApiError) => {
        codeInputField.error = true;
        codeInputField.value = '';

        if(err.type === 'CODE_INVALID') {
          replaceContent(codeInputErrorLabel, i18n('PHONE_CODE_INVALID'));
        } else {
          console.log('error', err);
          replaceContent(codeInputErrorLabel, i18n('Error.AnError'));
        }
      });
    }
  });
  codeInputErrorLabel = document.createElement('div');
  codeInputErrorLabel.classList.add('error-label');

  const cancelBtn = Button('btn-primary btn-secondary btn-primary-transparent primary');
  cancelBtn.append(i18n('Login.ResetPassword.Cancel'));
  attachClickEvent(cancelBtn, () => {
    pagePassword.mount()
  });

  page.inputWrapper.append(codeInputField.container, codeInputErrorLabel, cancelBtn);
};


const page = new Page('page-emailRecover', true, onFirstMount, (sentCode: AccountSentEmailCode) => {
  subtitleElement ??= new I18n.IntlElement();
  subtitleElement.update({
    key: 'Login.ResetPassword.Subtitle',
    args: [wrapEmailPattern(sentCode.email_pattern)]
  })
}, () => {
  player?.playOrRestart();
  fastRaf(() => {
    codeInputField?.input.focus();
  })
});

export default page;
