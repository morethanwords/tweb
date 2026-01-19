/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {putPreloader} from '@components/putPreloader';
import mediaSizes from '@helpers/mediaSizes';
import {AccountPassword} from '@layer';
import Page from '@/pages/page';
import Button from '@components/button';
import PasswordInputField from '@components/passwordInputField';
import PasswordMonkey from '@components/monkeys/password';
import I18n, {i18n} from '@lib/langPack';
import LoginPage, {SimpleConfirmationPopup} from '@/pages/loginPage';
import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import htmlToSpan from '@helpers/dom/htmlToSpan';
import replaceContent from '@helpers/dom/replaceContent';
import toggleDisability from '@helpers/dom/toggleDisability';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import rootScope from '@lib/rootScope';
import anchorCallback from '@helpers/dom/anchorCallback';
import {toastNew} from '@components/toast';
import pageSignIn from '@/pages/pageSignIn';
import formatDuration from '@helpers/formatDuration';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';

const TEST = false;
let passwordInput: HTMLInputElement;
let monkey: PasswordMonkey;

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

  let resetLoading = false
  const resetLink = i18n('ForgotPassword', [
    anchorCallback(() => {
      if(resetLoading) return;
      resetLoading = true;

      rootScope.managers.passwordManager.requestRecovery().then((res) => {
        return import('./pageEmailRecover').then((m) => {
          m.default.mount({email_pattern: res.email_pattern});
        })
      }).catch(async(err: ApiError) => {
        if(err.type === 'PASSWORD_RECOVERY_NA') {
          await SimpleConfirmationPopup.show({
            titleLangKey: 'Login.ResetPassword.Title',
            descriptionLangKey: 'Login.ResetPassword.NoEmailText',
            button: {
              langKey: 'Login.ResetPassword.ResetAccount',
              isDanger: true
            }
          })

          await SimpleConfirmationPopup.show({
            titleLangKey: 'Login.ResetAccount.Title',
            descriptionLangKey: 'Login.ResetAccount.Text',
            button: {
              langKey: 'Login.ResetPassword.ResetAccount',
              isDanger: true
            }
          })

          // Promise.reject({type: '2FA_CONFIRM_WAIT_518400'})
          await rootScope.managers.appAccountManager.deleteAccount('Forgot password')
          .then(() => {
            pageSignIn.mount();
          }).catch((err: ApiError) => {
            if(err.type === '2FA_RECENT_CONFIRM') {
              SimpleConfirmationPopup.show({
                titleLangKey: 'Login.ResetAccountFail.Title',
                descriptionLangKey: 'Login.ResetAccountFail.TextCancelled',
                button: {
                  langKey: 'OK'
                }
              })
            } else if(err.type.startsWith('2FA_CONFIRM_WAIT_')) {
              const waitTime = +err.type.replace('2FA_CONFIRM_WAIT_', '');
              SimpleConfirmationPopup.show({
                titleLangKey: 'Login.ResetAccountFail.Title',
                descriptionLangKey: 'Login.ResetAccountFail.TextWait',
                descriptionArgs: [wrapFormattedDuration(formatDuration(waitTime))],
                button: {
                  langKey: 'OK'
                }
              })
            } else {
              console.error(err);
              toastNew({langPackKey: 'Error.AnError'});
            }
          })
          return
        }

        toastNew({langPackKey: 'Error.AnError'});
      }).finally(() => {
        resetLoading = false;
      });
    })
  ]);
  resetLink.classList.add('forgot-link');

  page.inputWrapper.append(passwordInputField.container, resetLink, btnNext);

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
  monkey = new PasswordMonkey(passwordInputField, size);
  page.imageDiv.append(monkey.container);
  return Promise.all([
    monkey.load(),
    getState()
  ]);
};

const page = new Page('page-password', true, onFirstMount, () => {
  monkey?.load()
}, () => {
  // if(!isAppleMobile) {
  passwordInput.focus();
  // }

  rootScope.managers.appStateManager.pushToState('authState', {_: 'authStatePassword'});
});

export default page;
