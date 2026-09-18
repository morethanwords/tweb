import {JSX, Show, createSignal, onCleanup, onMount} from 'solid-js';

import Button from '@components/buttonTsx';
import CodeInputFieldCompat from '@components/codeInputField';
import Icon from '@components/icon';
import InputField, {InputState} from '@components/inputField';
import TrackingMonkey from '@components/monkeys/tracking';
import {wrapEmailPattern} from '@components/emailVerification';
import simpleConfirmation from '@components/popups/simpleConfirmation';
import MediaHeader from '@components/mediaHeader';
import {toastNew} from '@components/toast';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import anchorCallback from '@helpers/dom/anchorCallback';
import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import focusWhenSettled from '@helpers/dom/focusWhenSettled';
import formatDuration from '@helpers/formatDuration';
import mediaSizes from '@helpers/mediaSizes';
import classNames from '@helpers/string/classNames';
import {fastRaf} from '@helpers/schedulers';
import toHHMMSS from '@helpers/string/toHHMMSS';
import tsNow from '@helpers/tsNow';
import {AuthSentCodeType, AuthSignIn} from '@layer';
import {LangPackKey, i18n} from '@lib/langPack';
import setBlankToAnchor from '@lib/richTextProcessor/setBlankToAnchor';
import lottieLoader from '@lib/lottie/lottieLoader';
import LottiePlayer from '@lib/lottie/lottiePlayer';
import ctx from '@environment/ctx';

import AuthCard from '@/pages/AuthCard';
import AuthCardError from '@/pages/AuthCardError';
import {CardSpec, useAuthFlow} from '@/pages/authFlow';
import {continueLogin} from '@/pages/continueLogin';
import {
  CodeInputKind,
  SentCode,
  beginsOk,
  getCodeBeginning,
  getCodeInputKind,
  getCodeLength,
  getResendLangKey,
  getResendPendingLangKey,
  isEmailCode,
  sentCodeToCardSpec,
  withPhoneNumber
} from '@/pages/sentCode';
import styles from '@/pages/authFlow.module.scss';

if(import.meta.hot) import.meta.hot.accept();

type Spec = Extract<CardSpec, {name: 'authCode'}>;

/** `auth.resendCode` is offered after this long when the server names no timeout. */
const DEFAULT_RESEND_TIMEOUT = 60;

/**
 * Card variant of `pageAuthCode` — every code the server can ask for, except the
 * one that needs a login email first (that one goes to the `emailSetup` cards,
 * see `sentCodeToCardSpec`).
 *
 * Digit codes (app / SMS / call / missed call / Fragment / email) submit
 * themselves once the last box is filled; a secret word or phrase
 * (`auth.sentCodeTypeSmsWord` / `…SmsPhrase`) is free text, so it gets a plain
 * field with a Next button and is checked against the `beginning` the server
 * disclosed before a server attempt is spent.
 *
 * Where the typed code goes differs too: a login email proves the *email*, so it
 * travels in `auth.signIn.email_verification`; everything else is `phone_code`.
 *
 * Branches:
 * - `auth.signIn` → success → IM
 * - `authorizationSignUpRequired` → signUp card
 * - `SESSION_PASSWORD_NEEDED` → password card
 *
 * `auth.resendCode` and `auth.resetLoginEmail` answer with a new `auth.sentCode`
 * that can be of any type — including one this card does not own — so both route
 * back through `sentCodeToCardSpec` instead of assuming they stay here. When the
 * answer does stay here, it is applied in place (rebuilding the input, animation
 * and subtitle inline) rather than bouncing through the navigation system, which
 * would flash the card.
 */
