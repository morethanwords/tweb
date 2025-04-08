/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import mediaSizes from '../helpers/mediaSizes';
import {AuthSentCode, AuthSentCodeType, AuthSignIn} from '../layer';
import Page from './page';
import pageSignIn from './pageSignIn';
import TrackingMonkey from '../components/monkeys/tracking';
import CodeInputField from '../components/codeInputField';
import {i18n, LangPackKey} from '../lib/langPack';
import {randomLong} from '../helpers/random';
import replaceContent from '../helpers/dom/replaceContent';
import rootScope from '../lib/rootScope';
import lottieLoader from '../lib/rlottie/lottieLoader';
import RLottiePlayer from '../lib/rlottie/rlottiePlayer';
import setBlankToAnchor from '../lib/richTextProcessor/setBlankToAnchor';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import Icon from '../components/icon';

let authSentCode: AuthSentCode.authSentCode = null;

let headerElement: HTMLHeadElement = null;
let sentTypeElement: HTMLParagraphElement = null;
let codeInput: HTMLInputElement, codeInputField: CodeInputField;
let monkey: TrackingMonkey, player: RLottiePlayer;

const cleanup = () => {
  setTimeout(() => {
    monkey?.remove();
    player?.remove();
  }, 300);
};

const submitCode = (code: string) => {
  codeInput.setAttribute('disabled', 'true');

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
          codeInput.value = '';
        }, 300);
        break;
      case 'PHONE_CODE_EXPIRED':
        codeInput.classList.add('error');
        replaceContent(codeInputField.label, i18n('PHONE_CODE_EXPIRED'));
        break;
      case 'PHONE_CODE_EMPTY':
      case 'PHONE_CODE_INVALID':
        codeInput.classList.add('error');
        replaceContent(codeInputField.label, i18n('PHONE_CODE_INVALID'));
        break;
      default:
        codeInputField.label.innerText = err.type;
        break;
    }

    if(!good) {
      codeInputField.select();
    }

    codeInput.removeAttribute('disabled');
  });
};

const onFirstMount = () => {
  page.pageEl.querySelector('.input-wrapper').append(codeInputField.container);

  const editButton = page.pageEl.querySelector('.phone-edit') as HTMLElement;
  editButton.append(Icon('edit'));
  attachClickEvent(editButton, () => {
    return pageSignIn.mount();
  });
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

const page = new Page('page-authCode', true, onFirstMount, (_authCode: typeof authSentCode) => {
  authSentCode = _authCode;

  if(!headerElement) {
    headerElement = page.pageEl.getElementsByClassName('phone')[0] as HTMLHeadElement;
    sentTypeElement = page.pageEl.getElementsByClassName('sent-type')[0] as HTMLParagraphElement;
  } else {
    codeInput.value = '';

    const evt = document.createEvent('HTMLEvents');
    evt.initEvent('input', false, true);
    codeInput.dispatchEvent(evt);
  }

  const CODE_LENGTH = (authSentCode.type as AuthSentCodeType.authSentCodeTypeApp).length;
  if(!codeInputField) {
    codeInputField = new CodeInputField({
      label: 'Code',
      name: randomLong(),
      length: CODE_LENGTH,
      onFill: (code) => {
        submitCode(code);
      }
    });

    codeInput = codeInputField.input as HTMLInputElement;
  }

  codeInputField.options.length = CODE_LENGTH;

  headerElement.innerText = authSentCode.phone_number;
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
    default:
      key = 'Login.Code.SentUnknown';
      args = [authSentCodeType._];
      break;
  }

  replaceContent(sentTypeElement, i18n(key, args));

  rootScope.managers.appStateManager.pushToState('authState', {_: 'authStateAuthCode', sentCode: _authCode});

  return getAnimation().catch(() => {});
}, () => {
  codeInput.focus();
});

export default page;
