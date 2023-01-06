/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_EMOJI_SUPPORTED from '../environment/emojiSupport';
import cancelEvent from '../helpers/dom/cancelEvent';
import findUpClassName from '../helpers/dom/findUpClassName';
import findUpTag from '../helpers/dom/findUpTag';
import replaceContent from '../helpers/dom/replaceContent';
import setInnerHTML from '../helpers/dom/setInnerHTML';
import fastSmoothScroll from '../helpers/fastSmoothScroll';
import {randomLong} from '../helpers/random';
import {HelpCountry, HelpCountryCode} from '../layer';
import I18n, {i18n} from '../lib/langPack';
import wrapEmojiText from '../lib/richTextProcessor/wrapEmojiText';
import rootScope from '../lib/rootScope';
import {getCountryEmoji} from '../vendor/emoji';
import InputField, {InputFieldOptions} from './inputField';
import Scrollable from './scrollable';

let countries: HelpCountry.helpCountry[];
const setCountries = () => {
  countries = I18n.countriesList
  .filter((country) => !country.pFlags?.hidden)
  .sort((a, b) => (a.name || a.default_name).localeCompare(b.name || b.default_name));
};

let init = () => {
  setCountries();
  rootScope.addEventListener('language_change', () => {
    setCountries();
  });
};

const VIRTUAL_COUNTRIES = new Set(['FT']);

export default class CountryInputField extends InputField {
  private lastCountrySelected: HelpCountry;
  private lastCountryCodeSelected: HelpCountryCode;

  private hideTimeout: number;
  private selectWrapper: HTMLElement;

  private liMap: Map<string, HTMLLIElement[]>;

