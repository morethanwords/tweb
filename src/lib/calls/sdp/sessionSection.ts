/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import SDPLine from './line';

export default class SDPSessionSection {
  #lines: SDPLine[];
  #sessionId: string;

  constructor(lines: SDPLine[]) {
    this.#lines = lines;
    this.#sessionId = lines.filter((line) => line.key === 'o').map((line) => line.value.split(' ')[1])[0];
  }

  public get lines() {
    return this.#lines;
  }

  public get sessionId() {
    return this.#sessionId;
  }
}
