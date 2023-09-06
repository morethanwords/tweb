/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {AppColorName} from '../themeController';
import {MOUNT_CLASS_TO} from '../../config/debug';
import rootScope from '../../lib/rootScope';
import mediaSizes from '../mediaSizes';

export type CustomProperty = string;

export class CustomProperties {
  private cache: {[k in CustomProperty]?: string};
  private computedStyle: CSSStyleDeclaration;

  constructor() {
    this.cache = {};

    rootScope.addEventListener('theme_changed', this.resetCache);
    mediaSizes.addEventListener('resize', this.resetCache);
  }

  protected resetCache = () => {
    this.computedStyle = undefined;
    const cache = this.cache;
    this.cache = {};

    for(const i in cache) {
      this.getProperty(i as CustomProperty);
    }
  };

  public getProperty(name: CustomProperty) {
    let value = this.cache[name];
    if(value !== undefined) {
      return value;
    }

    this.computedStyle ??= window.getComputedStyle(document.documentElement);

    value = this.computedStyle.getPropertyValue('--' + name).trim();
    return this.setPropertyCache(name, value);
  }

  public getPropertyAsSize(name: CustomProperty) {
    const value = this.getProperty(name);
    let size: number;

    if(value[value.length - 1] === '%') {

    } else if(value.indexOf('rem')) {
      size = +value.replace('rem', '') * 16;
    } else {
      size = +value.replace('px', '');
    }

    return size;
  }

  public setPropertyCache(name: CustomProperty, value: string) {
    return this.cache[name] = value;
  }
}

const customProperties = new CustomProperties();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.customProperties = customProperties);
export default customProperties;
