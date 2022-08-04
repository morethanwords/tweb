/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import splitStringByLimitWithRest from '../../../helpers/string/splitStringByLimitWithRest';
import SDPAttributeSplitted from './attributeSplitted';
import SDPMediaLineParts from './mediaLineParts';

export default class SDPLine {
  #key: 'm' | 'a' | 'o' | 'v' | 's' | 't' | 'c';
  #value: string;
  #mediaLineParts: SDPMediaLineParts;
  #parsed?: SDPAttributeSplitted;

  // key = 'a', value = 'ssrc-group:SIM 1 2 3'
  constructor(key: SDPLine['key'], value: string | SDPMediaLineParts | SDPAttributeSplitted) {
    this.#key = key;

    if(typeof(value) === 'string') {
      this.#value = value;

      if(key === 'm') {
        const splitted = value.split(' ');
        this.#mediaLineParts = new SDPMediaLineParts(splitted[0] as any, splitted[1], splitted[2], splitted.slice(3));
      } else {
        if(key === 'a') {
          const result = splitStringByLimitWithRest(value, ':', 1);
          value = result[0];
          this.#parsed = result.length === 1 ? new SDPAttributeSplitted(value as any, null) : new SDPAttributeSplitted(value as any, result[1]);
        }
      }
    } else {
      if(value instanceof SDPMediaLineParts) {
        this.#mediaLineParts = value;
        this.#value = value.toString();
      } else if(value instanceof SDPAttributeSplitted) {
        this.#parsed = value;
        this.#value = value.value ? `${value.key}:${value.value}` : value.key;
      }
    }
  }

  public get key() {
    return this.#key;
  }

  public get value() {
    return this.#value;
  }

  public get parsed() {
    return this.#parsed;
  }

  public get mediaLineParts() {
    return this.#mediaLineParts;
  }

  toString() {
    return `${this.key}=${this.value}`;
  }
}
