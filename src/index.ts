/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/* @refresh reload */

import App from './config/app';
import blurActiveElement from './helpers/dom/blurActiveElement';
import cancelEvent from './helpers/dom/cancelEvent';
import {IS_STICKY_INPUT_BUGGED} from './helpers/dom/fixSafariStickyInputFocusing';
import loadFonts from './helpers/dom/loadFonts';
import IS_EMOJI_SUPPORTED from './environment/emojiSupport';
import {IS_ANDROID, IS_APPLE, IS_APPLE_MOBILE, IS_FIREFOX, IS_MOBILE, IS_MOBILE_SAFARI, IS_SAFARI} from './environment/userAgent';
import './materialize.scss';
import './scss/style.scss';
import pause from './helpers/schedulers/pause';
import setWorkerProxy from './helpers/setWorkerProxy';
import toggleAttributePolyfill from './helpers/dom/toggleAttributePolyfill';
import rootScope from './lib/rootScope';
import IS_TOUCH_SUPPORTED from './environment/touchSupport';
import I18n from './lib/langPack';
import './helpers/peerIdPolyfill';
import './lib/polyfill';
import apiManagerProxy from './lib/mtproto/mtprotoworker';
import getProxiedManagers from './lib/appManagers/getProxiedManagers';
import themeController from './helpers/themeController';
import overlayCounter from './helpers/overlayCounter';
import singleInstance from './lib/mtproto/singleInstance';
import {parseUriParamsLine} from './helpers/string/parseUriParams';
import Modes from './config/modes';
import {AuthState} from './types';
import {IS_BETA} from './config/debug';
import IS_INSTALL_PROMPT_SUPPORTED from './environment/installPrompt';
import cacheInstallPrompt from './helpers/dom/installPrompt';
import {fillLocalizedDates} from './helpers/date';
// import appNavigationController from './components/appNavigationController';

