import Currencies from "../config/currencies";

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
  if (s[0].length > 3) {
      s[0] = s[0].replace(/\B(?=(?:\d{3})+(?!\d))/g, sep);
  }
  if ((s[1] || '').length < prec) {
      s[1] = s[1] || '';
      s[1] += new Array(prec - s[1].length + 1).join('0');
  }
  return s.join(dec);
}

export default function paymentsWrapCurrencyAmount($amount: number | string, $currency: string, $skipSymbol?: boolean) {
  $amount = +$amount;

  const $currency_data = Currencies[$currency]; // вытащить из json
  if(!$currency_data) {
    throw new Error('CURRENCY_WRAP_INVALID');
  }

  const $amount_exp = $amount / Math.pow(10, $currency_data['exp']);

  let $decimals = $currency_data['exp'];
  if($currency == 'IRR' &&
    Math.floor($amount_exp) == $amount_exp) {
    $decimals = 0; // у иранцев копейки почти всегда = 0 и не показываются в UI
  }

  const $formatted = number_format($amount_exp, $decimals, $currency_data['decimal_sep'], $currency_data['thousands_sep']);
  if($skipSymbol) {
    return $formatted;
  }

  const $splitter = $currency_data['space_between'] ? " " : '';
  let $formatted_intern: string;
  if($currency_data['symbol_left']) {
    $formatted_intern = $currency_data['symbol'] + $splitter + $formatted;
  } else {
    $formatted_intern = $formatted + $splitter + $currency_data['symbol'];
  }
  return $formatted_intern;
}

function paymentsGetCurrencyExp($currency: string) {
  if($currency == 'CLF') {
    return 4;
  }
  if(['BHD','IQD','JOD','KWD','LYD','OMR','TND'].includes($currency)) {
    return 3;
  }
  if(['BIF','BYR','CLP','CVE','DJF','GNF','ISK','JPY','KMF','KRW','MGA', 'PYG','RWF','UGX','UYI','VND','VUV','XAF','XOF','XPF'].includes($currency)) {
    return 0;
  }
  if($currency == 'MRO') {
    return 1;
  }
  return 2;
}
