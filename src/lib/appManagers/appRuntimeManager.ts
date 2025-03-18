/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import appNavigationController from '../../components/appNavigationController';

export class AppRuntimeManager {
  public reload(removeHash = true) {
    try {
      appNavigationController.spliceItems(0, Infinity);
      removeHash && appNavigationController.overrideHash();
      location.reload();
    } catch(e) {};

    // if(window.chrome && chrome.runtime && chrome.runtime.reload) {
    //   chrome.runtime.reload();
    // }
  }

  public close() {
    try {
      window.close();
    } catch(e) {}
  }

  /**
   * Better to call from event
   */
  public focus() {
    // // @ts-ignore
    // if(window.navigator.mozApps && document.hidden) {
    //   // Get app instance and launch it to bring app to foreground
    //   // @ts-ignore
    //   window.navigator.mozApps.getSelf().onsuccess = function() {
    //     this.result.launch();
    //   };
    // } else {
    //   // @ts-ignore
    //   if(window.chrome && chrome.app && chrome.app.window) {
    //     // @ts-ignore
    //     chrome.app.window.current().focus();
    //   }

    window.focus();
    // }
  }
}

const appRuntimeManager = new AppRuntimeManager();
export default appRuntimeManager;
