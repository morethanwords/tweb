/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import mediaSizes from '../helpers/mediaSizes';
import { AuthSentCode, AuthSentCodeType, AuthSignIn } from '../layer';
import Page from './page';
import pageSignIn from './pageSignIn';
import TrackingMonkey from '../components/monkeys/tracking';
import CodeInputField from '../components/codeInputField';
import { i18n, LangPackKey } from '../lib/langPack';
import { randomLong } from '../helpers/random';
import replaceContent from '../helpers/dom/replaceContent';
import rootScope from '../lib/rootScope';

let authCode: AuthSentCode.authSentCode = null;

let headerElement: HTMLHeadElement = null;
let sentTypeElement: HTMLParagraphElement = null;
let codeInput: HTMLInputElement;

let onFirstMount = (): Promise<any> => {
  const CODELENGTH = (authCode.type as AuthSentCodeType.authSentCodeTypeApp).length;

  const codeInputField = new CodeInputField({
    label: 'Code',
    name: randomLong(),
    length: CODELENGTH,
    onFill: (code) => {
      submitCode(code);
    }
  });

  codeInput = codeInputField.input as HTMLInputElement;

  page.pageEl.querySelector('.input-wrapper').append(codeInputField.container);

  const editButton = page.pageEl.querySelector('.phone-edit') as HTMLElement;

  editButton.addEventListener('click', function() {
    return pageSignIn.mount();
  });

  const cleanup = () => {
    setTimeout(() => {
      monkey.remove();
    }, 300);
  };

  const submitCode = (code: string) => {
    codeInput.setAttribute('disabled', 'true');

    const params: AuthSignIn = {
      phone_number: authCode.phone_number,
      phone_code_hash: authCode.phone_code_hash,
      phone_code: code
    };

    //console.log('invoking auth.signIn with params:', params);

    rootScope.managers.apiManager.invokeApi('auth.signIn', params, {ignoreErrors: true})
    .then((response) => {
      //console.log('auth.signIn response:', response);
      
      switch(response._) {
        case 'auth.authorization':
          rootScope.managers.apiManager.setUser(response.user);

          import('./pageIm').then((m) => {
            m.default.mount();
          });
          cleanup();
          break;
        case 'auth.authorizationSignUpRequired':
          //console.log('Registration needed!');

          import('./pageSignUp').then((m) => {
            m.default.mount({
              'phone_number': authCode.phone_number,
              'phone_code_hash': authCode.phone_code_hash
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
          //console.warn('pageAuthCode: SESSION_PASSWORD_NEEDED');
          good = true;
          err.handled = true;
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

  const imageDiv = page.pageEl.querySelector('.auth-image') as HTMLDivElement;
  const size = mediaSizes.isMobile ? 100 : 166;
  const monkey = new TrackingMonkey(codeInputField, size);
  imageDiv.append(monkey.container);
  return monkey.load();
};

const page = new Page('page-authCode', true, onFirstMount, (_authCode: typeof authCode) => {
  authCode = _authCode;

  if(!headerElement) {
    headerElement = page.pageEl.getElementsByClassName('phone')[0] as HTMLHeadElement;
    sentTypeElement = page.pageEl.getElementsByClassName('sent-type')[0] as HTMLParagraphElement;
  } else {
    codeInput.value = '';

    const evt = document.createEvent('HTMLEvents');
    evt.initEvent('input', false, true);
    codeInput.dispatchEvent(evt);
  }

  headerElement.innerText = authCode.phone_number;
  let key: LangPackKey, args: any[];
  switch(authCode.type._) {
    case 'auth.sentCodeTypeSms':
      key = 'Login.Code.SentSms';
      break;
    case 'auth.sentCodeTypeApp': 
      key = 'Login.Code.SentInApp';
      break;
    case 'auth.sentCodeTypeCall': 
      key = 'Login.Code.SentCall';
      break;
    default:
      key = 'Login.Code.SentUnknown';
      args = [authCode.type._];
      break;
  }

  replaceContent(sentTypeElement, i18n(key, args));

  rootScope.managers.appStateManager.pushToState('authState', {_: 'authStateAuthCode', sentCode: _authCode});
}, () => {
  codeInput.focus();
});

export default page;
