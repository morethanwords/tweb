/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import blurActiveElement from '../helpers/dom/blurActiveElement';
import loadFonts from '../helpers/dom/loadFonts';
import I18n from '../lib/langPack';
import rootScope from '../lib/rootScope';
import Page from './page';

const onFirstMount = () => {
  rootScope.managers.appStateManager.pushToState('authState', {_: 'authStateSignedIn'});
  // ! TOO SLOW
  /* appStateManager.saveState(); */

  if(!I18n.requestedServerLanguage) {
    I18n.getCacheLangPack().then((langPack) => {
      if(langPack.local) {
        I18n.getLangPack(langPack.lang_code);
      }
    });
  }

  page.pageEl.style.display = '';

  // AudioContext && global.navigator && global.navigator.mediaDevices && global.navigator.mediaDevices.getUserMedia && global.WebAssembly;

  /* // @ts-ignore
  var AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
  alert('AudioContext:' + typeof(AudioContext));
  // @ts-ignore
  alert('global.navigator:' + typeof(navigator));
  alert('navigator.mediaDevices:' + typeof(navigator.mediaDevices));
  alert('navigator.mediaDevices.getUserMedia:' + typeof(navigator.mediaDevices?.getUserMedia));
  alert('global.WebAssembly:' + typeof(WebAssembly)); */

  // (Array.from(document.getElementsByClassName('rp')) as HTMLElement[]).forEach((el) => ripple(el));

  blurActiveElement();

  return Promise.all([
    loadFonts()/* .then(() => new Promise((resolve) => window.requestAnimationFrame(resolve))) */,
    import('../lib/appManagers/appDialogsManager'),
    'requestVideoFrameCallback' in HTMLVideoElement.prototype ? Promise.resolve() : import('../helpers/dom/requestVideoFrameCallbackPolyfill')
  ]).then(([_, appDialogsManager, __]) => {
    appDialogsManager.default.start();
    setTimeout(() => {
      document.getElementById('auth-pages').remove();
    }, 1e3);
  });
};

const page = new Page('page-chats', false, onFirstMount);
export default page;
