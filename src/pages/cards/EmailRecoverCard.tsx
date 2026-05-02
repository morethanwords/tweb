/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {onCleanup, onMount} from 'solid-js';

import Button from '@components/buttonTsx';
import CodeInputFieldCompat from '@components/codeInputField';
import {wrapEmailPattern} from '@components/popups/emailSetup';
import MediaHeader from '@components/mediaHeader';
import replaceContent from '@helpers/dom/replaceContent';
import mediaSizes from '@helpers/mediaSizes';
import {fastRaf} from '@helpers/schedulers';
import {i18n} from '@lib/langPack';

import AuthCard from '@/pages/AuthCard';
import {CardSpec, useAuthFlow} from '@/pages/authFlow';
import styles from '@/pages/authFlow.module.scss';

type Spec = Extract<CardSpec, {name: 'emailRecover'}>;

/**
 * Card variant of `pageEmailRecover`. Shows a 6-digit input under a Mailbox
 * lottie; confirming the code via `passwordManager.confirmPasswordResetEmail`
 * switches to IM. The cancel button returns to the password card.
 */
export default function EmailRecoverCard(props: {spec: Spec}) {
  const {managers, navigate, toIm} = useAuthFlow();

  const stickerSize = mediaSizes.isMobile ? 100 : 130;

  /* ---------- inputs ---------- */

  const codeInputErrorLabel = document.createElement('div');
  codeInputErrorLabel.classList.add(styles.errorLabel);

  const codeInputField = new CodeInputFieldCompat({
    length: 6,
    onChange: () => {
      codeInputField.error = false;
      replaceContent(codeInputErrorLabel, '');
    },
    onFill: (code) => {
      managers.passwordManager.confirmPasswordResetEmail(code).then(() => {
        toIm();
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

  /* ---------- lifecycle ---------- */

  onMount(() => {
    fastRaf(() => codeInputField.input.focus());
  });

  onCleanup(() => {
    codeInputField.cleanup();
  });

  return (
    <AuthCard
      class={styles.pageEmailRecover}
      header={
        <MediaHeader>
          <MediaHeader.Sticker name="Mailbox" size={stickerSize}/>
          <MediaHeader.Title>{i18n('Login.ResetPassword.Title')}</MediaHeader.Title>
          <MediaHeader.Subtitle>
            {i18n('Login.ResetPassword.Subtitle', [wrapEmailPattern(props.spec.payload.email_pattern)])}
          </MediaHeader.Subtitle>
        </MediaHeader>
      }
    >
      {codeInputField.container}
      {codeInputErrorLabel}
      <Button
        class="btn-primary btn-secondary btn-primary-transparent primary"
        onClick={() => navigate({name: 'password'})}
        text="Login.ResetPassword.Cancel"
      />
    </AuthCard>
  );
}
