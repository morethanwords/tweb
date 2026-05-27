import {AttributeKey} from '.';

export default class SDPAttributeSplitted {
  #key: AttributeKey;
  #value: string;

  // key = 'ssrc-group', value = 'SIM 1 2 3'
  constructor(key: AttributeKey, value: string) {
    this.#key = key;
    this.#value = value;
  }

  public get key() {
    return this.#key;
  }

  public get value() {
    return this.#value;
  }
}
