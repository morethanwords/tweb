/*
 * The wallet's currency list in iOS's order: the chosen currency, USD, EUR, the money of the phone number's country
 * (Android) and of the languages in use, then the rest by code.
 */

import {describe, expect, it} from 'vitest';
import {getWalletCurrencyHints, sortWalletCurrencies} from '@components/wallet/currencyOrder';

const CODES = ['RUB', 'GBP', 'EUR', 'USD', 'UAH', 'JPY', 'AED'];

describe('wallet currency order', () => {
  it('puts the chosen one first, then USD and EUR, the rest by code', () => {
    expect(sortWalletCurrencies(CODES, 'JPY', [])).toEqual(['JPY', 'USD', 'EUR', 'AED', 'GBP', 'RUB', 'UAH']);
  });

  it('adds the money of the app\'s and the browser\'s languages after EUR', () => {
    // * `uk` is Ukraine's language, `en-GB` names its country
    expect(sortWalletCurrencies(CODES, 'USD', ['uk', 'en-GB', 'ru'])).toEqual(['USD', 'EUR', 'UAH', 'GBP', 'RUB', 'AED', 'JPY']);
  });

  it('skips a language whose currency has no rate, and one it cannot read', () => {
    expect(sortWalletCurrencies(['USD', 'EUR', 'GBP'], 'EUR', ['de-CH', 'not a tag'])).toEqual(['EUR', 'USD', 'GBP']);
  });

  it('adds the money of the phone number\'s country right after EUR (Android: phone_country_iso2)', () => {
    expect(sortWalletCurrencies(CODES, 'USD', ['en-GB'], 'ae')).toEqual(['USD', 'EUR', 'AED', 'GBP', 'JPY', 'RUB', 'UAH']);
    // * one the rates do not know, or no country at all, adds nothing
    expect(sortWalletCurrencies(CODES, 'USD', [], 'BR')).toEqual(['USD', 'EUR', 'AED', 'GBP', 'JPY', 'RUB', 'UAH']);
    expect(sortWalletCurrencies(CODES, 'USD', [], undefined)).toEqual(['USD', 'EUR', 'AED', 'GBP', 'JPY', 'RUB', 'UAH']);
  });

  it('tells which of them are the hints the divider follows', () => {
    expect(getWalletCurrencyHints(CODES, 'JPY', ['uk'], 'GB')).toEqual(['JPY', 'USD', 'EUR', 'GBP', 'UAH']);
  });
});
