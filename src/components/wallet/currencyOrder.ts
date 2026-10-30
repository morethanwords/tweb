/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import I18n from '@lib/langPack';

/**
 * The currency of a country, for the currencies a wallet rate may come in: the browser can tell a language's
 * country but not its money
 */
const REGION_CURRENCIES: {[region: string]: string} = Object.fromEntries([
  ...'AD AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MC ME MT NL PT SI SK SM VA XK'.split(' ').map((region) => [region, 'EUR']),
  ...('AE:AED AF:AFN AL:ALL AM:AMD AO:AOA AR:ARS AU:AUD AZ:AZN BA:BAM BD:BDT BG:BGN BH:BHD BN:BND BO:BOB BR:BRL ' +
    'BY:BYN CA:CAD CH:CHF CL:CLP CN:CNY CO:COP CR:CRC CZ:CZK DK:DKK DO:DOP DZ:DZD EG:EGP ET:ETB GB:GBP GE:GEL ' +
    'GT:GTQ HK:HKD HN:HNL HU:HUF ID:IDR IL:ILS IN:INR IQ:IQD IS:ISK JM:JMD JO:JOD JP:JPY KE:KES KG:KGS KH:KHR ' +
    'KR:KRW KW:KWD KZ:KZT LB:LBP LI:CHF LK:LKR MA:MAD MD:MDL MK:MKD MM:MMK MN:MNT MO:MOP MX:MXN MY:MYR MZ:MZN ' +
    'NG:NGN NI:NIO NO:NOK NP:NPR NZ:NZD OM:OMR PA:PAB PE:PEN PH:PHP PK:PKR PL:PLN PY:PYG QA:QAR RO:RON RS:RSD ' +
    'RU:RUB SA:SAR SE:SEK SG:SGD TH:THB TJ:TJS TN:TND TR:TRY TT:TTD TW:TWD TZ:TZS UA:UAH UG:UGX US:USD UY:UYU ' +
    'UZ:UZS VE:VES VN:VND YE:YER ZA:ZAR ZM:ZMW').split(' ').map((pair) => pair.split(':'))
]);

/** a country's money, by its ISO code */
function currencyOfRegion(region: string) {
  return region && REGION_CURRENCIES[region.trim().toUpperCase()];
}

/** a language's country — `en-GB` says it, `uk` means Ukraine — and that country's currency */
function currencyOfLocale(tag: string) {
  try {
    const locale = new Intl.Locale(tag);
    return currencyOfRegion(locale.region || locale.maximize().region);
  } catch(err) {}
}

/**
 * The currencies offered before the others: the chosen one, USD, EUR (iOS walletCurrencyListItems), then the money
 * of the phone number's country (Android CurrenciesController: phone_country_iso2) and of the app's and the
 * browser's languages
 */
export function getWalletCurrencyHints(
  codes: string[],
  selected: string,
  languages = [I18n.getLastAppliedLangCode(), ...(navigator.languages || [navigator.language])],
  phoneCountry?: string
) {
  const available = new Set(codes);
  const first: string[] = [];
  const add = (code: string) => {
    if(code && available.has(code) && !first.includes(code)) first.push(code);
  };

  add(selected);
  add('USD');
  add('EUR');
  add(currencyOfRegion(phoneCountry));
  languages.filter(Boolean).forEach((tag) => add(currencyOfLocale(tag)));
  return first;
}

/** iOS's order: the hints, then the rest by code */
export function sortWalletCurrencies(...args: Parameters<typeof getWalletCurrencyHints>) {
  const first = getWalletCurrencyHints(...args);
  return [...first, ...args[0].filter((code) => !first.includes(code)).sort()];
}
