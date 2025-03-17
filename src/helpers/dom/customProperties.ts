/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MOUNT_CLASS_TO} from '../../config/debug';
import rootScope from '../../lib/rootScope';
import mediaSizes from '../mediaSizes';

export type CustomProperty = string;

export class CustomProperties {
  private cache: {[k in CustomProperty]?: [string, string]};
  private computedStyle: CSSStyleDeclaration;
  private nightComputedStyle: CSSStyleDeclaration;
  private nightElement: HTMLElement;

  constructor() {
    this.cache = {};

    this.nightElement = document.createElement('div');
    this.nightElement.className = 'night';
    this.nightElement.style.display = 'none';
    document.body.append(this.nightElement);

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

  public getProperty(name: CustomProperty, night?: boolean) {
    const values = this.cache[name];
    const index = night ? 1 : 0;
    if(values?.[index]) {
      return values[index];
    }

    this.computedStyle ??= window.getComputedStyle(document.documentElement);
    this.nightComputedStyle ??= window.getComputedStyle(this.nightElement);

    const value = (night ? this.nightComputedStyle : this.computedStyle).getPropertyValue('--' + name).trim();
    return this.setPropertyCache(name, value, night);
  }

  public getPropertyAsColor(name: CustomProperty) {
    const value = this.getProperty(name);
    if(value[0] === '#') {
      return value;
    }

    return `rgb(${value})`;
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

  public setPropertyCache(name: CustomProperty, value: string, night?: boolean) {
    return (this.cache[name] ??= [] as any)[night ? 1 : 0] = value;
  }
}

const customProperties = new CustomProperties();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.customProperties = customProperties);
export default customProperties;
