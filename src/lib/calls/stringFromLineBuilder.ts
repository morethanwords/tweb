/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/evgeny-nadymov/telegram-react
 * Copyright (C) 2018 Evgeny Nadymov
 * https://github.com/evgeny-nadymov/telegram-react/blob/master/LICENSE
 */

export default class StringFromLineBuilder {
  private lines: string[];
  private newLine: string[];

  constructor(private joiner = '\r\n') {
    this.lines = [];
    this.newLine = [];
  }

  public add(...strs: string[]) {
    this.lines.push(...strs);
    return this;
  }

  public push(word: string) {
    this.newLine.push(word);
    return this;
  }

  public addJoined(separator = '') {
    this.add(this.newLine.join(separator));
    this.newLine = [];
    return this;
  }

  public join() {
    return this.lines.join(this.joiner);
  }

  public finalize() {
    return this.join() + this.joiner;
  }
}
