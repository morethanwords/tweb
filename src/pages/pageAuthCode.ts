/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import mediaSizes from '@helpers/mediaSizes';
import {AuthSentCode, AuthSentCodeType, AuthSignIn} from '@layer';
import Page from '@/pages/page';
import pageSignIn from '@/pages/pageSignIn';
import TrackingMonkey from '@components/monkeys/tracking';
import CodeInputFieldCompat from '@components/codeInputField';
import {i18n, LangPackKey} from '@lib/langPack';
import replaceContent from '@helpers/dom/replaceContent';
import rootScope from '@lib/rootScope';
import lottieLoader from '@lib/rlottie/lottieLoader';
import RLottiePlayer from '@lib/rlottie/rlottiePlayer';
import setBlankToAnchor from '@lib/richTextProcessor/setBlankToAnchor';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import Icon from '@components/icon';
import {fastRaf} from '@helpers/schedulers';
import {wrapEmailPattern} from '@components/popups/emailSetup';
import anchorCallback from '@helpers/dom/anchorCallback';
import tsNow from '@helpers/tsNow';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import formatDuration from '@helpers/formatDuration';
import {SimpleConfirmationPopup} from '@/pages/loginPage';
import {toastNew} from '@components/toast';
import ctx from '@environment/ctx';

let authSentCode: AuthSentCode.authSentCode = null;

let headerElement: HTMLHeadElement = null;
let sentTypeElement: HTMLParagraphElement = null;
let codeInputField: CodeInputFieldCompat;
let codeInputErrorLabel: HTMLElement;
let resetEmailElement: HTMLDivElement, resetEmailTimer: number;
let monkey: TrackingMonkey, player: RLottiePlayer;

const cleanup = () => {
  setTimeout(() => {
    monkey?.remove();
    player?.remove();
    codeInputField?.cleanup()
    if(resetEmailTimer) clearTimeout(resetEmailTimer);
  }, 300);
};

const submitCode = (code: string) => {
  codeInputField.disabled = true;

  const params: AuthSignIn = {
    phone_number: authSentCode.phone_number,
    phone_code_hash: authSentCode.phone_code_hash,
    phone_code: code
  };

  // console.log('invoking auth.signIn with params:', params);

  rootScope.managers.apiManager.invokeApi('auth.signIn', params, {ignoreErrors: true})
  .then(async(response) => {
    // console.log('auth.signIn response:', response);

    switch(response._) {
      case 'auth.authorization':
        await rootScope.managers.apiManager.setUser(response.user);

        import('./pageIm').then((m) => {
          m.default.mount();
        });
        cleanup();
        break;
      case 'auth.authorizationSignUpRequired':
        // console.log('Registration needed!');

        import('./pageSignUp').then((m) => {
          m.default.mount({
            'phone_number': authSentCode.phone_number,
            'phone_code_hash': authSentCode.phone_code_hash
          });
        });

        cleanup();
        break;
      /* default:
        codeInput.innerText = response._;
        break; */
    }
  }).catch(async(err) => {
    let good = false;
    switch(err.type) {
      case 'SESSION_PASSWORD_NEEDED':
        // console.warn('pageAuthCode: SESSION_PASSWORD_NEEDED');
        good = true;
        await (await import('./pagePassword')).default.mount(); // lol
        setTimeout(() => {
          codeInputField.value = '';
        }, 300);
        break;
      case 'PHONE_CODE_EXPIRED':
        codeInputField.error = true;
        replaceContent(codeInputErrorLabel, i18n('PHONE_CODE_EXPIRED'));
        break;
      case 'PHONE_CODE_EMPTY':
      case 'PHONE_CODE_INVALID':
        codeInputField.error = true;
        replaceContent(codeInputErrorLabel, i18n('PHONE_CODE_INVALID'));
        break;
      default:
        codeInputField.error = true;
        replaceContent(codeInputErrorLabel, err.type);
        break;
    }

    codeInputField.disabled = false;

    if(!good) {
      codeInputField.value = '';
      fastRaf(() => {
        codeInputField.input.focus();
      });
    }
  });
};

const onFirstMount = () => {
  const inputWrapper = page.pageEl.querySelector('.input-wrapper') as HTMLDivElement;
  inputWrapper.append(codeInputField.container);

  codeInputErrorLabel = document.createElement('div');
  codeInputErrorLabel.classList.add('error-label');
  inputWrapper.append(codeInputErrorLabel);

  const editButton = page.pageEl.querySelector('.phone-edit') as HTMLElement;
  editButton.append(Icon('edit'));
  attachClickEvent(editButton, () => {
    return pageSignIn.mount();
  });

  inputWrapper.append(resetEmailElement);
};

const getAnimation = () => {
  const imageDiv = page.pageEl.querySelector('.auth-image') as HTMLDivElement;
  const size = mediaSizes.isMobile ? 100 : 166;
  if(authSentCode.type._ === 'auth.sentCodeTypeFragmentSms') {
    if(imageDiv.firstElementChild) {
      monkey?.remove();
      monkey = undefined;
      imageDiv.replaceChildren();
    }

    const container = document.createElement('div');
    container.classList.add('media-sticker-wrapper');
    imageDiv.append(container);
    return lottieLoader.loadAnimationAsAsset({
      container: container,
      loop: true,
      autoplay: true,
      width: size,
      height: size
    }, 'jolly_roger').then((animation) => {
      player = animation;
      return lottieLoader.waitForFirstFrame(animation);
    }).then(() => {});
  } else {
    if(imageDiv.firstElementChild) {
      player?.remove();
      player = undefined;
      imageDiv.replaceChildren();
    }

    monkey = new TrackingMonkey(codeInputField, size);
    imageDiv.append(monkey.container);
    return monkey.load();
  }
};

