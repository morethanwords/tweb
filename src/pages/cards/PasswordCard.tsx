/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createSignal, JSX, onCleanup, onMount} from 'solid-js';

import Button from '@components/buttonTsx';
import PasswordInputField from '@components/passwordInputField';
import PasswordMonkey from '@components/monkeys/password';
import {SimpleConfirmationPopup} from '@components/popups/simpleConfirmation';
import MediaHeader from '@components/mediaHeader';
import {toastNew} from '@components/toast';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import anchorCallback from '@helpers/dom/anchorCallback';
import cancelEvent from '@helpers/dom/cancelEvent';
import htmlToSpan from '@helpers/dom/htmlToSpan';
import replaceContent from '@helpers/dom/replaceContent';
import formatDuration from '@helpers/formatDuration';
import mediaSizes from '@helpers/mediaSizes';
import {AccountPassword} from '@layer';
import {LangPackKey, i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';

import AuthCard from '@/pages/AuthCard';
import {CardSpec, useAuthFlow} from '@/pages/authFlow';
import styles from '@/pages/authFlow.module.scss';

type Spec = Extract<CardSpec, {name: 'password'}>;

const TEST = false;

/**
 * Card variant of `pagePassword`. Single password input over a `PasswordMonkey`
 * animation, with a "forgot password" link that leads to `emailRecover` (or to
 * full account reset if recovery isn't available).
 */
export default function PasswordCard(_props: {spec: Spec}) {
  const {managers, navigate, toIm} = useAuthFlow();

  let monkey: PasswordMonkey | undefined;
  const monkeyContainer = document.createElement('div');
  const monkeySize = mediaSizes.isMobile ? 100 : 130;

  let getStateInterval: number | undefined;
  let state: AccountPassword;
  let resetLoading = false;

  /* ---------- state ---------- */

  const [submitting, setSubmitting] = createSignal(false);
  const [nextKey, setNextKey] = createSignal<LangPackKey>('Login.Next');

  /* ---------- input ---------- */

  const passwordInputField = new PasswordInputField({
    label: 'LoginPassword',
    name: 'password'
  });
  const passwordInput = passwordInputField.input as HTMLInputElement;

  /* ---------- forgot link ---------- */

  const resetLink = i18n('ForgotPassword', [
    anchorCallback(() => {
      if(resetLoading) return;
      resetLoading = true;

      managers.passwordManager.requestRecovery().then((res) => {
        navigate({name: 'emailRecover', payload: {email_pattern: res.email_pattern}});
      }).catch(async(err: ApiError) => {
        if(err.type === 'PASSWORD_RECOVERY_NA') {
          await SimpleConfirmationPopup.show({
            titleLangKey: 'Login.ResetPassword.Title',
            descriptionLangKey: 'Login.ResetPassword.NoEmailText',
            button: {
              langKey: 'Login.ResetPassword.ResetAccount',
              isDanger: true
            }
          });

          await SimpleConfirmationPopup.show({
            titleLangKey: 'Login.ResetAccount.Title',
            descriptionLangKey: 'Login.ResetAccount.Text',
            button: {
              langKey: 'Login.ResetPassword.ResetAccount',
              isDanger: true
            }
          });

          await managers.appAccountManager.deleteAccount('Forgot password').then(() => {
            navigate({name: 'signIn'});
          }).catch((err: ApiError) => {
            if(err.type === '2FA_RECENT_CONFIRM') {
              SimpleConfirmationPopup.show({
                titleLangKey: 'Login.ResetAccountFail.Title',
                descriptionLangKey: 'Login.ResetAccountFail.TextCancelled',
                button: {langKey: 'OK'}
              });
            } else if(err.type.startsWith('2FA_CONFIRM_WAIT_')) {
              const waitTime = +err.type.replace('2FA_CONFIRM_WAIT_', '');
              SimpleConfirmationPopup.show({
                titleLangKey: 'Login.ResetAccountFail.Title',
                descriptionLangKey: 'Login.ResetAccountFail.TextWait',
                descriptionArgs: [wrapFormattedDuration(formatDuration(waitTime))],
                button: {langKey: 'OK'}
              });
            } else {
              console.error(err);
              toastNew({langPackKey: 'Error.AnError'});
            }
          });
          return;
        }

        toastNew({langPackKey: 'Error.AnError'});
      }).finally(() => {
        resetLoading = false;
      });
    })
  ]);
  resetLink.classList.add(styles.forgotLink);

  /* ---------- state polling (session relevance) ---------- */

  function getState() {
    if(!getStateInterval) {
      getStateInterval = window.setInterval(getState, 10e3);
    }

    return !TEST && managers.passwordManager.getState().then((_state) => {
      state = _state;

      if(state.hint) {
        replaceContent(passwordInputField.label, htmlToSpan(wrapEmojiText(state.hint)));
      } else {
        passwordInputField.setLabel();
      }
    });
  }

  /* ---------- submit ---------- */

  function onSubmit(e?: Event) {
    if(e) cancelEvent(e);

    if(!passwordInput.value.length) {
      passwordInput.classList.add('error');
      return;
    }

    setSubmitting(true);
    passwordInput.disabled = true;
    setNextKey('PleaseWait');

    const value = passwordInput.value;
    passwordInputField.setValueSilently('' + Math.random()); // prevent saving suggestion
    passwordInputField.setValueSilently(value);

    managers.passwordManager.check(value, state).then((response) => {
      switch(response._) {
        case 'auth.authorization':
          if(getStateInterval) {
            clearInterval(getStateInterval);
            getStateInterval = undefined;
          }
          toIm();
          monkey?.remove();
          break;
        default:
          setSubmitting(false);
          passwordInput.disabled = false;
          setNextKey(response._ as LangPackKey);
          break;
      }
    }).catch((err: any) => {
      setSubmitting(false);
      passwordInput.disabled = false;
      passwordInputField.input.classList.add('error');

      switch(err.type) {
        default:
          setNextKey('PASSWORD_HASH_INVALID');
          passwordInput.select();
          break;
      }

      getState();
    });
  }

  passwordInput.addEventListener('keypress', function(this, e) {
    this.classList.remove('error');
    setNextKey('Login.Next');

    if(e.key === 'Enter') {
      return onSubmit();
    }
  });

  /* ---------- lifecycle ---------- */

  onMount(() => {
    managers.appStateManager.pushToState('authState', {_: 'authStatePassword'});

    monkey = new PasswordMonkey(passwordInputField, monkeySize);
    monkeyContainer.append(monkey.container);
    monkey.load();

    getState();

    passwordInput.focus();
  });

  onCleanup(() => {
    monkey?.remove();
    if(getStateInterval) {
      clearInterval(getStateInterval);
      getStateInterval = undefined;
    }
  });

  return (
    <AuthCard
      class={styles.pagePassword}
      header={
        <MediaHeader>
          <MediaHeader.Sticker element={monkeyContainer} size={monkeySize}/>
          <MediaHeader.Title>{i18n('Login.Password.Title')}</MediaHeader.Title>
          <MediaHeader.Subtitle>{i18n('Login.Password.Subtitle')}</MediaHeader.Subtitle>
        </MediaHeader>
      }
    >
      {passwordInputField.container}
      {resetLink}
      <Button
        class="btn-primary btn-color-primary"
        disabled={submitting()}
        onClick={onSubmit}
      >
        {i18n(nextKey())}
        {submitting() && (
          <svg xmlns="http://www.w3.org/2000/svg" class="preloader-circular" viewBox="25 25 50 50">
            <circle class="preloader-path" cx="50" cy="50" r="20" fill="none" stroke-miterlimit="10"/>
          </svg>
        )}
      </Button>
    </AuthCard>
  );
}
