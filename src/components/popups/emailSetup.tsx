import PopupElement, {createPopup} from '@components/popups/indexTsx'

import {CodeInputField} from '@components/codeInputField';
import {TransitionSliderTsx} from '@components/transitionTsx';
import {createEffect, createSignal, onCleanup, onMount, Ref, Show} from 'solid-js';

import styles from '@components/popups/emailSetup.module.scss';
import LottieAnimation from '@components/lottieAnimation';
import lottieLoader from '@lib/rlottie/lottieLoader';
import {I18nTsx} from '@helpers/solid/i18n';
import {InputFieldTsx} from '@components/inputFieldTsx';
import {LangPackKey} from '@lib/langPack';
import ButtonTsx from '@components/buttonTsx';
import classNames from '@helpers/string/classNames';
import {AccountSentEmailCode, EmailVerifyPurpose, MessageEntity} from '@layer';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import InputField, {InputState} from '@components/inputField';
import {doubleRaf, fastRaf} from '@helpers/schedulers';
import Animated from '@helpers/solid/animations';
import rootScope from '@lib/rootScope';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';

export function wrapEmailPattern(pattern: string) {
  if(pattern.includes(' ') || !pattern.includes('*')) return pattern;

  const entities: MessageEntity[] = [];
  for(let i = 0; i < pattern.length;) {
    const idx = pattern.indexOf('*', i);
    if(idx === -1) break;
    let endIdx = idx + 1;
    while(pattern[endIdx] === '*') endIdx++;

    entities.push({
      _: 'messageEntitySpoiler',
      offset: idx,
      length: endIdx - idx
    });

    i = endIdx;
  }

  return wrapRichText(pattern, {entities, noTextFormat: true});
}

export function EnterEmailStep(props: {
  isInitialSetup?: boolean
  footerClass?: string
  purpose: EmailVerifyPurpose
  onCodeSent: (code: AccountSentEmailCode.accountSentEmailCode) => void
}) {
  const [error, setError] = createSignal<LangPackKey | undefined>(undefined);
  const [email, setEmail] = createSignal<string>('');
  const [loading, setLoading] = createSignal(false);

  let inputRef!: InputField;

  function onSubmit() {
    if(!email().includes('@')) {
      inputRef.setError();
      return;
    }

    setLoading(true);
    rootScope.managers.appAccountManager.sendVerifyEmailCode(
      props.purpose,
      email()
    ).then(() => {
      setLoading(false);
      props.onCodeSent({
        _: 'account.sentEmailCode',
        email_pattern: email(),
        length: 6
      });
    }).catch((err: ApiError) => {
      if(err.type === 'EMAIL_INVALID') {
        setError('EmailSetup.InvalidEmail');
      } else if(err.type === 'EMAIL_NOT_ALLOWED') {
        setError('EmailSetup.BadEmail');
      } else {
        console.error(err);
        setError('Error.AnError');
      }

      // avoid flashing while transitioning to error state
      setTimeout(() => {
        setLoading(false);
      }, 200);
    });
  }

  onMount(() => {
    doubleRaf().then(() => {
      inputRef.input.focus();
    })

    subscribeOn(inputRef.input)('keydown', (e) => {
      if(e.key === 'Enter') {
        e.preventDefault();
        onSubmit();
      }
    });
  });

  return (
    <div class={styles.page}>
      <LottieAnimation
        class={styles.lottie}
        lottieLoader={lottieLoader}
        name="Mailbox"
        size={120}
        restartOnClick
        rlottieOptions={{
          loop: false,
          autoplay: true
        }}
      />

      <I18nTsx class={styles.title} key={props.isInitialSetup ? 'EmailSetup.Title' : 'EmailSetup.ChangeTitle'} />
      <I18nTsx class={styles.subtitle} key={props.isInitialSetup ? 'EmailSetup.Subtitle' : 'EmailSetup.ChangeSubtitle'} />

      <InputFieldTsx
        instanceRef={ref => inputRef = ref}
        class={styles.input}
        label="EmailSetup.InputCaption"
        disabled={loading()}
        value={email()}
        errorLabel={error() ? null : undefined}
        onRawInput={(val) => {
          setEmail(val);
          setError(undefined);
          inputRef.setState(InputState.Neutral);
        }}
      />

      <div class={classNames(styles.footer, props.footerClass)}>
        <Animated type="cross-fade">
          <Show
            when={!error()}
            fallback={(
              <div class={styles.error}>
                <I18nTsx key={error()} />
              </div>
            )}
          >
            <div class={styles.buttonContainer}>
              <ButtonTsx
                class={classNames(styles.button, 'btn-primary btn-color-primary')}
                text="Continue"
                disabled={loading()}
                onClick={onSubmit}
              />
            </div>
          </Show>
        </Animated>
      </div>
    </div>
  )
}

