import {StarsAmount} from '../../../../layer';

export default function formatStarsAmount<T extends StarsAmount | Long>(amount: T): T extends Long ? StarsAmount : number {
  if(typeof(amount) !== 'number' && typeof(amount) !== 'string') {
    return (+amount.amount + +amount.nanos / 1e9) as any;
  }

  const nanos = +amount % 1 * 1e9;
  const starsAmount: StarsAmount = {
    _: 'starsAmount',
    amount: Math.abs(+amount | 0),
    nanos
  };

  return starsAmount as any;
}
