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

export default class SearchIndex<SearchWhat> {
  private fullTexts: Map<SearchWhat, string> = new Map();

  // minChars can be 0 because it requires at least one word (one symbol) to be found
  constructor(private options?: ProcessSearchTextOptions, private minChars = 0) {
  }

  public indexObject(id: SearchWhat, searchText: string) {
    /* if(searchIndex.fullTexts.hasOwnProperty(id)) {
      return false;
    } */

    if(this.options && searchText.trim()) {
      searchText = processSearchText(searchText, this.options);
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

  private _search(query: string) {
    const newFoundObjs: Array<{fullText: string, fullTextLength: number, what: SearchWhat, foundChars: number}> = [];
    const fullTexts = this.fullTexts;
    const queryWords = query.split(' ');
    const queryWordsLength = queryWords.length;
    fullTexts.forEach((fullText, what) => {
      let found = true;
      let foundChars = 0;
      for(let i = 0; i < queryWordsLength; ++i) { // * verify that all words are found
        const word = queryWords[i];
        const idx = fullText.indexOf(word);
        if(idx === -1 || (idx !== 0 && fullText[idx - 1] !== ' '/*  && !badCharsRe.test(fullText[idx - 1]) */)) { // * search only from word beginning
          found = false;
          break;
        }

        foundChars += word.length;
      }

      if(found) {
        foundChars += queryWordsLength - 1;
        const fullTextLength = fullText.length;
        if(this.minChars <= foundChars || fullTextLength <= foundChars) {
          newFoundObjs.push({fullText, fullTextLength, what, foundChars});
        }
      }
    });

    return newFoundObjs;
  }

  public search(query: string) {
    if(this.options) {
      query = processSearchText(query, this.options);
    }

    const queries = query.split('\x01');
    const newFoundObjs = flatten(queries.map((query) => this._search(query)));

    newFoundObjs.sort((a, b) => a.fullTextLength - b.fullTextLength || b.foundChars - a.foundChars);

    // newFoundObjs.sort((a, b) => a.fullText.localeCompare(b.fullText));
    const newFoundObjs2: Set<SearchWhat> = new Set(newFoundObjs.map((o) => o.what));

    return newFoundObjs2;
  }
}
