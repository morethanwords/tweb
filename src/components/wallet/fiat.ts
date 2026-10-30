/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {WalletRates} from '@appManagers/appWalletManager';
import rootScope from '@lib/rootScope';
import {useAppConfig} from '@stores/appState';

/**
 * The fiat currency the wallet counts in, and what a Gram is worth in it — light enough for a chat's lines to read
 * without the wallet's own code (iOS: the wallet context's fiat state, which the transfer's service line reads)
 */

const CURRENCY_STORAGE_KEY = 'wallet_fiat_currency';
/** this tab asks the worker again after as long as the worker keeps its rates */
const RATES_TTL = 5 * 60e3;

/** the fiat currency the user picked for the wallet */
export function readWalletCurrency() {
  try {
    return localStorage.getItem(CURRENCY_STORAGE_KEY) || 'USD';
  } catch(err) {
    return 'USD';
  }
}

export function writeWalletCurrency(code: string) {
  try {
    localStorage.setItem(CURRENCY_STORAGE_KEY, code);
  } catch(err) {}
}

export type WalletFiatRate = {currency: string, perGram: number};

/**
 * A Gram in `currency`: the dollar's rate is the app config's, another currency's comes with the wallet's rates;
 * nothing for a rate that is not a positive number
 */
export function pickWalletFiatRate(currency: string, usdPerGram: number, rates?: WalletRates['rates']): WalletFiatRate {
  const perGram = currency === 'USD' ? (usdPerGram || rates?.USD) : rates?.[currency];
  return Number.isFinite(perGram) && perGram > 0 ? {currency, perGram} : undefined;
}

let rates: WalletRates;
let loading: Promise<void>;

function loadRates() {
  return loading ??= rootScope.managers.appWalletManager.getRates().then((value) => {
    rates = value;
  }, () => {
    // * not asked again on every line drawn: once the time is up, as for rates that came
    rates = {rates: rates?.rates || {}, date: Date.now()};
  }).finally(() => {
    loading = undefined;
  });
}

/**
 * A Gram in the wallet's currency as this tab knows it now, or nothing yet: the rates are asked for once they are
 * missing or old, without waiting for them
 */
export function getWalletFiatRate() {
  const currency = readWalletCurrency();
  if(currency !== 'USD' && (!rates || Date.now() - rates.date > RATES_TTL)) {
    loadRates();
  }

  return pickWalletFiatRate(currency, useAppConfig()?.ton_usd_rate, rates?.rates);
}

/** the same, once the rates this tab asked for came: for a line drawn before they did */
export function loadWalletFiatRate() {
  const known = getWalletFiatRate();
  return known ? Promise.resolve(known) : (loading || loadRates()).then(() => getWalletFiatRate());
}
