/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {HelpCountry, HelpCountryCode} from '../layer';
import I18n from '../lib/langPack';

let sortedCountries: HelpCountry[];
type PrefixCountry = {country: HelpCountry, code: HelpCountryCode};
const prefixes: Map<string, PrefixCountry> = new Map();
let maxPrefixLength = 0;
const setPrefix = (country: HelpCountry, code: HelpCountryCode, prefix: string = '') => {
  prefix = code.country_code + prefix;
  /* if(prefixes.has(prefix)) {
    console.error('asdasdasd', prefixes.get(prefix), country, code);
  } */
  maxPrefixLength = Math.max(maxPrefixLength, prefix.length);
  prefixes.set(prefix, {country, code});
};

export function formatPhoneNumber(originalStr: string): {
  formatted: string,
  country: HelpCountry,
  code: HelpCountryCode,
  leftPattern: string
} {
  originalStr = originalStr || '';

  if(!prefixes.size) {
    I18n.countriesList.forEach((country) => {
      country.country_codes.forEach((code) => {
        if(code.prefixes) {
          code.prefixes.forEach((prefix) => {
            setPrefix(country, code, prefix);
          });
        } else {
          setPrefix(country, code);
        }
      });
    });
  }

  // return {formatted: originalStr, country: undefined as any, leftPattern: ''};
  let str = originalStr.replace(/\D/g, '');
  const phoneCode = str.slice(0, maxPrefixLength);

  // //console.log('str', str, phoneCode);
  // if(!sortedCountries) {
  //   sortedCountries = I18n.countriesList.slice().sort((a, b) => b.country_codes[0].country_code.length - a.country_codes[0].country_code.length);
  // }

  // let country = sortedCountries.find((c) => {
  //   return c.country_codes.find((c) => phoneCode.indexOf(c.replace(/\D/g, '')) === 0);
  // });

  let prefixCountry: PrefixCountry;
  for(let i = phoneCode.length - 1; i >= 0; --i) { // lookup for country by prefix
    prefixCountry = prefixes.get(phoneCode.slice(0, i + 1));
    if(prefixCountry) {
      break;
    }
  }

  if(!prefixCountry) {
    return {
      formatted: str,
      country: undefined,
      code: undefined,
      leftPattern: ''
    };
  }

  // country = /* PhoneCodesMain[country.phoneCode] ||  */country;
  const country = prefixCountry.country;

  const patterns = prefixCountry.code.patterns || [];
  const searchForPattern = str.slice(prefixCountry.code.country_code.length); // splice country code
  let pattern = '', mostMatchedPatternMatches = 0, mostMatchedPattern = '';
  for(let i = patterns.length - 1; i >= 0; --i) {
    pattern = patterns[i];

    const _pattern = pattern.replace(/ /g, '');
    let patternMatches = 0;
    for(let k = 0, length = Math.min(searchForPattern.length, _pattern.length); k < length; ++k) {
      if(searchForPattern[k] === _pattern[k]) {
        patternMatches += 1.01;
      } else if(_pattern[k] === 'X') {
        ++patternMatches;
      } else {
        patternMatches = 0;
        break;
      }
    }

    if(patternMatches > mostMatchedPatternMatches) {
      mostMatchedPatternMatches = patternMatches;
      mostMatchedPattern = pattern;
    }
  }

  pattern = mostMatchedPattern || pattern;
  pattern = pattern.replace(/\d/g, 'X');

  pattern = prefixCountry.code.country_code + ' ' + pattern;
  // let pattern = country.pattern || country.phoneCode;
  pattern.split('').forEach((symbol, idx) => {
    if(symbol === ' ' && str[idx] !== ' ' && str.length > idx) {
      str = str.slice(0, idx) + ' ' + str.slice(idx);
    }
  });

  /* if(country.pattern) {
    str = str.slice(0, country.pattern.length);
  } */

  let leftPattern = pattern && pattern.length > str.length ? pattern.slice(str.length) : '';
  if(leftPattern) {
    /* const length = str.length;
    leftPattern = leftPattern.split('').map((_, idx) => (length + idx).toString().slice(-1)).join(''); */
    leftPattern = leftPattern.replace(/X/g, '‒');
    // leftPattern = leftPattern.replace(/X/g, '0');
  }

  return {formatted: str, country, code: prefixCountry.code, leftPattern};
}
