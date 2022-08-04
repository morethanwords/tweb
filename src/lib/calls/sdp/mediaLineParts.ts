/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default class SDPMediaLineParts {
  #type: 'audio' | 'video' | 'application';
  #port: string;
  #protocol: string;
  #ids: string[];

  constructor(
    type: SDPMediaLineParts['type'],
    port: SDPMediaLineParts['port'],
    protocol: SDPMediaLineParts['protocol'],
    ids: SDPMediaLineParts['ids']
  ) {
    this.#type = type;
    this.#port = port;
    this.#protocol = protocol;
    this.#ids = ids;
  }

  public get type() {
    return this.#type;
  }

  public get port() {
    return this.#port;
  }

  public get protocol() {
    return this.#protocol;
  }

  public get ids() {
    return this.#ids;
  }

  toString() {
    return this.type + ' ' + this.port + ' ' + this.protocol + ' ' + this.ids.join(' ');
  }
}
