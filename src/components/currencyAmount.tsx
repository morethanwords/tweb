/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {JSX} from 'solid-js';
import classNames from '@helpers/string/classNames';
import {i18n} from '@lib/langPack';

/**
 * An amount with its currency's icon, as receipts and transaction lists write it (Stars, Grams): bold, and
 * coloured by which way it went — green in, red out, grey while it has not settled
 */
export default function CurrencyAmount(props: {
  /** the digits, signed the way they should read */
  amount: JSX.Element,
  icon?: JSX.Element,
  color?: 'green' | 'danger' | 'secondary',
  /** the icon first */
  reverse?: boolean,
  inline?: boolean,
  /** a chip after the amount, in its colour */
  status?: JSX.Element
}) {
  return (
    <div class={classNames('currency-amount', props.color, props.reverse && 'reverse', props.inline && 'inline')}>
      {/* * a signed number reads left to right whatever the layout */}
      <span dir="ltr">{props.amount}</span>
      {props.icon}
      {props.status && <span class="currency-amount-status">{props.status}</span>}
    </div>
  );
}

/**
 * A balance at the far end of a popup's header: "Balance" over the amount
 */
export function CurrencyBalance(props: {icon: JSX.Element, children: JSX.Element}) {
  return (
    <div class="currency-balance">
      <div class="currency-balance-title">{i18n('StarsBalance')}</div>
      <div class="currency-balance-subtitle">{props.icon}{props.children}</div>
    </div>
  );
}
