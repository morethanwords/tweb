import isObject from '../../../../helpers/object/isObject';
import {StarsAmount} from '../../../../layer';

export default function formatStarsAmount<T extends StarsAmount | Long, K extends boolean = false>(
  amount: T,
  ton?: K
): T extends Long ? (K extends true ? StarsAmount.starsTonAmount : StarsAmount.starsAmount) : number {
  if(isObject(amount)) {
    if('nanos' in amount) {
      return (+amount.amount + +amount.nanos / 1e9) as any;
    } else {
      return +amount.amount / 1e9 as any;
    }
  }

  const nanos = +amount % 1 * 1e9;
  if(ton) {
    const starsAmount: StarsAmount.starsTonAmount = {
      _: 'starsTonAmount',
      amount: nanos
    };

    return starsAmount as any;
  }

  const starsAmount: StarsAmount.starsAmount = {
    _: 'starsAmount',
    amount: Math.abs(+amount | 0),
    nanos
  };

  return starsAmount as any;
}
