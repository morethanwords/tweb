/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {describe, expect, it} from 'vitest';
import {parseWalletPastedWords} from '@components/wallet/screens/wordFields';

const WORDS = 'abandon ability able about above absent absorb abstract absurd abuse access accident'.split(' ');

describe('a pasted secret phrase', () => {
  it('splits at whitespace, commas and semicolons, lowercased', () => {
    expect(parseWalletPastedWords('Abandon,ability; able\n\tabout  above')).toEqual(WORDS.slice(0, 5));
  });

  it('drops bullets, dashes and quotes around a word', () => {
    expect(parseWalletPastedWords('• abandon\n- ability\n— "able"\n«about»\n* \'above\'')).toEqual(WORDS.slice(0, 5));
  });

  it('drops every way of numbering a word', () => {
    expect(parseWalletPastedWords('1. abandon 2) ability 3: able (4) about [5] above 6 absent')).toEqual(WORDS.slice(0, 6));
    expect(parseWalletPastedWords('1.abandon 2)ability 3:able (4)about [5]above')).toEqual(WORDS.slice(0, 5));
  });

  it('puts a complete numbered list read row by row from two columns back in order', () => {
    const rows: string[] = [];
    for(let i = 0; i < 6; ++i) rows.push(`${i + 1}. ${WORDS[i]}   ${i + 7}. ${WORDS[i + 6]}`);
    expect(parseWalletPastedWords(rows.join('\n'))).toEqual(WORDS);
  });

  it('keeps the order of a list it cannot sort without guessing', () => {
    // * a number missing
    const gap = WORDS.map((word, i) => `${i === 3 ? 13 : 12 - i}. ${word}`).join(' ');
    expect(parseWalletPastedWords(gap)).toEqual(WORDS);
    // * two numbers in a row: one of them is no word's
    const twice = '1. 2. ' + WORDS.slice(1).map((word, i) => `${i + 3}. ${word}`).join(' ') + ' abandon';
    expect(parseWalletPastedWords(twice)[0]).toBe('ability');
    // * not 12 or 24 words
    expect(parseWalletPastedWords('2. ability 1. abandon')).toEqual(['ability', 'abandon']);
  });

  it('gives nothing for text with no words', () => {
    expect(parseWalletPastedWords('  • — 1. ;; ,  ')).toEqual([]);
  });
});
