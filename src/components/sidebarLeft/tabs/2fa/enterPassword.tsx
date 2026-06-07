import {Component, onMount} from 'solid-js';
import cancelEvent from '@helpers/dom/cancelEvent';
import {canFocus} from '@helpers/dom/canFocus';
import replaceContent from '@helpers/dom/replaceContent';
import setInnerHTML from '@helpers/dom/setInnerHTML';
import {AccountPassword} from '@layer';
import I18n, {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import Button from '@components/buttonTsx';
import {putPreloader} from '@components/putPreloader';
import PasswordMonkey from '@components/monkeys/password';
import PasswordInputField from '@components/passwordInputField';
import {AppTwoStepVerificationReEnterPasswordTab, AppTwoStepVerificationTab} from '@components/solidJsTabs/tabs';
import Section from '@components/section';
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

  const isNew = !state.pFlags.has_password || plainPassword;

  const passwordInputField = new PasswordInputField({
    name: 'enter-password',
    label: isNew ? 'PleaseEnterFirstPassword' : (state.hint ? undefined : 'LoginPassword'),
    labelText: !isNew && state.hint ? wrapEmojiText(state.hint) : undefined
  });

  const monkey = new PasswordMonkey(passwordInputField, 157);

  const forgotLink = !isNew ? new ForgotPasswordLink({
    state: state,
    managers: tab.managers,
    tab: tab,
    allowReset: true,
    forEmail: false
  }) : undefined;

  const textEl = new I18n.IntlElement({key: 'Continue'});

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

  let btnContinue!: HTMLElement;

  onMount(() => {
    tab.container.classList.add('two-step-verification', 'two-step-verification-enter-password');

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
  });

  (tab as any)._onOpenAfterTimeout = () => {
    if(!canFocus(isFirst)) return;
    passwordInputField.input.focus();
  };

  (tab as any)._onClose = () => {
    forgotLink?.cleanup();
  };

  promiseCollector.collect(monkey.load());

  return (
    <Section noDelimiter>
      {monkey.container}
      <div class="input-wrapper">
        {passwordInputField.container}
        {forgotLink?.container}
        <Button ref={btnContinue} primaryFilled onClick={onContinueClick}>
          {textEl.element}
        </Button>
      </div>
    </Section>
  );
};

export default TwoStepVerificationEnterPassword;
