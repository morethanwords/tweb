import { formatPhoneNumber, putPreloader } from "../components/misc";
import Scrollable from '../components/scrollable';
import Countries, { Country as _Country } from "../countries";
import apiManager from "../lib/mtproto/mtprotoworker";
import { App, Modes } from "../lib/mtproto/mtproto_config";
import { RichTextProcessor } from '../lib/richtextprocessor';
import { findUpTag } from "../lib/utils";
import Page from "./page";
import pageAuthCode from "./pageAuthCode";
import pageSignQR from './pageSignQR';

type Country = _Country & {
  li?: HTMLLIElement[]
};

//import _countries from '../countries_pretty.json';
let btnNext: HTMLButtonElement = null;

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

  var selectCountryCode = page.pageEl.querySelector('input[name="countryCode"]')! as HTMLInputElement;
  var parent = selectCountryCode.parentElement;

  var wrapper = document.createElement('div');
  wrapper.classList.add('select-wrapper', 'z-depth-3', 'hide');

  var list = document.createElement('ul');
  wrapper.appendChild(list);

  //let wrapperScroll = OverlayScrollbars(wrapper, (window as any).scrollbarOptions);
  let scroll = new Scrollable(wrapper);

  let initedSelect = false;

  page.pageEl.querySelector('.a-qr').addEventListener('click', () => {
    pageSignQR.mount();
  });

  let initSelect = () => {
    initSelect = null;

    countries.forEach((c) => {
      initedSelect = true;

      /* let unified = unifiedCountryCodeEmoji(c.code);
      let emoji = unified.split('-').reduce((prev, curr) => prev + String.fromCodePoint(parseInt(curr, 16)), ''); */
      //let emoji = countryCodeEmoji(c.code);
      let emoji = c.emoji;

      let liArr: Array<HTMLLIElement> = [];
      c.phoneCode.split(' and ').forEach((phoneCode: string) => {
        let li = document.createElement('li');
        var spanEmoji = document.createElement('span');
        /* spanEmoji.innerHTML = countryCodeEmoji(c.code); */
        //spanEmoji.classList.add('emoji-outer', 'emoji-sizer');
        //spanEmoji.innerHTML = `<span class="emoji-inner" style="background: url(${sheetUrl}${sheetNo}.png);background-position:${xPos}% ${yPos}%;background-size:${sizeX}% ${sizeY}%" data-codepoints="${unified}"></span>`;
        
        

        let kek = RichTextProcessor.wrapRichText(emoji);
        //console.log(c.name, emoji, kek, spanEmoji.innerHTML);

        li.appendChild(spanEmoji);
        spanEmoji.outerHTML = kek;
  
        li.append(c.name);

        var span = document.createElement('span');
        span.classList.add('phone-code');
        span.innerText = '+' + phoneCode;
        li.appendChild(span);

        liArr.push(li);
        list.append(li);
      });

      c.li = liArr;
    });
    
    list.addEventListener('mousedown', function(e) {
      let target = e.target as HTMLElement;
      if(target.tagName != 'LI') target = findUpTag(target, 'LI');
      
      let countryName = target.childNodes[1].textContent;//target.innerText.split('\n').shift();
      let phoneCode = target.querySelector<HTMLElement>('.phone-code').innerText;

      selectCountryCode.value = countryName;
      lastCountrySelected = countries.find(c => c.name == countryName);
      
      telEl.value = phoneCode;
      setTimeout(() => telEl.focus(), 0);
      //console.log('clicked', e, countryName, phoneCode);
    });

    parent.appendChild(wrapper);
  };
  
  initSelect();

  let hideTimeout: number;

  selectCountryCode.addEventListener('focus', function(this: typeof selectCountryCode, e) {
    if(initSelect) {
      initSelect();
    } else {
      countries.forEach((c) => {
        c.li.forEach(li => li.style.display = '');
      });
    }

    clearTimeout(hideTimeout);

    wrapper.classList.remove('hide');
    void wrapper.offsetWidth; // reflow
    wrapper.classList.add('active');
  });
  selectCountryCode.addEventListener('blur', function(this: typeof selectCountryCode, e) {
    wrapper.classList.remove('active');
    hideTimeout = window.setTimeout(() => {
      wrapper.classList.add('hide');
    }, 200);
    
    e.cancelBubble = true;
  }, {capture: true});

  selectCountryCode.addEventListener('keyup', function(this: typeof selectCountryCode, e) {
    if(e.ctrlKey || e.key == 'Control') return false;

    //let i = new RegExp('^' + this.value, 'i');
    let _value = this.value.toLowerCase();
    let matches: Country[] = [];
    countries.forEach((c) => {
      let good = c.name.toLowerCase().indexOf(_value) !== -1/*  == 0 */;//i.test(c.name);

      c.li.forEach(li => li.style.display = good ? '' : 'none');
      if(good) matches.push(c);
    });

    // Код ниже автоматически выберет страну если она осталась одна при поиске
    /* if(matches.length == 1 && matches[0].li.length == 1) {
      if(matches[0].name == lastCountrySelected) return false;
      //console.log('clicking', matches[0]);

      var clickEvent = document.createEvent('MouseEvents');
      clickEvent.initEvent('mousedown', true, true);
      matches[0].li[0].dispatchEvent(clickEvent);
      return false;
    } else  */if(matches.length == 0) {
      countries.forEach((c) => {
        c.li.forEach(li => li.style.display = '');
      });
    }
  });

  let arrowDown = page.pageEl.querySelector('.arrow-down') as HTMLSpanElement;
  arrowDown.addEventListener('mousedown', function(this: typeof arrowDown, e) {
    e.cancelBubble = true;
    e.preventDefault();
    if(selectCountryCode.matches(':focus')) selectCountryCode.blur();
    else selectCountryCode.focus();
  });

  let sortedCountries = countries.slice().sort((a, b) => b.phoneCode.length - a.phoneCode.length);

  let telEl = page.pageEl.querySelector('input[name="phone"]') as HTMLInputElement;
  const telLabel = telEl.nextElementSibling as HTMLLabelElement;
  telEl.addEventListener('input', function(this: typeof telEl, e) {
    this.classList.remove('error');

    telLabel.innerText = 'Phone Number';

    let {formatted, country} = formatPhoneNumber(this.value);
    this.value = formatted ? '+' + formatted : '';

    //console.log(formatted, country);

    let countryName = country ? country.name : ''/* 'Unknown' */;
    if(countryName != selectCountryCode.value && (!lastCountrySelected || !country || lastCountrySelected.phoneCode != country.phoneCode)) {
      selectCountryCode.value = countryName;
      lastCountrySelected = country;
    }

    //if(country && (this.value.length - 1) >= (country.pattern ? country.pattern.length : 9)) {
    if(country || (this.value.length - 1) > 1) {
      btnNext.style.visibility = '';
    } else {
      btnNext.style.visibility = 'hidden';
    }
  });

  telEl.addEventListener('keypress', function(this: typeof telEl, e) {
    if(!btnNext.style.visibility &&/* this.value.length >= 9 && */ e.key == 'Enter') {
      return btnNext.click();
    } else if(/\D/.test(e.key)) {
      e.preventDefault();
      return false;
    }
  });

  /* telEl.addEventListener('focus', function(this: typeof telEl, e) {
    this.removeAttribute('readonly'); // fix autocomplete
  });*/

  /* authorizer.auth(2);
  networkerFactory.startAll(); */

  btnNext.addEventListener('click', function(this: HTMLElement, e) {
    this.setAttribute('disabled', 'true');

    this.textContent = 'PLEASE WAIT...';
    putPreloader(this);
    //this.innerHTML = 'PLEASE WAIT...';

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

      pageAuthCode.mount(Object.assign(code, {phone_number: phone_number}));
    }).catch(err => {
      this.removeAttribute('disabled');

      this.innerText = 'NEXT';
      switch(err.type) {
        case 'PHONE_NUMBER_INVALID':
          telLabel.innerText = 'Phone Number Invalid';
          telEl.classList.add('error');
          break;
        default:
          console.error('auth.sendCode error:', err);
          this.innerText = err.type;
          break;
      }
    });
  });

  let tryAgain = () => {
    apiManager.invokeApi('help.getNearestDc').then((nearestDcResult) => {
      const dcs = [1, 2, 3, 4, 5];
      //dcs.splice(nearestDcResult.this_dc - 1, 1);

      let promise: Promise<any>;
      if(nearestDcResult.nearest_dc != nearestDcResult.this_dc) {
        //MTProto.apiManager.baseDcID = nearestDcResult.nearest_dc;

        promise = apiManager.getNetworker(nearestDcResult.nearest_dc).then(() => {

        });
      }

      (promise || Promise.resolve()).then(() => {
        dcs.forEach(dcID => {
          apiManager.getNetworker(dcID, {fileDownload: true});
        });
      });
      
      return nearestDcResult;
    }).then((nearestDcResult) => {
      let country = countries.find((c) => c.code == nearestDcResult.country);
      if(country) {
        if(!selectCountryCode.value.length && !telEl.value.length) {
          selectCountryCode.value = country.name;
          lastCountrySelected = country;
          telEl.value = '+' + country.phoneCode.split(' and ').shift();
        }
      }
  
      //console.log('woohoo', nearestDcResult, country);
    })//.catch(tryAgain);
  };

  tryAgain();
};

const page = new Page('page-sign', true, onFirstMount, () => {
  if(!btnNext) {
    btnNext = page.pageEl.querySelector('button');
  }
  
  btnNext.textContent = 'NEXT';
  btnNext.removeAttribute('disabled');
});

export default page;