export function EnterCodeStep(props: {
  footerClass?: string
  visible?: boolean
  purpose: EmailVerifyPurpose
  sentCode: AccountSentEmailCode.accountSentEmailCode
  onSuccess: () => void
  onExpired: () => void
}) {
  const [error, setError] = createSignal<LangPackKey | undefined>(undefined);
  const [loading, setLoading] = createSignal(false);
  const codeSignal = createSignal<string>('');

  let inputRef!: HTMLInputElement;

  createEffect(() => {
    if(props.visible !== false) {
      doubleRaf().then(() => {
        inputRef.focus();
      })
    }
  })

  function onSubmit() {
    setLoading(true);
    rootScope.managers.appAccountManager.verifyEmail(
      props.purpose,
      {
        _: 'emailVerificationCode',
        code: codeSignal[0]()
      }
    ).then(() => {
      setLoading(false);
      props.onSuccess();
    }).catch((err: ApiError) => {
      if(err.type === 'EMAIL_VERIFY_EXPIRED') {
        setLoading(false);
        return props.onExpired();
      }

      if(err.type === 'CODE_INVALID') {
        setError('EmailSetup.WrongCode');
      } else {
        console.error(err);
        setError('Error.AnError');
      }

      codeSignal[1]('');

      // avoid flashing while transitioning to error state
      setTimeout(() => {
        setLoading(false);
        fastRaf(() => inputRef.focus());
      }, 200);
    });
  }

  return (
    <div class={styles.page}>
      <LottieAnimation
        class={styles.lottie}
        lottieLoader={lottieLoader}
        name="LoveLetter"
        size={120}
        restartOnClick
        rlottieOptions={{
          loop: false,
          autoplay: true
        }}
      />

      <I18nTsx class={styles.title} key="EmailSetup.CheckEmail" />
      <I18nTsx
        class={styles.subtitle}
        key="EmailSetup.CheckEmailSubtitle"
        args={[wrapEmailPattern(props.sentCode.email_pattern)]}
      />

      <CodeInputField
        ref={inputRef}
        valueSignal={codeSignal}
        class={styles.input}
        length={props.sentCode.length}
        disabled={loading()}
        onFill={onSubmit}
        error={error() != null}
        onChange={() => setError(undefined)}
      />

      <div class={classNames(styles.footer, props.footerClass)}>
        <Animated type="cross-fade">
          <Show
            when={!error()}
            fallback={(
              <div class={styles.error}>
                <I18nTsx key={error()} />
              </div>
            )}
          >
            <div class={styles.buttonContainer}>
              <ButtonTsx
                class={classNames(styles.button, 'btn-primary btn-color-primary')}
                text="Continue"
                disabled={loading() || codeSignal[0]().length !== props.sentCode.length}
                onClick={onSubmit}
              />
            </div>
          </Show>
        </Animated>
      </div>
    </div>
  )
}

let isCurrentlyShowing = false;
export function showEmailSetupPopup(options: {
  purpose: EmailVerifyPurpose
  noskip: boolean
  onSuccess?: () => void
  onDismiss?: () => void
}) {
  if(isCurrentlyShowing) {
    return;
  }
  isCurrentlyShowing = true;

  const [show, setShow] = createSignal(false);
  const [page, setPage] = createSignal(0);
  const [code, setCode] = createSignal<AccountSentEmailCode.accountSentEmailCode | undefined>(undefined);
  const [codePageTransitionEnded, setCodePageTransitionEnded] = createSignal(false);

  return createPopup(() => {
    const secondPageNavigationItem: NavigationItem = {
      type: 'left',
      onPop: () => void setPage(0)
    }

    onCleanup(() => {
      isCurrentlyShowing = false;
      appNavigationController.removeItem(secondPageNavigationItem);
    });

    doubleRaf().then(() => setShow(true));

    let isSuccess = false

    return (
      <PopupElement
        class={styles.popup}
        containerClass={styles.popupContainer}
        show={show()}
        closable={!options.noskip}
        onClose={() => {
          isCurrentlyShowing = false;
          if(!isSuccess) options.onDismiss?.()
        }}
        isConfirmationNeededOnClose={() => {
          if(options.noskip && !isSuccess) return Promise.reject()
        }}
      >
        <PopupElement.Header class={styles.popupHeader}>
          <Show when={!options.noskip || page() === 1}>
            <PopupElement.CloseButton
              class={styles.popupCloseButton}
              canGoBack={page() !== 0}
              onBackClick={() => void setPage(0)}
            />
          </Show>
        </PopupElement.Header>
        <PopupElement.Body>
          <TransitionSliderTsx
            class={styles.slider}
            type="navigation"
            transitionTime={150}
            animateFirst={false}
            currentPage={page()}
            onTransitionStart={(id) => {
              setCodePageTransitionEnded(false);
              if(id === 0) {
                appNavigationController.removeItem(secondPageNavigationItem);
              } else {
                appNavigationController.pushItem(secondPageNavigationItem);
              }
            }}
            onTransitionEnd={(id) => {
              if(id === 1) {
                setCodePageTransitionEnded(true);
              }
            }}
          >
            <EnterEmailStep
              isInitialSetup={true}
              purpose={options.purpose}
              onCodeSent={code => {
                setCode(code);
                setPage(1);
              }}
            />
            <Show when={code()}>
              <EnterCodeStep
                purpose={options.purpose}
                sentCode={code()!}
                visible={page() === 1 && codePageTransitionEnded()}
                onExpired={() => {
                  setPage(0);
                  setCode(undefined);
                }}
                onSuccess={() => {
                  isSuccess = true
                  options.onSuccess?.();
                  setShow(false);
                }}
              />
            </Show>
          </TransitionSliderTsx>
        </PopupElement.Body>
      </PopupElement>
    );
  })
}
