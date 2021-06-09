/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { formatPhoneNumber, putPreloader } from "../components/misc";
import Scrollable from '../components/scrollable';
import Countries, { Country as _Country } from "../countries";
import appStateManager from "../lib/appManagers/appStateManager";
import apiManager from "../lib/mtproto/mtprotoworker";
import { RichTextProcessor } from '../lib/richtextprocessor';
import Page from "./page";
import InputField from "../components/inputField";
import CheckboxField from "../components/checkboxField";
import Button from "../components/button";
import { isAppleMobile } from "../helpers/userAgent";
import fastSmoothScroll from "../helpers/fastSmoothScroll";
import { isTouchSupported } from "../helpers/touchSupport";
import App from "../config/app";
import Modes from "../config/modes";
import { _i18n, i18n } from "../lib/langPack";
import lottieLoader from "../lib/lottieLoader";
import { ripple } from "../components/ripple";
import findUpTag from "../helpers/dom/findUpTag";
import findUpClassName from "../helpers/dom/findUpClassName";
import { randomLong } from "../helpers/random";
import AppStorage from "../lib/storage";
import CacheStorageController from "../lib/cacheStorage";
import pageSignQR from "./pageSignQR";
import getLanguageChangeButton from "../components/languageChangeButton";
import { cancelEvent } from "../helpers/dom/cancelEvent";
import { attachClickEvent } from "../helpers/dom/clickEvent";
import replaceContent from "../helpers/dom/replaceContent";
import toggleDisability from "../helpers/dom/toggleDisability";

type Country = _Country & {
  li?: HTMLLIElement[]
};

//import _countries from '../countries_pretty.json';
let btnNext: HTMLButtonElement = null, btnQr: HTMLButtonElement;

