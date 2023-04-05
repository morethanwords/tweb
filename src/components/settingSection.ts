/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {LangPackKey, FormatterArguments, i18n_} from '../lib/langPack';
import {generateDelimiter} from './generateDelimiter';
import Scrollable from './scrollable';

export type SettingSectionOptions = {
  name?: LangPackKey | HTMLElement,
  nameArgs?: FormatterArguments,
  caption?: LangPackKey | true,
  captionArgs?: FormatterArguments,
  captionOld?: SettingSectionOptions['caption'],
  noDelimiter?: boolean,
  fakeGradientDelimiter?: boolean,
  noShadow?: boolean,
  // fullWidth?: boolean,
  // noPaddingTop?: boolean
};

const className = 'sidebar-left-section';
export default class SettingSection {
  public container: HTMLElement;
  public innerContainer: HTMLElement;
  public content: HTMLElement;
  public title: HTMLElement;
  public caption: HTMLElement;

  private fullWidth: boolean;

  constructor(options: SettingSectionOptions = {}) {
    const container = this.container = document.createElement('div');
    container.classList.add(className + '-container');

    const innerContainer = this.innerContainer = document.createElement('div');
    innerContainer.classList.add(className);

    if(options.noShadow) {
      innerContainer.classList.add('no-shadow');
    }

    if(options.fakeGradientDelimiter) {
      innerContainer.append(generateDelimiter());
      innerContainer.classList.add('with-fake-delimiter');
    } else if(!options.noDelimiter) {
      const hr = document.createElement('hr');
      innerContainer.append(hr);
    } else {
      innerContainer.classList.add('no-delimiter');
    }

    // if(options.fullWidth) {
    //   this.fullWidth = true;
    // }

    // if(options.noPaddingTop) {
    //   innerContainer.classList.add('no-padding-top');
    // }

    const content = this.content = this.generateContentElement();

    if(options.name) {
      const title = this.title = document.createElement('div');
      title.classList.add('sidebar-left-h2', className + '-name');
      if(typeof(options.name) === 'string') {
        i18n_({element: title, key: options.name, args: options.nameArgs});
      } else {
        title.append(options.name);
      }
      content.append(title);
    }

    container.append(innerContainer);

    const caption = options.caption ?? options.captionOld;
    if(caption) {
      const el = this.caption = this.generateContentElement();
      el.classList.add(className + '-caption');

      if(!options.captionOld) {
        container.append(el);
      }

      if(caption !== true) {
        i18n_({element: el, key: caption, args: options.captionArgs});
      }
    }
  }

  public generateContentElement() {
    const content = document.createElement('div');
    content.classList.add(className + '-content');

    // if(this.fullWidth) {
    //   content.classList.add('full-width');
    // }

    this.innerContainer.append(content);
    return content;
  }
}

export const generateSection = (appendTo: Scrollable, name?: LangPackKey, caption?: LangPackKey) => {
  const section = new SettingSection({name, caption});
  appendTo.append(section.container);
  return section.content;
};
