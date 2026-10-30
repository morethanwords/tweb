/*
 * A transfer's comment limit: 960 UTF-8 bytes, private or public (tdesktop, Android), counted on what is sent — the
 * comment without the blank around it — so a Cyrillic letter costs two and an emoji four.
 */

import {describe, expect, it} from 'vitest';
import {COMMENT_MAX_BYTES, COMMENT_WARN_BYTES, commentBytesLeft, getWalletErrorLangKey} from '@components/wallet/send';

describe('a transfer\'s comment', () => {
  it('has 960 bytes, counted in UTF-8', () => {
    expect(COMMENT_MAX_BYTES).toBe(960);
    expect(commentBytesLeft('')).toBe(960);
    expect(commentBytesLeft('a'.repeat(960))).toBe(0);
    expect(commentBytesLeft('a'.repeat(961))).toBe(-1);
    // * two bytes a letter
    expect(commentBytesLeft('я'.repeat(480))).toBe(0);
    expect(commentBytesLeft('я'.repeat(481))).toBe(-2);
    // * four bytes an emoji
    expect(commentBytesLeft('😀'.repeat(241))).toBe(-4);
  });

  it('is counted without the blank around it, as it is sent', () => {
    expect(commentBytesLeft('  ' + 'a'.repeat(960) + '\n\n')).toBe(0);
  });

  it('starts counting down near the end only', () => {
    expect(COMMENT_WARN_BYTES).toBeLessThan(COMMENT_MAX_BYTES / 10);
  });

  it('says a public one is too long in its own words', () => {
    expect(getWalletErrorLangKey({type: 'WALLET_PUBLIC_COMMENT_TOO_LONG'})).toBe('Wallet.Transfer.PublicCommentTooLongText');
    expect(getWalletErrorLangKey({type: 'WALLET_COMMENT_TOO_LONG'})).toBe('Wallet.Transfer.CommentTooLongText');
  });
});
