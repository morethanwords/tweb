/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import '@helpers/peerIdPolyfill';

// appImManager's onHashChangeUnsafe treats a bare `#xxx` fragment as a route:
// its `default` branch sets `params.p` and falls through to `#/im`, where a
// non-'@' value is parsed with toPeerId(). Importing the manager here would drag
// in the whole app, so this pins the predicate the guard is built on: only a
// username or a numeric peer id may reach that branch.
function isRoutableFragment(hash: string) {
  const p = hash.split('?')[0].slice(1);
  return p[0] === '@' || p.isPeerId();
}

describe('hash route guard', () => {
  it('routes usernames and peer ids', () => {
    expect(isRoutableFragment('#@durov')).toBe(true);
    expect(isRoutableFragment('#1234567')).toBe(true);
    expect(isRoutableFragment('#-1001234567')).toBe(true);
    expect(isRoutableFragment('#-1001234567?thread=5')).toBe(true);
  });

  it('ignores in-page anchors such as the skip link target', () => {
    expect(isRoutableFragment('#column-center')).toBe(false);
    expect(isRoutableFragment('#column-left')).toBe(false);
    expect(isRoutableFragment('#skip-to-content')).toBe(false);
  });

  it('would otherwise resolve those anchors to NaN', () => {
    // the exact reason the guard exists
    expect('column-center'.toPeerId()).toBeNaN();
  });
});
