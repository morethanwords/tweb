/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {putPreloader} from '../components/putPreloader';
import mediaSizes from '../helpers/mediaSizes';
import {AccountPassword} from '../layer';
import Page from './page';
import Button from '../components/button';
import PasswordInputField from '../components/passwordInputField';
import PasswordMonkey from '../components/monkeys/password';
import I18n from '../lib/langPack';
import LoginPage from './loginPage';
import cancelEvent from '../helpers/dom/cancelEvent';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import htmlToSpan from '../helpers/dom/htmlToSpan';
import replaceContent from '../helpers/dom/replaceContent';
import toggleDisability from '../helpers/dom/toggleDisability';
import wrapEmojiText from '../lib/richTextProcessor/wrapEmojiText';
import rootScope from '../lib/rootScope';

const TEST = false;
let passwordInput: HTMLInputElement;

const onFirstMount = (): Promise<any> => {
  const page = new LoginPage({
    className: 'page-password',
    withInputWrapper: true,
    titleLangKey: 'Login.Password.Title',
    subtitleLangKey: 'Login.Password.Subtitle'
  });

  const btnNext = Button('btn-primary btn-color-primary');
  const btnNextI18n = new I18n.IntlElement({key: 'Login.Next'});

  btnNext.append(btnNextI18n.element);

  const passwordInputField = new PasswordInputField({
    label: 'LoginPassword',
    name: 'password'
  });

  passwordInput = passwordInputField.input as HTMLInputElement;

  page.inputWrapper.append(passwordInputField.container, btnNext);

  let getStateInterval: number;

  const getState = () => {
    // * just to check session relevance
    if(!getStateInterval) {
      getStateInterval = window.setInterval(getState, 10e3);
    }

    return !TEST && rootScope.managers.passwordManager.getState().then((_state) => {
      state = _state;

      if(state.hint) {
        replaceContent(passwordInputField.label, htmlToSpan(wrapEmojiText(state.hint)));
      } else {
        passwordInputField.setLabel();
      }
    });
  };

  let state: AccountPassword;

  const onSubmit = (e?: Event) => {
    if(e) {
      cancelEvent(e);
    }

    if(!passwordInput.value.length) {
      passwordInput.classList.add('error');
      return;
    }

    const toggle = toggleDisability([passwordInput, btnNext], true);
    const value = passwordInput.value;

    btnNextI18n.update({key: 'PleaseWait'});
    const preloader = putPreloader(btnNext);

    passwordInputField.setValueSilently('' + Math.random()); // prevent saving suggestion
    passwordInputField.setValueSilently(value); // prevent saving suggestion

    rootScope.managers.passwordManager.check(value, state).then((response) => {
      // console.log('passwordManager response:', response);

      switch(response._) {
        case 'auth.authorization':
          clearInterval(getStateInterval);
          import('./pageIm').then((m) => {
            m.default.mount();
          });
          if(monkey) monkey.remove();
          break;
        default:
          btnNext.removeAttribute('disabled');
          btnNextI18n.update({key: response._ as any});
          preloader.remove();
          break;
      }
    }).catch((err: any) => {
      toggle();
      passwordInputField.input.classList.add('error');

      switch(err.type) {
        default:
          // btnNext.innerText = err.type;
          btnNextI18n.update({key: 'PASSWORD_HASH_INVALID'});
          passwordInput.select();
          break;
      }

      preloader.remove();

      getState();
    });
  };

  attachClickEvent(btnNext, onSubmit);

  passwordInput.addEventListener('keypress', function(this, e) {
    this.classList.remove('error');
    btnNextI18n.update({key: 'Login.Next'});

    if(e.key === 'Enter') {
      return onSubmit();
    }
  });

  const size = mediaSizes.isMobile ? 100 : 166;
  const monkey = new PasswordMonkey(passwordInputField, size);
  page.imageDiv.append(monkey.container);
  return Promise.all([
    monkey.load(),
    getState()
  ]);
};

const page = new Page('page-password', true, onFirstMount, null, () => {
  // if(!isAppleMobile) {
  passwordInput.focus();
  // }

  rootScope.managers.appStateManager.pushToState('authState', {_: 'authStatePassword'});
});

export default page;