export default function AuthCodeCard(props: {spec: Spec}) {
  const {managers, navigate, toIm} = useAuthFlow();

  /* ---------- state ---------- */

  let sentCode: SentCode = props.spec.payload;

  const [sentTypeContent, setSentTypeContent] = createSignal<JSX.Element>();
  const [resetEmailContent, setResetEmailContent] = createSignal<JSX.Element>();
  const [resendContent, setResendContent] = createSignal<JSX.Element>();
  const [inputKind, setInputKind] = createSignal<CodeInputKind>(getCodeInputKind(sentCode.type));
  const [submitting, setSubmitting] = createSignal(false);
  const [errorContent, setErrorContent] = createSignal<JSX.Element>();

  // Persistent host for the rebuildable monkey/lottie. We hand this to
  // <MediaHeader.Sticker element={...}>; `rebuildAnimation()` then mutates
  // its children whenever the sentCode type changes.
  const stickerHost = document.createElement('div');
  const stickerSize = mediaSizes.isMobile ? 100 : 130;

  let monkey: TrackingMonkey | undefined;
  let player: LottiePlayer | undefined;
  let resetEmailTimer: number | undefined;
  let resendTimer: number | undefined;
  let resendDeadline = 0;
  let resending = false;

  /* ---------- header pieces (mutated imperatively in applySentCode) ---------- */

  const phoneEl = document.createElement('h4');
  phoneEl.classList.add(styles.phone);

  const editButton = document.createElement('span');
  editButton.classList.add(styles.phoneEdit);
  editButton.append(Icon('edit'));
  attachClickEvent(editButton, () => navigate({name: 'signIn'}));

  /* ---------- code input (rebuilt when the code changes shape) ---------- */

  // Digit boxes and the word/phrase field are different widgets, and the tracking
  // monkey binds to whichever one is live — so both are rebuilt together by
  // `applySentCode()` and disposed here.
  const inputHost = document.createElement('div');
  inputHost.classList.add(styles.codeInputHost);

  let codeInputField: CodeInputFieldCompat | undefined;
  let textInputField: InputField | undefined;
  let currentInputKind: CodeInputKind | undefined;

  const activeInput = () => codeInputField?.input ?? textInputField?.input;

  function clearError() {
    if(codeInputField) codeInputField.error = false;
    textInputField?.setState(InputState.Neutral);
    setErrorContent(undefined);
  }

  function markError(content: JSX.Element) {
    if(codeInputField) codeInputField.error = true;
    textInputField?.setState(InputState.Error);
    setErrorContent(content);
  }

  function showError(key: LangPackKey) {
    markError(i18n(key));
  }

  function disposeInput() {
    codeInputField?.cleanup();
    codeInputField = undefined;
    textInputField = undefined;
    inputHost.replaceChildren();
  }

  function rebuildInput() {
    const kind = getCodeInputKind(sentCode.type);
    const length = getCodeLength(sentCode.type);

    disposeInput();
    currentInputKind = kind;
    setInputKind(kind);

    if(kind === 'digits') {
      codeInputField = new CodeInputFieldCompat({
        length,
        onChange: clearError,
        onFill: (code) => submitCode(code),
        class: styles.codeInputField
      });
      inputHost.append(codeInputField.container);
      return;
    }

    textInputField = new InputField({
      plainText: true,
      label: sentCode.type._ === 'auth.sentCodeTypeSmsWord' ?
        'Login.Code.SecretWord' :
        'Login.Code.SecretPhrase',
      name: 'sms-word',
      onRawInput: clearError
    });
    textInputField.container.classList.add(styles.wordInputField);
    textInputField.input.addEventListener('keydown', (e: KeyboardEvent) => {
      if(e.key !== 'Enter') return;
      cancelEvent(e);
      submitTextCode();
    });
    inputHost.append(textInputField.container);
  }

  /* ---------- submission ---------- */

  function submitTextCode() {
    const value = textInputField?.value.trim();
    if(!value || submitting()) return;
    submitCode(value);
  }

  function submitCode(code: string) {
    // the word/phrase types disclose how the secret starts, so a typo is caught
    // here instead of burning one of the server's attempts
    if(currentInputKind === 'text' && !beginsOk(code, getCodeBeginning(sentCode.type))) {
      showError('Login.Code.WordBeginningInvalid');
      return;
    }

    setSubmitting(true);
    setInputDisabled(true);

    const params: AuthSignIn = {
      phone_number: sentCode.phone_number,
      phone_code_hash: sentCode.phone_code_hash
    };

    if(isEmailCode(sentCode.type)) {
      params.email_verification = {_: 'emailVerificationCode', code};
    } else {
      params.phone_code = code;
    }

    managers.apiManager.invokeApi('auth.signIn', params, {ignoreErrors: true}).then(async(response) => {
      switch(response._) {
        case 'auth.authorization':
          await managers.apiManager.setUser(response.user);
          toIm();
          break;
        case 'auth.authorizationSignUpRequired':
          navigate({
            name: 'signUp',
            payload: {
              phone_number: sentCode.phone_number,
              phone_code_hash: sentCode.phone_code_hash
            }
          });
          break;
      }
    }).catch((err) => {
      let good = false;
      switch(err.type) {
        case 'SESSION_PASSWORD_NEEDED':
          good = true;
          navigate({name: 'password'});
          setTimeout(() => {
            if(codeInputField) codeInputField.value = '';
          }, 300);
          break;
        case 'PHONE_CODE_EXPIRED':
          showError('PHONE_CODE_EXPIRED');
          break;
        case 'PHONE_CODE_EMPTY':
        case 'PHONE_CODE_INVALID':
          showError(invalidCodeLangKey());
          break;
        default:
          markError(err.type);
          break;
      }

      setSubmitting(false);
      setInputDisabled(false);

      if(!good) {
        clearInputValue();
        fastRaf(() => activeInput()?.focus());
      }
    });
  }

  function invalidCodeLangKey(): LangPackKey {
    switch(sentCode.type._) {
      case 'auth.sentCodeTypeSmsWord':
      case 'auth.sentCodeTypeSmsPhrase':
        return 'Login.Code.WordInvalid';
      default:
        return 'PHONE_CODE_INVALID';
    }
  }

  function setInputDisabled(disabled: boolean) {
    if(codeInputField) codeInputField.disabled = disabled;
    textInputField?.input.toggleAttribute('disabled', disabled);
  }

  function clearInputValue() {
    // a digit code is retyped from scratch, but a secret word or phrase is long
    // enough that wiping it over one rejected attempt would be hostile — the
    // field keeps it for editing
    if(codeInputField) codeInputField.value = '';
  }

  /* ---------- animation (rebuilt on every type change) ---------- */

  function rebuildAnimation() {
    monkey?.remove(); monkey = undefined;
    player?.remove(); player = undefined;
    stickerHost.replaceChildren();

    if(sentCode.type._ === 'auth.sentCodeTypeFragmentSms') {
      const container = document.createElement('div');
      container.classList.add('media-sticker-wrapper');
      stickerHost.append(container);
      return lottieLoader.loadAnimationAsAsset({
        container,
        loop: true,
        autoplay: true,
        width: stickerSize,
        height: stickerSize
      }, 'jolly_roger').then((animation) => {
        player = animation;
        return lottieLoader.waitForFirstFrame(animation);
      }).then(() => {});
    }

    monkey = new TrackingMonkey(codeInputField ?? textInputField, stickerSize);
    stickerHost.append(monkey.container);
    return monkey.load();
  }

  /* ---------- a new sentCode from resend / reset ---------- */

  /**
   * Every answer that replaces `sentCode` also replaces the `phone_code_hash`
   * the sign-in hangs on, so the stored state has to follow it — a reload that
   * restored the previous one would sign in with a dead hash.
   */
  function persistSentCode() {
    managers.appStateManager.pushToState('authState', {_: 'authStateAuthCode', sentCode});
  }

  /**
   * Any of the code types can turn into any other one mid-flow, including one
   * that belongs to a different card — route first, apply in place second.
   */
  function applyNewSentCode(next: SentCode) {
    const spec = sentCodeToCardSpec(next);
    if(spec.name !== 'authCode') {
      navigate(spec);
      return;
    }

    sentCode = next;
    applySentCode();
  }

  /* ---------- resend (`next_type` + `timeout`) ---------- */

  function stopResendTimer() {
    if(resendTimer) {
      clearTimeout(resendTimer);
      resendTimer = undefined;
    }
  }

  function updateResend() {
    stopResendTimer();

    const key = getResendLangKey(sentCode.next_type);
    if(!key) {
      // nothing to fall back to — the server named no next type
      setResendContent(undefined);
      return;
    }

    // a resend is in flight; its own "requesting…" line stands until it answers
    if(resending) return;

    const diff = resendDeadline - tsNow(true);
    if(diff > 0) {
      setResendContent(i18n(getResendPendingLangKey(sentCode.next_type), [toHHMMSS(diff)]));
      resendTimer = ctx.setTimeout(updateResend, 1000);
      return;
    }

    setResendContent(i18n(key, [anchorCallback(resendCode)]));
  }

  function resendCode() {
    if(resending) return;
    resending = true;
    stopResendTimer();
    setResendContent(i18n('Login.Code.Resending'));

    managers.apiManager.invokeApi('auth.resendCode', {
      phone_number: sentCode.phone_number,
      phone_code_hash: sentCode.phone_code_hash
    }).then((code) => {
      resending = false;

      return continueLogin(code, {
        managers,
        navigate,
        toIm,
        phone_number: sentCode.phone_number,
        phone_code_hash: sentCode.phone_code_hash,
        onSentCode: applyNewSentCode
      });
    }).catch((err: ApiError) => {
      resending = false;
      console.error('auth.resendCode error:', err);
      toastNew({langPackKey: 'Error.AnError'});
      updateResend();
    });
  }

  /* ---------- email reset flow ---------- */

  function handleResetEmail() {
    managers.apiManager.invokeApi('auth.resetLoginEmail', {
      phone_number: sentCode.phone_number,
      phone_code_hash: sentCode.phone_code_hash
    }).then((code) => {
      if(code._ === 'auth.sentCode') {
        const next = withPhoneNumber(code, sentCode.phone_number);
        if(next.type._ === 'auth.sentCodeTypeEmailCode') {
          // still the same email screen, only the reset countdown moved — leave
          // the input and the animation alone
          sentCode = next;
          persistSentCode();
          updatePendingEmail(next.type);
        } else {
          applyNewSentCode(next);
        }
      } else {
        console.error(code);
        toastNew({langPackKey: 'Error.AnError'});
      }
    }).catch((err: ApiError) => {
      if(err.type.includes('TASK_ALREADY_EXISTS')) {
        simpleConfirmation({
          titleLangKey: 'Login.ResetEmail.NeedPremium',
          descriptionLangKey: 'Login.ResetEmail.NeedPremiumText',
          button: {langKey: 'OK'}
        });
      } else {
        console.error(err);
        toastNew({langPackKey: 'Error.AnError'});
      }
    });
  }

  function updatePendingEmail(type: AuthSentCodeType.authSentCodeTypeEmailCode) {
    if(resetEmailTimer) {
      clearTimeout(resetEmailTimer);
      resetEmailTimer = undefined;
    }

    if(type.reset_pending_date != null) {
      const diff = type.reset_pending_date - tsNow(true);
      if(diff <= 0 || type.reset_pending_date <= 0) {
        setResetEmailContent(i18n('Login.ResetEmail.PleaseWait'));
        handleResetEmail();
        return;
      }

      setResetEmailContent(i18n('Login.ResetEmail.Pending', [
        wrapFormattedDuration(formatDuration(diff, 2)),
        anchorCallback(handleResetEmail)
      ]));
      resetEmailTimer = ctx.setTimeout(() => updatePendingEmail(type), 30_000);
      return;
    }

    if(type.reset_available_period != null) {
      setResetEmailContent(i18n('TroubleEmail', [
        anchorCallback(() => {
          simpleConfirmation({
            titleLangKey: 'Login.ResetEmail.Title',
            descriptionLangKey: 'Login.ResetEmail.Text',
            descriptionArgs: [wrapFormattedDuration(formatDuration(type.reset_available_period, 2))],
            button: {langKey: 'Login.ResetEmail.Title'}
          }).then(() => handleResetEmail());
        })
      ]));
    }
  }

  /* ---------- apply current `sentCode` to DOM (subtitle, phone, input, animation, state) ---------- */

  function applySentCode() {
    // On the first pass the card is not in the DOM yet and `onMount` does the
    // focusing; later on it is a resend swapping the field out from under the
    // caret, so the new one has to be focused here.
    const isOnScreen = inputHost.isConnected;
    rebuildInput();
    if(isOnScreen) fastRaf(() => activeInput()?.focus());

    phoneEl.innerText = sentCode.phone_number ?? '';
    setErrorContent(undefined);
    setSubmitting(false);

    if(resetEmailTimer) {
      clearTimeout(resetEmailTimer);
      resetEmailTimer = undefined;
    }
    setResetEmailContent(undefined);

    let key: LangPackKey;
    let args: any[] | undefined;
    const type = sentCode.type;
    switch(type._) {
      case 'auth.sentCodeTypeSms':
      // the web client cannot attest with Play Integrity / SafetyNet, so a
      // Firebase code is nothing but an SMS from here
      case 'auth.sentCodeTypeFirebaseSms':
        key = 'Login.Code.SentSms';
        break;
      case 'auth.sentCodeTypeApp':
        key = 'Login.Code.SentInApp';
        break;
      case 'auth.sentCodeTypeCall':
        key = 'Login.Code.SentCall';
        break;
      case 'auth.sentCodeTypeMissedCall':
        key = 'Login.Code.SentMissedCall';
        args = [type.prefix];
        break;
      case 'auth.sentCodeTypeSmsWord':
      case 'auth.sentCodeTypeSmsPhrase': {
        const isWord = type._ === 'auth.sentCodeTypeSmsWord';
        if(type.beginning) {
          key = isWord ? 'Login.Code.SentSmsWordBeginning' : 'Login.Code.SentSmsPhraseBeginning';
          args = [sentCode.phone_number, type.beginning];
        } else {
          key = isWord ? 'Login.Code.SentSmsWord' : 'Login.Code.SentSmsPhrase';
          args = [sentCode.phone_number];
        }
        break;
      }
      case 'auth.sentCodeTypeFragmentSms': {
        key = 'PhoneNumber.Code.Fragment.Info';
        const a = document.createElement('a');
        setBlankToAnchor(a);
        a.href = type.url;
        args = [a];
        break;
      }
      case 'auth.sentCodeTypeEmailCode':
        key = 'Login.Code.SentEmail';
        args = [wrapEmailPattern(type.email_pattern)];
        updatePendingEmail(type);
        break;
      default:
        key = 'Login.Code.SentUnknown';
        args = [(type as any)._];
        break;
    }

    setSentTypeContent(i18n(key, args));

    resendDeadline = tsNow(true) + (sentCode.timeout || DEFAULT_RESEND_TIMEOUT);
    updateResend();

    persistSentCode();

    rebuildAnimation().catch(() => {});
  }

  /* ---------- lifecycle ---------- */

  let cancelFocus: (() => void) | undefined;
  onMount(() => {
    applySentCode();
    cancelFocus = focusWhenSettled(activeInput());
  });

  onCleanup(() => {
    cancelFocus?.();
    if(resetEmailTimer) clearTimeout(resetEmailTimer);
    stopResendTimer();
    monkey?.remove();
    player?.remove();
    disposeInput();
  });

  return (
    <AuthCard
      class={styles.pageAuthCode}
      header={
        <MediaHeader>
          <MediaHeader.Sticker element={stickerHost} size={stickerSize}/>
          <MediaHeader.Title>
            <div class={styles.phoneWrapper}>
              {phoneEl}
              {editButton}
            </div>
          </MediaHeader.Title>
          <MediaHeader.Subtitle class="secondary">{sentTypeContent()}</MediaHeader.Subtitle>
        </MediaHeader>
      }
      inputWrapper={false}
    >
      {inputHost}
      <AuthCardError content={errorContent()} />
      <Show when={inputKind() === 'text'}>
        <Button
          class={classNames('btn-primary btn-color-primary', styles.wordSubmit)}
          disabled={submitting()}
          onClick={submitTextCode}
          text="Login.Next"
        />
      </Show>
      <Show when={resendContent()}>
        <div class={styles.cardLink}>{resendContent()}</div>
      </Show>
      <Show when={resetEmailContent()}>
        <div class={styles.cardLink}>{resetEmailContent()}</div>
      </Show>
    </AuthCard>
  );
}
