/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { putPreloader } from "../components/misc";
import Scrollable from '../components/scrollable';
import appStateManager from "../lib/appManagers/appStateManager";
import apiManager from "../lib/mtproto/mtprotoworker";
import { RichTextProcessor } from '../lib/richtextprocessor';
import Page from "./page";
import InputField from "../components/inputField";
import CheckboxField from "../components/checkboxField";
import Button from "../components/button";
import fastSmoothScroll from "../helpers/fastSmoothScroll";
import { IS_TOUCH_SUPPORTED } from "../environment/touchSupport";
import App from "../config/app";
import I18n, { _i18n, i18n } from "../lib/langPack";
import lottieLoader from "../lib/rlottie/lottieLoader";
import ripple from "../components/ripple";
import findUpTag from "../helpers/dom/findUpTag";
import findUpClassName from "../helpers/dom/findUpClassName";
import { randomLong } from "../helpers/random";
import AppStorage from "../lib/storage";
import CacheStorageController from "../lib/cacheStorage";
import pageSignQR from "./pageSignQR";
import getLanguageChangeButton from "../components/languageChangeButton";
import cancelEvent from "../helpers/dom/cancelEvent";
import { attachClickEvent } from "../helpers/dom/clickEvent";
import replaceContent from "../helpers/dom/replaceContent";
import toggleDisability from "../helpers/dom/toggleDisability";
import sessionStorage from "../lib/sessionStorage";
import { DcAuthKey } from "../types";
import placeCaretAtEnd from "../helpers/dom/placeCaretAtEnd";
import { HelpCountry, HelpCountryCode } from "../layer";
import { getCountryEmoji } from "../vendor/emoji";
import simulateEvent from "../helpers/dom/dispatchEvent";
import stateStorage from "../lib/stateStorage";
import rootScope from "../lib/rootScope";
import TelInputField from "../components/telInputField";
import IS_EMOJI_SUPPORTED from "../environment/emojiSupport";
import setInnerHTML from "../helpers/dom/setInnerHTML";

//import _countries from '../countries_pretty.json';
let btnNext: HTMLButtonElement = null, btnQr: HTMLButtonElement;