const handleResetEmail = () => {
  rootScope.managers.apiManager.invokeApi('auth.resetLoginEmail', {
    phone_number: authSentCode.phone_number,
    phone_code_hash: authSentCode.phone_code_hash
  }).then((code) => {
    if(code._ === 'auth.sentCode') {
      code.phone_number = authSentCode.phone_number;
      authSentCode = code;
      if(code.type._ === 'auth.sentCodeTypeEmailCode') {
        updatePendingEmail(code.type);
      } else {
        render();
      }
    } else {
      console.error(code);
      toastNew({langPackKey: 'Error.AnError'});
    }
  }).catch((err: ApiError) => {
    if(err.type.includes('TASK_ALREADY_EXISTS')) {
      SimpleConfirmationPopup.show({
        titleLangKey: 'Login.ResetEmail.NeedPremium',
        descriptionLangKey: 'Login.ResetEmail.NeedPremiumText',
        button: {
          langKey: 'OK'
        }
      })
    } else {
      console.error(err);
      toastNew({langPackKey: 'Error.AnError'});
    }
  })
}

const updatePendingEmail = (code: AuthSentCodeType.authSentCodeTypeEmailCode) => {
  if(resetEmailTimer) clearTimeout(resetEmailTimer);

  if(code.reset_pending_date != null) {
    const diff = code.reset_pending_date - tsNow(true);
    if(diff <= 0 || code.reset_pending_date <= 0) {
      resetEmailElement.replaceChildren(i18n('Login.ResetEmail.PleaseWait'));
      handleResetEmail();
      return
    }

    resetEmailElement.replaceChildren(i18n('Login.ResetEmail.Pending', [
      wrapFormattedDuration(formatDuration(diff, 2)),
      anchorCallback(handleResetEmail)
    ]));
    resetEmailTimer = ctx.setTimeout(() => updatePendingEmail(code), 30_000);
    return;
  }

  if(code.reset_available_period != null) {
    resetEmailElement.replaceChildren(i18n('TroubleEmail', [
      anchorCallback(() => {
        SimpleConfirmationPopup.show({
          titleLangKey: 'Login.ResetEmail.Title',
          descriptionLangKey: 'Login.ResetEmail.Text',
          descriptionArgs: [wrapFormattedDuration(formatDuration(code.reset_available_period, 2))],
          button: {
            langKey: 'Login.ResetEmail.Title'
          }
        }).then(() => {
          handleResetEmail();
        })
      })
    ]));
  }
}

const render = () => {
  if(!headerElement) {
    headerElement = page.pageEl.getElementsByClassName('phone')[0] as HTMLHeadElement;
    sentTypeElement = page.pageEl.getElementsByClassName('sent-type')[0] as HTMLParagraphElement;
  } else {
    codeInputField.value = '';
  }

  const CODE_LENGTH = (authSentCode.type as AuthSentCodeType.authSentCodeTypeApp).length;
  if(!codeInputField) {
    codeInputField = new CodeInputFieldCompat({
      length: CODE_LENGTH,
      onChange: (code) => {
        codeInputField.error = false;
        replaceContent(codeInputErrorLabel, '');
      },
      onFill: (code) => {
        submitCode(code);
      }
    });
  }

  codeInputField.options.length = CODE_LENGTH;

  headerElement.innerText = authSentCode.phone_number;
  if(!resetEmailElement) {
    resetEmailElement = document.createElement('div');
    resetEmailElement.classList.add('forgot-link');
  }
  resetEmailElement.innerHTML = '';
  if(resetEmailTimer) clearTimeout(resetEmailTimer);

  let key: LangPackKey, args: any[];
  const authSentCodeType = authSentCode.type;
  switch(authSentCodeType._) {
    case 'auth.sentCodeTypeSms':
      key = 'Login.Code.SentSms';
      break;
    case 'auth.sentCodeTypeApp':
      key = 'Login.Code.SentInApp';
      break;
    case 'auth.sentCodeTypeCall':
      key = 'Login.Code.SentCall';
      break;
    case 'auth.sentCodeTypeFragmentSms':
      key = 'PhoneNumber.Code.Fragment.Info';
      const a = document.createElement('a');
      setBlankToAnchor(a);
      a.href = authSentCodeType.url;
      args = [a];
      break;
    case 'auth.sentCodeTypeEmailCode':
      key = 'Login.Code.SentEmail';
      args = [wrapEmailPattern(authSentCodeType.email_pattern)];
      updatePendingEmail(authSentCodeType);
      break;
    default:
      key = 'Login.Code.SentUnknown';
      args = [authSentCodeType._];
      break;
  }

  replaceContent(sentTypeElement, i18n(key, args));

  rootScope.managers.appStateManager.pushToState('authState', {_: 'authStateAuthCode', sentCode: authSentCode});

  return getAnimation().catch(() => {});
}

const page = new Page('page-authCode', true, onFirstMount, (_authCode: typeof authSentCode) => {
  authSentCode = _authCode;
  render()
}, () => {
  fastRaf(() => {
    codeInputField?.input.focus();
  })
});

export default page;
