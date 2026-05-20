/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {JSX, Show, createSignal, onCleanup, onMount} from 'solid-js';

import CodeInputFieldCompat from '@components/codeInputField';
import Icon from '@components/icon';
import TrackingMonkey from '@components/monkeys/tracking';
import {wrapEmailPattern} from '@components/popups/emailSetup';
import {SimpleConfirmationPopup} from '@components/popups/simpleConfirmation';
import MediaHeader from '@components/mediaHeader';
import {toastNew} from '@components/toast';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import anchorCallback from '@helpers/dom/anchorCallback';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import focusWhenConnected from '@helpers/dom/focusWhenConnected';
import replaceContent from '@helpers/dom/replaceContent';
import formatDuration from '@helpers/formatDuration';
import mediaSizes from '@helpers/mediaSizes';
import {fastRaf} from '@helpers/schedulers';
import tsNow from '@helpers/tsNow';
import {AuthSentCode, AuthSentCodeType, AuthSignIn} from '@layer';
import {LangPackKey, i18n} from '@lib/langPack';
import setBlankToAnchor from '@lib/richTextProcessor/setBlankToAnchor';
import lottieLoader from '@lib/rlottie/lottieLoader';
import RLottiePlayer from '@lib/rlottie/rlottiePlayer';
import ctx from '@environment/ctx';

import AuthCard from '@/pages/AuthCard';
import {CardSpec, useAuthFlow} from '@/pages/authFlow';
import styles from '@/pages/authFlow.module.scss';

if(import.meta.hot) import.meta.hot.accept();

type Spec = Extract<CardSpec, {name: 'authCode'}>;

/**
 * Card variant of `pageAuthCode`. Shows the 6-digit code input under either a
 * `TrackingMonkey` (default) or a Jolly Roger lottie (`fragmentSms`). Branches:
 *
 * - `auth.signIn` → success → IM
 * - `authorizationSignUpRequired` → signUp card
 * - `SESSION_PASSWORD_NEEDED` → password card
 *
 * `auth.resetLoginEmail` updates `sentCode` in-place (rebuilding the animation
 * + subtitle inline) instead of bouncing through the navigation system, which
 * would flash the card.
 */