let onFirstMount = () => {
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

  //const countries: Country[] = _countries.default.filter(c => c.emoji);
  // const countries: Country[] = Countries.filter(c => c.emoji).sort((a, b) => a.name.localeCompare(b.name));
  // const countries = I18n.countriesList.filter(country => !country.pFlags?.hidden);
  const setCountries = () => {
    countries = I18n.countriesList
    .filter(country => !country.pFlags?.hidden)
    .sort((a, b) => (a.name || a.default_name).localeCompare(b.name || b.default_name));
  };
  let countries: HelpCountry.helpCountry[]; 

  setCountries();

  rootScope.addEventListener('language_change', () => {
    setCountries();
  });

  const liMap: Map<string, HTMLLIElement[]> = new Map();

  let lastCountrySelected: HelpCountry, lastCountryCodeSelected: HelpCountryCode;

  const inputWrapper = document.createElement('div');
  inputWrapper.classList.add('input-wrapper');

  const countryInputField = new InputField({
    label: 'Login.CountrySelectorLabel',
    name: randomLong()
  });

  countryInputField.container.classList.add('input-select');

  const countryInput = countryInputField.input;
  // countryInput.autocomplete = randomLong();

  const selectWrapper = document.createElement('div');
  selectWrapper.classList.add('select-wrapper', 'z-depth-3', 'hide');

  const arrowDown = document.createElement('span');
  arrowDown.classList.add('arrow', 'arrow-down');
  countryInputField.container.append(arrowDown);

  const selectList = document.createElement('ul');
  selectWrapper.appendChild(selectList);

  const scroll = new Scrollable(selectWrapper);

  let initSelect = () => {
    initSelect = null;

    countries.forEach((c) => {
      const emoji = getCountryEmoji(c.iso2);

      const liArr: Array<HTMLLIElement> = [];
      c.country_codes.forEach((countryCode) => {
        const li = document.createElement('li');

        let wrapped = RichTextProcessor.wrapEmojiText(emoji);
        if(IS_EMOJI_SUPPORTED) {
          const spanEmoji = document.createElement('span');
          setInnerHTML(spanEmoji, wrapped);
          li.append(spanEmoji);
        } else {
          setInnerHTML(li, wrapped);
        }
        
        const el = i18n(c.default_name as any);
        el.dataset.defaultName = c.default_name;
        li.append(el);

        const span = document.createElement('span');
        span.classList.add('phone-code');
        span.innerText = '+' + countryCode.country_code;
        li.appendChild(span);

        liArr.push(li);
        selectList.append(li);
      });

      liMap.set(c.iso2, liArr);
    });
    
    selectList.addEventListener('mousedown', (e) => {
      if(e.button !== 0) { // other buttons but left shall not pass
        return;
      }
      
      const target = findUpTag(e.target, 'LI')
      selectCountryByTarget(target);
      //console.log('clicked', e, countryName, phoneCode);
    });

    countryInputField.container.appendChild(selectWrapper);
  };

  const selectCountryByTarget = (target: HTMLElement) => {
    const defaultName = (target.childNodes[1] as HTMLElement).dataset.defaultName;
    const phoneCode = target.querySelector<HTMLElement>('.phone-code').innerText;
    const countryCode = phoneCode.replace(/\D/g, '');

    replaceContent(countryInput, i18n(defaultName as any));
    simulateEvent(countryInput, 'input');
    lastCountrySelected = countries.find(c => c.default_name === defaultName);
    lastCountryCodeSelected = lastCountrySelected.country_codes.find(_countryCode => _countryCode.country_code === countryCode);
    
    telInputField.value = telInputField.lastValue = phoneCode;
    hidePicker();
    setTimeout(() => {
      telEl.focus();
      placeCaretAtEnd(telEl, true);
    }, 0);
  };
  
  initSelect();

  let hideTimeout: number;

  countryInput.addEventListener('focus', function(this: typeof countryInput, e) {
    if(initSelect) {
      initSelect();
    } else {
      countries.forEach((c) => {
        liMap.get(c.iso2).forEach(li => li.style.display = '');
      });
    }

    clearTimeout(hideTimeout);
    hideTimeout = undefined;

    selectWrapper.classList.remove('hide');
    void selectWrapper.offsetWidth; // reflow
    selectWrapper.classList.add('active');

    countryInputField.select();

    fastSmoothScroll({
      container: page.pageEl.parentElement.parentElement, 
      element: countryInput, 
      position: 'start', 
      margin: 4
    });

    setTimeout(() => {
      if(!mouseDownHandlerAttached) {
        document.addEventListener('mousedown', onMouseDown, {capture: true});
        mouseDownHandlerAttached = true;
      }
    }, 0);
  });

  let mouseDownHandlerAttached = false;
  const onMouseDown = (e: MouseEvent) => {
    if(findUpClassName(e.target, 'input-select')) {
      return;
    }
    if(e.target === countryInput) {
      return;
    }

    hidePicker();
    document.removeEventListener('mousedown', onMouseDown, {capture: true});
    mouseDownHandlerAttached = false;
  };

  const hidePicker = () => {
    if(hideTimeout !== undefined) return;
    selectWrapper.classList.remove('active');
    hideTimeout = window.setTimeout(() => {
      selectWrapper.classList.add('hide');
      hideTimeout = undefined;
    }, 200);
  };
  /* false && countryInput.addEventListener('blur', function(this: typeof countryInput, e) {
    hidePicker();
    
    e.cancelBubble = true;
  }, {capture: true}); */

  countryInput.addEventListener('keyup', (e) => {
    const key = e.key;
    if(e.ctrlKey || key === 'Control') return false;

    //let i = new RegExp('^' + this.value, 'i');
    let _value = countryInputField.value.toLowerCase();
    let matches: HelpCountry[] = [];
    countries.forEach((c) => {
      const names = [
        c.name, 
        c.default_name,
        c.iso2
      ];

      names.filter(Boolean).forEach(name => {
        const abbr = name.split(' ').filter(word => /\w/.test(word)).map(word => word[0]).join('');
        if(abbr.length > 1) {
          names.push(abbr);
        }
      });

      let good = !!names.filter(Boolean).find(str => str.toLowerCase().indexOf(_value) !== -1)/*  === 0 */;//i.test(c.name);

      liMap.get(c.iso2).forEach(li => li.style.display = good ? '' : 'none');
      if(good) matches.push(c);
    });

    // Код ниже автоматически выберет страну если она осталась одна при поиске
    /* if(matches.length === 1 && matches[0].li.length === 1) {
      if(matches[0].name === lastCountrySelected) return false;
      //console.log('clicking', matches[0]);

      var clickEvent = document.createEvent('MouseEvents');
      clickEvent.initEvent('mousedown', true, true);
      matches[0].li[0].dispatchEvent(clickEvent);
      return false;
    } else  */if(matches.length === 0) {
      countries.forEach((c) => {
        liMap.get(c.iso2).forEach(li => li.style.display = '');
      });
    } else if(matches.length === 1 && key === 'Enter') {
      selectCountryByTarget(liMap.get(matches[0].iso2)[0]);
    }
  });

  arrowDown.addEventListener('mousedown', function(this: typeof arrowDown, e) {
    e.cancelBubble = true;
    e.preventDefault();
    if(countryInput.matches(':focus')) countryInput.blur();
    else countryInput.focus();
  });

  const telInputField = new TelInputField({
    onInput: (formatted) => {
      lottieLoader.loadLottieWorkers();

      const {country, code} = formatted || {};
      let countryName = country ? country.name || country.default_name : ''/* 'Unknown' */;
      if(countryName !== countryInputField.value && (
          !lastCountrySelected || 
          !country ||
          !code || (
            lastCountrySelected !== country && 
            lastCountryCodeSelected.country_code !== code.country_code
          )
        )
      ) {
        replaceContent(countryInput, country ? i18n(country.default_name as any) : countryName);
        lastCountrySelected = country;
        lastCountryCodeSelected = code;
      }
  
      //if(country && (telInputField.value.length - 1) >= (country.pattern ? country.pattern.length : 9)) {
      if(country || (telInputField.value.length - 1) > 1) {
        btnNext.style.visibility = '';
      } else {
        btnNext.style.visibility = 'hidden';
      }
    }
  });

  const telEl = telInputField.input;

  telEl.addEventListener('keypress', (e) => {
    //console.log('keypress', this.value);
    if(!btnNext.style.visibility &&/* this.value.length >= 9 && */ e.key === 'Enter') {
      return onSubmit();
    }
  });

  /* telEl.addEventListener('focus', function(this: typeof telEl, e) {
    this.removeAttribute('readonly'); // fix autocomplete
  });*/

  const signedCheckboxField = new CheckboxField({
    text: 'Login.KeepSigned', 
    name: 'keepSession',
    withRipple: true,
    checked: true
  });

  signedCheckboxField.input.addEventListener('change', () => {
    const keepSigned = signedCheckboxField.checked;
    appStateManager.pushToState('keepSigned', keepSigned);
    
    AppStorage.toggleStorage(keepSigned);
    CacheStorageController.toggleStorage(keepSigned);
    apiManager.toggleStorage(keepSigned);
    sessionStorage.toggleStorage(keepSigned);
  });

  appStateManager.getState().then(state => {
    if(!appStateManager.storage.isAvailable()) {
      signedCheckboxField.checked = false;
      signedCheckboxField.label.classList.add('checkbox-disabled');
    } else {
      signedCheckboxField.checked = state.keepSigned;
    }
  });

  btnNext = Button('btn-primary btn-color-primary', {text: 'Login.Next'});
  btnNext.style.visibility = 'hidden';

  const onSubmit = (e?: Event) => {
    if(e) {
      cancelEvent(e);
    }

    const toggle = toggleDisability([/* telEl, countryInput,  */btnNext, btnQr], true);

    replaceContent(btnNext, i18n('PleaseWait'));
    putPreloader(btnNext);

    //return;

    let phone_number = telInputField.value;
    apiManager.invokeApi('auth.sendCode', {
      phone_number: phone_number,
      api_id: App.id,
      api_hash: App.hash,
      settings: {
        _: 'codeSettings' // that's how we sending Type
      }
      //lang_code: navigator.language || 'en'
    }).then((code) => {
      //console.log('got code', code);

      import('./pageAuthCode').then(m => m.default.mount(Object.assign(code, {phone_number: phone_number})));
    }).catch(err => {
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

  let qrMounted = false;
  btnQr.addEventListener('click', () => {
    pageSignQR.mount();
    /* const promise = import('./pageSignQR');
    btnQr.disabled = true;

    let preloaderDiv: HTMLElement;
    if(!qrMounted) {
      preloaderDiv = putPreloader(btnQr);
      qrMounted = true;
    }

    promise.then(module => {
      module.default.mount();

      setTimeout(() => {
        btnQr.removeAttribute('disabled');
        if(preloaderDiv) {
          preloaderDiv.remove();
        }
      }, 200);
    }); */
  });

  inputWrapper.append(countryInputField.container, telInputField.container, signedCheckboxField.label, btnNext, btnQr);

  const h4 = document.createElement('h4');
  h4.classList.add('text-center');
  _i18n(h4, 'Login.Title');

  const subtitle = document.createElement('div');
  subtitle.classList.add('subtitle', 'text-center');
  _i18n(subtitle, 'Login.StartText');

  page.pageEl.querySelector('.container').append(h4, subtitle, inputWrapper);

  let tryAgain = () => {
    apiManager.invokeApi('help.getNearestDc').then((nearestDcResult) => {
      const langPack = stateStorage.getFromCache('langPack');
      if(langPack && !langPack.countries?.hash) {
        I18n.getLangPack(langPack.lang_code).then(() => {
          simulateEvent(telEl, 'input');
        });
      }

      const dcs = new Set([1, 2, 3, 4, 5]);
      const done: number[] = [nearestDcResult.this_dc];

      let promise: Promise<any>;
      if(nearestDcResult.nearest_dc !== nearestDcResult.this_dc) {
        promise = apiManager.getNetworker(nearestDcResult.nearest_dc).then(() => {
          done.push(nearestDcResult.nearest_dc);
        });
      }

      (promise || Promise.resolve()).then(() => {
        done.forEach(dcId => {
          dcs.delete(dcId);
        });

        const _dcs = [...dcs];
        const g = async(): Promise<void> => {
          const dcId = _dcs.shift();
          if(!dcId) return;

          const dbKey: DcAuthKey = `dc${dcId}_auth_key` as any;
          const key = await sessionStorage.get(dbKey);
          if(key) {
            return g();
          }

          setTimeout(() => { // * если одновременно запросить все нетворкеры, не будет проходить запрос на код
            apiManager.getNetworker(dcId/* , {fileDownload: true} */).finally(g);
          }, /* done.includes(dcId) ? 0 :  */3000);
        };
        
        g();
      });
      
      return nearestDcResult;
    }).then((nearestDcResult) => {
      if(!countryInputField.value.length && !telInputField.value.length) {
        selectCountryByTarget(liMap.get(nearestDcResult.country)[0]);
      }
  
      //console.log('woohoo', nearestDcResult, country);
    })//.catch(tryAgain);
  };

  if(!IS_TOUCH_SUPPORTED) {
    setTimeout(() => {
      telEl.focus();
    }, 0);
  }

  getLanguageChangeButton(inputWrapper);

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

  appStateManager.pushToState('authState', {_: 'authStateSignIn'});
});

export default page;
