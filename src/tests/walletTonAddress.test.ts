import {formatTonAddress, parseTonAddress, toFriendlyTonAddress} from '@lib/wallet/tonAddress';

// * the example pair from the TON documentation: one account, bounceable and non-bounceable
const BOUNCEABLE = 'EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF';
const NON_BOUNCEABLE = 'UQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPuwA';
const RAW = '0:ca6e321c7cce9ecedf0a8ca2492ec8592494aa5fb5ce0387dff96ef6af982a3e';

describe('TON addresses', () => {
  test('parses a friendly address and checks its checksum', () => {
    const parts = parseTonAddress(BOUNCEABLE);
    expect(parts.bounceable).toBe(true);
    expect(parts.testnet).toBe(false);
    expect(parts.workchain).toBe(0);
    expect(formatTonAddress(parts)).toBe(BOUNCEABLE);
  });

  test('turns any form into the non-bounceable one', () => {
    expect(toFriendlyTonAddress(BOUNCEABLE)).toBe(NON_BOUNCEABLE);
    expect(toFriendlyTonAddress(NON_BOUNCEABLE)).toBe(NON_BOUNCEABLE);
    expect(toFriendlyTonAddress(RAW)).toBe(NON_BOUNCEABLE);
    expect(toFriendlyTonAddress(NON_BOUNCEABLE, true)).toBe(BOUNCEABLE);
  });

  test('refuses what is not an address', () => {
    expect(parseTonAddress('EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHG')).toBeUndefined();
    expect(parseTonAddress('wallet.ton')).toBeUndefined();
    expect(parseTonAddress('')).toBeUndefined();
    expect(toFriendlyTonAddress(undefined)).toBeUndefined();
  });
});