document.addEventListener('DOMContentLoaded', async() => {
  toggleAttributePolyfill();

  // polyfill for replaceChildren
  if((Node as any).prototype.replaceChildren === undefined) {
    (Node as any).prototype.replaceChildren = function(...nodes: any[]) {
      this.textContent = '';
      // while(this.lastChild) {
      //   this.removeChild(this.lastChild);
      // }
      if(nodes) {
        this.append(...nodes);
      }
    }
  }

  rootScope.managers = getProxiedManagers();

  const manifest = document.getElementById('manifest') as HTMLLinkElement;
  if(manifest) manifest.href = `site${IS_APPLE && !IS_APPLE_MOBILE ? '_apple' : ''}.webmanifest?v=jw3mK7G9Aq`;

  singleInstance.start();

  // We listen to the resize event (https://css-tricks.com/the-trick-to-viewport-units-on-mobile/)
  const w = window.visualViewport || window; // * handle iOS keyboard
  let setViewportVH = false/* , hasFocus = false */;
  let lastVH: number;
  const setVH = () => {
    let vh = (setViewportVH && !overlayCounter.isOverlayActive ? (w as VisualViewport).height || (w as Window).innerHeight : window.innerHeight) * 0.01;
    vh = +vh.toFixed(2);
    if(lastVH === vh) {
      return;
    } else if(IS_TOUCH_SUPPORTED && lastVH < vh && (vh - lastVH) > 1) {
      blurActiveElement(); // (Android) fix blurring inputs when keyboard is being closed (e.g. closing keyboard by back arrow and touching a bubble)
    }

    lastVH = vh;

    // const vh = document.documentElement.scrollHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);

    // console.log('setVH', vh, setViewportVH ? w : window);

    /* if(setViewportVH && userAgent.isSafari && touchSupport.isTouchSupported && document.activeElement && (document.activeElement as HTMLElement).blur) {
      const rect = document.activeElement.getBoundingClientRect();
      if(rect.top < 0 || rect.bottom >= (w as any).height) {
        fastSmoothScroll(findUpClassName(document.activeElement, 'scrollable-y') || window as any, document.activeElement as HTMLElement, 'center', 4, undefined, FocusDirection.Static);
      }
    } */
  };

  setWorkerProxy;

  // const [_, touchSupport, userAgent, _rootScope, _appStateManager, _I18n, __/* , ___ */] = await Promise.all([
  //   import('./lib/polyfill'),
  //   import('./environment/touchSupport'),
  //   import('./environment/userAgent'),
  //   import('./lib/rootScope'),
  //   import('./lib/appManagers/appStateManager'),
  //   import('./lib/langPack'),
  //   import('./helpers/peerIdPolyfill'),
  //   // import('./helpers/cacheFunctionPolyfill')
  // ]);

  /* const {IS_TOUCH_SUPPORTED} = touchSupport;
  const {IS_FIREFOX, IS_MOBILE, IS_APPLE, IS_SAFARI, IS_APPLE_MOBILE, IS_ANDROID} = userAgent;
  const rootScope = _rootScope.default;
  const appStateManager = _appStateManager.default;
  const I18n = _I18n.default; */

  window.addEventListener('resize', setVH);
  setVH();

  if(IS_STICKY_INPUT_BUGGED) {
    const toggleResizeMode = () => {
      setViewportVH = tabId === 1 && IS_STICKY_INPUT_BUGGED && !overlayCounter.isOverlayActive;
      setVH();

      if(w !== window) {
        if(setViewportVH) {
          window.removeEventListener('resize', setVH);
          w.addEventListener('resize', setVH);
        } else {
          w.removeEventListener('resize', setVH);
          window.addEventListener('resize', setVH);
        }
      }
    };

    let tabId: number;
    (window as any).onImTabChange = (id: number) => {
      const wasTabId = tabId !== undefined;
      tabId = id;

      if(wasTabId || tabId === 1) {
        toggleResizeMode();
      }
    };

    overlayCounter.addEventListener('change', () => {
      toggleResizeMode();
    });
  }

  if(IS_FIREFOX && !IS_EMOJI_SUPPORTED) {
    document.addEventListener('dragstart', (e) => {
      const target = e.target as HTMLElement;
      if(target.tagName === 'IMG' && target.classList.contains('emoji')) {
        cancelEvent(e);
        return false;
      }
    });
  }

  if(IS_EMOJI_SUPPORTED) {
    document.documentElement.classList.add('native-emoji');
  }

  // prevent firefox image dragging
  document.addEventListener('dragstart', (e) => {
    if((e.target as HTMLElement)?.tagName === 'IMG') {
      e.preventDefault();
      return false;
    }
  });

  // restrict contextmenu on images (e.g. webp stickers)
  document.addEventListener('contextmenu', (e) => {
    if((e.target as HTMLElement).tagName === 'IMG' && !(window as any).appMediaViewer) {
      cancelEvent(e);
    }
  });

  if(IS_FIREFOX) {
    document.documentElement.classList.add('is-firefox', 'no-backdrop');
  }

  if(IS_MOBILE) {
    document.documentElement.classList.add('is-mobile');
  }

  if(IS_APPLE) {
    if(IS_SAFARI) {
      document.documentElement.classList.add('is-safari');
    }

    // document.documentElement.classList.add('emoji-supported');

    if(IS_APPLE_MOBILE) {
      document.documentElement.classList.add('is-ios');
    } else {
      document.documentElement.classList.add('is-mac');
    }
  } else if(IS_ANDROID) {
    document.documentElement.classList.add('is-android');

    // force losing focus on input blur
    // focusin and focusout are not working on mobile

    const onInResize = () => {
      hasFocus = true;
      window.addEventListener('resize', onOutResize, {once: true});
    };

    const onOutResize = () => {
      hasFocus = false;
      blurActiveElement();
    };

    let hasFocus = false;
    document.addEventListener('touchend', (e) => {
      const input = (e.target as HTMLElement).closest('[contenteditable="true"], input');
      if(!input) {
        return;
      }

      if(document.activeElement !== input && !hasFocus) {
        console.log('input click', e, document.activeElement, input, input.matches(':focus'));
        window.addEventListener('resize', onInResize, {once: true});
      }
    });
  }

  if(!IS_TOUCH_SUPPORTED) {
    document.documentElement.classList.add('no-touch');
  } else {
    document.documentElement.classList.add('is-touch');
    /* document.addEventListener('touchmove', (event: any) => {
      event = event.originalEvent || event;
      if(event.scale && event.scale !== 1) {
        event.preventDefault();
      }
    }, {capture: true, passive: false}); */
  }

  if(IS_INSTALL_PROMPT_SUPPORTED) {
    cacheInstallPrompt();
  }

  const perf = performance.now();

  // await pause(1000000);

  const langPromise = I18n.getCacheLangPack();

  const [stateResult, langPack] = await Promise.all([
    // loadState(),
    apiManagerProxy.sendState().then(([stateResult]) => stateResult),
    langPromise
  ]);
  I18n.setTimeFormat(stateResult.state.settings.timeFormat);

  rootScope.managers.rootScope.getPremium().then((isPremium) => {
    rootScope.premium = isPremium;
  });

  themeController.setThemeListener();

  if(langPack.appVersion !== App.langPackVersion) {
    I18n.getLangPack(langPack.lang_code);
  } else {
    fillLocalizedDates();
  }

  rootScope.addEventListener('language_change', () => {
    fillLocalizedDates();
  });

  /**
   * won't fire if font is loaded too fast
   */
  function fadeInWhenFontsReady(elem: HTMLElement, promise: Promise<any>) {
    elem.style.opacity = '0';

    promise.then(() => {
      window.requestAnimationFrame(() => {
        elem.style.opacity = '';
      });
    });
  }

  console.log('got state, time:', performance.now() - perf);

  if(langPack.lang_code === 'ar' && IS_BETA && false) {
    document.body.classList.add('is-rtl');
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = langPack.lang_code;
    I18n.setRTL(true);
  } else {
    document.documentElement.dir = 'ltr';
  }

  let authState = stateResult.state.authState;

  const hash = location.hash;
  const splitted = hash.split('?');
  const params = parseUriParamsLine(splitted[1] ?? splitted[0].slice(1));
  if(params.tgWebAuthToken && authState._ !== 'authStateSignedIn') {
    const data: AuthState.signImport['data'] = {
      token: params.tgWebAuthToken,
      dcId: +params.tgWebAuthDcId,
      userId: params.tgWebAuthUserId.toUserId(),
      isTest: params.tgWebAuthTest !== undefined && !!+params.tgWebAuthTest,
      tgAddr: params.tgaddr
    };

    if(data.isTest !== Modes.test) {
      const urlSearchParams = new URLSearchParams(location.search);
      if(+params.tgWebAuthTest) {
        urlSearchParams.set('test', '1');
      } else {
        urlSearchParams.delete('test');
      }

      location.search = urlSearchParams.toString();
      return;
    }

    rootScope.managers.appStateManager.pushToState('authState', authState = {_: 'authStateSignImport', data});

    // appNavigationController.overrideHash('?tgaddr=' + encodeURIComponent(params.tgaddr));
  }

  if(authState._ !== 'authStateSignedIn'/*  || 1 === 1 */) {
    console.log('Will mount auth page:', authState._, Date.now() / 1000);

    const el = document.getElementById('auth-pages');
    let scrollable: HTMLElement;
    if(el) {
      scrollable = el.querySelector('.scrollable') as HTMLElement;
      if((!IS_TOUCH_SUPPORTED || IS_MOBILE_SAFARI)) {
        scrollable.classList.add('no-scrollbar');
      }

      // * don't remove this line
      scrollable.style.opacity = '0';

      const placeholder = document.createElement('div');
      placeholder.classList.add('auth-placeholder');

      scrollable.prepend(placeholder);
      scrollable.append(placeholder.cloneNode());
    }

    try {
      await Promise.all([
        import('./lib/mtproto/telegramMeWebManager'),
        import('./lib/mtproto/webPushApiManager')
      ]).then(([meModule, pushModule]) => {
        meModule.default.setAuthorized(false);
        pushModule.default.forceUnsubscribe();
      });
    } catch(err) {

    }

    let pagePromise: Promise<void>;
    // langPromise.then(async() => {
    switch(authState._) {
      case 'authStateSignIn':
        pagePromise = (await import('./pages/pageSignIn')).default.mount();
        break;
      case 'authStateSignQr':
        pagePromise = (await import('./pages/pageSignQR')).default.mount();
        break;
      case 'authStateAuthCode':
        pagePromise = (await import('./pages/pageAuthCode')).default.mount(authState.sentCode);
        break;
      case 'authStatePassword':
        pagePromise = (await import('./pages/pagePassword')).default.mount();
        break;
      case 'authStateSignUp':
        pagePromise = (await import('./pages/pageSignUp')).default.mount(authState.authCode);
        break;
      case 'authStateSignImport':
        pagePromise = (await import('./pages/pageSignImport')).default.mount(authState.data);
        break;
    }
    // });

    if(scrollable) {
      // wait for text appear
      if(pagePromise) {
        await pagePromise;
      }

      const promise = 'fonts' in document ?
        Promise.race([
          pause(1000),
          document.fonts.ready
        ]) :
        Promise.resolve();
      fadeInWhenFontsReady(scrollable, promise);
    }

    /* setTimeout(async() => {
      (await import('./pages/pageAuthCode')).default.mount({
        "_": "auth.sentCode",
        "pFlags": {},
        "flags": 6,
        "type": {
          "_": "auth.sentCodeTypeSms",
          "length": 5
        },
        "phone_code_hash": "",
        "next_type": {
          "_": "auth.codeTypeCall"
        },
        "timeout": 120,
        "phone_number": ""
      });

      (await import('./pages/pageSignQR')).default.mount();

      (await import('./pages/pagePassword')).default.mount();

      (await import('./pages/pageSignUp')).default.mount({
        "phone_code_hash": "",
        "phone_number": ""
      });
    }, 500); */
  } else {
    console.log('Will mount IM page:', Date.now() / 1000);
    fadeInWhenFontsReady(document.getElementById('main-columns'), loadFonts());
    (await import('./pages/pageIm')).default.mount();
  }
});
