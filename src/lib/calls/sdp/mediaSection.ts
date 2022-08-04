/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {AttributeMap} from '.';
import {NoExtraProperties} from '../../../types';
import SDPAttributes from './attributes';
import SDPLine from './line';

export type SDPMediaDirection = 'sendonly' | 'recvonly' | 'inactive' | 'sendrecv';
export default class SDPMediaSection {
  #lines: Array<SDPLine>;
  #mediaLine: SDPLine;
  #attributes: SDPAttributes;
  #direction: SDPMediaDirection;

  constructor(lines: Array<SDPLine>) {
    this.#lines = lines;
    this.#mediaLine = lines[0];
    this.#attributes = this.#direction = null;
  }

  public get lines() {
    return this.#lines;
  }

  public get mediaLine() {
    return this.#mediaLine;
  }

  public get mediaLineParts() {
    return this.#mediaLine.mediaLineParts;
  }

  public get mediaType() {
    return this.mediaLineParts.type;
  }

  public get direction() {
    if(!this.#direction) {
      const attributes = this.attributes;

      let direction: SDPMediaDirection;
      if(attributes.get('sendonly').exists) direction = 'sendonly';
      else if(attributes.get('recvonly').exists) direction = 'recvonly';
      else if(attributes.get('inactive').exists) direction = 'inactive';
      else direction = 'sendrecv';

      this.#direction = direction;
    }

    return this.#direction;
  }

  public get isSending() {
    return this.direction === 'sendrecv' || this.direction === 'sendonly';
  }

  public get isReceiving() {
    return this.direction === 'sendrecv' || this.direction === 'recvonly';
  }

  public get attributes() {
    this.#attributes || (this.#attributes = new SDPAttributes(this.lines));
    return this.#attributes;
  }

  public get mid() {
    return this.attributes.get('mid').value;
  }

  public lookupAttributeKeys<T extends AttributeMap>(keys: NoExtraProperties<AttributeMap, T>): {[k in keyof T]: T[k] extends true ? string : string[]} {
    const out: any = {};

    for(const key in keys) {
      const result = this.attributes.get(key);
      // @ts-ignore
      const resultShouldBeArray = !keys[key];
      if(!result) {
        out[key] = resultShouldBeArray ? [] : undefined;
      } else {
        out[key] = resultShouldBeArray ? result.lines : result.value;
      }
    }

    return out;
  }
}
