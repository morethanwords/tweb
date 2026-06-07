import {createSignal, JSX, onCleanup, onMount} from 'solid-js';

import Button from '@components/buttonTsx';
import CountryInputField from '@components/countryInputField';
import LanguageChangeButton from '@components/languageChangeButton';
import PasskeyLoginButton from '@components/passkeyLoginButton';
import MediaHeader from '@components/mediaHeader';
import TelInputField from '@components/telInputField';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import App from '@config/app';
import cancelEvent from '@helpers/dom/cancelEvent';
import focusWhenConnected from '@helpers/dom/focusWhenConnected';
import placeCaretAtEnd from '@helpers/dom/placeCaretAtEnd';
import replaceContent from '@helpers/dom/replaceContent';
import {HelpCountry, HelpCountryCode} from '@layer';
import I18n, {i18n} from '@lib/langPack';
import lottieLoader from '@lib/rlottie/lottieLoader';
import AccountController from '@lib/accounts/accountController';
import {getCurrentAccount} from '@lib/accounts/getCurrentAccount';
import commonStateStorage from '@lib/commonStateStorage';
import {TrueDcId} from '@types';

import AuthCard from '@/pages/AuthCard';
import {CardSpec, useAuthFlow} from '@/pages/authFlow';
import styles from '@/pages/authFlow.module.scss';

if(import.meta.hot) import.meta.hot.accept();

type Spec = Extract<CardSpec, {name: 'signIn'}>;

/**
 * Card variant of `pageSignIn`. Country picker + tel input → `auth.sendCode` →
 * branches to authCode (default), pageIm (rare authorization-on-send case),
 * password (passkey path). Also exposes a QR-login button and the passkey
 * button. On mount kicks off `tryAgain()` — a DC pre-warming cascade — that's
 * cancelled on unmount via a local `cancelled` flag.
 */