  constructor(public options: InputFieldOptions & {
    onCountryChange?: (country: HelpCountry.helpCountry, code: HelpCountryCode.helpCountryCode) => void,
    noPhoneCodes?: boolean
  } = {}) {
    super({
      label: 'Country',
      name: randomLong(),
      ...options
    });

    if(init) {
      init();
      init = undefined;
    }

    this.liMap = new Map();

    this.container.classList.add('input-select');

    const selectWrapper = this.selectWrapper = document.createElement('div');
    selectWrapper.classList.add('select-wrapper', 'z-depth-3', 'hide');

    const arrowDown = document.createElement('span');
    arrowDown.classList.add('arrow', 'arrow-down');
    this.container.append(arrowDown);

    const selectList = document.createElement('ul');
    selectWrapper.appendChild(selectList);

    const scroll = new Scrollable(selectWrapper);

    let initSelect = () => {
      initSelect = null;

      countries.forEach((c) => {
        if(options.noPhoneCodes && VIRTUAL_COUNTRIES.has(c.iso2)) {
          return;
        }

        const emoji = getCountryEmoji(c.iso2);

        const liArr: Array<HTMLLIElement> = [];
        for(let i = 0, length = Math.min(c.country_codes.length, options.noPhoneCodes ? 1 : Infinity); i < length; ++i) {
          const countryCode = c.country_codes[i];
          const li = document.createElement('li');

          const wrapped = wrapEmojiText(emoji);
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

          if(!options.noPhoneCodes) {
            const span = document.createElement('span');
            span.classList.add('phone-code');
            span.innerText = '+' + countryCode.country_code;
            li.appendChild(span);
          }

          liArr.push(li);
          selectList.append(li);
        }

        this.liMap.set(c.iso2, liArr);
      });

      selectList.addEventListener('mousedown', (e) => {
        if(e.button !== 0) { // other buttons but left shall not pass
          return;
        }

        const target = findUpTag(e.target, 'LI')
        this.selectCountryByTarget(target);
        // console.log('clicked', e, countryName, phoneCode);
      });

      this.container.appendChild(selectWrapper);
    };

    initSelect();

    this.input.addEventListener('focus', (e) => {
      if(initSelect) {
        initSelect();
      } else {
        countries.forEach((c) => {
          const arr = this.liMap.get(c.iso2);
          if(!arr) return;
          arr.forEach((li) => li.style.display = '');
        });
      }

      clearTimeout(this.hideTimeout);
      this.hideTimeout = undefined;

      selectWrapper.classList.remove('hide');
      void selectWrapper.offsetWidth; // reflow
      selectWrapper.classList.add('active');

      this.select();

      fastSmoothScroll({
        // container: page.pageEl.parentElement.parentElement,
        container: findUpClassName(this.container, 'scrollable-y'),
        element: this.input,
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
      if(e.target === this.input) {
        return;
      }

      this.hidePicker();
      document.removeEventListener('mousedown', onMouseDown, {capture: true});
      mouseDownHandlerAttached = false;
    };

    /* false && this.input.addEventListener('blur', function(this: typeof this.input, e) {
      hidePicker();

      e.cancelBubble = true;
    }, {capture: true}); */

    const onKeyPress = (e: KeyboardEvent) => {
      const key = e.key;
      if(e.ctrlKey || key === 'Control') return false;

      // let i = new RegExp('^' + this.value, 'i');
      const _value = this.value.toLowerCase();
      const matches: HelpCountry[] = [];
      countries.forEach((c) => {
        const arr = this.liMap.get(c.iso2);
        if(!arr) {
          return;
        }

        const names = [
          c.name,
          c.default_name,
          c.iso2
        ];

        names.filter(Boolean).forEach((name) => {
          const abbr = name.split(' ').filter((word) => /\w/.test(word)).map((word) => word[0]).join('');
          if(abbr.length > 1) {
            names.push(abbr);
          }
        });

        const good = !!names.filter(Boolean).find((str) => str.toLowerCase().indexOf(_value) !== -1)/*  === 0 */;// i.test(c.name);

        arr.forEach((li) => li.style.display = good ? '' : 'none');
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
          const arr = this.liMap.get(c.iso2);
          if(!arr) {
            return;
          }

          arr.forEach((li) => li.style.display = '');
        });
      } else if(matches.length === 1 && key === 'Enter') {
        cancelEvent(e);
        this.selectCountryByTarget(this.liMap.get(matches[0].iso2)[0]);
      }
    };

    this.input.addEventListener('keyup', onKeyPress);
    this.input.addEventListener('keydown', (e) => {
      if(e.key === 'Enter') {
        onKeyPress(e);
      }
    });

    arrowDown.addEventListener('mousedown', (e) => {
      if(this.input.matches(':focus')) {
        this.hidePicker();
        this.input.blur();
      } else {
        e.cancelBubble = true;
        e.preventDefault();
        this.input.focus();
      }
    });
  }

  public getSelected() {
    return {country: this.lastCountrySelected, code: this.lastCountryCodeSelected};
  }

  public hidePicker = () => {
    if(this.hideTimeout !== undefined) return;
    this.selectWrapper.classList.remove('active');
    this.hideTimeout = window.setTimeout(() => {
      this.selectWrapper.classList.add('hide');
      this.hideTimeout = undefined;
    }, 200);
  }

  public selectCountryByTarget = (target: HTMLElement) => {
    const defaultName = target.querySelector<HTMLElement>('[data-default-name]').dataset.defaultName;
    const phoneCodeEl = target.querySelector<HTMLElement>('.phone-code');
    const phoneCode = phoneCodeEl?.innerText;
    const countryCode = phoneCode && phoneCode.replace(/\D/g, '');

    replaceContent(this.input, i18n(defaultName as any));
    this.simulateInputEvent();
    this.lastCountrySelected = countries.find((c) => c.default_name === defaultName);
    this.lastCountryCodeSelected = countryCode && this.lastCountrySelected.country_codes.find((_countryCode) => _countryCode.country_code === countryCode);

    this.options.onCountryChange?.(this.lastCountrySelected, this.lastCountryCodeSelected);
    this.hidePicker();
  }

  public selectCountryByIso2(iso2: string) {
    this.selectCountryByTarget(this.liMap.get(iso2)[0]);
  }

  public override(country: HelpCountry, code: HelpCountryCode, countryName?: string) {
    replaceContent(this.input, country ? i18n(country.default_name as any) : countryName);
    this.lastCountrySelected = country;
    this.lastCountryCodeSelected = code;
    this.options.onCountryChange?.(this.lastCountrySelected, this.lastCountryCodeSelected);
  }
}
