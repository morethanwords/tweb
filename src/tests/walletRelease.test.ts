import {describe, expect, it} from 'vitest';
import {readFileSync} from 'fs';
import walkSources from '@/tests/helpers/walkSources';

/*
 * Until the wallet is released (`WALLET_RELEASED`, lib/wallet/release.ts) nothing may lead into it. Every way in asks
 * whether the wallet shows, and the server's `wallet_available` is half of that answer: read anywhere but through
 * `isWalletAvailable`, it is a way in that skips the release. This fails on such a read.
 */

/** Files that may name the field: where it is declared, and the gate itself */
const ALLOWED = new Set([
  'src/appConfig.d.ts',
  'src/layer.d.ts',
  'src/lib/wallet/release.ts'
]);

describe('the wallet before its release', () => {
  it('is shown only through isWalletAvailable', () => {
    const readers = walkSources('src', ['tests', 'vendor']).filter((path) => !ALLOWED.has(path) && readFileSync(path, 'utf8').includes('wallet_available'));
    expect(readers).toEqual([]);
  });
});
