import {Component, onMount, Show} from 'solid-js';
import Button from '@components/buttonTsx';
import CodeInputFieldCompat from '@components/codeInputField';
import {putPreloader} from '@components/putPreloader';
import {i18n} from '@lib/langPack';
import {canFocus} from '@helpers/dom/canFocus';
import replaceContent from '@helpers/dom/replaceContent';
import toggleDisability from '@helpers/dom/toggleDisability';
import Section from '@components/section';
import {AppSettingsTab} from '@components/solidJsTabs';
import {AppTwoStepVerificationEmailTab, AppTwoStepVerificationSetTab} from '@components/solidJsTabs/tabs';
import {toastNew} from '@components/toast';
import {ForgotPasswordLink} from '@components/sidebarLeft/tabs/2fa/forgotPasswordLink';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type {AppTwoStepVerificationEmailConfirmationTab} from '@components/solidJsTabs/tabs';

const TwoStepVerificationEmailConfirmation: Component = () => {
  const [tab] = useSuperTab<typeof AppTwoStepVerificationEmailConfirmationTab>();
  const {lottieLoader} = useHotReloadGuard();
  const {state, email, length} = tab.payload;
  const isFirst = tab.payload.isFirst ?? false;
  const forPasswordReset = tab.payload.forPasswordReset ?? false;
  const justSetPasssword = tab.payload.justSetPasssword ?? false;

  let errorLabel!: HTMLDivElement;
  let btnChange: HTMLElement;
  let btnResend!: HTMLElement;

  const stickerContainer = document.createElement('div');
  stickerContainer.classList.add('media-sticker-wrapper');

  lottieLoader.loadAnimationAsAsset({
    container: stickerContainer,
    width: 160,
    height: 160,
    loop: false,
    autoplay: true
  }, 'Mailbox');

  const goNext = () => {
    if(forPasswordReset) {
      toastNew({langPackKey: 'PasswordDeactivated'});
      tab.slider.sliceTabsUntilTab(AppSettingsTab, tab);
      tab.close();
    } else {
      tab.slider.createTab(AppTwoStepVerificationSetTab).open({messageFor: justSetPasssword ? 'password' : 'email'});
    }
  };

  const freeze = (disable: boolean) => {
    toggleDisability([btnChange, btnResend].filter(Boolean), disable);
    codeInputField.disabled = disable;
  };

  const codeInputField = new CodeInputFieldCompat({
    length: length,
    onChange: (code) => {
      codeInputField.error = false;
      errorLabel.classList.add('hidden');
    },
    onFill: (code) => {
      freeze(true);

      const promise = forPasswordReset ?
      tab.managers.passwordManager.confirmPasswordResetEmail('' + code) :
        tab.managers.passwordManager.confirmPasswordEmail('' + code)

      promise.then((value) => {
        goNext();
      })
      .catch((err) => {
        switch(err.type) {
          case 'CODE_INVALID':
            codeInputField.error = true;
            codeInputField.value = ''
            errorLabel.classList.remove('hidden');
            replaceContent(errorLabel, i18n('TwoStepAuth.RecoveryCodeInvalid'));
            break;

          case 'EMAIL_HASH_EXPIRED':
            codeInputField.error = true;
            codeInputField.value = ''
            errorLabel.classList.remove('hidden');
            replaceContent(errorLabel, i18n('TwoStepAuth.RecoveryCodeExpired'));
            break;

          default:
            console.error('confirm error', err);
            break;
        }

        freeze(false);
      });
    }
  });

  const resetLink = forPasswordReset ? new ForgotPasswordLink({
    state: state,
    managers: tab.managers,
    tab: tab,
    allowReset: true,
    forEmail: true
  }) : undefined;

  const onChangeClick = () => {
    freeze(true);
    tab.managers.passwordManager.cancelPasswordEmail().then((value) => {
      tab.slider.sliceTabsUntilTab(AppTwoStepVerificationEmailTab, tab);
      tab.close();
    }, () => {
      freeze(false);
    });
  };

  const onResendClick = () => {
    freeze(true);
    const d = putPreloader(btnResend);
    const promise = forPasswordReset ?
      tab.managers.passwordManager.requestRecovery() :
      tab.managers.passwordManager.resendPasswordEmail()

    promise.catch((err) => {
      console.error(err)
      toastNew({langPackKey: 'Error.AnError'});
    }).then(() => {
      d.remove();
      freeze(false);
    });
  };

  onMount(() => {
    tab.container.classList.add('two-step-verification', 'two-step-verification-email-confirmation');
  });

  (tab as any)._onOpenAfterTimeout = () => {
    if(!canFocus(isFirst)) return;
    codeInputField.input.focus();
  };

  (tab as any)._onCloseAfterTimeout = () => {
    codeInputField.cleanup();
    resetLink?.cleanup();
  };

  return (
    <Section caption="TwoStepAuth.ConfirmEmailCodeDesc" captionArgs={[email]} captionOld noDelimiter>
      {stickerContainer}
      <div class="input-wrapper">
        {codeInputField.container}
        <div ref={errorLabel} class="error-label hidden" />
        <Show when={!forPasswordReset}>
          <Button ref={btnChange} class="btn-primary btn-primary-transparent primary" text="TwoStepAuth.EmailCodeChangeEmail" onClick={onChangeClick} />
        </Show>
        <Button ref={btnResend} class="btn-primary btn-secondary btn-primary-transparent primary" text="ResendCode" onClick={onResendClick} />
        {resetLink?.container}
      </div>
    </Section>
  );
};

export default TwoStepVerificationEmailConfirmation;
