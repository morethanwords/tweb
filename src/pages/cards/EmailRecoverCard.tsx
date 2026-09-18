import {JSX, createSignal, onCleanup, onMount} from 'solid-js';

import Button from '@components/buttonTsx';
import CodeInputFieldCompat from '@components/codeInputField';
import {wrapEmailPattern} from '@components/emailVerification';
import MediaHeader from '@components/mediaHeader';
import focusWhenSettled from '@helpers/dom/focusWhenSettled';
import mediaSizes from '@helpers/mediaSizes';
import {i18n} from '@lib/langPack';

import AuthCard from '@/pages/AuthCard';
import AuthCardError from '@/pages/AuthCardError';
import {CardSpec, useAuthFlow} from '@/pages/authFlow';

if(import.meta.hot) import.meta.hot.accept();

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

  const [errorContent, setErrorContent] = createSignal<JSX.Element>();

  const codeInputField = new CodeInputFieldCompat({
    length: 6,
    onChange: () => {
      codeInputField.error = false;
      setErrorContent(undefined);
    },
    onFill: (code) => {
      managers.passwordManager.confirmPasswordResetEmail(code).then(() => {
        toIm();
      }).catch((err: ApiError) => {
        codeInputField.error = true;
        codeInputField.value = '';

        if(err.type === 'CODE_INVALID') {
          setErrorContent(i18n('PHONE_CODE_INVALID'));
        } else {
          console.log('error', err);
          setErrorContent(i18n('Error.AnError'));
        }
      });
    }
  });

  /* ---------- lifecycle ---------- */

  let cancelFocus: (() => void) | undefined;
  onMount(() => {
    cancelFocus = focusWhenSettled(codeInputField.input);
  });

  onCleanup(() => {
    cancelFocus?.();
    codeInputField.cleanup();
  });

  return (
    <AuthCard
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
      <AuthCardError content={errorContent()} />
      <Button
        class="btn-primary btn-secondary btn-primary-transparent primary"
        onClick={() => navigate({name: 'password'})}
        text="Login.ResetPassword.Cancel"
      />
    </AuthCard>
  );
}
