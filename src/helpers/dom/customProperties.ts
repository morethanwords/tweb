/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import rootScope from "../../lib/rootScope";

export type CustomProperty = string;

export class CustomProperties {
  private cache: {[k in CustomProperty]?: string};
  private computedStyle: CSSStyleDeclaration;

  constructor() {
    this.cache = {};

    rootScope.addEventListener('theme_change', () => {
      this.computedStyle = undefined;
      const cache = this.cache;
      this.cache = {};

      for(let i in cache) {
        this.getProperty(i);
      }
    });
  }

  public getProperty(name: CustomProperty) {
    let value = this.cache[name];
    if(value) {
      return value;
    }

    if(!this.computedStyle) {
      this.computedStyle = window.getComputedStyle(document.documentElement);
    }

    value = this.computedStyle.getPropertyValue('--' + name).trim();
    return this.cache[name] = value;
  }
}

const customProperties = new CustomProperties();
export default customProperties;
