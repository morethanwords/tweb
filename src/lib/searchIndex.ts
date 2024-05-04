/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import {processSearchText, ProcessSearchTextOptions} from '../helpers/cleanSearchText';
import flatten from '../helpers/array/flatten';

type SearchIndexOptions = ProcessSearchTextOptions & {
  minChars?: number,
  fullWords?: boolean
};

export default class SearchIndex<SearchWhat> {
  private fullTexts: Map<SearchWhat, string> = new Map();

  // minChars can be 0 because it requires at least one word (one symbol) to be found
  constructor(private options: SearchIndexOptions = {}) {
    options.minChars ??= 0;
  }

  public indexObject(id: SearchWhat, searchText: string) {
    /* if(searchIndex.fullTexts.hasOwnProperty(id)) {
      return false;
    } */

    if(searchText.trim()) {
      searchText = this.processSearchText(searchText);
    }

    if(!searchText) {
      this.fullTexts.delete(id);
      return false;
    }

    this.fullTexts.set(id, searchText);

    /* const shortIndexes = searchIndex.shortIndexes;
    searchText.split(' ').forEach((searchWord) => {
      let len = Math.min(searchWord.length, 3),
        wordPart, i;
      for(i = 1; i <= len; i++) {
        wordPart = searchWord.substr(0, i);
        if(shortIndexes[wordPart] === undefined) {
          shortIndexes[wordPart] = [id];
        } else {
          shortIndexes[wordPart].push(id);
        }
      }
    }); */
  }

  public indexObjectArray(id: SearchWhat, searchText: string[]) {
    return this.indexObject(id, searchText.join(' '));
  }

  private _search(
    query: string,
    queryWords = query.split(' ').filter((word) => word.trim()),
    minChars = this.options.minChars
  ) {
    const newFoundObjs: Array<{fullText: string, fullTextLength: number, totalChars?: number, what: SearchWhat, foundChars: number}> = [];
    const fullTexts = this.fullTexts;
    const queryWordsLength = queryWords.length;
    fullTexts.forEach((fullText, what) => {
      let found = true;
      let foundChars = 0;
      // let totalChars = 0;
      for(let i = 0; i < queryWordsLength; ++i) { // * verify that all words are found
        const word = queryWords[i];
        const idx = fullText.indexOf(word);
        const isLastWord = i === (queryWordsLength - 1);
        if(
          idx === -1 ||                                                                         // * if not found at all
          (this.options.fullWords && !isLastWord && fullText[idx + word.length] !== ' ') ||     // * if not last word, then next char must be space
          (idx !== 0 && fullText[idx - 1] !== ' '/*  && !badCharsRe.test(fullText[idx - 1]) */) // * search only from word beginning
        ) {
          found = false;
          break;
        }

        foundChars += word.length;

        // * count how many chars could possibly be found
        // const nextSpaceIdx = fullText.indexOf(' ', idx);
        // const textWordLength = (nextSpaceIdx === -1 ? fullText.length : nextSpaceIdx) - idx;
        // totalChars += textWordLength;
      }

      if(found) {
        foundChars += queryWordsLength - 1;
        const fullTextLength = fullText.length;
        if(minChars <= foundChars || fullTextLength <= foundChars) {
          newFoundObjs.push({fullText, fullTextLength/* , totalChars */, what, foundChars});
        }
      }
    });

    return newFoundObjs;
  }

  public search(query: string, minChars?: number) {
    query = this.processSearchText(query);

    const queries = query.split('\x01');
    const results = queries.map((query) => this._search(query, undefined, minChars));
    const newFoundObjs = flatten(results);

    newFoundObjs.sort((a, b) => {
      const aLeftChars = a.fullTextLength - a.foundChars;
      const bLeftChars = b.fullTextLength - b.foundChars;
      return aLeftChars - bLeftChars || a.fullTextLength - b.fullTextLength;
    });

    const newFoundObjs2: Set<SearchWhat> = new Set(newFoundObjs.map((o) => o.what));
    return newFoundObjs2;
  }

  public processSearchText(query: string) {
    return this.options ? processSearchText(query, this.options) : query;
  }
}
