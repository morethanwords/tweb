import {CARD_BRANDS, detectCardBrand} from './cardBrands';
import formatInputValueByPattern from './formatInputValueByPattern';
import NBSP from '../string/nbsp';
import replaceNonNumber from '../string/replaceNonNumber';

export type PatternValidationOptions = Partial<{
  ignoreIncomplete: boolean
}>;

const nbspRegExp = new RegExp(NBSP, 'g');

function makeValidationError(code?: string) {
  return code ? {
    type: 'invalid',
    code
  } : null;
}

// Luhn algorithm
function validateCompleteCardNumber(card: string) {
  const t = '0'.charCodeAt(0);
  const n = card.length % 2;
  let a = 0;
  for(let i = card.length - 1; i >= 0; --i) {
    const c = n === (i % 2);
    let o = card.charCodeAt(i) - t;
    if(c) o *= 2;
    if(o > 9) o -= 9;
    a += o;
  }
  return !(a % 10);
}

function validateExpiry(year: number, month: number, options?: PatternValidationOptions & {date?: Date}) {
  const date = options.date || new Date();
  const _year = year < 100 ? date.getFullYear() % 100 : date.getFullYear();
  const nextMonth = date.getMonth() + 1;

  if(isNaN(year) || isNaN(month)) {
    return options?.ignoreIncomplete ? null : 'incomplete';
  }

  if((year - _year) < 0) {
    return 'invalid_expiry_year_past';
  }

  if((year - _year) > 50) {
    return 'invalid_expiry_year';
  }

  return !(year - _year) && month < nextMonth ? 'invalid_expiry_month_past' : null;
}

function getCardInfoByNumber(card: string) {
  const sanitized = replaceNonNumber(card);
  const brand = detectCardBrand(card);
  return {
    sanitized,
    brand,
    minLength: CARD_BRANDS[brand].minLength
  };
}

function makeCardNumberError(str: string, length: number, ignoreIncomplete: boolean) {
  if(str.length >= length) {
    return validateCompleteCardNumber(str) || detectCardBrand(str) === 'mir' ? null : makeValidationError('invalid');
  }

  return ignoreIncomplete ? null : makeValidationError('incomplete');
}

export function validateCardNumber(str: string, options: PatternValidationOptions = {}) {
  const {sanitized, minLength} = getCardInfoByNumber(str);
  return makeCardNumberError(sanitized, minLength, options.ignoreIncomplete);
}

export function validateCardExpiry(str: string, options: Parameters<typeof validateExpiry>[2] = {}) {
  const sanitized = str.replace(nbspRegExp, '').split(/ ?\/ ?/);
  const [monthStr, yearStr = ''] = sanitized;
  const [month, year] = [monthStr, yearStr].map((str) => +str);
  const s = yearStr.length === 2 ? year % 100 : year;
  return yearStr.length < 2 || yearStr.length === 3 ? (options.ignoreIncomplete ? null : makeValidationError('incomplete')) : makeValidationError(validateExpiry(s, month, options));
}

export function validateAnyIncomplete(formatted: ReturnType<typeof formatInputValueByPattern>, str: string, options: PatternValidationOptions = {}) {
  return formatted.meta.autocorrectComplete || options.ignoreIncomplete ? null : makeValidationError('incomplete');
}
