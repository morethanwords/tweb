import bigInt from 'big-integer';
import isObject from '@helpers/object/isObject';
import {StarsAmount} from '@layer';

export default function formatStarsAmount<T extends StarsAmount | Long, K extends boolean = false>(
  amount: T,
  ton?: K
): T extends Long ? (K extends true ? StarsAmount.starsTonAmount : StarsAmount.starsAmount) : number {
  if(isObject(amount)) {
    if(amount._ === 'starsAmount') {
      return (+amount.amount + +(amount.nanos || 0) / 1e9) as any;
    } else {
      return +amount.amount / 1e9 as any;
    }
  }

  const integerString = typeof(amount) === 'string' && /^-?\d+$/.test(amount);
  const whole = integerString ? amount : Math.trunc(+amount);
  const nanos = integerString ? 0 : Math.round((+amount - +whole) * 1e9);
  if(ton) {
    const starsAmount: StarsAmount.starsTonAmount = {
      _: 'starsTonAmount',
      amount: bigInt(String(whole)).multiply(1e9).add(nanos).toString()
    };

    return starsAmount as any;
  }

  const starsAmount: StarsAmount.starsAmount = {
    _: 'starsAmount',
    amount: whole,
    nanos
  };

  return starsAmount as any;
}

/** Keep int64 amounts and all nine fractional digits intact in transaction receipts. */
export function starsAmountNanounits(amount: StarsAmount) {
  const value = bigInt(String(amount.amount));
  return amount._ === 'starsAmount' ? value.multiply(1e9).add(amount.nanos || 0) : value;
}

export function formatStarsAmountExact(amount: StarsAmount) {
  const value = starsAmountNanounits(amount);
  const {quotient, remainder} = value.abs().divmod(1e9);
  const fraction = remainder.toString().padStart(9, '0').replace(/0+$/, '');
  return (value.isNegative() ? '-' : '') + quotient.toString() + (fraction ? '.' + fraction : '');
}
