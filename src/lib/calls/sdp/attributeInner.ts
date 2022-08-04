/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import splitStringByLimitWithRest from '../../../helpers/string/splitStringByLimitWithRest';

export default class SDPAttributeInner {
  #key: string;
  #lines: Array<string>;
  #prefix: string;
  #nestedMap: Map<string, SDPAttributeInner>;
  #missed: boolean;
  #keys: Array<string>;

  constructor(key: SDPAttributeInner['key'], lines: SDPAttributeInner['lines'], prefix: string = ':', missed = false) {
    this.#key = key;
    this.#lines = lines;
    this.#prefix = prefix;
    this.#missed = missed;
    this.#nestedMap = missed ? new Map() : null;
    this.#keys = missed ? [] : null;
  }

  public get lines() {
    return this.#lines;
  }

  public get value() {
    return this.#missed || !this.lines.length ? null : this.lines[0];
  }

  public get exists() {
    return !this.#missed;
  }

  public get key() {
    return this.#key;
  }

  public get keys() {
    SDPAttributeInner.fill(this);
    return this.#keys;
  }

  public forEach(callback: Parameters<Map<string, SDPAttributeInner>['forEach']>[0]) {
    SDPAttributeInner.fill(this);
    this.#nestedMap.forEach(callback);
  }

  public get(key: string) {
    SDPAttributeInner.fill(this);
    return this.#nestedMap.get(key) || new SDPAttributeInner(key, [], ':', true);
  }

  private static fill(attribute: SDPAttributeInner) {
    if(attribute.#nestedMap !== null) {
      return;
    }

    const map: Map<string, Array<string>> = new Map();
    attribute.lines.forEach((str) => {
      const [key, rest] = splitStringByLimitWithRest(str, attribute.#prefix, 1);
      const values = map.get(key) || [];
      map.set(key, [...values, rest || '']);
    });

    const nestedMap = attribute.#nestedMap = SDPAttributeInner.makeAttributes(map);
    attribute.#keys = Array.from(nestedMap.keys());
  }

  private static makeAttributes(innerParts: Map<string, Array<string>>) {
    const out: Map<string, SDPAttributeInner> = new Map();

    innerParts.forEach((lines, key) => {
      out.set(key, new SDPAttributeInner(key, lines));
    });

    return out;
  }
}
