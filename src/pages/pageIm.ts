/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import blurActiveElement from '../helpers/dom/blurActiveElement';
import loadFonts from '../helpers/dom/loadFonts';
import rootScope from '../lib/rootScope';
import Page from './page';

const onFirstMount = () => {
  rootScope.managers.appStateManager.pushToState('authState', {_: 'authStateSignedIn'});
  // ! TOO SLOW
  /* appStateManager.saveState(); */

  page.pageEl.style.display = '';

  blurActiveElement();

  return Promise.all([
    import('../lib/appManagers/appDialogsManager'),
    loadFonts()/* .then(() => new Promise((resolve) => window.requestAnimationFrame(resolve))) */,
    'requestVideoFrameCallback' in HTMLVideoElement.prototype ? Promise.resolve() : import('../helpers/dom/requestVideoFrameCallbackPolyfill')
  ]).then(([appDialogsManager]) => {
    appDialogsManager.default.start();
    document.body.classList.remove('has-auth-pages');
    setTimeout(() => {
      document.getElementById('auth-pages').remove();
    }, 1e3);
  });
};

const page = new Page('page-chats', false, onFirstMount);
export default page;
