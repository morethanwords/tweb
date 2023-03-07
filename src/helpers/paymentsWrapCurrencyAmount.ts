import Currencies from '../config/currencies';

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

export default function paymentsWrapCurrencyAmount(
  amount: number | string,
  currency: string,
  skipSymbol?: boolean,
  useNative?: boolean
) {
  amount = +amount;

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

(window as any).p = paymentsWrapCurrencyAmount;

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
