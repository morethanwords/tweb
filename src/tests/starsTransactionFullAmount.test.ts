import type {StarsAmount, StarsTransaction} from '@layer';
import {getStarsTransactionFullAmount} from '@appManagers/utils/payments/starsTransaction';
import {starsAmountNanounits} from '@appManagers/utils/payments/formatStarsAmount';

const makeTransaction = (extra: Partial<StarsTransaction> = {}): StarsTransaction => ({
  _: 'starsTransaction',
  id: 'receipt',
  date: 1,
  peer: {_: 'starsTransactionPeerUnsupported'},
  pFlags: {},
  paid_messages: 1,
  amount: {_: 'starsAmount', amount: 85, nanos: 0},
  ...extra
});

describe('transaction gross paid amount', () => {
  test.each(['starsAmount', 'starsTonAmount'] as const)('adds an exact fee without losing %s precision', (type) => {
    const amount: StarsAmount = type === 'starsAmount' ?
      {_: type, amount: '9007199254740993', nanos: 999999999} :
      {_: type, amount: '9007199254740993'};
    const fee: StarsAmount = type === 'starsAmount' ? {_: type, amount: 0, nanos: 1} : {_: type, amount: 1};
    const full = getStarsTransactionFullAmount(makeTransaction({amount, starref_amount: fee}));
    expect(full._).toBe(type);
    expect(starsAmountNanounits(full).toString()).toBe(type === 'starsAmount' ? '9007199254740994000000000' : '9007199254740994');
  });

  test.each([
    {paid_messages: 1},
    {paid_messages: undefined, pFlags: {phonegroup_message: true}},
    {paid_messages: undefined, pFlags: {stargift_resale: true}},
    {paid_messages: undefined, pFlags: {offer: true}}
  ] as Partial<StarsTransaction>[])('supports explicit fees for each income kind: %j', (extra) => {
    const full = getStarsTransactionFullAmount(makeTransaction({...extra, starref_amount: {_: 'starsAmount', amount: 15, nanos: 0}}));
    expect(full).toEqual({_: 'starsAmount', amount: '100', nanos: 0});
  });

  test.each([false, true])('derives the full resale or offer price from its rate, offer=%s', (offer) => {
    const full = getStarsTransactionFullAmount(makeTransaction({
      paid_messages: undefined,
      pFlags: offer ? {offer: true} : {stargift_resale: true},
      starref_commission_permille: 150,
      stargift: {_: 'starGiftUnique'} as StarsTransaction['stargift']
    }));
    expect(full).toEqual({_: 'starsAmount', amount: '100', nanos: 0});
  });

  test.each([[333, '1'], [334, '2'], [600, '3'], [0, '1']])('rounds %i-permille resale price to nearest nanounit', (rate, expected) => {
    const full = getStarsTransactionFullAmount(makeTransaction({
      paid_messages: undefined,
      amount: {_: 'starsTonAmount', amount: '1'},
      pFlags: {stargift_resale: true},
      stargift: {_: 'starGiftUnique'} as StarsTransaction['stargift'],
      starref_commission_permille: rate as number
    }));
    expect(full).toEqual({_: 'starsTonAmount', amount: expected});
  });

  test.each([-1, 1000, 1001, NaN, Infinity, 1.5, undefined])('rejects invalid or missing resale rate %s', (rate) => {
    expect(getStarsTransactionFullAmount(makeTransaction({
      paid_messages: undefined,
      pFlags: {stargift_resale: true},
      stargift: {_: 'starGiftUnique'} as StarsTransaction['stargift'],
      starref_commission_permille: rate
    }))).toBeUndefined();
  });

  test.each([
    {pFlags: {refund: true}},
    {amount: {_: 'starsAmount', amount: 0, nanos: -1}},
    {paid_messages: undefined},
    {starref_amount: {_: 'starsTonAmount', amount: 15}},
    {starref_amount: {_: 'starsAmount', amount: 0, nanos: -1}}
  ] as Partial<StarsTransaction>[])('does not invent gross totals for incompatible receipts: %j', (extra) => {
    expect(getStarsTransactionFullAmount(makeTransaction({
      starref_amount: {_: 'starsAmount', amount: 15, nanos: 0},
      ...extra
    }))).toBeUndefined();
  });

  test('does not infer a paid-message total from a commission rate alone', () => {
    expect(getStarsTransactionFullAmount(makeTransaction({starref_commission_permille: 150}))).toBeUndefined();
  });
});