export default function SignInCard(_props: {spec: Spec}) {
  const {managers, navigate, toIm} = useAuthFlow();

  let cancelled = false;

  /* ---------- state ---------- */

  const [submitting, setSubmitting] = createSignal(false);
  const [hasValidInput, setHasValidInput] = createSignal(false);
  const [nextContent, setNextContent] = createSignal<JSX.Element>(i18n('Login.Next'));

  /* ---------- inputs ---------- */

  let lastCountrySelected: HelpCountry | undefined;
  let lastCountryCodeSelected: HelpCountryCode | undefined;
  // True while we're mirroring a phone-driven country detection into the country
  // selector. In that case the phone field is the source of truth and must NOT be
  // reset to the bare '+code' (that would wipe a just-typed/pasted national number).
  let overriding = false;

  const countryInputField = new CountryInputField({
    onCountryChange: (country, code) => {
      lastCountrySelected = country;
      lastCountryCodeSelected = code;

      if(!code || overriding) return;

      telInputField.value = telInputField.lastValue = '+' + code.country_code;
      setTimeout(() => {
        telEl.focus();
        placeCaretAtEnd(telEl, true);
      }, 0);
    }
  });

  const telInputField = new TelInputField({
    onInput: (formatted) => {
      lottieLoader.loadLottieWorkers();

      const {country, code} = formatted || {};
      const countryName = country ? country.name || country.default_name : '';
      if(countryName !== countryInputField.value && (
        !lastCountrySelected ||
          !country ||
          !code || (
          lastCountrySelected !== country &&
            lastCountryCodeSelected.country_code !== code.country_code
        )
      )) {
        overriding = true;
        countryInputField.override(country, code, countryName);
        overriding = false;
      }

      setHasValidInput(!!(country || (telInputField.value.length - 1) > 1));
    }
  });

  const telEl = telInputField.input;
  telEl.addEventListener('keypress', (e) => {
    if(hasValidInput() && !submitting() && e.key === 'Enter') {
      return onSubmit();
    }
  });

  /* ---------- submit ---------- */

  function onSubmit(e?: Event) {
    if(e) cancelEvent(e);

    setSubmitting(true);
    setNextContent(
      <>
        {i18n('PleaseWait')}
        <svg xmlns="http://www.w3.org/2000/svg" class="preloader-circular" viewBox="25 25 50 50">
          <circle class="preloader-path" cx="50" cy="50" r="20" fill="none" stroke-miterlimit="10"/>
        </svg>
      </>
    );

    const phone_number = telInputField.value;
    managers.apiManager.invokeApi('auth.sendCode', {
      phone_number,
      api_id: App.id,
      api_hash: App.hash,
      settings: {
        _: 'codeSettings',
        pFlags: {}
      }
    }).then(async(code) => {
      if(code._ === 'auth.sentCodeSuccess') {
        const {authorization} = code;
        if(authorization._ === 'auth.authorization') {
          await managers.apiManager.setUser(authorization.user);
          toIm();
          return;
        }
      }

      navigate({
        name: 'authCode',
        payload: Object.assign(code as any, {phone_number}) // sentCode + phone_number
      });
    }).catch((err) => {
      setSubmitting(false);

      switch(err.type) {
        case 'PHONE_NUMBER_INVALID':
          telInputField.setError();
          replaceContent(telInputField.label, i18n('Login.PhoneLabelInvalid'));
          telEl.classList.add('error');
          setNextContent(i18n('Login.Next'));
          break;
        default:
          console.error('auth.sendCode error:', err);
          setNextContent(err.type);
          break;
      }
    });
  }

  /* ---------- DC pre-warm cascade ---------- */

  function tryAgain() {
    managers.apiManager.invokeApi('help.getNearestDc').then((nearestDcResult) => {
      if(cancelled) return nearestDcResult;

      const langPack = commonStateStorage.getFromCache('langPack');
      if(langPack && !langPack.countries?.hash) {
        I18n.getLangPackAndApply(langPack.lang_code).then(() => {
          if(!cancelled) telInputField.simulateInputEvent();
        });
      }

      const dcs = new Set([1, 2, 3, 4, 5]);
      const done: number[] = [nearestDcResult.this_dc];

      let promise: Promise<any>;
      if(nearestDcResult.nearest_dc !== nearestDcResult.this_dc) {
        promise = managers.apiManager.getNetworkerVoid(nearestDcResult.nearest_dc).then(() => {
          done.push(nearestDcResult.nearest_dc);
        });
      }

      (promise || Promise.resolve()).then(() => {
        if(cancelled) return;

        done.forEach((dcId) => dcs.delete(dcId));

        const _dcs = [...dcs];
        const g = async(): Promise<void> => {
          if(cancelled) return;
          const dcId = _dcs.shift();
          if(!dcId) return;

          const accountData = await AccountController.get(getCurrentAccount());
          const key = accountData[`dc${dcId as TrueDcId}_auth_key`];

          if(key) return g();

          // ! если одновременно запросить все нетворкеры, не будет проходить запрос на код
          setTimeout(() => {
            if(cancelled) return;
            managers.apiManager.getNetworkerVoid(dcId).finally(g);
          }, 3000);
        };

        g();
      });

      return nearestDcResult;
    }).then((nearestDcResult) => {
      if(cancelled) return;
      if(!countryInputField.value.length && !telInputField.value.length) {
        countryInputField.selectCountryByIso2(nearestDcResult.country);
      }
    });
  }

  /* ---------- lifecycle ---------- */

  let cancelFocus: (() => void) | undefined;
  onMount(() => {
    managers.appStateManager.pushToState('authState', {_: 'authStateSignIn'});

    if(!IS_TOUCH_SUPPORTED) {
      cancelFocus = focusWhenConnected(telEl, () => !cancelled);
    }

    tryAgain();
  });

  onCleanup(() => {
    cancelled = true;
    cancelFocus?.();
  });

  /* ---------- render ---------- */

  return (
    <AuthCard
      class={styles.pageSignIn}
      header={
        <MediaHeader>
          <MediaHeader.Sticker
            class={styles.logoContainer}
            size={120}
            element={
              <svg class={styles.logo} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
                <use href="#logo"/>
              </svg>
            }
          />
          <MediaHeader.Title>{i18n('Login.Title')}</MediaHeader.Title>
          <MediaHeader.Subtitle class="secondary">{i18n('Login.StartText')}</MediaHeader.Subtitle>
        </MediaHeader>
      }
      inputWrapper={false}
    >
      <div class="input-wrapper">
        {countryInputField.container}
        {telInputField.container}
        <Button
          class="btn-primary btn-color-primary"
          disabled={!hasValidInput() || submitting()}
          onClick={onSubmit}
        >
          {nextContent()}
        </Button>
        {getCurrentAccount() === 1 && <LanguageChangeButton />}
      </div>
      <Button
        class="btn-primary btn-secondary btn-primary-transparent primary"
        disabled={submitting()}
        onClick={() => navigate({name: 'signQR'})}
        text="Login.QR.Login"
      />
      <PasskeyLoginButton disabled={submitting()} />
    </AuthCard>
  );
}