export default function AuthCodeCard(props: {spec: Spec}) {
  const {managers, navigate, toIm} = useAuthFlow();

  /* ---------- state ---------- */

  let sentCode: AuthSentCode.authSentCode & {phone_number?: string} = props.spec.payload;

  const [sentTypeContent, setSentTypeContent] = createSignal<JSX.Element>();
  const [resetEmailContent, setResetEmailContent] = createSignal<JSX.Element>();

  // Persistent host for the rebuildable monkey/lottie. We hand this to
  // <MediaHeader.Sticker element={...}>; `rebuildAnimation()` then mutates
  // its children whenever the sentCode type changes.
  const stickerHost = document.createElement('div');
  const stickerSize = mediaSizes.isMobile ? 100 : 130;

  let monkey: TrackingMonkey | undefined;
  let player: RLottiePlayer | undefined;
  let resetEmailTimer: number | undefined;

  const codeInputErrorLabel = document.createElement('div');
  codeInputErrorLabel.classList.add(styles.errorLabel);

  /* ---------- header pieces (mutated imperatively in applySentCode) ---------- */

  const phoneEl = document.createElement('h4');
  phoneEl.classList.add(styles.phone);

  const editButton = document.createElement('span');
  editButton.classList.add(styles.phoneEdit);
  editButton.append(Icon('edit'));
  attachClickEvent(editButton, () => navigate({name: 'signIn'}));

  /* ---------- code input ---------- */

  const initialLength = (sentCode.type as AuthSentCodeType.authSentCodeTypeApp).length;
  const codeInputField = new CodeInputFieldCompat({
    length: initialLength,
    onChange: () => {
      codeInputField.error = false;
      replaceContent(codeInputErrorLabel, '');
    },
    onFill: (code) => submitCode(code),
    class: styles.codeInputField
  });

  /* ---------- submission ---------- */

  function submitCode(code: string) {
    codeInputField.disabled = true;

    const params: AuthSignIn = {
      phone_number: sentCode.phone_number,
      phone_code_hash: sentCode.phone_code_hash,
      phone_code: code
    };

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
            codeInputField.value = '';
          }, 300);
          break;
        case 'PHONE_CODE_EXPIRED':
          codeInputField.error = true;
          replaceContent(codeInputErrorLabel, i18n('PHONE_CODE_EXPIRED'));
          break;
        case 'PHONE_CODE_EMPTY':
        case 'PHONE_CODE_INVALID':
          codeInputField.error = true;
          replaceContent(codeInputErrorLabel, i18n('PHONE_CODE_INVALID'));
          break;
        default:
          codeInputField.error = true;
          replaceContent(codeInputErrorLabel, err.type);
          break;
      }

      codeInputField.disabled = false;

      if(!good) {
        codeInputField.value = '';
        fastRaf(() => codeInputField.input.focus());
      }
    });
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

    monkey = new TrackingMonkey(codeInputField, stickerSize);
    stickerHost.append(monkey.container);
    return monkey.load();
  }

  /* ---------- email reset flow ---------- */

  function handleResetEmail() {
    managers.apiManager.invokeApi('auth.resetLoginEmail', {
      phone_number: sentCode.phone_number,
      phone_code_hash: sentCode.phone_code_hash
    }).then((code) => {
      if(code._ === 'auth.sentCode') {
        sentCode = Object.assign(code, {phone_number: sentCode.phone_number});
        if(sentCode.type._ === 'auth.sentCodeTypeEmailCode') {
          updatePendingEmail(sentCode.type);
        } else {
          applySentCode();
        }
      } else {
        console.error(code);
        toastNew({langPackKey: 'Error.AnError'});
      }
    }).catch((err: ApiError) => {
      if(err.type.includes('TASK_ALREADY_EXISTS')) {
        SimpleConfirmationPopup.show({
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
          SimpleConfirmationPopup.show({
            titleLangKey: 'Login.ResetEmail.Title',
            descriptionLangKey: 'Login.ResetEmail.Text',
            descriptionArgs: [wrapFormattedDuration(formatDuration(type.reset_available_period, 2))],
            button: {langKey: 'Login.ResetEmail.Title'}
          }).then(() => handleResetEmail());
        })
      ]));
    }
  }

  /* ---------- apply current `sentCode` to DOM (subtitle, phone, length, animation, state) ---------- */

  function applySentCode() {
    const length = (sentCode.type as AuthSentCodeType.authSentCodeTypeApp).length;
    codeInputField.options.length = length;
    codeInputField.value = '';

    phoneEl.innerText = sentCode.phone_number ?? '';

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
        key = 'Login.Code.SentSms';
        break;
      case 'auth.sentCodeTypeApp':
        key = 'Login.Code.SentInApp';
        break;
      case 'auth.sentCodeTypeCall':
        key = 'Login.Code.SentCall';
        break;
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

    managers.appStateManager.pushToState('authState', {_: 'authStateAuthCode', sentCode});

    rebuildAnimation().catch(() => {});
  }

  /* ---------- lifecycle ---------- */

  let cancelFocus: (() => void) | undefined;
  onMount(() => {
    applySentCode();
    cancelFocus = focusWhenConnected(codeInputField.input);
  });

  onCleanup(() => {
    cancelFocus?.();
    if(resetEmailTimer) clearTimeout(resetEmailTimer);
    monkey?.remove();
    player?.remove();
    codeInputField.cleanup();
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
      {codeInputField.container}
      {codeInputErrorLabel}
      <Show when={resetEmailContent()}>
        <div class={styles.forgotLink}>{resetEmailContent()}</div>
      </Show>
    </AuthCard>
  );
}
