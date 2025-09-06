import bigInt from 'big-integer';
import Icon from '../components/icon';
import Currencies from '../config/currencies';
import I18n from '../lib/langPack';
import {STARS_CURRENCY, TON_CURRENCY} from '../lib/mtproto/mtproto_config';
import {numberThousandSplitterForStars} from './number/numberThousandSplitter';
import {MOUNT_CLASS_TO} from '../config/debug';

// https://stackoverflow.com/a/34141813
function number_format(number: any, decimals: any, dec_point: any, thousands_sep: any): string {
  // Strip all characters but numerical ones.
  number = (number + '').replace(/[^0-9+\-Ee.]/g, '');
  var n = !isFinite(+number) ? 0 : +number,
    prec = !isFinite(+decimals) ? 0 : Math.abs(decimals),
    sep = (typeof thousands_sep === 'undefined') ? ',' : thousands_sep,
    dec = (typeof dec_point === 'undefined') ? '.' : dec_point,
    s: any = '',
    toFixedFix = function(n: number, prec: number) {
      var k = Math.pow(10, prec);
      return '' + Math.round(n * k) / k;
    };
  // Fix for IE parseFloat(0.55).toFixed(0) = 0;
  s = (prec ? toFixedFix(n, prec) : '' + Math.round(n)).split('.');
  if(s[0].length > 3) {
    s[0] = s[0].replace(/\B(?=(?:\d{3})+(?!\d))/g, sep);
  }
  if((s[1] || '').length < prec) {
    s[1] = s[1] || '';
    s[1] += new Array(prec - s[1].length + 1).join('0');
  }
  return s.join(dec);
}

const NANOTON_DECIMALS = 9;

export function formatNanoton(amount: number | string, maxDecimals: number = 2, withThousandsSep = true) {
  let amountStr = String(amount);
  let negative = false;
  if(amountStr.startsWith('-')) {
    negative = true;
    amountStr = amountStr.slice(1);
  }

  // pad if needed
  if(amountStr.length < NANOTON_DECIMALS) {
    amountStr = amountStr.padStart(NANOTON_DECIMALS, '0');
  }
  let intPart = amountStr.slice(0, amountStr.length - NANOTON_DECIMALS) || '0';
  const fracPart = amountStr.slice(-NANOTON_DECIMALS).padEnd(NANOTON_DECIMALS, '0');

  // take decimals of fraction, with rounding
  let frac2 = fracPart.slice(0, maxDecimals);
  const nextDigit = fracPart.length > maxDecimals ? parseInt(fracPart[maxDecimals], 10) : 0;

  if(nextDigit >= 5) {
    const asNum = parseInt(frac2, 10) + 1;
    if(asNum >= 10 ** maxDecimals) {
      intPart = bigInt(intPart).plus(1).toString();
      frac2 = '00';
    } else {
      frac2 = asNum.toString().padStart(2, '0');
    }
  }

  let res = ''
  if(negative) res += '-';

  if(withThousandsSep) {
    res += intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  } else {
    res += intPart;
  }

  if(maxDecimals > 0) {
    frac2 = frac2.replace(/0+$/, '');
    if(frac2) {
      res += '.' + frac2;
    }
  }

  return res;
}

export function nanotonToJsNumber(nanoton: number | string) {
  return Number(formatNanoton(nanoton, NANOTON_DECIMALS, false));
}

export function parseNanotonFromDecimal(decimal: string) {
  const [int, frac = '0'] = decimal.split('.');
  const intPart = int + '0'.repeat(NANOTON_DECIMALS);
  const fracPart = frac.padEnd(NANOTON_DECIMALS, '0');
  return bigInt(intPart).plus(bigInt(fracPart));
}

export default function paymentsWrapCurrencyAmount<T extends boolean = false>(
  amount: number | string,
  currency: string,
  skipSymbol?: boolean,
  useNative?: boolean,
  plain?: T
): T extends true ? string : HTMLElement | string {
  if(currency === TON_CURRENCY) {
    const str = formatNanoton(amount);
    if(plain) return str + ' TON';
    const out = document.createElement('span');
    out.classList.add('ton-amount');
    out.append(Icon('ton', 'ton-amount-icon'), ' ', str);
    return out as any;
  }

  amount = +amount;

  if(currency === STARS_CURRENCY) {
    if(plain) {
      return I18n.format('StarsCount', true, [amount]);
    }

    const out = document.createElement('span');
    out.classList.add('xtr');
    out.append(Icon('star', 'xtr-icon'), ' ', numberThousandSplitterForStars(amount));
    return out as any;
  }

  const isNegative = amount < 0;

  const currencyData = Currencies[currency];
  if(!currencyData) {
    throw new Error('CURRENCY_WRAP_INVALID');
  }

  const amountExp = amount / Math.pow(10, currencyData.exp);

  let decimals = currencyData.exp;
  if(currency == 'IRR' && Math.floor(amountExp) == amountExp) {
    decimals = 0; // у иранцев копейки почти всегда = 0 и не показываются в UI
  }

  let formatted = number_format(amountExp, decimals, currencyData.decimal_sep, currencyData.thousands_sep);
  if(skipSymbol) {
    return formatted;
  }

  let symbol = useNative ? currencyData.native || currencyData.symbol : currencyData.symbol;
  if(isNegative && !currencyData.space_between && currencyData.symbol_left) {
    symbol = '-' + symbol;
    formatted = formatted.replace('-', '');
  }

  let out: string;
  const splitter = currencyData.space_between ? ' ' : '';
  if(currencyData.symbol_left) {
    out = symbol + splitter + formatted;
  } else {
    out = formatted + splitter + symbol;
  }
  return out;
}

MOUNT_CLASS_TO.p = paymentsWrapCurrencyAmount;

// function paymentsGetCurrencyExp($currency: string) {
//   if($currency == 'CLF') {
//     return 4;
//   }
//   if(['BHD','IQD','JOD','KWD','LYD','OMR','TND'].includes($currency)) {
//     return 3;
//   }
//   if(['BIF','BYR','CLP','CVE','DJF','GNF','ISK','JPY','KMF','KRW','MGA', 'PYG','RWF','UGX','UYI','VND','VUV','XAF','XOF','XPF'].includes($currency)) {
//     return 0;
//   }
//   if($currency == 'MRO') {
//     return 1;
//   }
//   return 2;
// }
