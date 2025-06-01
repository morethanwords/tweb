/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '.';
import safeAssign from '../../helpers/object/safeAssign';
import {fastRaf} from '../../helpers/schedulers';
import {AttachMenuBot} from '../../layer';
import ButtonMenuToggle from '../buttonMenuToggle';
import WebApp from '../webApp';

export default class PopupWebApp extends PopupElement {
  private webApp: WebApp;

  constructor(options: {
    webViewResultUrl: WebApp['webViewResultUrl'],
    webViewOptions: WebApp['webViewOptions'],
    attachMenuBot?: AttachMenuBot
  }) {
    super('popup-payment popup-payment-verification popup-web-app', {
      closable: true,
      overlayClosable: true,
      body: true,
      title: true,
      onBackClick: () => this.webApp.onBackClick(),
      isConfirmationNeededOnClose: () => this.webApp.isConfirmationNeededOnClose()
    });

    safeAssign(this, options);

    this.webApp = new WebApp({
      ...options,
      header: this.header,
      title: this.title,
      body: this.body,
      forceHide: this.forceHide,
      onBackStatus: (visible) => this.btnCloseAnimatedIcon.classList.toggle('state-back', visible)
    });

    const btnMenu = ButtonMenuToggle({
      listenerSetter: this.listenerSetter,
      buttons: this.webApp.getMenuButtons(),
      direction: 'bottom-left'
    });
    this.title.after(btnMenu);

    this.webApp.init(() => {
      this.show();
      fastRaf(() => {
        this.container.style.setProperty('--browser-width', `${this.container.clientWidth}px`);
      })
    });
  }

  protected destroy() {
    this.webApp.destroy();
    return super.destroy();
  }
}
