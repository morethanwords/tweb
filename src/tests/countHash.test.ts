import countHash from '@helpers/long/countHash';

// Reference implementation, straight off tdesktop's `Api::HashUpdate` — kept independent of the
// helper so a rewrite of the helper has something to be wrong against.
function referenceHash(values: (string | number)[]) {
  const mask = (BigInt(1) << BigInt(64)) - BigInt(1);
  let hash = BigInt(0);
  for(const value of values) {
    hash ^= hash >> BigInt(21);
    hash ^= (hash << BigInt(35)) & mask;
    hash ^= hash >> BigInt(4);
    hash = (hash + BigInt(value)) & mask;
  }

  return hash.toString();
}

const UINT64_MAX = (BigInt(1) << BigInt(64)) - BigInt(1);

describe('countHash', () => {
  test('an empty list hashes to 0 — the value that asks the server for everything', () => {
    expect(countHash([])).toEqual('0');
  });

  test('matches the reference fold', () => {
    const ids = ['6062379710199898950', '6062379710199898951', '6062379710199898952'];
    expect(countHash(ids)).toEqual(referenceHash(ids));
  });

  test('depends on order, so a reorder invalidates the cached list', () => {
    const ids = ['1000', '2000', '3000'];
    expect(countHash(ids)).not.toEqual(countHash([ids[1], ids[0], ids[2]]));
  });

  test('a changed member changes the hash', () => {
    expect(countHash(['1000', '2000'])).not.toEqual(countHash(['1000', '2001']));
  });

  test('stays within uint64 for negative ids', () => {
    // Document ids are int64 and routinely negative; the fold is over uint64, so the result must
    // still be a plain unsigned value that `storeLong` can serialize.
    const hash = BigInt(countHash(['-6062379710199898950', '-1']));
    expect(hash >= BigInt(0)).toBe(true);
    expect(hash <= UINT64_MAX).toBe(true);
  });

  test('stays within uint64 across a long list', () => {
    const ids = Array.from({length: 200}, (_, i) => String(i * 982451653));
    const hash = BigInt(countHash(ids));
    expect(hash >= BigInt(0)).toBe(true);
    expect(hash <= UINT64_MAX).toBe(true);
  });

  test('accepts numbers as well as long strings', () => {
    expect(countHash([1, 2, 3])).toEqual(countHash(['1', '2', '3']));
  });
});
