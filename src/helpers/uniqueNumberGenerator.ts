/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default class UniqueNumberGenerator {
  #set: Set<number>;
  #min: number;
  #max: number;

  constructor(min: number, max: number) {
    this.#set = new Set();
    this.#min = min;
    this.#max = max;
  }

  public generate() {
    const min = this.#min;
    const max = this.#max;
    const set = this.#set;

    const maxTries = max - min + 1;
    let value = Math.floor(min + maxTries * Math.random()), _try = 0;
    while(set.has(value)) {
      if(value < max) {
        ++value;
      } else {
        value = min;
      }

      if(++_try >= maxTries) {
        return null;
      }
    }

    set.add(value);
    return value;
  }

  public add(value: number) {
    this.#set.add(value);
  }
}
