/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {LangPackKey, i18n} from '../lib/langPack';

export default class LoginPage {
  public element: HTMLElement;
  public container: HTMLElement;
  public imageDiv: HTMLElement;
  public inputWrapper: HTMLElement;
  public title: HTMLElement;
  public subtitle: HTMLParagraphElement;

  constructor(options: {
    className: string,
    withInputWrapper?: boolean,
    titleLangKey?: LangPackKey,
    subtitleLangKey?: LangPackKey,
  }) {
    this.element = document.body.querySelector('.' + options.className) as HTMLDivElement;
    // this.element = document.createElement('div');
    // this.element.className = 'page-' + options.className;

    this.container = document.createElement('div');
    this.container.className = 'container center-align';

    this.imageDiv = document.createElement('div');
    this.imageDiv.className = 'auth-image';

    this.title = document.createElement('h4');
    if(options.titleLangKey) {
      this.title.append(i18n(options.titleLangKey));
    }

    this.subtitle = document.createElement('p');
    this.subtitle.className = 'subtitle';
    if(options.subtitleLangKey) {
      this.subtitle.append(i18n(options.subtitleLangKey));
    }

    this.container.append(this.imageDiv, this.title, this.subtitle);

    if(options.withInputWrapper) {
      this.inputWrapper = document.createElement('div');
      this.inputWrapper.className = 'input-wrapper';
      this.container.append(this.inputWrapper);
    }

    this.element.append(this.container);
  }
}
