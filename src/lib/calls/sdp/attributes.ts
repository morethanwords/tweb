/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import SDPAttributeInner from './attributeInner';
import SDPLine from './line';

export default class SDPAttributes {
  #lines: SDPLine[];
  #attributes: Map<string, SDPAttributeInner>;

  constructor(lines: SDPLine[]) {
    this.#lines = lines;
    this.#attributes = new Map();
    SDPAttributes.fillAttributes(this);
  }

  public get(key: string) {
    return this.#attributes.get(key) || new SDPAttributeInner(key, [], ' ', true);
  }

  private static fillAttributes(attributes: SDPAttributes) {
    const attributesMap: Map<string, Array<string>> = new Map();
    attributes.#lines.forEach((line) => {
      if(line.key === 'a') {
        const {key, value} = line.parsed;

        let linesArray = attributesMap.get(key);
        if(!linesArray) {
          linesArray = [];
          attributesMap.set(key, linesArray);
        }

        linesArray.push(value || '');
      }
    });

    attributesMap.forEach((linesArray, key) => {
      attributes.#attributes.set(key, new SDPAttributeInner(key, linesArray, ' ', false));
    });
  }
}