let onFirstMount = () => {
  if(Modes.test) {
    Countries.push({
      name: 'Test Country',
      phoneCode: '999 66',
      code: 'TC',
      emoji: '🤔',
      pattern: '999 66 XXX XX'
    });
  
    console.log('Added test country to list!');
  }

  //const countries: Country[] = _countries.default.filter(c => c.emoji);
  const countries: Country[] = Countries.filter(c => c.emoji).sort((a, b) => a.name.localeCompare(b.name));

  let lastCountrySelected: Country = null;

  const inputWrapper = document.createElement('div');
  inputWrapper.classList.add('input-wrapper');

  const countryInputField = new InputField({
    label: 'Login.CountrySelectorLabel',
    name: randomLong(),
    plainText: true
  });

  countryInputField.container.classList.add('input-select');

  const countryInput = countryInputField.input as HTMLInputElement;
  countryInput.autocomplete = randomLong();

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
      const emoji = c.emoji;

      const liArr: Array<HTMLLIElement> = [];
      c.phoneCode.split(' and ').forEach((phoneCode: string) => {
        const li = document.createElement('li');
        const spanEmoji = document.createElement('span');

        const kek = RichTextProcessor.wrapRichText(emoji);

        li.appendChild(spanEmoji);
        spanEmoji.outerHTML = kek;
  
        li.append(c.name);

        const span = document.createElement('span');
        span.classList.add('phone-code');
        span.innerText = '+' + phoneCode;
        li.appendChild(span);

        liArr.push(li);
        selectList.append(li);
      });

      c.li = liArr;
    });
    
    selectList.addEventListener('mousedown', (e) => {
      if(e.button !== 0) { // other buttons but left shall not pass
        return;
      }
      
      let target = e.target as HTMLElement;
      if(target.tagName !== 'LI') target = findUpTag(target, 'LI');
      
      selectCountryByTarget(target);
      //console.log('clicked', e, countryName, phoneCode);
    });

    countryInputField.container.appendChild(selectWrapper);
  };

  const selectCountryByTarget = (target: HTMLElement) => {
    const countryName = target.childNodes[1].textContent;//target.innerText.split('\n').shift();
    const phoneCode = target.querySelector<HTMLElement>('.phone-code').innerText;

    countryInput.value = countryName;
    lastCountrySelected = countries.find(c => c.name === countryName);
    
    telEl.value = lastValue = phoneCode;
    hidePicker();
    setTimeout(() => telEl.focus(), 0);
  };
  
  initSelect();

  let hideTimeout: number;

  countryInput.addEventListener('focus', function(this: typeof countryInput, e) {
    if(initSelect) {
      initSelect();
    } else {
      countries.forEach((c) => {
        c.li.forEach(li => li.style.display = '');
      });
    }

    clearTimeout(hideTimeout);
    hideTimeout = undefined;

    selectWrapper.classList.remove('hide');
    void selectWrapper.offsetWidth; // reflow
    selectWrapper.classList.add('active');

    countryInputField.select();

    fastSmoothScroll(page.pageEl.parentElement.parentElement, countryInput, 'start', 4);

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

  countryInput.addEventListener('keyup', function(this: typeof countryInput, e) {
    if(e.ctrlKey || e.key === 'Control') return false;

    //let i = new RegExp('^' + this.value, 'i');
    let _value = this.value.toLowerCase();
    let matches: Country[] = [];
    countries.forEach((c) => {
      let good = c.name.toLowerCase().indexOf(_value) !== -1/*  === 0 */;//i.test(c.name);

      c.li.forEach(li => li.style.display = good ? '' : 'none');
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
        c.li.forEach(li => li.style.display = '');
      });
    } else if(matches.length === 1 && e.key === 'Enter') {
      selectCountryByTarget(matches[0].li[0]);
    }
  });

  arrowDown.addEventListener('mousedown', function(this: typeof arrowDown, e) {
    e.cancelBubble = true;
    e.preventDefault();
    if(countryInput.matches(':focus')) countryInput.blur();
    else countryInput.focus();
  });

  let pasted = false;
  let lastValue = '';
  
  const telInputField = new InputField({
    label: 'Login.PhoneLabel',
    plainText: true,
    name: 'phone'
  });
  let telEl = telInputField.input as HTMLInputElement;
  telEl.type = 'tel';
  telEl.autocomplete = 'rr55RandomRR55';
  telEl.addEventListener('input', function(this: typeof telEl, e) {
    //console.log('input', this.value);
    this.classList.remove('error');

    lottieLoader.loadLottieWorkers();

    const value = this.value;
    const diff = Math.abs(value.length - lastValue.length);
    if(diff > 1 && !pasted && isAppleMobile) {
      this.value = lastValue + value;
    }

    pasted = false;

    telInputField.setLabel();

    let formatted: string, country: Country;
    if(this.value.replace(/\++/, '+') === '+') {
      this.value = '+';
    } else {
      const o = formatPhoneNumber(this.value);
      formatted = o.formatted;
      country = o.country;
      this.value = lastValue = formatted ? '+' + formatted : '';
    }

    //console.log(formatted, country);

    let countryName = country ? country.name : ''/* 'Unknown' */;
    if(countryName !== countryInput.value && (!lastCountrySelected || !country || lastCountrySelected.phoneCode !== country.phoneCode)) {
      countryInput.value = countryName;
      lastCountrySelected = country;
    }

    //if(country && (this.value.length - 1) >= (country.pattern ? country.pattern.length : 9)) {
    if(country || (this.value.length - 1) > 1) {
      btnNext.style.visibility = '';
    } else {
      btnNext.style.visibility = 'hidden';
    }
  });

  telEl.addEventListener('paste', (e) => {
    pasted = true;
    //console.log('paste', telEl.value);
  });

  /* telEl.addEventListener('change', (e) => {
    console.log('change', telEl.value);
  }); */

  telEl.addEventListener('keypress', function(this: typeof telEl, e) {
    //console.log('keypress', this.value);
    if(!btnNext.style.visibility &&/* this.value.length >= 9 && */ e.key === 'Enter') {
      return onSubmit();
    } else if(/\D/.test(e.key) && !(e.metaKey || e.ctrlKey) && e.key !== 'Backspace' && !(e.key === '+' && e.shiftKey/*  && !this.value */)) {
      e.preventDefault();
      return false;
    }
  });

  /* telEl.addEventListener('focus', function(this: typeof telEl, e) {
    this.removeAttribute('readonly'); // fix autocomplete
  });*/

  const signedCheckboxField = new CheckboxField({
    text: 'Login.KeepSigned', 
    name: 'keepSession',
    withRipple: true
  });

  signedCheckboxField.input.addEventListener('change', () => {
    const keepSigned = signedCheckboxField.checked;
    appStateManager.pushToState('keepSigned', keepSigned);
    
    AppStorage.toggleStorage(keepSigned);
    CacheStorageController.toggleStorage(keepSigned);
    apiManager.toggleStorage(keepSigned);
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

    let phone_number = telEl.value;
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
  _i18n(h4, 'Login.Title');

  const subtitle = document.createElement('div');
  subtitle.classList.add('subtitle');
  _i18n(subtitle, 'Login.StartText');

  page.pageEl.querySelector('.container').append(h4, subtitle, inputWrapper);

  let tryAgain = () => {
    apiManager.invokeApi('help.getNearestDc').then((nearestDcResult) => {
      const dcs = [1, 2, 3, 4, 5];
      const done: number[] = [nearestDcResult.this_dc];

      let promise: Promise<any>;
      if(nearestDcResult.nearest_dc !== nearestDcResult.this_dc) {
        promise = apiManager.getNetworker(nearestDcResult.nearest_dc).then(() => {
          done.push(nearestDcResult.nearest_dc)
        });
      }

      (promise || Promise.resolve()).then(() => {
        const g = () => {
          const dcId = dcs.shift();
          if(!dcId) return;

          setTimeout(() => { // * если одновременно запросить все нетворкеры, не будет проходить запрос на код
            apiManager.getNetworker(dcId, {fileDownload: true}).finally(g);
          }, done.includes(dcId) ? 0 : 3000);
        };
        
        g();
      });
      
      return nearestDcResult;
    }).then((nearestDcResult) => {
      let country = countries.find((c) => c.code === nearestDcResult.country);
      if(country) {
        if(!countryInput.value.length && !telEl.value.length) {
          countryInput.value = country.name;
          lastCountrySelected = country;
          telEl.value = lastValue = '+' + country.phoneCode.split(' and ').shift();
        }
      }
  
      //console.log('woohoo', nearestDcResult, country);
    })//.catch(tryAgain);
  };

  if(!isTouchSupported) {
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
