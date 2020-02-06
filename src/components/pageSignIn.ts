import { MTProto } from "../lib/mtproto/mtproto";
import { putPreloader, getNearestDc, scrollable } from "./misc";
import {RichTextProcessor} from '../lib/richtextprocessor';

import { unifiedCountryCodeEmoji, countryCodeEmoji, findUpTag } from "../lib/utils";
import pageAuthCode from "./pageAuthCode";

let installed = false;

type Country = {
  name: string,
  code: string,
  phoneCode: string,
  li?: HTMLLIElement[]
};

import _countries from '../countries_pretty.json';

//export default () => import('../countries_pretty.json').then(async(results) => {
export default () => {
  //let pageAuthCode = await import('./pageAuthCode');
  //Array.from(document.querySelectorAll('body > .whole:not(.page-authCode)')).forEach(div => div.style.display = 'none');
  const pageEl = document.body.getElementsByClassName('page-sign')[0] as HTMLDivElement;
  pageEl.style.display = '';
  
  let btnNext = pageEl.querySelector('button');
  
  if(installed) {
    btnNext.textContent = 'NEXT';
    btnNext.removeAttribute('disabled');
    return;
  }

  installed = true;

  //const countries: Country[] = results[0].default;
  const countries: Country[] = _countries;

  let lastCountrySelected = '';

  var selectCountryCode = pageEl.querySelector('input[name="countryCode"]')! as HTMLInputElement;
  var parent = selectCountryCode.parentElement;

  var wrapper = document.createElement('div');
  wrapper.classList.add('select-wrapper', 'z-depth-4');

  var list = document.createElement('ul');
  wrapper.appendChild(list);

  //let wrapperScroll = OverlayScrollbars(wrapper, (window as any).scrollbarOptions);
  let wrapperScroll = scrollable(wrapper);

  let initedSelect = false;

  selectCountryCode.addEventListener('focus', function(this: typeof selectCountryCode, e) {
    /* this.removeAttribute('readonly'); */
    if(!initedSelect) {
      countries.forEach((c) => {
        initedSelect = true;
  
        /* let unified = unifiedCountryCodeEmoji(c.code);
        let emoji = unified.split('-').reduce((prev, curr) => prev + String.fromCodePoint(parseInt(curr, 16)), ''); */
        let emoji = countryCodeEmoji(c.code);

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
        lastCountrySelected = countryName;
        
        telEl.value = phoneCode;
        setTimeout(() => telEl.focus(), 0);
        console.log('clicked', e, countryName, phoneCode);
      });
    }

    parent.appendChild(wrapper);
  }/* , {once: true} */);
  selectCountryCode.addEventListener('blur', function(this: typeof selectCountryCode, e) {
    parent.removeChild(wrapper);
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

    if(matches.length == 1 && matches[0].li.length == 1) {
      if(matches[0].name == lastCountrySelected) return false;
      console.log('clicking', matches[0]);

      var clickEvent = document.createEvent('MouseEvents');
      clickEvent.initEvent('mousedown', true, true);
      matches[0].li[0].dispatchEvent(clickEvent);
      return false;
    } else if(matches.length == 0) {
      countries.forEach((c) => {
        c.li.forEach(li => li.style.display = '');
      });
    }
  });

  let arrowDown = pageEl.querySelector('.arrow-down') as HTMLSpanElement;
  arrowDown.addEventListener('mousedown', function(this: typeof arrowDown, e) {
    e.cancelBubble = true;
    e.preventDefault();
    if(selectCountryCode.matches(':focus')) selectCountryCode.blur();
    else selectCountryCode.focus();
  });

  let telEl = pageEl.querySelector('input[name="phone"]') as HTMLInputElement;
  telEl.addEventListener('input', function(this: typeof telEl, e) {
    this.classList.remove('error');
    this.value = '+' + this.value
      .replace(/[^0-9\s]/g, '')
      /* .replace(/(\d{1,4})(\d{1,3})?(\d{1,3})?/g, function(txt, f, s, t) {
        if (t) {
          return `(${f}) ${s}-${t}`
        } else if (s) {
          return `(${f}) ${s}`
        } else if (f) {
          return `(${f})`
        }
      }) */;
    
    let sorted = countries.slice().sort((a, b) => b.phoneCode.length - a.phoneCode.length);
    let phoneCode = this.value.slice(1, 7).replace(/\D/g, '');
    let country = sorted.find((c) => {
      return c.phoneCode.split(' and ').find((c) => phoneCode.indexOf(c) == 0);
    });

    console.log(phoneCode, country);

    let countryName = country ? country.name : ''/* 'Unknown' */;
    if(countryName != selectCountryCode.value) {
      selectCountryCode.value = countryName;
      lastCountrySelected = countryName;
    }

    if(this.value.length >= 9) {
      btnNext.style.display = '';
    }
  });

  telEl.addEventListener('keypress', function(this: typeof telEl, e) {
    if(this.value.length >= 9 && e.key == 'Enter') {
      return btnNext.click();
    } else if(/\D/.test(e.key)) {
      e.preventDefault();
      return false;
    }
  });

  /* telEl.addEventListener('focus', function(this: typeof telEl, e) {
    this.removeAttribute('readonly'); // fix autocomplete
  });*/

  /* MTProto.authorizer.auth(2);
  MTProto.networkerFactory.startAll(); */

  btnNext.addEventListener('click', function(this: HTMLElement, e) {
    this.setAttribute('disabled', 'true');

    this.textContent = 'PLEASE WAIT...';
    putPreloader(this);
    //this.innerHTML = 'PLEASE WAIT...';

    let phone_number = telEl.value;
    MTProto.apiManager.invokeApi('auth.sendCode', {
      /* flags: 0, */
      phone_number: phone_number,
      api_id: Config.App.id,
      api_hash: Config.App.hash,
      settings: {
        _: 'codeSettings', // that's how we sending Type
        flags: 0
      }
      /* lang_code: navigator.language || 'en' */
    }).then((code: any) => {
      console.log('got code', code);
      
      pageEl.style.display = 'none';

      // @ts-ignore
      pageAuthCode(Object.assign(code, {phone_number: phone_number}));
    }).catch(err => {
      this.removeAttribute('disabled');

      this.innerText = 'NEXT';
      switch(err.type) {
        case 'PHONE_NUMBER_INVALID':
          telEl.classList.add('error');
          break;
        default:
          this.innerText = err.type;
          break;
      }
    });
  });

  let tryAgain = () => {
    getNearestDc().then((nearestDcResult: any) => {
      let country = countries.find((c) => c.code == nearestDcResult.country);
      if(country) {
        if(!selectCountryCode.value.length && !telEl.value.length) {
          selectCountryCode.value = country.name;
          lastCountrySelected = country.name;
          telEl.value = '+' + country.phoneCode.split(' and ').shift();
        }
      }
  
      return console.log('woohoo', nearestDcResult, country);
    })//.catch(tryAgain);
  };

  tryAgain();
  
};
