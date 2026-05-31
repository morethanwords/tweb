import {Component} from 'solid-js';
import cancelEvent from '@helpers/dom/cancelEvent';
import {canFocus} from '@helpers/dom/canFocus';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import replaceContent from '@helpers/dom/replaceContent';
import setInnerHTML from '@helpers/dom/setInnerHTML';
import {AccountPassword} from '@layer';
import I18n, {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import Button from '@components/button';
import {putPreloader} from '@components/putPreloader';
import PasswordMonkey from '@components/monkeys/password';
import PasswordInputField from '@components/passwordInputField';
import {AppTwoStepVerificationReEnterPasswordTab, AppTwoStepVerificationTab} from '@components/solidJsTabs/tabs';
import SettingSection from '@components/settingSection';
import {ForgotPasswordLink} from '@components/sidebarLeft/tabs/2fa/forgotPasswordLink';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import type {AppTwoStepVerificationEnterPasswordTab} from '@components/solidJsTabs/tabs';

const TwoStepVerificationEnterPassword: Component = () => {
  const [tab] = useSuperTab<typeof AppTwoStepVerificationEnterPasswordTab>();
  const promiseCollector = usePromiseCollector();
  let state: AccountPassword = tab.payload.state;
  const plainPassword = tab.payload.plainPassword;
  const isFirst = tab.payload.isFirst ?? true;

  let forgotLink: ForgotPasswordLink;

  const isNew = !state.pFlags.has_password || plainPassword;
  tab.container.classList.add('two-step-verification', 'two-step-verification-enter-password');
  tab.title.replaceChildren(i18n(isNew ? 'PleaseEnterFirstPassword' : 'PleaseEnterCurrentPassword'));

  const section = new SettingSection({
    noDelimiter: true
  });

  const inputWrapper = document.createElement('div');
  inputWrapper.classList.add('input-wrapper');

  const passwordInputField = new PasswordInputField({
    name: 'enter-password',
    label: isNew ? 'PleaseEnterFirstPassword' : (state.hint ? undefined : 'LoginPassword'),
    labelText: !isNew && state.hint ? wrapEmojiText(state.hint) : undefined
  });

  const monkey = new PasswordMonkey(passwordInputField, 157);

  if(!isNew) {
    forgotLink = new ForgotPasswordLink({
      state: state,
      managers: tab.managers,
      tab: tab,
      allowReset: true,
      forEmail: false
    });
  }

  const btnContinue = Button('btn-primary btn-color-primary');
  const textEl = new I18n.IntlElement({key: 'Continue'});

  btnContinue.append(textEl.element);

  inputWrapper.append(passwordInputField.container);
  if(forgotLink) {
    inputWrapper.append(forgotLink.container);
  }
  inputWrapper.append(btnContinue);
  section.content.append(monkey.container, inputWrapper);

  tab.scrollable.append(section.container);

  passwordInputField.input.addEventListener('keypress', (e) => {
    if(passwordInputField.input.classList.contains('error')) {
      passwordInputField.input.classList.remove('error');
      textEl.key = 'Continue';
      textEl.update();
    }

    if(e.key === 'Enter') {
      return onContinueClick();
    }
  });

  const verifyInput = () => {
    if(!passwordInputField.value.length) {
      passwordInputField.input.classList.add('error');
      return false;
    }

    return true;
  };

  let onContinueClick: (e?: Event) => void;
  if(!isNew) {
    let getStateInterval: number;

    const getState = () => {
      // * just to check session relevance
      if(!getStateInterval) {
        getStateInterval = window.setInterval(getState, 10e3);
      }

      return tab.managers.passwordManager.getState().then((_state) => {
        state = _state;

        if(state.hint) {
          setInnerHTML(passwordInputField.label, wrapEmojiText(state.hint));
        } else {
          replaceContent(passwordInputField.label, i18n('LoginPassword'));
        }
      });
    };

    const submit = (e?: Event) => {
      if(!verifyInput()) {
        cancelEvent(e);
        return;
      }

      btnContinue.setAttribute('disabled', 'true');
      textEl.key = 'PleaseWait';
      textEl.update();
      const preloader = putPreloader(btnContinue);

      const plainPassword = passwordInputField.value;
      tab.managers.passwordManager.check(passwordInputField.value, state).then((auth) => {
        if(auth._ === 'auth.authorization') {
          clearInterval(getStateInterval);
          if(monkey) monkey.remove();
          tab.slider.createTab(AppTwoStepVerificationTab).open({
            state,
            plainPassword
          });
          tab.slider.removeTabFromHistory(tab);
        }
      }, (err) => {
        btnContinue.removeAttribute('disabled');
        passwordInputField.input.classList.add('error');

        switch(err.type) {
          default:
            // btnContinue.innerText = err.type;
            textEl.key = 'PASSWORD_HASH_INVALID';
            textEl.update();
            preloader.remove();
            passwordInputField.select();
            break;
        }

        getState();
      });
    };

    onContinueClick = submit;

    getState();
  } else {
    onContinueClick = (e) => {
      if(e) {
        cancelEvent(e);
      }

      if(!verifyInput()) return;

      tab.slider.createTab(AppTwoStepVerificationReEnterPasswordTab).open({
        state,
        newPassword: passwordInputField.value,
        plainPassword
      });
    };
  }

  attachClickEvent(btnContinue, onContinueClick);

  (tab as any)._onOpenAfterTimeout = () => {
    if(!canFocus(isFirst)) return;
    passwordInputField.input.focus();
  };

  (tab as any)._onClose = () => {
    forgotLink?.cleanup();
  };

  promiseCollector.collect(monkey.load());

  return null;
};

export default TwoStepVerificationEnterPassword;
