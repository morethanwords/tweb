/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {putPreloader} from '../components/putPreloader';
import Page from './page';
import Button from '../components/button';
import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import App from '../config/app';
import I18n, {_i18n, i18n} from '../lib/langPack';
import lottieLoader from '../lib/rlottie/lottieLoader';
import ripple from '../components/ripple';
import pageSignQR from './pageSignQR';
import getLanguageChangeButton from '../components/languageChangeButton';
import cancelEvent from '../helpers/dom/cancelEvent';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import replaceContent from '../helpers/dom/replaceContent';
import toggleDisability from '../helpers/dom/toggleDisability';
import {TrueDcId} from '../types';
import placeCaretAtEnd from '../helpers/dom/placeCaretAtEnd';
import {HelpCountry, HelpCountryCode} from '../layer';
import rootScope from '../lib/rootScope';
import TelInputField from '../components/telInputField';
import CountryInputField from '../components/countryInputField';
import {getCurrentAccount} from '../lib/accounts/getCurrentAccount';
import AccountController from '../lib/accounts/accountController';
import commonStateStorage from '../lib/commonStateStorage';

// import _countries from '../countries_pretty.json';
let btnNext: HTMLButtonElement = null, btnQr: HTMLButtonElement;

const onFirstMount = () => {
  /* if(Modes.test) {
    Countries.push({
      _: 'help.country',
      default_name: 'Test Country',
      country_codes: [{
        _: 'help.countryCode',
        country_code: '999 66',
        patterns: ['999 66 XXX XX']
      }],
      iso2: 'KK'
    });

    console.log('Added test country to list!');
  } */

  // const countries: Country[] = _countries.default.filter((c) => c.emoji);
  // const countries: Country[] = Countries.filter((c) => c.emoji).sort((a, b) => a.name.localeCompare(b.name));
  // const countries = I18n.countriesList.filter((country) => !country.pFlags?.hidden);

  const inputWrapper = document.createElement('div');
  inputWrapper.classList.add('input-wrapper');

  let lastCountrySelected: HelpCountry, lastCountryCodeSelected: HelpCountryCode;
  const countryInputField = new CountryInputField({
    onCountryChange: (country, code) => {
      lastCountrySelected = country, lastCountryCodeSelected = code;

      if(!code) {
        return;
      }

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
      const countryName = country ? country.name || country.default_name : ''/* 'Unknown' */;
      if(countryName !== countryInputField.value && (
        !lastCountrySelected ||
          !country ||
          !code || (
          lastCountrySelected !== country &&
            lastCountryCodeSelected.country_code !== code.country_code
        )
      )
      ) {
        countryInputField.override(country, code, countryName);
      }

      // if(country && (telInputField.value.length - 1) >= (country.pattern ? country.pattern.length : 9)) {
      if(country || (telInputField.value.length - 1) > 1) {
        btnNext.style.visibility = '';
      } else {
        btnNext.style.visibility = 'hidden';
      }
    }
  });

  const telEl = telInputField.input;

  telEl.addEventListener('keypress', (e) => {
    // console.log('keypress', this.value);
    if(!btnNext.style.visibility &&/* this.value.length >= 9 && */ e.key === 'Enter') {
      return onSubmit();
    }
  });

  /* telEl.addEventListener('focus', function(this: typeof telEl, e) {
    this.removeAttribute('readonly'); // fix autocomplete
  });*/

  btnNext = Button('btn-primary btn-color-primary', {text: 'Login.Next'});
  btnNext.style.visibility = 'hidden';

  const onSubmit = (e?: Event) => {
    if(e) {
      cancelEvent(e);
    }

    const toggle = toggleDisability([/* telEl, countryInput,  */btnNext, btnQr], true);

    replaceContent(btnNext, i18n('PleaseWait'));
    putPreloader(btnNext);

    // return;

    const phone_number = telInputField.value;
    rootScope.managers.apiManager.invokeApi('auth.sendCode', {
      phone_number: phone_number,
      api_id: App.id,
      api_hash: App.hash,
      settings: {
        _: 'codeSettings', // that's how we sending Type
        pFlags: {}
      }
      // lang_code: navigator.language || 'en'
    }).then(async(code) => {
      // console.log('got code', code);

      if(code._ === 'auth.sentCodeSuccess') {
        const {authorization} = code;
        if(authorization._ === 'auth.authorization') {
          await rootScope.managers.apiManager.setUser(authorization.user);

          import('./pageIm').then((m) => {
            m.default.mount();
          });
        }
      }

      import('./pageAuthCode').then((m) => m.default.mount(Object.assign(code, {phone_number: phone_number})));
    }).catch((err) => {
      toggle();

      switch(err.type) {
        case 'PHONE_NUMBER_INVALID':
          telInputField.setError();
          replaceContent(telInputField.label, i18n('Login.PhoneLabelInvalid'));
          telEl.classList.add('error');
          replaceContent(btnNext, i18n('Login.Next'));
          break;
        default:
          console.error('auth.sendCode error:', err);
          btnNext.innerText = err.type;
          break;
      }
    });
  };

  attachClickEvent(btnNext, onSubmit);

  btnQr = Button('btn-primary btn-secondary btn-primary-transparent primary', {text: 'Login.QR.Login'});

  const qrMounted = false;
  btnQr.addEventListener('click', () => {
    pageSignQR.mount();
    /* const promise = import('./pageSignQR');
    btnQr.disabled = true;

    let preloaderDiv: HTMLElement;
    if(!qrMounted) {
      preloaderDiv = putPreloader(btnQr);
      qrMounted = true;
    }

    promise.then((module) => {
      module.default.mount();

      setTimeout(() => {
        btnQr.removeAttribute('disabled');
        if(preloaderDiv) {
          preloaderDiv.remove();
        }
      }, 200);
    }); */
  });

  inputWrapper.append(countryInputField.container, telInputField.container, btnNext, btnQr);

  const h4 = document.createElement('h4');
  h4.classList.add('text-center');
  _i18n(h4, 'Login.Title');

  const subtitle = document.createElement('div');
  subtitle.classList.add('subtitle', 'text-center');
  _i18n(subtitle, 'Login.StartText');

  page.pageEl.querySelector('.container').append(h4, subtitle, inputWrapper);

  const tryAgain = () => {
    rootScope.managers.apiManager.invokeApi('help.getNearestDc').then((nearestDcResult) => {
      const langPack = commonStateStorage.getFromCache('langPack');
      if(langPack && !langPack.countries?.hash) {
        I18n.getLangPack(langPack.lang_code).then(() => {
          telInputField.simulateInputEvent();
        });
      }

      const dcs = new Set([1, 2, 3, 4, 5]);
      const done: number[] = [nearestDcResult.this_dc];

      let promise: Promise<any>;
      if(nearestDcResult.nearest_dc !== nearestDcResult.this_dc) {
        promise = rootScope.managers.apiManager.getNetworkerVoid(nearestDcResult.nearest_dc).then(() => {
          done.push(nearestDcResult.nearest_dc);
        });
      }

      (promise || Promise.resolve()).then(() => {
        done.forEach((dcId) => {
          dcs.delete(dcId);
        });

        const _dcs = [...dcs];
        const g = async(): Promise<void> => {
          const dcId = _dcs.shift();
          if(!dcId) return;

          const accountData = await AccountController.get(getCurrentAccount());
          const key = accountData?.[`dc${dcId as TrueDcId}_auth_key`];

          if(key) {
            return g();
          }

          setTimeout(() => { // * если одновременно запросить все нетворкеры, не будет проходить запрос на код
            rootScope.managers.apiManager.getNetworkerVoid(dcId/* , {fileDownload: true} */).finally(g);
          }, /* done.includes(dcId) ? 0 :  */3000);
        };

        g();
      });

      return nearestDcResult;
    }).then((nearestDcResult) => {
      if(!countryInputField.value.length && !telInputField.value.length) {
        countryInputField.selectCountryByIso2(nearestDcResult.country);
      }

      // console.log('woohoo', nearestDcResult, country);
    })// .catch(tryAgain);
  };

  if(!IS_TOUCH_SUPPORTED) {
    setTimeout(() => {
      telEl.focus();
    }, 0);
  }

  if(getCurrentAccount() === 1) {
    getLanguageChangeButton(inputWrapper);
  }

  tryAgain();
};

const page = new Page('page-sign', true, onFirstMount, () => {
  if(btnNext) {
    replaceContent(btnNext, i18n('Login.Next'));
    ripple(btnNext, undefined, undefined, true);
    btnNext.removeAttribute('disabled');
  }

  if(btnQr) {
    btnQr.removeAttribute('disabled');
  }

  rootScope.managers.appStateManager.pushToState('authState', {_: 'authStateSignIn'});
});

export default page;
