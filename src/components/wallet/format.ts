/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import bigInt from 'big-integer';
import {formatNanoton, nanotonToJsNumber} from '@helpers/paymentsWrapCurrencyAmount';
import paymentsWrapCurrencyAmount from '@helpers/paymentsWrapCurrencyAmount';
import Currencies from '@config/currencies';
import {nanosToFiat} from '@components/wallet/fiatAmount';

export const NANOS_PER_GRAM = 1e9;

/**
 * An amount in Grams as the wallet writes it: up to 9 decimals, trailing zeros trimmed.
 */
export function formatGrams(nanos: string | number, maxDecimals = 9, withThousandsSep = true) {
  return formatNanoton(nanos, maxDecimals, withThousandsSep);
}

const NANOS_PER_CENT = NANOS_PER_GRAM / 100;

/**
 * Whole part and exactly two decimals, the way the card and the history rows show a balance. The rest is cut, not
 * rounded, as in tdesktop: 1.999 reads 1.99, never more than there is.
 */
export function splitGrams(nanos: string | number) {
  const cents = bigInt(String(nanos)).divide(NANOS_PER_CENT).multiply(NANOS_PER_CENT);
  const str = formatNanoton(cents.toString(), 2, true);
  const [whole, fraction = ''] = str.split('.');
  return {whole, fraction: '.' + fraction.padEnd(2, '0')};
}

export function gramsToNumber(nanos: string | number) {
  return nanotonToJsNumber(nanos);
}

export function absNanos(nanos: string | number) {
  return bigInt(String(nanos)).abs().toString();
}

export function isNegativeNanos(nanos: string | number) {
  return String(nanos).startsWith('-');
}

export function compareNanos(a: string | number, b: string | number) {
  return bigInt(String(a)).compare(bigInt(String(b)));
}

/**
 * Fiat value of an amount of Grams, formatted as the app formats that currency; `fractionDigits` writes more
 * decimals than the currency's own (a fee: `$0.0058`)
 */
export function formatFiat(nanos: string | number, fiatPerGram: number, currency: string, fractionDigits?: number) {
  const exp = Currencies[currency]?.exp ?? 2;
  // * rounded in exact decimals, as the amount screen rounds (a float makes 1.005 a 1.00): the formatter only
  // * writes the digits that are already there
  const value = nanosToFiat(absNanos(nanos), fiatPerGram, fractionDigits ?? exp);
  const minor = Number(value) * 10 ** exp;
  return paymentsWrapCurrencyAmount(isNegativeNanos(nanos) ? -minor : minor, currency, false, false, true, fractionDigits);
}

/**
 * Grams cut to `decimals`, never rounded up, trailing zeros trimmed — as iOS writes a transfer's amount (3) and its
 * fee (5). An amount the cut would leave at zero keeps all its digits. Unsigned.
 */
export function formatGramsCut(nanos: string | number, decimals: number) {
  const value = bigInt(String(nanos)).abs();
  const unit = bigInt(10).pow(9 - decimals);
  const cut = value.divide(unit).multiply(unit);
  return cut.isZero() ? formatGrams(value.toString()) : formatGrams(cut.toString(), decimals);
}

/**
 * `UQAl 1dVi v82p …`: the address in groups of four, `groupsPerLine` groups to a line
 */
export function groupAddress(address: string, groupsPerLine = address.length) {
  const groups = address.match(/.{1,4}/g) || [];
  const lines: string[] = [];
  for(let i = 0; i < groups.length; i += groupsPerLine) {
    lines.push(groups.slice(i, i + groupsPerLine).join(' '));
  }

  return lines;
}

/**
 * A collectible by its name, or by its address when it has none
 */
export function walletNftName(item: {name?: string, address: string}) {
  return item.name || shortAddress(item.address);
}

export function shortAddress(address: string, edge = 4) {
  if(address.length <= edge * 2 + 1) {
    return address;
  }

  return address.slice(0, edge) + '…' + address.slice(-edge);
}

/** Grams bought through Telegram's own provider came for crypto, through any other for a card (Android) */
export function isCryptoTopUp(provider: string) {
  return /^(walt|wallet)$/i.test(provider?.trim() || '');
}

/** a top-up's provider with its first letter up, as Android writes it: "Moonpay" for "moonpay" */
export function walletProviderName(name: string) {
  const index = name ? name.search(/\p{L}/u) : -1;
  if(index < 0) return name;
  const letter = String.fromCodePoint(name.codePointAt(index));
  return name.slice(0, index) + letter.toLocaleUpperCase() + name.slice(index + letter.length);
}
